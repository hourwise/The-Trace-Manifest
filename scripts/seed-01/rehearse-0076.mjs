// Local rehearsal of migration 0076 against a copy of a database snapshot.
// Never touches a remote database. Usage:
//   node scripts/seed-01/rehearse-0076.mjs <snapshot.sqlite>
// Prints a JSON report: row preservation for both governance tables, foreign
// key and integrity checks, required objects, and an append-only probe.
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [source] = process.argv.slice(2);
if (!source) throw new Error("Usage: rehearse-0076.mjs <snapshot.sqlite>");
const directory = mkdtempSync(join(tmpdir(), "trace-0076-"));
const copy = join(directory, "rehearsal.sqlite");
copyFileSync(source, copy);
const db = new DatabaseSync(copy);

const tables = ["assertion_governance_events", "assertion_governance_recalculation_jobs"];
const rows = (table) => db.prepare(`SELECT * FROM "${table}" ORDER BY id`).all();
const before = Object.fromEntries(tables.map((table) => [table, rows(table)]));
const assertionsBefore = db.prepare("SELECT COUNT(*) AS n, SUM(assertion_governance_revision) AS revisions FROM claim_assertions").get();

db.exec("PRAGMA foreign_keys = ON");
let applied = true;
let error = null;
try {
  db.exec(readFileSync(new URL("../../db/migration-0076-evidence-library-governance.sql", import.meta.url), "utf8"));
} catch (caught) {
  applied = false;
  error = caught instanceof Error ? caught.message : String(caught);
}

const report = { source, applied, error, tables: {} };
if (applied) {
  for (const table of tables) {
    const after = rows(table);
    const byId = new Map(after.map((row) => [row.id, row]));
    const mismatches = [];
    for (const row of before[table]) {
      const migrated = byId.get(row.id);
      if (!migrated) { mismatches.push(`${row.id}: missing`); continue; }
      for (const [key, value] of Object.entries(row)) if (migrated[key] !== value) mismatches.push(`${row.id}.${key}`);
      if (migrated.governance_context !== "story") mismatches.push(`${row.id}.governance_context=${migrated.governance_context}`);
    }
    report.tables[table] = { before: before[table].length, after: after.length, mismatches };
  }
  const assertionsAfter = db.prepare("SELECT COUNT(*) AS n, SUM(assertion_governance_revision) AS revisions FROM claim_assertions").get();
  report.claimAssertionsUnchanged = assertionsBefore.n === assertionsAfter.n && assertionsBefore.revisions === assertionsAfter.revisions;
  report.foreignKeyCheck = db.prepare("PRAGMA foreign_key_check").all().length;
  report.integrityCheck = db.prepare("PRAGMA integrity_check").get().integrity_check;
  report.leftoverTables = db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%_0074'").all().map((row) => row.name);
  const required = [
    "prevent_assertion_governance_event_update", "prevent_assertion_governance_event_delete",
    "prevent_assertion_governance_recalc_job_delete", "prevent_assertion_governance_recalc_job_identity_update",
    "idx_assertion_governance_events_assertion", "idx_assertion_governance_events_claim", "idx_assertion_governance_events_cluster",
    "idx_assertion_governance_events_transition", "idx_assertion_governance_events_revision",
    "idx_assertion_governance_events_freshness_review", "idx_assertion_governance_recalc_jobs_queue",
    "idx_assertion_governance_recalc_jobs_assertion", "idx_claim_assertions_governance_queue",
  ];
  report.missingObjects = required.filter((name) => !db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name));
  try {
    db.exec("UPDATE assertion_governance_events SET reason = reason");
    report.appendOnly = before.assertion_governance_events.length === 0 ? "not_probed_no_rows" : false;
  } catch {
    report.appendOnly = true;
  }
  report.ok = report.foreignKeyCheck === 0 && report.integrityCheck === "ok" && report.leftoverTables.length === 0
    && report.missingObjects.length === 0 && report.claimAssertionsUnchanged
    && Object.values(report.tables).every((table) => table.before === table.after && table.mismatches.length === 0);
}
db.close();
rmSync(directory, { recursive: true, force: true });
console.log(JSON.stringify(report, null, 1));
