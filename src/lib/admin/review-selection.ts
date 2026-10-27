import type { ReviewQueueCluster } from "../review-queue-contract";

/**
 * D4: Pending Review opens the existing evidence and governance panels in an
 * explicit review mode. These helpers hold the rules the page relies on, so
 * they can be tested without a browser. They never decide publication: the
 * publishable query and the Worker's publish checks remain the authorities.
 */

export type ReviewSelectionMode = "publish" | "review";

/**
 * Evidence states the publishable query and the Worker publish path both
 * refuse (`review-queue.ts` predicate, `publish.ts` guard). Mirrored here only
 * to explain why a pending item cannot be published yet.
 */
export const PUBLICATION_BLOCKED_EVIDENCE = ["unverified", "outdated", "superseded"] as const;

const MAX_CLUSTER_ID = 2 ** 31 - 1;

/** A `?review=` value is a positive integer id, or nothing. */
export function parseReviewClusterId(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= MAX_CLUSTER_ID ? id : null;
}

export function isPublicationBlockedEvidence(status: string): boolean {
  return (PUBLICATION_BLOCKED_EVIDENCE as readonly string[]).includes(status);
}

/**
 * Publishing is possible only from publish mode, for a cluster the
 * publishable list returned. Selecting a pending item never qualifies it.
 */
export function canPublishSelection(
  mode: ReviewSelectionMode,
  selectedId: number | null,
  publishableIds: ReadonlySet<number>,
): boolean {
  return mode === "publish" && selectedId !== null && publishableIds.has(selectedId);
}

export interface PendingReviewGuidance {
  /** Short reasons this item is waiting for a human. */
  reasons: string[];
  /** The obvious next step. */
  nextAction: string;
  /** Whether evidence currently blocks publication. */
  publicationBlocked: boolean;
}

type PendingReviewItem = Pick<ReviewQueueCluster, "evidence_status" | "source_count" | "needs_human_review" | "publication_status">;

/** Another cluster sharing a source item (shape of source-conflicts.ts, kept browser-safe here). */
export interface SourceConflictView {
  clusterId: number;
  title: string;
  slug: string | null;
  publicationStatus: string;
  sharedItems: number;
}

export type ReviewQueueCategory = "needs-review" | "blocked-evidence" | "duplicate-source" | "published-overlap" | "retired-overlap";

const CATEGORY_LABELS: Record<ReviewQueueCategory, string> = {
  "needs-review": "Needs review",
  "blocked-evidence": "Blocked by evidence",
  "duplicate-source": "Duplicate source",
  "published-overlap": "Source already published",
  "retired-overlap": "Withdrawn or superseded history",
};

/**
 * Text categories for a pending card, so an editor can tell the kinds apart
 * without colour. Derived only from data the card already has; no queries.
 */
export function reviewQueueCategories(item: PendingReviewItem, conflicts: readonly SourceConflictView[] = []): Array<{ key: ReviewQueueCategory; label: string }> {
  const keys: ReviewQueueCategory[] = [];
  if (item.needs_human_review) keys.push("needs-review");
  if (isPublicationBlockedEvidence(item.evidence_status)) keys.push("blocked-evidence");
  if (conflicts.some((conflict) => conflict.publicationStatus === "draft" || conflict.publicationStatus === "review")) keys.push("duplicate-source");
  if (conflicts.some((conflict) => conflict.publicationStatus === "published")) keys.push("published-overlap");
  if (conflicts.some((conflict) => conflict.publicationStatus === "withdrawn" || conflict.publicationStatus === "superseded")) keys.push("retired-overlap");
  return keys.map((key) => ({ key, label: CATEGORY_LABELS[key] }));
}

/** One line describing a conflicting cluster, including what kind of relationship it is. */
export function sourceConflictText(conflict: SourceConflictView): string {
  const items = conflict.sharedItems === 1 ? "1 source item" : `${conflict.sharedItems} source items`;
  const state = conflict.publicationStatus === "published" ? "published story"
    : conflict.publicationStatus === "withdrawn" ? "withdrawn story"
      : conflict.publicationStatus === "superseded" ? "superseded story"
        : `${conflict.publicationStatus} cluster`;
  return `Shares ${items} with #${conflict.clusterId} “${conflict.title}” (${state}). This is the same source item, not just a similar headline.`;
}

export function pendingReviewGuidance(item: PendingReviewItem, conflicts: readonly SourceConflictView[] = []): PendingReviewGuidance {
  const reasons: string[] = [];
  if (item.needs_human_review) reasons.push("Flagged for human review");
  if (conflicts.length > 0) reasons.push(`Shares a source item with ${conflicts.length === 1 ? "another cluster" : `${conflicts.length} other clusters`}`);
  const blocked = isPublicationBlockedEvidence(item.evidence_status);
  if (blocked) reasons.push(`Evidence ${item.evidence_status.replace(/_/g, " ")}: not publication-eligible`);
  else if (item.evidence_status === "disputed") reasons.push("Evidence disputed");
  else if (["vendor_reported", "community_reported", "provisionally_supported"].includes(item.evidence_status)) {
    reasons.push(`Evidence ${item.evidence_status.replace(/_/g, " ")}`);
  }
  if (item.source_count === 0) reasons.push("No stored source items");
  else if (item.source_count === 1) reasons.push("Single source");
  const nextAction = item.source_count === 0
    ? "Inspect the cluster; it has no source items to review."
    : conflicts.length > 0
      ? "Compare it with the cluster(s) sharing its source and archive the duplicate before publishing either."
      : blocked
        ? "Review sources and claims. Publication stays blocked until the evidence status changes."
        : "Review sources and claims, then publish from the publishable list if it qualifies.";
  return { reasons, nextAction, publicationBlocked: blocked };
}

/** The page URL with `?review=` set or removed, keeping every other parameter and the hash. */
export function reviewSelectionUrl(current: string, clusterId: number | null): string {
  const url = new URL(current);
  if (clusterId === null) url.searchParams.delete("review");
  else url.searchParams.set("review", String(clusterId));
  return `${url.pathname}${url.search}${url.hash}`;
}
