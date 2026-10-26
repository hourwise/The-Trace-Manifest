import assert from "node:assert/strict";
import { promoteCandidate, recordCandidate } from "../src/lib/server/admin-page-writes";
import { canonicalSourceUrl, classifySourceRelationship, sourceUrlHash } from "../src/lib/server/source-identity";
import { hashURL } from "../workers/ingestion/dedup";
import { runClustering } from "../workers/ingestion/cluster";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-EDITORIAL-DEDUPE-R1: manual promotion and automated clustering must
// share one source identity. Before this change, Production showed:
// - promotion then ingestion: the promoted item stayed 'classified' and the
//   next clustering run gave it a second cluster (519/520/521/621/828/831);
// - a clustering run that failed part-way left an empty cluster and
//   'classified' items, so the next run clustered them again (2146/2150).

const PUBLISHER = { email: "publisher@example.test", role: "publisher" as const };

function database(): SQLiteD1 {
  const db = new SQLiteD1();
  db.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
      (801, 'Dedupe Lab', 'https://lab.example', 'A', 'A', 'primary-technical', 'rss'),
      (802, 'Dedupe Wire', 'https://wire.example', 'B', 'B', 'vendor-reported', 'rss');
  `);
  return db;
}

const classification = (topic: string, providers: string[] = []) => JSON.stringify({
  classification: { topics: [topic], models: [], providers, itemTypes: [], classificationConfidence: 60, classifiedAt: "2026-10-25T00:00:00Z", algorithmVersion: "test" },
});

async function addClassifiedItem(db: SQLiteD1, id: number, url: string, title: string, options: { source?: number; topic?: string; providers?: string[] } = {}): Promise<void> {
  db.sqlite.prepare(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status, fetched_at, published_at, raw_metadata)
    VALUES (?, ?, ?, ?, ?, 'classified', datetime('now'), datetime('now'), ?)
  `).run(id, options.source ?? 801, url, await hashURL(url), title, classification(options.topic ?? "models", options.providers));
}

async function needsReviewCandidate(db: SQLiteD1, url: string | null, lead = "A lead about a model release"): Promise<string> {
  const id = await recordCandidate(db.asD1(), PUBLISHER, {
    intakeType: url ? "manual_url" : "lead", submittedUrl: url, leadText: lead,
    sourceHash: url ? await sourceUrlHash(url) : `lead-${lead}`, section: null, urgency: "normal", sourceLanguage: null,
  });
  db.sqlite.prepare("UPDATE editorial_candidates SET state = 'needs_review' WHERE id = ?").run(id);
  return id;
}

const promote = async (db: SQLiteD1, candidateId: string, url: string | null, headline = "Promoted headline") =>
  promoteCandidate(db.asD1(), PUBLISHER, {
    candidateId, submittedUrl: url, urlHash: url ? await sourceUrlHash(url) : null,
    headline, summary: `${headline} summary`, topic: "models", evidenceStatus: "vendor_reported",
  });

const n = (db: SQLiteD1, sql: string, ...params: Array<string | number>) => Number((db.sqlite.prepare(sql).get(...params) as { n: number }).n);
const clustersOf = (db: SQLiteD1, feedItemId: number) =>
  (db.sqlite.prepare("SELECT cluster_id FROM story_cluster_members WHERE feed_item_id = ? ORDER BY cluster_id").all(feedItemId) as Array<{ cluster_id: number }>).map((row) => row.cluster_id);

// Identity: Desk and ingestion hash URLs identically.
{
  const url = "https://lab.example/post/?utm_source=x&ref=y";
  assert.equal(await hashURL(url), await sourceUrlHash(url));
  assert.equal(canonicalSourceUrl(url), "https://lab.example/post/");
  assert.equal(await sourceUrlHash("https://lab.example/a"), await sourceUrlHash("https://lab.example/a?utm_campaign=z"));
  assert.notEqual(await sourceUrlHash("https://lab.example/a"), await sourceUrlHash("https://lab.example/b"), "different URLs are different source items");
  assert.deepEqual(classifySourceRelationship([]), { kind: "new" });
}

// 1. Promotion, then ingestion: the promoted item is never clustered again.
{
  const db = database();
  const url = "https://lab.example/promoted-first";
  const outcome = await promote(db, await needsReviewCandidate(db, url), url);
  assert.equal(outcome.kind, "created");
  const itemId = Number((db.sqlite.prepare("SELECT id FROM feed_items WHERE url_hash = ?").get(await sourceUrlHash(url)) as { id: number }).id);
  // Classification later runs on the promoted item, as it does in production.
  db.sqlite.prepare("UPDATE feed_items SET ingestion_status = 'classified', fetched_at = datetime('now'), raw_metadata = ? WHERE id = ?").run(classification("models"), itemId);
  const run = await runClustering(db.asD1());
  assert.equal(run.clusters, 0, "no second cluster for an already promoted source");
  assert.equal(run.alreadyClustered, 1);
  assert.deepEqual(clustersOf(db, itemId), [(outcome as { clusterId: number }).clusterId]);
  assert.equal((db.sqlite.prepare("SELECT ingestion_status FROM feed_items WHERE id = ?").get(itemId) as { ingestion_status: string }).ingestion_status, "clustered");
  db.close();
}

