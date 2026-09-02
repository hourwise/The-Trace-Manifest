-- TRACE D1 R1: reverse story-cluster membership lookup support.
--
-- Apply after the accepted 0068 state. This migration is intentionally
-- independent of Mission 2 data activation and changes no
-- evidence, ingestion, publishing, or source policy semantics.
--
-- The leading feed_item_id supports reverse membership probes. is_primary DESC
-- and cluster_id preserve the existing related-items lookup ordering while
-- making the lookup covering for cluster_id.
--
-- Forward-only additive migration. IF NOT EXISTS makes repeated local fixture
-- application harmless under the repository's migration-test convention.
CREATE INDEX IF NOT EXISTS idx_story_cluster_members_feed_item_primary_cluster
  ON story_cluster_members(feed_item_id, is_primary DESC, cluster_id);
