-- TRACE KC-09D delayed Vectorize confirmation state.
-- Preview-only indexing remains disabled in production; this migration only
-- makes an already-submitted vector distinguishable from active AI work.

PRAGMA foreign_keys = OFF;

-- Rebuild rather than ALTER ... ADD COLUMN so applying this migration again is
-- harmless in local validation and disaster-recovery replay.
ALTER TABLE knowledge_embedding_runs RENAME TO knowledge_embedding_runs_legacy;
CREATE TABLE knowledge_embedding_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment = 'preview'),
  policy_version TEXT NOT NULL,
  namespace TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','completed','partial','failed','disabled')),
  requested_limit INTEGER NOT NULL CHECK(requested_limit > 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  vector_count INTEGER NOT NULL DEFAULT 0 CHECK(vector_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK(skipped_count >= 0),
  confirmation_pending_count INTEGER NOT NULL DEFAULT 0 CHECK(confirmation_pending_count >= 0),
  reconciled_count INTEGER NOT NULL DEFAULT 0 CHECK(reconciled_count >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
INSERT INTO knowledge_embedding_runs (
  id, environment, policy_version, namespace, state, requested_limit, input_tokens,
  vector_count, skipped_count, error_code, created_at, completed_at
)
SELECT id, environment, policy_version, namespace, state, requested_limit, input_tokens,
       vector_count, skipped_count, error_code, created_at, completed_at
  FROM knowledge_embedding_runs_legacy;
DROP TABLE knowledge_embedding_runs_legacy;
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_runs_budget
  ON knowledge_embedding_runs(environment, created_at, state);

ALTER TABLE knowledge_embedding_index_items RENAME TO knowledge_embedding_index_items_legacy;

CREATE TABLE knowledge_embedding_index_items (
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
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN (
    'pending','running','confirmation_pending','indexed','stale','failed','deleted'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  confirmation_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(confirmation_attempt_count >= 0),
  remote_operation_id TEXT,
  last_error TEXT,
  run_id TEXT REFERENCES knowledge_embedding_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  indexed_at TEXT,
  UNIQUE(record_type, record_id, policy_version),
  UNIQUE(vector_id, namespace)
);

INSERT INTO knowledge_embedding_index_items (
  id, record_type, record_id, policy_version, namespace, vector_id, content_hash,
  input_chars, estimated_input_tokens, language, admission_state, publication_state,
  state, attempt_count, confirmation_attempt_count, remote_operation_id,
  last_error, run_id, created_at, updated_at, indexed_at
)
SELECT id, record_type, record_id, policy_version, namespace, vector_id, content_hash,
       input_chars, estimated_input_tokens, language, admission_state, publication_state,
       state, attempt_count, 0, remote_operation_id,
       last_error, run_id, created_at, updated_at, indexed_at
  FROM knowledge_embedding_index_items_legacy;

DROP TABLE knowledge_embedding_index_items_legacy;

-- Recover KC-09D rows written by the original implementation, which used
-- generic running plus this stable error code for a submitted-but-unconfirmed
-- vector. They must not be treated as active embedding work.
UPDATE knowledge_embedding_index_items
   SET state = 'confirmation_pending',
       confirmation_attempt_count = CASE WHEN confirmation_attempt_count = 0 THEN 1 ELSE confirmation_attempt_count END
 WHERE state = 'running' AND last_error = 'vector_confirmation_pending';

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_items_queue
  ON knowledge_embedding_index_items(namespace, policy_version, state, updated_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_items_record
  ON knowledge_embedding_index_items(record_type, record_id, state);

PRAGMA foreign_keys = ON;
