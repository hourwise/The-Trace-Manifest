/**
 * KC-07E status-change approval policy.
 *
 * Score snapshots may be produced automatically, but a material status
 * transition must remain a proposed change until an authenticated publisher
 * approves it. Low-risk intermediate metadata bands can continue to update
 * during recalculation.
 */

export const HIGH_IMPACT_EVIDENCE_STATUSES = new Set([
  "confirmed",
  "strongly_supported",
  "disputed",
  "corrected",
  "superseded",
]);

export function requiresHumanStatusApproval(previousStatus: string, proposedStatus: string): boolean {
  if (previousStatus === proposedStatus) return false;
  return HIGH_IMPACT_EVIDENCE_STATUSES.has(previousStatus)
    || HIGH_IMPACT_EVIDENCE_STATUSES.has(proposedStatus);
}

export type EvidenceApprovalDecision = "approve" | "reject";
