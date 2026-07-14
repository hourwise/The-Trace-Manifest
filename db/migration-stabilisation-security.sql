-- Stabilisation/security migration. Apply after db/schema.sql and
-- db/migration-5e-publication.sql. This file is additive and must be applied once.

-- Truthful ingestion/operator status without rewriting the original status CHECK.
ALTER TABLE ingestion_jobs ADD COLUMN result_status TEXT NOT NULL DEFAULT 'running';
ALTER TABLE ingestion_jobs ADD COLUMN items_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN items_skipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ingestion_jobs ADD COLUMN outcome_detail TEXT;
UPDATE ingestion_jobs
SET result_status = CASE status
  WHEN 'completed' THEN 'legacy_completed_unknown'
  WHEN 'failed' THEN 'failed'
  WHEN 'pending' THEN 'pending'
  ELSE 'running'
END;
UPDATE ingestion_jobs
SET outcome_detail = 'Pre-stabilisation job; detailed outcome counts are unavailable.'
WHERE status IN ('completed', 'failed');
ALTER TABLE cron_runs ADD COLUMN items_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cron_runs ADD COLUMN items_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cron_runs ADD COLUMN items_skipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cron_runs ADD COLUMN outcome_detail TEXT;
UPDATE cron_runs
SET outcome_detail = 'Pre-stabilisation schedule run; detailed outcome counts are unavailable.'
WHERE status IN ('completed', 'failed');

-- One row owns one accepted model action. Raw questions are deliberately absent.
CREATE TABLE IF NOT EXISTS ai_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_key_hash TEXT NOT NULL UNIQUE,
  visitor_hash TEXT,
  question_hash TEXT,
  task_type TEXT NOT NULL CHECK(task_type IN ('ask_trace','editorial')),
  state TEXT NOT NULL CHECK(state IN (
    'received','validated','budget_reserved','retrieving','model_in_progress',
    'validating','completed','failed','rejected','circuit_open'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
  provider TEXT,
  model TEXT,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  response_json TEXT,
  public_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  retention_expires_at TEXT NOT NULL DEFAULT (datetime('now', '+7 days'))
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_visitor_created ON ai_requests(visitor_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_requests_retention ON ai_requests(retention_expires_at);

-- The conditional INSERT used by the gateway is the atomic reservation boundary.
CREATE TABLE IF NOT EXISTS ai_budget_reservations (
  reservation_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES ai_requests(request_id),
  task_type TEXT NOT NULL,
  day_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  reserved_microusd INTEGER NOT NULL CHECK(reserved_microusd > 0),
  actual_microusd INTEGER,
  state TEXT NOT NULL CHECK(state IN ('reserved','settled','released','expired')),
  billing_uncertain BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_day_state ON ai_budget_reservations(day_key, state);
CREATE INDEX IF NOT EXISTS idx_ai_budget_month_state ON ai_budget_reservations(month_key, state);
CREATE INDEX IF NOT EXISTS idx_ai_budget_task_state ON ai_budget_reservations(task_type, day_key, state);

CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE REFERENCES ai_requests(request_id),
  task_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_tokens INTEGER,
  estimated_microusd INTEGER NOT NULL,
  actual_microusd INTEGER,
  cost_basis TEXT NOT NULL CHECK(cost_basis IN ('provider_usage','estimated','unknown')),
  billing_uncertain BOOLEAN NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL,
  provider_status INTEGER,
  validation_status TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_task_created ON ai_usage_ledger(task_type, created_at);

CREATE TABLE IF NOT EXISTS ai_quota_usage (
  visitor_hash TEXT NOT NULL,
  day_key TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (visitor_hash, day_key)
);

CREATE TABLE IF NOT EXISTS ai_concurrency_leases (
  visitor_hash TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES ai_requests(request_id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_concurrency_expiry ON ai_concurrency_leases(expires_at);

CREATE TABLE IF NOT EXISTS ai_circuit_breakers (
  breaker_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('closed','open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  reason_code TEXT,
  opened_at TEXT,
  open_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_request_nonces (
  nonce TEXT PRIMARY KEY,
  operator_hash TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_nonces_expiry ON admin_request_nonces(expires_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  operator_email TEXT NOT NULL,
  operator_role TEXT NOT NULL CHECK(operator_role IN ('reader','publisher')),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('allowed','denied','succeeded','failed')),
  detail_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_operator ON admin_audit_log(operator_email, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id, created_at);

-- Retrieval/publication and operational query indexes.
CREATE INDEX IF NOT EXISTS idx_story_publication_retrieval
  ON story_clusters(publication_status, published_at, evidence_status);
CREATE INDEX IF NOT EXISTS idx_claims_public_cluster
  ON claims(cluster_id, is_corrected, is_disputed, evidence_quality);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_feed
  ON claim_evidence(feed_item_id, claim_id);
CREATE INDEX IF NOT EXISTS idx_jobs_result_created
  ON ingestion_jobs(result_status, created_at);

-- Structured catalogues are not public merely because extraction created a row.
ALTER TABLE models ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft'
  CHECK(publication_status IN ('draft','review','published','withdrawn'));
ALTER TABLE models ADD COLUMN reviewed_by TEXT;
ALTER TABLE models ADD COLUMN reviewed_at TEXT;
ALTER TABLE providers ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft'
  CHECK(publication_status IN ('draft','review','published','withdrawn'));
ALTER TABLE providers ADD COLUMN reviewed_by TEXT;
ALTER TABLE providers ADD COLUMN reviewed_at TEXT;
ALTER TABLE benchmarks ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft'
  CHECK(publication_status IN ('draft','review','published','withdrawn'));
ALTER TABLE benchmarks ADD COLUMN reviewed_by TEXT;
ALTER TABLE benchmarks ADD COLUMN reviewed_at TEXT;
ALTER TABLE benchmark_runs ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft'
  CHECK(publication_status IN ('draft','review','published','withdrawn'));
ALTER TABLE benchmark_runs ADD COLUMN reviewed_by TEXT;
ALTER TABLE benchmark_runs ADD COLUMN reviewed_at TEXT;
ALTER TABLE provider_models ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'draft'
  CHECK(publication_status IN ('draft','review','published','withdrawn'));
ALTER TABLE provider_models ADD COLUMN reviewed_by TEXT;
ALTER TABLE provider_models ADD COLUMN reviewed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_models_publication ON models(publication_status, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_providers_publication ON providers(publication_status, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_benchmarks_publication ON benchmarks(publication_status, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_publication ON benchmark_runs(publication_status, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_provider_models_publication ON provider_models(publication_status, reviewed_at);
