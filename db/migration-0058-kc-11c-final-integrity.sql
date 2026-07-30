-- KC-11C final integrity corrections. Additive only; never edit 0056 or 0057.

-- Snapshot rows remain immutable. Authority is an append-only generation:
-- the greatest generation is the single current KC-11A authority decision.
CREATE TABLE IF NOT EXISTS knowledge_source_backfill_inventory_authority (
  generation INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  snapshot_id TEXT NOT NULL REFERENCES knowledge_source_backfill_inventory_snapshots(id),
  schema_version TEXT NOT NULL CHECK(schema_version = 'kc-11a-v1'),
  policy_version TEXT NOT NULL CHECK(policy_version = 'kc-11c-v1'),
  decision TEXT NOT NULL CHECK(decision = 'authorised'),
  actor TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_source_backfill_inventory_authority_snapshot
  ON knowledge_source_backfill_inventory_authority(snapshot_id, generation DESC);

CREATE VIEW IF NOT EXISTS knowledge_source_backfill_current_inventory_authority AS
SELECT
  authority.generation,
  authority.id AS authority_decision_id,
  authority.snapshot_id,
  authority.schema_version,
  authority.policy_version,
  authority.actor,
  authority.idempotency_key,
  authority.correlation_id,
  authority.created_at AS authorised_at,
  snapshot.inventory_identity,
  snapshot.snapshot_json,
  snapshot.created_by,
  snapshot.created_at AS snapshot_created_at
FROM knowledge_source_backfill_inventory_authority AS authority
JOIN knowledge_source_backfill_inventory_snapshots AS snapshot
  ON snapshot.id = authority.snapshot_id
ORDER BY authority.generation DESC
LIMIT 1;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_inventory_authority_no_update
BEFORE UPDATE ON knowledge_source_backfill_inventory_authority
BEGIN SELECT RAISE(ABORT, 'inventory authority decisions are append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_inventory_authority_no_delete
BEFORE DELETE ON knowledge_source_backfill_inventory_authority
BEGIN SELECT RAISE(ABORT, 'inventory authority decisions are append-only'); END;

-- A new authority generation invalidates approvals that have not begun. The
-- approved plan remains preserved; only its operational state moves forward.
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_inventory_authority_invalidate
AFTER INSERT ON knowledge_source_backfill_inventory_authority
BEGIN
  UPDATE knowledge_source_backfill_batches
  SET state = 'cancelled', updated_at = datetime('now')
  WHERE state = 'approved'
    AND json_extract(plan_json, '$.inventorySnapshotId') IS NOT NEW.snapshot_id;
END;

-- Batch identity, reviewed plan, approval, and audit identity are immutable.
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_batches_immutable_fields
BEFORE UPDATE ON knowledge_source_backfill_batches
WHEN
  NEW.id IS NOT OLD.id OR
  NEW.environment IS NOT OLD.environment OR
  NEW.inventory_schema_version IS NOT OLD.inventory_schema_version OR
  NEW.inventory_identity IS NOT OLD.inventory_identity OR
  NEW.plan_hash IS NOT OLD.plan_hash OR
  NEW.plan_json IS NOT OLD.plan_json OR
  NEW.selection_json IS NOT OLD.selection_json OR
  NEW.ceilings_json IS NOT OLD.ceilings_json OR
  NEW.approved_by IS NOT OLD.approved_by OR
  NEW.approved_at IS NOT OLD.approved_at OR
  NEW.idempotency_key IS NOT OLD.idempotency_key OR
  NEW.correlation_id IS NOT OLD.correlation_id OR
  NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'backfill batch identity and approval fields are immutable'); END;

-- Item identity and audit attribution are immutable. Outcome/result columns,
-- retry_count, and updated_at remain the only writable operational fields.
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_items_immutable_fields
BEFORE UPDATE ON knowledge_source_backfill_items
WHEN
  NEW.id IS NOT OLD.id OR
  NEW.batch_id IS NOT OLD.batch_id OR
  NEW.inventory_record_id IS NOT OLD.inventory_record_id OR
  NEW.category IS NOT OLD.category OR
  NEW.canonical_url IS NOT OLD.canonical_url OR
  NEW.idempotency_key IS NOT OLD.idempotency_key OR
  NEW.actor IS NOT OLD.actor OR
  NEW.correlation_id IS NOT OLD.correlation_id OR
  NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'backfill item identity fields are immutable'); END;

-- Attempt identity is immutable. Settlement metadata can be written exactly
-- once, only while moving a running attempt to a terminal state.
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_attempts_immutable_fields
BEFORE UPDATE ON knowledge_source_backfill_attempts
WHEN
  NEW.id IS NOT OLD.id OR
  NEW.batch_id IS NOT OLD.batch_id OR
  NEW.idempotency_key IS NOT OLD.idempotency_key OR
  NEW.actor IS NOT OLD.actor OR
  NEW.correlation_id IS NOT OLD.correlation_id OR
  NEW.started_at IS NOT OLD.started_at
BEGIN SELECT RAISE(ABORT, 'backfill attempt identity fields are immutable'); END;

CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_backfill_attempts_settlement_once
BEFORE UPDATE ON knowledge_source_backfill_attempts
WHEN
  (
    OLD.state = 'running' AND NEW.state = 'running'
    AND (NEW.completed_at IS NOT OLD.completed_at OR NEW.result_json IS NOT OLD.result_json)
  ) OR (
    OLD.state = 'running' AND NEW.state IN ('completed', 'failed')
    AND (NEW.completed_at IS NULL OR NEW.result_json IS NULL)
  ) OR (
    OLD.state IN ('completed', 'failed')
    AND (NEW.completed_at IS NOT OLD.completed_at OR NEW.result_json IS NOT OLD.result_json)
  )
BEGIN SELECT RAISE(ABORT, 'backfill attempt settlement is immutable'); END;
