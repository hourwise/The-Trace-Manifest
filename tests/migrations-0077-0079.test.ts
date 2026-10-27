import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-02 E2: migrations 0077, 0078 and 0079 together, on local
// databases shaped like Production before them, in both release orders
// (editorial stream first, or newsletter stream first) and with or without
// 0069. Local verification only: it authorises nothing remote.

const read = (file: string) => readFileSync(`db/${file}`, "utf8");
const M0077 = read("migration-0077-editorial-source-identity.sql");
const M0078 = read("migration-0078-newsletter-subscriptions.sql");
const M0079 = read("migration-0079-newsletter-issues.sql");
const M0069 = read("migration-0069-trace-d1-reverse-membership-index.sql");

/** Pre-0077/0078/0079 schema: the adapter without them, then those tables dropped. */
function prior(withMigration0069: boolean): SQLiteD1 {
  const db = new SQLiteD1(true, true, true, true, true, false);
  db.sqlite.exec("DROP TABLE IF EXISTS newsletter_issues; DROP TABLE IF EXISTS email_outbox; DROP TABLE IF EXISTS newsletter_signup_attempts; DROP TABLE IF EXISTS newsletter_subscribers;");
  if (withMigration0069) db.sqlite.exec(M0069);
  db.sqlite.exec(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (9001, 1, 'https://m.example/a', 'm-a', 'A', 'clustered');
    INSERT INTO story_clusters (id, title, topic, evidence_status, publication_status) VALUES (9101, 'Legacy', 'models', 'vendor_reported', 'published'), (9102, 'Legacy twin', 'models', 'vendor_reported', 'withdrawn');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (9101, 9001, 1), (9102, 9001, 1);
  `);
  return db;
}
const schema = (db: SQLiteD1) => (db.sqlite.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<Record<string, string>>)
  .map((row) => `${row.type}:${row.name}:${row.tbl_name}:${row.sql.replace(/\s+/g, " ")}`);
const healthy = (db: SQLiteD1) => {
  assert.equal((db.sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  assert.deepEqual(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM story_cluster_members").get() as { n: number }).n), 2, "historical rows are untouched");
};

const results: Record<string, string[]> = {};
for (const with0069 of [false, true]) {
  for (const [label, order] of [["editorial-first", [M0077, M0078, M0079]], ["newsletter-first", [M0078, M0079, M0077]]] as const) {
    const db = prior(with0069);
    for (const migration of order) db.sqlite.exec(migration);
    healthy(db);
    results[`${label}${with0069 ? "+0069" : ""}`] = schema(db);
    db.close();
  }
}
const [first, ...rest] = Object.values(results);
for (const [label, shape] of Object.entries(results)) assert.deepEqual(shape, first, `${label} ends in the same schema`);
assert.equal(rest.length, 3);

// 0079 depends on nothing in 0077; 0078 must precede 0079 only by convention (no FK between them).
{
  const db = prior(false);
  db.sqlite.exec(M0079);
  db.sqlite.exec(M0078);
  healthy(db);
  db.close();
}

console.log("migrations 0077-0079 combined tests passed");
