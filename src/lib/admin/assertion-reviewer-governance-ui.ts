import type { EditorialAssertion } from "../editorial-evidence-contract";

export const ASSERTION_REVIEWER_GOVERNANCE_REASON_MAX_LENGTH = 2_000;
export const ASSERTION_REVIEWER_GOVERNANCE_ACTIONS = ["accept_review", "reject_review"] as const;
export type AssertionReviewerGovernanceAction = typeof ASSERTION_REVIEWER_GOVERNANCE_ACTIONS[number];
export type AssertionReviewerGovernanceRole = "reader" | "publisher";

export interface AssertionReviewerGovernanceExpectedState {
  admissionState: EditorialAssertion["admissionState"];
  reviewerState: EditorialAssertion["reviewerState"];
  freshnessState: EditorialAssertion["freshnessState"];
}

interface AssertionReviewerGovernancePayloadBase {
  assertionId: string;
  action: AssertionReviewerGovernanceAction;
  expected: AssertionReviewerGovernanceExpectedState;
  reason: string;
  idempotencyKey: string;
}

/** A story decision names its cluster; an Evidence Library decision never does. */
export type AssertionReviewerGovernancePayload =
  | (AssertionReviewerGovernancePayloadBase & { clusterId: number; context?: never })
  | (AssertionReviewerGovernancePayloadBase & { context: "evidence_library"; clusterId?: never });

export interface AssertionReviewerGovernanceResponse {
  success: true;
  requestId?: string;
  eventId?: string;
  action: AssertionReviewerGovernanceAction;
  recalculation: {
    status: "completed" | "queued" | "replayed";
    jobId?: string;
  };
  publicationImpact: "unchanged" | "may_change";
  replay: boolean;
}

export interface AssertionReviewerGovernanceErrorBody {
  error?: string;
  code?: string;
  requestId?: string;
  eventId?: string;
}

export function isAssertionReviewerGovernanceEligible(
  reviewerState: EditorialAssertion["reviewerState"],
): boolean {
  return reviewerState === "proposed" || reviewerState === "needs_research";
}

export function shouldRenderAssertionReviewerGovernanceControls(
  role: AssertionReviewerGovernanceRole,
  reviewerState: EditorialAssertion["reviewerState"],
): boolean {
  return role === "publisher" && isAssertionReviewerGovernanceEligible(reviewerState);
}

export function createAssertionReviewerGovernanceIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("This browser cannot create a safe reviewer decision key.");
}

export function buildAssertionReviewerGovernancePayload(
  /** A story cluster id, or null for an Evidence Library decision. */
  clusterId: number | null,
  assertion: EditorialAssertion,
  action: AssertionReviewerGovernanceAction,
  reason: string,
  idempotencyKey: string,
): AssertionReviewerGovernancePayload {
  const trimmedReason = reason.trim();
  const trimmedKey = idempotencyKey.trim();
  if (clusterId !== null && (!Number.isInteger(clusterId) || clusterId < 1)) throw new Error("A selected cluster is required.");
  if (!ASSERTION_REVIEWER_GOVERNANCE_ACTIONS.includes(action)) throw new Error("This reviewer action is not supported.");
  if (!isAssertionReviewerGovernanceEligible(assertion.reviewerState)) {
    throw new Error("This assertion is no longer eligible for reviewer governance.");
  }
  if (!trimmedReason) throw new Error("A human reviewer reason is required.");
  if (trimmedReason.length > ASSERTION_REVIEWER_GOVERNANCE_REASON_MAX_LENGTH) {
    throw new Error("Reviewer reason must be 2,000 characters or fewer.");
  }
  if (!trimmedKey) throw new Error("A safe reviewer idempotency key is required.");
  const base = {
    assertionId: assertion.assertionId,
    action,
    expected: {
      admissionState: assertion.admissionState,
      reviewerState: assertion.reviewerState,
      freshnessState: assertion.freshnessState,
    },
    reason: trimmedReason,
    idempotencyKey: trimmedKey,
  };
  return clusterId === null ? { ...base, context: "evidence_library" } : { ...base, clusterId };
}

export function reviewerGovernanceDecisionMessage(
  response: AssertionReviewerGovernanceResponse,
): string {
  const decision = response.action === "accept_review"
    ? "Reviewer acceptance recorded. This accepts the assertion on the editorial review axis; it does not admit the assertion or mark it current."
    : "Reviewer rejection recorded. This does not delete the assertion or change its admission state.";
  const recalculation = response.recalculation.status === "queued"
    ? "The decision is durable; evidence recalculation remains queued."
    : response.recalculation.status === "replayed"
      ? "The original durable reviewer decision was safely replayed; no second review event occurred."
      : "Evidence recalculation completed.";
  return `${decision} ${recalculation}`;
}

export function reviewerGovernanceFailureMessage(
  status: number,
  code: string | undefined,
  fallback: string,
): string {
  if (status === 403) return "You do not have permission to record reviewer decisions.";
  if (status === 503) {
    return "The reviewer decision may already be durable, but recalculation could not be confirmed. Refresh the evidence before creating a different decision; keep the same request key for a cautious retry.";
  }
  switch (code) {
    case "state_conflict":
      return "This assertion changed since it was loaded. The reviewer draft was cleared and the evidence panel was refreshed; review the current state before deciding again.";
    case "invalid_transition":
      return "This assertion is no longer eligible for a reviewer decision. The evidence panel was refreshed.";
    case "idempotency_conflict":
      return "That reviewer request key was already used for a different action. The draft was cleared; start a new decision with a new key.";
    case "assertion_not_associated":
      return "This assertion is not associated with the selected cluster. The reviewer decision was not applied.";
    case "invalid_reason":
      return "Enter a non-blank reviewer reason of 2,000 characters or fewer.";
    case "assertion_story_linked":
      return "This assertion belongs to a story. Review it from that story's evidence panel.";
    case "source_missing":
      return "This assertion has no captured source version, so it cannot be admitted or accepted in the Evidence Library.";
    case "source_not_admitted":
      return "The assertion's source document is not admitted yet. Admit the source before admitting or accepting its assertions.";
    case "invalid_scope":
      return "A decision must be made either in a story or in the Evidence Library, not both.";
    default:
      return fallback;
  }
}

export function shouldRefreshReviewerEvidenceAfterFailure(code: string | undefined): boolean {
  return code === "state_conflict"
    || code === "invalid_transition"
    || code === "assertion_not_associated";
}

export function shouldRefreshReviewerPublishableClusters(
  response: AssertionReviewerGovernanceResponse,
): boolean {
  return response.publicationImpact === "may_change";
}
