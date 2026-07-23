-- TRACE Knowledge Continuity KC-04D: extraction-run metadata envelope.
-- Additive and retry-safe. This records provenance for deterministic and future
-- governed-AI extraction without storing prompts, source bodies, or chain of thought.

CREATE TABLE IF NOT EXISTS knowledge_extraction_runs (
  id TEXT PRIMARY KEY,
  source_document_version_id TEXT NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
  source_content_hash TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK(task_type IN ('extract_source_structure','extract_source_claims','summarise_source')),
  extraction_method TEXT NOT NULL CHECK(extraction_method IN ('deterministic','governed_ai')),
  extraction_version TEXT NOT NULL,
  model_provider TEXT,
  model_identifier TEXT,
  prompt_version TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  usage_json TEXT NOT NULL DEFAULT '{}',
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
  cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK(cached_tokens >= 0),
  estimated_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK(estimated_cost_microusd >= 0),
  actual_cost_microusd INTEGER CHECK(actual_cost_microusd IS NULL OR actual_cost_microusd >= 0),
  cost_basis TEXT NOT NULL DEFAULT 'unknown' CHECK(cost_basis IN ('provider_usage','estimated','none','unknown')),
  validation_state TEXT NOT NULL DEFAULT 'pending' CHECK(validation_state IN ('pending','valid','invalid','not_run')),
  validation_json TEXT NOT NULL DEFAULT '{}',
  audit_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT NOT NULL,
  ai_request_id TEXT REFERENCES ai_requests(request_id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'running' CHECK(state IN ('running','completed','failed','skipped')),
  error_code TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((state = 'completed' AND completed_at IS NOT NULL) OR state <> 'completed'),
  CHECK((extraction_method = 'deterministic' AND model_provider IS NULL AND model_identifier IS NULL) OR extraction_method = 'governed_ai'),
  CHECK((cost_basis = 'none' AND actual_cost_microusd IS NULL) OR cost_basis <> 'none')
);

CREATE INDEX IF NOT EXISTS idx_knowledge_extraction_runs_source
  ON knowledge_extraction_runs(source_document_version_id, task_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_extraction_runs_state
  ON knowledge_extraction_runs(state, validation_state, created_at ASC);

CREATE TABLE IF NOT EXISTS knowledge_extraction_run_outputs (
  extraction_run_id TEXT NOT NULL REFERENCES knowledge_extraction_runs(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL CHECK(output_type IN ('source_extraction','source_summary')),
  output_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(extraction_run_id, output_type, output_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_extraction_outputs_output
  ON knowledge_extraction_run_outputs(output_type, output_id);
