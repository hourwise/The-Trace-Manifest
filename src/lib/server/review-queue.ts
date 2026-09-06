import {
  REVIEW_QUEUE_MAX_LIMIT,
  reviewQueueLimit,
  type ReviewQueueCluster,
  type ReviewQueuePublishableCluster,
  type ReviewQueueScope,
} from "../review-queue-contract";

type ReviewQueueDatabaseRow = Omit<ReviewQueueCluster, "needs_human_review" | "source_names"> & {
  needs_human_review: number | boolean;
};

type ReviewQueuePublishableDatabaseRow = Omit<ReviewQueuePublishableCluster, "source_names">;

interface ReviewQueueSourceNameRow {
  cluster_id: number;
  source_name: string;
  source_rank: number;
}

const REVIEW_QUEUE_FULL_SELECT = `
  SELECT sc.id, sc.title, sc.topic, sc.evidence_status, sc.publication_status,
         sc.needs_human_review, sc.created_at, sc.updated_at, sc.summary, sc.why_it_matters,
         sc.reviewed_by, sc.reviewed_at,
         (SELECT COUNT(*) FROM story_cluster_members WHERE cluster_id = sc.id) AS source_count
  FROM story_clusters sc
`;

const REVIEW_QUEUE_PUBLISHABLE_SELECT = `
  SELECT sc.id, sc.title, sc.topic, sc.publication_status,
         sc.created_at, sc.summary, sc.why_it_matters,
         (SELECT COUNT(*) FROM story_cluster_members WHERE cluster_id = sc.id) AS source_count
  FROM story_clusters sc
`;

function mapReviewQueueRow(row: ReviewQueueDatabaseRow): ReviewQueueCluster {
  return {
    ...row,
    needs_human_review: Boolean(row.needs_human_review),
    source_names: [],
  };
}

function mapPublishableRow(row: ReviewQueuePublishableDatabaseRow): ReviewQueuePublishableCluster {
  return { ...row, source_names: [] };
}

async function sourceNamesForClusters(db: D1Database, clusterIds: number[]): Promise<Map<number, string[]>> {
  if (clusterIds.length === 0) return new Map();

  const placeholders = clusterIds.map(() => "?").join(",");
  const result = await db.prepare(`
    WITH ranked_source_names AS (
      SELECT scm.cluster_id, s.name AS source_name,
             ROW_NUMBER() OVER (
               PARTITION BY scm.cluster_id
               ORDER BY MAX(scm.is_primary) DESC, s.tier ASC, s.id ASC
             ) AS source_rank
      FROM story_cluster_members scm
      JOIN feed_items fi ON scm.feed_item_id = fi.id
      JOIN sources s ON fi.source_id = s.id
      WHERE scm.cluster_id IN (${placeholders})
      GROUP BY scm.cluster_id, s.id, s.name, s.tier
    )
    SELECT cluster_id, source_name, source_rank
    FROM ranked_source_names
    WHERE source_rank <= 3
    ORDER BY cluster_id ASC, source_rank ASC
  `).bind(...clusterIds).all<ReviewQueueSourceNameRow>();

  const namesByCluster = new Map<number, string[]>();
  for (const row of result.results) {
    const names = namesByCluster.get(row.cluster_id) ?? [];
    names.push(row.source_name);
    namesByCluster.set(row.cluster_id, names);
  }
  return namesByCluster;
}

/**
 * The two queue scopes intentionally have different meanings:
 * pending-review is the human-review worklist and does not filter evidence;
 * publishable is the editorial publish selector and excludes blocked evidence.
 * updated_at/id makes both scopes deterministic without adding an index.
 */
export function listReviewQueueClusters(
  db: D1Database,
  options: { scope: "publishable"; limit?: number; includeSourceNames?: boolean },
): Promise<ReviewQueuePublishableCluster[]>;
export function listReviewQueueClusters(
  db: D1Database,
  options: { scope: "pending-review"; limit?: number; includeSourceNames?: boolean },
): Promise<ReviewQueueCluster[]>;
export function listReviewQueueClusters(
  db: D1Database,
  options: { scope: ReviewQueueScope; limit?: number; includeSourceNames?: boolean },
): Promise<ReviewQueueCluster[] | ReviewQueuePublishableCluster[]>;
export async function listReviewQueueClusters(
  db: D1Database,
  options: { scope: ReviewQueueScope; limit?: number; includeSourceNames?: boolean },
): Promise<ReviewQueueCluster[] | ReviewQueuePublishableCluster[]> {
  const { scope } = options;
  const limit = reviewQueueLimit(scope, options.limit);
  const predicate = scope === "pending-review"
    ? "sc.needs_human_review = 1 AND sc.publication_status IN ('draft','review')"
    : "sc.publication_status IN ('draft','review') AND sc.evidence_status NOT IN ('unverified','outdated','superseded')";

  const select = scope === "publishable" ? REVIEW_QUEUE_PUBLISHABLE_SELECT : REVIEW_QUEUE_FULL_SELECT;
  const result = await db.prepare(`
    ${select}
    WHERE ${predicate}
    ORDER BY sc.updated_at DESC, sc.id DESC
    LIMIT ?
  `).bind(limit).all<ReviewQueueDatabaseRow | ReviewQueuePublishableDatabaseRow>();

  const clusters = scope === "publishable"
    ? result.results.map((row) => mapPublishableRow(row as ReviewQueuePublishableDatabaseRow))
    : result.results.map((row) => mapReviewQueueRow(row as ReviewQueueDatabaseRow));
  const includeSourceNames = options.includeSourceNames ?? scope === "publishable";
  if (!includeSourceNames) return clusters;

  const namesByCluster = await sourceNamesForClusters(db, clusters.map((cluster) => cluster.id));
  return clusters.map((cluster) => ({ ...cluster, source_names: namesByCluster.get(cluster.id) ?? [] }));
}

export async function listRecentlyReviewedClusters(
  db: D1Database,
  limit = 20,
): Promise<ReviewQueueCluster[]> {
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 20, REVIEW_QUEUE_MAX_LIMIT));
  const result = await db.prepare(`
    ${REVIEW_QUEUE_FULL_SELECT}
    WHERE sc.reviewed_at IS NOT NULL
    ORDER BY sc.reviewed_at DESC, sc.id DESC
    LIMIT ?
  `).bind(boundedLimit).all<ReviewQueueDatabaseRow>();

  return result.results.map(mapReviewQueueRow);
}
