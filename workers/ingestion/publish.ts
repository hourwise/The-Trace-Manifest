// The Trace Manifest — Publication Module
// Phase 5E.1: Publishes story clusters and briefings to the public data layer.
// Enforces the publication boundary: raw ingestion != publication.
// All public-facing queries must go through the published data contract.

import type { Env } from "./index";
import { recalculateEvidenceScores } from "../../src/lib/server/evidence-recalculation";

// ============================================================
// Types
// ============================================================

export interface PublishedStory {
  id: number;
  slug: string;
  headline: string;
  summary: string | null;
  editorial_analysis: string | null;
  why_it_matters: string | null;
  headline_image_url: string | null;
  topic: string | null;
  evidence_status: string;
  source_class: string | null;
  publication_status: string;
  published_at: string | null;
  last_checked_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  source_count: number;
  primary_source_url: string | null;
  primary_source_name: string | null;
}

export interface PublishedBriefing {
  id: number;
  briefing_type: "daily" | "weekly";
  briefing_date: string;
  title: string;
  summary: string;
  content_json: string;
  publication_status: string;
  published_at: string | null;
}

export interface PublishStoryInput {
  clusterId: number;
  headline?: string;           // Override auto-generated title
  summary?: string;            // Editorial summary (required for publication)
  editorialAnalysis?: string;  // TRACE editorial analysis
  whyItMatters?: string;       // Significance explanation
  headlineImageUrl?: string;   // URL to header image from source feed
  reviewedBy?: string;         // Reviewer identifier
}

export interface PublishBriefingInput {
  briefingType: "daily" | "weekly";
  briefingDate: string;        // ISO date
  title: string;
  summary: string;
  contentJson: string;         // JSON array of story entries
  reviewedBy?: string;
}

interface BriefingInputItem {
  storyId?: number;
  story_id?: number;
  slug?: string;
  why?: string;
  commentary?: string;
}

interface EligibleBriefingStory {
  id: number;
  slug: string;
  headline: string;
  evidence_status: string;
}

function boundedText(value: string | undefined, minimum: number, maximum: number): boolean {
  return typeof value === "string" && value.trim().length >= minimum && value.trim().length <= maximum;
}

function safeHttpUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

// ============================================================
// Slug generation
// ============================================================

function generateSlug(title: string, existingSlugs: Set<string>): string {
  let slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")     // Remove special chars
    .replace(/[\s_]+/g, "-")      // Replace spaces/underscores with hyphens
    .replace(/-+/g, "-")          // Collapse multiple hyphens
    .replace(/^-|-$/g, "")        // Trim leading/trailing hyphens
    .slice(0, 80);                // Max 80 chars

  // Handle collisions by appending -2, -3, etc.
  if (existingSlugs.has(slug)) {
    let counter = 2;
    while (existingSlugs.has(`${slug}-${counter}`)) {
      counter++;
    }
    slug = `${slug}-${counter}`;
  }

  return slug;
}

// ============================================================
// Publish a story cluster
// ============================================================

