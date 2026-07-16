-- Multilingual source and translation provenance foundation (ADR 0018).
-- Apply after migration-0016-knowledge-builder-foundation.sql. This migration
-- creates metadata only: it does not translate, publish, or enable bilingual routes.

ALTER TABLE sources ADD COLUMN default_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE feed_items ADD COLUMN source_language TEXT;
ALTER TABLE feed_items ADD COLUMN detected_language TEXT;
ALTER TABLE feed_items ADD COLUMN original_title TEXT;
ALTER TABLE feed_items ADD COLUMN original_summary TEXT;
ALTER TABLE feed_items ADD COLUMN original_content_excerpt TEXT;
ALTER TABLE feed_items ADD COLUMN original_content_hash TEXT;
ALTER TABLE feed_items ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK(translation_status IN (
    'not_required','detected','translated_unreviewed','translated_editor_reviewed','translation_disputed','translation_failed'
  ));

CREATE INDEX IF NOT EXISTS idx_feed_items_language_status
  ON feed_items(source_language, translation_status, ingestion_status);
CREATE INDEX IF NOT EXISTS idx_feed_items_original_content_hash
  ON feed_items(original_content_hash);

ALTER TABLE editorial_candidates ADD COLUMN detected_language TEXT;
ALTER TABLE editorial_candidates ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK(translation_status IN (
    'not_required','detected','translated_unreviewed','translated_editor_reviewed','translation_disputed','translation_failed'
  ));

CREATE INDEX IF NOT EXISTS idx_editorial_candidates_language
  ON editorial_candidates(source_language, detected_language, translation_status);

CREATE TABLE IF NOT EXISTS feed_item_translations (
  id TEXT PRIMARY KEY,
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL DEFAULT 'en',
  original_content_hash TEXT NOT NULL,
  translated_title TEXT,
  translated_summary TEXT,
  translated_content TEXT,
  translation_content_hash TEXT,
  translation_status TEXT NOT NULL CHECK(translation_status IN (
    'detected','translated_unreviewed','translated_editor_reviewed','translation_disputed','translation_failed'
  )),
  translation_provider TEXT,
  translation_model TEXT,
  translated_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  independent_evidence_weight INTEGER NOT NULL DEFAULT 0 CHECK(independent_evidence_weight = 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(translation_content_hash IS NULL OR translation_content_hash <> original_content_hash),
  CHECK(
    translation_status <> 'translated_editor_reviewed'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  UNIQUE(feed_item_id, target_language)
);

CREATE INDEX IF NOT EXISTS idx_feed_item_translations_review
  ON feed_item_translations(translation_status, target_language, reviewed_at);
