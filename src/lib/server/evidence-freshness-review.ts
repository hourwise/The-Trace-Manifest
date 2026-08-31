/**
 * Publisher-governed freshness transitions for claim assertions.
 *
 * This is intentionally a narrow review path, not an autonomous freshness
 * updater. Requesting a review records a pending proposal. Only an explicit
 * publisher approval can update claim_assertions.freshness_state, and the
 * source/evidence gates are rechecked immediately before that update.
 */

export type FreshnessState = "unknown" | "current" | "stale";
export type ProposedFreshnessState = "current" | "stale";

export class EvidenceFreshnessReviewError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "EvidenceFreshnessReviewError";
  }
}

interface FreshnessDbRow {
  id: string;
  canonical_claim_id: string;
  source_document_version_id: string | null;
  source_chunk_id: string | null;
  start_locator: string | null;
  end_locator: string | null;
  admission_state: string;
  freshness_state: FreshnessState;
  reviewer_state: string;
  source_role: string;
  evidence_treatment: string;
  relationship: string;
  provenance_group_id: string | null;
  legacy_claim_id: number | null;
  claim_state: string | null;
  source_document_id: string | null;
  source_admission_state: string | null;
  source_current_version_id: string | null;
  source_extraction_state: string | null;
  retrieved_url: string | null;
  source_canonical_url: string | null;
  chunk_start_locator: string | null;
  chunk_end_locator: string | null;
}

interface ReviewRow {
  id: string;
  claim_assertion_id: string;
  prior_state: FreshnessState;
  proposed_state: ProposedFreshnessState;
  source_document_version_id: string | null;
  reason: string;
  state: "pending" | "approved" | "rejected";
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  request_fingerprint: string;
}

export interface RequestFreshnessReviewInput {
  claimAssertionId: string;
  proposedState: ProposedFreshnessState;
  sourceDocumentVersionId?: string | null;
  reason: string;
  actor: string;
  idempotencyKey: string;
}

export interface FreshnessReviewResult {
  reviewId: string;
  state: ReviewRow["state"];
  claimAssertionId: string;
  priorState: FreshnessState;
  proposedState: ProposedFreshnessState;
  inserted: boolean;
  replay: boolean;
}

type FreshnessDb = Pick<D1Database, "prepare" | "batch">;

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function reviewResult(review: ReviewRow, inserted: boolean, replay: boolean): FreshnessReviewResult {
  return {
    reviewId: review.id,
    state: review.state,
    claimAssertionId: review.claim_assertion_id,
    priorState: review.prior_state,
    proposedState: review.proposed_state,
    inserted,
    replay,
  };
}

