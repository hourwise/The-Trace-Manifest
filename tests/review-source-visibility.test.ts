import assert from "node:assert/strict";
import { pendingReviewGuidance, reviewQueueCategories, sourceConflictText } from "../src/lib/admin/review-selection";
import { loadCandidateSourceRelationships, loadClusterSourceConflicts } from "../src/lib/server/source-conflicts";
import { sourceUrlHash } from "../src/lib/server/source-identity";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task C: editors can see when a pending cluster or a Desk
// candidate shares a source item with another cluster, and what kind of
// cluster that is. Read-only: nothing is merged, approved or published.

async function seed(): Promise<SQLiteD1> {
  const db = new SQLiteD1();
  const hashOf = async (url: string) => sourceUrlHash(url);
  db.sqlite.prepare(`INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (701, 'Review Lab', 'https://review-lab.example', 'A', 'A', 'primary-technical', 'rss')`).run();
  const items: Array<[number, string]> = [
    [701, "https://review-lab.example/shared"],
    [702, "https://review-lab.example/published-shared"],
    [703, "https://review-lab.example/withdrawn-shared"],
    [704, "https://review-lab.example/solo"],
    [705, "https://review-lab.example/ambiguous"],
  ];
  for (const [id, url] of items) {
    db.sqlite.prepare("INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (?, 701, ?, ?, ?, 'clustered')").run(id, url, await hashOf(url), `Item ${id}`);
  }
  db.sqlite.exec(`
    INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, needs_human_review, published_at, reviewed_by, reviewed_at) VALUES
      (711, NULL, 'Pending A shares with pending B', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL),
      (712, NULL, 'Pending B', 'models', 'S', 'vendor_reported', 'draft', 1, NULL, NULL, NULL),
      (713, 'published-overlap', 'Published overlap', 'models', 'S', 'vendor_reported', 'published', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
      (714, NULL, 'Pending C shares with published', 'models', 'S', 'unverified', 'review', 1, NULL, NULL, NULL),
      (715, 'withdrawn-history', 'Withdrawn history', 'models', 'S', 'vendor_reported', 'withdrawn', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
      (716, NULL, 'Pending D shares with withdrawn', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL),
      (717, NULL, 'Pending E solo', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL),
      (718, NULL, 'Ambiguous one', 'models', 'S', 'vendor_reported', 'draft', 0, NULL, NULL, NULL),
      (719, NULL, 'Ambiguous two', 'models', 'S', 'vendor_reported', 'draft', 0, NULL, NULL, NULL);
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (711, 701, 1), (712, 701, 1),
      (713, 702, 1), (714, 702, 1),
      (715, 703, 1), (716, 703, 1),
      (717, 704, 1),
      (718, 705, 1), (719, 705, 1);
  `);
  return db;
}

// Pure rules.
{
  const pending = { evidence_status: "unverified" as const, source_count: 1, needs_human_review: true, publication_status: "review" as const };
  const published = { clusterId: 9, title: "T", slug: "t", publicationStatus: "published", sharedItems: 1 };
  const draft = { ...published, clusterId: 10, slug: null, publicationStatus: "draft", sharedItems: 2 };
  const withdrawn = { ...published, clusterId: 11, publicationStatus: "withdrawn" };
  assert.deepEqual(reviewQueueCategories(pending).map((c) => c.key), ["needs-review", "blocked-evidence"]);
  assert.deepEqual(reviewQueueCategories(pending, [draft, published, withdrawn]).map((c) => c.key),
    ["needs-review", "blocked-evidence", "duplicate-source", "published-overlap", "retired-overlap"]);
  assert.match(sourceConflictText(draft), /Shares 2 source items with #10 “T” \(draft cluster\)\. This is the same source item, not just a similar headline\./);
  assert.match(sourceConflictText(published), /\(published story\)/);
  const guidance = pendingReviewGuidance(pending, [draft]);
  assert.ok(guidance.reasons.includes("Shares a source item with another cluster"));
  assert.match(guidance.nextAction, /archive the duplicate before publishing either/);
  assert.equal(pendingReviewGuidance(pending).reasons.some((reason) => /Shares/.test(reason)), false, "no conflict, no warning");
}

// Loaders: bounded and correct.
{
  const db = await seed();
  const before = db.statementLog.length;
  const conflicts = await loadClusterSourceConflicts(db.asD1(), [711, 712, 714, 716, 717]);
  assert.equal(db.statementLog.length - before, 1, "one statement for the pending cards");
  assert.deepEqual(conflicts.get(711)?.map((c) => [c.clusterId, c.publicationStatus]), [[712, "draft"]]);
  assert.deepEqual(conflicts.get(714)?.map((c) => [c.clusterId, c.publicationStatus, c.slug]), [[713, "published", "published-overlap"]]);
  assert.deepEqual(conflicts.get(716)?.map((c) => [c.clusterId, c.publicationStatus]), [[715, "withdrawn"]]);
  assert.equal(conflicts.has(717), false, "a solo cluster has no conflicts");
  const plan = db.sqlite.prepare(`EXPLAIN QUERY PLAN SELECT 1 FROM story_cluster_members mine JOIN story_cluster_members theirs ON theirs.feed_item_id = mine.feed_item_id AND theirs.cluster_id <> mine.cluster_id WHERE mine.cluster_id IN (711, 712)`).all() as Array<{ detail: string }>;
  assert.ok(plan.some((row) => /idx_story_cluster_members_feed_item_primary_cluster/.test(row.detail)), "the other side uses the reverse membership index");

  const relationships = await loadCandidateSourceRelationships(db.asD1(), [
    { id: "c-exact", submittedUrl: "https://review-lab.example/solo?utm_source=x" },
    { id: "c-retired", submittedUrl: "https://review-lab.example/withdrawn-only" },
    { id: "c-ambiguous", submittedUrl: "https://review-lab.example/ambiguous" },
    { id: "c-new", submittedUrl: "https://review-lab.example/never-seen" },
    { id: "c-lead", submittedUrl: null },
  ]);
  assert.equal(relationships.get("c-exact")?.kind, "exact", "tracking parameters do not hide the existing source");
  assert.equal(relationships.get("c-new")?.kind, "new");
  assert.equal(relationships.get("c-ambiguous")?.kind, "ambiguous");
  assert.equal(relationships.has("c-lead"), false);
  db.close();
}

console.log("review source visibility tests passed");
