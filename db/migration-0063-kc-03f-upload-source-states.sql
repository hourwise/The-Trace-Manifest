-- TRACE KC-03F/G: governed ordinary-document uploads and explicit source states.
-- Additive only. Existing source/version identity and normalized-content hashes
-- remain unchanged; these columns describe retrieval, extraction, and storage
-- outcomes without overloading admission_state.

ALTER TABLE source_documents ADD COLUMN retrieval_state TEXT NOT NULL DEFAULT 'available'
  CHECK(retrieval_state IN ('available','unavailable','paywalled','policy_restricted'));
ALTER TABLE source_documents ADD COLUMN retrieval_reason TEXT;
ALTER TABLE source_documents ADD COLUMN retrieval_diagnostics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_documents ADD COLUMN retrieval_retryable INTEGER NOT NULL DEFAULT 0
  CHECK(retrieval_retryable IN (0, 1));
ALTER TABLE source_documents ADD COLUMN capture_state TEXT NOT NULL DEFAULT 'not_attempted'
  CHECK(capture_state IN ('not_attempted','captured','metadata_only','unsupported','extraction_failed'));
ALTER TABLE source_documents ADD COLUMN capture_reason TEXT;
ALTER TABLE source_documents ADD COLUMN capture_diagnostics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_documents ADD COLUMN capture_retryable INTEGER NOT NULL DEFAULT 0
  CHECK(capture_retryable IN (0, 1));

ALTER TABLE source_document_versions ADD COLUMN extraction_state TEXT NOT NULL DEFAULT 'pending'
  CHECK(extraction_state IN ('pending','extracted','metadata_only','unsupported','extraction_failed'));
ALTER TABLE source_document_versions ADD COLUMN storage_state TEXT NOT NULL DEFAULT 'not_stored'
  CHECK(storage_state IN ('not_stored','private_pending','private_stored','metadata_only','reconciliation_required'));
ALTER TABLE source_document_versions ADD COLUMN state_reason TEXT;
ALTER TABLE source_document_versions ADD COLUMN state_diagnostics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_document_versions ADD COLUMN processing_retryable INTEGER NOT NULL DEFAULT 0
  CHECK(processing_retryable IN (0, 1));

-- Preserve the meaning of historical rows while making the new dimensions
-- explicit. No identity, hash, timestamp, or immutable version is rewritten.
UPDATE source_document_versions
SET extraction_state = CASE extraction_status
    WHEN 'captured' THEN 'extracted'
    WHEN 'extracted' THEN 'extracted'
    WHEN 'metadata_only' THEN 'metadata_only'
    WHEN 'unsupported' THEN 'unsupported'
    WHEN 'failed' THEN 'extraction_failed'
    ELSE 'pending'
  END,
  storage_state = CASE WHEN r2_original_key IS NOT NULL OR r2_extracted_key IS NOT NULL
    THEN 'private_stored' ELSE 'metadata_only' END;
UPDATE source_documents
SET capture_state = CASE
    WHEN current_version_id IS NULL THEN 'not_attempted'
    WHEN EXISTS (
      SELECT 1 FROM source_document_versions version
      WHERE version.id = source_documents.current_version_id
        AND version.extraction_state IN ('extracted', 'metadata_only')
    ) THEN (SELECT CASE WHEN version.extraction_state = 'extracted' THEN 'captured' ELSE 'metadata_only' END
            FROM source_document_versions version WHERE version.id = source_documents.current_version_id)
    WHEN EXISTS (
      SELECT 1 FROM source_document_versions version
      WHERE version.id = source_documents.current_version_id AND version.extraction_state = 'unsupported'
    ) THEN 'unsupported'
    WHEN EXISTS (
      SELECT 1 FROM source_document_versions version
      WHERE version.id = source_documents.current_version_id AND version.extraction_state = 'extraction_failed'
    ) THEN 'extraction_failed'
    ELSE 'not_attempted'
  END;

CREATE INDEX IF NOT EXISTS idx_source_documents_retrieval_state
  ON source_documents(retrieval_state, retrieval_retryable, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_document_versions_governed_state
  ON source_document_versions(extraction_state, storage_state, processing_retryable, retrieved_at DESC);

-- Small audit/idempotency envelope only. The canonical source and immutable
-- version remain source_documents/source_document_versions; this table never
-- stores uploaded bodies or R2 credentials.
CREATE TABLE IF NOT EXISTS source_upload_intakes (
  id TEXT PRIMARY KEY,
  source_document_id TEXT REFERENCES source_documents(id) ON DELETE SET NULL,
  source_document_version_id TEXT REFERENCES source_document_versions(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  upload_identity_hash TEXT NOT NULL,
  uploader_email TEXT NOT NULL,
  display_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('html','markdown','plain_text','unsupported')),
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  outcome_state TEXT NOT NULL CHECK(outcome_state IN ('extracted','metadata_only','unsupported','extraction_failed','rejected')),
  state_reason TEXT,
  state_diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(upload_identity_hash, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_source_upload_intakes_recent
  ON source_upload_intakes(created_at DESC, outcome_state);
CREATE INDEX IF NOT EXISTS idx_source_upload_intakes_source
  ON source_upload_intakes(source_document_id, source_document_version_id);
