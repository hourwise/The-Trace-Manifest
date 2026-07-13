-- The Trace Manifest — D1 Database Schema
-- Phase 2: Source registry, ingestion pipeline, and metadata storage

-- ============================================================
-- Sources
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  feed_url TEXT,
  section TEXT NOT NULL,           -- A-F from source registry
  tier TEXT NOT NULL CHECK(tier IN ('A','B','C')),
  treatment TEXT NOT NULL,         -- vendor-reported, primary-technical, primary-research, discovery, etc.
  cadence_minutes INTEGER NOT NULL DEFAULT 360,
  ingestion_type TEXT NOT NULL CHECK(ingestion_type IN ('rss','github_api','arxiv_api','page_diff','huggingface_api','hackernews_api','manual')),
  active BOOLEAN NOT NULL DEFAULT 1,
  last_fetched_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK(health_status IN ('healthy','degraded','failing','disabled','unknown')),
  licence_terms TEXT,
  commercial_restrictions TEXT,
  requires_review BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sources_active ON sources(active);
CREATE INDEX IF NOT EXISTS idx_sources_tier ON sources(tier);
CREATE INDEX IF NOT EXISTS idx_sources_health ON sources(health_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_name ON sources(name);

-- ============================================================
-- Source policies (one-to-one with sources, or defaults)
-- ============================================================
CREATE TABLE IF NOT EXISTS source_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL UNIQUE REFERENCES sources(id),
  allow_auto_publish BOOLEAN NOT NULL DEFAULT 0,
  max_excerpt_length INTEGER NOT NULL DEFAULT 300,
  require_human_review_for TEXT,    -- comma-separated claim types
  retention_days INTEGER NOT NULL DEFAULT 90,
  fetch_timeout_ms INTEGER NOT NULL DEFAULT 30000,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Feed items (raw ingested items before dedup/classification)
-- ============================================================
CREATE TABLE IF NOT EXISTS feed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  external_id TEXT,                 -- GUID, URL hash, or API ID
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,    -- SHA-256 of canonical URL for dedup
  title TEXT NOT NULL,
  summary TEXT,
  content_excerpt TEXT,
  author TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_metadata TEXT,                -- JSON blob for source-specific fields
  ingestion_status TEXT NOT NULL DEFAULT 'raw' CHECK(ingestion_status IN ('raw','duplicate','classified','clustered','published','archived','rejected')),
  duplicate_of INTEGER REFERENCES feed_items(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feed_items_url_hash ON feed_items(url_hash);
CREATE INDEX IF NOT EXISTS idx_feed_items_source ON feed_items(source_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_published ON feed_items(published_at);
CREATE INDEX IF NOT EXISTS idx_feed_items_status ON feed_items(ingestion_status);

-- ============================================================
-- Story clusters (grouped feed items)
-- ============================================================
CREATE TABLE IF NOT EXISTS story_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  canonical_url TEXT,
  topic TEXT,
  source_class TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'unverified' CHECK(evidence_status IN ('confirmed','strongly_supported','provisionally_supported','vendor_reported','community_reported','disputed','unverified','corrected','superseded','outdated')),
  confidence_score REAL,
  published_at TEXT,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  needs_human_review BOOLEAN NOT NULL DEFAULT 0,
  reviewed_by TEXT,
  reviewed_at TEXT,
  is_published BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_cluster_members (
  cluster_id INTEGER NOT NULL REFERENCES story_clusters(id),
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id),
  is_primary BOOLEAN NOT NULL DEFAULT 0,
  PRIMARY KEY (cluster_id, feed_item_id)
);

-- ============================================================
-- Entities (models, providers, companies, people)
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('model','provider','company','person','benchmark','repository','regulation','other')),
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_entities (
  cluster_id INTEGER NOT NULL REFERENCES story_clusters(id),
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  PRIMARY KEY (cluster_id, entity_id)
);

-- ============================================================
-- Claims and evidence (Phase 3: Curation and Trust)
-- ============================================================
-- Claim classes per ADR-0007 and build plan:
--   specification-defined, official-vendor-claim, observed-implementation-behaviour,
--   independent-research-finding, benchmark-result, community-report,
--   legal-or-regulatory-statement, editorial-synthesis, trace-manifest-inference
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id INTEGER REFERENCES story_clusters(id),
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id),
  claim_text TEXT NOT NULL,
  claim_class TEXT NOT NULL CHECK(claim_class IN (
    'specification_defined','official_vendor_claim','observed_implementation_behaviour',
    'independent_research_finding','benchmark_result','community_report',
    'legal_or_regulatory_statement','editorial_synthesis','trace_manifest_inference'
  )),
  claim_domain TEXT NOT NULL DEFAULT 'general' CHECK(claim_domain IN (
    'model_capability','model_release','benchmark','pricing','security',
    'licence','regulation','research','product','funding','hardware','general'
  )),
  severity TEXT NOT NULL DEFAULT 'standard' CHECK(severity IN ('low','standard','high','extraordinary')),
  evidence_quality TEXT NOT NULL DEFAULT 'unrated' CHECK(evidence_quality IN (
    'unrated','weak','moderate','strong','very_strong','disputed'
  )),
  confidence_score REAL NOT NULL DEFAULT 0,
  is_disputed BOOLEAN NOT NULL DEFAULT 0,
  is_corrected BOOLEAN NOT NULL DEFAULT 0,
  superseded_by INTEGER REFERENCES claims(id),
  extraction_method TEXT NOT NULL DEFAULT 'rule_based',
  extraction_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claims_cluster ON claims(cluster_id);
