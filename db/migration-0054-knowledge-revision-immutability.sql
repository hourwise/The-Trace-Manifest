-- TRACE Knowledge Continuity KC-10E.
-- Preserve evidence-set snapshots and prevent finalized revision history edits.

CREATE TABLE IF NOT EXISTS knowledge_revision_evidence_snapshots (
  revision_id TEXT PRIMARY KEY REFERENCES knowledge_document_revisions(id) ON DELETE CASCADE,
  evidence_set_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_revision_evidence_snapshots_created
  ON knowledge_revision_evidence_snapshots(created_at DESC);

CREATE TRIGGER IF NOT EXISTS prevent_final_knowledge_revision_update
BEFORE UPDATE ON knowledge_document_revisions
WHEN OLD.status IN ('approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'final knowledge revisions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_final_knowledge_revision_delete
BEFORE DELETE ON knowledge_document_revisions
WHEN OLD.status IN ('approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'final knowledge revisions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_knowledge_revision_decision_delete
BEFORE DELETE ON knowledge_revision_decisions
BEGIN
  SELECT RAISE(ABORT, 'revision decisions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_final_knowledge_revision_decision_update
BEFORE UPDATE ON knowledge_revision_decisions
WHEN OLD.decision IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'final revision decisions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_knowledge_revision_evidence_snapshot_update
BEFORE UPDATE ON knowledge_revision_evidence_snapshots
BEGIN
  SELECT RAISE(ABORT, 'revision evidence snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_knowledge_revision_evidence_snapshot_delete
BEFORE DELETE ON knowledge_revision_evidence_snapshots
BEGIN
  SELECT RAISE(ABORT, 'revision evidence snapshots are immutable');
END;
