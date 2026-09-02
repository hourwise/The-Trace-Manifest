-- TRACE V1 Mission 2: bounded evidence-capture compatibility foundation.
--
-- Forward-only and additive. Run the local fail-closed preflight first:
--   npm run preflight:trace-v1-m2
--
-- Preconditions:
--   * sources.ingestion_type, corrections.correction_type, and
--     corrections.published must already be classified as compatible or
--     supported legacy shapes.
--   * Any incompatible/ambiguous existing blocker column is a hard stop.
--   * This file is a one-time migration recipe under the repository's current
--     ALTER TABLE convention. It is not safe to replay after it succeeds.
--
-- sources.ingestion_type is deliberately validated, never rebuilt or added:
-- its NOT NULL/no-default contract requires a populated-table data decision if
-- it is absent. The two corrections fields have repository-established
-- additive legacy definitions and are included below. The remaining
-- statements add only the verified 8 + 8 source-capture/hash/state fields.

ALTER TABLE corrections ADD COLUMN correction_type TEXT NOT NULL DEFAULT 'other'
  CHECK(correction_type IN (
    'factual_error','rating_change','licence_correction','pricing_correction',
    'benchmark_correction','supersession','deprecation','methodology_update','other'
  ));
ALTER TABLE corrections ADD COLUMN published BOOLEAN NOT NULL DEFAULT 0;

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

ALTER TABLE source_document_versions ADD COLUMN transport_hash TEXT;
ALTER TABLE source_document_versions ADD COLUMN normalized_content_hash TEXT;
ALTER TABLE source_document_versions ADD COLUMN hash_semantics_version TEXT NOT NULL DEFAULT 'legacy_raw_v1'
  CHECK(hash_semantics_version IN ('legacy_raw_v1','normalized_content_v1','normalized_content_v2','normalized_content_v3'));
ALTER TABLE source_document_versions ADD COLUMN extraction_state TEXT NOT NULL DEFAULT 'pending'
  CHECK(extraction_state IN ('pending','extracted','metadata_only','unsupported','extraction_failed'));
ALTER TABLE source_document_versions ADD COLUMN storage_state TEXT NOT NULL DEFAULT 'not_stored'
  CHECK(storage_state IN ('not_stored','private_pending','private_stored','metadata_only','reconciliation_required'));
ALTER TABLE source_document_versions ADD COLUMN state_reason TEXT;
ALTER TABLE source_document_versions ADD COLUMN state_diagnostics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE source_document_versions ADD COLUMN processing_retryable INTEGER NOT NULL DEFAULT 0
  CHECK(processing_retryable IN (0, 1));

-- Preserve the accepted 0063 interpretation of historical extraction/storage
-- rows. No source identity, hash, timestamp, or immutable version is changed.
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
