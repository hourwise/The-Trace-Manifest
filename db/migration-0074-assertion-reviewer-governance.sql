-- TRACE V1 BACKEND-03: separate reviewer-state governance events.
-- Additive candidate only. Do not apply to Preview or Production from this
-- branch. 0073 is admission-specific, so this rebuild preserves every 0073
-- row while adding explicitly named reviewer actions and a shared CAS
-- revision without reinterpreting admission `reject`.

DROP INDEX IF EXISTS idx_assertion_governance_events_assertion;
DROP INDEX IF EXISTS idx_assertion_governance_events_claim;
DROP INDEX IF EXISTS idx_assertion_governance_events_cluster;
DROP TRIGGER IF EXISTS prevent_assertion_governance_event_update;
DROP TRIGGER IF EXISTS prevent_assertion_governance_event_delete;
DROP INDEX IF EXISTS idx_assertion_governance_recalc_jobs_queue;
DROP INDEX IF EXISTS idx_assertion_governance_recalc_jobs_assertion;
DROP TRIGGER IF EXISTS prevent_assertion_governance_recalc_job_delete;
DROP TRIGGER IF EXISTS prevent_assertion_governance_recalc_job_identity_update;

ALTER TABLE assertion_governance_recalculation_jobs
  RENAME TO assertion_governance_recalculation_jobs_0073;
ALTER TABLE assertion_governance_events
  RENAME TO assertion_governance_events_0073;

CREATE TABLE assertion_governance_events (
  id TEXT PRIMARY KEY,
  assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE RESTRICT,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE RESTRICT,
  cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('admit','reject','accept_review','reject_review')),
  previous_admission_state TEXT NOT NULL CHECK(previous_admission_state IN ('pending','admitted','quarantined','rejected')),
  new_admission_state TEXT NOT NULL CHECK(new_admission_state IN ('pending','admitted','quarantined','rejected')),
  previous_reviewer_state TEXT NOT NULL CHECK(previous_reviewer_state IN ('proposed','accepted','amended','rejected','duplicate','unsupported','needs_research')),
  new_reviewer_state TEXT NOT NULL CHECK(new_reviewer_state IN ('proposed','accepted','amended','rejected','duplicate','unsupported','needs_research')),
  previous_freshness_state TEXT NOT NULL CHECK(previous_freshness_state IN ('current','stale','unknown')),
  new_freshness_state TEXT NOT NULL CHECK(new_freshness_state IN ('current','stale','unknown')),
  -- These legacy-named columns remain for BACKEND-02 compatibility. They
  -- advance only for admission events and remain unchanged for reviewer
  -- events; the governance columns below are the shared CAS revision.
  previous_admission_revision INTEGER NOT NULL CHECK(previous_admission_revision >= 0),
  new_admission_revision INTEGER NOT NULL CHECK(new_admission_revision >= 0),
  previous_governance_revision INTEGER NOT NULL CHECK(previous_governance_revision >= 0),
  new_governance_revision INTEGER NOT NULL CHECK(new_governance_revision = previous_governance_revision + 1),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK(actor_role = 'publisher'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000 AND length(trim(reason)) >= 1),
  request_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  recalculation_job_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    (
      action IN ('admit','reject')
      AND previous_admission_state <> new_admission_state
      AND new_admission_revision = previous_admission_revision + 1
      AND previous_governance_revision = previous_admission_revision
      AND new_governance_revision = new_admission_revision
    )
    OR
    (
      action IN ('accept_review','reject_review')
      AND previous_admission_state = new_admission_state
      AND previous_admission_revision = new_admission_revision
      AND previous_freshness_state = new_freshness_state
      AND (
        (action = 'accept_review' AND previous_reviewer_state IN ('proposed','needs_research') AND new_reviewer_state = 'accepted')
        OR
        (action = 'reject_review' AND previous_reviewer_state IN ('proposed','needs_research') AND new_reviewer_state = 'rejected')
      )
    )
  ),
  UNIQUE(assertion_id, action, previous_admission_state, new_admission_state,
         previous_reviewer_state, new_reviewer_state)
);

INSERT INTO assertion_governance_events (
  id, assertion_id, canonical_claim_id, cluster_id, action,
  previous_admission_state, new_admission_state,
  previous_reviewer_state, new_reviewer_state,
  previous_freshness_state, new_freshness_state,
  previous_admission_revision, new_admission_revision,
  previous_governance_revision, new_governance_revision,
  actor_email, actor_role, reason, request_id, idempotency_key,
  request_fingerprint, recalculation_job_id, created_at
)
SELECT
  id, assertion_id, canonical_claim_id, cluster_id, action,
  previous_admission_state, new_admission_state,
  previous_reviewer_state, new_reviewer_state,
  previous_freshness_state, new_freshness_state,
  previous_admission_revision, new_admission_revision,
  previous_admission_revision, new_admission_revision,
  actor_email, actor_role, reason, request_id, idempotency_key,
  request_fingerprint, recalculation_job_id, created_at
FROM assertion_governance_events_0073;

CREATE TABLE assertion_governance_recalculation_jobs (
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

INSERT INTO assertion_governance_recalculation_jobs (
  id, event_id, assertion_id, canonical_claim_id, cluster_id, story_scope_json,
  state, attempt_count, claim_snapshot_count, story_snapshot_count,
  status_change_count, approval_request_count, result_json, last_error,
  created_at, updated_at, completed_at
)
SELECT
  id, event_id, assertion_id, canonical_claim_id, cluster_id, story_scope_json,
  state, attempt_count, claim_snapshot_count, story_snapshot_count,
  status_change_count, approval_request_count, result_json, last_error,
  created_at, updated_at, completed_at
FROM assertion_governance_recalculation_jobs_0073;

DROP TABLE assertion_governance_recalculation_jobs_0073;
DROP TABLE assertion_governance_events_0073;

CREATE INDEX idx_assertion_governance_events_assertion
  ON assertion_governance_events(assertion_id, created_at DESC);
CREATE INDEX idx_assertion_governance_events_claim
  ON assertion_governance_events(canonical_claim_id, created_at DESC);
CREATE INDEX idx_assertion_governance_events_cluster
  ON assertion_governance_events(cluster_id, created_at DESC);

CREATE TRIGGER prevent_assertion_governance_event_update
BEFORE UPDATE ON assertion_governance_events
BEGIN
  SELECT RAISE(ABORT, 'assertion governance events are append-only');
END;

CREATE TRIGGER prevent_assertion_governance_event_delete
BEFORE DELETE ON assertion_governance_events
BEGIN
  SELECT RAISE(ABORT, 'assertion governance events are append-only');
END;

CREATE INDEX idx_assertion_governance_recalc_jobs_queue
  ON assertion_governance_recalculation_jobs(state, created_at ASC);
CREATE INDEX idx_assertion_governance_recalc_jobs_assertion
  ON assertion_governance_recalculation_jobs(assertion_id, created_at DESC);

CREATE TRIGGER prevent_assertion_governance_recalc_job_delete
BEFORE DELETE ON assertion_governance_recalculation_jobs
BEGIN
  SELECT RAISE(ABORT, 'assertion governance recalculation jobs are append-only');
END;

CREATE TRIGGER prevent_assertion_governance_recalc_job_identity_update
BEFORE UPDATE OF event_id, assertion_id, canonical_claim_id, cluster_id,
  story_scope_json, created_at
ON assertion_governance_recalculation_jobs
BEGIN
  SELECT RAISE(ABORT, 'assertion governance recalculation job identity is immutable');
END;
