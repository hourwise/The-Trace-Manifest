-- TRACE Knowledge Continuity KC-06B/C.
-- Preserve every publisher decision made from Find Related. Accepted story
-- actions also materialise a durable story_relationships row; evidence review
-- records do not alter evidence scores or claim state.

CREATE TABLE IF NOT EXISTS story_related_item_reviews (
  id TEXT PRIMARY KEY,
  source_story_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  target_story_id INTEGER REFERENCES story_clusters(id) ON DELETE CASCADE,
  target_feed_item_id INTEGER REFERENCES feed_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN (
    'same_event','attach_evidence','follow_up','related_context',
    'contradiction','correction','supersession','comparison','reject'
  )),
  state TEXT NOT NULL CHECK(state IN ('accepted','rejected')),
  explanation TEXT,
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence >= 0 AND confidence <= 1),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((target_story_id IS NOT NULL AND target_feed_item_id IS NULL)
     OR (target_story_id IS NULL AND target_feed_item_id IS NOT NULL)),
  UNIQUE(source_story_id, target_story_id, target_feed_item_id, action)
);

CREATE INDEX IF NOT EXISTS idx_story_related_item_reviews_source
  ON story_related_item_reviews(source_story_id, state, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_related_item_reviews_target_story
  ON story_related_item_reviews(target_story_id, action, state);
CREATE INDEX IF NOT EXISTS idx_story_related_item_reviews_target_feed
  ON story_related_item_reviews(target_feed_item_id, action, state);

CREATE TABLE IF NOT EXISTS story_claim_evidence_attachments (
  id TEXT PRIMARY KEY,
  story_cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK(relationship IN ('supports','qualifies','contradicts','contextualises')),
  explanation TEXT,
  eligibility_state TEXT NOT NULL CHECK(eligibility_state IN ('eligible','pending','ineligible')),
  eligibility_reason TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(story_cluster_id, canonical_claim_id, feed_item_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_story_claim_evidence_attachments_story
  ON story_claim_evidence_attachments(story_cluster_id, canonical_claim_id, reviewed_at DESC);
