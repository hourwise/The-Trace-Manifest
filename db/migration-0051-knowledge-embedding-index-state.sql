-- TRACE KC-09D versioned embedding/index state.
-- Preview-only at runtime; production stays unbound and receives no rows.
-- Apply after migration-0050-knowledge-retrieval-indexes.sql.

CREATE TABLE IF NOT EXISTS knowledge_embedding_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment = 'preview'),
  policy_version TEXT NOT NULL,
  namespace TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','completed','partial','failed','disabled')),
  requested_limit INTEGER NOT NULL CHECK(requested_limit > 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  vector_count INTEGER NOT NULL DEFAULT 0 CHECK(vector_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK(skipped_count >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_runs_budget
  ON knowledge_embedding_runs(environment, created_at, state);

CREATE TABLE IF NOT EXISTS knowledge_embedding_index_items (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK(record_type IN (
    'source_chunk','canonical_claim','published_story','knowledge_section','guide','correction'
  )),
  record_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  namespace TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  input_chars INTEGER NOT NULL CHECK(input_chars >= 0),
  estimated_input_tokens INTEGER NOT NULL CHECK(estimated_input_tokens >= 0),
  language TEXT NOT NULL,
  admission_state TEXT NOT NULL,
  publication_state TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','indexed','stale','failed','deleted')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  remote_operation_id TEXT,
  last_error TEXT,
  run_id TEXT REFERENCES knowledge_embedding_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  indexed_at TEXT,
  UNIQUE(record_type, record_id, policy_version),
  UNIQUE(vector_id, namespace)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_items_queue
  ON knowledge_embedding_index_items(namespace, policy_version, state, updated_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_items_record
  ON knowledge_embedding_index_items(record_type, record_id, state);
