-- KC-11C corrective integrity migration. Never edit 0056 after Preview use.
CREATE TABLE IF NOT EXISTS knowledge_source_backfill_inventory_snapshots (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK(schema_version = 'kc-11a-v1'),
  inventory_identity TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  policy_version TEXT NOT NULL CHECK(policy_version = 'kc-11c-v1'),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE IF NOT EXISTS knowledge_source_backfill_attempts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES knowledge_source_backfill_batches(id),
  idempotency_key TEXT NOT NULL,
  actor TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  correlation_id TEXT NOT NULL,
  result_json TEXT,
  UNIQUE(batch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source_backfill_attempts_batch ON knowledge_source_backfill_attempts(batch_id, started_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_snapshots_no_update
BEFORE UPDATE ON knowledge_source_backfill_inventory_snapshots
BEGIN SELECT RAISE(ABORT, 'inventory snapshots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_snapshots_no_delete
BEFORE DELETE ON knowledge_source_backfill_inventory_snapshots
BEGIN SELECT RAISE(ABORT, 'inventory snapshots are immutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_batches_no_delete
BEFORE DELETE ON knowledge_source_backfill_batches
BEGIN SELECT RAISE(ABORT, 'backfill batches are immutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_items_no_delete
BEFORE DELETE ON knowledge_source_backfill_items
BEGIN SELECT RAISE(ABORT, 'backfill items are immutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_batches_state_forward
BEFORE UPDATE OF state ON knowledge_source_backfill_batches
WHEN NOT (
  NEW.state = OLD.state OR
  (OLD.state = 'planned' AND NEW.state IN ('approved','cancelled')) OR
  (OLD.state = 'approved' AND NEW.state IN ('running','cancelled')) OR
  (OLD.state = 'running' AND NEW.state IN ('partial','completed','failed')) OR
  (OLD.state = 'partial' AND NEW.state IN ('running','completed','failed'))
)
BEGIN SELECT RAISE(ABORT, 'invalid backfill batch state transition'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_items_outcome_forward
BEFORE UPDATE OF outcome ON knowledge_source_backfill_items
WHEN NOT (
  NEW.outcome = OLD.outcome OR
  (OLD.outcome = 'planned' AND NEW.outcome IN ('captured_new_document','captured_new_version','unchanged','metadata_only','unavailable','excluded','held_for_review','failed_retryable','failed_terminal')) OR
  (OLD.outcome = 'failed_retryable' AND NEW.outcome IN ('captured_new_document','captured_new_version','unchanged','metadata_only','unavailable','excluded','held_for_review','failed_retryable','failed_terminal'))
)
BEGIN SELECT RAISE(ABORT, 'invalid backfill item outcome transition'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_attempts_no_delete
BEFORE DELETE ON knowledge_source_backfill_attempts
BEGIN SELECT RAISE(ABORT, 'backfill attempts are immutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_attempts_state_forward
BEFORE UPDATE OF state ON knowledge_source_backfill_attempts
WHEN NOT (NEW.state = OLD.state OR (OLD.state = 'running' AND NEW.state IN ('completed','failed')))
BEGIN SELECT RAISE(ABORT, 'invalid backfill attempt state transition'); END;