export async function publishStory(
  env: Env,
  input: PublishStoryInput,
): Promise<{ success: boolean; story?: PublishedStory; error?: string }> {
  // 1. Fetch the cluster and verify it exists
  const cluster = await env.DB.prepare(
    `SELECT id, title, topic, evidence_status, source_class, publication_status,
            published_at, last_checked_at, reviewed_by, reviewed_at
     FROM story_clusters WHERE id = ?`,
  )
    .bind(input.clusterId)
    .first<{
      id: number; title: string; topic: string | null;
      evidence_status: string; source_class: string | null;
      publication_status: string;
      published_at: string | null; last_checked_at: string;
      reviewed_by: string | null; reviewed_at: string | null;
    }>();

  if (!cluster) {
    return { success: false, error: `Cluster ${input.clusterId} not found.` };
  }
  if (!['draft', 'review'].includes(cluster.publication_status)) {
    return { success: false, error: `Cluster ${input.clusterId} cannot transition from ${cluster.publication_status} to published.` };
  }
  if (!input.reviewedBy) {
    return { success: false, error: "An authenticated human reviewer is required." };
  }
  if (!boundedText(input.summary, 20, 2_000)) {
    return { success: false, error: "A reviewed summary of 20-2,000 characters is required." };
  }
  if (input.headline && !boundedText(input.headline, 5, 200)) {
    return { success: false, error: "The headline must be 5-200 characters." };
  }
  if (input.editorialAnalysis && !boundedText(input.editorialAnalysis, 1, 8_000)) {
    return { success: false, error: "Editorial analysis exceeds the publication limit." };
  }
  if (input.whyItMatters && !boundedText(input.whyItMatters, 1, 1_000)) {
    return { success: false, error: "Why-it-matters text exceeds the publication limit." };
  }
  if (!safeHttpUrl(input.headlineImageUrl)) {
    return { success: false, error: "The headline image URL must be HTTP or HTTPS." };
  }
  if (["unverified", "outdated", "superseded"].includes(cluster.evidence_status)) {
    return { success: false, error: `Evidence status ${cluster.evidence_status} is not publication-eligible.` };
  }

  // 2. Count member sources
  const memberCount = await env.DB.prepare(
    `SELECT COUNT(*) as count
     FROM story_cluster_members scm
     JOIN feed_items fi ON fi.id = scm.feed_item_id
     WHERE scm.cluster_id = ? AND fi.ingestion_status <> 'archived'`,
  )
    .bind(input.clusterId)
    .first<{ count: number }>();
  if (!memberCount || memberCount.count < 1) {
    return { success: false, error: "A story must contain at least one stored source item before publication." };
  }

  // 3. Get primary source (first Tier A, or first member)
  const primaryMember = await env.DB.prepare(
    `SELECT fi.url, fi.title, s.name as source_name
     FROM story_cluster_members scm
     JOIN feed_items fi ON scm.feed_item_id = fi.id
     JOIN sources s ON fi.source_id = s.id
     WHERE scm.cluster_id = ? AND fi.ingestion_status <> 'archived'
     ORDER BY scm.is_primary DESC, s.tier ASC
     LIMIT 1`,
  )
    .bind(input.clusterId)
    .first<{ url: string; title: string; source_name: string }>();

  // 4. Collect existing slugs for collision check
  const existingSlugs = await env.DB.prepare(
    `SELECT slug FROM story_clusters WHERE slug IS NOT NULL`,
  ).all<{ slug: string }>();
  const slugSet = new Set(existingSlugs.results.map((r) => r.slug));

  // 5. Generate slug
  const headline = (input.headline || cluster.title).trim();
  if (!boundedText(headline, 5, 200)) {
    return { success: false, error: "The publication headline must be 5-200 characters." };
  }
  const slug = generateSlug(headline, slugSet);
  if (!slug) return { success: false, error: "The headline cannot produce a valid public slug." };

  // 6. Determine image URL — prefer explicit input, fall back to source feed metadata
  let headlineImageUrl = input.headlineImageUrl || null;
  if (!headlineImageUrl) {
    const imageResult = await env.DB.prepare(
      `SELECT raw_metadata FROM feed_items fi
       JOIN story_cluster_members scm ON fi.id = scm.feed_item_id
       WHERE scm.cluster_id = ? AND scm.is_primary = 1
       LIMIT 1`,
    )
      .bind(input.clusterId)
      .first<{ raw_metadata: string | null }>();

    if (imageResult?.raw_metadata) {
      try {
        const meta = JSON.parse(imageResult.raw_metadata);
        // Common RSS/image metadata fields
        headlineImageUrl = meta.image || meta.lead_image_url || meta.thumbnail || meta.enclosure?.url || null;
      } catch { /* metadata parse failure — proceed without image */ }
    }
  }
  if (headlineImageUrl && !safeHttpUrl(headlineImageUrl)) {
    headlineImageUrl = null;
  }

  // 7. Update the cluster with publication fields
  const now = new Date().toISOString();
  const publicationUpdate = env.DB.prepare(
    `UPDATE story_clusters
     SET slug = ?,
         title = ?,
         summary = ?,
         editorial_analysis = ?,
         why_it_matters = ?,
         headline_image_url = ?,
         publication_status = 'published',
         published_at = COALESCE(published_at, ?),
         reviewed_by = ?,
         reviewed_at = ?,
         is_published = 1,
         updated_at = ?
     WHERE id = ? AND publication_status IN ('draft', 'review')`,
  )
    .bind(
      slug,
      headline,
      input.summary!.trim(),
      input.editorialAnalysis || null,
      input.whyItMatters || null,
      headlineImageUrl,
      now,
      input.reviewedBy || null,
      input.reviewedBy ? now : null,
      now,
      input.clusterId,
    );

  // 8. Mark member feed items as published
  const memberUpdate = env.DB.prepare(
    `UPDATE feed_items
     SET ingestion_status = 'published'
     WHERE id IN (SELECT feed_item_id FROM story_cluster_members WHERE cluster_id = ?)
       AND ingestion_status NOT IN ('published', 'archived')`,
  )
    .bind(input.clusterId);

  const batchResult = await env.DB.batch([publicationUpdate, memberUpdate]);
  if (Number(batchResult[0].meta.changes ?? 0) !== 1) {
    return { success: false, error: "Publication state changed concurrently; reload and review again." };
  }

  // Record promotion audit
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit_log (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
      VALUES (?, ?, 'publisher', 'publish_story_to_homepage', 'cluster', ?, ?, 'succeeded', ?)
    `).bind(
      crypto.randomUUID(),
      input.reviewedBy ?? "Admin",
      String(input.clusterId),
      crypto.randomUUID(),
      `evidence=${cluster.evidence_status}`,
    ).run();
  } catch {
    // Audit failure should not block publication
    console.error("Failed to record publication audit.");
  }

  // 9. Return the published story
  const story: PublishedStory = {
    id: cluster.id,
    slug,
    headline,
    summary: input.summary!.trim(),
    editorial_analysis: input.editorialAnalysis || null,
    why_it_matters: input.whyItMatters || null,
    headline_image_url: headlineImageUrl,
    topic: cluster.topic,
    evidence_status: cluster.evidence_status,
    source_class: cluster.source_class,
    publication_status: "published",
    published_at: cluster.published_at || now,
    last_checked_at: cluster.last_checked_at,
    reviewed_by: input.reviewedBy,
    reviewed_at: now,
    source_count: memberCount?.count ?? 0,
    primary_source_url: primaryMember?.url ?? null,
    primary_source_name: primaryMember?.source_name ?? null,
  };

  return { success: true, story };
}

// ============================================================
// Withdraw or supersede a published story
// ============================================================

export async function updateStoryStatus(
  env: Env,
  clusterId: number,
  newStatus: "withdrawn" | "superseded",
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const cluster = await env.DB.prepare(
    `SELECT id, publication_status FROM story_clusters WHERE id = ?`,
  )
    .bind(clusterId)
    .first<{ id: number; publication_status: string }>();

  if (!cluster) {
    return { success: false, error: `Cluster ${clusterId} not found.` };
  }

  if (cluster.publication_status !== "published") {
    return { success: false, error: `Cluster ${clusterId} is not published (status: ${cluster.publication_status}).` };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE story_clusters
     SET publication_status = ?,
         is_published = 0,
         editorial_analysis = COALESCE(editorial_analysis, '') ||
           CASE WHEN ? IS NOT NULL THEN ' [Withdrawn: ' || ? || ']' ELSE '' END,
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(newStatus, reason, reason, now, clusterId)
    .run();

  await recalculateEvidenceScores(env.DB, {
    storyIds: [clusterId],
    triggeringEvent: newStatus === "superseded" ? "story_superseded" : "story_withdrawn",
  });

  return { success: true };
}

// ============================================================
// Publish a briefing
// ============================================================

export async function publishBriefing(
  env: Env,
  input: PublishBriefingInput,
): Promise<{ success: boolean; briefing?: PublishedBriefing; error?: string }> {
  if (!input.reviewedBy) return { success: false, error: "An authenticated human reviewer is required." };
  const briefingDate = new Date(`${input.briefingDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.briefingDate)
    || Number.isNaN(briefingDate.getTime())
    || briefingDate.toISOString().slice(0, 10) !== input.briefingDate
  ) {
    return { success: false, error: "briefingDate must be a valid ISO date." };
  }
  if (!boundedText(input.title, 5, 200) || !boundedText(input.summary, 20, 2_000)) {
    return { success: false, error: "A bounded title and reviewed summary are required." };
  }

  let requestedItems: BriefingInputItem[];
  try {
    const parsed = JSON.parse(input.contentJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) throw new Error("invalid array");
    requestedItems = parsed as BriefingInputItem[];
  } catch {
    return { success: false, error: "contentJson must be a JSON array containing 1-20 story references." };
  }

  const canonicalItems: Array<{ storyId: number; slug: string; headline: string; evidenceStatus: string; why: string }> = [];
  const seen = new Set<number>();
  for (const item of requestedItems) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { success: false, error: "Every briefing entry must be an object." };
    }
    if (Object.keys(item).some((key) => !["storyId", "story_id", "slug", "why", "commentary"].includes(key))) {
      return { success: false, error: "A briefing entry contains an unsupported field." };
    }
    const storyId = Number(item.storyId ?? item.story_id);
    const slug = typeof item.slug === "string" ? item.slug : "";
    if ((!Number.isInteger(storyId) || storyId < 1) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return { success: false, error: "Every briefing entry requires a valid storyId or slug." };
    }
    const why = typeof item.why === "string" ? item.why : typeof item.commentary === "string" ? item.commentary : "";
    if (!boundedText(why, 1, 500)) return { success: false, error: "Every briefing entry requires bounded commentary." };

    const story = await env.DB.prepare(`
      SELECT id, slug, title AS headline, evidence_status
      FROM story_clusters
      WHERE ${Number.isInteger(storyId) && storyId > 0 ? "id = ?" : "slug = ?"}
        AND publication_status = 'published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND summary IS NOT NULL AND trim(summary) <> '' AND slug IS NOT NULL
        AND evidence_status NOT IN ('unverified','outdated','superseded')
        AND EXISTS (
          SELECT 1 FROM story_cluster_members scm JOIN feed_items fi ON fi.id = scm.feed_item_id
          WHERE scm.cluster_id = story_clusters.id AND fi.ingestion_status = 'published'
        )
    `).bind(Number.isInteger(storyId) && storyId > 0 ? storyId : slug).first<EligibleBriefingStory>();
    if (!story) return { success: false, error: "A briefing entry does not reference an eligible published story." };
    if (seen.has(story.id)) return { success: false, error: "A briefing cannot contain the same story twice." };
    seen.add(story.id);
    canonicalItems.push({
      storyId: story.id,
      slug: story.slug,
      headline: story.headline,
      evidenceStatus: story.evidence_status,
      why: why.trim(),
    });
  }

  const canonicalContent = JSON.stringify(canonicalItems);

  const now = new Date().toISOString();

  // Upsert: replace existing briefing for the same type+date, or insert new
  const existing = await env.DB.prepare(
    `SELECT id FROM published_briefings WHERE briefing_type = ? AND briefing_date = ?`,
  )
    .bind(input.briefingType, input.briefingDate)
    .first<{ id: number }>();

  let briefingId: number;

  if (existing) {
    await env.DB.prepare(
      `UPDATE published_briefings
       SET title = ?, summary = ?, content_json = ?, publication_status = 'published',
           published_at = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(input.title.trim(), input.summary.trim(), canonicalContent, now, input.reviewedBy, now, now, existing.id)
      .run();
    briefingId = existing.id;
  } else {
    const result = await env.DB.prepare(
      `INSERT INTO published_briefings
       (briefing_type, briefing_date, title, summary, content_json, publication_status, published_at, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
    )
      .bind(input.briefingType, input.briefingDate, input.title.trim(), input.summary.trim(), canonicalContent, now, input.reviewedBy, now)
      .run();
    briefingId = result.meta.last_row_id;
  }

  const briefing: PublishedBriefing = {
    id: briefingId,
    briefing_type: input.briefingType,
    briefing_date: input.briefingDate,
    title: input.title.trim(),
    summary: input.summary.trim(),
    content_json: canonicalContent,
    publication_status: "published",
    published_at: now,
  };

  return { success: true, briefing };
}

