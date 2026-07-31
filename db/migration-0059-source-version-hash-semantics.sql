-- KC-11C source-version identity correction. Additive and forward-compatible.
-- Existing content_hash values and source-version IDs remain untouched; for
-- legacy rows content_hash remains the exact raw-body hash.

ALTER TABLE source_document_versions ADD COLUMN transport_hash TEXT;
ALTER TABLE source_document_versions ADD COLUMN normalized_content_hash TEXT;
ALTER TABLE source_document_versions ADD COLUMN hash_semantics_version TEXT NOT NULL DEFAULT 'legacy_raw_v1'
  CHECK(hash_semantics_version IN ('legacy_raw_v1', 'normalized_content_v1'));

-- Legacy rows retain a NULL transport_hash because their existing
-- content_hash already records the exact raw-body hash. A normalized identity
-- cannot be inferred without the historical extracted representation.

CREATE INDEX IF NOT EXISTS idx_source_document_versions_normalized_hash
  ON source_document_versions(source_document_id, normalized_content_hash)
  WHERE normalized_content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS source_document_version_observations (
  id TEXT PRIMARY KEY,
  source_document_version_id TEXT NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
  transport_hash TEXT NOT NULL,
  normalized_content_hash TEXT NOT NULL,
  hash_semantics_version TEXT NOT NULL CHECK(hash_semantics_version = 'normalized_content_v1'),
  retrieved_url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  http_status INTEGER,
  media_type TEXT,
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length >= 0),
  extraction_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_document_version_id, transport_hash)
);
CREATE INDEX IF NOT EXISTS idx_source_document_version_observations_version
  ON source_document_version_observations(source_document_version_id, created_at DESC);

ALTER TABLE knowledge_source_backfill_items ADD COLUMN transport_hash TEXT;
ALTER TABLE knowledge_source_backfill_items ADD COLUMN normalized_content_hash TEXT;
ALTER TABLE knowledge_source_backfill_items ADD COLUMN hash_semantics_version TEXT NOT NULL DEFAULT 'legacy_raw_v1'
  CHECK(hash_semantics_version IN ('legacy_raw_v1', 'normalized_content_v1'));

-- Preserve the prior item content hash as its exact transport compatibility
-- value without changing the legacy content_hash column or item identity.
UPDATE knowledge_source_backfill_items
SET transport_hash = content_hash
WHERE transport_hash IS NULL AND content_hash IS NOT NULL;
