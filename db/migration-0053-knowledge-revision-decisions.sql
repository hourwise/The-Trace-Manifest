-- TRACE Knowledge Continuity KC-10D.
-- Immutable audit context and publisher decision for substantive revisions.

CREATE TABLE IF NOT EXISTS knowledge_revision_decisions (
  revision_id TEXT PRIMARY KEY REFERENCES knowledge_document_revisions(id) ON DELETE CASCADE,
  proposal_id TEXT,
  prior_document_json TEXT NOT NULL,
  prior_source_set_hash TEXT,
  prior_evidence_status TEXT NOT NULL,
  prior_score_snapshot_json TEXT NOT NULL DEFAULT '[]',
  rationale TEXT NOT NULL,
  decision TEXT CHECK(decision IN ('approved','rejected')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_revision_decisions_review
  ON knowledge_revision_decisions(decision, reviewed_at);