CREATE INDEX IF NOT EXISTS idx_claims_feed_item ON claims(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_claims_class ON claims(claim_class);
CREATE INDEX IF NOT EXISTS idx_claims_domain ON claims(claim_domain);

-- Evidence relationship types per build plan:
--   supports, partially_supports, qualifies, contradicts, reports,
--   reproduces, fails_to_reproduce, supersedes, corrects, contextualises
CREATE TABLE IF NOT EXISTS claim_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL REFERENCES claims(id),
  feed_item_id INTEGER REFERENCES feed_items(id),
  relationship TEXT NOT NULL CHECK(relationship IN (
    'supports','partially_supports','qualifies','contradicts',
    'reports','reproduces','fails_to_reproduce',
    'supersedes','corrects','contextualises'
  )),
  evidence_summary TEXT NOT NULL,
  source_tier TEXT,
  is_primary_source BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim ON claim_evidence(claim_id);

CREATE TABLE IF NOT EXISTS claim_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_a_id INTEGER NOT NULL REFERENCES claims(id),
  claim_b_id INTEGER NOT NULL REFERENCES claims(id),
  conflict_type TEXT NOT NULL CHECK(conflict_type IN (
    'direct_contradiction','methodology_difference',
    'version_difference','interpretation_difference',
    'source_disagreement','temporal_difference'
  )),
  severity TEXT NOT NULL DEFAULT 'standard' CHECK(severity IN ('low','standard','high','critical')),
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_conflicts_claims ON claim_conflicts(claim_a_id, claim_b_id);

-- ============================================================
-- Corrections ledger (product principle 2.5: visible corrections)
-- ============================================================
CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id INTEGER REFERENCES story_clusters(id),
  claim_id INTEGER REFERENCES claims(id),
  correction_type TEXT NOT NULL CHECK(correction_type IN (
    'factual_error','rating_change','licence_correction','pricing_correction',
    'benchmark_correction','supersession','deprecation','methodology_update','other'
  )),
  previous_statement TEXT NOT NULL,
  updated_statement TEXT NOT NULL,
  previous_evidence_status TEXT,
  updated_evidence_status TEXT,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  impact TEXT,
  corrected_by TEXT NOT NULL,
  corrected_at TEXT NOT NULL DEFAULT (datetime('now')),
  published BOOLEAN NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_corrections_cluster ON corrections(cluster_id);
CREATE INDEX IF NOT EXISTS idx_corrections_claim ON corrections(claim_id);
CREATE INDEX IF NOT EXISTS idx_corrections_published ON corrections(published);

-- ============================================================
-- Ingestion jobs (tracking scheduled fetches)
-- ============================================================
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(id),
  job_type TEXT NOT NULL CHECK(job_type IN ('fetch','classify','dedup','cluster','health_check','briefing','extract_claims','conflict_detection')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  items_processed INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON ingestion_jobs(source_id);

-- ============================================================
-- GitHub repository tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL UNIQUE,  -- e.g. "ollama/ollama"
  category TEXT NOT NULL,          -- local-inference, training, agents, evaluation
  last_release_at TEXT,
  last_checked_at TEXT,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repository_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id INTEGER NOT NULL REFERENCES repositories(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('release','security_advisory','licence_change','archived','unarchived','tag','activity_anomaly')),
  event_data TEXT,                 -- JSON with event-specific details
  occurred_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Briefings
-- ============================================================
CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  briefing_type TEXT NOT NULL CHECK(briefing_type IN ('daily','weekly')),
  briefing_date TEXT NOT NULL,
  content_json TEXT NOT NULL,       -- Full briefing as structured JSON
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Cron audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cron_expression TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  items_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON cron_runs(started_at);

-- ============================================================
-- Pipeline stage tracking (avoids re-processing unchanged items)
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_item_id INTEGER NOT NULL REFERENCES feed_items(id),
  stage TEXT NOT NULL CHECK(stage IN ('classified','cross_source_matched','clustered','claim_extracted','evidence_labelled','reviewed','published','corrected')),
  algorithm_version TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed','skipped')),
  result_summary TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_item ON pipeline_stages(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_stage ON pipeline_stages(stage);

-- ============================================================
-- Phase 3B: Evidence-Linked Knowledge Base
-- ============================================================

-- Knowledge pages — the canonical technical reference pages
-- Not a wiki: edits flow through review (ADR-0004)
CREATE TABLE IF NOT EXISTS knowledge_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  hub TEXT NOT NULL,               -- mcp, agents, automation, memory, orchestration, etc.
  page_type TEXT NOT NULL CHECK(page_type IN (
    'core_concept','comparison','architecture','risk_security',
    'timeline','practical_reference','glossary'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
    'draft','review','published','archived','corrected'
  )),
  version INTEGER NOT NULL DEFAULT 1,
  canonical_summary TEXT NOT NULL,
  content_json TEXT NOT NULL,       -- Full page content as structured JSON (standard contract)
  claims_count INTEGER NOT NULL DEFAULT 0,
  events_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kp_slug ON knowledge_pages(slug);
CREATE INDEX IF NOT EXISTS idx_kp_hub ON knowledge_pages(hub);
CREATE INDEX IF NOT EXISTS idx_kp_status ON knowledge_pages(status);
CREATE INDEX IF NOT EXISTS idx_kp_type ON knowledge_pages(page_type);

-- Version history — every change produces a version record
CREATE TABLE IF NOT EXISTS knowledge_page_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES knowledge_pages(id),
  version_number INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kpv_page ON knowledge_page_versions(page_id);

-- Claim-to-page linking — connects extracted claims to knowledge pages
-- Relationship: supports, qualifies, challenges (the claim's relationship TO the page content)
CREATE TABLE IF NOT EXISTS knowledge_page_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES knowledge_pages(id),
  claim_id INTEGER NOT NULL REFERENCES claims(id),
  relationship TEXT NOT NULL CHECK(relationship IN (
    'supports','partially_supports','qualifies','challenges','contradicts',
    'reports','reproduces','fails_to_reproduce','supersedes','corrects','contextualises'
  )),
  section_id TEXT,                 -- which section of the page this claim relates to
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kpc_page ON knowledge_page_claims(page_id);
CREATE INDEX IF NOT EXISTS idx_kpc_claim ON knowledge_page_claims(claim_id);

-- Event-to-page linking — connects feed items/clusters that may update knowledge pages
CREATE TABLE IF NOT EXISTS knowledge_page_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES knowledge_pages(id),
  feed_item_id INTEGER REFERENCES feed_items(id),
  cluster_id INTEGER REFERENCES story_clusters(id),
  relationship TEXT NOT NULL CHECK(relationship IN (
    'update_suggested','context_added','supersedes','deprecates','confirms','challenges'
  )),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kpe_page ON knowledge_page_events(page_id);
CREATE INDEX IF NOT EXISTS idx_kpe_item ON knowledge_page_events(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_kpe_cluster ON knowledge_page_events(cluster_id);
