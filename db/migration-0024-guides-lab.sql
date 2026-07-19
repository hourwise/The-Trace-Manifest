-- TRACE Guides Lab foundation (ADR 0013).
-- Apply after migration-0016-knowledge-builder-foundation.sql.
-- Stores structured guide metadata; full body in document_json.

CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN (
    'local-ai','mcp-agents','git-github','servers-self-hosting',
    'cloud-deployment','security','development-tools','troubleshooting',
    'mobile-development','databases','automation'
  )),
  difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner','intermediate','advanced')),
  verification_status TEXT NOT NULL CHECK(verification_status IN (
    'documentation-reviewed','partially-tested','fully-tested',
    'long-term-tested','needs-review','outdated','withdrawn'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
    'draft','needs_review','approved','published','held','outdated','withdrawn'
  )),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK(visibility IN (
    'internal','public','unlisted'
  )),
  author_name TEXT NOT NULL,
  reviewed_by TEXT,
  tested_os TEXT,           -- JSON array of strings
  tested_versions TEXT,      -- JSON object
  estimated_cost TEXT,
  destructive_steps INTEGER NOT NULL DEFAULT 0 CHECK(destructive_steps IN (0,1)),
  network_exposure INTEGER NOT NULL DEFAULT 0 CHECK(network_exposure IN (0,1)),
  credentials_required INTEGER NOT NULL DEFAULT 0 CHECK(credentials_required IN (0,1)),
  root_required INTEGER NOT NULL DEFAULT 0 CHECK(root_required IN (0,1)),
  downloads_executable INTEGER NOT NULL DEFAULT 0 CHECK(downloads_executable IN (0,1)),
  body_markdown TEXT NOT NULL DEFAULT '',
  document_json TEXT NOT NULL DEFAULT '{}',
  revision_number INTEGER NOT NULL DEFAULT 1 CHECK(revision_number >= 1),
  published_at TEXT,
  last_verified_at TEXT,
  review_due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    (visibility = 'public' AND status = 'published' AND reviewed_by IS NOT NULL)
    OR visibility <> 'public'
  )
);

CREATE INDEX IF NOT EXISTS idx_guides_category_status ON guides(category, status);
CREATE INDEX IF NOT EXISTS idx_guides_review_due ON guides(status, review_due_at);
CREATE INDEX IF NOT EXISTS idx_guides_slug ON guides(slug);

CREATE TABLE IF NOT EXISTS guide_sources (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_url TEXT,
  relationship TEXT NOT NULL CHECK(relationship IN (
    'instruction-source','security-source','compatibility-source',
    'pricing-source','background','contradicting-source'
  )),
  supports_sections TEXT,    -- JSON array of section slugs
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guide_sources_guide ON guide_sources(guide_id, relationship);

CREATE TABLE IF NOT EXISTS guide_revisions (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
  status TEXT NOT NULL,
  document_json TEXT NOT NULL,
  change_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guide_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_guide_revisions_guide ON guide_revisions(guide_id, revision_number DESC);
