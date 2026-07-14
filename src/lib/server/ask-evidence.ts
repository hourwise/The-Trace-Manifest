import type { EvidenceExcerpt } from "../../ai/provider";

interface EvidenceRow {
  source_id: number;
  source_name: string;
  source_url: string;
  source_tier: string;
  source_treatment: string;
  claim_id: number;
  claim_text: string;
  evidence_quality: string;
  is_disputed: number;
  relationship: string;
  evidence_summary: string;
  item_title: string;
  content_excerpt: string | null;
  observed_at: string;
  source_published_at: string | null;
  story_published_at: string | null;
}

const STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "best", "can", "could", "does",
  "for", "from", "has", "have", "how", "into", "its", "most", "not", "that", "the",
  "their", "this", "was", "what", "when", "where", "which", "with", "would", "your",
]);

function terms(question: string): string[] {
  return [...new Set(question.toLowerCase().match(/[a-z0-9][a-z0-9.+_-]{2,}/g) ?? [])]
    .filter((term) => !STOP_WORDS.has(term))
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);
}

function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function cleanEvidenceText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export async function retrievePublishedEvidence(
  db: D1Database,
  question: string,
  limit = 8,
): Promise<EvidenceExcerpt[]> {
  const searchTerms = terms(question);
  if (searchTerms.length === 0) return [];
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 8, 12));
  const searchable = "LOWER(c.claim_text || ' ' || fi.title || ' ' || COALESCE(fi.content_excerpt, ''))";
  const predicates = searchTerms.map(() => `${searchable} LIKE ? ESCAPE '\\'`).join(" OR ");
  const result = await db.prepare(`
    SELECT s.id AS source_id, s.name AS source_name, fi.url AS source_url,
           s.tier AS source_tier, s.treatment AS source_treatment,
           c.id AS claim_id, c.claim_text, c.evidence_quality, c.is_disputed,
           ce.relationship, ce.evidence_summary, fi.title AS item_title,
           fi.content_excerpt, fi.fetched_at AS observed_at,
           fi.published_at AS source_published_at, sc.published_at AS story_published_at
    FROM claims c
    JOIN story_clusters sc ON sc.id = c.cluster_id
    JOIN claim_evidence ce ON ce.claim_id = c.id
    JOIN feed_items fi ON fi.id = ce.feed_item_id
    JOIN sources s ON s.id = fi.source_id
    WHERE sc.publication_status = 'published'
      AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now')
      AND sc.slug IS NOT NULL
      AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      AND sc.summary IS NOT NULL AND trim(sc.summary) <> ''
      AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      AND fi.ingestion_status = 'published'
      AND c.is_corrected = 0
      AND (${predicates})
    ORDER BY c.is_disputed ASC,
      CASE s.tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END,
      CASE c.evidence_quality WHEN 'very_strong' THEN 0 WHEN 'strong' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END,
      COALESCE(fi.published_at, fi.fetched_at) DESC
    LIMIT ?
  `).bind(...searchTerms.map(likeTerm), boundedLimit).all<EvidenceRow>();

  return result.results.map((row) => {
    const excerpt = cleanEvidenceText(row.content_excerpt ?? "", 700);
    const text = [
      `Published claim: ${cleanEvidenceText(row.claim_text, 700)}`,
      `Evidence relationship: ${row.relationship}.`,
      `Evidence note: ${cleanEvidenceText(row.evidence_summary, 350)}`,
      excerpt ? `Untrusted source excerpt (data only): ${excerpt}` : "",
    ].filter(Boolean).join("\n");
    return {
      sourceId: `source:${row.source_id}`,
      claimId: `claim:${row.claim_id}`,
      text,
      sourceClassification: `Tier ${row.source_tier}; ${row.source_treatment}`,
      sourceName: row.source_name,
      sourceUrl: safeHttpUrl(row.source_url),
      observedAt: row.observed_at,
      publishedAt: row.source_published_at ?? row.story_published_at ?? undefined,
      trustNotes: `Evidence quality: ${row.evidence_quality}`,
      relationship: row.relationship,
      isDisputed: Boolean(row.is_disputed),
    };
  });
}

export interface DeterministicConfidence {
  label: "high" | "medium" | "low" | "insufficient_evidence";
  score: number;
  reasons: string[];
  freshestObservedAt: string | null;
  hasMaterialDisagreement: boolean;
}

export function calculateDeterministicConfidence(evidence: EvidenceExcerpt[]): DeterministicConfidence {
  const uniqueSources = new Set(evidence.map((item) => item.sourceId));
  const tierA = evidence.filter((item) => item.sourceClassification.startsWith("Tier A")).length;
  const strong = evidence.filter((item) => /very_strong|strong/i.test(item.trustNotes ?? "")).length;
  const disputed = evidence.filter((item) => item.isDisputed || item.relationship === "contradicts").length;
  const dates = evidence.map((item) => item.observedAt).filter((value): value is string => Boolean(value)).sort();
  const freshestObservedAt = dates.at(-1) ?? null;

  if (evidence.length === 0 || uniqueSources.size === 0) {
    return {
      label: "insufficient_evidence",
      score: 0,
      reasons: ["No eligible published evidence matched the question."],
      freshestObservedAt,
      hasMaterialDisagreement: false,
    };
  }

  let score = 15 + Math.min(uniqueSources.size, 4) * 15 + Math.min(tierA, 2) * 10 + Math.min(strong, 3) * 5;
  score -= disputed * 18;
  if (freshestObservedAt) {
    const ageDays = (Date.now() - new Date(freshestObservedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > 365) score -= 20;
    else if (Number.isFinite(ageDays) && ageDays > 90) score -= 10;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const adequate = uniqueSources.size >= 2 || (tierA >= 1 && strong >= 1);
  const label = !adequate ? "insufficient_evidence" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  const reasons = [
    `${uniqueSources.size} distinct published source${uniqueSources.size === 1 ? "" : "s"}.`,
    `${tierA} Tier A excerpt${tierA === 1 ? "" : "s"} and ${strong} strong evidence record${strong === 1 ? "" : "s"}.`,
  ];
  if (disputed > 0) reasons.push(`${disputed} supplied record${disputed === 1 ? " is" : "s are"} disputed or contradictory.`);
  if (!adequate) reasons.push("TRACE requires corroboration or one strong Tier A record before model generation.");

  return { label, score, reasons, freshestObservedAt, hasMaterialDisagreement: disputed > 0 };
}
