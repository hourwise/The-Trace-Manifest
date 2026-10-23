import { recalculateEvidenceScores, type RecalculateEvidenceResult } from "./evidence-recalculation";

export const ASSERTION_GOVERNANCE_ACTIONS = ["admit", "reject"] as const;
export type AssertionGovernanceAction = typeof ASSERTION_GOVERNANCE_ACTIONS[number];

export const ASSERTION_REVIEWER_GOVERNANCE_ACTIONS = ["accept_review", "reject_review"] as const;
export type AssertionReviewerGovernanceAction = typeof ASSERTION_REVIEWER_GOVERNANCE_ACTIONS[number];

export const ASSERTION_FRESHNESS_GOVERNANCE_ACTIONS = ["mark_current", "mark_stale"] as const;
export type AssertionFreshnessGovernanceAction = typeof ASSERTION_FRESHNESS_GOVERNANCE_ACTIONS[number];

export type AssertionGovernanceEventAction =
  | AssertionGovernanceAction
  | AssertionReviewerGovernanceAction
  | AssertionFreshnessGovernanceAction;

/**
 * Where a governance decision is made. Story decisions require a real story
 * cluster association; Evidence Library decisions govern assertions that no
 * story carries yet and never record a cluster (migration 0076 enforces this).
 */
export const ASSERTION_GOVERNANCE_CONTEXTS = ["story", "evidence_library"] as const;
export type AssertionGovernanceContext = typeof ASSERTION_GOVERNANCE_CONTEXTS[number];

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

interface AssertionGovernanceScopeInput {
  /** Omitted context with a clusterId means "story" for existing callers. */
  context?: AssertionGovernanceContext;
  clusterId?: number | null;
}

export interface AssertionGovernanceInput extends AssertionGovernanceScopeInput {
  assertionId: string;
  action: AssertionGovernanceAction;
  expected: AssertionGovernanceExpectedState;
  reason: string;
  idempotencyKey: string;
  actor: string;
  requestId: string;
}

export interface AssertionReviewerGovernanceInput extends AssertionGovernanceScopeInput {
  assertionId: string;
  action: AssertionReviewerGovernanceAction;
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
  context: AssertionGovernanceContext;
  clusterId: number | null;
  assertionId: string;
  canonicalClaimId: string;
  action: AssertionGovernanceAction;
  previous: AssertionGovernanceState;
  current: AssertionGovernanceState;
  recalculation: AssertionGovernanceRecalculation;
  publicationImpact: "unchanged" | "may_change";
  replay: boolean;
}

export interface AssertionReviewerGovernanceResult extends Omit<AssertionGovernanceResult, "action"> {
  action: AssertionReviewerGovernanceAction;
}

export interface AssertionFreshnessGovernanceResult extends Omit<AssertionGovernanceResult, "action"> {
  action: AssertionFreshnessGovernanceAction;
}

interface AssertionGovernanceResultBase extends Omit<AssertionGovernanceResult, "action"> {
  action: AssertionGovernanceEventAction;
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
  source_document_version_id: string | null;
}

interface EventRow {
  id: string;
  assertion_id: string;
  canonical_claim_id: string;
  governance_context: AssertionGovernanceContext;
  cluster_id: number | null;
  action: AssertionGovernanceEventAction;
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
  previous_governance_revision: number;
  new_governance_revision: number;
  freshness_review_id: string | null;
  created_at: string;
}

