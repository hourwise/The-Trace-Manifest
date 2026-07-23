-- TRACE Knowledge Continuity KC-05D: review-gated shared-origin grouping.
-- Exact-content derivative proposals are suggestions only until a publisher
-- accepts them and creates the provenance group/memberships.

CREATE TABLE IF NOT EXISTS knowledge_provenance_group_proposals (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  root_source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  origin_key TEXT NOT NULL,
  proposed_relationship TEXT NOT NULL CHECK(proposed_relationship IN ('original','syndicated_from','quotes','summarises','reports_on','independently_tests','unknown')),
  origin_type TEXT NOT NULL CHECK(origin_type IN ('primary','vendor_statement','independent_test','research','government','community','unknown')),
  explanation TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  review_requirement TEXT NOT NULL CHECK(review_requirement IN ('standard','mandatory')),
  determination_method TEXT NOT NULL CHECK(determination_method IN ('rule_proposal','model_proposal')),
  algorithm_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_document_id, origin_key, algorithm_version),
  CHECK((state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR state <> 'accepted')
);

CREATE INDEX IF NOT EXISTS idx_provenance_group_proposals_state
  ON knowledge_provenance_group_proposals(state, review_requirement, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_provenance_group_proposals_origin
  ON knowledge_provenance_group_proposals(origin_key, state);

CREATE TABLE IF NOT EXISTS knowledge_provenance_group_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES knowledge_provenance_group_proposals(id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  previous_state TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accept','reject','supersede')),
  provenance_group_id TEXT REFERENCES provenance_groups(id) ON DELETE SET NULL,
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK(reviewer_role = 'publisher'),
  review_note TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_provenance_group_reviews_proposal
  ON knowledge_provenance_group_reviews(proposal_id, created_at);
