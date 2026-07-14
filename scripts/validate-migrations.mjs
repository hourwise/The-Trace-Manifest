import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const db = new DatabaseSync(":memory:");
try {
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of ["db/schema.sql", "db/migration-5e-publication.sql"]) db.exec(readFileSync(file, "utf8"));

  // Representative pre-stabilisation state: existing rows must survive and default closed.
  db.exec(`
    INSERT INTO models (id, name, slug, provider, openness) VALUES (1, 'Existing model', 'existing-model', 'Existing provider', 'api_only');
    INSERT INTO providers (id, name, slug) VALUES (1, 'Existing provider', 'existing-provider');
    INSERT INTO provider_models (id, provider_id, model_id) VALUES (1, 1, 1);
    INSERT INTO benchmarks (id, name, slug, purpose, domain) VALUES (1, 'Existing benchmark', 'existing-benchmark', 'Migration fixture', 'general');
    INSERT INTO benchmark_runs (id, benchmark_id, model_id, score, test_date) VALUES (1, 1, 1, 1.0, '2026-07-01');
    INSERT INTO ingestion_jobs (id, job_type, status) VALUES (1, 'fetch', 'completed');
    INSERT INTO cron_runs (id, cron_expression, status) VALUES (1, '0 0 * * *', 'completed');
  `);
  db.exec(readFileSync("db/migration-stabilisation-security.sql", "utf8"));

  const requiredTables = [
    "ai_requests", "ai_budget_reservations", "ai_usage_ledger", "ai_quota_usage",
    "ai_concurrency_leases", "ai_circuit_breakers", "admin_request_nonces", "admin_audit_log",
  ];
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const table of requiredTables) if (!tables.has(table)) throw new Error(`Missing table ${table}`);

  const jobColumns = new Set(db.prepare("PRAGMA table_info(ingestion_jobs)").all().map((row) => row.name));
  for (const column of ["result_status", "items_rejected", "items_skipped", "outcome_detail"]) {
    if (!jobColumns.has(column)) throw new Error(`Missing ingestion job outcome column ${column}`);
  }
  const cronColumns = new Set(db.prepare("PRAGMA table_info(cron_runs)").all().map((row) => row.name));
  for (const column of ["items_failed", "items_rejected", "items_skipped", "outcome_detail"]) {
    if (!cronColumns.has(column)) throw new Error(`Missing cron outcome column ${column}`);
  }
  for (const table of ["models", "providers", "provider_models", "benchmarks", "benchmark_runs"]) {
    const row = db.prepare(`SELECT publication_status FROM ${table} WHERE id = 1`).get();
    if (row?.publication_status !== "draft") throw new Error(`${table} existing row did not default to draft`);
  }
  if (db.prepare("SELECT result_status FROM ingestion_jobs WHERE id = 1").get()?.result_status !== "legacy_completed_unknown") {
    throw new Error("existing ingestion job was presented as a newly verified outcome");
  }

  db.prepare("INSERT INTO ai_requests (request_id, idempotency_key_hash, task_type, state) VALUES (?, ?, 'ask_trace', 'received')").run("request-1", "idem-1");
  let constraintHeld = false;
  try {
    db.prepare("INSERT INTO ai_requests (request_id, idempotency_key_hash, task_type, state, attempt_count) VALUES (?, ?, 'ask_trace', 'received', 2)").run("request-2", "idem-2");
  } catch { constraintHeld = true; }
  if (!constraintHeld) throw new Error("AI attempt-count constraint did not hold");

  const integrity = db.prepare("PRAGMA integrity_check").get();
  if (integrity.integrity_check !== "ok") throw new Error(`SQLite integrity check failed: ${integrity.integrity_check}`);
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Foreign-key check failed");
  console.log("Schema and additive migrations apply cleanly with required constraints.");
} finally {
  db.close();
}
