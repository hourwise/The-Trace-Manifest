-- KC-12A-C: bounded public evidence and reviewed relationship lookups.
-- These indexes support read-only public pages; they do not change eligibility.

CREATE INDEX IF NOT EXISTS idx_story_claims_public_story_order
  ON story_claims(story_cluster_id, display_order, canonical_claim_id);

CREATE INDEX IF NOT EXISTS idx_story_relationships_source_reviewed
  ON story_relationships(source_story_id, reviewed_at, relationship);

CREATE INDEX IF NOT EXISTS idx_story_relationships_target_reviewed
  ON story_relationships(target_story_id, reviewed_at, relationship);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_claims_public_order
  ON knowledge_document_claims(knowledge_document_id, section_key, display_order, canonical_claim_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_assertions_public
  ON knowledge_document_claim_assertions(knowledge_document_id, section_key, canonical_claim_id, reviewed_by);
