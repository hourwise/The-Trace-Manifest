// The Trace Manifest — Server-side D1 Helper
// Phase 5E.2: Provides typed D1 access for Astro server-rendered pages.
// All D1 access runs server-side only — never exposed to browser JavaScript.
// Uses the Cloudflare Pages binding configured in the dashboard.
// Local dev uses `wrangler pages dev` or the platform proxy.

// ============================================================
// Types for the public data layer
// ============================================================

export interface PublicStory {
  id: number;
  slug: string;
  headline: string;
  summary: string | null;
  editorialAnalysis: string | null;
  whyItMatters: string | null;
  headlineImageUrl: string | null;
  topic: string | null;
  evidenceStatus: string;
  sourceClass: string | null;
  publicationStatus: string;
  publishedAt: string | null;
  lastCheckedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  sourceCount: number;
  primarySourceUrl: string | null;
  primarySourceName: string | null;
}

export interface PublicBriefing {
  id: number;
  briefingType: "daily" | "weekly";
  briefingDate: string;
  title: string;
  summary: string;
  contentJson: string;
  publicationStatus: string;
  publishedAt: string | null;
}

export interface PublicSource {
  label: string;
  url: string;
  sourceName: string;
  sourceTier: string;
}

export interface RelatedStory {
  slug: string;
  headline: string;
  topic: string;
}

// ============================================================
// Column mapping: D1 snake_case → JS camelCase
// ============================================================

function mapStory(row: Record<string, unknown>): PublicStory {
  return {
    id: row.id as number,
    slug: row.slug as string,
    headline: (row.headline ?? row.title) as string,
    summary: row.summary as string | null,
    editorialAnalysis: row.editorial_analysis as string | null,
    whyItMatters: row.why_it_matters as string | null,
    headlineImageUrl: safePublicUrl(row.headline_image_url as string | null),
    topic: row.topic as string | null,
    evidenceStatus: row.evidence_status as string,
    sourceClass: row.source_class as string | null,
    publicationStatus: row.publication_status as string,
    publishedAt: row.published_at as string | null,
    lastCheckedAt: row.last_checked_at as string,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    sourceCount: row.source_count as number,
    primarySourceUrl: safePublicUrl(row.primary_source_url as string | null),
    primarySourceName: row.primary_source_name as string | null,
  };
}

// ============================================================
// Public query functions
// All enforce publication_status = 'published'
// All use prepared statements
// All explicitly select fields (no SELECT *)
// ============================================================

