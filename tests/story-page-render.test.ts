import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { SQLiteD1 } from "./sqlite-d1";

// Renders the BUILT story page (dist/) through Astro's container API against a
// local SQLite D1, so the assertions cover real HTML rather than source text.
// Run after `npm run build` (see `npm run ci`).

const PAGE = "dist/_worker.js/pages/stories/_slug_.astro.mjs";
if (!existsSync(PAGE)) throw new Error(`${PAGE} not found: run npm run build first.`);

const db = new SQLiteD1();
db.sqlite.exec(`
  INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
    (961, 1, 'https://render.example/live', 'render-live', 'Live source', 'published'),
    (962, 1, 'https://render.example/withdrawn', 'render-withdrawn', 'Withdrawn source', 'published'),
    (963, 1, 'https://render.example/superseded', 'render-superseded', 'Superseded source', 'published'),
    (964, 1, 'https://render.example/replacement', 'render-replacement', 'Replacement source', 'published'),
    (965, 1, 'https://render.example/orphan', 'render-orphan', 'Orphan superseded source', 'published'),
    (966, 1, 'https://render.example/archived', 'render-archived', 'Archived source', 'raw');
  INSERT INTO story_clusters (id, slug, title, topic, summary, editorial_analysis, evidence_status, publication_status, is_published, published_at, reviewed_by, reviewed_at) VALUES
    (961, 'live-story', 'Live story headline', 'models', 'A live published story summary.', NULL, 'vendor_reported', 'published', 1, '2026-07-21T20:00:00Z', 'publisher@example.test', '2026-07-21T20:00:00Z'),
    (962, 'withdrawn-story', 'Withdrawn story headline', 'models', 'A withdrawn story summary.', 'Original analysis. [Withdrawn: Published in error.]', 'vendor_reported', 'withdrawn', 0, '2026-07-21T20:00:00Z', 'publisher@example.test', '2026-07-21T20:00:00Z'),
    (963, 'superseded-story', 'Superseded story headline', 'models', 'A superseded story summary.', NULL, 'vendor_reported', 'superseded', 0, '2026-07-20T20:00:00Z', 'publisher@example.test', '2026-07-20T20:00:00Z'),
    (964, 'replacement-story', 'Replacement story headline', 'models', 'The newer story summary.', NULL, 'vendor_reported', 'published', 1, '2026-07-22T20:00:00Z', 'publisher@example.test', '2026-07-22T20:00:00Z'),
    (965, 'orphan-superseded', 'Orphan superseded headline', 'models', 'Superseded without a reviewed link.', NULL, 'vendor_reported', 'superseded', 0, '2026-07-20T20:00:00Z', 'publisher@example.test', '2026-07-20T20:00:00Z');
  INSERT INTO story_clusters (id, title, topic, summary, evidence_status, publication_status, needs_human_review) VALUES
    (966, 'Archived never-published', 'models', 'Never published.', 'vendor_reported', 'withdrawn', 1);
  -- Withdrawn with a slug but an incomplete publication record (no reviewer).
  INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, published_at) VALUES
    (967, 'incomplete-withdrawn', 'Incomplete record', 'models', 'No reviewer.', 'vendor_reported', 'withdrawn', '2026-07-21T20:00:00Z');
  INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
    (961, 961, 1), (962, 962, 1), (963, 963, 1), (964, 964, 1), (965, 965, 1), (966, 966, 1);
  INSERT INTO corrections (cluster_id, correction_type, previous_statement, updated_statement, reason, corrected_by, published)
    VALUES (962, 'factual_error', 'Earlier statement.', 'Corrected statement.', 'Source item was mis-linked.', 'publisher@example.test', 1);
  INSERT INTO story_relationships (id, source_story_id, target_story_id, relationship, created_by, reviewed_at) VALUES
    ('rel-reviewed', 964, 963, 'supersedes', 'publisher@example.test', '2026-07-22T20:00:00Z'),
    ('rel-unreviewed', 964, 965, 'supersedes', 'publisher@example.test', NULL);
`);

const page = await (await import(pathToFileURL(PAGE).href)).page();
const container = await AstroContainer.create();
const render = async (slug: string) => {
  const response = await container.renderToResponse(page.default, {
    params: { slug },
    // Only the D1 binding is read by the story page.
    locals: { runtime: { env: { DB: db.asD1() } } } as unknown as App.Locals,
    request: new Request(`https://thetracemanifest.com/stories/${slug}`),
  });
  return { status: response.status, html: response.status === 200 ? await response.text() : "" };
};
const robotsNoindex = /<meta name="robots" content="noindex">/;

// Published: unchanged, no notice, indexable.
{
  const { status, html } = await render("live-story");
  assert.equal(status, 200);
  assert.match(html, /Live story headline/);
  assert.doesNotMatch(html, /data-retired-notice/);
  assert.doesNotMatch(html, robotsNoindex, "published stories stay indexable");
  assert.doesNotMatch(html, /historical, not a current assessment/);
  assert.match(html, /<h2>Summary<\/h2>/);
}

// Withdrawn: same URL, warning, historical labels, sources and correction, noindex.
{
  const { status, html } = await render("withdrawn-story");
  assert.equal(status, 200, "a withdrawn story keeps its public URL");
  assert.match(html, /data-retired-notice="withdrawn"/);
  assert.match(html, /role="note"/);
  assert.match(html, /This story has been withdrawn/);
  assert.match(html, /not current TRACE reporting and should not be treated as verified information/);
  assert.match(html, /Evidence rating at publication \(historical, not a current assessment\)/);
  assert.match(html, /Summary \(as published\)/);
  assert.match(html, /href="https:\/\/render\.example\/withdrawn"/, "historical sources stay visible");
  assert.match(html, /Corrected statement\./, "published corrections stay visible");
  assert.match(html, /\[Withdrawn: Published in error\.\]/, "the recorded reason stays visible in the analysis");
  assert.match(html, robotsNoindex);
  assert.doesNotMatch(html, /data-replacement-story/);
}

// Superseded with a reviewed link to a published replacement.
{
  const { status, html } = await render("superseded-story");
  assert.equal(status, 200);
  assert.match(html, /data-retired-notice="superseded"/);
  assert.match(html, /This story has been superseded/);
  assert.match(html, /href="\/stories\/replacement-story" data-replacement-story/);
  assert.match(html, /Current story: Replacement story headline/);
  assert.match(html, robotsNoindex);
}

// Superseded without a reviewed link: no replacement is claimed.
{
  const { status, html } = await render("orphan-superseded");
  assert.equal(status, 200);
  assert.match(html, /This story has been superseded/);
  assert.doesNotMatch(html, /data-replacement-story/, "an unreviewed relationship is not presented as a replacement");
  assert.doesNotMatch(html, /Read the current story/);
}

// Never-published and incomplete records stay private.
assert.equal((await render("incomplete-withdrawn")).status, 404, "incomplete publication metadata is not public");
assert.equal((await render("archived-never-published")).status, 404);
assert.equal((await render("no-such-story")).status, 404);

db.close();
console.log("story page render tests passed");
