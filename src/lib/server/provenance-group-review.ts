export type ProvenanceGroupReviewDecision = "accept" | "reject";
import { recalculateEvidenceScores } from "./evidence-recalculation";

export interface ProvenanceGroupReviewInput {
  proposalId: string;
  decision: ProvenanceGroupReviewDecision;
  reviewerEmail: string;
  reviewerRole: "publisher";
  reviewNote?: string | null;
  requestId: string;
}

export interface ProvenanceGroupReviewResult {
  proposalId: string;
  previousState: string;
  decision: ProvenanceGroupReviewDecision;
  provenanceGroupId: string | null;
  membershipCreated: boolean;
}

export class ProvenanceGroupReviewError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ProvenanceGroupReviewError";
  }
}

interface ProposalRow {
  id: string;
  source_document_id: string;
  root_source_document_id: string;
  origin_key: string;
  proposed_relationship: string;
  confidence: number;
  state: string;
  explanation: string;
}

/** Reviews a shared-origin proposal and, only on acceptance, creates its group/membership. */
export async function reviewProvenanceGroupProposal(
  db: D1Database,
  input: ProvenanceGroupReviewInput,
): Promise<ProvenanceGroupReviewResult> {
  const proposal = await db.prepare(`
    SELECT id, source_document_id, root_source_document_id, origin_key,
           proposed_relationship, confidence, state, explanation
    FROM knowledge_provenance_group_proposals WHERE id = ?
  `).bind(input.proposalId).first<ProposalRow>();
  if (!proposal) throw new ProvenanceGroupReviewError("proposal_not_found", "Provenance group proposal not found.", 404);
  if (proposal.state !== "proposed") throw new ProvenanceGroupReviewError("proposal_already_reviewed", "This provenance group proposal has already been reviewed.", 409);
  if (input.reviewNote && input.reviewNote.length > 2_000) throw new ProvenanceGroupReviewError("review_note_too_long", "Review notes must be 2,000 characters or fewer.");

  const statements: D1PreparedStatement[] = [db.prepare(`
    UPDATE knowledge_provenance_group_proposals
    SET state = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND state = 'proposed'
  `).bind(input.decision === "accept" ? "accepted" : "rejected", input.reviewerEmail, proposal.id)];
  const provenanceGroupId = input.decision === "accept" ? `provenance-${proposal.origin_key}` : null;
  if (provenanceGroupId) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO provenance_groups
        (id, root_source_document_id, origin_type, explanation, determined_by, determination_method, reviewed_at)
      VALUES (?, ?, 'unknown', ?, ?, 'editor_review', datetime('now'))
    `).bind(provenanceGroupId, proposal.root_source_document_id, proposal.explanation, input.reviewerEmail));
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO source_provenance_memberships
        (id, source_document_id, provenance_group_id, relationship, confidence)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      `${provenanceGroupId}:${proposal.source_document_id}`, proposal.source_document_id,
      provenanceGroupId, proposal.proposed_relationship, proposal.confidence,
    ));
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO source_provenance_memberships
        (id, source_document_id, provenance_group_id, relationship, confidence)
      VALUES (?, ?, ?, 'original', ?)
    `).bind(
      `${provenanceGroupId}:${proposal.root_source_document_id}`, proposal.root_source_document_id,
      provenanceGroupId, proposal.confidence,
    ));
    statements.push(db.prepare(`
      UPDATE claim_assertions
      SET provenance_group_id = ?
      WHERE source_document_version_id IN (
        SELECT id FROM source_document_versions WHERE source_document_id = ?
      )
    `).bind(provenanceGroupId, proposal.source_document_id));
  }
  statements.push(db.prepare(`
    INSERT INTO knowledge_provenance_group_reviews
      (id, proposal_id, source_document_id, previous_state, decision,
       provenance_group_id, reviewer_email, reviewer_role, review_note, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?)
  `).bind(
    crypto.randomUUID(), proposal.id, proposal.source_document_id, proposal.state,
    input.decision, provenanceGroupId, input.reviewerEmail, input.reviewNote ?? null, input.requestId,
  ));
  statements.push(db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'review_knowledge_provenance_group', 'knowledge_provenance_group_proposal', ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(
    `${input.requestId}:succeeded`, input.reviewerEmail, proposal.id, input.requestId,
    `decision:${input.decision}`,
  ));
  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new ProvenanceGroupReviewError("review_conflict", "The provenance group proposal changed before this review was saved.", 409);
  if (input.decision === "accept" && provenanceGroupId) {
    const affected = await db.prepare(`
      SELECT DISTINCT canonical_claim_id
      FROM claim_assertions
      WHERE provenance_group_id = ?
    `).bind(provenanceGroupId).all<{ canonical_claim_id: string }>();
    await recalculateEvidenceScores(db, {
      claimIds: (affected.results ?? []).map((row) => row.canonical_claim_id),
      triggeringEvent: "provenance_changed",
    });
  }
  return {
    proposalId: proposal.id,
    previousState: proposal.state,
    decision: input.decision,
    provenanceGroupId,
    membershipCreated: input.decision === "accept" && Number(results[2]?.meta.changes ?? 0) === 1,
  };
}
