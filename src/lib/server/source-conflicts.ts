// Reviewer-visible duplicate-source information (TRACE-RESTORE-01 Task C).
// Read-only: a warning never merges, approves or publishes anything. The
// identity rules come from source-identity.ts (TRACE-EDITORIAL-DEDUPE-R1).

import {
  classifySourceRelationship,
  loadSourceMemberships,
  sourceUrlHash,
  type SourceRelationship,
} from "./source-identity";

/** D1 rejects more than 100 bound parameters per statement. */
const CHUNK = 90;

export interface ClusterSourceConflict {
  /** The other cluster that holds one of this cluster's source items. */
  clusterId: number;
  title: string;
  slug: string | null;
  publicationStatus: string;
  sharedItems: number;
}

/**
 * Other clusters sharing a source item with each given cluster: one statement
 * per 90 ids, using the members primary key for this side and the reverse
 * membership index (0069/0077) for the other, capped at 6 rows per cluster.
 */
export async function loadClusterSourceConflicts(db: D1Database, clusterIds: readonly number[]): Promise<Map<number, ClusterSourceConflict[]>> {
  const ids = [...new Set(clusterIds.filter((id) => Number.isInteger(id) && id > 0))];
  const conflicts = new Map<number, ClusterSourceConflict[]>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    const { results } = await db.prepare(`
      SELECT mine.cluster_id AS cluster_id, theirs.cluster_id AS other_id, other.title, other.slug,
             other.publication_status, COUNT(*) AS shared_items
      FROM story_cluster_members mine
      JOIN story_cluster_members theirs ON theirs.feed_item_id = mine.feed_item_id AND theirs.cluster_id <> mine.cluster_id
      JOIN story_clusters other ON other.id = theirs.cluster_id
      WHERE mine.cluster_id IN (${chunk.map(() => "?").join(", ")})
      GROUP BY mine.cluster_id, theirs.cluster_id
      ORDER BY mine.cluster_id, theirs.cluster_id
      LIMIT ?
    `).bind(...chunk, chunk.length * 6).all<{
      cluster_id: number; other_id: number; title: string; slug: string | null; publication_status: string; shared_items: number;
    }>();
    for (const row of results ?? []) {
      const list = conflicts.get(row.cluster_id) ?? [];
      list.push({ clusterId: row.other_id, title: row.title, slug: row.slug, publicationStatus: row.publication_status, sharedItems: Number(row.shared_items) });
      conflicts.set(row.cluster_id, list);
    }
  }
  return conflicts;
}

/**
 * How each candidate's URL relates to existing clusters, using exactly the
 * rules promotion applies: one url_hash lookup per 90 candidates, then the
 * shared membership read. Candidates without a URL are omitted.
 */
export async function loadCandidateSourceRelationships(
  db: D1Database,
  candidates: ReadonlyArray<{ id: string; submittedUrl: string | null }>,
): Promise<Map<string, SourceRelationship>> {
  const hashed = await Promise.all(candidates.filter((candidate) => candidate.submittedUrl)
    .map(async (candidate) => ({ id: candidate.id, hash: await sourceUrlHash(candidate.submittedUrl!) })));
  const itemByHash = new Map<string, number>();
  const hashes = [...new Set(hashed.map((entry) => entry.hash))];
  for (let start = 0; start < hashes.length; start += CHUNK) {
    const chunk = hashes.slice(start, start + CHUNK);
    const { results } = await db.prepare(`
      SELECT id, url_hash FROM feed_items WHERE url_hash IN (${chunk.map(() => "?").join(", ")}) LIMIT ?
    `).bind(...chunk, chunk.length).all<{ id: number; url_hash: string }>();
    for (const row of results ?? []) itemByHash.set(row.url_hash, row.id);
  }
  const memberships = await loadSourceMemberships(db, [...itemByHash.values()]);
  const relationships = new Map<string, SourceRelationship>();
  for (const entry of hashed) {
    const itemId = itemByHash.get(entry.hash);
    relationships.set(entry.id, classifySourceRelationship(itemId === undefined ? [] : memberships.get(itemId) ?? []));
  }
  return relationships;
}
