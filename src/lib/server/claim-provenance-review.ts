export type ClaimProvenanceReviewDecision = "accept" | "reject";

export interface ClaimProvenanceReviewInput {
  proposalId: string;
  decision: ClaimProvenanceReviewDecision;
  reviewerEmail: string;
  reviewerRole: "publisher";
  reviewNote?: string | null;
  requestId: string;
}

export interface ClaimProvenanceReviewResult {
  proposalId: string;
  previousState: string;
  decision: ClaimProvenanceReviewDecision;
  assertionId: string;
}

export class ClaimProvenanceReviewError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ClaimProvenanceReviewError";
  }
}

interface ProposalRow {
  id: string;
  claim_assertion_id: string;
  state: string;
  proposed_directness: string;
  proposed_source_role: string;
  proposed_evidence_treatment: string;
}

/** Reviews a provenance proposal without creating a provenance group or membership. */
export async function reviewClaimProvenanceProposal(
  db: D1Database,
  input: ClaimProvenanceReviewInput,
): Promise<ClaimProvenanceReviewResult> {
  const proposal = await db.prepare(`
    SELECT id, claim_assertion_id, state, proposed_directness,
           proposed_source_role, proposed_evidence_treatment
    FROM knowledge_claim_provenance_proposals WHERE id = ?
  `).bind(input.proposalId).first<ProposalRow>();
  if (!proposal) throw new ClaimProvenanceReviewError("proposal_not_found", "Provenance proposal not found.", 404);
  if (proposal.state !== "proposed") throw new ClaimProvenanceReviewError("proposal_already_reviewed", "This provenance proposal has already been reviewed.", 409);
  if (input.reviewNote && input.reviewNote.length > 2_000) {
    throw new ClaimProvenanceReviewError("review_note_too_long", "Review notes must be 2,000 characters or fewer.");
  }

  const statements: D1PreparedStatement[] = [db.prepare(`
    UPDATE knowledge_claim_provenance_proposals
    SET state = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND state = 'proposed'
  `).bind(input.decision === "accept" ? "accepted" : "rejected", input.reviewerEmail, input.proposalId)];
  if (input.decision === "accept") {
    statements.push(db.prepare(`
      UPDATE claim_assertions
      SET directness = ?, source_role = ?, evidence_treatment = ?
      WHERE id = ?
    `).bind(
      proposal.proposed_directness, proposal.proposed_source_role,
      proposal.proposed_evidence_treatment, proposal.claim_assertion_id,
    ));
  }
  statements.push(db.prepare(`
    INSERT INTO knowledge_claim_provenance_reviews
      (id, proposal_id, claim_assertion_id, previous_state, decision,
       reviewer_email, reviewer_role, review_note, request_id)
    VALUES (?, ?, ?, ?, ?, ?, 'publisher', ?, ?)
  `).bind(
    crypto.randomUUID(), proposal.id, proposal.claim_assertion_id, proposal.state,
    input.decision, input.reviewerEmail, input.reviewNote ?? null, input.requestId,
  ));
  statements.push(db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'review_knowledge_claim_provenance', 'knowledge_claim_provenance_proposal', ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(
    `${input.requestId}:succeeded`, input.reviewerEmail, proposal.id, input.requestId,
    `decision:${input.decision}`,
  ));
  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    throw new ClaimProvenanceReviewError("review_conflict", "The provenance proposal changed before this review was saved.", 409);
  }
  return { proposalId: proposal.id, previousState: proposal.state, decision: input.decision, assertionId: proposal.claim_assertion_id };
}
