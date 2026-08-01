-- KC-11C privacy-safe normalized identity diagnostics. Additive only; do not
-- rewrite the transport or normalized identities introduced by migration 0059.
-- Existing observations remain historical and therefore retain NULL values.

ALTER TABLE source_document_version_observations ADD COLUMN normalized_metadata_hash TEXT;
ALTER TABLE source_document_version_observations ADD COLUMN normalized_blocks_hash TEXT;
ALTER TABLE source_document_version_observations ADD COLUMN normalized_links_hash TEXT;
ALTER TABLE source_document_version_observations ADD COLUMN normalized_structure_hash TEXT;
ALTER TABLE source_document_version_observations ADD COLUMN block_count INTEGER CHECK(block_count IS NULL OR block_count >= 0);
ALTER TABLE source_document_version_observations ADD COLUMN link_count INTEGER CHECK(link_count IS NULL OR link_count >= 0);
ALTER TABLE source_document_version_observations ADD COLUMN heading_count INTEGER CHECK(heading_count IS NULL OR heading_count >= 0);
ALTER TABLE source_document_version_observations ADD COLUMN extraction_container TEXT
  CHECK(extraction_container IS NULL OR extraction_container IN ('article', 'main', 'body', 'document', 'not_applicable'));
ALTER TABLE source_document_version_observations ADD COLUMN extraction_truncated INTEGER
  CHECK(extraction_truncated IS NULL OR extraction_truncated IN (0, 1));
ALTER TABLE source_document_version_observations ADD COLUMN normalization_policy_version TEXT;
