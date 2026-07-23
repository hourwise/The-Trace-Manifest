export type ClaimConflictReviewDecision = "acknowledge" | "resolve" | "dismiss" | "reopen";

export interface ClaimConflictReviewInput {
  conflictCaseId: string;
  decision: ClaimConflictReviewDecision;
  reviewerEmail: string;
  reviewerRole: "publisher";
  reviewNote?: string | null;
  requestId: string;
}

export interface ClaimConflictReviewResult {
  conflictCaseId: string;
  previousStatus: string;
  status: string;
  decision: ClaimConflictReviewDecision;
}

export class ClaimConflictReviewError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ClaimConflictReviewError";
  }
}

interface ConflictRow { id: string; status: string; }
const transitions: Record<string, ReadonlySet<ClaimConflictReviewDecision>> = {
  unresolved: new Set(["acknowledge", "resolve", "dismiss"]),
  acknowledged: new Set(["resolve", "dismiss", "reopen"]),
  resolved: new Set(["reopen"]),
  dismissed: new Set(["reopen"]),
};

/** Reviews a conflict without selecting a winning claim or changing evidence. */
export async function reviewClaimConflictCase(
  db: D1Database,
  input: ClaimConflictReviewInput,
): Promise<ClaimConflictReviewResult> {
  const conflict = await db.prepare("SELECT id, status FROM knowledge_claim_conflict_cases WHERE id = ?")
    .bind(input.conflictCaseId).first<ConflictRow>();
  if (!conflict) throw new ClaimConflictReviewError("conflict_not_found", "Claim conflict case not found.", 404);
  if (!transitions[conflict.status]?.has(input.decision)) throw new ClaimConflictReviewError("invalid_transition", `Cannot ${input.decision} a ${conflict.status} conflict.`, 409);
  if (input.reviewNote && input.reviewNote.length > 2_000) throw new ClaimConflictReviewError("review_note_too_long", "Review notes must be 2,000 characters or fewer.");
  if ((input.decision === "resolve" || input.decision === "dismiss") && !input.reviewNote?.trim()) throw new ClaimConflictReviewError("resolution_note_required", "Resolve and dismiss decisions require a review note.");
  const status = input.decision === "acknowledge" ? "acknowledged" : input.decision === "resolve" ? "resolved" : input.decision === "dismiss" ? "dismissed" : "unresolved";
  const resolutionNote = input.decision === "reopen" ? null : input.reviewNote ?? null;
  const statements: D1PreparedStatement[] = [db.prepare(`
    UPDATE knowledge_claim_conflict_cases
    SET status = ?, resolution_note = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND status = ?
  `).bind(status, resolutionNote, input.reviewerEmail, conflict.id, conflict.status)];
  statements.push(db.prepare(`
    INSERT INTO knowledge_claim_conflict_reviews
      (id, conflict_case_id, previous_status, decision, reviewer_email, reviewer_role, review_note, request_id)
    VALUES (?, ?, ?, ?, ?, 'publisher', ?, ?)
  `).bind(crypto.randomUUID(), conflict.id, conflict.status, input.decision, input.reviewerEmail, input.reviewNote ?? null, input.requestId));
  statements.push(db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'review_knowledge_claim_conflict', 'knowledge_claim_conflict_case', ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(`${input.requestId}:succeeded`, input.reviewerEmail, conflict.id, input.requestId, `decision:${input.decision}`));
  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) throw new ClaimConflictReviewError("review_conflict", "The conflict changed before this review was saved.", 409);
  return { conflictCaseId: conflict.id, previousStatus: conflict.status, status, decision: input.decision };
}
