-- TRACE Knowledge Continuity KC-05A: claim-match candidate proposals.
-- Candidates are suggestions only. They never merge claims, attach evidence,
-- create provenance memberships, or change evidence scores.

CREATE TABLE IF NOT EXISTS knowledge_claim_match_candidates (
  id TEXT PRIMARY KEY,
  source_extraction_id TEXT NOT NULL REFERENCES source_extractions(id) ON DELETE CASCADE,
  source_document_version_id TEXT NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
  candidate_canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  match_kind TEXT NOT NULL CHECK(match_kind IN ('lexical','entity','value','date','semantic')),
  match_score REAL NOT NULL CHECK(match_score >= 0 AND match_score <= 1),
  component_json TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  semantic_method TEXT,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','superseded')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((match_kind = 'semantic' AND semantic_method IS NOT NULL) OR match_kind <> 'semantic'),
  CHECK((state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR state <> 'accepted'),
  UNIQUE(source_extraction_id, candidate_canonical_claim_id, algorithm_version)
);

CREATE INDEX IF NOT EXISTS idx_claim_match_candidates_source
  ON knowledge_claim_match_candidates(source_extraction_id, state, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_claim_match_candidates_claim
  ON knowledge_claim_match_candidates(candidate_canonical_claim_id, state, match_score DESC);