// 2. Ingestion, then promotion: the candidate reuses the existing cluster.
{
  const db = database();
  const url = "https://lab.example/ingested-first";
  await addClassifiedItem(db, 811, url, "Lab releases a reasoning model");
  assert.equal((await runClustering(db.asD1())).clusters, 1);
  const [existing] = clustersOf(db, 811);
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters WHERE primary_source_key = ?", `src:${await sourceUrlHash(url)}`), 1, "ingestion records the primary source key");
  const candidateId = await needsReviewCandidate(db, url);
  const outcome = await promote(db, candidateId, url);
  assert.equal(outcome.kind, "reused", JSON.stringify(outcome));
  assert.equal((outcome as { clusterId: number }).clusterId, existing);
  assert.deepEqual(clustersOf(db, 811), [existing], "no second cluster or membership");
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), 1);
  assert.equal((db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(candidateId) as { state: string }).state, "published");
  const audit = db.sqlite.prepare("SELECT detail_code, operator_email FROM admin_audit_log WHERE action = 'promote_candidate_to_cluster' AND target_id = ?").get(candidateId) as { detail_code: string; operator_email: string };
  assert.equal(audit.detail_code, `reused_story_cluster:${existing}`);
  assert.equal(audit.operator_email, PUBLISHER.email);
  db.close();
}

// 3. Withdrawn material is not resurrected by either pipeline.
{
  const db = database();
  const url = "https://lab.example/withdrawn";
  await addClassifiedItem(db, 821, url, "Lab announces a withdrawn thing");
  await runClustering(db.asD1());
  const [withdrawnCluster] = clustersOf(db, 821);
  db.sqlite.prepare("UPDATE story_clusters SET publication_status = 'withdrawn' WHERE id = ?").run(withdrawnCluster);
  const before = n(db, "SELECT COUNT(*) AS n FROM story_clusters");
  const candidateId = await needsReviewCandidate(db, url);
  const outcome = await promote(db, candidateId, url);
  assert.equal(outcome.kind, "conflict");
  assert.equal((outcome as { reason: string }).reason, "retired");
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), before, "a conflict writes nothing");
  assert.equal((db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(candidateId) as { state: string }).state, "needs_review", "the candidate stays for an editor to decide");
  // Re-classification of the same source item does not create a new cluster either.
  db.sqlite.prepare("UPDATE feed_items SET ingestion_status = 'classified', fetched_at = datetime('now') WHERE id = 821").run();
  const run = await runClustering(db.asD1());
  assert.equal(run.clusters, 0);
  assert.deepEqual(clustersOf(db, 821), [withdrawnCluster]);
  db.close();
}

// 4. A feed item already in two current clusters (historical duplication) is ambiguous: nothing is promoted.
{
  const db = database();
  const url = "https://lab.example/historic-duplicate";
  await addClassifiedItem(db, 831, url, "Historic duplicate");
  db.sqlite.exec(`
    INSERT INTO story_clusters (id, title, topic, evidence_status, publication_status) VALUES (931, 'Dup A', 'models', 'vendor_reported', 'draft'), (932, 'Dup B', 'models', 'vendor_reported', 'review');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (931, 831, 1), (932, 831, 1);
  `);
  const outcome = await promote(db, await needsReviewCandidate(db, url), url);
  assert.equal(outcome.kind, "conflict");
  assert.equal((outcome as { reason: string }).reason, "ambiguous");
  assert.deepEqual((outcome as { clusters: Array<{ clusterId: number }> }).clusters.map((cluster) => cluster.clusterId), [931, 932]);
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), 2);
  db.close();
}

// 5. Repeated clustering is idempotent.
{
  const db = database();
  await addClassifiedItem(db, 841, "https://lab.example/one", "Lab ships the alpha toolkit", { providers: ["lab"] });
  await addClassifiedItem(db, 842, "https://wire.example/two", "Wire covers the alpha toolkit launch", { source: 802, providers: ["lab"] });
  const first = await runClustering(db.asD1());
  assert.equal(first.clusters, 1, "items about the same event in one run share a cluster (existing behaviour)");
  const snapshot = () => [n(db, "SELECT COUNT(*) AS n FROM story_clusters"), n(db, "SELECT COUNT(*) AS n FROM story_cluster_members")];
  const after = snapshot();
  db.sqlite.exec("UPDATE feed_items SET ingestion_status = 'classified' WHERE id IN (841, 842)");
  const second = await runClustering(db.asD1());
  assert.equal(second.clusters, 0);
  assert.equal(second.alreadyClustered, 2);
  assert.deepEqual(snapshot(), after, "a repeated run writes no cluster or membership");
  db.close();
}

