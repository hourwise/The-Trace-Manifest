-- TRACE Knowledge Continuity KC-04E: publisher review history.
-- Additive only. The current state remains on source_extractions/source_summaries;
-- this table preserves every attributable transition and optional amendment.

CREATE TABLE IF NOT EXISTS knowledge_extraction_reviews (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('source_extraction','source_summary')),
  target_id TEXT NOT NULL,
  extraction_run_id TEXT REFERENCES knowledge_extraction_runs(id) ON DELETE SET NULL,
  previous_state TEXT NOT NULL,
  next_state TEXT NOT NULL CHECK(next_state IN ('accepted','amended','rejected','duplicate','unsupported','needs_research','proposed')),
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK(reviewer_role = 'publisher'),
  review_note TEXT,
  amended_value_json TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_type, target_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_extraction_reviews_target
  ON knowledge_extraction_reviews(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_reviews_state
  ON knowledge_extraction_reviews(next_state, created_at DESC);
