// ADR 0004/0017: Find related feed items for a story cluster.
// Searches the ingested item pool for matches on title, topic, source,
// and entity overlap. Returns ranked suggestions for editor review.
// Publisher-only, used by the review page "Find Related Coverage" action.

import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../security/access-auth";

export const prerender = false;

interface RelatedItem {
  id: number;
  title: string;
  sourceName: string;
  sourceTier: string;
  url: string;
  publishedAt: string | null;
  topic: string | null;
  score: number;
  matchReasons: string[];
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = env.DB as D1Database;
  const url = new URL(request.url);
  const clusterId = Number(url.searchParams.get("clusterId") || "0");
  if (!Number.isInteger(clusterId) || clusterId < 1) {
    return Response.json({ error: "clusterId is required." }, { status: 400 });
  }

  // Get the cluster's feed items
  const clusterItems = await db.prepare(`
    SELECT fi.id, fi.title, fi.url, fi.topic, fi.source_id, fi.published_at,
           s.name as source_name, s.tier as source_tier
    FROM story_cluster_members scm
    JOIN feed_items fi ON fi.id = scm.feed_item_id
    JOIN sources s ON s.id = fi.source_id
    WHERE scm.cluster_id = ?
  `).bind(clusterId).all<{
    id: number; title: string; url: string; topic: string | null;
    source_id: number; published_at: string | null;
    source_name: string; source_tier: string;
  }>();

  if (!clusterItems.results || clusterItems.results.length === 0) {
    return Response.json({ items: [], message: "No feed items in this cluster." });
  }

  const clusterSourceIds = new Set(clusterItems.results.map(i => i.source_id));
  const clusterItemIds = new Set(clusterItems.results.map(i => i.id));
  const clusterTitles = clusterItems.results.map(i => i.title.toLowerCase());
  const clusterTopics = new Set(clusterItems.results.map(i => i.topic).filter(Boolean));

  // Extract key terms from cluster titles for searching
  const titleWords = clusterTitles.join(" ").toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
  const uniqueTerms = [...new Set(titleWords)].slice(0, 15);

  // Search for related items: similar topic, title overlap, different source
  const candidates = await db.prepare(`
    SELECT fi.id, fi.title, fi.url, fi.topic, fi.published_at,
           s.name as source_name, s.tier as source_tier
    FROM feed_items fi
    JOIN sources s ON s.id = fi.source_id
    WHERE fi.ingestion_status IN ('classified', 'clustered', 'published')
      AND fi.id NOT IN (${[...clusterItemIds].map(() => '?').join(',')})
      AND s.id NOT IN (${[...clusterSourceIds].map(() => '?').join(',')})
      AND fi.fetched_at >= datetime('now', '-14 days')
    ORDER BY fi.fetched_at DESC
    LIMIT 200
  `).bind(...[...clusterItemIds, ...clusterSourceIds]).all<{
    id: number; title: string; url: string; topic: string | null;
    published_at: string | null; source_name: string; source_tier: string;
  }>();

  // Score each candidate
  const scored: RelatedItem[] = [];
  for (const cand of candidates.results) {
    let score = 0;
    const reasons: string[] = [];

    const candTitle = cand.title.toLowerCase();
    const candWords = candTitle.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
    const candWordSet = new Set(candWords);

    // Title word overlap
    const overlap = uniqueTerms.filter(t => candWordSet.has(t)).length;
    if (overlap >= 3) {
      score += overlap * 15;
      reasons.push(`${overlap} shared title terms`);
    } else if (overlap >= 1) {
      score += overlap * 5;
    }

    // Same topic
    if (cand.topic && clusterTopics.has(cand.topic)) {
      score += 20;
      reasons.push(`same topic (${cand.topic})`);
    }

    // Source tier bonus
    if (cand.source_tier === 'A') score += 10;
    else if (cand.source_tier === 'B') score += 5;

    if (score >= 10) {
      scored.push({
        id: cand.id,
        title: cand.title,
        sourceName: cand.source_name,
        sourceTier: cand.source_tier,
        url: cand.url,
        publishedAt: cand.published_at,
        topic: cand.topic,
        score,
        matchReasons: reasons,
      });
    }
  }

  // Sort by score desc, limit to 20
  scored.sort((a, b) => b.score - a.score);

  return Response.json({
    clusterId,
    clusterItemCount: clusterItems.results.length,
    items: scored.slice(0, 20),
  });
};