// 6. A write failure part-way leaves nothing behind (the 2146/2150 cause).
{
  const db = database();
  await addClassifiedItem(db, 851, "https://lab.example/partial-a", "Lab partial failure story", { providers: ["lab"] });
  await addClassifiedItem(db, 852, "https://wire.example/partial-b", "Wire partial failure story", { source: 802, providers: ["lab"] });
  db.sqlite.exec(`CREATE TEMP TRIGGER fail_member BEFORE INSERT ON story_cluster_members WHEN NEW.feed_item_id = 852 BEGIN SELECT RAISE(ABORT, 'simulated D1 failure'); END;`);
  await assert.rejects(runClustering(db.asD1()), /simulated D1 failure/);
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), 0, "no empty or partial cluster");
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM feed_items WHERE ingestion_status = 'classified' AND id IN (851, 852)"), 2);
  db.sqlite.exec("DROP TRIGGER fail_member");
  assert.equal((await runClustering(db.asD1())).clusters, 1, "the retry creates exactly one cluster");
  db.close();
}

// 7. Concurrent promotion while clustering is writing: the unique key keeps one cluster.
{
  const db = database();
  const url = "https://lab.example/race-a";
  await addClassifiedItem(db, 861, url, "Race story A");
  const candidateId = await needsReviewCandidate(db, url);
  const d1 = db.asD1();
  const raced = Object.create(d1) as D1Database;
  let injected = false;
  raced.batch = (async (statements: D1PreparedStatement[]) => {
    if (!injected) {
      injected = true;
      assert.equal((await promote(db, candidateId, url)).kind, "created", "the promotion wins the race");
    }
    return d1.batch(statements);
  }) as D1Database["batch"];
  const run = await runClustering(raced);
  assert.equal(run.identityConflicts, 1);
  assert.equal(run.clusters, 0);
  assert.deepEqual(clustersOf(db, 861).length, 1, "the source item has exactly one cluster");
  const settle = await runClustering(db.asD1());
  assert.equal(settle.alreadyClustered, 1, "the next run settles the item instead of clustering it");
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), 1);
  db.close();
}

// 8. Concurrent clustering while a promotion is writing: the promotion writes nothing.
{
  const db = database();
  const url = "https://lab.example/race-b";
  const candidateId = await needsReviewCandidate(db, url);
  await addClassifiedItem(db, 871, url, "Race story B");
  const d1 = db.asD1();
  const raced = Object.create(d1) as D1Database;
  let injected = false;
  raced.batch = (async (statements: D1PreparedStatement[]) => {
    if (!injected) {
      injected = true;
      assert.equal((await runClustering(d1)).clusters, 1, "clustering wins the race");
    }
    return d1.batch(statements);
  }) as D1Database["batch"];
  const outcome = await promoteCandidate(raced, PUBLISHER, {
    candidateId, submittedUrl: url, urlHash: await sourceUrlHash(url),
    headline: "Race B", summary: "Race B summary", topic: "models", evidenceStatus: "vendor_reported",
  });
  assert.deepEqual(outcome, { kind: "source_changed" });
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), 1);
  assert.equal(clustersOf(db, 871).length, 1);
  assert.equal((db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(candidateId) as { state: string }).state, "needs_review");
  assert.equal((await promote(db, candidateId, url)).kind, "reused", "a retry reuses the cluster");
  db.close();
}

// 9. Controls: genuinely separate stories are not collapsed.
{
  const db = database();
  // Two unrelated articles from the same publisher in one run.
  await addClassifiedItem(db, 881, "https://lab.example/gpu-pricing", "Lab cuts GPU pricing for researchers", { topic: "compute" });
  await addClassifiedItem(db, 882, "https://lab.example/hiring", "Lab opens a new office in Lisbon", { topic: "industry" });
  assert.equal((await runClustering(db.asD1())).clusters, 2);
  // A follow-up from the same organisation on a new URL, in a later run.
  await addClassifiedItem(db, 883, "https://lab.example/gpu-pricing-update", "Lab cuts GPU pricing again", { topic: "compute" });
  assert.equal((await runClustering(db.asD1())).clusters, 1, "a follow-up on a new URL gets its own story");
  // Different URLs for the same release are separate source items; nothing merges them on identity.
  await addClassifiedItem(db, 884, "https://github.example/lab/releases/tag/v1", "v1", { topic: "tools" });
  await addClassifiedItem(db, 885, "https://lab.example/blog/v1", "Version one is out", { topic: "tools-blog" });
  assert.equal((await runClustering(db.asD1())).clusters, 2);
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters"), 5);
  // Lead-only candidates have no source identity and are never blocked by one another.
  const a = await promote(db, await needsReviewCandidate(db, null, "First lead with enough text"), null, "Lead one");
  const b = await promote(db, await needsReviewCandidate(db, null, "Second lead with enough text"), null, "Lead two");
  assert.equal(a.kind, "created");
  assert.equal(b.kind, "created");
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_clusters WHERE primary_source_key IS NULL"), 2);
  db.close();
}

