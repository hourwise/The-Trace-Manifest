export type ExtractionReviewTarget = "source_extraction" | "source_summary";
export type ExtractionReviewState =
  | "proposed"
  | "accepted"
  | "amended"
  | "rejected"
  | "duplicate"
  | "unsupported"
  | "needs_research";

export interface ExtractionReviewInput {
  targetType: ExtractionReviewTarget;
  targetId: string;
  nextState: ExtractionReviewState;
  reviewerEmail: string;
  reviewerRole: "publisher";
  reviewNote?: string | null;
  amendedValueJson?: string | null;
  requestId: string;
}

export interface ExtractionReviewResult {
  targetType: ExtractionReviewTarget;
  targetId: string;
  previousState: string;
  nextState: ExtractionReviewState;
  extractionRunId: string | null;
}

export class ExtractionReviewError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "ExtractionReviewError";
  }
}

const transitions: Record<string, ReadonlySet<ExtractionReviewState>> = {
  proposed: new Set(["accepted", "amended", "rejected", "duplicate", "unsupported", "needs_research"]),
  accepted: new Set(["amended", "rejected", "needs_research"]),
  amended: new Set(["accepted", "amended", "rejected", "needs_research"]),
  rejected: new Set(["proposed", "amended"]),
  duplicate: new Set(["proposed"]),
  unsupported: new Set(["proposed"]),
  needs_research: new Set(["proposed", "accepted", "amended", "rejected", "duplicate", "unsupported"]),
};

const summaryStates = new Set<ExtractionReviewState>([
  "proposed", "accepted", "amended", "rejected", "needs_research",
]);

/** Applies one attributable publisher transition and preserves its history atomically. */
export async function reviewKnowledgeExtraction(
  db: D1Database,
  input: ExtractionReviewInput,
): Promise<ExtractionReviewResult> {
  const target = await loadTarget(db, input.targetType, input.targetId);
  if (!target) throw new ExtractionReviewError("target_not_found", "Extraction review target not found.", 404);
  if (input.targetType === "source_summary" && !summaryStates.has(input.nextState)) {
    throw new ExtractionReviewError("state_not_supported", "This source summary does not support that review state.");
  }
  if (!transitions[target.state]?.has(input.nextState)) {
    throw new ExtractionReviewError("invalid_transition", `Cannot move ${target.state} to ${input.nextState}.`, 409);
  }
  if (input.reviewNote && input.reviewNote.length > 2_000) {
    throw new ExtractionReviewError("review_note_too_long", "Review notes must be 2,000 characters or fewer.");
  }
  if (input.amendedValueJson && input.nextState !== "amended") {
    throw new ExtractionReviewError("amendment_state_required", "Amended content requires the amended review state.");
  }

  const reviewId = crypto.randomUUID();
  const changed = input.targetType === "source_extraction"
    ? db.prepare(`
        UPDATE source_extractions
        SET reviewer_state = ?, reviewed_by = ?, reviewed_at = datetime('now'),
            payload_json = CASE WHEN ? IS NULL THEN payload_json ELSE ? END,
            updated_at = datetime('now')
        WHERE id = ? AND reviewer_state = ?
      `).bind(input.nextState, input.reviewerEmail, input.amendedValueJson ?? null, input.amendedValueJson ?? null, input.targetId, target.state)
    : db.prepare(`
        UPDATE source_summaries
        SET summary_state = ?, reviewed_by = ?, reviewed_at = datetime('now'),
            summary_text = CASE WHEN ? IS NULL THEN summary_text ELSE json_extract(?, '$.summaryText') END,
            updated_at = datetime('now')
        WHERE id = ? AND summary_state = ?
      `).bind(input.nextState, input.reviewerEmail, input.amendedValueJson ?? null, input.amendedValueJson ?? null, input.targetId, target.state);

  const history = db.prepare(`
    INSERT INTO knowledge_extraction_reviews
      (id, target_type, target_id, extraction_run_id, previous_state, next_state,
       reviewer_email, reviewer_role, review_note, amended_value_json, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?, ?)
  `).bind(
    reviewId, input.targetType, input.targetId, target.extractionRunId, target.state,
    input.nextState, input.reviewerEmail, input.reviewNote ?? null, input.amendedValueJson ?? null, input.requestId,
  );
  const audit = db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'review_knowledge_extraction', ?, ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(
    `${input.requestId}:succeeded`, input.reviewerEmail, input.targetType, input.targetId,
    input.requestId, `state:${target.state}->${input.nextState}`,
  );
  const results = await db.batch([changed, history, audit]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    throw new ExtractionReviewError("review_conflict", "The extraction changed before this review was saved.", 409);
  }
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    previousState: target.state,
    nextState: input.nextState,
    extractionRunId: target.extractionRunId,
  };
}

interface ReviewTarget {
  state: string;
  extractionRunId: string | null;
}

async function loadTarget(db: D1Database, targetType: ExtractionReviewTarget, targetId: string): Promise<ReviewTarget | null> {
  if (targetType === "source_extraction") {
    return db.prepare(`
      SELECT extraction.reviewer_state AS state, output.extraction_run_id AS extractionRunId
      FROM source_extractions extraction
      LEFT JOIN knowledge_extraction_run_outputs output
        ON output.output_type = 'source_extraction' AND output.output_id = extraction.id
      WHERE extraction.id = ?
      LIMIT 1
    `).bind(targetId).first<ReviewTarget>();
  }
  return db.prepare(`
    SELECT summary.summary_state AS state, output.extraction_run_id AS extractionRunId
    FROM source_summaries summary
    LEFT JOIN knowledge_extraction_run_outputs output
      ON output.output_type = 'source_summary' AND output.output_id = summary.id
    WHERE summary.id = ?
    LIMIT 1
  `).bind(targetId).first<ReviewTarget>();
}
