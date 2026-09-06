import { recalculateEvidenceScores, type RecalculateEvidenceResult } from "./evidence-recalculation";

export const ASSERTION_GOVERNANCE_ACTIONS = ["admit", "reject"] as const;
export type AssertionGovernanceAction = typeof ASSERTION_GOVERNANCE_ACTIONS[number];

export const ASSERTION_ADMISSION_STATES = ["pending", "admitted", "quarantined", "rejected"] as const;
export type AssertionAdmissionState = typeof ASSERTION_ADMISSION_STATES[number];

export const ASSERTION_REVIEWER_STATES = ["proposed", "accepted", "amended", "rejected", "duplicate", "unsupported", "needs_research"] as const;
export type AssertionReviewerState = typeof ASSERTION_REVIEWER_STATES[number];

export const ASSERTION_FRESHNESS_STATES = ["current", "stale", "unknown"] as const;
export type AssertionFreshnessState = typeof ASSERTION_FRESHNESS_STATES[number];

export interface AssertionGovernanceExpectedState {
  admissionState: AssertionAdmissionState;
  reviewerState: AssertionReviewerState;
  freshnessState: AssertionFreshnessState;
}

export interface AssertionGovernanceInput {
  clusterId: number;
  assertionId: string;
  action: AssertionGovernanceAction;
  expected: AssertionGovernanceExpectedState;
  reason: string;
  idempotencyKey: string;
  actor: string;
  requestId: string;
}

export interface AssertionGovernanceState {
  admissionState: AssertionAdmissionState;
  reviewerState: AssertionReviewerState;
  freshnessState: AssertionFreshnessState;
}

export interface AssertionGovernanceRecalculation {
  status: "completed" | "queued" | "replayed";
  jobId: string;
  claimSnapshotCount: number;
  storySnapshotCount: number;
  statusChangeCount: number;
  approvalRequestCount: number;
  claimIds: string[];
  storyIds: number[];
}

export interface AssertionGovernanceResult {
  success: true;
  requestId: string;
  eventId: string;
  clusterId: number;
  assertionId: string;
  canonicalClaimId: string;
  action: AssertionGovernanceAction;
  previous: AssertionGovernanceState;
  current: AssertionGovernanceState;
  recalculation: AssertionGovernanceRecalculation;
  publicationImpact: "unchanged" | "may_change";
  replay: boolean;
}

export class AssertionGovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly eventId?: string,
  ) {
    super(message);
    this.name = "AssertionGovernanceError";
  }
}

interface AssertionRow extends AssertionGovernanceState {
  id: string;
  canonical_claim_id: string;
  assertion_governance_revision: number;
  source_role: string;
  evidence_treatment: string;
  relationship: string;
}

interface EventRow {
  id: string;
  assertion_id: string;
  canonical_claim_id: string;
  cluster_id: number;
  action: AssertionGovernanceAction;
  previous_admission_state: AssertionAdmissionState;
  new_admission_state: AssertionAdmissionState;
  previous_reviewer_state: AssertionReviewerState;
  new_reviewer_state: AssertionReviewerState;
  previous_freshness_state: AssertionFreshnessState;
  new_freshness_state: AssertionFreshnessState;
  actor_email: string;
  actor_role: "publisher";
  reason: string;
  request_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  recalculation_job_id: string;
  created_at: string;
}

interface RecalculationJobRow {
  id: string;
  event_id: string;
  assertion_id: string;
  canonical_claim_id: string;
  cluster_id: number;
  story_scope_json: string;
  state: "pending" | "running" | "completed" | "failed";
  attempt_count: number;
  claim_snapshot_count: number | null;
  story_snapshot_count: number | null;
  status_change_count: number | null;
  approval_request_count: number | null;
  result_json: string | null;
  last_error: string | null;
}

