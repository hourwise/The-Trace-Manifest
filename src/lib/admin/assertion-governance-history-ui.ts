import type { AssertionGovernanceHistoryEvent } from "../server/assertion-governance-history";

function displayState(value: string | null | undefined): string {
  return (value ?? "not recorded").replaceAll("_", " ");
}

/** The one-line transition label for a governance history event, on any axis. */
export function governanceHistoryTransitionLabel(event: Pick<AssertionGovernanceHistoryEvent, "axis" | "previous" | "current">): string {
  switch (event.axis) {
    case "admission":
      return `Admission: ${displayState(event.previous.admissionState)} → ${displayState(event.current.admissionState)}`;
    case "freshness":
      return `Freshness: ${displayState(event.previous.freshnessState)} → ${displayState(event.current.freshnessState)}`;
    default:
      return `Editorial review: ${displayState(event.previous.reviewerState)} → ${displayState(event.current.reviewerState)}`;
  }
}

/** Where a decision was made, for display alongside the event. */
export function governanceHistoryContextLabel(event: Pick<AssertionGovernanceHistoryEvent, "context" | "clusterId">): string {
  return event.context === "evidence_library" ? "Evidence Library" : `Story ${event.clusterId}`;
}
