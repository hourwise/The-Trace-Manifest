import {
  REVIEW_QUEUE_MAX_LIMIT,
  reviewQueueLimit,
  type ReviewQueueCluster,
  type ReviewQueueScope,
} from "../review-queue-contract";

type ReviewQueueDatabaseRow = Omit<ReviewQueueCluster, "needs_human_review"> & {
  needs_human_review: number | boolean;
};

const REVIEW_QUEUE_SELECT = `
  SELECT sc.id, sc.title, sc.topic, sc.evidence_status, sc.publication_status,
         sc.needs_human_review, sc.created_at, sc.updated_at, sc.summary, sc.why_it_matters,
         sc.reviewed_by, sc.reviewed_at,
         (SELECT COUNT(*) FROM story_cluster_members WHERE cluster_id = sc.id) AS source_count
  FROM story_clusters sc
`;

function mapReviewQueueRow(row: ReviewQueueDatabaseRow): ReviewQueueCluster {
  return {
    ...row,
    needs_human_review: Boolean(row.needs_human_review),
  };
}

/**
 * The two queue scopes intentionally have different meanings:
 * pending-review is the human-review worklist and does not filter evidence;
 * publishable is the editorial publish selector and excludes blocked evidence.
 * updated_at/id makes both scopes deterministic without adding an index.
 */
export async function listReviewQueueClusters(
  db: D1Database,
  options: { scope: ReviewQueueScope; limit?: number },
): Promise<ReviewQueueCluster[]> {
  const { scope } = options;
  const limit = reviewQueueLimit(scope, options.limit);
  const predicate = scope === "pending-review"
    ? "sc.needs_human_review = 1 AND sc.publication_status IN ('draft','review')"
    : "sc.publication_status IN ('draft','review') AND sc.evidence_status NOT IN ('unverified','outdated','superseded')";

  const result = await db.prepare(`
    ${REVIEW_QUEUE_SELECT}
    WHERE ${predicate}
    ORDER BY sc.updated_at DESC, sc.id DESC
    LIMIT ?
  `).bind(limit).all<ReviewQueueDatabaseRow>();

  return result.results.map(mapReviewQueueRow);
}

export async function listRecentlyReviewedClusters(
  db: D1Database,
  limit = 20,
): Promise<ReviewQueueCluster[]> {
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 20, REVIEW_QUEUE_MAX_LIMIT));
  const result = await db.prepare(`
    ${REVIEW_QUEUE_SELECT}
    WHERE sc.reviewed_at IS NOT NULL
    ORDER BY sc.reviewed_at DESC, sc.id DESC
    LIMIT ?
  `).bind(boundedLimit).all<ReviewQueueDatabaseRow>();

  return result.results.map(mapReviewQueueRow);
}
