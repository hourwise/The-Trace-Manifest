-- TRACE KC-03H: permit the existing upload audit envelope to name an opaque
-- PDF artifact and its governed extraction-pending outcome. The canonical
-- source/version tables remain the sole document lifecycle; no PDF bytes enter
-- this table or D1.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE source_upload_intakes__0064_new (
  id TEXT PRIMARY KEY,
  source_document_id TEXT REFERENCES source_documents(id) ON DELETE SET NULL,
  source_document_version_id TEXT REFERENCES source_document_versions(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  upload_identity_hash TEXT NOT NULL,
  uploader_email TEXT NOT NULL,
  display_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('html','markdown','plain_text','pdf','unsupported')),
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  outcome_state TEXT NOT NULL CHECK(outcome_state IN ('extracted','extraction_pending','metadata_only','unsupported','extraction_failed','rejected')),
  state_reason TEXT,
  state_diagnostics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(upload_identity_hash, content_hash)
);

INSERT INTO source_upload_intakes__0064_new (
  id, source_document_id, source_document_version_id, idempotency_key,
  upload_identity_hash, uploader_email, display_filename, media_type,
  media_kind, content_hash, byte_length, outcome_state, state_reason,
  state_diagnostics_json, created_at, updated_at
)
SELECT id, source_document_id, source_document_version_id, idempotency_key,
       upload_identity_hash, uploader_email, display_filename, media_type,
       media_kind, content_hash, byte_length, outcome_state, state_reason,
       state_diagnostics_json, created_at, updated_at
FROM source_upload_intakes;

DROP INDEX IF EXISTS idx_source_upload_intakes_recent;
DROP INDEX IF EXISTS idx_source_upload_intakes_source;
DROP TABLE source_upload_intakes;
ALTER TABLE source_upload_intakes__0064_new RENAME TO source_upload_intakes;

CREATE INDEX idx_source_upload_intakes_recent
  ON source_upload_intakes(created_at DESC, outcome_state);
CREATE INDEX idx_source_upload_intakes_source
  ON source_upload_intakes(source_document_id, source_document_version_id);

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_key_check;
