-- TRACE-EDITORIAL-DEDUPE-R1: cross-pipeline source identity for story clusters.
--
-- Manual Desk promotion and automated clustering both create story clusters.
-- Neither checked the other, so one source item could seed two clusters.
--
-- primary_source_key is 'src:' || feed_items.url_hash of the item that seeded
-- the cluster. The unique partial index makes a second cluster for the same
-- primary source fail at write time, whichever pipeline is second, so a
-- concurrent promotion and clustering run cannot both succeed. Legacy rows keep
-- NULL: they are not backfilled, because historical duplicates would violate
-- the index. Membership checks in both pipelines cover them.
--
-- The reverse membership index is the same definition as migration 0069,
-- which Production does not have. IF NOT EXISTS makes this a no-op where 0069
-- is applied. Both pipelines look up memberships by feed item, which would
-- otherwise scan story_cluster_members.
--
-- Forward-only and additive. Do not renumber: 0072 is reserved for the
-- scheduler lease work.
ALTER TABLE story_clusters ADD COLUMN primary_source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_clusters_primary_source_key
  ON story_clusters(primary_source_key)
  WHERE primary_source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_story_cluster_members_feed_item_primary_cluster
  ON story_cluster_members(feed_item_id, is_primary DESC, cluster_id);
