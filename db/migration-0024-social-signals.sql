-- migration-0024-social-signals.sql
-- ADR 0009: Governed social-media signal intake foundation
-- Phase 1: manual submission, validation, and reviewer queue

CREATE TABLE IF NOT EXISTS social_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL CHECK (platform IN (
    'reddit','x','bluesky','mastodon','linkedin','youtube',
    'github-discussion','forum','other-approved'
  )),
  canonical_url TEXT NOT NULL,
  canonical_url_hash TEXT NOT NULL UNIQUE,
  external_post_id TEXT,
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  submission_reason TEXT NOT NULL DEFAULT '',
  author_display_name TEXT,
  author_handle TEXT,
  original_published_at TEXT,
  reviewer_notes TEXT NOT NULL DEFAULT '',
  limited_excerpt TEXT,
  trace_summary TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (evidence_status IN (
    'unreviewed','discovery-signal','community-report','first-hand-claim',
    'maintainer-statement','expert-opinion','general-opinion',
    'corroborated','disputed','superseded','removed','rejected'
  )),
  corroboration_status TEXT NOT NULL DEFAULT 'not-checked' CHECK (corroboration_status IN (
    'not-checked','none-found','partially-corroborated','corroborated','contradicted'
  )),
  linked_source_ids TEXT NOT NULL DEFAULT '[]',
  related_claim_ids TEXT NOT NULL DEFAULT '[]',
  related_story_cluster_id INTEGER,
  link_status TEXT NOT NULL DEFAULT 'unknown' CHECK (link_status IN (
    'unknown','available','login-required','removed','blocked','unsafe'
  )),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
    'pending','approved','rejected','withdrawn'
  )),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_social_signals_review_status ON social_signals(review_status);
CREATE INDEX IF NOT EXISTS idx_social_signals_platform ON social_signals(platform);
CREATE INDEX IF NOT EXISTS idx_social_signals_submitted_at ON social_signals(submitted_at);
