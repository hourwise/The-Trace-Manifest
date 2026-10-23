import type {
  AssertionAdmissionState,
  AssertionFreshnessState,
  AssertionGovernanceContext,
  AssertionGovernanceEventAction,
  AssertionReviewerState,
} from "./assertion-governance";

export const ASSERTION_GOVERNANCE_HISTORY_LIMIT = 50;

export type AssertionGovernanceHistoryAxis = "admission" | "editorial_review" | "freshness";
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
  context: AssertionGovernanceContext;
  clusterId: number | null;
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
  context: AssertionGovernanceContext;
  clusterId: number | null;
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
  if (action === "admit" || action === "reject") return "admission";
  if (action === "mark_current" || action === "mark_stale") return "freshness";
  return "editorial_review";
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
    context: row.governance_context,
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
 * the selected cluster's canonical-claim association (story scope), or for an
 * assertion read from the Evidence Library (no cluster). The ledger is queried
 * across the assertion's durable events because an assertion can be mapped to
 * more than one story; the selected cluster is an authorization/association
 * boundary, not a reason to hide the assertion's lifecycle.
 */
export async function getAssertionGovernanceHistory(
  db: D1Database,
  clusterId: number | null,
  assertionId: string,
): Promise<AssertionGovernanceHistory> {
  const normalizedAssertionId = assertionId.trim();
  const libraryScope = clusterId === null;
  if ((!libraryScope && (!Number.isInteger(clusterId) || (clusterId as number) < 1))
    || normalizedAssertionId.length < 1 || normalizedAssertionId.length > 200) {
    throw new AssertionGovernanceHistoryError("invalid_request", "A positive clusterId (or the Evidence Library scope) and a bounded assertionId are required.", 400);
  }

  if (!libraryScope) {
    const cluster = await db.prepare("SELECT id FROM story_clusters WHERE id = ?")
      .bind(clusterId)
      .first<{ id: number }>();
    if (!cluster) throw new AssertionGovernanceHistoryError("cluster_not_found", "Cluster not found.", 404);
  }

  const assertion = await db.prepare("SELECT id, canonical_claim_id FROM claim_assertions WHERE id = ?")
    .bind(normalizedAssertionId)
    .first<{ id: string; canonical_claim_id: string }>();
  if (!assertion) throw new AssertionGovernanceHistoryError("assertion_not_found", "Assertion not found.", 404);

  // Library scope reads only assertions no real story carries; a story's
  // assertion history is read through that story.
  const associated = libraryScope
    ? await db.prepare(`
        SELECT 1 AS present WHERE NOT EXISTS (
          SELECT 1 FROM story_claims link
          WHERE link.canonical_claim_id = ?
            AND EXISTS (SELECT 1 FROM story_cluster_members member WHERE member.cluster_id = link.story_cluster_id)
        )
      `).bind(assertion.canonical_claim_id).first<{ present: number }>()
    : await db.prepare(`
    SELECT 1 AS present
    FROM story_claims
    WHERE story_cluster_id = ? AND canonical_claim_id = ?
    LIMIT 1
  `).bind(clusterId, assertion.canonical_claim_id).first<{ present: number }>();
  if (!associated) {
    throw new AssertionGovernanceHistoryError(
      "assertion_not_associated",
      libraryScope
        ? "The assertion belongs to a story; read its history from that story."
        : "The assertion is not associated with the selected cluster.",
      409,
    );
  }

  const result = await db.prepare(`
    SELECT event.id AS event_id,
           event.assertion_id,
           event.canonical_claim_id,
           event.governance_context,
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
    -- created_at has one-second resolution; the per-assertion governance
    -- revision (unique since 0076) is the exact decision order.
    ORDER BY event.new_governance_revision ASC, event.created_at ASC, event.id ASC
    LIMIT ?
  `).bind(normalizedAssertionId, ASSERTION_GOVERNANCE_HISTORY_LIMIT + 1).all<HistoryEventRow>();

  const rows = result.results ?? [];
  const truncated = rows.length > ASSERTION_GOVERNANCE_HISTORY_LIMIT;
  return {
    context: libraryScope ? "evidence_library" : "story",
    clusterId,
    assertionId: normalizedAssertionId,
    canonicalClaimId: assertion.canonical_claim_id,
    limit: ASSERTION_GOVERNANCE_HISTORY_LIMIT,
    order: "oldest_first",
    truncated,
    events: rows.slice(0, ASSERTION_GOVERNANCE_HISTORY_LIMIT).map(mapEvent),
  };
}
