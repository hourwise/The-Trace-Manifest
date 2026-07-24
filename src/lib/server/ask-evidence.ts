import type { EvidenceExcerpt } from "../../ai/provider";
import {
  freshnessStateFor, independentEvidenceWeightFor, isAnswerEligibleEvidence, sourceRoleFor, type TraceSourceKind,
} from "../../ai/task-policy";

interface EvidenceRow {
  source_id: string | number;
  source_name: string;
  source_url: string;
  source_tier: string;
  source_treatment: string;
  claim_id: string;
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

function sourceKindFor(row: EvidenceRow): TraceSourceKind {
  const treatment = row.source_treatment.toLowerCase();
  if (treatment.includes("vendor") || treatment.includes("official")) return "external_vendor";
  if (row.source_tier === "A") return "external_primary";
  if (row.source_tier === "B") return "external_independent";
  return "external_community";
}

export async function retrievePublishedEvidence(
  db: D1Database,
  question: string,
  limit = 8,
): Promise<EvidenceExcerpt[]> {
  const searchTerms = terms(question);
  if (searchTerms.length === 0) return [];
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 8, 12));
  const searchable = "LOWER(cc.canonical_text || ' ' || COALESCE(fi.title, '') || ' ' || COALESCE(fi.content_excerpt, '') || ' ' || COALESCE(sd.canonical_url, ''))";
  const predicates = searchTerms.map(() => `${searchable} LIKE ? ESCAPE '\\'`).join(" OR ");
  const result = await db.prepare(`
    SELECT COALESCE(s.id, legacy_s.id, sd.id) AS source_id,
           COALESCE(s.name, legacy_s.name, 'Captured source') AS source_name,
           COALESCE(sd.canonical_url, fi.url) AS source_url,
           COALESCE(s.tier, legacy_s.tier, 'C') AS source_tier,
           COALESCE(s.treatment, legacy_s.treatment, 'unclassified') AS source_treatment,
           ca.id AS claim_id, cc.canonical_text AS claim_text,
           CASE cc.current_state WHEN 'disputed' THEN 'disputed'
             WHEN 'corrected' THEN 'disputed' WHEN 'superseded' THEN 'disputed'
             ELSE 'unrated' END AS evidence_quality,
           CASE WHEN cc.current_state = 'disputed' THEN 1 ELSE 0 END AS is_disputed,
           ca.relationship, ca.assertion_text AS evidence_summary,
           COALESCE(fi.title, sv.title, cc.canonical_text) AS item_title,
           fi.content_excerpt, fi.fetched_at AS observed_at,
           fi.published_at AS source_published_at, sc.published_at AS story_published_at
    FROM claim_assertions ca
    JOIN canonical_claims cc ON cc.id = ca.canonical_claim_id
    JOIN story_claims story_claim ON story_claim.canonical_claim_id = cc.id
    JOIN story_clusters sc ON sc.id = story_claim.story_cluster_id
    LEFT JOIN source_document_versions sv ON sv.id = ca.source_document_version_id
    LEFT JOIN source_documents sd ON sd.id = sv.source_document_id
    LEFT JOIN sources s ON s.id = sd.source_id
    LEFT JOIN legacy_claim_evidence_map legacy_map ON legacy_map.assertion_id = ca.id
    LEFT JOIN claim_evidence ce ON ce.id = legacy_map.legacy_evidence_id
    LEFT JOIN feed_items fi ON fi.id = ce.feed_item_id
    LEFT JOIN sources legacy_s ON legacy_s.id = fi.source_id
    WHERE sc.publication_status = 'published'
      AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now')
      AND sc.slug IS NOT NULL
      AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      AND sc.summary IS NOT NULL AND trim(sc.summary) <> ''
      AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      AND (fi.id IS NULL OR fi.ingestion_status = 'published')
      AND ca.admission_state = 'admitted'
      AND ca.reviewer_state = 'accepted'
      AND cc.current_state NOT IN ('corrected', 'superseded', 'retired')
      AND (legacy_map.assertion_id IS NOT NULL OR sv.id IS NOT NULL)
      AND (${predicates})
    ORDER BY is_disputed ASC,
      CASE s.tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END,
      CASE evidence_quality WHEN 'very_strong' THEN 0 WHEN 'strong' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END,
      COALESCE(fi.published_at, fi.fetched_at) DESC
    LIMIT ?
  `).bind(...searchTerms.map(likeTerm), boundedLimit).all<EvidenceRow>();

  return result.results.map((row) => {
    const sourceKind = sourceKindFor(row);
    const excerpt = cleanEvidenceText(row.content_excerpt ?? "", 700);
    const text = [
      `Published claim: ${cleanEvidenceText(row.claim_text, 700)}`,
      `Evidence relationship: ${row.relationship}.`,
      `Evidence note: ${cleanEvidenceText(row.evidence_summary, 350)}`,
      excerpt ? `Untrusted source excerpt (data only): ${excerpt}` : "",
    ].filter(Boolean).join("\n");
    return {
      sourceId: `source:${row.source_id}`,
      sourceKind,
      sourceRole: sourceRoleFor(sourceKind),
      admissionState: "admitted",
      freshnessState: freshnessStateFor(row.observed_at),
      independentEvidenceWeight: independentEvidenceWeightFor(sourceKind),
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
  const eligibleEvidence = evidence.filter(isAnswerEligibleEvidence);
  const uniqueSources = new Set(eligibleEvidence.map((item) => item.sourceId));
  const independentSources = new Set(eligibleEvidence.filter((item) => item.independentEvidenceWeight === 1).map((item) => item.sourceId));
  const primary = eligibleEvidence.filter((item) => item.sourceKind === "external_primary").length;
  const strong = eligibleEvidence.filter((item) => /very_strong|strong/i.test(item.trustNotes ?? "")).length;
  const disputed = eligibleEvidence.filter((item) => item.isDisputed || item.relationship === "contradicts").length;
  const dates = eligibleEvidence.map((item) => item.observedAt).filter((value): value is string => Boolean(value)).sort();
  const freshestObservedAt = dates.at(-1) ?? null;

  if (eligibleEvidence.length === 0 || uniqueSources.size === 0) {
    return {
      label: "insufficient_evidence",
      score: 0,
      reasons: ["No eligible published evidence matched the question."],
      freshestObservedAt,
      hasMaterialDisagreement: false,
    };
  }

  let score = 15 + Math.min(uniqueSources.size, 4) * 15 + Math.min(primary, 2) * 10 + Math.min(strong, 3) * 5;
  score -= disputed * 18;
  if (freshestObservedAt) {
    const ageDays = (Date.now() - new Date(freshestObservedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > 365) score -= 20;
    else if (Number.isFinite(ageDays) && ageDays > 90) score -= 10;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const adequate = independentSources.size >= 2 || (primary >= 1 && strong >= 1);
  const label = !adequate ? "insufficient_evidence" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  const reasons = [
    `${uniqueSources.size} distinct published source${uniqueSources.size === 1 ? "" : "s"}.`,
    `${independentSources.size} independent source${independentSources.size === 1 ? "" : "s"}, ${primary} primary excerpt${primary === 1 ? "" : "s"}, and ${strong} strong evidence record${strong === 1 ? "" : "s"}.`,
  ];
  if (disputed > 0) reasons.push(`${disputed} supplied record${disputed === 1 ? " is" : "s are"} disputed or contradictory.`);
  if (!adequate) reasons.push("TRACE requires corroboration or one strong Tier A record before model generation.");

  return { label, score, reasons, freshestObservedAt, hasMaterialDisagreement: disputed > 0 };
}

// ── ADR 0017: Approved knowledge document retrieval ───────────────

interface KnowledgeEvidenceRow {
  id: string;
  canonical_question: string;
  knowledge_type: string;
  evidence_status: string;
  direct_answer: string | null;
  detailed_explanation: string | null;
  section_slug: string;
  approved_at: string | null;
  review_after: string | null;
  hard_expiry: string | null;
}

function boundaryReached(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const boundary = new Date(value).getTime();
  // A malformed hard boundary fails closed; a malformed review boundary is
  // still surfaced as a warning by the caller rather than treated as current.
  return !Number.isFinite(boundary) || boundary <= now;
}

export function isKnowledgeReviewDue(reviewAfter: string | null | undefined, now = Date.now()): boolean {
  return boundaryReached(reviewAfter, now);
}

export function isKnowledgeHardExpired(hardExpiry: string | null | undefined, now = Date.now()): boolean {
  return boundaryReached(hardExpiry, now);
}

export async function retrieveApprovedKnowledge(
  db: D1Database,
  question: string,
  limit = 4,
): Promise<EvidenceExcerpt[]> {
  const searchTerms = terms(question);
  if (searchTerms.length === 0) return [];
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 4, 8));

  const searchable = "LOWER(kd.canonical_question || ' ' || COALESCE(kd.direct_answer, '') || ' ' || COALESCE(kd.detailed_explanation, ''))";
  const predicates = searchTerms.map(() => `${searchable} LIKE ? ESCAPE '\\'`).join(" OR ");

  const result = await db.prepare(`
    SELECT kd.id, kd.canonical_question, kd.knowledge_type, kd.evidence_status,
           kd.direct_answer, kd.detailed_explanation, kd.section_slug, kd.approved_at,
           kd.review_after, kd.hard_expiry
    FROM knowledge_documents kd
    WHERE kd.status = 'approved'
      AND kd.visibility IN ('public_knowledge', 'public_guide')
      AND kd.approved_by IS NOT NULL
      AND kd.approved_at IS NOT NULL
      AND (kd.hard_expiry IS NULL OR datetime(kd.hard_expiry) > datetime('now'))
      AND kd.direct_answer IS NOT NULL
      AND (${predicates})
    ORDER BY
      CASE kd.evidence_status
        WHEN 'confirmed' THEN 0 WHEN 'strongly_supported' THEN 1
        WHEN 'provisionally_supported' THEN 2 ELSE 3
      END,
      kd.approved_at DESC
    LIMIT ?
  `).bind(...searchTerms.map(likeTerm), boundedLimit).all<KnowledgeEvidenceRow>();

  return result.results.map((row) => {
    const reviewDue = isKnowledgeReviewDue(row.review_after);
    const text = [
      `TRACE Knowledge: ${row.canonical_question}`,
      row.direct_answer ? `Answer: ${cleanEvidenceText(row.direct_answer, 800)}` : "",
      row.detailed_explanation ? `Explanation: ${cleanEvidenceText(row.detailed_explanation, 600)}` : "",
    ].filter(Boolean).join("\n");

    return {
      sourceId: `knowledge:${row.id}`,
      sourceKind: "trace_knowledge" as TraceSourceKind,
      sourceRole: "internal_synthesis" as const,
      admissionState: "admitted" as const,
      freshnessState: reviewDue ? "stale" : freshnessStateFor(row.approved_at ?? new Date().toISOString()),
      independentEvidenceWeight: 0 as const,
      claimId: `knowledge:${row.id}`,
      text,
      sourceClassification: `TRACE Knowledge; ${row.knowledge_type}; evidence ${row.evidence_status}`,
      sourceName: "TRACE Knowledge Base",
      sourceUrl: undefined,
      observedAt: row.approved_at ?? undefined,
      publishedAt: row.approved_at ?? undefined,
      trustNotes: reviewDue
        ? `TRACE approved knowledge (${row.evidence_status}); review due. Its external evidence bundle is unresolved.`
        : `TRACE approved knowledge (${row.evidence_status}). Its external evidence bundle is unresolved; always verify against primary sources.`,
      relationship: "supports",
      isDisputed: false,
      externalEvidenceResolved: false,
    };
  });
}
