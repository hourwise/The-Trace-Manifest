-- TRACE Knowledge Continuity KC-08H.
-- Keep the review queue cheap to inspect and deterministic proposal IDs
-- idempotent at the application boundary.

CREATE INDEX IF NOT EXISTS idx_knowledge_change_proposals_document_state
  ON knowledge_change_proposals(knowledge_document_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_change_proposals_trigger_claim
  ON knowledge_change_proposals(triggering_claim_id, state, created_at DESC);
