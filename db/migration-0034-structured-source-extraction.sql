-- TRACE Knowledge Continuity KC-04A–C: locator-backed structured extraction.
-- Additive only. Deterministic candidates remain proposed until editorial review.

CREATE TABLE IF NOT EXISTS source_extractions (
  id TEXT PRIMARY KEY,
  source_document_version_id TEXT NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
  source_chunk_id TEXT NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
  extraction_kind TEXT NOT NULL CHECK(extraction_kind IN ('entity','material_claim','attributed_opinion','date','model_version','benchmark_result','caveat')),
  payload_json TEXT NOT NULL,
  start_locator TEXT NOT NULL,
  end_locator TEXT NOT NULL,
  extraction_method TEXT NOT NULL,
  extraction_version TEXT NOT NULL,
  model_provider TEXT,
  model_identifier TEXT,
  prompt_version TEXT,
  policy_version TEXT,
  usage_json TEXT,
  cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK(cost_microusd >= 0),
  validation_state TEXT NOT NULL DEFAULT 'proposed' CHECK(validation_state IN ('proposed','valid','invalid')),
  reviewer_state TEXT NOT NULL DEFAULT 'proposed' CHECK(reviewer_state IN ('proposed','accepted','amended','rejected','duplicate','unsupported','needs_research')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((reviewer_state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR reviewer_state <> 'accepted')
);
CREATE INDEX IF NOT EXISTS idx_source_extractions_version_kind ON source_extractions(source_document_version_id, extraction_kind, reviewer_state);
CREATE INDEX IF NOT EXISTS idx_source_extractions_chunk_locator ON source_extractions(source_chunk_id, start_locator, end_locator);

CREATE TABLE IF NOT EXISTS source_summaries (
  id TEXT PRIMARY KEY,
  source_document_version_id TEXT NOT NULL UNIQUE REFERENCES source_document_versions(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  summary_state TEXT NOT NULL DEFAULT 'proposed' CHECK(summary_state IN ('proposed','accepted','amended','rejected','needs_research')),
  extraction_method TEXT NOT NULL,
  extraction_version TEXT NOT NULL,
  model_provider TEXT,
  model_identifier TEXT,
  prompt_version TEXT,
  policy_version TEXT,
  usage_json TEXT,
  cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK(cost_microusd >= 0),
  validation_state TEXT NOT NULL DEFAULT 'proposed' CHECK(validation_state IN ('proposed','valid','invalid')),
  source_content_hash TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((summary_state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR summary_state <> 'accepted')
);
CREATE INDEX IF NOT EXISTS idx_source_summaries_review ON source_summaries(summary_state, validation_state, created_at);
