-- TRACE Knowledge Continuity KC-07C.
-- Keep the score row immutable and append a deterministic before/after
-- explanation for every claim or story snapshot. The polymorphic subject key
-- lets one append-only table describe both existing snapshot tables without
-- changing their production schemas.

CREATE TABLE IF NOT EXISTS evidence_score_snapshot_explanations (
  id TEXT PRIMARY KEY,
  snapshot_kind TEXT NOT NULL CHECK(snapshot_kind IN ('claim','story')),
  snapshot_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  before_score REAL CHECK(before_score IS NULL OR (before_score >= 0 AND before_score <= 100)),
  before_evidence_status TEXT,
  before_component_json TEXT,
  after_score REAL NOT NULL CHECK(after_score >= 0 AND after_score <= 100),
  after_evidence_status TEXT NOT NULL,
  after_component_json TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  triggering_event TEXT NOT NULL,
  explanation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(snapshot_kind, snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_score_snapshot_explanations_subject
  ON evidence_score_snapshot_explanations(snapshot_kind, subject_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS prevent_evidence_score_snapshot_explanation_update
BEFORE UPDATE ON evidence_score_snapshot_explanations
BEGIN
  SELECT RAISE(ABORT, 'evidence score snapshot explanations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_evidence_score_snapshot_explanation_delete
BEFORE DELETE ON evidence_score_snapshot_explanations
BEGIN
  SELECT RAISE(ABORT, 'evidence score snapshot explanations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_canonical_claim_score_snapshot_update
BEFORE UPDATE ON canonical_claim_score_snapshots
BEGIN
  SELECT RAISE(ABORT, 'canonical claim score snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_canonical_claim_score_snapshot_delete
BEFORE DELETE ON canonical_claim_score_snapshots
BEGIN
  SELECT RAISE(ABORT, 'canonical claim score snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_story_evidence_score_snapshot_update
BEFORE UPDATE ON evidence_score_snapshots
BEGIN
  SELECT RAISE(ABORT, 'evidence score snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_story_evidence_score_snapshot_delete
BEFORE DELETE ON evidence_score_snapshots
BEGIN
  SELECT RAISE(ABORT, 'evidence score snapshots are immutable');
END;
