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
  db.exec(readFileSync("db/migration-0015-editorial-desk.sql", "utf8"));
  db.exec(readFileSync("db/migration-0016-knowledge-builder-foundation.sql", "utf8"));
  db.exec(readFileSync("db/migration-0017-multilingual-source-provenance.sql", "utf8"));
  db.exec(readFileSync("db/migration-0032-knowledge-continuity.sql", "utf8"));
  db.exec(readFileSync("db/migration-0032-knowledge-continuity.sql", "utf8"));
  db.exec(readFileSync("db/migration-0033-knowledge-reconciliation-state.sql", "utf8"));
  db.exec(readFileSync("db/migration-0033-knowledge-reconciliation-state.sql", "utf8"));

  const requiredTables = [
    "ai_requests", "ai_budget_reservations", "ai_usage_ledger", "ai_quota_usage",
    "ai_concurrency_leases", "ai_circuit_breakers", "admin_request_nonces", "admin_audit_log",
    "question_gaps", "question_gap_examples", "knowledge_documents", "knowledge_document_revisions",
    "knowledge_document_sources", "knowledge_document_relationships", "knowledge_generation_jobs",
    "feed_item_translations", "source_documents", "source_document_versions", "source_chunks",
    "provenance_groups", "source_provenance_memberships", "canonical_claims", "claim_assertions",
    "story_claims", "knowledge_document_claims", "knowledge_document_claim_assertions",
    "story_relationships", "knowledge_change_proposals", "evidence_score_snapshots",
    "knowledge_processing_jobs", "knowledge_index_operations", "knowledge_index_operation_receipts",
    "knowledge_reconciliation_runs",
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
  const feedItemColumns = new Set(db.prepare("PRAGMA table_info(feed_items)").all().map((row) => row.name));
  for (const column of ["source_language", "detected_language", "original_title", "original_content_hash", "translation_status"]) {
    if (!feedItemColumns.has(column)) throw new Error(`Missing feed item language column ${column}`);
  }
  for (const table of ["models", "providers", "provider_models", "benchmarks", "benchmark_runs"]) {
    const row = db.prepare(`SELECT publication_status FROM ${table} WHERE id = 1`).get();
    if (row?.publication_status !== "draft") throw new Error(`${table} existing row did not default to draft`);
  }
  if (db.prepare("SELECT result_status FROM ingestion_jobs WHERE id = 1").get()?.result_status !== "legacy_completed_unknown") {
    throw new Error("existing ingestion job was presented as a newly verified outcome");
  }

  db.prepare(`
    INSERT INTO knowledge_documents
      (id, canonical_question, canonical_hash, section_slug, knowledge_type, policy_version, created_by)
    VALUES ('knowledge-1', 'What is TRACE?', 'knowledge-hash-1', 'ai-agents', 'definition', 'test-policy', 'test-editor')
  `).run();
  const knowledge = db.prepare("SELECT status, visibility FROM knowledge_documents WHERE id = 'knowledge-1'").get();
  if (knowledge?.status !== "draft" || knowledge?.visibility !== "internal") {
    throw new Error("knowledge documents did not default closed");
  }
  let publicKnowledgeConstraintHeld = false;
  try {
    db.prepare(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type, visibility, policy_version, created_by)
      VALUES ('knowledge-public', 'Unsafe public knowledge', 'knowledge-hash-public', 'ai-agents', 'definition', 'public_knowledge', 'test-policy', 'test-editor')
    `).run();
  } catch { publicKnowledgeConstraintHeld = true; }
  if (!publicKnowledgeConstraintHeld) throw new Error("unreviewed knowledge could be made public");
  let traceEvidenceConstraintHeld = false;
  try {
    db.prepare(`
      INSERT INTO knowledge_document_sources
        (id, knowledge_document_id, source_reference, source_kind, source_role, admission_state, freshness_state, independent_evidence_weight)
      VALUES ('source-invalid', 'knowledge-1', 'trace-story-1', 'trace_story', 'evidence', 'admitted', 'current', 1)
    `).run();
  } catch { traceEvidenceConstraintHeld = true; }
  if (!traceEvidenceConstraintHeld) throw new Error("TRACE synthesis could be recorded as independent evidence");

  db.prepare(`
    INSERT INTO feed_items
      (id, source_id, url, url_hash, title, original_title, original_content_hash, source_language, detected_language, translation_status)
    VALUES (501, 1, 'https://example.com/original', 'multilingual-url-hash', 'Original title', 'Original title', 'original-content-hash', 'ja', 'ja', 'detected')
  `).run();
  db.prepare(`
    INSERT INTO feed_item_translations
      (id, feed_item_id, target_language, original_content_hash, translated_title, translation_content_hash, translation_status)
    VALUES ('translation-valid', 501, 'en', 'original-content-hash', 'Translated title', 'translation-content-hash', 'translated_unreviewed')
  `).run();
  const translation = db.prepare("SELECT independent_evidence_weight FROM feed_item_translations WHERE id = 'translation-valid'").get();
  if (translation?.independent_evidence_weight !== 0) throw new Error("translation did not default to zero independent-evidence weight");
  let translationHashConstraintHeld = false;
  try {
    db.prepare(`
      INSERT INTO feed_item_translations
        (id, feed_item_id, target_language, original_content_hash, translation_content_hash, translation_status)
      VALUES ('translation-invalid', 501, 'fr', 'original-content-hash', 'original-content-hash', 'translated_unreviewed')
    `).run();
  } catch { translationHashConstraintHeld = true; }
  if (!translationHashConstraintHeld) throw new Error("translation hash could equal original hash");

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
