-- TRACE V1 BACKEND-02: governed canonical assertion admission boundary.
-- Additive candidate only. This migration is not authorised for remote
-- execution in BACKEND-02.

ALTER TABLE claim_assertions ADD COLUMN assertion_governance_revision INTEGER NOT NULL DEFAULT 0 CHECK(assertion_governance_revision >= 0);

CREATE TABLE IF NOT EXISTS assertion_governance_events (
  id TEXT PRIMARY KEY,
  assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE RESTRICT,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE RESTRICT,
  cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('admit','reject')),
  previous_admission_state TEXT NOT NULL CHECK(previous_admission_state IN ('pending','admitted','quarantined','rejected')),
  new_admission_state TEXT NOT NULL CHECK(new_admission_state IN ('pending','admitted','quarantined','rejected')),
  previous_reviewer_state TEXT NOT NULL CHECK(previous_reviewer_state IN ('proposed','accepted','amended','rejected','duplicate','unsupported','needs_research')),
  new_reviewer_state TEXT NOT NULL CHECK(new_reviewer_state IN ('proposed','accepted','amended','rejected','duplicate','unsupported','needs_research')),
  previous_freshness_state TEXT NOT NULL CHECK(previous_freshness_state IN ('current','stale','unknown')),
  new_freshness_state TEXT NOT NULL CHECK(new_freshness_state IN ('current','stale','unknown')),
  previous_admission_revision INTEGER NOT NULL CHECK(previous_admission_revision >= 0),
  new_admission_revision INTEGER NOT NULL CHECK(new_admission_revision = previous_admission_revision + 1),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK(actor_role = 'publisher'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000 AND length(trim(reason)) >= 1),
  request_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  recalculation_job_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(previous_admission_state <> new_admission_state),
  UNIQUE(assertion_id, previous_admission_state, new_admission_state)
);

CREATE INDEX IF NOT EXISTS idx_assertion_governance_events_assertion
  ON assertion_governance_events(assertion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assertion_governance_events_claim
  ON assertion_governance_events(canonical_claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assertion_governance_events_cluster
  ON assertion_governance_events(cluster_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS prevent_assertion_governance_event_update
BEFORE UPDATE ON assertion_governance_events
BEGIN
  SELECT RAISE(ABORT, 'assertion governance events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_assertion_governance_event_delete
BEFORE DELETE ON assertion_governance_events
BEGIN
  SELECT RAISE(ABORT, 'assertion governance events are append-only');
END;

CREATE TABLE IF NOT EXISTS assertion_governance_recalculation_jobs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES assertion_governance_events(id) ON DELETE RESTRICT,
  assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE RESTRICT,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE RESTRICT,
  cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE RESTRICT,
  story_scope_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','completed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  claim_snapshot_count INTEGER,
  story_snapshot_count INTEGER,
  status_change_count INTEGER,
  approval_request_count INTEGER,
  result_json TEXT,
  last_error TEXT CHECK(last_error IS NULL OR length(last_error) <= 1000),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assertion_governance_recalc_jobs_queue
  ON assertion_governance_recalculation_jobs(state, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_assertion_governance_recalc_jobs_assertion
  ON assertion_governance_recalculation_jobs(assertion_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS prevent_assertion_governance_recalc_job_delete
BEFORE DELETE ON assertion_governance_recalculation_jobs
BEGIN
  SELECT RAISE(ABORT, 'assertion governance recalculation jobs are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_assertion_governance_recalc_job_identity_update
BEFORE UPDATE OF event_id, assertion_id, canonical_claim_id, cluster_id,
  story_scope_json, created_at
ON assertion_governance_recalculation_jobs
BEGIN
  SELECT RAISE(ABORT, 'assertion governance recalculation job identity is immutable');
END;
