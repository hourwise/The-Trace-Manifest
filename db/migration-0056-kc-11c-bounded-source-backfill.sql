-- KC-11C bounded, review-gated source backfill ledger. Additive only.
CREATE TABLE IF NOT EXISTS knowledge_source_backfill_batches (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment = 'preview'),
  inventory_schema_version TEXT NOT NULL,
  inventory_identity TEXT NOT NULL,
  plan_hash TEXT NOT NULL UNIQUE,
  plan_json TEXT NOT NULL,
  selection_json TEXT NOT NULL,
  ceilings_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','approved','running','partial','completed','failed','cancelled')),
  approved_by TEXT,
  approved_at TEXT,
  executed_at TEXT,
  idempotency_key TEXT UNIQUE,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((state = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR state <> 'approved')
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source_backfill_batches_state ON knowledge_source_backfill_batches(state, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_source_backfill_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES knowledge_source_backfill_batches(id) ON DELETE CASCADE,
  inventory_record_id TEXT NOT NULL,
  category TEXT NOT NULL,
  canonical_url TEXT,
  source_document_id TEXT REFERENCES source_documents(id) ON DELETE SET NULL,
  source_document_version_id TEXT REFERENCES source_document_versions(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('planned','captured_new_document','captured_new_version','unchanged','metadata_only','unavailable','excluded','held_for_review','failed_retryable','failed_terminal')),
  reason_code TEXT,
  http_status INTEGER,
  retrieved_url TEXT,
  redirect_count INTEGER CHECK(redirect_count IS NULL OR redirect_count >= 0),
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length >= 0),
  content_hash TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count >= 0),
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(batch_id, inventory_record_id),
  UNIQUE(idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source_backfill_items_outcome ON knowledge_source_backfill_items(outcome, updated_at ASC);

CREATE TABLE IF NOT EXISTS knowledge_source_backfill_item_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES knowledge_source_backfill_batches(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES knowledge_source_backfill_items(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  metadata_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source_backfill_events_item ON knowledge_source_backfill_item_events(item_id, created_at ASC);

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_events_no_update
BEFORE UPDATE ON knowledge_source_backfill_item_events
BEGIN SELECT RAISE(ABORT, 'backfill item events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_events_no_delete
BEFORE DELETE ON knowledge_source_backfill_item_events
BEGIN SELECT RAISE(ABORT, 'backfill item events are append-only'); END;
