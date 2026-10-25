import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCorrectionsForStory,
  getPublishedSourcesForStory,
  getPublishedStories,
  getPublishedStoryBySlug,
  getSupersedingStory,
} from "../src/lib/server/d1";
import { retiredStoryNotice } from "../src/lib/public/retired-story";
import { SQLiteD1 } from "./sqlite-d1";

// A withdrawn or superseded story keeps its public page, with its status
// banner, under the corrections policy. It must not appear in any listing,
// and archived clusters that were never published must stay unreachable.
// Production cluster 381 returned 404 after its withdrawal on 2026-10-25.

const db = new SQLiteD1();
db.sqlite.exec(`
  INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
    (951, 1, 'https://retired.example/live', 'retired-live', 'Live source', 'published'),
    (952, 1, 'https://retired.example/withdrawn', 'retired-withdrawn', 'Withdrawn source', 'published'),
    (953, 1, 'https://retired.example/superseded', 'retired-superseded', 'Superseded source', 'published'),
    (954, 1, 'https://retired.example/archived', 'retired-archived', 'Archived source', 'raw');
  INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, is_published, published_at, reviewed_by, reviewed_at) VALUES
    (951, 'live-story', 'Live story', 'models', 'A live published story summary.', 'vendor_reported', 'published', 1, '2026-07-21T20:00:00Z', 'publisher@example.test', '2026-07-21T20:00:00Z'),
    (952, 'withdrawn-story', 'Withdrawn story', 'models', 'A withdrawn story summary.', 'vendor_reported', 'withdrawn', 0, '2026-07-21T20:00:00Z', 'publisher@example.test', '2026-07-21T20:00:00Z'),
    (953, 'superseded-story', 'Superseded story', 'models', 'A superseded story summary.', 'vendor_reported', 'superseded', 0, '2026-07-21T20:00:00Z', 'publisher@example.test', '2026-07-21T20:00:00Z');
  -- Archived from review without ever being published: no slug, no reviewer.
  INSERT INTO story_clusters (id, title, topic, summary, evidence_status, publication_status, needs_human_review) VALUES
    (954, 'Archived duplicate', 'models', 'Never published.', 'vendor_reported', 'withdrawn', 1);
  -- A withdrawn row with a slug but no publication record is not a retired story.
  INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status) VALUES
    (955, 'unreviewed-withdrawn', 'Unreviewed', 'models', 'Never reviewed.', 'vendor_reported', 'withdrawn');
  INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
    (951, 951, 1), (952, 952, 1), (953, 953, 1), (954, 954, 1);
`);
const d1 = db.asD1();

// The story page loader serves published and retired stories.
assert.equal((await getPublishedStoryBySlug(d1, "live-story", { includeRetired: true }))?.publicationStatus, "published");
const withdrawn = await getPublishedStoryBySlug(d1, "withdrawn-story", { includeRetired: true });
assert.equal(withdrawn?.publicationStatus, "withdrawn", "a withdrawn story keeps its page");
assert.equal((await getPublishedStoryBySlug(d1, "superseded-story", { includeRetired: true }))?.publicationStatus, "superseded");
assert.equal(await getPublishedStoryBySlug(d1, "unreviewed-withdrawn", { includeRetired: true }), null, "never-published rows stay unreachable");

// Without the option the loader is unchanged: published only.
assert.equal(await getPublishedStoryBySlug(d1, "withdrawn-story"), null);
assert.equal((await getPublishedStoryBySlug(d1, "live-story"))?.slug, "live-story");

// Listings never include retired stories.
assert.deepEqual((await getPublishedStories(d1, { limit: 100 })).map((story) => story.slug), ["live-story"]);

// The retired page keeps its sources; an archived, never-published cluster exposes none.
assert.deepEqual((await getPublishedSourcesForStory(d1, withdrawn!.id)).map((source) => source.url), ["https://retired.example/withdrawn"]);
assert.deepEqual(await getPublishedSourcesForStory(d1, 954), []);
assert.deepEqual(await getPublishedSourcesForStory(d1, 955), []);
assert.deepEqual(await getCorrectionsForStory(d1, 954), []);

// Notice wording: never shown for published stories; never claims a replacement it was not given.
{
  assert.equal(retiredStoryNotice("published"), null);
  assert.equal(retiredStoryNotice("draft"), null);
  const withdrawnNotice = retiredStoryNotice("withdrawn");
  assert.equal(withdrawnNotice?.title, "This story has been withdrawn");
  assert.match(withdrawnNotice!.paragraphs.join(" "), /should not be treated as verified information/);
  assert.doesNotMatch(withdrawnNotice!.paragraphs.join(" "), /because/, "no single cause is implied for every withdrawal");
  assert.match(withdrawnNotice!.evidenceLabel, /historical, not a current assessment/);
  const orphan = retiredStoryNotice("superseded");
  assert.equal(orphan?.replacement, null);
  assert.doesNotMatch(orphan!.paragraphs.join(" "), /Read the current story/);
  const linked = retiredStoryNotice("superseded", { slug: "live-story", headline: "Live story" });
  assert.deepEqual(linked?.replacement, { slug: "live-story", headline: "Live story" });
}

// Supersession is linked only through a reviewed relationship to a currently published story.
{
  db.sqlite.exec(`
    INSERT INTO story_relationships (id, source_story_id, target_story_id, relationship, created_by, reviewed_at) VALUES
      ('rel-ok', 951, 953, 'supersedes', 'publisher@example.test', '2026-07-22T00:00:00Z'),
      ('rel-unreviewed', 951, 952, 'supersedes', 'publisher@example.test', NULL),
      ('rel-retired-source', 952, 951, 'supersedes', 'publisher@example.test', '2026-07-22T00:00:00Z');
  `);
  assert.deepEqual(await getSupersedingStory(d1, 953), { slug: "live-story", headline: "Live story" });
  assert.equal(await getSupersedingStory(d1, 952), null, "an unreviewed relationship is not a replacement");
  assert.equal(await getSupersedingStory(d1, 951), null, "a withdrawn story is never offered as the replacement");
  const plan = db.sqlite.prepare("EXPLAIN QUERY PLAN SELECT 1 FROM story_relationships WHERE target_story_id = 953 AND relationship = 'supersedes'").all() as Array<{ detail: string }>;
  assert.ok(plan.some((row) => /idx_story_relationships_target/.test(row.detail)), "the lookup uses the target index");
}

// The page uses the retired-aware loader, shows the banners and is noindex when retired.
{
  const page = readFileSync("src/pages/stories/[slug].astro", "utf8").replace(/\r\n/g, "\n");
  assert.match(page, /getPublishedStoryBySlug\(db, slug, \{ includeRetired: true \}\)/);
  assert.match(page, /const notice = retiredStoryNotice\(story\.publicationStatus, replacement\);/);
  assert.match(page, /data-retired-notice=\{notice\.status\}/);
  assert.match(page, /noindex=\{retired\}/);
  // Rendered-HTML behaviour is covered by tests/story-page-render.test.ts on the built page.
  const layout = readFileSync("src/layouts/BaseLayout.astro", "utf8").replace(/\r\n/g, "\n");
  assert.match(layout, /\{noindex && <meta name="robots" content="noindex" \/>\}/);
}

db.close();
console.log("withdrawn story page tests passed");
