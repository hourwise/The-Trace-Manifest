import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Migration 0079 (TRACE Weekly issues), checked locally after 0078. Local
// verification only: it does not authorise applying 0079 to Preview or Production.

const MIGRATION = readFileSync("db/migration-0079-newsletter-issues.sql", "utf8");
function base(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of ["schema.sql", "migration-5e-publication.sql", "migration-stabilisation-security.sql", "migration-0078-newsletter-subscriptions.sql"]) {
    db.exec(readFileSync(`db/${file}`, "utf8"));
  }
  return db;
}
const insert = (values: Record<string, string | number | null>) =>
  `INSERT INTO newsletter_issues (${Object.keys(values).join(", ")}) VALUES (${Object.values(values).map((value) => value === null ? "NULL" : typeof value === "number" ? value : `'${value}'`).join(", ")})`;
const draft = { id: "i1", issue_date: "2026-10-25", version: 1, window_start: "2026-10-19 00:00:00", window_end: "2026-10-25 23:59:59", status: "draft", intro: "Intro text for the issue.", snapshot_json: "{\"stories\":[]}", content_hash: "h1", created_by: "p@example.test" };

{
  const db = base();
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'newsletter_issues'").get(), undefined, "preflight: absent");
  db.exec(MIGRATION);
  db.exec(MIGRATION);
  db.exec(insert(draft));
  assert.throws(() => db.exec(insert({ ...draft, id: "i2" })), /UNIQUE constraint failed: newsletter_issues\.issue_date, newsletter_issues\.version/, "one row per date and version");
  assert.throws(() => db.exec(insert({ ...draft, id: "i3", version: 2, status: "approved" })), /CHECK constraint failed/, "approval needs an approver and the matching hash");
  db.exec(insert({ ...draft, id: "i4", version: 3, status: "approved", approved_by: "p@example.test", approved_content_hash: "h1" }));
  assert.throws(() => db.exec("UPDATE newsletter_issues SET content_hash = 'edited' WHERE id = 'i4'"), /CHECK constraint failed/, "content cannot change under an approval");
  assert.throws(() => db.exec("UPDATE newsletter_issues SET status = 'ready_for_dispatch' WHERE id = 'i4'"), /CHECK constraint failed/, "ready needs a dispatch key");
  db.exec("UPDATE newsletter_issues SET status = 'ready_for_dispatch', dispatch_key = 'dk-1' WHERE id = 'i4'");
  assert.throws(() => db.exec(insert({ ...draft, id: "i5", version: 4, status: "ready_for_dispatch", approved_by: "p", approved_content_hash: "h1", dispatch_key: "dk-1" })), /UNIQUE constraint failed: newsletter_issues\.dispatch_key/, "a dispatch key is used once");
  assert.throws(() => db.exec(insert({ ...draft, id: "i6", version: 5, status: "sent" })), /CHECK constraint failed/);
  const plan = (db.prepare("EXPLAIN QUERY PLAN SELECT id FROM newsletter_issues ORDER BY issue_date DESC, version DESC LIMIT 20").all() as Array<{ detail: string }>).map((row) => row.detail).join(" | ");
  assert.match(plan, /idx_newsletter_issues_recent/, "the issue list is indexed");
  const rolled = base();
  rolled.exec("BEGIN");
  rolled.exec(MIGRATION);
  rolled.exec("ROLLBACK");
  assert.equal(rolled.prepare("SELECT 1 FROM sqlite_master WHERE name = 'newsletter_issues'").get(), undefined);
}

console.log("migration 0079 tests passed");
