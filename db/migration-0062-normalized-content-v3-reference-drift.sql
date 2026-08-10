-- KC-11C normalized-content v3. Content identity is now separate from
-- observation-level link/reference state. Existing v1/v2 rows and IDs remain
-- immutable; this migration only expands accepted forward version domains.
PRAGMA defer_foreign_keys = ON;

ALTER TABLE source_document_versions ADD COLUMN hash_semantics_version__0062 TEXT;
UPDATE source_document_versions SET hash_semantics_version__0062 = hash_semantics_version;
ALTER TABLE source_document_versions DROP COLUMN hash_semantics_version;
ALTER TABLE source_document_versions ADD COLUMN hash_semantics_version TEXT NOT NULL DEFAULT 'legacy_raw_v1'
  CHECK(hash_semantics_version IN ('legacy_raw_v1', 'normalized_content_v1', 'normalized_content_v2', 'normalized_content_v3'));
UPDATE source_document_versions SET hash_semantics_version = hash_semantics_version__0062;
ALTER TABLE source_document_versions DROP COLUMN hash_semantics_version__0062;

ALTER TABLE knowledge_source_backfill_items ADD COLUMN hash_semantics_version__0062 TEXT;
UPDATE knowledge_source_backfill_items SET hash_semantics_version__0062 = hash_semantics_version;
ALTER TABLE knowledge_source_backfill_items DROP COLUMN hash_semantics_version;
ALTER TABLE knowledge_source_backfill_items ADD COLUMN hash_semantics_version TEXT NOT NULL DEFAULT 'legacy_raw_v1'
  CHECK(hash_semantics_version IN ('legacy_raw_v1', 'normalized_content_v1', 'normalized_content_v2', 'normalized_content_v3'));
UPDATE knowledge_source_backfill_items SET hash_semantics_version = hash_semantics_version__0062;
ALTER TABLE knowledge_source_backfill_items DROP COLUMN hash_semantics_version__0062;

CREATE TABLE source_document_version_observations__0062_new (
  id TEXT PRIMARY KEY,
  source_document_version_id TEXT NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
  transport_hash TEXT NOT NULL,
  normalized_content_hash TEXT NOT NULL,
  hash_semantics_version TEXT NOT NULL
    CHECK(hash_semantics_version IN ('normalized_content_v1', 'normalized_content_v2', 'normalized_content_v3')),
  retrieved_url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  http_status INTEGER,
  media_type TEXT,
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length >= 0),
  extraction_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  normalized_metadata_hash TEXT,
  normalized_blocks_hash TEXT,
  normalized_links_hash TEXT,
  normalized_structure_hash TEXT,
  block_count INTEGER CHECK(block_count IS NULL OR block_count >= 0),
  link_count INTEGER CHECK(link_count IS NULL OR link_count >= 0),
  heading_count INTEGER CHECK(heading_count IS NULL OR heading_count >= 0),
  extraction_container TEXT
    CHECK(extraction_container IS NULL OR extraction_container IN ('article', 'main', 'body', 'document', 'not_applicable')),
  extraction_truncated INTEGER CHECK(extraction_truncated IS NULL OR extraction_truncated IN (0, 1)),
  normalization_policy_version TEXT,
  UNIQUE(source_document_version_id, transport_hash)
);
INSERT INTO source_document_version_observations__0062_new (
  id, source_document_version_id, transport_hash, normalized_content_hash,
  hash_semantics_version, retrieved_url, retrieved_at, http_status, media_type,
  byte_length, extraction_version, created_at, normalized_metadata_hash,
  normalized_blocks_hash, normalized_links_hash, normalized_structure_hash,
  block_count, link_count, heading_count, extraction_container,
  extraction_truncated, normalization_policy_version
)
SELECT
  id, source_document_version_id, transport_hash, normalized_content_hash,
  hash_semantics_version, retrieved_url, retrieved_at, http_status, media_type,
  byte_length, extraction_version, created_at, normalized_metadata_hash,
  normalized_blocks_hash, normalized_links_hash, normalized_structure_hash,
  block_count, link_count, heading_count, extraction_container,
  extraction_truncated, normalization_policy_version
FROM source_document_version_observations;
DROP TABLE source_document_version_observations;
ALTER TABLE source_document_version_observations__0062_new RENAME TO source_document_version_observations;
CREATE INDEX idx_source_document_version_observations_version
  ON source_document_version_observations(source_document_version_id, created_at DESC);

CREATE TABLE knowledge_source_backfill_inventory_authority__0062_backup AS
SELECT generation, id, snapshot_id, schema_version, policy_version, decision,
       actor, idempotency_key, correlation_id, created_at
