// The Trace Manifest — Semantic Deduplication
// Phase 3: Detects same-story-across-sources beyond exact URL matching
// Uses title similarity (Jaccard) + content excerpt overlap

import type { FeedItem } from "./types";

// ============================================================
// Text normalization
// ============================================================
function tokenize(text: string): Set<string> {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")       // strip punctuation
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim();

  // Filter out stop words and very short tokens
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been",
    "has", "have", "had", "do", "does", "did", "will", "would",
    "can", "could", "may", "might", "shall", "should", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into",
    "through", "during", "before", "after", "above", "below",
    "between", "and", "but", "or", "nor", "not", "so", "yet",
    "its", "it", "this", "that", "these", "those", "they", "we",
    "you", "he", "she", "his", "her", "their", "our", "my",
    "about", "just", "also", "very", "only", "now", "new", "how",
    "what", "when", "where", "which", "who", "whom", "why",
    "more", "most", "some", "any", "all", "both", "each", "few",
    "no", "up", "out", "then", "than", "too", "over", "under",
  ]);

  return new Set(
    cleaned.split(" ").filter((w) => w.length > 1 && !stopWords.has(w))
  );
}

// ============================================================
// Jaccard similarity: |A ∩ B| / |A ∪ B|
// ============================================================
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

// ============================================================
// Content excerpt overlap
// ============================================================
function contentOverlapScore(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const tokensA = tokenize(textA.substring(0, 500));
  const tokensB = tokenize(textB.substring(0, 500));
  return jaccardSimilarity(tokensA, tokensB);
}

// ============================================================
// Normalize titles for comparison (handle common variants)
// ============================================================
const TITLE_NORMALIZATIONS: [RegExp, string][] = [
  [/\b(announcing|introducing|launching|unveiling|releasing)\b/gi, ""],
  [/\b(new|updated|latest)\b/gi, ""],
  [/\b(now available|has arrived|is here)\b/gi, ""],
  [/\s{2,}/g, " "],
];

function normalizeTitleForComparison(title: string): string {
  let normalized = title;
  for (const [pattern, replacement] of TITLE_NORMALIZATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.trim();
}

// ============================================================
// Main semantic dedup check
// ============================================================
export interface SemanticDupResult {
  isDuplicate: boolean;
  duplicateOfId: number | null;
  similarityScore: number;
  matchReason: string;
}

export async function checkSemanticDuplicate(
  db: D1Database,
  item: FeedItem,
  windowDays: number = 7
): Promise<SemanticDupResult> {
  const normalizedTitle = normalizeTitleForComparison(item.title);
  const itemTokens = tokenize(normalizedTitle);

  // Window: check items from last N days, excluding same source and same URL
  const { results } = await db.prepare(
    `SELECT id, title, summary, content_excerpt, source_id
     FROM feed_items
     WHERE ingestion_status IN ('classified', 'raw')
     AND source_id != ?
     AND fetched_at >= datetime('now', ?)
     ORDER BY fetched_at DESC
     LIMIT 200`
  ).bind(item.source_id, `-${windowDays} days`).all<FeedItem & { source_id: number }>();

  if (!results || results.length === 0) {
    return { isDuplicate: false, duplicateOfId: null, similarityScore: 0, matchReason: "no candidates" };
  }

  let bestScore = 0;
  let bestMatch: (FeedItem & { source_id: number }) | null = null;

  for (const candidate of results) {
    const candNormalized = normalizeTitleForComparison(candidate.title);
    const candTokens = tokenize(candNormalized);

    // Title similarity
    const titleScore = jaccardSimilarity(itemTokens, candTokens);

    if (titleScore < 0.55) continue; // below threshold, skip content check

    // Content overlap bonus
    const contentScore = contentOverlapScore(
      [item.summary ?? "", item.content_excerpt ?? ""].join(" "),
      [candidate.summary ?? "", candidate.content_excerpt ?? ""].join(" ")
    );

    // Combined score: title weighted 70%, content 30%
    const combinedScore = titleScore * 0.7 + contentScore * 0.3;

    if (combinedScore > bestScore && combinedScore >= 0.45) {
      bestScore = combinedScore;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= 0.45) {
    const reason = `title Jaccard ${(bestScore * 100).toFixed(0)}% match with item #${bestMatch.id} (source ${bestMatch.source_id})`;
    return {
      isDuplicate: true,
      duplicateOfId: bestMatch.id,
      similarityScore: Math.round(bestScore * 100),
      matchReason: reason,
    };
  }

  return { isDuplicate: false, duplicateOfId: null, similarityScore: Math.round(bestScore * 100), matchReason: "below threshold" };
}

// ============================================================
// Pipeline runner — deduplicate all classified items
// ============================================================
export async function runSemanticDedup(
  db: D1Database
): Promise<{ processed: number; duplicates: number }> {
  // Get classified items from last 24h that haven't been checked for semantic dupes
  const { results } = await db.prepare(
    `SELECT * FROM feed_items
     WHERE ingestion_status = 'classified'
     AND fetched_at >= datetime('now', '-1 day')
     ORDER BY fetched_at ASC`
  ).all<FeedItem>();

  if (!results || results.length === 0) {
    return { processed: 0, duplicates: 0 };
  }

  let duplicates = 0;

  for (const item of results) {
    const check = await checkSemanticDuplicate(db, item);

    if (check.isDuplicate && check.duplicateOfId) {
      await db.prepare(
        `UPDATE feed_items
         SET ingestion_status = 'duplicate',
             duplicate_of = ?,
             raw_metadata = json_patch(
               COALESCE(raw_metadata, '{}'),
               json_object(
                 'dedup', json_object(
                   'method', 'semantic_jaccard',
                   'matchId', ?,
                   'score', ?,
                   'reason', ?
                 )
               )
             )
         WHERE id = ?`
      ).bind(
        check.duplicateOfId,
        check.duplicateOfId,
        check.similarityScore,
        check.matchReason,
        item.id
      ).run();
      duplicates++;
    }
  }

  return { processed: results.length, duplicates };
}

// ============================================================
// Inline dedup during ingestion — check a single new item
// against existing items before inserting
// ============================================================
export async function isSemanticDuplicate(
  db: D1Database,
  title: string,
  sourceId: number,
  summary?: string | null,
  contentExcerpt?: string | null
): Promise<{ isDuplicate: boolean; duplicateOfId: number | null }> {
  const item: FeedItem = {
    id: 0,
    source_id: sourceId,
    external_id: null,
    url: "",
    url_hash: "",
    title,
    summary: summary ?? null,
    content_excerpt: contentExcerpt ?? null,
    author: null,
    published_at: null,
    fetched_at: new Date().toISOString(),
    raw_metadata: null,
    ingestion_status: "raw",
    duplicate_of: null,
    created_at: new Date().toISOString(),
  };

  const result = await checkSemanticDuplicate(db, item);
  return {
    isDuplicate: result.isDuplicate,
    duplicateOfId: result.duplicateOfId,
  };
}
