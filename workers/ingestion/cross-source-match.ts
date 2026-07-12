// The Trace Manifest — Cross-Source Lexical Candidate Matching
// Phase 3: Detects similar stories across sources using title/content similarity.
// Creates candidate-match records for clustering — does NOT discard items as "duplicates".
// Evidence-preserving: two reports about the same event retain independent evidentiary value.

import type { FeedItem } from "./types";

// ============================================================
// Algorithm identity
// ============================================================
const ALGORITHM_VERSION = "lexical-jaccard-v2";

// ============================================================
// Text normalization
// ============================================================
function tokenize(text: string): Set<string> {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
// Jaccard similarity
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
// Title normalization for comparison
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
// Match result — component scores exposed for explainability
// ============================================================
export interface CrossSourceMatch {
  isMatch: boolean;
  matchItemId: number | null;
  titleSimilarity: number;
  excerptSimilarity: number;
  combinedSimilarity: number;
  algorithm: string;
  reason: string;
}

// ============================================================
// Find cross-source matches for a single item
// ============================================================
export async function findCrossSourceMatches(
  db: D1Database,
  item: FeedItem,
  windowDays: number = 7
): Promise<CrossSourceMatch> {
  const normalizedTitle = normalizeTitleForComparison(item.title);
  const itemTokens = tokenize(normalizedTitle);

  // Candidate search: all states except 'archived'/'rejected', any source
  // Exclude the current item ID, not the entire source
  const { results } = await db.prepare(
    `SELECT id, title, summary, content_excerpt, source_id
     FROM feed_items
     WHERE id != ?
     AND ingestion_status NOT IN ('archived', 'rejected')
     AND fetched_at >= datetime('now', ?)
     ORDER BY fetched_at DESC
     LIMIT 300`
  ).bind(item.id, `-${windowDays} days`).all<FeedItem & { source_id: number }>();

  if (!results || results.length === 0) {
    return {
      isMatch: false, matchItemId: null,
      titleSimilarity: 0, excerptSimilarity: 0, combinedSimilarity: 0,
      algorithm: ALGORITHM_VERSION, reason: "no candidates",
    };
  }

  let bestTitle = 0;
  let bestExcerpt = 0;
  let bestCombined = 0;
  let bestMatch: (FeedItem & { source_id: number }) | null = null;

  for (const candidate of results) {
    const candNormalized = normalizeTitleForComparison(candidate.title);
    const candTokens = tokenize(candNormalized);

    const titleScore = jaccardSimilarity(itemTokens, candTokens);
    if (titleScore < 0.4) continue;

    const excerptScore = contentOverlapScore(
      [item.summary ?? "", item.content_excerpt ?? ""].join(" "),
      [candidate.summary ?? "", candidate.content_excerpt ?? ""].join(" ")
    );

    const combinedScore = titleScore * 0.7 + excerptScore * 0.3;

    if (combinedScore > bestCombined) {
      bestTitle = titleScore;
      bestExcerpt = excerptScore;
      bestCombined = combinedScore;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestCombined >= 0.38) {
    const reason =
      `title Jaccard ${(bestTitle * 100).toFixed(0)}%, ` +
      `excerpt ${(bestExcerpt * 100).toFixed(0)}%, ` +
      `combined ${(bestCombined * 100).toFixed(0)}% ` +
      `with item #${bestMatch.id} (source ${bestMatch.source_id})`;

    return {
      isMatch: true,
      matchItemId: bestMatch.id,
      titleSimilarity: Math.round(bestTitle * 100),
      excerptSimilarity: Math.round(bestExcerpt * 100),
      combinedSimilarity: Math.round(bestCombined * 100),
      algorithm: ALGORITHM_VERSION,
      reason,
    };
  }

  return {
    isMatch: false, matchItemId: null,
    titleSimilarity: Math.round(bestTitle * 100),
    excerptSimilarity: Math.round(bestExcerpt * 100),
    combinedSimilarity: Math.round(bestCombined * 100),
    algorithm: ALGORITHM_VERSION,
    reason: `best combined ${(bestCombined * 100).toFixed(0)}% below threshold 38%`,
  };
}

// ============================================================
// Pipeline runner — record candidate matches for all classified items
// Does NOT change ingestion_status — only records match data.
// Marks items as match-checked so they aren't re-processed.
// ============================================================
export async function runCrossSourceMatching(
  db: D1Database
): Promise<{ processed: number; matched: number }> {
  // Get classified items that haven't been match-checked yet
  const { results } = await db.prepare(
    `SELECT * FROM feed_items
     WHERE ingestion_status = 'classified'
     AND (raw_metadata IS NULL
          OR json_extract(raw_metadata, '$.crossSourceMatch.checkedAt') IS NULL)
     AND fetched_at >= datetime('now', '-2 days')
     ORDER BY fetched_at ASC`
  ).all<FeedItem>();

  if (!results || results.length === 0) {
    return { processed: 0, matched: 0 };
  }

  let matched = 0;

  for (const item of results) {
    const match = await findCrossSourceMatches(db, item);

    // Record match result in metadata via json_patch — preserves existing data
    await db.prepare(
      `UPDATE feed_items
       SET raw_metadata = json_patch(
         COALESCE(raw_metadata, '{}'),
         json_object('crossSourceMatch', json(?))
       )
       WHERE id = ?`
    ).bind(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        algorithm: ALGORITHM_VERSION,
        isMatch: match.isMatch,
        matchItemId: match.matchItemId,
        titleSimilarity: match.titleSimilarity,
        excerptSimilarity: match.excerptSimilarity,
        combinedSimilarity: match.combinedSimilarity,
      }),
      item.id
    ).run();

    if (match.isMatch) matched++;
  }

  return { processed: results.length, matched };
}
