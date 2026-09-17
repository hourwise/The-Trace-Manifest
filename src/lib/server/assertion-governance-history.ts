import type {
  AssertionAdmissionState,
  AssertionFreshnessState,
  AssertionGovernanceEventAction,
  AssertionReviewerState,
} from "./assertion-governance";

export const ASSERTION_GOVERNANCE_HISTORY_LIMIT = 50;

export type AssertionGovernanceHistoryAxis = "admission" | "editorial_review";
export type AssertionGovernanceHistoryRecalculationStatus = "completed" | "queued" | "failed" | "unknown";

export interface AssertionGovernanceHistoryState {
  admissionState: AssertionAdmissionState;
  reviewerState: AssertionReviewerState;
  freshnessState: AssertionFreshnessState;
}

export interface AssertionGovernanceHistoryRecalculation {
  status: AssertionGovernanceHistoryRecalculationStatus;
  attemptCount: number;
  completedAt: string | null;
  claimSnapshotCount: number | null;
  storySnapshotCount: number | null;
  statusChangeCount: number | null;
  approvalRequestCount: number | null;
  failureRecorded: boolean;
}

export interface AssertionGovernanceHistoryEvent {
  eventId: string;
  assertionId: string;
  canonicalClaimId: string;
  clusterId: number;
  action: AssertionGovernanceEventAction;
  axis: AssertionGovernanceHistoryAxis;
  previous: AssertionGovernanceHistoryState;
  current: AssertionGovernanceHistoryState;
  actorEmail: string;
  actorRole: "publisher";
  reason: string;
  requestId: string;
  timestamp: string;
  recalculation: AssertionGovernanceHistoryRecalculation;
  replayStatus: "replays_reuse_this_event";
}

export interface AssertionGovernanceHistory {
  clusterId: number;
  assertionId: string;
  canonicalClaimId: string;
  limit: number;
  order: "oldest_first";
  truncated: boolean;
  events: AssertionGovernanceHistoryEvent[];
}

export class AssertionGovernanceHistoryError extends Error {
  constructor(
    readonly code: "invalid_request" | "cluster_not_found" | "assertion_not_found" | "assertion_not_associated",
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "AssertionGovernanceHistoryError";
  }
}

interface HistoryEventRow {
  event_id: string;
  assertion_id: string;
  canonical_claim_id: string;
  cluster_id: number;
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
  created_at: string;
  recalc_state: "pending" | "running" | "completed" | "failed" | null;
  attempt_count: number | null;
  claim_snapshot_count: number | null;
  story_snapshot_count: number | null;
  status_change_count: number | null;
  approval_request_count: number | null;
  recalc_last_error: string | null;
  completed_at: string | null;
}

function axisForAction(action: AssertionGovernanceEventAction): AssertionGovernanceHistoryAxis {
  return action === "admit" || action === "reject" ? "admission" : "editorial_review";
}

function recalculationFromRow(row: HistoryEventRow): AssertionGovernanceHistoryRecalculation {
  return {
    status: row.recalc_state === "completed"
      ? "completed"
      : row.recalc_state === "failed"
        ? "failed"
        : row.recalc_state === "pending" || row.recalc_state === "running"
          ? "queued"
          : "unknown",
    attemptCount: row.attempt_count ?? 0,
    completedAt: row.completed_at,
    claimSnapshotCount: row.claim_snapshot_count,
    storySnapshotCount: row.story_snapshot_count,
    statusChangeCount: row.status_change_count,
    approvalRequestCount: row.approval_request_count,
    failureRecorded: Boolean(row.recalc_last_error),
  };
}