async function requestFingerprintFor(input: RequestFreshnessReviewInput): Promise<string> {
  const canonical = JSON.stringify({
    operation: "request",
    claimAssertionId: text(input.claimAssertionId),
    proposedState: input.proposedState,
    sourceDocumentVersionId: text(input.sourceDocumentVersionId) || null,
    reason: text(input.reason),
    actor: text(input.actor).toLowerCase(),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasLocator(row: FreshnessDbRow): boolean {
  return (text(row.start_locator) !== "" && text(row.end_locator) !== "")
    || (text(row.chunk_start_locator) !== "" && text(row.chunk_end_locator) !== "");
}

function validHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function loadAssertion(db: FreshnessDb, assertionId: string): Promise<FreshnessDbRow> {
  const row = await db.prepare(`
    SELECT assertion.id, assertion.canonical_claim_id,
           assertion.source_document_version_id, assertion.source_chunk_id,
           assertion.start_locator, assertion.end_locator,
           assertion.admission_state, assertion.freshness_state,
           assertion.reviewer_state, assertion.source_role,
           assertion.evidence_treatment, assertion.relationship,
           assertion.provenance_group_id, assertion.legacy_claim_id,
           claim.current_state AS claim_state,
           version.source_document_id, source.admission_state AS source_admission_state,
           source.current_version_id AS source_current_version_id,
           version.extraction_state AS source_extraction_state,
           version.retrieved_url, source.canonical_url AS source_canonical_url,
           chunk.start_locator AS chunk_start_locator,
           chunk.end_locator AS chunk_end_locator
    FROM claim_assertions assertion
    LEFT JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
    LEFT JOIN source_document_versions version ON version.id = assertion.source_document_version_id
    LEFT JOIN source_documents source ON source.id = version.source_document_id
    LEFT JOIN source_chunks chunk ON chunk.id = assertion.source_chunk_id
    WHERE assertion.id = ?
  `).bind(assertionId).first<FreshnessDbRow>();
  if (!row) throw new EvidenceFreshnessReviewError("Claim assertion was not found.", "assertion_not_found", 404);
  return row;
}

async function hasBlockingConflict(db: FreshnessDb, row: FreshnessDbRow): Promise<boolean> {
  const conflict = await db.prepare(`
    SELECT 1 AS present
    FROM knowledge_claim_conflict_cases
    WHERE (source_claim_id = ? OR target_claim_id = ?)
      AND status IN ('unresolved', 'acknowledged')
    LIMIT 1
  `).bind(row.canonical_claim_id, row.canonical_claim_id).first<{ present: number }>();
  if (conflict) return true;
  const legacyConflict = await db.prepare(`
    SELECT 1 AS present
    FROM claim_conflicts
    WHERE (claim_a_id = ? OR claim_b_id = ?)
      AND resolution IS NULL
    LIMIT 1
  `).bind(row.legacy_claim_id, row.legacy_claim_id).first<{ present: number }>();
  return Boolean(legacyConflict);
}

async function hasPublishedCorrection(db: FreshnessDb, row: FreshnessDbRow): Promise<boolean> {
  if (row.legacy_claim_id === null || row.legacy_claim_id === undefined) return false;
  const correction = await db.prepare(`
    SELECT 1 AS present
    FROM corrections
    WHERE claim_id = ? AND published = 1
    LIMIT 1
  `).bind(row.legacy_claim_id).first<{ present: number }>();
  return Boolean(correction);
}

async function assertTransitionAllowed(
  db: FreshnessDb,
  row: FreshnessDbRow,
  proposedState: ProposedFreshnessState,
  expectedPriorState?: FreshnessState,
  expectedVersionId?: string | null,
): Promise<void> {
  if (expectedPriorState && row.freshness_state !== expectedPriorState) {
    throw new EvidenceFreshnessReviewError("Assertion freshness state changed since the review was created.", "freshness_state_changed", 409);
  }
  if (proposedState === "stale") return;

  if (row.claim_state && ["corrected", "superseded", "retired", "disputed"].includes(row.claim_state)) {
    throw new EvidenceFreshnessReviewError("Corrected, superseded, retired, or disputed claims cannot be promoted to current.", "claim_state_blocks_current", 409);
  }
  if (await hasPublishedCorrection(db, row)) {
    throw new EvidenceFreshnessReviewError("A published correction takes precedence over freshness promotion.", "correction_blocks_current", 409);
  }
  if (await hasBlockingConflict(db, row)) {
    throw new EvidenceFreshnessReviewError("An unresolved evidence conflict takes precedence over freshness promotion.", "conflict_blocks_current", 409);
  }
  if (row.admission_state !== "admitted" || row.reviewer_state !== "accepted") {
    throw new EvidenceFreshnessReviewError("Only admitted, accepted assertions can be promoted to current.", "assertion_review_blocks_current", 409);
  }
  if (row.source_role !== "evidence" || row.evidence_treatment !== "factual_support") {
    throw new EvidenceFreshnessReviewError("Only external factual-support evidence can be promoted to current.", "evidence_treatment_blocks_current", 409);
  }
  if (!["supports", "partially_supports", "qualifies", "reproduces"].includes(row.relationship)) {
    throw new EvidenceFreshnessReviewError("The assertion relationship is not eligible for current evidence.", "relationship_blocks_current", 409);
  }
  if (!row.provenance_group_id) {
    throw new EvidenceFreshnessReviewError("A provenance group is required before freshness promotion.", "provenance_blocks_current", 409);
  }
  if (!row.source_document_id || row.source_admission_state !== "admitted") {
    throw new EvidenceFreshnessReviewError("An admitted source document is required before freshness promotion.", "source_blocks_current", 409);
  }
  if (!row.source_document_version_id || row.source_current_version_id !== row.source_document_version_id) {
    throw new EvidenceFreshnessReviewError("The assertion must reference the source document's current captured version.", "source_version_blocks_current", 409);
  }
  if (!["extracted", "captured"].includes(row.source_extraction_state ?? "")) {
    throw new EvidenceFreshnessReviewError("The source version must have usable extracted content before freshness promotion.", "source_extraction_blocks_current", 409);
  }
  if (expectedVersionId && row.source_document_version_id !== expectedVersionId) {
    throw new EvidenceFreshnessReviewError("The reviewed source version no longer matches the assertion.", "source_version_changed", 409);
  }
  if (!row.source_chunk_id || !hasLocator(row)) {
    throw new EvidenceFreshnessReviewError("A source chunk and start/end locator are required before freshness promotion.", "locator_blocks_current", 409);
  }
  const sourceUrl = text(row.retrieved_url) || text(row.source_canonical_url);
  if (!validHttpUrl(sourceUrl)) {
    throw new EvidenceFreshnessReviewError("A valid source URL is required before freshness promotion.", "source_url_blocks_current", 409);
  }
}

function validateInput(input: RequestFreshnessReviewInput): void {
  if (typeof input.claimAssertionId !== "string" || !text(input.claimAssertionId) || input.claimAssertionId.length > 200) throw new EvidenceFreshnessReviewError("A bounded claimAssertionId is required.", "invalid_assertion_id");
  if (typeof input.actor !== "string" || !text(input.actor) || input.actor.length > 320) throw new EvidenceFreshnessReviewError("A bounded actor is required.", "invalid_actor");
  if (typeof input.reason !== "string" || !text(input.reason) || input.reason.length > 2000) throw new EvidenceFreshnessReviewError("A bounded review reason is required.", "invalid_reason");
  if (typeof input.idempotencyKey !== "string" || !text(input.idempotencyKey) || input.idempotencyKey.length > 256) throw new EvidenceFreshnessReviewError("A bounded idempotency key is required.", "invalid_idempotency_key");
  if (input.sourceDocumentVersionId !== undefined && input.sourceDocumentVersionId !== null && (typeof input.sourceDocumentVersionId !== "string" || input.sourceDocumentVersionId.length > 200)) throw new EvidenceFreshnessReviewError("sourceDocumentVersionId must be bounded text or null.", "invalid_source_version_id");
  if (!(["current", "stale"] as string[]).includes(input.proposedState)) throw new EvidenceFreshnessReviewError("proposedState must be current or stale.", "invalid_proposed_state");
}

async function reviewIdFor(idempotencyKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(idempotencyKey));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `freshness-review-${hex.slice(0, 32)}`;
}

export async function requestFreshnessReview(
  db: FreshnessDb,
  input: RequestFreshnessReviewInput,
): Promise<FreshnessReviewResult> {
  validateInput(input);
  const requestFingerprint = await requestFingerprintFor(input);
  const existing = await db.prepare(`
    SELECT id, claim_assertion_id, prior_state, proposed_state,
           source_document_version_id, reason, state, requested_by,
           requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint
    FROM evidence_freshness_reviews WHERE idempotency_key = ?
  `).bind(input.idempotencyKey).first<ReviewRow>();
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) throw new EvidenceFreshnessReviewError("The idempotency key was already used for a different freshness proposal.", "idempotency_conflict", 409);
    return reviewResult(existing, false, true);
  }

  const row = await loadAssertion(db, input.claimAssertionId);
  if (row.freshness_state === input.proposedState) {
    throw new EvidenceFreshnessReviewError("The assertion already has the proposed freshness state.", "freshness_state_unchanged", 409);
  }
  await assertTransitionAllowed(db, row, input.proposedState, row.freshness_state, input.sourceDocumentVersionId ?? null);
  const reviewId = await reviewIdFor(input.idempotencyKey);
  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO evidence_freshness_reviews
      (id, claim_assertion_id, prior_state, proposed_state,
       source_document_version_id, reason, requested_by, idempotency_key, request_fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    reviewId, row.id, row.freshness_state, input.proposedState,
    input.sourceDocumentVersionId ?? row.source_document_version_id ?? null,
    input.reason.trim(), input.actor.trim(), input.idempotencyKey, requestFingerprint,
  ).run();
  if (Number(inserted.meta.changes ?? 0) === 1) {
    return { reviewId, state: "pending", claimAssertionId: row.id, priorState: row.freshness_state, proposedState: input.proposedState, inserted: true, replay: false };
  }
  const raced = await db.prepare(`
    SELECT id, claim_assertion_id, prior_state, proposed_state,
           source_document_version_id, reason, state, requested_by,
           requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint
    FROM evidence_freshness_reviews WHERE idempotency_key = ?
  `).bind(input.idempotencyKey).first<ReviewRow>();
  if (!raced) throw new EvidenceFreshnessReviewError("The idempotent freshness proposal could not be read after a concurrent insert.", "idempotency_insert_failed", 409);
  if (raced.request_fingerprint !== requestFingerprint) throw new EvidenceFreshnessReviewError("The idempotency key was already used for a different freshness proposal.", "idempotency_conflict", 409);
  return reviewResult(raced, false, true);
}