const MAX_ASSERTION_ID_LENGTH = 200;
const MAX_REASON_LENGTH = 2_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;
const MAX_REQUEST_ID_LENGTH = 200;
const MAX_ACTOR_LENGTH = 320;
const MAX_DIRECT_STORY_SCOPES = 25;

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function nonEmptyBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function validateExpectedState(value: unknown): AssertionGovernanceExpectedState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AssertionGovernanceError("invalid_expected_state", "expected must contain the current assertion state.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["admissionState", "reviewerState", "freshnessState"].includes(key))) {
    throw new AssertionGovernanceError("invalid_expected_state", "expected contains an unsupported state field.");
  }
  if (!isOneOf(ASSERTION_ADMISSION_STATES, record.admissionState)
    || !isOneOf(ASSERTION_REVIEWER_STATES, record.reviewerState)
    || !isOneOf(ASSERTION_FRESHNESS_STATES, record.freshnessState)) {
    throw new AssertionGovernanceError("invalid_expected_state", "expected contains an unsupported assertion state.");
  }
  return {
    admissionState: record.admissionState,
    reviewerState: record.reviewerState,
    freshnessState: record.freshnessState,
  };
}

function validateInput(input: AssertionGovernanceInput): AssertionGovernanceExpectedState {
  if (!Number.isInteger(input.clusterId) || input.clusterId < 1) {
    throw new AssertionGovernanceError("invalid_cluster_id", "A positive clusterId is required.");
  }
  if (!nonEmptyBoundedText(input.assertionId, MAX_ASSERTION_ID_LENGTH)) {
    throw new AssertionGovernanceError("invalid_assertion_id", "A bounded assertionId is required.");
  }
  if (!isOneOf(ASSERTION_GOVERNANCE_ACTIONS, input.action)) {
    throw new AssertionGovernanceError("invalid_action", "action must be admit or reject.");
  }
  if (!nonEmptyBoundedText(input.reason, MAX_REASON_LENGTH)) {
    throw new AssertionGovernanceError("invalid_reason", "A bounded human reason is required.");
  }
  if (!nonEmptyBoundedText(input.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH)) {
    throw new AssertionGovernanceError("invalid_idempotency_key", "A bounded idempotency key is required.");
  }
  if (!nonEmptyBoundedText(input.actor, MAX_ACTOR_LENGTH)) {
    throw new AssertionGovernanceError("invalid_actor", "A bounded publisher identity is required.");
  }
  if (!nonEmptyBoundedText(input.requestId, MAX_REQUEST_ID_LENGTH)) {
    throw new AssertionGovernanceError("invalid_request_id", "A bounded request ID is required.");
  }
  return validateExpectedState(input.expected);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestFingerprint(input: AssertionGovernanceInput, expected: AssertionGovernanceExpectedState): Promise<string> {
  const canonical = JSON.stringify({
    version: "assertion-governance-v1",
    assertionId: input.assertionId.trim(),
    clusterId: input.clusterId,
    action: input.action,
    expected,
    reason: input.reason.trim(),
    actor: input.actor.trim().toLowerCase(),
  });
  return sha256(canonical);
}

async function loadEventByKey(db: D1Database, idempotencyKey: string): Promise<EventRow | null> {
  return db.prepare(`
    SELECT id, assertion_id, canonical_claim_id, cluster_id, action,
           previous_admission_state, new_admission_state,
           previous_reviewer_state, new_reviewer_state,
           previous_freshness_state, new_freshness_state,
           actor_email, actor_role, reason, request_id, idempotency_key,
           request_fingerprint, recalculation_job_id, created_at
    FROM assertion_governance_events
    WHERE idempotency_key = ?
  `).bind(idempotencyKey).first<EventRow>();
}

async function loadJob(db: D1Database, eventId: string): Promise<RecalculationJobRow | null> {
  return db.prepare(`
    SELECT id, event_id, assertion_id, canonical_claim_id, cluster_id,
           story_scope_json, state, attempt_count, claim_snapshot_count,
           story_snapshot_count, status_change_count, approval_request_count,
           result_json, last_error
    FROM assertion_governance_recalculation_jobs
    WHERE event_id = ?
  `).bind(eventId).first<RecalculationJobRow>();
}

async function loadAssertion(db: D1Database, assertionId: string): Promise<AssertionRow | null> {
  return db.prepare(`
    SELECT id, canonical_claim_id, admission_state AS admissionState,
           reviewer_state AS reviewerState, freshness_state AS freshnessState,
           assertion_governance_revision, source_role, evidence_treatment,
           relationship
    FROM claim_assertions
    WHERE id = ?
  `).bind(assertionId).first<AssertionRow>();
}

async function loadDirectStoryScope(db: D1Database, canonicalClaimId: string): Promise<number[]> {
  const rows = await db.prepare(`
    SELECT DISTINCT story_cluster_id
    FROM story_claims
    WHERE canonical_claim_id = ?
    ORDER BY story_cluster_id
    LIMIT ?
  `).bind(canonicalClaimId, MAX_DIRECT_STORY_SCOPES + 1).all<{ story_cluster_id: number }>();
  const storyIds = (rows.results ?? []).map((row) => row.story_cluster_id);
  if (storyIds.length > MAX_DIRECT_STORY_SCOPES) {
    throw new AssertionGovernanceError(
      "recalculation_scope_too_large",
      "The assertion is linked to too many story scopes for one bounded governance action.",
      409,
    );
  }
  return storyIds;
}

function sameExpectedState(row: AssertionRow, expected: AssertionGovernanceExpectedState): boolean {
  return row.admissionState === expected.admissionState
    && row.reviewerState === expected.reviewerState
    && row.freshnessState === expected.freshnessState;
}

function nextAdmissionState(action: AssertionGovernanceAction, current: AssertionAdmissionState): AssertionAdmissionState {
  if (!["pending", "quarantined"].includes(current)) {
    throw new AssertionGovernanceError(
      "invalid_transition",
      "Only pending or quarantined assertions can be admitted or rejected by this action.",
      409,
    );
  }
  return action === "admit" ? "admitted" : "rejected";
}

function scoreEligible(row: AssertionRow, admissionState: AssertionAdmissionState): boolean {
  return admissionState === "admitted"
    && ["accepted", "amended"].includes(row.reviewerState)
    && row.source_role === "evidence"
    && row.evidence_treatment === "factual_support"
    && ["supports", "partially_supports", "qualifies", "reproduces"].includes(row.relationship);
}

function publicationImpact(row: AssertionRow, previousAdmissionState: AssertionAdmissionState, currentAdmissionState: AssertionAdmissionState): "unchanged" | "may_change" {
  return scoreEligible(row, previousAdmissionState) === scoreEligible(row, currentAdmissionState)
    ? "unchanged"
    : "may_change";
}

function stateFromEvent(event: EventRow): { previous: AssertionGovernanceState; current: AssertionGovernanceState } {
  return {
    previous: {
      admissionState: event.previous_admission_state,
      reviewerState: event.previous_reviewer_state,
      freshnessState: event.previous_freshness_state,
    },
    current: {
      admissionState: event.new_admission_state,
      reviewerState: event.new_reviewer_state,
      freshnessState: event.new_freshness_state,
    },
  };
}

function parseStoryScope(job: RecalculationJobRow): number[] {
  try {
    const parsed = JSON.parse(job.story_scope_json) as unknown;
    if (!Array.isArray(parsed) || parsed.length > MAX_DIRECT_STORY_SCOPES
      || parsed.some((value) => !Number.isInteger(value) || (value as number) < 1)) {
      throw new Error("invalid story scope");
    }
    return parsed as number[];
  } catch {
    throw new AssertionGovernanceError("invalid_recalculation_scope", "The durable recalculation scope is invalid.", 503, job.event_id);
  }
}

function recalcStatusFromJob(job: RecalculationJobRow, replay: boolean): AssertionGovernanceRecalculation {
  if (job.state === "completed" && job.result_json) {
    try {
      const result = JSON.parse(job.result_json) as RecalculateEvidenceResult;
      return {
        status: replay ? "replayed" : "completed",
        jobId: job.id,
        claimSnapshotCount: job.claim_snapshot_count ?? result.claimSnapshots,
        storySnapshotCount: job.story_snapshot_count ?? result.storySnapshots,
        statusChangeCount: job.status_change_count ?? result.statusChanges,
        approvalRequestCount: job.approval_request_count ?? result.approvalRequests,
        claimIds: result.claimIds,
        storyIds: result.storyIds,
      };
    } catch {
      throw new AssertionGovernanceError("invalid_recalculation_result", "The durable recalculation result is invalid.", 503, job.event_id);
    }
  }
  return {
    status: "queued",
    jobId: job.id,
    claimSnapshotCount: job.claim_snapshot_count ?? 0,
    storySnapshotCount: job.story_snapshot_count ?? 0,
    statusChangeCount: job.status_change_count ?? 0,
    approvalRequestCount: job.approval_request_count ?? 0,
    claimIds: [],
    storyIds: parseStoryScope(job),
  };
}

function resultForEvent(
  event: EventRow,
  current: AssertionRow,
  recalculation: AssertionGovernanceRecalculation,
  replay: boolean,
): AssertionGovernanceResult {
  return {
    success: true,
    requestId: event.request_id,
    eventId: event.id,
    clusterId: event.cluster_id,
    assertionId: event.assertion_id,
    canonicalClaimId: event.canonical_claim_id,
    action: event.action,
    previous: stateFromEvent(event).previous,
    current: {
      admissionState: current.admissionState,
      reviewerState: current.reviewerState,
      freshnessState: current.freshnessState,
    },
    recalculation,
    publicationImpact: publicationImpact(current, event.previous_admission_state, event.new_admission_state),
    replay,
  };
}

async function settleEvent(
  db: D1Database,
  event: EventRow,
  replay: boolean,
): Promise<AssertionGovernanceResult> {
  const job = await loadJob(db, event.id);
  if (!job) throw new AssertionGovernanceError("recalculation_obligation_missing", "The assertion transition has no durable recalculation obligation.", 503, event.id);
  const current = await loadAssertion(db, event.assertion_id);
  if (!current) throw new AssertionGovernanceError("assertion_missing_after_commit", "The governed assertion could not be reloaded.", 503, event.id);

  if (job.state === "completed") {
    return resultForEvent(event, current, recalcStatusFromJob(job, replay), replay);
  }

  const claim = await db.prepare(`
    UPDATE assertion_governance_recalculation_jobs
    SET state = 'running', attempt_count = attempt_count + 1, updated_at = datetime('now')
    WHERE event_id = ?
      AND (state IN ('pending','failed')
           OR (state = 'running' AND updated_at <= datetime('now', '-5 minutes')))
  `).bind(event.id).run();
  if (Number(claim.meta.changes ?? 0) !== 1) {
    const currentJob = await loadJob(db, event.id);
    if (!currentJob) throw new AssertionGovernanceError("recalculation_obligation_missing", "The assertion transition has no durable recalculation obligation.", 503, event.id);
    return resultForEvent(event, current, recalcStatusFromJob(currentJob, replay), replay);
  }

  try {
    const storyIds = parseStoryScope(job);
    const result = await recalculateEvidenceScores(db, {
      claimIds: [event.canonical_claim_id],
      storyIds,
      includeLinkedStories: false,
      snapshotIdentity: event.id,
      triggeringEvent: event.action === "admit" ? "assertion_admitted" : "assertion_rejected",
    });
    const resultJson = JSON.stringify(result);
    const completed = await db.prepare(`
      UPDATE assertion_governance_recalculation_jobs
      SET state = 'completed', claim_snapshot_count = ?, story_snapshot_count = ?,
          status_change_count = ?, approval_request_count = ?, result_json = ?,
          last_error = NULL, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE event_id = ? AND state = 'running'
    `).bind(
      result.claimSnapshots, result.storySnapshots, result.statusChanges,
      result.approvalRequests, resultJson, event.id,
    ).run();
    if (Number(completed.meta.changes ?? 0) !== 1) {
      const currentJob = await loadJob(db, event.id);
      if (currentJob?.state === "completed") return resultForEvent(event, current, recalcStatusFromJob(currentJob, true), true);
      throw new AssertionGovernanceError("recalculation_result_unconfirmed", "The recalculation completed but its durable result could not be confirmed.", 503, event.id);
    }
    return resultForEvent(event, current, {
      status: replay ? "replayed" : "completed",
      jobId: job.id,
      claimSnapshotCount: result.claimSnapshots,
      storySnapshotCount: result.storySnapshots,
      statusChangeCount: result.statusChanges,
      approvalRequestCount: result.approvalRequests,
      claimIds: result.claimIds,
      storyIds: result.storyIds,
    }, replay);
  } catch (error) {
    const safeError = error instanceof AssertionGovernanceError
      ? error.message
      : "The recalculation could not be completed.";
    await db.prepare(`
      UPDATE assertion_governance_recalculation_jobs
      SET state = 'failed', last_error = ?, updated_at = datetime('now')
      WHERE event_id = ? AND state = 'running'
    `).bind(safeError.slice(0, 1_000), event.id).run().catch(() => undefined);
    if (error instanceof AssertionGovernanceError) throw error;
    throw new AssertionGovernanceError("recalculation_unavailable", "The assertion transition is durable, but recalculation is queued for recovery.", 503, event.id);
  }
}

export async function governAssertionAdmission(
  db: D1Database,
  input: AssertionGovernanceInput,
): Promise<AssertionGovernanceResult> {
  const expected = validateInput(input);
  const normalizedInput = {
    ...input,
    assertionId: input.assertionId.trim(),
    reason: input.reason.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
    actor: input.actor.trim().toLowerCase(),
    requestId: input.requestId.trim(),
  };
  const fingerprint = await requestFingerprint(normalizedInput, expected);
  const existing = await loadEventByKey(db, normalizedInput.idempotencyKey);
  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      throw new AssertionGovernanceError("idempotency_conflict", "The idempotency key was already used for a different assertion action.", 409);
    }
    return settleEvent(db, existing, true);
  }

  const cluster = await db.prepare("SELECT id FROM story_clusters WHERE id = ?")
    .bind(normalizedInput.clusterId).first<{ id: number }>();
  if (!cluster) throw new AssertionGovernanceError("cluster_not_found", "Cluster not found.", 404);

  const row = await loadAssertion(db, normalizedInput.assertionId);
  if (!row) throw new AssertionGovernanceError("assertion_not_found", "Assertion not found.", 404);
  const associated = await db.prepare(`
    SELECT 1 AS present
    FROM story_claims
    WHERE story_cluster_id = ? AND canonical_claim_id = ?
    LIMIT 1
  `).bind(normalizedInput.clusterId, row.canonical_claim_id).first<{ present: number }>();
  if (!associated) throw new AssertionGovernanceError("assertion_not_associated", "The assertion is not associated with the selected cluster.", 409);
  if (!sameExpectedState(row, expected)) {
    throw new AssertionGovernanceError("state_conflict", "The assertion changed since it was loaded.", 409);
  }

  const newAdmissionState = nextAdmissionState(normalizedInput.action, row.admissionState);
  const storyScope = await loadDirectStoryScope(db, row.canonical_claim_id);
  const eventId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const newRevision = row.assertion_governance_revision + 1;
  const storyScopeJson = JSON.stringify(storyScope);

  try {
    const writes = await db.batch([
      db.prepare(`
        UPDATE claim_assertions
        SET admission_state = ?, assertion_governance_revision = ?
        WHERE id = ? AND canonical_claim_id = ?
          AND admission_state = ? AND reviewer_state = ? AND freshness_state = ?
          AND assertion_governance_revision = ?
      `).bind(
        newAdmissionState, newRevision, row.id, row.canonical_claim_id,
        expected.admissionState, expected.reviewerState, expected.freshnessState,
        row.assertion_governance_revision,
      ),
      db.prepare(`
        INSERT INTO assertion_governance_events
          (id, assertion_id, canonical_claim_id, cluster_id, action,
           previous_admission_state, new_admission_state,
           previous_reviewer_state, new_reviewer_state,
           previous_freshness_state, new_freshness_state,
           previous_admission_revision, new_admission_revision,
           actor_email, actor_role, reason, request_id, idempotency_key,
           request_fingerprint, recalculation_job_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM claim_assertions
          WHERE id = ? AND canonical_claim_id = ?
            AND admission_state = ? AND assertion_governance_revision = ?
        )
      `).bind(
        eventId, row.id, row.canonical_claim_id, normalizedInput.clusterId, normalizedInput.action,
        row.admissionState, newAdmissionState,
        row.reviewerState, row.reviewerState,
        row.freshnessState, row.freshnessState,
        row.assertion_governance_revision, newRevision,
        normalizedInput.actor, normalizedInput.reason, normalizedInput.requestId,
        normalizedInput.idempotencyKey, fingerprint, jobId,
        row.id, row.canonical_claim_id, newAdmissionState, newRevision,
      ),
      db.prepare(`
        INSERT INTO assertion_governance_recalculation_jobs
          (id, event_id, assertion_id, canonical_claim_id, cluster_id, story_scope_json)
        SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM assertion_governance_events WHERE id = ?)
      `).bind(jobId, eventId, row.id, row.canonical_claim_id, normalizedInput.clusterId, storyScopeJson, eventId),
      // The final existence parameter is kept separate from the values above
      // so the event and recalculation obligation share one atomic batch.
    ]);
    if (Number(writes[0]?.meta.changes ?? 0) !== 1) {
      const current = await loadAssertion(db, normalizedInput.assertionId);
      if (current && !sameExpectedState(current, expected)) {
        throw new AssertionGovernanceError("state_conflict", "The assertion changed before this action committed.", 409);
      }
      throw new AssertionGovernanceError("governance_write_failed", "The assertion governance action could not be saved.", 503);
    }
    if (Number(writes[1]?.meta.changes ?? 0) !== 1 || Number(writes[2]?.meta.changes ?? 0) !== 1) {
      throw new AssertionGovernanceError("governance_write_failed", "The assertion governance event and recalculation obligation could not be saved.", 503);
    }
  } catch (error) {
    const raced = await loadEventByKey(db, normalizedInput.idempotencyKey);
    if (raced) {
      if (raced.request_fingerprint !== fingerprint) {
        throw new AssertionGovernanceError("idempotency_conflict", "The idempotency key was already used for a different assertion action.", 409);
      }
      return settleEvent(db, raced, true);
    }
    const current = await loadAssertion(db, normalizedInput.assertionId);
    if (current && !sameExpectedState(current, expected)) {
      throw new AssertionGovernanceError("state_conflict", "The assertion changed before this action committed.", 409);
    }
    throw new AssertionGovernanceError("governance_write_failed", "The assertion governance action could not be saved.", 503);
  }

  const event = await loadEventByKey(db, normalizedInput.idempotencyKey);
  if (!event) throw new AssertionGovernanceError("governance_event_missing", "The assertion governance event could not be reloaded.", 503, eventId);
  return settleEvent(db, event, false);
}
