/**
 * KNOWLEDGE-10 / SEED-01: a bounded, read-only work queue for the publisher
 * freshness review path in evidence-freshness-review.ts.
 *
 * The queue never changes state. Its gate flags mirror assertTransitionAllowed
 * so a publisher can see why a "current" proposal would be refused, but the
 * request and approval paths still re-check every gate (including conflicts
 * and published corrections, which the queue does not evaluate).
 */

export const FRESHNESS_QUEUE_LIMIT = 50;

export type FreshnessBlocker =
  | "claim_state_blocks_current"
  | "evidence_treatment_blocks_current"
  | "relationship_blocks_current"
  | "provenance_blocks_current"
  | "source_blocks_current"
  | "source_version_blocks_current"
  | "source_extraction_blocks_current"
  | "locator_blocks_current"
  | "source_url_blocks_current";

export interface FreshnessCandidate {
  assertionId: string;
  canonicalClaimId: string;
  canonicalText: string;
  assertionText: string;
  freshnessState: "unknown" | "stale" | "current";
  reason: "never_reviewed" | "stale" | "source_version_changed";
  sourceUrl: string | null;
  sourceDocumentVersionId: string | null;
  retrievedAt: string | null;
  blockers: FreshnessBlocker[];
}

export interface PendingFreshnessReview {
  reviewId: string;
  assertionId: string;
  canonicalText: string;
  priorState: string;
  proposedState: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  sourceDocumentVersionId: string | null;
}

export interface FreshnessQueue {
  pendingReviews: PendingFreshnessReview[];
  candidates: FreshnessCandidate[];
  totals: { pendingReviews: number; candidates: number };
  limit: number;
}

interface CandidateRow {
  assertion_id: string;
  canonical_claim_id: string;
  canonical_text: string;
  assertion_text: string;
  freshness_state: FreshnessCandidate["freshnessState"];
  version_changed: number;
  source_url: string | null;
  source_document_version_id: string | null;
  retrieved_at: string | null;
  claim_ok: number;
  evidence_ok: number;
  relationship_ok: number;
  provenance_ok: number;
  source_ok: number;
  version_ok: number;
  extraction_ok: number;
  locator_ok: number;
  url_ok: number;
}

// Admitted, accepted assertions that are not current, or are current against a
// source version that is no longer the document's current version, and that
// have no pending freshness review already.
const CANDIDATE_FROM = `
  FROM claim_assertions assertion
  JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
  LEFT JOIN source_document_versions version ON version.id = assertion.source_document_version_id
  LEFT JOIN source_documents source ON source.id = version.source_document_id
  LEFT JOIN source_chunks chunk ON chunk.id = assertion.source_chunk_id
  WHERE assertion.admission_state = 'admitted'
    AND assertion.reviewer_state = 'accepted'
    AND (assertion.freshness_state <> 'current'
      OR (version.id IS NOT NULL AND source.current_version_id IS NOT NULL AND source.current_version_id <> version.id))
    AND NOT EXISTS (
      SELECT 1 FROM evidence_freshness_reviews review
      WHERE review.claim_assertion_id = assertion.id AND review.state = 'pending'
    )`;

type GateFlag = "claim_ok" | "evidence_ok" | "relationship_ok" | "provenance_ok" | "source_ok"
  | "version_ok" | "extraction_ok" | "locator_ok" | "url_ok";

const BLOCKER_FLAGS: Array<[GateFlag, FreshnessBlocker]> = [
  ["claim_ok", "claim_state_blocks_current"],
  ["evidence_ok", "evidence_treatment_blocks_current"],
  ["relationship_ok", "relationship_blocks_current"],
  ["provenance_ok", "provenance_blocks_current"],
  ["source_ok", "source_blocks_current"],
  ["version_ok", "source_version_blocks_current"],
  ["extraction_ok", "source_extraction_blocks_current"],
  ["locator_ok", "locator_blocks_current"],
  ["url_ok", "source_url_blocks_current"],
];

/** Gate flags are SQL 0/1 projections that mirror assertTransitionAllowed. */
export function freshnessBlockers(row: Record<GateFlag, number>): FreshnessBlocker[] {
  return BLOCKER_FLAGS.filter(([flag]) => Number(row[flag]) !== 1).map(([, blocker]) => blocker);
}

export const FRESHNESS_BLOCKER_LABELS: Record<FreshnessBlocker, string> = {
  claim_state_blocks_current: "the canonical claim is corrected, superseded, retired or disputed",
  evidence_treatment_blocks_current: "only external factual-support evidence can be current",
  relationship_blocks_current: "the relationship is not supports, partially supports, qualifies or reproduces",
  provenance_blocks_current: "no reviewed provenance group",
  source_blocks_current: "no admitted source document",
  source_version_blocks_current: "not linked to the source's current captured version",
  source_extraction_blocks_current: "the source version has no usable extracted content",
  locator_blocks_current: "no source chunk with start and end locators",
  source_url_blocks_current: "no valid http(s) source URL",
};

