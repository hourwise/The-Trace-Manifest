import { generateClaimProvenanceProposal } from "./claim-provenance-proposals";
import { generateClaimRelationshipProposals } from "./claim-relationship-proposals";
import { recalculateEvidenceScores } from "./evidence-recalculation";

export type ClaimMatchDecision = "merge_existing" | "create_new" | "reject";

export interface ClaimMatchReviewInput {
  candidateId: string;
  decision: ClaimMatchDecision;
  reviewerEmail: string;
  reviewerRole: "publisher";
  reviewNote?: string | null;
  requestId: string;
}

export interface ClaimMatchReviewResult {
  candidateId: string;
  previousState: string;
  decision: ClaimMatchDecision;
  resolvedCanonicalClaimId: string | null;
  supersededCandidateIds: string[];
  provenanceProposalId: string | null;
  relationshipProposalsCreated: number;
}

export class ClaimMatchReviewError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ClaimMatchReviewError";
  }
}

interface CandidateRow {
  id: string;
  source_extraction_id: string;
  candidate_canonical_claim_id: string;
  state: string;
  source_canonical_claim_id: string;
  assertion_state: string;
}

/** Applies one attributable publisher decision to a proposed claim match. */
export async function reviewClaimMatchCandidate(
  db: D1Database,
  input: ClaimMatchReviewInput,
): Promise<ClaimMatchReviewResult> {
  const candidate = await db.prepare(`
    SELECT candidate.id, candidate.source_extraction_id,
           candidate.candidate_canonical_claim_id, candidate.state,
           assertion.canonical_claim_id AS source_canonical_claim_id,
           assertion.reviewer_state AS assertion_state
    FROM knowledge_claim_match_candidates candidate
    JOIN claim_assertions assertion ON assertion.id = 'assertion-' || candidate.source_extraction_id
    WHERE candidate.id = ?
  `).bind(input.candidateId).first<CandidateRow>();
  if (!candidate) throw new ClaimMatchReviewError("candidate_not_found", "Claim-match candidate not found.", 404);
  if (candidate.state !== "proposed") {
    throw new ClaimMatchReviewError("candidate_already_reviewed", "This claim-match candidate has already been reviewed.", 409);
  }
  if (!input.reviewerEmail.trim()) throw new ClaimMatchReviewError("reviewer_required", "A publisher identity is required.");
  if (input.reviewNote && input.reviewNote.length > 2_000) {
    throw new ClaimMatchReviewError("review_note_too_long", "Review notes must be 2,000 characters or fewer.");
  }

  let resolvedCanonicalClaimId: string | null = null;
  if (input.decision === "merge_existing") {
    const target = await db.prepare(
      "SELECT id FROM canonical_claims WHERE id = ? AND current_state <> 'retired'",
    ).bind(candidate.candidate_canonical_claim_id).first<{ id: string }>();
    if (!target) throw new ClaimMatchReviewError("target_claim_not_found", "The target canonical claim is unavailable.", 409);
    resolvedCanonicalClaimId = target.id;
  } else if (input.decision === "create_new") {
    resolvedCanonicalClaimId = candidate.source_canonical_claim_id;
  }

  const reviewedAt = "datetime('now')";
  const statements: D1PreparedStatement[] = [];
  const nextState = input.decision === "reject" ? "rejected" : "accepted";
  statements.push(db.prepare(`
    UPDATE knowledge_claim_match_candidates
    SET state = ?, reviewed_by = ?, reviewed_at = ${reviewedAt}, updated_at = ${reviewedAt}
    WHERE id = ? AND state = 'proposed'
  `).bind(nextState, input.reviewerEmail, input.candidateId));

  if (resolvedCanonicalClaimId) {
    statements.push(db.prepare(`
      UPDATE claim_assertions
      SET canonical_claim_id = ?, reviewer_state = 'accepted', reviewed_by = ?, reviewed_at = ${reviewedAt}
      WHERE id = ? AND reviewer_state NOT IN ('rejected', 'unsupported')
    `).bind(resolvedCanonicalClaimId, input.reviewerEmail, `assertion-${candidate.source_extraction_id}`));
    if (input.decision === "merge_existing") {
      statements.push(db.prepare(`
        UPDATE canonical_claims
        SET current_state = 'superseded', updated_at = ${reviewedAt}
        WHERE id = ? AND id <> ?
          AND NOT EXISTS (SELECT 1 FROM claim_assertions WHERE canonical_claim_id = ?)
      `).bind(candidate.source_canonical_claim_id, resolvedCanonicalClaimId, candidate.source_canonical_claim_id));
    }
  }

  const otherCandidates = input.decision === "reject" ? [] : (await db.prepare(`
    SELECT id FROM knowledge_claim_match_candidates
    WHERE source_extraction_id = ? AND state = 'proposed' AND id <> ?
  `).bind(candidate.source_extraction_id, candidate.id).all<{ id: string }>()).results ?? [];
  for (const other of otherCandidates) {
    statements.push(db.prepare(`
      UPDATE knowledge_claim_match_candidates
      SET state = 'superseded', reviewed_by = ?, reviewed_at = ${reviewedAt}, updated_at = ${reviewedAt}
      WHERE id = ? AND state = 'proposed'
    `).bind(input.reviewerEmail, other.id));
    statements.push(db.prepare(`
      INSERT INTO knowledge_claim_match_reviews
        (id, candidate_id, source_extraction_id, previous_state, decision,
         resolved_canonical_claim_id, reviewer_email, reviewer_role, review_note, request_id)
      VALUES (?, ?, ?, 'proposed', 'supersede', NULL, ?, 'publisher', ?, ?)
    `).bind(
      crypto.randomUUID(), other.id, candidate.source_extraction_id, input.reviewerEmail,
      `Superseded by ${input.decision} decision.`, `${input.requestId}:supersede:${other.id}`,
    ));
  }

  statements.push(db.prepare(`
    INSERT INTO knowledge_claim_match_reviews
      (id, candidate_id, source_extraction_id, previous_state, decision,
       resolved_canonical_claim_id, reviewer_email, reviewer_role, review_note, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?)
  `).bind(
    crypto.randomUUID(), candidate.id, candidate.source_extraction_id, candidate.state,
    input.decision, resolvedCanonicalClaimId, input.reviewerEmail, input.reviewNote ?? null, input.requestId,
  ));
  statements.push(db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'review_knowledge_claim_match', 'knowledge_claim_match_candidate', ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(
    `${input.requestId}:succeeded`, input.reviewerEmail, candidate.id, input.requestId,
    `decision:${input.decision}`,
  ));

  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    throw new ClaimMatchReviewError("review_conflict", "The claim-match candidate changed before this review was saved.", 409);
  }
  const provenanceProposal = resolvedCanonicalClaimId
    ? await generateClaimProvenanceProposal(db, { claimAssertionId: `assertion-${candidate.source_extraction_id}` })
    : { proposalId: null };
  const relationshipProposals = resolvedCanonicalClaimId
    ? await generateClaimRelationshipProposals(db, { sourceAssertionId: `assertion-${candidate.source_extraction_id}` })
    : { proposalsCreated: 0 };
  if (resolvedCanonicalClaimId) {
    await recalculateEvidenceScores(db, {
      claimIds: [resolvedCanonicalClaimId, candidate.source_canonical_claim_id],
      triggeringEvent: "claim_match_accepted",
    });
  }
  return {
    candidateId: candidate.id,
    previousState: candidate.state,
    decision: input.decision,
    resolvedCanonicalClaimId,
    supersededCandidateIds: otherCandidates.map((item) => item.id),
    provenanceProposalId: provenanceProposal.proposalId,
    relationshipProposalsCreated: relationshipProposals.proposalsCreated,
  };
}
