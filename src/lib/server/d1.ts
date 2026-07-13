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
// Internal: get D1 binding from Astro locals
// ============================================================

function getDB(): D1Database {
  // Astro.locals is available in server-rendered .astro pages and API routes
  // The Cloudflare adapter injects runtime.env with Page bindings
  try {

    return Astro.locals.runtime.env.DB;
  } catch {
    throw new Error(
      "D1 binding not available. Ensure the Cloudflare adapter is configured " +
      "and the DB binding is set in the Cloudflare Pages dashboard."
    );
  }
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
    headlineImageUrl: row.headline_image_url as string | null,
    topic: row.topic as string | null,
    evidenceStatus: row.evidence_status as string,
    sourceClass: row.source_class as string | null,
    publicationStatus: row.publication_status as string,
    publishedAt: row.published_at as string | null,
    lastCheckedAt: row.last_checked_at as string,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    sourceCount: row.source_count as number,
    primarySourceUrl: row.primary_source_url as string | null,
    primarySourceName: row.primary_source_name as string | null,
  };
}

// ============================================================
// Public query functions
// All enforce publication_status = 'published'
// All use prepared statements
// All explicitly select fields (no SELECT *)
// ============================================================

export async function getPublishedStories(options: {
  topic?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<PublicStory[]> {
  const db = getDB();
  const limit = Math.min(options.limit ?? 20, 100);
  const offset = options.offset ?? 0;

  let query = `
    SELECT sc.id, sc.slug, sc.title, sc.summary, sc.editorial_analysis,
           sc.why_it_matters, sc.headline_image_url, sc.topic, sc.evidence_status,
           sc.source_class, sc.publication_status, sc.published_at, sc.last_checked_at,
           sc.reviewed_by, sc.reviewed_at,
           (SELECT COUNT(*) FROM story_cluster_members WHERE cluster_id = sc.id) as source_count,
           (SELECT fi.url FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
            WHERE scm.cluster_id = sc.id ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_url,
           (SELECT s.name FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
            JOIN sources s ON fi.source_id = s.id
            WHERE scm.cluster_id = sc.id ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_name
    FROM story_clusters sc
    WHERE sc.publication_status = 'published'
  `;

  const params: unknown[] = [];

  if (options.topic) {
    query += ` AND sc.topic = ?`;
    params.push(options.topic);
  }

  query += ` ORDER BY sc.published_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<Record<string, unknown>>();
  return result.results.map(mapStory);
}

export async function getPublishedStoryBySlug(slug: string): Promise<PublicStory | null> {
  const db = getDB();

  const row = await db.prepare(`
    SELECT sc.id, sc.slug, sc.title, sc.summary, sc.editorial_analysis,
           sc.why_it_matters, sc.headline_image_url, sc.topic, sc.evidence_status,
           sc.source_class, sc.publication_status, sc.published_at, sc.last_checked_at,
           sc.reviewed_by, sc.reviewed_at,
           (SELECT COUNT(*) FROM story_cluster_members WHERE cluster_id = sc.id) as source_count,
           (SELECT fi.url FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
            WHERE scm.cluster_id = sc.id ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_url,
           (SELECT s.name FROM story_cluster_members scm
            JOIN feed_items fi ON scm.feed_item_id = fi.id
            JOIN sources s ON fi.source_id = s.id
            WHERE scm.cluster_id = sc.id ORDER BY scm.is_primary DESC LIMIT 1) as primary_source_name
    FROM story_clusters sc
    WHERE sc.slug = ? AND sc.publication_status = 'published'
  `)
    .bind(slug)
    .first<Record<string, unknown>>();

  return row ? mapStory(row) : null;
}

export async function getPublishedStoriesByTopic(
  topic: string,
  options: { limit?: number; offset?: number } = {},
): Promise<PublicStory[]> {
  return getPublishedStories({ topic, ...options });
}

export async function getPublishedTopics(): Promise<string[]> {
  const db = getDB();
  const result = await db.prepare(`
    SELECT DISTINCT topic FROM story_clusters
    WHERE publication_status = 'published' AND topic IS NOT NULL
    ORDER BY topic
  `).all<{ topic: string }>();
  return result.results.map((r) => r.topic);
}

export async function getLatestPublishedBriefing(
  briefingType: "daily" | "weekly",
): Promise<PublicBriefing | null> {
  const db = getDB();
  return db.prepare(`
    SELECT id, briefing_type, briefing_date, title, summary, content_json,
           publication_status, published_at
    FROM published_briefings
    WHERE briefing_type = ? AND publication_status = 'published'
    ORDER BY briefing_date DESC
    LIMIT 1
  `)
    .bind(briefingType)
    .first<PublicBriefing>();
}

export async function getPublishedBriefingByDate(
  briefingType: "daily" | "weekly",
  date: string,
): Promise<PublicBriefing | null> {
  const db = getDB();
  return db.prepare(`
    SELECT id, briefing_type, briefing_date, title, summary, content_json,
           publication_status, published_at
    FROM published_briefings
    WHERE briefing_type = ? AND briefing_date = ? AND publication_status = 'published'
  `)
    .bind(briefingType, date)
    .first<PublicBriefing>();
}

export async function getPublishedSourcesForStory(storyId: number): Promise<PublicSource[]> {
  const db = getDB();
  const result = await db.prepare(`
    SELECT fi.title as label, fi.url, s.name as source_name, s.tier as source_tier
    FROM story_cluster_members scm
    JOIN feed_items fi ON scm.feed_item_id = fi.id
    JOIN sources s ON fi.source_id = s.id
    WHERE scm.cluster_id = ?
      AND fi.ingestion_status IN ('clustered', 'published')
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

export async function getCorrectionsForStory(storyId: number): Promise<{
  id: number;
  correctionType: string;
  previousStatement: string;
  updatedStatement: string;
  reason: string;
  createdAt: string;
}[]> {
  const db = getDB();
  const result = await db.prepare(`
    SELECT id, correction_type, previous_statement, updated_statement, reason, created_at
    FROM corrections
    WHERE cluster_id = ? AND is_published = 1
    ORDER BY created_at DESC
  `)
    .bind(storyId)
    .all<{
      id: number; correction_type: string; previous_statement: string;
      updated_statement: string; reason: string; created_at: string;
    }>();

  return result.results.map((r) => ({
    id: r.id,
    correctionType: r.correction_type,
    previousStatement: r.previous_statement,
    updatedStatement: r.updated_statement,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export async function getRelatedStories(
  storyId: number,
  limit: number = 5,
): Promise<RelatedStory[]> {
  const db = getDB();
  const story = await db.prepare(
    `SELECT topic FROM story_clusters WHERE id = ?`,
  ).bind(storyId).first<{ topic: string | null }>();

  if (!story?.topic) return [];

  const result = await db.prepare(`
    SELECT slug, title as headline, topic
    FROM story_clusters
    WHERE publication_status = 'published' AND topic = ? AND id != ?
    ORDER BY published_at DESC
    LIMIT ?
  `)
    .bind(story.topic, storyId, limit)
    .all<{ slug: string; headline: string; topic: string }>();

  return result.results;
}
