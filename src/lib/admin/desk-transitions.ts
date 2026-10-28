/**
 * TRACE Desk candidate state machine. The page checks every transition here
 * before `transitionCandidate` writes it (publisher-only, state-guarded and
 * audited in one batch). Promotion to `published` is never a transition: it
 * goes through `promoteCandidate`, which applies the source-identity rules.
 *
 * `held` is entered only by intake that quarantines a candidate (the local
 * news importer holds a URL that already belongs to a story cluster). An
 * editor releases it to `needs_review`, where promotion reuses or refuses the
 * existing cluster, or rejects it. Nothing in the Desk moves a candidate into
 * `held`.
 */

/** States the Desk can move a candidate into. */
export const DESK_TARGET_STATES = ["new", "drafting", "draft_ready", "needs_review", "published", "rejected", "archived"] as const;

export const DESK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  new: ["drafting", "rejected"],
  drafting: ["draft_ready", "rejected"],
  draft_ready: ["needs_review", "drafting", "rejected"],
  needs_review: ["draft_ready", "rejected"], // "published" only via Promote
  held: ["needs_review", "rejected"],
  published: ["draft_ready", "archived"],
  rejected: ["new"],
  archived: [],
};

/** Candidates still awaiting an editorial decision; the Desk shows their source notices. */
export const DESK_OPEN_STATES: ReadonlySet<string> = new Set(["new", "drafting", "draft_ready", "needs_review", "held"]);

export const DESK_STATE_LABELS: Readonly<Record<string, string>> = {
  new: "New", drafting: "Drafting", draft_ready: "Draft ready", needs_review: "Needs review",
  held: "Held", published: "Published", rejected: "Rejected", archived: "Archived",
};

export function deskTransitionAllowed(fromState: string, toState: string): boolean {
  return (DESK_TARGET_STATES as readonly string[]).includes(toState) && (DESK_TRANSITIONS[fromState]?.includes(toState) ?? false);
}
