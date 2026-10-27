// The Trace Manifest — Story Clustering
// Phase 3 Task 3: Groups classified feed items into story clusters
// Uses topic + entity overlap + title keyword similarity

import type { FeedItem } from "./types";
import { loadSourceMemberships, primarySourceKey } from "../../src/lib/server/source-identity";

/** Items considered per run; the rest wait for the next run (D1 read bound). */
export const CLUSTERING_ITEM_LIMIT = 200;
const ID_CHUNK = 90;

// ============================================================
// Types
// ============================================================
interface ClassifiedItem extends FeedItem {
  classification?: {
    topics: string[];
    models: string[];
    providers: string[];
    itemTypes: { type: string; score: number }[];
    classificationConfidence: number;
    classifiedAt: string;
    algorithmVersion: string;
  };
  source_tier?: string;
  source_treatment?: string;
}

interface ItemGroup {
  items: ClassifiedItem[];
  primaryTopic: string;
  sharedModels: Set<string>;
  sharedProviders: Set<string>;
}

// ============================================================
// Text helpers
// ============================================================
function tokenizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 2)
  );
}

function titleKeywordOverlap(a: string, b: string): number {
  const tokensA = tokenizeTitle(a);
  const tokensB = tokenizeTitle(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

// ============================================================
// Generate a cluster title from the member items
// ============================================================
function generateClusterTitle(items: ClassifiedItem[]): string {
  if (items.length === 1) return items[0].title;

  // Use the title of the item from the highest-tier source
  const tierPriority: Record<string, number> = { A: 3, B: 2, C: 1 };
  const sorted = [...items].sort((a, b) => {
    const aPrio = tierPriority[a.source_tier ?? "C"] ?? 0;
    const bPrio = tierPriority[b.source_tier ?? "C"] ?? 0;
    if (bPrio !== aPrio) return bPrio - aPrio;
    // Fallback: longest title (often most descriptive)
    return b.title.length - a.title.length;
  });

  return sorted[0].title;
}

// ============================================================
// Determine initial evidence status from source tiers
// ============================================================
function initialEvidenceStatus(items: ClassifiedItem[]): string {
  const tiers = items.map((i) => i.source_tier);
  const treatments = items.map((i) => i.source_treatment);

  const hasPrimaryTech = tiers.includes("A") && treatments.some((t) => t?.includes("primary"));
  const hasVendorClaim = treatments.some((t) => t?.includes("vendor"));
  const hasCommunity = tiers.includes("C");

  if (hasPrimaryTech && items.length >= 2) return "provisionally_supported";
  if (hasPrimaryTech) return "vendor_reported";
  if (hasVendorClaim && !hasPrimaryTech) return "vendor_reported";
  if (hasCommunity && !hasPrimaryTech && !hasVendorClaim) return "community_reported";
  return "unverified";
}

// ============================================================
// Determine if cluster needs human review
// ============================================================
function needsHumanReview(items: ClassifiedItem[]): boolean {
  const tiers = items.map((i) => i.source_tier);
  // Only Tier C sources → flag for review
  if (tiers.every((t) => t === "C")) return true;
  // Single source → flag
  if (items.length === 1 && tiers[0] !== "A") return true;
  // Conflicts in evidence types
  const treatments = new Set(items.map((i) => i.source_treatment));
  if (treatments.has("vendor-reported") && treatments.has("primary-research")) return true;
  return false;
}

// ============================================================
// Main clustering function
// ============================================================
export interface ClusteringResult {
  processed: number;
  clusters: number;
  /** Items already in a cluster (for example promoted from TRACE Desk): marked clustered, not re-clustered. */
  alreadyClustered: number;
  /** Groups not written because their primary source gained a cluster concurrently. */
  identityConflicts: number;
}

export async function runClustering(
  db: D1Database
): Promise<ClusteringResult> {
  // Fetch classified items with source info, oldest first, bounded per run
  const { results } = await db.prepare(
    `SELECT fi.*, s.tier as source_tier, s.treatment as source_treatment
     FROM feed_items fi
     JOIN sources s ON fi.source_id = s.id
     WHERE fi.ingestion_status = 'classified'
     AND fi.fetched_at >= datetime('now', '-3 days')
     ORDER BY fi.fetched_at ASC
     LIMIT ?`
  ).bind(CLUSTERING_ITEM_LIMIT).all<ClassifiedItem & { source_tier: string; source_treatment: string }>();

  if (!results || results.length === 0) {
    return { processed: 0, clusters: 0, alreadyClustered: 0, identityConflicts: 0 };
  }

  // Stage 0 (TRACE-EDITORIAL-DEDUPE-R1): an item that already belongs to a
  // cluster is the same source item, whichever pipeline linked it. It is never
  // clustered again (that created the promotion/ingestion duplicate pairs);
  // its status is repaired to 'clustered' instead.
  const memberships = await loadSourceMemberships(db, results.map((row) => row.id));
  const linkedIds = results.filter((row) => memberships.has(row.id)).map((row) => row.id);
  for (let start = 0; start < linkedIds.length; start += ID_CHUNK) {
    const chunk = linkedIds.slice(start, start + ID_CHUNK);
    await db.prepare(
      `UPDATE feed_items SET ingestion_status = 'clustered'
       WHERE id IN (${chunk.map(() => "?").join(", ")}) AND ingestion_status = 'classified'`
    ).bind(...chunk).run();
  }

  // Parse classification metadata
  const items: ClassifiedItem[] = results.filter((row) => !memberships.has(row.id)).map((row) => {
    let classification: ClassifiedItem["classification"];
    try {
      if (row.raw_metadata) {
        const meta = JSON.parse(row.raw_metadata);
        classification = meta.classification;
      }
    } catch { /* ignore parse errors */ }
    return {
      ...row,
      classification,
      source_tier: row.source_tier,
      source_treatment: row.source_treatment,
    };
  });

  // Stage 1: Group by primary topic
  const topicGroups = new Map<string, ClassifiedItem[]>();
  for (const item of items) {
    const primaryTopic = item.classification?.topics?.[0] ?? "general";
    if (!topicGroups.has(primaryTopic)) {
      topicGroups.set(primaryTopic, []);
    }
    topicGroups.get(primaryTopic)!.push(item);
  }

  // Stage 2: Within each topic group, cluster by entity overlap + title similarity
  const clusters: ItemGroup[] = [];

  for (const [topic, topicItems] of topicGroups) {
    const remaining = [...topicItems];

    while (remaining.length > 0) {
      const seed = remaining.shift()!;
      const group: ClassifiedItem[] = [seed];
      const sharedModels = new Set(seed.classification?.models ?? []);
      const sharedProviders = new Set(seed.classification?.providers ?? []);

      // Find all items that overlap with the growing group
      let added = true;
      while (added) {
        added = false;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const candidate = remaining[i];
          let shouldJoin = false;

          // Check 1: Entity overlap (strongest signal)
          const candModels = new Set(candidate.classification?.models ?? []);
          const candProviders = new Set(candidate.classification?.providers ?? []);
          const modelOverlap = [...candModels].some((m) => sharedModels.has(m));
          const providerOverlap = [...candProviders].some((p) => sharedProviders.has(p));

          if (modelOverlap || providerOverlap) {
            shouldJoin = true;
          }

          // Check 2: Title keyword overlap with any member
          if (!shouldJoin) {
            for (const member of group) {
              if (titleKeywordOverlap(member.title, candidate.title) >= 0.35) {
                shouldJoin = true;
                break;
              }
            }
          }

          // Check 3: Overlapping item types + high title overlap
          if (!shouldJoin) {
            const seedTypes = new Set((seed.classification?.itemTypes ?? []).map(t => t.type));
            const candTypes = new Set((candidate.classification?.itemTypes ?? []).map(t => t.type));
            const typeOverlap = [...seedTypes].some(t => candTypes.has(t));
            if (typeOverlap && titleKeywordOverlap(seed.title, candidate.title) >= 0.3) {
              shouldJoin = true;
            }
          }

          if (shouldJoin) {
            group.push(candidate);
            // Expand entity sets
            candModels.forEach((m) => sharedModels.add(m));
            candProviders.forEach((p) => sharedProviders.add(p));
            remaining.splice(i, 1);
            added = true;
          }
        }
      }

      clusters.push({
        items: group,
        primaryTopic: topic,
        sharedModels,
        sharedProviders,
      });
    }
  }

  // Stage 3: Write clusters to DB. Each cluster is one atomic batch: a failure
  // part-way used to leave an empty cluster with its items still 'classified',
  // so the next run clustered them again (Production clusters 2146/2150).
  let clustersCreated = 0;
  let identityConflicts = 0;

  for (const group of clusters) {
    if (group.items.length === 0) continue;

    const clusterTitle = generateClusterTitle(group.items);
    const evidenceStatus = initialEvidenceStatus(group.items);
    const requiresReview = needsHumanReview(group.items);
    const confidence = calculateClusterConfidence(group);

    // Find canonical URL (prefer first Tier A source)
    const primaryItem =
      group.items.find((i) => i.source_tier === "A") ??
      group.items[0];
    // The unique primary_source_key fails this batch if a promotion seeded a
    // cluster from the same primary source since the membership read.
    const sourceKey = primarySourceKey(primaryItem.url_hash);

    const statements: D1PreparedStatement[] = [
      db.prepare(
        `INSERT INTO story_clusters
         (title, canonical_url, topic, source_class, evidence_status, confidence_score, published_at, needs_human_review, primary_source_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        clusterTitle,
        primaryItem.url,
        group.primaryTopic,
        getSourceClass(group.items),
        evidenceStatus,
        confidence,
        primaryItem.published_at ?? primaryItem.fetched_at,
        requiresReview ? 1 : 0,
        sourceKey,
      ),
      // Members, each skipped if another cluster took the item meanwhile.
      ...group.items.map((item) => db.prepare(
        `INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
         SELECT cluster.id, ?, ? FROM story_clusters cluster
         WHERE cluster.primary_source_key = ?
           AND NOT EXISTS (SELECT 1 FROM story_cluster_members existing WHERE existing.feed_item_id = ?)`
      ).bind(item.id, item.id === primaryItem.id ? 1 : 0, sourceKey, item.id)),
    ];
    // Status follows membership, so an item linked elsewhere is also settled.
    const groupIds = group.items.map((item) => item.id);
    for (let start = 0; start < groupIds.length; start += ID_CHUNK) {
      const chunk = groupIds.slice(start, start + ID_CHUNK);
      statements.push(db.prepare(
        `UPDATE feed_items SET ingestion_status = 'clustered'
         WHERE id IN (${chunk.map(() => "?").join(", ")}) AND ingestion_status = 'classified'
           AND EXISTS (SELECT 1 FROM story_cluster_members member WHERE member.feed_item_id = feed_items.id)`
      ).bind(...chunk));
    }
    // Never leave an empty cluster behind if every member was taken meanwhile.
    statements.push(db.prepare(
      `DELETE FROM story_clusters WHERE primary_source_key = ?
         AND NOT EXISTS (SELECT 1 FROM story_cluster_members member WHERE member.cluster_id = story_clusters.id)`
    ).bind(sourceKey));

    try {
      const written = await db.batch(statements);
      // D1 counts trigger-written rows, so "changed" means "> 0".
      if (Number(written[written.length - 1]?.meta?.changes ?? 0) === 0) clustersCreated++;
    } catch (error) {
      if (!/UNIQUE constraint failed: story_clusters\.primary_source_key/.test(String(error))) throw error;
      // Rolled back whole; the items stay 'classified' and the next run's Stage 0 settles them.
      identityConflicts++;
    }
  }

  return { processed: items.length, clusters: clustersCreated, alreadyClustered: linkedIds.length, identityConflicts };
}

// ============================================================
// Helpers
// ============================================================
function getSourceClass(items: ClassifiedItem[]): string {
  const classes = new Set(items.map((i) => i.source_treatment));
  if (classes.has("primary-technical") || classes.has("primary-research")) return "primary";
  if (classes.has("vendor-reported")) return "vendor";
  if (classes.has("discovery")) return "community";
  return "mixed";
}

function calculateClusterConfidence(group: ItemGroup): number {
  // More sources + primary sources = higher confidence
  const sourceBonus = Math.min(group.items.length * 8, 40);
  const hasPrimary = group.items.some((i) =>
    i.source_treatment?.includes("primary")
  );
  const primaryBonus = hasPrimary ? 25 : 0;
  const multiSourceBonus = group.items.length >= 3 ? 15 : 0;
  const baseConfidence = group.items[0]?.classification?.classificationConfidence ?? 50;
  return Math.min(100, Math.round(baseConfidence * 0.4 + sourceBonus + primaryBonus + multiSourceBonus));
}
