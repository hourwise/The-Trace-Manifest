import { generateClaimConflictCase } from "./claim-conflict-cases";
import { recalculateEvidenceScores } from "./evidence-recalculation";

export type ClaimRelationshipReviewDecision = "accept" | "reject";

export interface ClaimRelationshipReviewInput {
  proposalId: string;
  decision: ClaimRelationshipReviewDecision;
  reviewerEmail: string;
  reviewerRole: "publisher";
  reviewNote?: string | null;
  requestId: string;
}

export interface ClaimRelationshipReviewResult {
  proposalId: string;
  previousState: string;
  decision: ClaimRelationshipReviewDecision;
  createdAssertionId: string | null;
  conflictCaseId: string | null;
}

export class ClaimRelationshipReviewError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ClaimRelationshipReviewError";
  }
}

interface ProposalRow {
  id: string;
  source_assertion_id: string;
  target_canonical_claim_id: string;
  relationship: string;
  confidence: number;
  state: string;
}

interface AssertionRow {
  source_document_version_id: string;
  source_chunk_id: string | null;
  start_locator: string | null;
  end_locator: string | null;
  assertion_text: string;
  source_role: string;
  directness: string;
}

/** Reviews a claim relationship and, on acceptance, records a new reviewed assertion. */
export async function reviewClaimRelationshipProposal(
  db: D1Database,
  input: ClaimRelationshipReviewInput,
): Promise<ClaimRelationshipReviewResult> {
  const proposal = await db.prepare(`
    SELECT id, source_assertion_id, target_canonical_claim_id, relationship, confidence, state
    FROM knowledge_claim_relationship_proposals WHERE id = ?
  `).bind(input.proposalId).first<ProposalRow>();
  if (!proposal) throw new ClaimRelationshipReviewError("proposal_not_found", "Claim relationship proposal not found.", 404);
  if (proposal.state !== "proposed") throw new ClaimRelationshipReviewError("proposal_already_reviewed", "This claim relationship proposal has already been reviewed.", 409);
  if (input.reviewNote && input.reviewNote.length > 2_000) throw new ClaimRelationshipReviewError("review_note_too_long", "Review notes must be 2,000 characters or fewer.");

  let createdAssertionId: string | null = null;
  const statements: D1PreparedStatement[] = [db.prepare(`
    UPDATE knowledge_claim_relationship_proposals
    SET state = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND state = 'proposed'
  `).bind(input.decision === "accept" ? "accepted" : "rejected", input.reviewerEmail, proposal.id)];
  if (input.decision === "accept") {
    const source = await db.prepare(`
      SELECT source_document_version_id, source_chunk_id, start_locator, end_locator,
             assertion_text, source_role, directness
      FROM claim_assertions WHERE id = ?
    `).bind(proposal.source_assertion_id).first<AssertionRow>();
    if (!source) throw new ClaimRelationshipReviewError("source_assertion_not_found", "The source assertion for this proposal is unavailable.", 409);
    createdAssertionId = `relationship-assertion-${proposal.id}`;
    const persistedRelationship = proposal.relationship === "temporal_change" ? "qualifies" : proposal.relationship;
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id,
         start_locator, end_locator, assertion_text, relationship, source_role,
         directness, evidence_treatment, admission_state, freshness_state,
         extraction_method, extraction_version, confidence, reviewer_state,
         reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'context_only', 'pending', 'unknown',
              'relationship_proposal', ?, ?, 'accepted', ?, datetime('now'))
    `).bind(
      createdAssertionId, proposal.target_canonical_claim_id, source.source_document_version_id,
      source.source_chunk_id, source.start_locator, source.end_locator, source.assertion_text,
      persistedRelationship, source.source_role, source.directness, "kc-05e-v1", proposal.confidence,
      input.reviewerEmail,
    ));
  }
  statements.push(db.prepare(`
    INSERT INTO knowledge_claim_relationship_reviews
      (id, proposal_id, source_assertion_id, previous_state, decision,
       created_assertion_id, reviewer_email, reviewer_role, review_note, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?)
  `).bind(
    crypto.randomUUID(), proposal.id, proposal.source_assertion_id, proposal.state,
    input.decision, createdAssertionId, input.reviewerEmail, input.reviewNote ?? null, input.requestId,
  ));
  statements.push(db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'review_knowledge_claim_relationship', 'knowledge_claim_relationship_proposal', ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(`${input.requestId}:succeeded`, input.reviewerEmail, proposal.id, input.requestId, `decision:${input.decision}`));
  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new ClaimRelationshipReviewError("review_conflict", "The relationship proposal changed before this review was saved.", 409);
  const conflictCase = input.decision === "accept"
    ? await generateClaimConflictCase(db, { relationshipProposalId: proposal.id })
    : { conflictCaseId: null };
  if (input.decision === "accept") {
    await recalculateEvidenceScores(db, {
      claimIds: [proposal.target_canonical_claim_id],
      triggeringEvent: conflictCase.conflictCaseId ? "conflict_created" : "accepted_evidence",
    });
  }
  return { proposalId: proposal.id, previousState: proposal.state, decision: input.decision, createdAssertionId, conflictCaseId: conflictCase.conflictCaseId };
}
