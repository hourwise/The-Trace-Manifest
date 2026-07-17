-- Production forward repair for the legacy claims/evidence schema observed on
-- trace-manifest-db on 17 July 2026. Apply once, and only after the matching
-- schema inspection has confirmed the old columns listed below.
--
-- This is deliberately additive: it preserves legacy rows but marks their
-- extracted metadata as unclassified/unrated so they cannot be used by Ask
-- TRACE until a governed reclassification supplies current evidence metadata.

-- Legacy claims had only cluster_id, claim_text, claim_type, severity, and
-- created_at. The current ingestion and correction paths require these fields.
ALTER TABLE claims ADD COLUMN feed_item_id INTEGER REFERENCES feed_items(id);
ALTER TABLE claims ADD COLUMN claim_class TEXT NOT NULL DEFAULT 'legacy_unclassified';
ALTER TABLE claims ADD COLUMN claim_domain TEXT NOT NULL DEFAULT 'general';
ALTER TABLE claims ADD COLUMN evidence_quality TEXT NOT NULL DEFAULT 'unrated';
ALTER TABLE claims ADD COLUMN confidence_score REAL NOT NULL DEFAULT 0;
ALTER TABLE claims ADD COLUMN is_disputed BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE claims ADD COLUMN is_corrected BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE claims ADD COLUMN superseded_by INTEGER REFERENCES claims(id);
ALTER TABLE claims ADD COLUMN extraction_method TEXT NOT NULL DEFAULT 'legacy_unknown';
ALTER TABLE claims ADD COLUMN extraction_version TEXT NOT NULL DEFAULT 'legacy-pre-v2';
ALTER TABLE claims ADD COLUMN updated_at TEXT;
UPDATE claims SET updated_at = created_at WHERE updated_at IS NULL;

-- Legacy claim evidence retained an evidence_type but not the governed
-- relationship/source metadata. Preserve it and assign non-promoting defaults.
ALTER TABLE claim_evidence ADD COLUMN relationship TEXT NOT NULL DEFAULT 'reports';
ALTER TABLE claim_evidence ADD COLUMN source_tier TEXT;
ALTER TABLE claim_evidence ADD COLUMN is_primary_source BOOLEAN NOT NULL DEFAULT 0;

-- These existing tables are used by current Worker write paths. The defaults
-- are deliberately non-public and non-escalating for any historical rows.
ALTER TABLE claim_conflicts ADD COLUMN severity TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE corrections ADD COLUMN correction_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE corrections ADD COLUMN previous_evidence_status TEXT;
ALTER TABLE corrections ADD COLUMN updated_evidence_status TEXT;
ALTER TABLE corrections ADD COLUMN published BOOLEAN NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id),
  stage TEXT NOT NULL CHECK(stage IN ('classified','cross_source_matched','clustered','claim_extracted','evidence_labelled','reviewed','published','corrected','model_data_extracted')),
  algorithm_version TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','skipped')),
  result_summary TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_item ON pipeline_stages(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_stage ON pipeline_stages(stage);
CREATE INDEX IF NOT EXISTS idx_claims_legacy_compatibility ON claims(claim_class, evidence_quality, is_corrected);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_relationship ON claim_evidence(claim_id, relationship);
