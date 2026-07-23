-- TRACE Knowledge Continuity KC-05C: review-gated provenance proposals.
-- Proposals do not create provenance groups/memberships or change evidence
-- scores until a later, explicit lineage decision.

CREATE TABLE IF NOT EXISTS knowledge_claim_provenance_proposals (
  id TEXT PRIMARY KEY,
  claim_assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE CASCADE,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  proposed_relationship TEXT NOT NULL CHECK(proposed_relationship IN ('original','syndicated_from','quotes','summarises','reports_on','independently_tests','unknown')),
  proposed_directness TEXT NOT NULL CHECK(proposed_directness IN ('direct','indirect','derivative','unknown')),
  proposed_source_role TEXT NOT NULL CHECK(proposed_source_role IN ('evidence','reported_claim','discovery_context','internal_synthesis')),
  proposed_evidence_treatment TEXT NOT NULL CHECK(proposed_evidence_treatment IN ('factual_support','attributed_opinion','context_only','discovery_only','internal_synthesis')),
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  review_requirement TEXT NOT NULL CHECK(review_requirement IN ('standard','mandatory')),
  rationale TEXT NOT NULL,
  determination_method TEXT NOT NULL CHECK(determination_method IN ('rule_proposal','model_proposal')),
  algorithm_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(claim_assertion_id, algorithm_version),
  CHECK((state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR state <> 'accepted')
);

CREATE INDEX IF NOT EXISTS idx_claim_provenance_proposals_state
  ON knowledge_claim_provenance_proposals(state, review_requirement, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_claim_provenance_proposals_assertion
  ON knowledge_claim_provenance_proposals(claim_assertion_id, state);

CREATE TABLE IF NOT EXISTS knowledge_claim_provenance_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES knowledge_claim_provenance_proposals(id) ON DELETE CASCADE,
  claim_assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE CASCADE,
  previous_state TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accept','reject','supersede')),
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK(reviewer_role = 'publisher'),
  review_note TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_provenance_reviews_proposal
  ON knowledge_claim_provenance_reviews(proposal_id, created_at);