export async function getPublishedStories(db: D1Database, options: {
  topic?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<PublicStory[]> {
  const limit = Math.max(1, Math.min(Number.isInteger(options.limit) ? options.limit! : 20, 100));
  const offset = Math.max(0, Number.isInteger(options.offset) ? options.offset! : 0);

  let query = `
    SELECT sc.id, sc.slug, sc.title, sc.summary, sc.editorial_analysis,
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

  const params: unknown[] = [];

  if (options.topic) {
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,79}$/.test(options.topic)) return [];
    query += ` AND sc.topic = ?`;
    params.push(options.topic);
  }

  query += ` ORDER BY
    CASE sc.evidence_status
      WHEN 'confirmed' THEN 0
      WHEN 'strongly_supported' THEN 1
      WHEN 'provisionally_supported' THEN 2
      WHEN 'vendor_reported' THEN 3
      WHEN 'community_reported' THEN 4
      WHEN 'disputed' THEN 5
      ELSE 6
    END,
    sc.published_at DESC
    LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<Record<string, unknown>>();
  return result.results.map(mapStory);
}

export async function getPublishedStoryBySlug(db: D1Database, slug: string): Promise<PublicStory | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;

  const row = await db.prepare(`
    SELECT sc.id, sc.slug, sc.title, sc.summary, sc.editorial_analysis,
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
    .first<Record<string, unknown>>();

  return row ? mapStory(row) : null;
}

export async function getPublishedStoriesByTopic(
  db: D1Database,
  topic: string,
  options: { limit?: number; offset?: number } = {},
): Promise<PublicStory[]> {
  return getPublishedStories(db, { topic, ...options });
}

export interface PublicBriefingItem {
  storyId: number;
  slug: string;
  headline: string;
  evidenceStatus: string;
  why: string;
}

const PUBLIC_EVIDENCE_STATES = new Set([
  "confirmed", "strongly_supported", "provisionally_supported", "vendor_reported",
  "community_reported", "disputed", "corrected",
]);

export function parsePublishedBriefingItems(contentJson: string): PublicBriefingItem[] {
  try {
    const value = JSON.parse(contentJson) as unknown;
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) return [];
    const items: PublicBriefingItem[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      if (
        Object.keys(item).some((key) => !["storyId", "slug", "headline", "evidenceStatus", "why"].includes(key))
        || !Number.isInteger(item.storyId) || Number(item.storyId) < 1
        || typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || item.slug.length > 100
        || typeof item.headline !== "string" || item.headline.trim().length < 1 || item.headline.length > 200
        || typeof item.why !== "string" || item.why.trim().length < 1 || item.why.length > 500
        || typeof item.evidenceStatus !== "string" || !PUBLIC_EVIDENCE_STATES.has(item.evidenceStatus)
      ) return [];
      items.push({
        storyId: Number(item.storyId), slug: item.slug, headline: item.headline.trim(),
        evidenceStatus: item.evidenceStatus, why: item.why.trim(),
      });
    }
    return items;
  } catch {
    return [];
  }
}

export async function getPublishedTopics(db: D1Database): Promise<string[]> {
  const result = await db.prepare(`
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
  db: D1Database,
  briefingType: "daily" | "weekly",
): Promise<PublicBriefing | null> {
  const row = await db.prepare(`
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
    .first<Record<string, unknown>>();
  return row ? mapBriefing(row) : null;
}

export async function getPublishedBriefingByDate(
  db: D1Database,
  briefingType: "daily" | "weekly",
  date: string,
): Promise<PublicBriefing | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const row = await db.prepare(`
    SELECT id, briefing_type, briefing_date, title, summary, content_json,
           publication_status, published_at
    FROM published_briefings
    WHERE briefing_type = ? AND briefing_date = ? AND publication_status = 'published'
      AND briefing_date <= date('now')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND published_at IS NOT NULL
      AND trim(title) <> '' AND trim(summary) <> '' AND trim(content_json) <> ''
  `)
    .bind(briefingType, date)
    .first<Record<string, unknown>>();
  return row ? mapBriefing(row) : null;
}

export async function getPublishedSourcesForStory(db: D1Database, storyId: number): Promise<PublicSource[]> {
  const result = await db.prepare(`
    SELECT fi.title as label, fi.url, s.name as source_name, s.tier as source_tier
    FROM story_cluster_members scm
    JOIN feed_items fi ON scm.feed_item_id = fi.id
    JOIN sources s ON fi.source_id = s.id
    WHERE scm.cluster_id = ?
      AND fi.ingestion_status = 'published'
      AND EXISTS (
        SELECT 1 FROM story_clusters sc
        WHERE sc.id = scm.cluster_id AND sc.publication_status = 'published'
          AND sc.published_at IS NOT NULL AND datetime(sc.published_at) <= datetime('now')
          AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
          AND sc.summary IS NOT NULL AND trim(sc.summary) <> ''
          AND sc.evidence_status NOT IN ('unverified','outdated','superseded')
      )
    ORDER BY scm.is_primary DESC, s.tier ASC
  `)
    .bind(storyId)
    .all<{ label: string; url: string; source_name: string; source_tier: string }>();

  return result.results.flatMap((r): PublicSource[] => {
    const url = safePublicUrl(r.url);
    return url ? [{ label: r.label, url, sourceName: r.source_name, sourceTier: r.source_tier }] : [];
  });
}

export async function getCorrectionsForStory(db: D1Database, storyId: number): Promise<{
  id: number;
  correctionType: string;
  previousStatement: string;
  updatedStatement: string;
  reason: string;
  createdAt: string;
}[]> {
  const result = await db.prepare(`
    SELECT id, correction_type, previous_statement, updated_statement, reason, corrected_at
    FROM corrections
    WHERE cluster_id = ? AND published = 1
      AND EXISTS (
        SELECT 1 FROM story_clusters sc
        WHERE sc.id = corrections.cluster_id AND sc.publication_status = 'published'
          AND sc.published_at IS NOT NULL AND datetime(sc.published_at) <= datetime('now')
          AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
      )
    ORDER BY corrected_at DESC
  `)
    .bind(storyId)
    .all<{
      id: number; correction_type: string; previous_statement: string;
      updated_statement: string; reason: string; corrected_at: string;
    }>();

  return result.results.map((r) => ({
    id: r.id,
    correctionType: r.correction_type,
    previousStatement: r.previous_statement,
    updatedStatement: r.updated_statement,
    reason: r.reason,
    createdAt: r.corrected_at,
  }));
}

export async function getRelatedStories(
  db: D1Database,
  storyId: number,
  limit: number = 5,
): Promise<RelatedStory[]> {
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 5, 20));
  const story = await db.prepare(
    `SELECT sc.topic FROM story_clusters sc
     WHERE sc.id = ? AND sc.publication_status = 'published' AND sc.published_at IS NOT NULL
       AND datetime(sc.published_at) <= datetime('now')
       AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
       AND sc.summary IS NOT NULL AND trim(sc.summary) <> '' AND sc.slug IS NOT NULL
       AND sc.evidence_status NOT IN ('unverified','outdated','superseded')`,
  ).bind(storyId).first<{ topic: string | null }>();

  if (!story?.topic) return [];

  const result = await db.prepare(`
    SELECT slug, title as headline, topic
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
    .bind(story.topic, storyId, boundedLimit)
    .all<{ slug: string; headline: string; topic: string }>();

  return result.results;
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function mapBriefing(row: Record<string, unknown>): PublicBriefing {
  return {
    id: row.id as number,
    briefingType: row.briefing_type as "daily" | "weekly",
    briefingDate: row.briefing_date as string,
    title: row.title as string,
    summary: row.summary as string,
    contentJson: row.content_json as string,
    publicationStatus: row.publication_status as string,
    publishedAt: row.published_at as string | null,
  };
}

export interface PublicCorrection {
  id: number;
  correctionType: string;
  previousStatement: string;
  updatedStatement: string;
  reason: string;
  evidenceUrl: string | null;
  impact: string | null;
  correctedAt: string;
}

export async function getPublishedCorrections(db: D1Database, limit = 50): Promise<PublicCorrection[]> {
  const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 50, 100));
  const result = await db.prepare(`
    SELECT c.id, c.correction_type, c.previous_statement, c.updated_statement, c.reason,
           c.evidence_url, c.impact, c.corrected_at
    FROM corrections c
    JOIN story_clusters sc ON sc.id = c.cluster_id
    WHERE c.published = 1 AND sc.publication_status = 'published' AND sc.published_at IS NOT NULL
      AND datetime(sc.published_at) <= datetime('now')
      AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL
    ORDER BY c.corrected_at DESC LIMIT ?
  `).bind(boundedLimit).all<{
    id: number; correction_type: string; previous_statement: string; updated_statement: string;
    reason: string; evidence_url: string | null; impact: string | null; corrected_at: string;
  }>();
  return result.results.map((row) => ({
    id: row.id,
    correctionType: row.correction_type,
    previousStatement: row.previous_statement,
    updatedStatement: row.updated_statement,
    reason: row.reason,
    evidenceUrl: safePublicUrl(row.evidence_url),
    impact: row.impact,
    correctedAt: row.corrected_at,
  }));
}
