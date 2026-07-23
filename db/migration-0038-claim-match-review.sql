-- TRACE Knowledge Continuity KC-05B: attributable editor decisions for
-- claim-match candidates. Decisions never create provenance or evidence
-- scores; merge/create-new only resolve the source assertion's claim target.

CREATE TABLE IF NOT EXISTS knowledge_claim_match_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES knowledge_claim_match_candidates(id) ON DELETE CASCADE,
  source_extraction_id TEXT NOT NULL REFERENCES source_extractions(id) ON DELETE CASCADE,
  previous_state TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('merge_existing','create_new','reject','supersede')),
  resolved_canonical_claim_id TEXT REFERENCES canonical_claims(id) ON DELETE SET NULL,
  reviewer_email TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK(reviewer_role = 'publisher'),
  review_note TEXT,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_match_reviews_candidate
  ON knowledge_claim_match_reviews(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claim_match_reviews_source
  ON knowledge_claim_match_reviews(source_extraction_id, created_at);