// ============================================================
// Public query helpers — used by the Astro data layer
// These intentionally limit returned fields and enforce the publication gate.
// ============================================================

export async function getPublishedStories(
  env: Env,
  options: {
    topic?: string;
    limit?: number;
    offset?: number;
    orderBy?: "published_at" | "last_checked_at";
  } = {},
): Promise<PublishedStory[]> {
  const limit = Math.max(1, Math.min(Number.isInteger(options.limit) ? options.limit! : 20, 100));
  const offset = Math.max(0, Number.isInteger(options.offset) ? options.offset! : 0);
  const orderBy = options.orderBy === "last_checked_at" ? "sc.last_checked_at" : "sc.published_at";

  let query = `
    SELECT sc.id, sc.slug, sc.title as headline, sc.summary, sc.editorial_analysis,
           sc.why_it_matters, sc.headline_image_url, sc.topic, sc.evidence_status,
           sc.source_class, sc.publication_status, sc.published_at, sc.last_checked_at,
           sc.reviewed_by, sc.reviewed_at,
           (SELECT COUNT(*) FROM story_cluster_members count_scm
            JOIN feed_items count_fi ON count_fi.id = count_scm.feed_item_id
            WHERE count_scm.cluster_id = sc.id AND count_fi.ingestion_status = 'published') as source_count,
           (SELECT fi.url FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
             WHERE scm.cluster_id = sc.id AND fi.ingestion_status = 'published'
             ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_url,
           (SELECT s.name FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
            JOIN sources s ON fi.source_id = s.id
             WHERE scm.cluster_id = sc.id AND fi.ingestion_status = 'published'
             ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_name
    FROM story_clusters sc
    WHERE sc.publication_status = 'published' AND sc.slug IS NOT NULL AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now')
      AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      AND sc.summary IS NOT NULL AND trim(sc.summary) <> ''
      AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      AND EXISTS (
        SELECT 1 FROM story_cluster_members eligible_scm
        JOIN feed_items eligible_fi ON eligible_fi.id = eligible_scm.feed_item_id
        WHERE eligible_scm.cluster_id = sc.id AND eligible_fi.ingestion_status = 'published'
      )
  `;

  const params: any[] = [];

  if (options.topic) {
    query += ` AND sc.topic = ?`;
    params.push(options.topic);
  }

  query += ` ORDER BY ${orderBy} DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...params).all<PublishedStory>();
  return result.results;
}

export async function getPublishedStoryBySlug(
  env: Env,
  slug: string,
): Promise<PublishedStory | null> {
  return env.DB.prepare(`
    SELECT sc.id, sc.slug, sc.title as headline, sc.summary, sc.editorial_analysis,
           sc.why_it_matters, sc.headline_image_url, sc.topic, sc.evidence_status,
           sc.source_class, sc.publication_status, sc.published_at, sc.last_checked_at,
           sc.reviewed_by, sc.reviewed_at,
           (SELECT COUNT(*) FROM story_cluster_members count_scm
            JOIN feed_items count_fi ON count_fi.id = count_scm.feed_item_id
            WHERE count_scm.cluster_id = sc.id AND count_fi.ingestion_status = 'published') as source_count,
           (SELECT fi.url FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
             WHERE scm.cluster_id = sc.id AND fi.ingestion_status = 'published'
             ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_url,
           (SELECT s.name FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
            JOIN sources s ON fi.source_id = s.id
             WHERE scm.cluster_id = sc.id AND fi.ingestion_status = 'published'
             ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_name
    FROM story_clusters sc
    WHERE sc.slug = ? AND sc.publication_status = 'published' AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now')
      AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      AND sc.summary IS NOT NULL AND trim(sc.summary) <> ''
      AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      AND EXISTS (
        SELECT 1 FROM story_cluster_members eligible_scm
        JOIN feed_items eligible_fi ON eligible_fi.id = eligible_scm.feed_item_id
        WHERE eligible_scm.cluster_id = sc.id AND eligible_fi.ingestion_status = 'published'
      )
  `)
    .bind(slug)
    .first<PublishedStory>();
}

export async function getPublishedTopics(env: Env): Promise<string[]> {
  const result = await env.DB.prepare(`
    SELECT DISTINCT sc.topic AS topic FROM story_clusters sc
    WHERE sc.publication_status = 'published' AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now') AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      AND sc.summary IS NOT NULL AND trim(sc.summary) <> '' AND sc.slug IS NOT NULL AND sc.topic IS NOT NULL
      AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      AND EXISTS (
        SELECT 1 FROM story_cluster_members eligible_scm
        JOIN feed_items eligible_fi ON eligible_fi.id = eligible_scm.feed_item_id
        WHERE eligible_scm.cluster_id = sc.id AND eligible_fi.ingestion_status = 'published'
      )
    ORDER BY topic
  `).all<{ topic: string }>();
  return result.results.map((r) => r.topic);
}

export async function getLatestPublishedBriefing(
  env: Env,
  briefingType: "daily" | "weekly",
): Promise<PublishedBriefing | null> {
  return env.DB.prepare(`
    SELECT id, briefing_type, briefing_date, title, summary, content_json,
           publication_status, published_at
    FROM published_briefings
    WHERE briefing_type = ? AND publication_status = 'published'
      AND briefing_date <= date('now')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND published_at IS NOT NULL
      AND trim(title) <> '' AND trim(summary) <> '' AND trim(content_json) <> ''
    ORDER BY briefing_date DESC
    LIMIT 1
  `)
    .bind(briefingType)
    .first<PublishedBriefing>();
}

export async function getPublishedSourcesForStory(
  env: Env,
  storyId: number,
): Promise<{ label: string; url: string; sourceName: string; sourceTier: string }[]> {
  const result = await env.DB.prepare(`
    SELECT fi.title as label, fi.url, s.name as source_name, s.tier as source_tier
    FROM story_cluster_members scm
    JOIN feed_items fi ON scm.feed_item_id = fi.id
    JOIN sources s ON fi.source_id = s.id
    WHERE scm.cluster_id = ? AND fi.ingestion_status = 'published'
    ORDER BY scm.is_primary DESC, s.tier ASC
  `)
    .bind(storyId)
    .all<{ label: string; url: string; source_name: string; source_tier: string }>();
  return result.results.map((r) => ({
    label: r.label,
    url: r.url,
    sourceName: r.source_name,
    sourceTier: r.source_tier,
  }));
}

export async function getRelatedStories(
  env: Env,
  storyId: number,
  limit: number = 5,
): Promise<{ slug: string; headline: string; topic: string }[]> {
  const story = await env.DB.prepare(
    `SELECT topic FROM story_clusters WHERE id = ?`,
  ).bind(storyId).first<{ topic: string | null }>();

  if (!story?.topic) return [];

  const result = await env.DB.prepare(`
    SELECT sc.slug, sc.title as headline, sc.topic
    FROM story_clusters sc
    WHERE sc.publication_status = 'published' AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now') AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      AND sc.summary IS NOT NULL AND trim(sc.summary) <> '' AND sc.slug IS NOT NULL
      AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      AND sc.topic = ? AND sc.id != ?
      AND EXISTS (
        SELECT 1 FROM story_cluster_members eligible_scm
        JOIN feed_items eligible_fi ON eligible_fi.id = eligible_scm.feed_item_id
        WHERE eligible_scm.cluster_id = sc.id AND eligible_fi.ingestion_status = 'published'
      )
    ORDER BY sc.published_at DESC
    LIMIT ?
  `)
    .bind(story.topic, storyId, limit)
    .all<{ slug: string; headline: string; topic: string }>();
  return result.results;
}

// ============================================================
// Admin query — list all clusters (not just published)
// ============================================================

export async function getAllClusters(
  env: Env,
  options: { limit?: number; status?: string } = {},
): Promise<{ id: number; title: string; topic: string | null; evidence_status: string; publication_status: string; source_count: number; created_at: string; summary: string | null; why_it_matters: string | null }[]> {
  const limit = Math.max(1, Math.min(Number.isInteger(options.limit) ? options.limit! : 50, 200));

  let query = `
    SELECT sc.id, sc.title, sc.topic, sc.evidence_status, sc.publication_status,
           sc.created_at, sc.summary, sc.why_it_matters,
           (SELECT COUNT(*) FROM story_cluster_members WHERE cluster_id = sc.id) as source_count
    FROM story_clusters sc
    WHERE sc.evidence_status NOT IN ('unverified','outdated','superseded')
  `;

  const params: any[] = [];

  if (options.status) {
    query += ` AND sc.publication_status = ?`;
    params.push(options.status);
  } else {
    query += ` AND sc.publication_status NOT IN ('published','withdrawn')`;
  }

  query += ` ORDER BY sc.id DESC LIMIT ?`;
  params.push(limit);

  const result = await env.DB.prepare(query).bind(...params).all<{
    id: number; title: string; topic: string | null;
    evidence_status: string; publication_status: string;
    source_count: number; created_at: string;
    summary: string | null; why_it_matters: string | null;
  }>();
  return result.results;
}

// ============================================================
// Admin query — get source feed items for a cluster
// ============================================================

export async function getClusterSources(
  env: Env,
  clusterId: number,
): Promise<{ title: string; url: string; excerpt: string | null; sourceName: string; sourceTier: string; publishedAt: string | null }[]> {
  const result = await env.DB.prepare(`
    SELECT fi.title, fi.url, fi.content_excerpt, s.name as source_name,
           s.tier as source_tier, fi.published_at
    FROM story_cluster_members scm
    JOIN feed_items fi ON scm.feed_item_id = fi.id
    JOIN sources s ON fi.source_id = s.id
    WHERE scm.cluster_id = ?
    ORDER BY scm.is_primary DESC, s.tier ASC
  `)
    .bind(clusterId)
    .all<{
      title: string; url: string; content_excerpt: string | null;
      source_name: string; source_tier: string; published_at: string | null;
    }>();

  return result.results.map((r) => ({
    title: r.title,
    url: r.url,
    excerpt: r.content_excerpt,
    sourceName: r.source_name,
    sourceTier: r.source_tier,
    publishedAt: r.published_at,
  }));
}

// ============================================================
// Admin — archive a cluster (set to 'archived' so it disappears from drafts)
// ============================================================

export async function archiveCluster(
  env: Env,
  clusterId: number,
): Promise<{ success: boolean; error?: string }> {
  const cluster = await env.DB.prepare(
    `SELECT id FROM story_clusters WHERE id = ?`,
  ).bind(clusterId).first<{ id: number }>();

  if (!cluster) {
    return { success: false, error: `Cluster ${clusterId} not found.` };
  }

  const changed = await env.DB.prepare(
    `UPDATE story_clusters SET publication_status = 'withdrawn', updated_at = datetime('now')
     WHERE id = ? AND publication_status IN ('draft', 'review')`,
  ).bind(clusterId).run();
  if (Number(changed.meta.changes ?? 0) !== 1) {
    return { success: false, error: "Only draft or review clusters can be archived." };
  }

  await recalculateEvidenceScores(env.DB, {
    storyIds: [clusterId],
    triggeringEvent: "story_archived",
  });

  return { success: true };
}

// ============================================================
// Evidence upgrade — disabled pending claim-level provenance.
// ============================================================

/**
 * Source counts and registry tiers are discovery metadata, not evidence of
 * independent corroboration. The old implementation promoted a whole cluster
 * from those counts alone, so the scheduled call is intentionally a no-op until
 * KC-05/KC-07 can evaluate reviewed claim assertions and provenance groups.
 */
export interface EvidenceUpgradeResult {
  clusterId: number;
  title: string;
  previousStatus: string;
  newStatus: string | null;
  sourceCount: number;
  tierA: number;
  tierB: number;
  tierC: number;
}

export async function upgradeClusterEvidence(
  _db: D1Database,
): Promise<EvidenceUpgradeResult[]> {
  return [];
}