export async function approveFreshnessReview(
  db: FreshnessDb,
  reviewId: string,
  actor: string,
  reviewNote = "",
): Promise<FreshnessReviewResult> {
  if (typeof reviewId !== "string" || !text(reviewId) || reviewId.length > 200) throw new EvidenceFreshnessReviewError("A bounded reviewId is required.", "invalid_approval");
  if (typeof actor !== "string" || !text(actor) || actor.length > 320) throw new EvidenceFreshnessReviewError("A bounded actor is required.", "invalid_approval");
  if (typeof reviewNote !== "string" || reviewNote.length > 2000) throw new EvidenceFreshnessReviewError("The review note is too large.", "invalid_review_note");
  const review = await db.prepare(`
    SELECT id, claim_assertion_id, prior_state, proposed_state,
           source_document_version_id, reason, state, requested_by,
           requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint
    FROM evidence_freshness_reviews WHERE id = ?
  `).bind(reviewId).first<ReviewRow>();
  if (!review) throw new EvidenceFreshnessReviewError("Freshness review was not found.", "review_not_found", 404);
  if (review.state === "approved") {
    return { reviewId: review.id, state: review.state, claimAssertionId: review.claim_assertion_id, priorState: review.prior_state, proposedState: review.proposed_state, inserted: false, replay: true };
  }
  if (review.state === "rejected") throw new EvidenceFreshnessReviewError("A rejected freshness review cannot be approved.", "review_rejected", 409);

  const row = await loadAssertion(db, review.claim_assertion_id);
  try {
    await assertTransitionAllowed(db, row, review.proposed_state, review.prior_state, review.source_document_version_id);
  } catch (error) {
    const raced = await db.prepare("SELECT id, claim_assertion_id, prior_state, proposed_state, source_document_version_id, reason, state, requested_by, requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint FROM evidence_freshness_reviews WHERE id = ?").bind(review.id).first<ReviewRow>();
    if (raced?.state === "approved") return reviewResult(raced, false, true);
    throw error;
  }
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`
      UPDATE claim_assertions SET freshness_state = ?
      WHERE id = ? AND freshness_state = ?
    `).bind(review.proposed_state, review.claim_assertion_id, review.prior_state),
    db.prepare(`
      UPDATE evidence_freshness_reviews
      SET state = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?
      WHERE id = ? AND state = 'pending'
    `).bind(actor.trim(), now, reviewNote.trim() || null, review.id),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1 || Number(results[1]?.meta.changes ?? 0) !== 1) {
    const raced = await db.prepare(`
      SELECT id, claim_assertion_id, prior_state, proposed_state,
             source_document_version_id, reason, state, requested_by,
             requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint
      FROM evidence_freshness_reviews WHERE id = ?
    `).bind(review.id).first<ReviewRow>();
    if (raced?.state === "approved") return reviewResult(raced, false, true);
    throw new EvidenceFreshnessReviewError("Freshness approval was not applied because the review or assertion changed.", "approval_race", 409);
  }
  return { reviewId: review.id, state: "approved", claimAssertionId: review.claim_assertion_id, priorState: review.prior_state, proposedState: review.proposed_state, inserted: true, replay: false };
}