interface RecalculationJobRow {
  id: string;
  event_id: string;
  assertion_id: string;
  canonical_claim_id: string;
  governance_context: AssertionGovernanceContext;
  cluster_id: number | null;
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

/** A story_claims row whose cluster has at least one member item is a real story. */
const REAL_STORY_LINK = (claimColumn: string) => `EXISTS (
  SELECT 1 FROM story_claims real_link
  WHERE real_link.canonical_claim_id = ${claimColumn}
    AND EXISTS (SELECT 1 FROM story_cluster_members real_member WHERE real_member.cluster_id = real_link.story_cluster_id)
)`;

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function nonEmptyBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

// D1 counts trigger-written rows in meta.changes, so "applied" means at least one.
function applied(result: D1Result | undefined): boolean {
  return Number(result?.meta.changes ?? 0) > 0;
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

type ResolvedScope =
  | { context: "story"; clusterId: number }
  | { context: "evidence_library"; clusterId: null };

/**
 * Resolves the decision scope and rejects ambiguous or spoofed requests: a
 * library decision cannot name a cluster, and a story decision must.
 */
export function resolveGovernanceScope(input: AssertionGovernanceScopeInput): ResolvedScope {
  const hasCluster = input.clusterId !== undefined && input.clusterId !== null;
  if (input.context !== undefined && !isOneOf(ASSERTION_GOVERNANCE_CONTEXTS, input.context)) {
    throw new AssertionGovernanceError("invalid_scope", "context must be story or evidence_library.");
  }
  const context = input.context ?? (hasCluster ? "story" : undefined);
  if (context === "story") {
    if (!Number.isInteger(input.clusterId) || (input.clusterId as number) < 1) {
      throw new AssertionGovernanceError("invalid_cluster_id", "A positive clusterId is required for a story decision.");
    }
    return { context, clusterId: input.clusterId as number };
  }
  if (context === "evidence_library") {
    if (hasCluster) {
      throw new AssertionGovernanceError("invalid_scope", "An Evidence Library decision cannot name a story cluster.");
    }
    return { context, clusterId: null };
  }
  throw new AssertionGovernanceError("invalid_scope", "A story clusterId or the evidence_library context is required.");
}

function validateCommonInput(input: AssertionGovernanceInput | AssertionReviewerGovernanceInput): void {
  if (!nonEmptyBoundedText(input.assertionId, MAX_ASSERTION_ID_LENGTH)) {
    throw new AssertionGovernanceError("invalid_assertion_id", "A bounded assertionId is required.");
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
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface NormalizedInput {
  assertionId: string;
  action: AssertionGovernanceAction | AssertionReviewerGovernanceAction;
  reason: string;
  idempotencyKey: string;
  actor: string;
  requestId: string;
}

// Story fingerprints keep their pre-0076 canonical form so durable replays of
// existing events still match. Library fingerprints carry the context instead
// of a cluster, so a key can never be replayed across contexts.
async function requestFingerprint(
  kind: "admission" | "reviewer",
  input: NormalizedInput,
  scope: ResolvedScope,
  expected: AssertionGovernanceExpectedState,
): Promise<string> {
  const shared = {
    assertionId: input.assertionId,
    ...(scope.context === "story" ? { clusterId: scope.clusterId } : { context: scope.context }),
    action: input.action,
    expected,
    reason: input.reason,
    actor: input.actor,
  };
  const canonical = kind === "admission"
    ? { version: scope.context === "story" ? "assertion-governance-v1" : "assertion-governance-library-v1", ...shared }
    : {
      version: scope.context === "story" ? "assertion-reviewer-governance-v1" : "assertion-reviewer-governance-library-v1",
      boundary: "reviewer_state",
      ...shared,
    };
  return sha256(JSON.stringify(canonical));
}

const EVENT_COLUMNS = `
  id, assertion_id, canonical_claim_id, governance_context, cluster_id, action,
  previous_admission_state, new_admission_state,
  previous_reviewer_state, new_reviewer_state,
  previous_freshness_state, new_freshness_state,
  actor_email, actor_role, reason, request_id, idempotency_key,
  request_fingerprint, recalculation_job_id, created_at,
  previous_governance_revision, new_governance_revision, freshness_review_id`;

export async function loadGovernanceEventByKey(db: D1Database, idempotencyKey: string): Promise<EventRow | null> {
  return db.prepare(`SELECT ${EVENT_COLUMNS} FROM assertion_governance_events WHERE idempotency_key = ?`)
    .bind(idempotencyKey).first<EventRow>();
}

export async function loadGovernanceEventByFreshnessReview(db: D1Database, reviewId: string): Promise<EventRow | null> {
  return db.prepare(`SELECT ${EVENT_COLUMNS} FROM assertion_governance_events WHERE freshness_review_id = ?`)
    .bind(reviewId).first<EventRow>();
}

async function loadJob(db: D1Database, eventId: string): Promise<RecalculationJobRow | null> {
  return db.prepare(`
    SELECT id, event_id, assertion_id, canonical_claim_id, governance_context, cluster_id,
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
           relationship, source_document_version_id
    FROM claim_assertions
    WHERE id = ?
  `).bind(assertionId).first<AssertionRow>();
}

/**
 * The stories genuinely associated with a canonical claim, bounded. A cluster
 * with no member items (such as the legacy "Unclustered Items" holding
 * cluster) is not a real story, so it never receives a recalculation or blocks
 * library review.
 */
export async function loadRealStoryScope(
  db: D1Database,
  canonicalClaimId: string,
  options: { truncate?: boolean } = {},
): Promise<number[]> {
  const rows = await db.prepare(`
    SELECT DISTINCT story_claim.story_cluster_id
    FROM story_claims story_claim
    WHERE story_claim.canonical_claim_id = ?
      AND EXISTS (SELECT 1 FROM story_cluster_members member WHERE member.cluster_id = story_claim.story_cluster_id)
    ORDER BY story_claim.story_cluster_id
    LIMIT ?
  `).bind(canonicalClaimId, MAX_DIRECT_STORY_SCOPES + 1).all<{ story_cluster_id: number }>();
  const storyIds = (rows.results ?? []).map((row) => row.story_cluster_id);
  if (storyIds.length > MAX_DIRECT_STORY_SCOPES) {
    // Freshness approvals must never be blocked (a stale marking is a safety
    // action), so they recalculate the first bounded set of stories instead.
    if (options.truncate) return storyIds.slice(0, MAX_DIRECT_STORY_SCOPES);
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

function nextReviewerState(action: AssertionReviewerGovernanceAction, current: AssertionReviewerState): AssertionReviewerState {
  if (!(["proposed", "needs_research"] as AssertionReviewerState[]).includes(current)) {
    throw new AssertionGovernanceError(
      "invalid_transition",
      "Reviewer decisions can only accept or reject proposed or needs-research assertions; accepted, rejected, amended, duplicate, and unsupported states are deferred.",
      409,
    );
  }
  return action === "accept_review" ? "accepted" : "rejected";
}

function scoreEligible(row: AssertionRow, admissionState: AssertionAdmissionState): boolean {
  return admissionState === "admitted"
    && ["accepted", "amended"].includes(row.reviewerState)
    && row.source_role === "evidence"
    && row.evidence_treatment === "factual_support"
    && ["supports", "partially_supports", "qualifies", "reproduces"].includes(row.relationship);
}

function publicationImpactForAdmission(row: AssertionRow, previousAdmissionState: AssertionAdmissionState, currentAdmissionState: AssertionAdmissionState): "unchanged" | "may_change" {
  return scoreEligible(row, previousAdmissionState) === scoreEligible(row, currentAdmissionState)
    ? "unchanged"
    : "may_change";
}

function reviewerPublicationImpact(
  row: AssertionRow,
  previousReviewerState: AssertionReviewerState,
  currentReviewerState: AssertionReviewerState,
): "unchanged" | "may_change" {
  const previous = scoreEligible({ ...row, reviewerState: previousReviewerState }, row.admissionState);
  const current = scoreEligible({ ...row, reviewerState: currentReviewerState }, row.admissionState);
  return previous === current ? "unchanged" : "may_change";
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

function recalculationTrigger(action: AssertionGovernanceEventAction):
  | "assertion_admitted" | "assertion_rejected" | "assertion_review_accepted" | "assertion_review_rejected"
  | "assertion_freshness_current" | "assertion_freshness_stale" {
  switch (action) {
    case "admit": return "assertion_admitted";
    case "reject": return "assertion_rejected";
    case "accept_review": return "assertion_review_accepted";
    case "reject_review": return "assertion_review_rejected";
    case "mark_current": return "assertion_freshness_current";
    case "mark_stale": return "assertion_freshness_stale";
  }
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

function publicationImpactForEvent(event: EventRow, current: AssertionRow): "unchanged" | "may_change" {
  // An Evidence Library decision has no story to publish or withdraw.
  if (event.governance_context === "evidence_library") return "unchanged";
  switch (event.action) {
    case "accept_review":
    case "reject_review":
      return reviewerPublicationImpact(current, event.previous_reviewer_state, event.new_reviewer_state);
    case "admit":
    case "reject":
      return publicationImpactForAdmission(current, event.previous_admission_state, event.new_admission_state);
    // Freshness changes answer eligibility, never story publication itself.
    case "mark_current":
    case "mark_stale":
      return "unchanged";
  }
}

function resultForEvent(
  event: EventRow,
  current: AssertionRow,
  recalculation: AssertionGovernanceRecalculation,
  replay: boolean,
): AssertionGovernanceResultBase {
  return {
    success: true,
    requestId: event.request_id,
    eventId: event.id,
    context: event.governance_context,
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
    publicationImpact: publicationImpactForEvent(event, current),
    replay,
  };
}

/**
 * Runs (or reports) the durable recalculation obligation for a committed
 * governance event. Shared by every context and action.
 */
export async function settleGovernanceEvent(
  db: D1Database,
  event: EventRow,
  replay: boolean,
): Promise<AssertionGovernanceResultBase> {
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
  if (!applied(claim)) {
    const currentJob = await loadJob(db, event.id);
    if (!currentJob) throw new AssertionGovernanceError("recalculation_obligation_missing", "The assertion transition has no durable recalculation obligation.", 503, event.id);
    return resultForEvent(event, current, recalcStatusFromJob(currentJob, replay), replay);
  }

  try {
    // An empty scope is a legitimate bounded result: the canonical claim is
    // recalculated and no story is invented.
    const storyIds = parseStoryScope(job);
    const result = await recalculateEvidenceScores(db, {
      claimIds: [event.canonical_claim_id],
      storyIds,
      includeLinkedStories: false,
      snapshotIdentity: event.id,
      triggeringEvent: recalculationTrigger(event.action),
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
    if (!applied(completed)) {
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

export interface GovernanceEventInsert {
  eventId: string;
  jobId: string;
  assertion: { id: string; canonicalClaimId: string; revision: number };
  scope: ResolvedScope;
  action: AssertionGovernanceEventAction;
  previous: AssertionGovernanceState;
  next: AssertionGovernanceState;
  previousAdmissionRevision: number;
  newAdmissionRevision: number;
  freshnessReviewId: string | null;
  actor: string;
  reason: string;
  requestId: string;
  idempotencyKey: string;
  fingerprint: string;
  storyScope: number[];
}

/**
 * The event and recalculation-obligation inserts for one transition. Both are
 * guarded on the assertion already holding the new state and revision, so they
 * belong in the same batch as the CAS update that produces it.
 */
export function governanceEventStatements(db: D1Database, insert: GovernanceEventInsert): D1PreparedStatement[] {
  const newRevision = insert.assertion.revision + 1;
  return [
    db.prepare(`
      INSERT INTO assertion_governance_events
        (id, assertion_id, canonical_claim_id, governance_context, cluster_id, action,
         previous_admission_state, new_admission_state,
         previous_reviewer_state, new_reviewer_state,
         previous_freshness_state, new_freshness_state,
         previous_admission_revision, new_admission_revision,
         previous_governance_revision, new_governance_revision,
         freshness_review_id,
         actor_email, actor_role, reason, request_id, idempotency_key,
         request_fingerprint, recalculation_job_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM claim_assertions
        WHERE id = ? AND canonical_claim_id = ?
          AND admission_state = ? AND reviewer_state = ? AND freshness_state = ?
          AND assertion_governance_revision = ?
      )
    `).bind(
      insert.eventId, insert.assertion.id, insert.assertion.canonicalClaimId,
      insert.scope.context, insert.scope.clusterId, insert.action,
      insert.previous.admissionState, insert.next.admissionState,
      insert.previous.reviewerState, insert.next.reviewerState,
      insert.previous.freshnessState, insert.next.freshnessState,
      insert.previousAdmissionRevision, insert.newAdmissionRevision,
      insert.assertion.revision, newRevision,
      insert.freshnessReviewId,
      insert.actor, insert.reason, insert.requestId,
      insert.idempotencyKey, insert.fingerprint, insert.jobId,
      insert.assertion.id, insert.assertion.canonicalClaimId,
      insert.next.admissionState, insert.next.reviewerState, insert.next.freshnessState, newRevision,
    ),
    db.prepare(`
      INSERT INTO assertion_governance_recalculation_jobs
        (id, event_id, assertion_id, canonical_claim_id, governance_context, cluster_id, story_scope_json)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM assertion_governance_events WHERE id = ?)
    `).bind(
      insert.jobId, insert.eventId, insert.assertion.id, insert.assertion.canonicalClaimId,
      insert.scope.context, insert.scope.clusterId, JSON.stringify(insert.storyScope), insert.eventId,
    ),
  ];
}

/** Checks the scope-specific association before any write. */
async function assertScopeAssociation(
  db: D1Database,
  scope: ResolvedScope,
  row: AssertionRow,
  promoting: boolean,
): Promise<void> {
  if (scope.context === "story") {
    const associated = await db.prepare(`
      SELECT 1 AS present
      FROM story_claims
      WHERE story_cluster_id = ? AND canonical_claim_id = ?
      LIMIT 1
    `).bind(scope.clusterId, row.canonical_claim_id).first<{ present: number }>();
    if (!associated) throw new AssertionGovernanceError("assertion_not_associated", "The assertion is not associated with the selected cluster.", 409);
    // A memberless holding cluster (such as the legacy "Unclustered Items"
    // cluster) is not a story; its claims are governed in the Evidence Library,
    // so exactly one context applies to any assertion.
    const member = await db.prepare("SELECT 1 AS present FROM story_cluster_members WHERE cluster_id = ? LIMIT 1")
      .bind(scope.clusterId).first<{ present: number }>();
    if (!member) throw new AssertionGovernanceError("cluster_not_story", "This cluster has no member items; govern its claims in the Evidence Library.", 409);
    return;
  }

  // Evidence Library: the claim must not belong to a real story, which is
  // governed in its story context instead.
  const linked = await db.prepare(`SELECT 1 AS present WHERE ${REAL_STORY_LINK("?")}`)
    .bind(row.canonical_claim_id).first<{ present: number }>();
  if (linked) {
    throw new AssertionGovernanceError("assertion_story_linked", "This assertion belongs to a story; govern it from that story.", 409);
  }
  // Admission and acceptance need an admitted captured source. Rejection never
  // needs one, so unusable library records can always be closed out.
  if (promoting) {
    if (!row.source_document_version_id) {
      throw new AssertionGovernanceError("source_missing", "An Evidence Library assertion needs a captured source version.", 409);
    }
    const source = await db.prepare(`
      SELECT document.admission_state
      FROM source_document_versions version
      JOIN source_documents document ON document.id = version.source_document_id
      WHERE version.id = ?
    `).bind(row.source_document_version_id).first<{ admission_state: string }>();
    if (!source) throw new AssertionGovernanceError("source_missing", "The assertion's source version could not be found.", 409);
    if (source.admission_state !== "admitted") {
      throw new AssertionGovernanceError("source_not_admitted", "The assertion's source document is not admitted.", 409);
    }
  }
}

type TransitionKind =
  | { kind: "admission"; action: AssertionGovernanceAction }
  | { kind: "reviewer"; action: AssertionReviewerGovernanceAction };

async function governTransition(
  db: D1Database,
  input: AssertionGovernanceInput | AssertionReviewerGovernanceInput,
  transition: TransitionKind,
): Promise<AssertionGovernanceResultBase> {
  const scope = resolveGovernanceScope(input);
  validateCommonInput(input);
  const expected = validateExpectedState(input.expected);
  const normalized: NormalizedInput = {
    assertionId: input.assertionId.trim(),
    action: transition.action,
    reason: input.reason.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
    actor: input.actor.trim().toLowerCase(),
    requestId: input.requestId.trim(),
  };
  const fingerprint = await requestFingerprint(transition.kind, normalized, scope, expected);
  const existing = await loadGovernanceEventByKey(db, normalized.idempotencyKey);
  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      throw new AssertionGovernanceError("idempotency_conflict", "The idempotency key was already used for a different assertion action.", 409);
    }
    return settleGovernanceEvent(db, existing, true);
  }

  // Story checks keep their original order: cluster, assertion, association.
  if (scope.context === "story") {
    const cluster = await db.prepare("SELECT id FROM story_clusters WHERE id = ?").bind(scope.clusterId).first<{ id: number }>();
    if (!cluster) throw new AssertionGovernanceError("cluster_not_found", "Cluster not found.", 404);
  }
  const row = await loadAssertion(db, normalized.assertionId);
  if (!row) throw new AssertionGovernanceError("assertion_not_found", "Assertion not found.", 404);
  const promoting = transition.action === "admit" || transition.action === "accept_review";
  await assertScopeAssociation(db, scope, row, promoting);
  if (!sameExpectedState(row, expected)) {
    throw new AssertionGovernanceError("state_conflict", "The assertion changed since it was loaded.", 409);
  }

  const next: AssertionGovernanceState = transition.kind === "admission"
    ? { ...expected, admissionState: nextAdmissionState(transition.action, row.admissionState) }
    : { ...expected, reviewerState: nextReviewerState(transition.action, row.reviewerState) };
  // Story decisions recalculate the selected story plus every real story that
  // carries the claim; memberless holding clusters (Production story 358 has
  // 539 claims) are never rescored. Library decisions have no real story by
  // construction, so their scope is empty.
  const storyScope = scope.context === "story"
    ? [...new Set([scope.clusterId, ...await loadRealStoryScope(db, row.canonical_claim_id)])].sort((a, b) => a - b)
    : [];
  if (storyScope.length > MAX_DIRECT_STORY_SCOPES) {
    throw new AssertionGovernanceError("recalculation_scope_too_large", "The assertion is linked to too many story scopes for one bounded governance action.", 409);
  }
  const eventId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const newRevision = row.assertion_governance_revision + 1;
  const label = transition.kind === "admission" ? "action" : "reviewer decision";

  const stateUpdate = transition.kind === "admission"
    ? db.prepare(`
        UPDATE claim_assertions
        SET admission_state = ?, assertion_governance_revision = ?
        WHERE id = ? AND canonical_claim_id = ?
          AND admission_state = ? AND reviewer_state = ? AND freshness_state = ?
          AND assertion_governance_revision = ?
          ${scope.context === "evidence_library" ? `AND NOT ${REAL_STORY_LINK("claim_assertions.canonical_claim_id")}` : ""}
      `).bind(
        next.admissionState, newRevision, row.id, row.canonical_claim_id,
        expected.admissionState, expected.reviewerState, expected.freshnessState,
        row.assertion_governance_revision,
      )
    : db.prepare(`
        UPDATE claim_assertions
        SET reviewer_state = ?, reviewed_by = ?, reviewed_at = datetime('now'),
            assertion_governance_revision = ?
        WHERE id = ? AND canonical_claim_id = ?
          AND admission_state = ? AND reviewer_state = ? AND freshness_state = ?
          AND assertion_governance_revision = ?
          ${scope.context === "evidence_library" ? `AND NOT ${REAL_STORY_LINK("claim_assertions.canonical_claim_id")}` : ""}
      `).bind(
        next.reviewerState, normalized.actor, newRevision,
        row.id, row.canonical_claim_id,
        expected.admissionState, expected.reviewerState, expected.freshnessState,
        row.assertion_governance_revision,
      );

  try {
    const writes = await db.batch([
      stateUpdate,
      ...governanceEventStatements(db, {
        eventId, jobId,
        assertion: { id: row.id, canonicalClaimId: row.canonical_claim_id, revision: row.assertion_governance_revision },
        scope,
        action: transition.action,
        previous: expected,
        next,
        previousAdmissionRevision: row.assertion_governance_revision,
        newAdmissionRevision: transition.kind === "admission" ? newRevision : row.assertion_governance_revision,
        freshnessReviewId: null,
        actor: normalized.actor,
        reason: normalized.reason,
        requestId: normalized.requestId,
        idempotencyKey: normalized.idempotencyKey,
        fingerprint,
        storyScope,
      }),
    ]);
    if (!applied(writes[0])) {
      if (scope.context === "evidence_library") {
        const linkedNow = await db.prepare(`SELECT 1 AS present WHERE ${REAL_STORY_LINK("?")}`).bind(row.canonical_claim_id).first<{ present: number }>();
        if (linkedNow) throw new AssertionGovernanceError("assertion_story_linked", "This assertion joined a story before the decision committed; govern it from that story.", 409);
      }
      const current = await loadAssertion(db, normalized.assertionId);
      if (current && !sameExpectedState(current, expected)) {
        throw new AssertionGovernanceError("state_conflict", `The assertion changed before this ${label} committed.`, 409);
      }
      throw new AssertionGovernanceError("governance_write_failed", `The assertion governance ${label} could not be saved.`, 503);
    }
    if (!applied(writes[1]) || !applied(writes[2])) {
      throw new AssertionGovernanceError("governance_write_failed", "The assertion governance event and recalculation obligation could not be saved.", 503);
    }
  } catch (error) {
    const raced = await loadGovernanceEventByKey(db, normalized.idempotencyKey);
    if (raced) {
      if (raced.request_fingerprint !== fingerprint) {
        throw new AssertionGovernanceError("idempotency_conflict", "The idempotency key was already used for a different assertion action.", 409);
      }
      return settleGovernanceEvent(db, raced, true);
    }
    const current = await loadAssertion(db, normalized.assertionId);
    if (current && !sameExpectedState(current, expected)) {
      throw new AssertionGovernanceError("state_conflict", `The assertion changed before this ${label} committed.`, 409);
    }
    if (error instanceof AssertionGovernanceError) throw error;
    throw new AssertionGovernanceError("governance_write_failed", `The assertion governance ${label} could not be saved.`, 503);
  }

  const event = await loadGovernanceEventByKey(db, normalized.idempotencyKey);
  if (!event) throw new AssertionGovernanceError("governance_event_missing", "The assertion governance event could not be reloaded.", 503, eventId);
  return settleGovernanceEvent(db, event, false);
}

export async function governAssertionAdmission(
  db: D1Database,
  input: AssertionGovernanceInput,
): Promise<AssertionGovernanceResult> {
  if (!isOneOf(ASSERTION_GOVERNANCE_ACTIONS, input.action)) {
    throw new AssertionGovernanceError("invalid_action", "action must be admit or reject.");
  }
  return governTransition(db, input, { kind: "admission", action: input.action }) as Promise<AssertionGovernanceResult>;
}

export async function governAssertionReviewerDecision(
  db: D1Database,
  input: AssertionReviewerGovernanceInput,
): Promise<AssertionReviewerGovernanceResult> {
  if (!isOneOf(ASSERTION_REVIEWER_GOVERNANCE_ACTIONS, input.action)) {
    throw new AssertionGovernanceError("invalid_action", "action must be accept_review or reject_review.");
  }
  return governTransition(db, input, { kind: "reviewer", action: input.action }) as Promise<AssertionReviewerGovernanceResult>;
}
