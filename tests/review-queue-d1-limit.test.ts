import assert from "node:assert/strict";
import { listReviewQueueClusters, REVIEW_QUEUE_SOURCE_NAME_BATCH_SIZE } from "../src/lib/server/review-queue";
import { D1_MAX_BOUND_PARAMETERS, SQLiteD1 } from "./sqlite-d1";

// D5: Production D1 rejects statements with more than 100 bound parameters,
// while the publishable Review Queue allows 200 clusters.

const SOURCE_BASE = 50_000;
const CLUSTER_BASE = 70_000;
const sourceName = (index: number) => `Fixture source ${String(index).padStart(3, "0")}`;
const clusterIndex = (id: number) => id - CLUSTER_BASE;

function seedClusters(database: SQLiteD1, count: number): void {
  const sourceInsert = database.sqlite.prepare(
    "INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (?, ?, ?, 'A', 'A', 'd5 fixture', 'rss')",
  );
  const feedInsert = database.sqlite.prepare(
    "INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (?, ?, ?, ?, ?, 'clustered')",
  );
  const clusterInsert = database.sqlite.prepare(
    "INSERT INTO story_clusters (id, title, evidence_status, publication_status, needs_human_review, created_at, updated_at) VALUES (?, ?, 'confirmed', 'draft', 0, ?, ?)",
  );
  const memberInsert = database.sqlite.prepare(
    "INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (?, ?, ?)",
  );
  for (let index = 1; index <= count + 1; index += 1) {
    sourceInsert.run(SOURCE_BASE + index, sourceName(index), `https://source-${index}.example`);
    feedInsert.run(SOURCE_BASE + index, SOURCE_BASE + index, `https://source-${index}.example/item`, `d5-feed-${index}`, `Item ${index}`);
  }
  // Cluster i is reported by sources i (primary) and i + 1; distinct timestamps
  // give a deterministic list order (updated_at DESC = cluster id DESC).
  for (let index = 1; index <= count; index += 1) {
    const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    clusterInsert.run(CLUSTER_BASE + index, `D5 cluster ${index}`, stamp, stamp);
    memberInsert.run(CLUSTER_BASE + index, SOURCE_BASE + index, 1);
    memberInsert.run(CLUSTER_BASE + index, SOURCE_BASE + index + 1, 0);
  }
}

function sourceNameStatements(database: SQLiteD1) {
  return database.statementLog.filter((entry) => entry.sql.includes("ranked_source_names"));
}

// The adapter itself enforces D1's limit.
{
  const database = new SQLiteD1();
  const at = (count: number) => database.prepare(`SELECT ${Array.from({ length: count }, () => "?").join(" + ")} AS total`)
    .bind(...Array.from({ length: count }, () => 1)).first<{ total: number }>();
  assert.equal((await at(D1_MAX_BOUND_PARAMETERS))?.total, 100, "100 bound parameters are accepted");
  await assert.rejects(at(D1_MAX_BOUND_PARAMETERS + 1), /too many SQL variables \(101 bound parameters/, "101 bound parameters fail like D1");
  database.close();
}

assert.equal(REVIEW_QUEUE_SOURCE_NAME_BATCH_SIZE <= D1_MAX_BOUND_PARAMETERS, true);

for (const count of [100, 101, 200]) {
  const database = new SQLiteD1();
  try {
    seedClusters(database, count);
    database.statementLog.length = 0;
    const rows = await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 200 });

    assert.equal(rows.length, count, `${count}: every publishable cluster is listed`);
    assert.deepEqual(rows.map((row) => clusterIndex(row.id)), Array.from({ length: count }, (_, index) => count - index), `${count}: deterministic order`);
    for (const row of rows) {
      assert.deepEqual(row.source_names, [sourceName(clusterIndex(row.id)), sourceName(clusterIndex(row.id) + 1)], `${count}: cluster ${row.id} keeps its own source names in primary order`);
    }

    const batches = sourceNameStatements(database);
    assert.equal(batches.length, Math.ceil(count / REVIEW_QUEUE_SOURCE_NAME_BATCH_SIZE), `${count}: minimum number of bounded lookups, no per-cluster fan-out`);
    assert.deepEqual(batches.map((entry) => entry.parameterCount), count <= 100 ? [count] : [100, count - 100], `${count}: batch sizes`);
    assert.equal(Math.max(...database.statementLog.map((entry) => entry.parameterCount)) <= D1_MAX_BOUND_PARAMETERS, true, `${count}: no statement exceeds D1's limit`);
    assert.equal(database.statementLog.length, 1 + batches.length, `${count}: one list query plus the source-name batches`);

    if (count > 100) {
      // Rows 100 and 101 of the list sit on either side of the batch boundary.
      for (const row of [rows.at(99)!, rows.at(100)!]) {
        assert.deepEqual(row.source_names, [sourceName(clusterIndex(row.id)), sourceName(clusterIndex(row.id) + 1)], `${count}: names merge correctly across the batch boundary (cluster ${row.id})`);
      }
    }
  } finally {
    database.close();
  }
}

// The 200-cluster cap still holds with more publishable clusters than that.
{
  const database = new SQLiteD1();
  try {
    seedClusters(database, 250);
    database.statementLog.length = 0;
    const rows = await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 200 });
    assert.equal(rows.length, 200, "the publishable queue stays capped at 200");
    assert.equal(clusterIndex(rows.at(0)!.id), 250);
    assert.equal(clusterIndex(rows.at(-1)!.id), 51);
    assert.equal(sourceNameStatements(database).length, 2);
  } finally {
    database.close();
  }
}

console.log("review queue D1 parameter-limit tests passed");
