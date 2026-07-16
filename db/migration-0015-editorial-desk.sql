-- TRACE Desk and launch discovery feed migration.
-- Apply after schema.sql, migration-5e-publication.sql, and
-- migration-stabilisation-security.sql. This migration is additive.

CREATE TABLE IF NOT EXISTS editorial_sections (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public_enabled BOOLEAN NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS editorial_topics (
  slug TEXT PRIMARY KEY,
  section_slug TEXT NOT NULL REFERENCES editorial_sections(slug),
  name TEXT NOT NULL,
  public_enabled BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_topics_section ON editorial_topics(section_slug, public_enabled);

CREATE TABLE IF NOT EXISTS editorial_candidates (
  id TEXT PRIMARY KEY,
  intake_type TEXT NOT NULL CHECK(intake_type IN ('manual_url','social_url','lead','additional_evidence')),
  submitted_url TEXT,
  lead_text TEXT,
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'new' CHECK(state IN ('new','enriching','researching','drafting','draft_ready','needs_review','held','published','archived','rejected','withdrawn','superseded','failed')),
  section_slug TEXT REFERENCES editorial_sections(slug),
  topic_slug TEXT REFERENCES editorial_topics(slug),
  story_format TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('low','normal','high','breaking')),
  development_status TEXT NOT NULL DEFAULT 'developing' CHECK(development_status IN ('developing','current','historical')),
  source_language TEXT,
  classification_confidence REAL,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_candidates_state_created ON editorial_candidates(state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_editorial_candidates_source_hash ON editorial_candidates(source_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS editorial_candidate_evidence (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id),
  evidence_url TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('primary','independent','vendor','community','trace_internal')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(candidate_id, evidence_hash)
);

CREATE INDEX IF NOT EXISTS idx_editorial_evidence_candidate ON editorial_candidate_evidence(candidate_id, created_at DESC);

INSERT OR IGNORE INTO editorial_sections (slug, name, public_enabled, sort_order) VALUES
  ('ai-agents', 'AI & Agents', 1, 10),
  ('green-tech', 'Green Tech', 0, 20),
  ('science', 'Science', 0, 30),
  ('technology', 'Technology', 0, 40),
  ('business', 'Business', 0, 50),
  ('policy-regulation', 'Policy & Regulation', 0, 60),
  ('security', 'Security', 0, 70);

-- Discovery sources are never publication evidence by themselves.
INSERT OR IGNORE INTO sources
  (name, url, feed_url, section, tier, treatment, cadence_minutes, ingestion_type, active, requires_review)
VALUES
  ('Google AI Blog', 'https://blog.google/technology/ai/', 'https://blog.google/technology/ai/rss/', 'F', 'A', 'vendor-reported', 60, 'rss', 1, 1),
  ('The Verge AI', 'https://www.theverge.com/ai-artificial-intelligence', 'https://www.theverge.com/rss/index.xml', 'F', 'B', 'independent-reporting', 60, 'rss', 1, 1),
  ('MarkTechPost', 'https://www.marktechpost.com/', 'https://www.marktechpost.com/feed/', 'F', 'C', 'discovery', 120, 'rss', 1, 1),
  ('ByteByteGo', 'https://blog.bytebytego.com/', 'https://blog.bytebytego.com/feed', 'F', 'B', 'specialist-analysis', 720, 'rss', 1, 1),
  ('Product Hunt', 'https://www.producthunt.com/', 'https://www.producthunt.com/feed', 'F', 'C', 'discovery', 360, 'rss', 1, 1),
  ('The Pragmatic Engineer', 'https://newsletter.pragmaticengineer.com/', 'https://newsletter.pragmaticengineer.com/feed', 'F', 'B', 'specialist-analysis', 720, 'rss', 1, 1),
  ('Stratechery', 'https://stratechery.com/', 'https://stratechery.com/feed/', 'F', 'B', 'specialist-analysis', 720, 'rss', 1, 1),
  ('MCP Radar', 'https://mcp.liqiwa.com/', 'https://mcp.liqiwa.com/feed.xml', 'F', 'C', 'discovery', 1440, 'rss', 1, 1),
  ('Import AI', 'https://importai.substack.com/', 'https://importai.substack.com/feed', 'F', 'B', 'specialist-analysis', 720, 'rss', 0, 1);
