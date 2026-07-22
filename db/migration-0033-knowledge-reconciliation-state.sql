-- TRACE Knowledge Continuity reconciliation receipts (KC-02H, migration 0033).
-- Apply after migration-0032-knowledge-continuity.sql. This is additive only:
-- it records repair/reconciliation state and does not enable capture, indexing,
-- a Queue consumer, public evidence, or automatic publication.

CREATE TABLE IF NOT EXISTS knowledge_index_operation_receipts (
  operation_id TEXT PRIMARY KEY REFERENCES knowledge_index_operations(id) ON DELETE CASCADE,
  remote_operation_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_reconciliation_runs (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES knowledge_index_operations(id) ON DELETE CASCADE,
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('manual','queue','scheduled')),
  outcome TEXT NOT NULL CHECK(outcome IN ('completed','deferred','repair_required','failed')),
  detail_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_reconciliation_runs_operation
  ON knowledge_reconciliation_runs(operation_id, created_at DESC);
