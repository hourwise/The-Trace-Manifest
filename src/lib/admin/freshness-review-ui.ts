export const FRESHNESS_REVIEW_NOTE_MAX_LENGTH = 2_000;
export const FRESHNESS_DECISIONS = ["approve", "reject"] as const;
export type FreshnessDecision = typeof FRESHNESS_DECISIONS[number];

export interface FreshnessDecisionPayload {
  operation: FreshnessDecision;
  reviewId: string;
  reviewNote?: string;
}

/**
 * Approval keeps its optional audit note. A rejection closes the review for
 * good, so it needs a human reason, as every assertion governance decision does.
 */
export function buildFreshnessDecisionPayload(operation: FreshnessDecision, reviewId: string, note: string): FreshnessDecisionPayload {
  if (!FRESHNESS_DECISIONS.includes(operation)) throw new Error("Unknown freshness decision.");
  const trimmedId = reviewId.trim();
  const trimmedNote = note.trim();
  if (!trimmedId) throw new Error("A freshness review is required.");
  if (operation === "reject" && !trimmedNote) throw new Error("A rejection reason is required.");
  if (trimmedNote.length > FRESHNESS_REVIEW_NOTE_MAX_LENGTH) throw new Error("The note must be 2,000 characters or fewer.");
  return { operation, reviewId: trimmedId, ...(trimmedNote ? { reviewNote: trimmedNote } : {}) };
}
