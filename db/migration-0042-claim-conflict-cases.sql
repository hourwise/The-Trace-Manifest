-- TRACE Knowledge Continuity KC-05F: preserve unresolved claim conflicts.
-- Conflict cases are explicit records; no side is preferred automatically.

CREATE TABLE IF NOT EXISTS knowledge_claim_conflict_cases (
  id TEXT PRIMARY KEY,
  source_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  target_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  relationship_proposal_id TEXT REFERENCES knowledge_claim_relationship_proposals(id) ON DELETE SET NULL,
  conflict_kind TEXT NOT NULL CHECK(conflict_kind IN ('contradiction','correction','supersession','temporal_change')),
  explanation TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK(status IN ('unresolved','acknowledged','resolved','dismissed')),
  resolution_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(source_claim_id <> target_claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_conflict_cases_status
  ON knowledge_claim_conflict_cases(status, conflict_kind, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_claim_conflict_cases_claims
  ON knowledge_claim_conflict_cases(source_claim_id, target_claim_id, status);

CREATE TABLE IF NOT EXISTS knowledge_claim_conflict_reviews (
  id TEXT PRIMARY KEY,
  conflict_case_id TEXT NOT NULL REFERENCES knowledge_claim_conflict_cases(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('acknowledge','resolve','dismiss','reopen')),
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK(reviewer_role = 'publisher'),
  review_note TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_conflict_reviews_case
  ON knowledge_claim_conflict_reviews(conflict_case_id, created_at);