export async function listFreshnessQueue(db: Pick<D1Database, "prepare">, limit = FRESHNESS_QUEUE_LIMIT): Promise<FreshnessQueue> {
  const bounded = Math.max(1, Math.min(Number.isInteger(limit) ? limit : FRESHNESS_QUEUE_LIMIT, FRESHNESS_QUEUE_LIMIT));
  const [pending, pendingTotal, candidates, candidateTotal] = await Promise.all([
    db.prepare(`
      SELECT review.id AS review_id, review.claim_assertion_id AS assertion_id, claim.canonical_text,
             review.prior_state, review.proposed_state, review.reason, review.requested_by,
             review.requested_at, review.source_document_version_id
      FROM evidence_freshness_reviews review
      JOIN claim_assertions assertion ON assertion.id = review.claim_assertion_id
      JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
      WHERE review.state = 'pending'
      ORDER BY review.requested_at, review.id
      LIMIT ?
    `).bind(bounded).all<Record<string, string | null>>(),
    db.prepare("SELECT COUNT(*) AS count FROM evidence_freshness_reviews WHERE state = 'pending'").first<{ count: number }>(),
    db.prepare(`
      SELECT assertion.id AS assertion_id, assertion.canonical_claim_id, claim.canonical_text,
             assertion.assertion_text, assertion.freshness_state,
             CASE WHEN version.id IS NOT NULL AND source.current_version_id IS NOT NULL
                   AND source.current_version_id <> version.id THEN 1 ELSE 0 END AS version_changed,
             COALESCE(NULLIF(trim(version.retrieved_url), ''), source.canonical_url) AS source_url,
             assertion.source_document_version_id, version.retrieved_at,
             CASE WHEN claim.current_state IN ('corrected','superseded','retired','disputed') THEN 0 ELSE 1 END AS claim_ok,
             CASE WHEN assertion.source_role = 'evidence' AND assertion.evidence_treatment = 'factual_support' THEN 1 ELSE 0 END AS evidence_ok,
             CASE WHEN assertion.relationship IN ('supports','partially_supports','qualifies','reproduces') THEN 1 ELSE 0 END AS relationship_ok,
             CASE WHEN assertion.provenance_group_id IS NOT NULL THEN 1 ELSE 0 END AS provenance_ok,
             CASE WHEN source.id IS NOT NULL AND source.admission_state = 'admitted' THEN 1 ELSE 0 END AS source_ok,
             CASE WHEN version.id IS NOT NULL AND source.current_version_id = version.id THEN 1 ELSE 0 END AS version_ok,
             CASE WHEN version.extraction_state IN ('extracted','captured') THEN 1 ELSE 0 END AS extraction_ok,
             CASE WHEN assertion.source_chunk_id IS NOT NULL AND (
                    (trim(COALESCE(assertion.start_locator, '')) <> '' AND trim(COALESCE(assertion.end_locator, '')) <> '')
                    OR (trim(COALESCE(chunk.start_locator, '')) <> '' AND trim(COALESCE(chunk.end_locator, '')) <> '')
                  ) THEN 1 ELSE 0 END AS locator_ok,
             CASE WHEN lower(COALESCE(NULLIF(trim(version.retrieved_url), ''), source.canonical_url, '')) LIKE 'http://%'
                    OR lower(COALESCE(NULLIF(trim(version.retrieved_url), ''), source.canonical_url, '')) LIKE 'https://%' THEN 1 ELSE 0 END AS url_ok
      ${CANDIDATE_FROM}
      ORDER BY version_changed DESC,
               CASE assertion.freshness_state WHEN 'stale' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END,
               assertion.id
      LIMIT ?
    `).bind(bounded).all<CandidateRow>(),
    db.prepare(`SELECT COUNT(*) AS count ${CANDIDATE_FROM}`).first<{ count: number }>(),
  ]);

  return {
    pendingReviews: (pending.results ?? []).map((row) => ({
      reviewId: String(row.review_id),
      assertionId: String(row.assertion_id),
      canonicalText: String(row.canonical_text ?? ""),
      priorState: String(row.prior_state),
      proposedState: String(row.proposed_state),
      reason: String(row.reason ?? ""),
      requestedBy: String(row.requested_by ?? ""),
      requestedAt: String(row.requested_at ?? ""),
      sourceDocumentVersionId: row.source_document_version_id ?? null,
    })),
    candidates: (candidates.results ?? []).map((row) => ({
      assertionId: row.assertion_id,
      canonicalClaimId: row.canonical_claim_id,
      canonicalText: row.canonical_text,
      assertionText: row.assertion_text,
      freshnessState: row.freshness_state,
      reason: Number(row.version_changed) === 1 ? "source_version_changed" : row.freshness_state === "stale" ? "stale" : "never_reviewed",
      sourceUrl: row.source_url,
      sourceDocumentVersionId: row.source_document_version_id,
      retrievedAt: row.retrieved_at,
      blockers: freshnessBlockers(row),
    })),
    totals: { pendingReviews: Number(pendingTotal?.count ?? 0), candidates: Number(candidateTotal?.count ?? 0) },
    limit: bounded,
  };
}
