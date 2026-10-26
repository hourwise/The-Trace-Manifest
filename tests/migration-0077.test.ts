import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";

// Migration 0077 (TRACE-EDITORIAL-DEDUPE-R1) against a local database shaped
// like Production before it: migrations through 0076, without 0069 (which
// Production does not have) and without 0072 (reserved). Local verification
// only: it does not authorise applying 0077 to Preview or Production.

const MIGRATION = readFileSync("db/migration-0077-editorial-source-identity.sql", "utf8");
const statements = MIGRATION.split(/;\s*\n/).map((statement) => statement.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
const legacy = () => new SQLiteD1(true, true, true, true, true, false);
const indexes = (db: SQLiteD1) => (db.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('story_clusters','story_cluster_members') AND sql IS NOT NULL ORDER BY name").all() as Array<{ name: string; sql: string }>).map((row) => ({ ...row }));
const columns = (db: SQLiteD1) => (db.sqlite.prepare("SELECT name FROM pragma_table_info('story_clusters')").all() as Array<{ name: string }>).map((row) => row.name);
const count = (db: SQLiteD1, sql: string) => Number((db.sqlite.prepare(sql).get() as { n: number }).n);

/** The preflight the operator runs before 0077 (also in the release plan). Must return no rows. */
const PREFLIGHT = `
  SELECT 'column' AS kind, name FROM pragma_table_info('story_clusters') WHERE name = 'primary_source_key'
  UNION ALL
  SELECT 'index', name FROM sqlite_master WHERE type = 'index' AND name = 'idx_story_clusters_primary_source_key'
`;

function seedLegacy(db: SQLiteD1): void {
  db.sqlite.exec(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
      (7001, 1, 'https://legacy.example/a', 'legacy-a', 'A', 'clustered'),
      (7002, 1, 'https://legacy.example/b', 'legacy-b', 'B', 'published');
    -- Historical duplication as found in Production: two clusters for one feed item,
    -- one published, plus a withdrawn twin and an empty cluster (2146-style).
    INSERT INTO story_clusters (id, slug, title, canonical_url, topic, summary, evidence_status, publication_status, needs_human_review) VALUES
      (8001, NULL, 'Legacy A', 'https://legacy.example/a', 'models', 'S', 'vendor_reported', 'review', 1),
      (8002, NULL, 'Legacy A twin', 'https://legacy.example/a', 'models', 'S', 'vendor_reported', 'draft', 0),
      (8003, 'legacy-b', 'Legacy B', 'https://legacy.example/b', 'models', 'S', 'vendor_reported', 'published', 0),
      (8004, NULL, 'Legacy B withdrawn twin', 'https://legacy.example/b', 'models', 'S', 'vendor_reported', 'withdrawn', 1),
      (8005, NULL, 'Empty legacy cluster', NULL, 'models', 'S', 'unverified', 'draft', 0);
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (8001, 7001, 1), (8002, 7001, 1), (8003, 7002, 1), (8004, 7002, 1);
  `);
}

// 1-3. Legacy rows, historical duplicates and NULL keys survive the migration.
{
  const db = legacy();
  assert.equal(columns(db).includes("primary_source_key"), false, "the fixture is pre-0077");
  assert.equal(db.sqlite.prepare(PREFLIGHT).all().length, 0, "preflight is clean on a pre-0077 schema");
  seedLegacy(db);
  const before = db.sqlite.prepare("SELECT * FROM story_clusters ORDER BY id").all().map((row) => JSON.stringify(row));
  db.sqlite.exec(MIGRATION);
  assert.ok(columns(db).includes("primary_source_key"));
  const after = db.sqlite.prepare("SELECT * FROM story_clusters ORDER BY id").all().map((row) => {
    const { primary_source_key: key, ...rest } = row as Record<string, unknown>;
    assert.equal(key, null, "legacy rows keep a NULL key (no backfill)");
    return JSON.stringify(rest);
  });
  assert.deepEqual(after, before, "every legacy row is unchanged");
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM story_cluster_members"), 4, "historical duplicate memberships remain");
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM story_clusters WHERE primary_source_key IS NULL"), 5, "many NULL keys are allowed");

  // 4. New duplicates fail safely, leaving the first row intact.
  db.sqlite.exec("INSERT INTO story_clusters (id, title, topic, evidence_status, primary_source_key) VALUES (8010, 'Keyed', 'models', 'vendor_reported', 'src:k1')");
  assert.throws(() => db.sqlite.exec("INSERT INTO story_clusters (id, title, topic, evidence_status, primary_source_key) VALUES (8011, 'Keyed twin', 'models', 'vendor_reported', 'src:k1')"), /UNIQUE constraint failed: story_clusters\.primary_source_key/);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM story_clusters WHERE primary_source_key = 'src:k1'"), 1);
  db.sqlite.exec("UPDATE story_clusters SET publication_status = 'withdrawn' WHERE id = 8010");
  assert.throws(() => db.sqlite.exec("INSERT INTO story_clusters (id, title, topic, evidence_status, primary_source_key) VALUES (8012, 'Revive', 'models', 'vendor_reported', 'src:k1')"), /UNIQUE/, "a withdrawn cluster keeps its key: no silent resurrection");

  // 7. Search-index triggers still fire, and audit writes are unaffected.
  db.sqlite.exec("INSERT INTO story_clusters (id, title, topic, summary, evidence_status, primary_source_key) VALUES (8020, 'Search me', 'models', 'Indexed summary', 'vendor_reported', 'src:k2')");
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM knowledge_search_records WHERE record_key = 'published_story:8020'"), 1, "insert trigger");
  db.sqlite.exec("UPDATE story_clusters SET title = 'Search me again' WHERE id = 8020");
  assert.match(String((db.sqlite.prepare("SELECT content FROM knowledge_search_records WHERE record_key = 'published_story:8020'").get() as { content: string }).content), /Search me again/, "update trigger");
  db.sqlite.exec("INSERT INTO admin_audit_log (event_id, operator_email, operator_role, action, request_id, outcome) VALUES ('e-0077', 'p@example.test', 'publisher', 'migration_check', 'r-0077', 'succeeded')");

  // Query plans: lookups use the new indexes rather than scanning.
  const plan = (sql: string) => (db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>).map((row) => row.detail).join(" | ");
  assert.match(plan("SELECT cluster_id FROM story_cluster_members WHERE feed_item_id IN (7001, 7002)"), /idx_story_cluster_members_feed_item_primary_cluster/);
  assert.match(plan("SELECT id FROM story_clusters WHERE primary_source_key = 'src:k1'"), /idx_story_clusters_primary_source_key/);
  db.close();
}

// 5. Where 0069 is already applied (Preview), 0077's index statement is a no-op.
{
  const db = legacy();
  db.sqlite.exec(readFileSync("db/migration-0069-trace-d1-reverse-membership-index.sql", "utf8"));
  const before = indexes(db).filter((row) => row.name === "idx_story_cluster_members_feed_item_primary_cluster");
  assert.equal(before.length, 1);
  db.sqlite.exec(MIGRATION);
  const after = indexes(db).filter((row) => row.name === "idx_story_cluster_members_feed_item_primary_cluster");
  assert.deepEqual(after, before, "the 0069 index is kept as is");
  db.close();
}

// 6. 0072 stays reserved and untouched.
{
  assert.equal(readdirSync("db").some((file) => file.startsWith("migration-0072")), false, "no 0072 file on this branch");
  assert.doesNotMatch(statements.join(" "), /scheduler|lease/i, "0077 touches no scheduler objects");
}

// 8. Failure leaves a recoverable state.
{
  // Re-running the whole file fails at the ALTER and changes nothing.
  const db = legacy();
  db.sqlite.exec(MIGRATION);
  const shape = JSON.stringify(indexes(db));
  assert.throws(() => db.sqlite.exec(MIGRATION), /duplicate column name: primary_source_key/);
  assert.equal(JSON.stringify(indexes(db)), shape, "a mistaken re-run is harmless");
  assert.equal(db.sqlite.prepare(PREFLIGHT).all().length, 2, "the preflight would have caught the re-run");
  db.close();
}
{
  // Interrupted after the ALTER: the remaining statements are idempotent and complete it.
  const db = legacy();
  assert.match(statements[0], /^ALTER TABLE story_clusters ADD COLUMN primary_source_key TEXT$/);
  db.sqlite.exec(statements[0]);
  for (const statement of statements.slice(1)) db.sqlite.exec(statement);
  for (const statement of statements.slice(1)) db.sqlite.exec(statement);
  assert.equal(indexes(db).filter((row) => row.name === "idx_story_clusters_primary_source_key").length, 1);
  db.close();
}
{
  // Applied inside a transaction that fails, nothing is left behind.
  const db = legacy();
  db.sqlite.exec("BEGIN");
  db.sqlite.exec(MIGRATION);
  db.sqlite.exec("ROLLBACK");
  assert.equal(columns(db).includes("primary_source_key"), false);
  assert.equal(db.sqlite.prepare(PREFLIGHT).all().length, 0);
  db.close();
}
{
  // A same-named non-unique index would make CREATE UNIQUE INDEX IF NOT EXISTS a silent
  // no-op; the preflight detects it, and that is a stop condition.
  const db = legacy();
  db.sqlite.exec("CREATE INDEX idx_story_clusters_primary_source_key ON story_clusters(title)");
  assert.deepEqual(db.sqlite.prepare(PREFLIGHT).all().map((row) => ({ ...row as object })), [{ kind: "index", name: "idx_story_clusters_primary_source_key" }]);
  db.close();
}

console.log("migration 0077 compatibility tests passed");
