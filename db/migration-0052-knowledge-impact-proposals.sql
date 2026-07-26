-- TRACE Knowledge Continuity KC-10B.
-- Review-only impact proposals for every eligible target class. No automatic
-- revision or publication path is created by this migration.

CREATE TABLE IF NOT EXISTS knowledge_impact_proposals (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('knowledge_document','guide','model_profile','story')),
  target_id TEXT NOT NULL,
  accepted_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  triggering_story_id INTEGER REFERENCES story_clusters(id) ON DELETE SET NULL,
  impact_type TEXT NOT NULL CHECK(impact_type IN (
    'support','qualification','contradiction','correction','supersession',
    'timeline_addition','comparison_update','review_only'
  )),
  proposed_change_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  detector_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','merged','expired')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_type, target_id, accepted_claim_id, impact_type, detector_version)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_impact_proposals_queue
  ON knowledge_impact_proposals(state, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_knowledge_impact_proposals_claim
  ON knowledge_impact_proposals(accepted_claim_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_impact_proposals_target
  ON knowledge_impact_proposals(target_type, target_id, state, created_at DESC);