// 10. A published story is never extended by a later clustering run.
{
  const db = database();
  await addClassifiedItem(db, 891, "https://lab.example/published", "Published lab story", { providers: ["lab"] });
  await runClustering(db.asD1());
  const [published] = clustersOf(db, 891);
  db.sqlite.prepare("UPDATE story_clusters SET publication_status = 'published' WHERE id = ?").run(published);
  await addClassifiedItem(db, 892, "https://wire.example/published-follow", "Wire on the published lab story", { source: 802, providers: ["lab"] });
  await runClustering(db.asD1());
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM story_cluster_members WHERE cluster_id = ?", published), 1, "existing published members are unchanged");
  db.close();
}

// 11. Bounds: clustering 250 items stays within D1's parameter limit and uses the membership index.
{
  const db = database();
  for (let index = 0; index < 250; index++) {
    await addClassifiedItem(db, 10_000 + index, `https://lab.example/bulk/${index}`, `Bulk item ${index} ${"x".repeat(index % 7)}`, { topic: `topic-${index}` });
  }
  const before = db.statementLog.length;
  const run = await runClustering(db.asD1());
  assert.equal(run.processed, 200, "a run considers at most 200 items");
  const statements = db.statementLog.slice(before);
  assert.ok(statements.every((statement) => statement.parameterCount <= 100), "no statement exceeds 100 parameters");
  const plan = db.sqlite.prepare("EXPLAIN QUERY PLAN SELECT cluster_id FROM story_cluster_members WHERE feed_item_id IN (1, 2, 3)").all() as Array<{ detail: string }>;
  assert.ok(plan.some((row) => /idx_story_cluster_members_feed_item_primary_cluster/.test(row.detail)), "membership lookups use the reverse index");
  db.close();
}

// 12. An already published source: promotion links to the story and changes nothing about it.
{
  const db = database();
  const url = "https://lab.example/already-published";
  await addClassifiedItem(db, 1201, url, "Lab story already published");
  await runClustering(db.asD1());
  const [published] = clustersOf(db, 1201);
  db.sqlite.prepare("UPDATE story_clusters SET publication_status = 'published', slug = 'already-published', summary = 'Published summary' WHERE id = ?").run(published);
  const before = JSON.stringify(db.sqlite.prepare("SELECT * FROM story_clusters WHERE id = ?").get(published));
  const outcome = await promote(db, await needsReviewCandidate(db, url), url);
  assert.deepEqual([outcome.kind, (outcome as { clusterId?: number }).clusterId, (outcome as { publicationStatus?: string }).publicationStatus], ["reused", published, "published"]);
  assert.equal(JSON.stringify(db.sqlite.prepare("SELECT * FROM story_clusters WHERE id = ?").get(published)), before, "the published story is not modified");
  assert.deepEqual(clustersOf(db, 1201), [published]);
  db.close();
}

// 13. Cost per run: statements scale with groups, not with existing data.
{
  const db = database();
  // Existing history that must not be scanned.
  for (let index = 0; index < 300; index++) {
    db.sqlite.prepare("INSERT INTO story_clusters (id, title, topic, evidence_status, publication_status) VALUES (?, ?, 'history', 'vendor_reported', 'published')").run(50_000 + index, `History ${index}`);
  }
  for (let index = 0; index < 10; index++) {
    await addClassifiedItem(db, 20_000 + index, `https://lab.example/cost/${index}`, `Cost item ${index} ${"y".repeat(index)}`, { topic: `cost-${index}` });
  }
  const before = db.statementLog.length;
  const run = await runClustering(db.asD1());
  const statements = db.statementLog.slice(before);
  assert.equal(run.clusters, 10);
  // 1 item read + 1 membership read + per group (cluster, 1 member, 1 status, 1 empty-guard) = 2 + 10 * 4.
  assert.equal(statements.length, 2 + 10 * 4, `clustering issued ${statements.length} statements`);
  assert.ok(statements.every((statement) => !/FROM story_clusters\s*$|FROM story_clusters\s+WHERE\s+1/i.test(statement.sql)), "no unfiltered cluster scans");
  db.close();
}

console.log("TRACE-EDITORIAL-DEDUPE-R1 tests passed");
