import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const db = new DatabaseSync(":memory:");

function columns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function requireColumns(table, expected) {
  const actual = columns(table);
  for (const column of expected) {
    if (!actual.has(column)) throw new Error(`Missing ${table}.${column}`);
  }
}

try {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE story_clusters (
      id INTEGER PRIMARY KEY,
      publication_status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      evidence_status TEXT NOT NULL DEFAULT 'unverified'
    );
    CREATE TABLE feed_items (
      id INTEGER PRIMARY KEY,
      source_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      content_excerpt TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      ingestion_status TEXT NOT NULL DEFAULT 'raw'
    );
    CREATE TABLE claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL REFERENCES story_clusters(id),
      claim_text TEXT NOT NULL,
      claim_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'standard',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE claim_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL REFERENCES claims(id),
      feed_item_id INTEGER REFERENCES feed_items(id),
      evidence_type TEXT NOT NULL,
      evidence_summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE claim_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_a_id INTEGER NOT NULL REFERENCES claims(id),
      claim_b_id INTEGER NOT NULL REFERENCES claims(id),
      conflict_type TEXT NOT NULL,
      resolution TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER REFERENCES story_clusters(id),
      claim_id INTEGER REFERENCES claims(id),
      previous_statement TEXT NOT NULL,
      updated_statement TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_url TEXT,
      impact TEXT,
      corrected_by TEXT NOT NULL,
      corrected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`
    INSERT INTO story_clusters (id) VALUES (1);
    INSERT INTO feed_items (id, source_id, url, title) VALUES (1, 1, 'https://example.test/legacy', 'Legacy item');
    INSERT INTO claims (id, cluster_id, claim_text, claim_type) VALUES (1, 1, 'Legacy claim', 'factual');
    INSERT INTO claim_evidence (claim_id, feed_item_id, evidence_type, evidence_summary) VALUES (1, 1, 'source', 'Legacy evidence');
    INSERT INTO corrections (cluster_id, previous_statement, updated_statement, reason, corrected_by)
      VALUES (1, 'Old', 'New', 'Legacy correction', 'legacy');
  `);

  db.exec(readFileSync("db/migration-production-legacy-claims-compatibility.sql", "utf8"));

  requireColumns("claims", [
    "feed_item_id", "claim_class", "claim_domain", "evidence_quality", "confidence_score",
    "is_disputed", "is_corrected", "superseded_by", "extraction_method", "extraction_version", "updated_at",
  ]);
  requireColumns("claim_evidence", ["relationship", "source_tier", "is_primary_source"]);
  requireColumns("claim_conflicts", ["severity"]);
  requireColumns("corrections", ["correction_type", "previous_evidence_status", "updated_evidence_status", "published"]);
  requireColumns("pipeline_stages", ["feed_item_id", "stage", "algorithm_version", "status"]);

  const legacyClaim = db.prepare("SELECT claim_class, evidence_quality, is_disputed, is_corrected, extraction_method, extraction_version, updated_at FROM claims WHERE id = 1").get();
  if (
    legacyClaim?.claim_class !== "legacy_unclassified"
    || legacyClaim?.evidence_quality !== "unrated"
    || legacyClaim?.is_disputed !== 0
    || legacyClaim?.is_corrected !== 0
    || legacyClaim?.extraction_method !== "legacy_unknown"
    || legacyClaim?.extraction_version !== "legacy-pre-v2"
    || !legacyClaim?.updated_at
  ) throw new Error("Legacy claim was not preserved with fail-closed metadata");

  const legacyEvidence = db.prepare("SELECT relationship, is_primary_source FROM claim_evidence WHERE claim_id = 1").get();
  if (legacyEvidence?.relationship !== "reports" || legacyEvidence?.is_primary_source !== 0) {
    throw new Error("Legacy evidence was promoted or not given a governed relationship");
  }
  if (db.prepare("SELECT published FROM corrections WHERE id = 1").get()?.published !== 0) {
    throw new Error("Legacy correction was made public by the repair migration");
  }

  // This is the compatibility fallback used only while the legacy NOT NULL
  // claim_type column remains on production. New-schema databases use the
  // modern insert without this legacy field.
  db.prepare(`
    INSERT INTO claims
      (cluster_id, feed_item_id, claim_text, claim_type, claim_class, claim_domain, severity,
       evidence_quality, confidence_score, extraction_method, extraction_version, updated_at)
    VALUES (1, 1, 'Current claim', 'factual', 'official_vendor_claim', 'product', 'standard',
      'moderate', 0.75, 'rule_based', 'test-v1', datetime('now'))
  `).run();
  const currentClaimId = db.prepare("SELECT id FROM claims WHERE claim_text = 'Current claim'").get().id;
  db.prepare(`
    INSERT INTO claim_evidence
      (claim_id, feed_item_id, evidence_type, evidence_summary, relationship, source_tier, is_primary_source)
    VALUES (?, 1, 'source', 'Current evidence', 'reports', 'A', 1)
  `).run(currentClaimId);
  db.prepare("INSERT INTO claim_conflicts (claim_a_id, claim_b_id, conflict_type, severity) VALUES (1, ?, 'source_disagreement', 'standard')").run(currentClaimId);
  db.prepare(`
    INSERT INTO corrections
      (cluster_id, claim_id, correction_type, previous_statement, updated_statement, reason, corrected_by)
    VALUES (1, ?, 'other', 'Before', 'After', 'Test correction', 'test-editor')
  `).run(currentClaimId);
  db.prepare(`
    INSERT INTO pipeline_stages (feed_item_id, stage, algorithm_version, status)
    VALUES (1, 'claim_extracted', 'test-v1', 'completed')
  `).run();

  const integrity = db.prepare("PRAGMA integrity_check").get();
  if (integrity.integrity_check !== "ok") throw new Error(`SQLite integrity check failed: ${integrity.integrity_check}`);
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Foreign-key check failed");
  console.log("Legacy production compatibility migration preserves historical rows and supports current write shapes.");
} finally {
  db.close();
}
