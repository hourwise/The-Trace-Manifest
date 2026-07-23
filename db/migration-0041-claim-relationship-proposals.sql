-- TRACE Knowledge Continuity KC-05E: claim-level relationship proposals.
-- Relationships remain review-gated; acceptance adds a reviewed assertion
-- and never mutates claim state or evidence scores automatically.

CREATE TABLE IF NOT EXISTS knowledge_claim_relationship_proposals (
  id TEXT PRIMARY KEY,
  source_assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE CASCADE,
  source_canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  target_canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK(relationship IN ('supports','qualifies','contradicts','reproduces','corrects','temporal_change','supersedes')),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  rationale TEXT NOT NULL,
  determination_method TEXT NOT NULL CHECK(determination_method IN ('rule_proposal','model_proposal')),
  algorithm_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_assertion_id, target_canonical_claim_id, relationship, algorithm_version),
  CHECK(source_canonical_claim_id <> target_canonical_claim_id),
  CHECK((state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR state <> 'accepted')
);

CREATE INDEX IF NOT EXISTS idx_claim_relationship_proposals_state
  ON knowledge_claim_relationship_proposals(state, relationship, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_claim_relationship_proposals_source
  ON knowledge_claim_relationship_proposals(source_canonical_claim_id, state);
CREATE INDEX IF NOT EXISTS idx_claim_relationship_proposals_target
  ON knowledge_claim_relationship_proposals(target_canonical_claim_id, state);

CREATE TABLE IF NOT EXISTS knowledge_claim_relationship_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES knowledge_claim_relationship_proposals(id) ON DELETE CASCADE,
  source_assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE CASCADE,
  previous_state TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accept','reject','supersede')),
  created_assertion_id TEXT REFERENCES claim_assertions(id) ON DELETE SET NULL,
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK(reviewer_role = 'publisher'),
  review_note TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_relationship_reviews_proposal
  ON knowledge_claim_relationship_reviews(proposal_id, created_at);
