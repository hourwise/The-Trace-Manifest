import type { EditorialAssertion } from "../editorial-evidence-contract";

export const ASSERTION_GOVERNANCE_REASON_MAX_LENGTH = 2_000;
export const ASSERTION_GOVERNANCE_ACTIONS = ["admit", "reject"] as const;
export type AssertionGovernanceAction = typeof ASSERTION_GOVERNANCE_ACTIONS[number];
export type AssertionGovernanceRole = "reader" | "publisher";

export interface AssertionGovernanceExpectedState {
  admissionState: EditorialAssertion["admissionState"];
  reviewerState: EditorialAssertion["reviewerState"];
  freshnessState: EditorialAssertion["freshnessState"];
}

export interface AssertionGovernancePayload {
  clusterId: number;
  assertionId: string;
  action: AssertionGovernanceAction;
  expected: AssertionGovernanceExpectedState;
  reason: string;
  idempotencyKey: string;
}

export interface AssertionGovernanceResponse {
  success: true;
  requestId?: string;
  eventId?: string;
  action: AssertionGovernanceAction;
  recalculation: {
    status: "completed" | "queued" | "replayed";
    jobId?: string;
  };
  publicationImpact: "unchanged" | "may_change";
  replay: boolean;
}

export interface AssertionGovernanceErrorBody {
  error?: string;
  code?: string;
  requestId?: string;
  eventId?: string;
}

export function isAssertionGovernanceEligible(
  admissionState: EditorialAssertion["admissionState"],
): boolean {
  return admissionState === "pending" || admissionState === "quarantined";
}

export function shouldRenderAssertionGovernanceControls(
  role: AssertionGovernanceRole,
  admissionState: EditorialAssertion["admissionState"],
): boolean {
  return role === "publisher" && isAssertionGovernanceEligible(admissionState);
}

export function createAssertionGovernanceIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("This browser cannot create a safe idempotency key.");
}

export function buildAssertionGovernancePayload(
  clusterId: number,
  assertion: EditorialAssertion,
  action: AssertionGovernanceAction,
  reason: string,
  idempotencyKey: string,
): AssertionGovernancePayload {
  const trimmedReason = reason.trim();
  const trimmedKey = idempotencyKey.trim();
  if (!Number.isInteger(clusterId) || clusterId < 1) throw new Error("A selected cluster is required.");
  if (!isAssertionGovernanceEligible(assertion.admissionState)) {
    throw new Error("This assertion is no longer eligible for admission governance.");
  }
  if (!trimmedReason) throw new Error("A human reason is required.");
  if (trimmedReason.length > ASSERTION_GOVERNANCE_REASON_MAX_LENGTH) {
    throw new Error("Reason must be 2,000 characters or fewer.");
  }
  if (!trimmedKey) throw new Error("A safe idempotency key is required.");
  return {
    clusterId,
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
}

export function governanceDecisionMessage(
  response: AssertionGovernanceResponse,
): string {
  const actionLabel = response.action === "admit" ? "Admission" : "Rejection";
  const layerExplanation = response.action === "admit"
    ? "This does not automatically mark the assertion editorially accepted or current."
    : "This is an admission-layer decision; it does not delete or rewrite assertion history.";
  const recalculation = response.recalculation.status === "queued"
    ? "Evidence recalculation is queued and is not yet complete."
    : response.recalculation.status === "replayed"
      ? "The same durable decision was replayed safely."
      : "Evidence recalculation completed.";
  return `${actionLabel} recorded. ${recalculation} ${layerExplanation}`;
}

export function governanceFailureMessage(
  status: number,
  code: string | undefined,
  fallback: string,
): string {
  if (status === 403) return "You do not have permission to govern assertion admission.";
  if (status === 503) {
    return "The decision may have been recorded, but recalculation could not be confirmed. Keep the same request key; do not submit a new decision blindly.";
  }
  switch (code) {
    case "state_conflict":
      return "This assertion changed since it was loaded. The evidence panel was refreshed; review its current state before deciding again.";
    case "idempotency_conflict":
      return "That request key was already used for a different action. The draft was reset; start a new decision with a new key.";
    case "invalid_transition":
      return "This assertion is no longer eligible for admission or rejection. The evidence panel was refreshed.";
    case "assertion_not_associated":
      return "This assertion is not associated with the selected cluster. The action was not applied.";
    case "invalid_reason":
      return "Enter a non-blank reason of 2,000 characters or fewer.";
    default:
      return fallback;
  }
}

export function shouldRefreshPublishableClusters(
  response: AssertionGovernanceResponse,
): boolean {
  return response.publicationImpact === "may_change";
}

export function shouldRefreshEvidenceAfterFailure(code: string | undefined): boolean {
  return code === "state_conflict"
    || code === "invalid_transition"
    || code === "assertion_not_associated";
}