export async function rejectFreshnessReview(
  db: FreshnessDb,
  reviewId: string,
  actor: string,
  reviewNote = "",
): Promise<FreshnessReviewResult> {
  if (typeof reviewId !== "string" || !text(reviewId) || reviewId.length > 200 || typeof actor !== "string" || !text(actor) || actor.length > 320) {
    throw new EvidenceFreshnessReviewError("Bounded reviewId and actor are required.", "invalid_rejection");
  }
  if (typeof reviewNote !== "string" || reviewNote.length > 2000) throw new EvidenceFreshnessReviewError("The review note is too large.", "invalid_review_note");
  const review = await db.prepare(`
    SELECT id, claim_assertion_id, prior_state, proposed_state,
           source_document_version_id, reason, state, requested_by,
           requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint
    FROM evidence_freshness_reviews WHERE id = ?
  `).bind(reviewId).first<ReviewRow>();
  if (!review) throw new EvidenceFreshnessReviewError("Freshness review was not found.", "review_not_found", 404);
  if (review.state === "rejected") return reviewResult(review, false, true);
  if (review.state === "approved") throw new EvidenceFreshnessReviewError("An approved freshness review cannot be rejected.", "review_approved", 409);
  const now = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE evidence_freshness_reviews
    SET state = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?
    WHERE id = ? AND state = 'pending'
  `).bind(actor.trim(), now, reviewNote.trim() || null, review.id).run();
  if (Number(result.meta.changes ?? 0) === 1) {
    return reviewResult({ ...review, state: "rejected", reviewed_by: actor.trim(), reviewed_at: now, review_note: reviewNote.trim() || null }, true, false);
  }
  const raced = await db.prepare(`
    SELECT id, claim_assertion_id, prior_state, proposed_state,
           source_document_version_id, reason, state, requested_by,
           requested_at, reviewed_by, reviewed_at, review_note, request_fingerprint
    FROM evidence_freshness_reviews WHERE id = ?
  `).bind(review.id).first<ReviewRow>();
  if (raced?.state === "rejected") return reviewResult(raced, false, true);
  throw new EvidenceFreshnessReviewError("Freshness rejection lost a concurrent approval or state transition.", "rejection_race", 409);
}