function mapEvent(row: HistoryEventRow): AssertionGovernanceHistoryEvent {
  return {
    eventId: row.event_id,
    assertionId: row.assertion_id,
    canonicalClaimId: row.canonical_claim_id,
    clusterId: row.cluster_id,
    action: row.action,
    axis: axisForAction(row.action),
    previous: {
      admissionState: row.previous_admission_state,
      reviewerState: row.previous_reviewer_state,
      freshnessState: row.previous_freshness_state,
    },
    current: {
      admissionState: row.new_admission_state,
      reviewerState: row.new_reviewer_state,
      freshnessState: row.new_freshness_state,
    },
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    reason: row.reason,
    requestId: row.request_id,
    timestamp: row.created_at,
    recalculation: recalculationFromRow(row),
    replayStatus: "replays_reuse_this_event",
  };
}

/**
 * Bounded, read-only governance history for one assertion after validating
 * the selected cluster's canonical-claim association. The ledger is queried
 * across the assertion's durable events because an assertion can be mapped to
 * more than one story; the selected cluster is an authorization/association
 * boundary, not a reason to hide the assertion's lifecycle.
 */
export async function getAssertionGovernanceHistory(
  db: D1Database,
  clusterId: number,
  assertionId: string,
): Promise<AssertionGovernanceHistory> {
  const normalizedAssertionId = assertionId.trim();
  if (!Number.isInteger(clusterId) || clusterId < 1 || normalizedAssertionId.length < 1 || normalizedAssertionId.length > 200) {
    throw new AssertionGovernanceHistoryError("invalid_request", "A positive clusterId and bounded assertionId are required.", 400);
  }

  const cluster = await db.prepare("SELECT id FROM story_clusters WHERE id = ?")
    .bind(clusterId)
    .first<{ id: number }>();
  if (!cluster) throw new AssertionGovernanceHistoryError("cluster_not_found", "Cluster not found.", 404);

  const assertion = await db.prepare("SELECT id, canonical_claim_id FROM claim_assertions WHERE id = ?")
    .bind(normalizedAssertionId)
    .first<{ id: string; canonical_claim_id: string }>();
  if (!assertion) throw new AssertionGovernanceHistoryError("assertion_not_found", "Assertion not found.", 404);

  const associated = await db.prepare(`
    SELECT 1 AS present
    FROM story_claims
    WHERE story_cluster_id = ? AND canonical_claim_id = ?
    LIMIT 1
  `).bind(clusterId, assertion.canonical_claim_id).first<{ present: number }>();
  if (!associated) {
    throw new AssertionGovernanceHistoryError(
      "assertion_not_associated",
      "The assertion is not associated with the selected cluster.",
      409,
    );
  }

  const result = await db.prepare(`
    SELECT event.id AS event_id,
           event.assertion_id,
           event.canonical_claim_id,
           event.cluster_id,
           event.action,
           event.previous_admission_state,
           event.new_admission_state,
           event.previous_reviewer_state,
           event.new_reviewer_state,
           event.previous_freshness_state,
           event.new_freshness_state,
           event.actor_email,
           event.actor_role,
           event.reason,
           event.request_id,
           event.created_at,
           job.state AS recalc_state,
           job.attempt_count,
           job.claim_snapshot_count,
           job.story_snapshot_count,
           job.status_change_count,
           job.approval_request_count,
           job.last_error AS recalc_last_error,
           job.completed_at
    FROM assertion_governance_events event
    LEFT JOIN assertion_governance_recalculation_jobs job ON job.event_id = event.id
    WHERE event.assertion_id = ?
    ORDER BY event.created_at ASC, event.id ASC
    LIMIT ?
  `).bind(normalizedAssertionId, ASSERTION_GOVERNANCE_HISTORY_LIMIT + 1).all<HistoryEventRow>();

  const rows = result.results ?? [];
  const truncated = rows.length > ASSERTION_GOVERNANCE_HISTORY_LIMIT;
  return {
    clusterId,
    assertionId: normalizedAssertionId,
    canonicalClaimId: assertion.canonical_claim_id,
    limit: ASSERTION_GOVERNANCE_HISTORY_LIMIT,
    order: "oldest_first",
    truncated,
    events: rows.slice(0, ASSERTION_GOVERNANCE_HISTORY_LIMIT).map(mapEvent),
  };
}
