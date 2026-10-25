// TRACE-EDITORIAL-DEDUPE-R1: one source identity for every pipeline that
// creates story clusters (automated clustering and Desk promotion).
//
// "Same source item" means the same feed_items row, keyed by url_hash: the
// SHA-256 of the canonical URL below. The canonicalisation must not change
// without re-keying existing rows, or the same article would get a second
// feed item. Different URLs for the same release, several articles about one
// event, and follow-ups are NOT the same source item: they are never merged
// automatically. Headline similarity is not identity.

const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source", "fbclid", "gclid"];
const RETIRED_STATUSES = new Set(["withdrawn", "superseded"]);
/** D1 rejects more than 100 bound parameters per statement. */
const MEMBERSHIP_CHUNK = 90;

/** Canonical form used for url_hash. Unparseable input is returned unchanged, as ingestion always did. */
export function canonicalSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const param of TRACKING_PARAMS) parsed.searchParams.delete(param);
    let normalized = parsed.toString();
    if (normalized.endsWith("/") && !parsed.pathname.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return url;
  }
}

export async function sourceUrlHash(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSourceUrl(url)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** story_clusters.primary_source_key for a cluster seeded by the item with this url_hash. */
export function primarySourceKey(urlHash: string): string {
  return `src:${urlHash}`;
}

export interface SourceMembership {
  feedItemId: number;
  clusterId: number;
  publicationStatus: string;
  title: string;
}

export type SourceRelationship =
  /** No cluster holds this source item: a new cluster may be created. */
  | { kind: "new" }
  /** Exactly one current (non-retired) cluster holds it: reuse it, never create another. */
  | { kind: "exact"; cluster: SourceMembership; retired: SourceMembership[] }
  /** Only withdrawn or superseded clusters hold it: never resurrect silently; a human decides. */
  | { kind: "retired"; retired: SourceMembership[] }
  /** Two or more current clusters hold it (historical duplication): a human decides. */
  | { kind: "ambiguous"; clusters: SourceMembership[] };

export function classifySourceRelationship(memberships: readonly SourceMembership[]): SourceRelationship {
  const byCluster = new Map<number, SourceMembership>();
  for (const membership of memberships) byCluster.set(membership.clusterId, membership);
  const all = [...byCluster.values()].sort((a, b) => a.clusterId - b.clusterId);
  if (all.length === 0) return { kind: "new" };
  const current = all.filter((membership) => !RETIRED_STATUSES.has(membership.publicationStatus));
  const retired = all.filter((membership) => RETIRED_STATUSES.has(membership.publicationStatus));
  if (current.length === 0) return { kind: "retired", retired };
  if (current.length === 1) return { kind: "exact", cluster: current[0], retired };
  return { kind: "ambiguous", clusters: current };
}

/**
 * Cluster memberships of the given feed items: one indexed statement per 90
 * ids (story_cluster_members(feed_item_id, …), migrations 0069/0077), each
 * capped at 4 rows per id.
 */
export async function loadSourceMemberships(db: D1Database, feedItemIds: readonly number[]): Promise<Map<number, SourceMembership[]>> {
  const ids = [...new Set(feedItemIds.filter((id) => Number.isInteger(id) && id > 0))];
  const memberships = new Map<number, SourceMembership[]>();
  for (let start = 0; start < ids.length; start += MEMBERSHIP_CHUNK) {
    const chunk = ids.slice(start, start + MEMBERSHIP_CHUNK);
    const { results } = await db.prepare(`
      SELECT member.feed_item_id, member.cluster_id, cluster.publication_status, cluster.title
      FROM story_cluster_members member
      JOIN story_clusters cluster ON cluster.id = member.cluster_id
      WHERE member.feed_item_id IN (${chunk.map(() => "?").join(", ")})
      ORDER BY member.feed_item_id, member.cluster_id
      LIMIT ?
    `).bind(...chunk, chunk.length * 4).all<{ feed_item_id: number; cluster_id: number; publication_status: string; title: string }>();
    for (const row of results ?? []) {
      const list = memberships.get(row.feed_item_id) ?? [];
      list.push({ feedItemId: row.feed_item_id, clusterId: row.cluster_id, publicationStatus: row.publication_status, title: row.title });
      memberships.set(row.feed_item_id, list);
    }
  }
  return memberships;
}

/** The feed item for a canonical URL hash, if ingestion or a promotion already stored it. */
export async function findFeedItemByUrlHash(db: D1Database, urlHash: string): Promise<{ id: number; ingestionStatus: string } | null> {
  const row = await db.prepare("SELECT id, ingestion_status FROM feed_items WHERE url_hash = ? LIMIT 1")
    .bind(urlHash).first<{ id: number; ingestion_status: string }>();
  return row ? { id: row.id, ingestionStatus: row.ingestion_status } : null;
}
