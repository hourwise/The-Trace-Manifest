-- TRACE V1 EDITORIAL-03C: durable deterministic claim-extraction audit.
-- Additive local candidate only. Do not apply remotely from this branch.

CREATE TABLE IF NOT EXISTS claim_extraction_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK(trigger IN ('manual_admin','scheduler')),
  algorithm_version TEXT NOT NULL,
  request_id TEXT,
  operator_email TEXT,
  operator_role TEXT CHECK(operator_role IS NULL OR operator_role IN ('reader','publisher')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','completed_with_failures','failed','interrupted')),
  selected_count INTEGER NOT NULL DEFAULT 0 CHECK(selected_count >= 0),
  processed_count INTEGER NOT NULL DEFAULT 0 CHECK(processed_count >= 0),
  no_claim_count INTEGER NOT NULL DEFAULT 0 CHECK(no_claim_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_count >= 0),
  extracted_claim_count INTEGER NOT NULL DEFAULT 0 CHECK(extracted_claim_count >= 0),
  new_assertion_count INTEGER NOT NULL DEFAULT 0 CHECK(new_assertion_count >= 0),
  canonical_write_success_count INTEGER NOT NULL DEFAULT 0 CHECK(canonical_write_success_count >= 0),
  failure_code TEXT,
  failure_message TEXT CHECK(failure_message IS NULL OR length(failure_message) <= 1000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(operator_email IS NOT NULL OR operator_role IS NULL OR trigger = 'scheduler')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_extraction_runs_request
  ON claim_extraction_runs(request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_extraction_runs_started
  ON claim_extraction_runs(started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_claim_extraction_runs_status
  ON claim_extraction_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS claim_extraction_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES claim_extraction_runs(id) ON DELETE RESTRICT,
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  selected_at TEXT NOT NULL DEFAULT (datetime('now')),
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK(outcome IN ('pending','extracted','no_claims','failed')),
  pipeline_stage_id INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  extracted_claim_count INTEGER NOT NULL DEFAULT 0 CHECK(extracted_claim_count >= 0),
  new_assertion_count INTEGER NOT NULL DEFAULT 0 CHECK(new_assertion_count >= 0),
  canonical_write_success_count INTEGER NOT NULL DEFAULT 0 CHECK(canonical_write_success_count >= 0),
  failure_code TEXT,
  failure_message TEXT CHECK(failure_message IS NULL OR length(failure_message) <= 1000),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, feed_item_id),
  UNIQUE(run_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_claim_extraction_run_items_run_order
  ON claim_extraction_run_items(run_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_claim_extraction_run_items_feed
  ON claim_extraction_run_items(feed_item_id, selected_at DESC);

CREATE TABLE IF NOT EXISTS claim_extraction_run_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES claim_extraction_runs(id) ON DELETE RESTRICT,
  run_item_id INTEGER NOT NULL REFERENCES claim_extraction_run_items(id) ON DELETE RESTRICT,
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id) ON DELETE RESTRICT,
  effect_ordinal INTEGER NOT NULL CHECK(effect_ordinal >= 0),
  claim_text TEXT NOT NULL CHECK(length(claim_text) <= 500),
  claim_class TEXT NOT NULL,
  claim_domain TEXT NOT NULL,
  attempt_outcome TEXT NOT NULL CHECK(attempt_outcome IN ('inserted','reused','failed')),
  source_document_id TEXT,
  source_document_version_id TEXT,
  canonical_claim_id TEXT,
  assertion_id TEXT,
  canonical_claim_inserted INTEGER CHECK(canonical_claim_inserted IS NULL OR canonical_claim_inserted IN (0,1)),
  assertion_inserted INTEGER CHECK(assertion_inserted IS NULL OR assertion_inserted IN (0,1)),
  story_claim_inserted INTEGER CHECK(story_claim_inserted IS NULL OR story_claim_inserted IN (0,1)),
  failure_code TEXT,
  failure_message TEXT CHECK(failure_message IS NULL OR length(failure_message) <= 1000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_item_id, effect_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_claim_extraction_run_effects_run
  ON claim_extraction_run_effects(run_id, run_item_id, effect_ordinal);
CREATE INDEX IF NOT EXISTS idx_claim_extraction_run_effects_assertion
  ON claim_extraction_run_effects(assertion_id);

CREATE TRIGGER IF NOT EXISTS prevent_claim_extraction_run_delete
BEFORE DELETE ON claim_extraction_runs
BEGIN
  SELECT RAISE(ABORT, 'claim extraction runs are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_claim_extraction_run_identity_update
BEFORE UPDATE OF id, trigger, algorithm_version, request_id, operator_email,
  operator_role, started_at, created_at
ON claim_extraction_runs
BEGIN
  SELECT RAISE(ABORT, 'claim extraction run identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_claim_extraction_run_item_delete
BEFORE DELETE ON claim_extraction_run_items
BEGIN
  SELECT RAISE(ABORT, 'claim extraction run items are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_claim_extraction_run_item_identity_update
BEFORE UPDATE OF id, run_id, feed_item_id, ordinal, selected_at, created_at
ON claim_extraction_run_items
BEGIN
  SELECT RAISE(ABORT, 'claim extraction run item identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_claim_extraction_run_effect_delete
BEFORE DELETE ON claim_extraction_run_effects
BEGIN
  SELECT RAISE(ABORT, 'claim extraction run effects are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_claim_extraction_run_effect_identity_update
BEFORE UPDATE OF id, run_id, run_item_id, feed_item_id, effect_ordinal,
  claim_text, claim_class, claim_domain, created_at
ON claim_extraction_run_effects
BEGIN
  SELECT RAISE(ABORT, 'claim extraction run effect identity is immutable');
END;
