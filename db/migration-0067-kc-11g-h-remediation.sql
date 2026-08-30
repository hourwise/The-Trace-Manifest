-- KC-11G/H remediation.
--
-- The runtime identity row is intentionally not seeded by this migration.
-- Each D1 resource must be explicitly attested in a separate, controlled
-- environment operation. Until then KC-11G/H remains disabled.
CREATE TABLE IF NOT EXISTS trace_runtime_resource_identity (
  identity_key TEXT PRIMARY KEY CHECK(identity_key = 'd1'),
  identity_version TEXT NOT NULL CHECK(identity_version = 'trace-d1-resource-v1'),
  environment TEXT NOT NULL CHECK(environment IN ('preview', 'production')),
  resource_id TEXT NOT NULL CHECK(length(resource_id) BETWEEN 1 AND 200),
  established_by TEXT NOT NULL CHECK(length(established_by) BETWEEN 3 AND 320),
  established_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS prevent_trace_runtime_resource_identity_update
BEFORE UPDATE ON trace_runtime_resource_identity
BEGIN
  SELECT RAISE(ABORT, 'runtime resource identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_trace_runtime_resource_identity_delete
BEFORE DELETE ON trace_runtime_resource_identity
BEGIN
  SELECT RAISE(ABORT, 'runtime resource identity is immutable');
END;

-- Story scoring is expanded as durable story/claim edges. Each invocation can
-- score a bounded number of edges; final story snapshots aggregate these
-- immutable canonical edge results without reloading every assertion for every
-- linked story.
CREATE TABLE IF NOT EXISTS kc11g_story_claim_score_work (
  snapshot_identity TEXT NOT NULL,
  story_cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  materiality TEXT NOT NULL CHECK(materiality IN ('low', 'standard', 'high', 'critical')),
  score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
  evidence_status TEXT NOT NULL CHECK(evidence_status IN (
    'confirmed','strongly_supported','provisionally_supported','vendor_reported',
    'community_reported','disputed','unverified','corrected','superseded','outdated'
  )),
  component_json TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(snapshot_identity, story_cluster_id, canonical_claim_id)
);

CREATE INDEX IF NOT EXISTS idx_kc11g_story_claim_score_work_story
  ON kc11g_story_claim_score_work(snapshot_identity, story_cluster_id, canonical_claim_id);

CREATE TRIGGER IF NOT EXISTS prevent_kc11g_story_claim_score_work_update
BEFORE UPDATE ON kc11g_story_claim_score_work
BEGIN
  SELECT RAISE(ABORT, 'KC-11G story claim score work is immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_kc11g_story_claim_score_work_delete
BEFORE DELETE ON kc11g_story_claim_score_work
BEGIN
  SELECT RAISE(ABORT, 'KC-11G story claim score work is immutable');
END;

-- Oversized single-claim units are recorded once rather than retried forever.
-- They keep the run partial and visible until a separately bounded remediation
-- path is supplied; they can never be mistaken for completed work.
CREATE TABLE IF NOT EXISTS kc11g_deferred_score_work (
  id TEXT PRIMARY KEY,
  snapshot_identity TEXT NOT NULL,
  work_kind TEXT NOT NULL CHECK(work_kind IN ('claim_snapshot', 'story_claim_score')),
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  story_cluster_id INTEGER REFERENCES story_clusters(id) ON DELETE CASCADE,
  measured_source_rows INTEGER NOT NULL CHECK(measured_source_rows > 0),
  source_row_ceiling INTEGER NOT NULL CHECK(source_row_ceiling > 0),
  reason_code TEXT NOT NULL CHECK(reason_code = 'source_row_ceiling_exceeded'),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(snapshot_identity, work_kind, canonical_claim_id, story_cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_kc11g_deferred_score_work_identity
  ON kc11g_deferred_score_work(snapshot_identity, work_kind, story_cluster_id, canonical_claim_id);

CREATE TRIGGER IF NOT EXISTS prevent_kc11g_deferred_score_work_update
BEFORE UPDATE ON kc11g_deferred_score_work
BEGIN
  SELECT RAISE(ABORT, 'KC-11G deferred score work is immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_kc11g_deferred_score_work_delete
BEFORE DELETE ON kc11g_deferred_score_work
BEGIN
  SELECT RAISE(ABORT, 'KC-11G deferred score work is immutable');
END;
