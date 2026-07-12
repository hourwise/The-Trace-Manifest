// The Trace Manifest — Story Clustering
// Phase 3 Task 3: Groups classified feed items into story clusters
// Uses topic + entity overlap + title keyword similarity

import type { FeedItem } from "./types";

// ============================================================
// Types
// ============================================================
interface ClassifiedItem extends FeedItem {
  classification?: {
    topics: string[];
    models: string[];
    providers: string[];
    itemType: string | null;
    confidence: number;
    classifiedAt: string;
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
export async function runClustering(
  db: D1Database
): Promise<{ processed: number; clusters: number }> {
  // Fetch classified items with source info, ordered by topic then time
  const { results } = await db.prepare(
    `SELECT fi.*, s.tier as source_tier, s.treatment as source_treatment
     FROM feed_items fi
     JOIN sources s ON fi.source_id = s.id
     WHERE fi.ingestion_status = 'classified'
     AND fi.fetched_at >= datetime('now', '-3 days')
     ORDER BY fi.fetched_at ASC`
  ).all<ClassifiedItem & { source_tier: string; source_treatment: string }>();

  if (!results || results.length === 0) {
    return { processed: 0, clusters: 0 };
  }

  // Parse classification metadata
  const items: ClassifiedItem[] = results.map((row) => {
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

          // Check 3: Same item type + high title overlap
          if (!shouldJoin) {
            const sameType =
              seed.classification?.itemType &&
              candidate.classification?.itemType &&
              seed.classification.itemType === candidate.classification.itemType;
            if (sameType && titleKeywordOverlap(seed.title, candidate.title) >= 0.3) {
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

  // Stage 3: Write clusters to DB
  let clustersCreated = 0;

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

    // Insert cluster
    const { meta: clusterMeta } = await db.prepare(
      `INSERT INTO story_clusters
       (title, canonical_url, topic, source_class, evidence_status, confidence_score, published_at, needs_human_review)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      clusterTitle,
      primaryItem.url,
      group.primaryTopic,
      getSourceClass(group.items),
      evidenceStatus,
      confidence,
      primaryItem.published_at ?? primaryItem.fetched_at,
      requiresReview ? 1 : 0
    ).run();

    const clusterId = clusterMeta.last_row_id;

    // Insert members
    for (const item of group.items) {
      await db.prepare(
        `INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
         VALUES (?, ?, ?)`
      ).bind(clusterId, item.id, item.id === primaryItem.id ? 1 : 0).run();

      // Update item status
      await db.prepare(
        `UPDATE feed_items SET ingestion_status = 'clustered' WHERE id = ?`
      ).bind(item.id).run();
    }

    clustersCreated++;
  }

  return { processed: items.length, clusters: clustersCreated };
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
  const baseConfidence = group.items[0]?.classification?.confidence ?? 50;
  return Math.min(100, Math.round(baseConfidence * 0.4 + sourceBonus + primaryBonus + multiSourceBonus));
}
