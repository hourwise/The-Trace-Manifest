-- TRACE Knowledge Continuity KC-07A.
-- Store immutable claim-level score outputs beside the existing story-level
-- evidence_score_snapshots table. Recalculation and trigger orchestration are
-- deliberately deferred to KC-07B/C.

CREATE TABLE IF NOT EXISTS canonical_claim_score_snapshots (
  id TEXT PRIMARY KEY,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
  evidence_status TEXT NOT NULL CHECK(evidence_status IN (
    'confirmed','strongly_supported','provisionally_supported','vendor_reported',
    'community_reported','disputed','unverified','corrected','superseded','outdated'
  )),
  component_json TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  triggering_event TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_canonical_claim_score_snapshots_claim
  ON canonical_claim_score_snapshots(canonical_claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_claim_score_snapshots_policy
  ON canonical_claim_score_snapshots(policy_version, created_at DESC);