FROM knowledge_source_backfill_inventory_authority;
DROP VIEW knowledge_source_backfill_current_inventory_authority;
DROP TABLE knowledge_source_backfill_inventory_authority;

CREATE TABLE knowledge_source_backfill_inventory_snapshots__0062_new (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK(schema_version = 'kc-11a-v1'),
  inventory_identity TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  policy_version TEXT NOT NULL CHECK(policy_version IN ('kc-11c-v1', 'kc-11c-v2', 'kc-11c-v3')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
INSERT INTO knowledge_source_backfill_inventory_snapshots__0062_new
  (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by, created_at, active)
SELECT id, schema_version, inventory_identity, snapshot_json, policy_version,
       created_by, created_at, active
FROM knowledge_source_backfill_inventory_snapshots;
DROP TABLE knowledge_source_backfill_inventory_snapshots;
ALTER TABLE knowledge_source_backfill_inventory_snapshots__0062_new
  RENAME TO knowledge_source_backfill_inventory_snapshots;
CREATE TRIGGER trg_knowledge_source_backfill_snapshots_no_update
BEFORE UPDATE ON knowledge_source_backfill_inventory_snapshots
BEGIN SELECT RAISE(ABORT, 'inventory snapshots are immutable'); END;
CREATE TRIGGER trg_knowledge_source_backfill_snapshots_no_delete
BEFORE DELETE ON knowledge_source_backfill_inventory_snapshots
BEGIN SELECT RAISE(ABORT, 'inventory snapshots are immutable'); END;

CREATE TABLE knowledge_source_backfill_inventory_authority (
  generation INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  snapshot_id TEXT NOT NULL REFERENCES knowledge_source_backfill_inventory_snapshots(id),
  schema_version TEXT NOT NULL CHECK(schema_version = 'kc-11a-v1'),
  policy_version TEXT NOT NULL CHECK(policy_version IN ('kc-11c-v1', 'kc-11c-v2', 'kc-11c-v3')),
  decision TEXT NOT NULL CHECK(decision = 'authorised'),
  actor TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO knowledge_source_backfill_inventory_authority
  (generation, id, snapshot_id, schema_version, policy_version, decision,
   actor, idempotency_key, correlation_id, created_at)
SELECT generation, id, snapshot_id, schema_version, policy_version, decision,
       actor, idempotency_key, correlation_id, created_at
FROM knowledge_source_backfill_inventory_authority__0062_backup;
DROP TABLE knowledge_source_backfill_inventory_authority__0062_backup;
CREATE INDEX idx_knowledge_source_backfill_inventory_authority_snapshot
  ON knowledge_source_backfill_inventory_authority(snapshot_id, generation DESC);

CREATE VIEW knowledge_source_backfill_current_inventory_authority AS
SELECT authority.generation, authority.id AS authority_decision_id,
       authority.snapshot_id, authority.schema_version, authority.policy_version,
       authority.actor, authority.idempotency_key, authority.correlation_id,
       authority.created_at AS authorised_at, snapshot.inventory_identity,
       snapshot.snapshot_json, snapshot.created_by,
       snapshot.created_at AS snapshot_created_at
FROM knowledge_source_backfill_inventory_authority AS authority
JOIN knowledge_source_backfill_inventory_snapshots AS snapshot
  ON snapshot.id = authority.snapshot_id
ORDER BY authority.generation DESC
LIMIT 1;

CREATE TRIGGER trg_knowledge_source_backfill_inventory_authority_no_update
BEFORE UPDATE ON knowledge_source_backfill_inventory_authority
BEGIN SELECT RAISE(ABORT, 'inventory authority decisions are append-only'); END;
CREATE TRIGGER trg_knowledge_source_backfill_inventory_authority_no_delete
BEFORE DELETE ON knowledge_source_backfill_inventory_authority
BEGIN SELECT RAISE(ABORT, 'inventory authority decisions are append-only'); END;
CREATE TRIGGER trg_knowledge_source_backfill_inventory_authority_invalidate
AFTER INSERT ON knowledge_source_backfill_inventory_authority
BEGIN
  UPDATE knowledge_source_backfill_batches
  SET state = 'cancelled', updated_at = datetime('now')
  WHERE state = 'approved'
    AND json_extract(plan_json, '$.inventorySnapshotId') IS NOT NEW.snapshot_id;
END;

PRAGMA defer_foreign_keys = OFF;
PRAGMA quick_check;
PRAGMA foreign_key_check;
