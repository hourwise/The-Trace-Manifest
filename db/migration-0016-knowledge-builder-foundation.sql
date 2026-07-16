-- TRACE Knowledge Builder foundation (ADR 0017).
-- Apply after migration-0015-editorial-desk.sql. This migration creates no
-- public route, model job, research gateway, or automatic approval path.

CREATE TABLE IF NOT EXISTS question_gaps (
  id TEXT PRIMARY KEY,
  canonical_question TEXT NOT NULL,
  canonical_hash TEXT NOT NULL UNIQUE,
  section_slug TEXT REFERENCES editorial_sections(slug),
  topic_slug TEXT REFERENCES editorial_topics(slug),
  failure_reason TEXT NOT NULL CHECK(failure_reason IN (
    'insufficient','stale','disputed','research_unavailable','knowledge_missing','out_of_scope','low_confidence'
  )),
  risk_class TEXT NOT NULL DEFAULT 'standard' CHECK(risk_class IN ('low','standard','high','restricted')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  disposition TEXT NOT NULL DEFAULT 'open' CHECK(disposition IN ('open','held','out_of_scope','ignored','rejected','merged','resolved')),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK(request_count >= 1),
  first_requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  closest_knowledge_id TEXT,
  editor_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_question_gaps_queue
  ON question_gaps(disposition, priority DESC, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_gaps_section_topic
  ON question_gaps(section_slug, topic_slug, disposition);

CREATE TABLE IF NOT EXISTS question_gap_examples (
  id TEXT PRIMARY KEY,
  question_gap_id TEXT NOT NULL REFERENCES question_gaps(id) ON DELETE CASCADE,
  sanitised_question TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'ask_trace' CHECK(source_kind IN ('ask_trace','editor','researched_answer')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  retention_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_question_gap_examples_gap
  ON question_gap_examples(question_gap_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  canonical_question TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  section_slug TEXT NOT NULL REFERENCES editorial_sections(slug),
  topic_slug TEXT REFERENCES editorial_topics(slug),
  knowledge_type TEXT NOT NULL CHECK(knowledge_type IN (
    'definition','explainer','comparison','recommendation','how_to','current_status','timeline',
    'product_profile','model_profile','policy_summary','security_advisory','frequently_asked_question'
  )),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
    'draft','needs_review','approved','held','rejected','expired','superseded','retired'
  )),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK(visibility IN (
    'internal','public_knowledge','public_guide','embargoed','retired'
  )),
  evidence_status TEXT NOT NULL DEFAULT 'unverified' CHECK(evidence_status IN (
    'confirmed','strongly_supported','provisionally_supported','vendor_reported','community_reported',
    'disputed','unverified','insufficient','stale'
  )),
  direct_answer TEXT,
  detailed_explanation TEXT,
  document_json TEXT NOT NULL DEFAULT '{}',
  source_set_hash TEXT,
  research_plan_json TEXT,
  prompt_version TEXT,
  policy_version TEXT NOT NULL,
  model_provider TEXT,
  model_identifier TEXT,
  valid_from TEXT,
  review_after TEXT,
  hard_expiry TEXT,
  approved_by TEXT,
  approved_at TEXT,
  supersedes_id TEXT REFERENCES knowledge_documents(id),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    visibility NOT IN ('public_knowledge','public_guide')
    OR (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_retrieval
  ON knowledge_documents(section_slug, topic_slug, status, visibility, hard_expiry);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_canonical
  ON knowledge_documents(canonical_hash, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_review
  ON knowledge_documents(status, review_after, hard_expiry);

CREATE TABLE IF NOT EXISTS knowledge_document_revisions (
  id TEXT PRIMARY KEY,
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK(revision_number >= 1),
  status TEXT NOT NULL CHECK(status IN ('draft','needs_review','approved','held','rejected','expired','superseded','retired')),
  document_json TEXT NOT NULL,
  source_set_hash TEXT,
  change_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(knowledge_document_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_revisions_document
  ON knowledge_document_revisions(knowledge_document_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS knowledge_document_sources (
  id TEXT PRIMARY KEY,
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  source_reference TEXT NOT NULL,
  claim_reference TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL CHECK(source_kind IN (
    'external_primary','external_independent','external_vendor','external_community',
    'trace_knowledge','trace_guide','trace_story','trace_brief','trace_correction'
  )),
  source_role TEXT NOT NULL CHECK(source_role IN ('evidence','reported_claim','discovery_context','internal_synthesis')),
  admission_state TEXT NOT NULL CHECK(admission_state IN ('admitted','quarantined','rejected')),
  freshness_state TEXT NOT NULL CHECK(freshness_state IN ('current','stale','unknown')),
  independent_evidence_weight INTEGER NOT NULL CHECK(independent_evidence_weight IN (0,1)),
  relationship TEXT NOT NULL DEFAULT 'supports' CHECK(relationship IN ('supports','contradicts','contextualises','reports','supersedes','corrects')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(
    (source_kind IN ('external_primary','external_independent') AND source_role = 'evidence' AND independent_evidence_weight = 1)
    OR (source_kind = 'external_vendor' AND source_role = 'reported_claim' AND independent_evidence_weight = 0)
    OR (source_kind = 'external_community' AND source_role = 'discovery_context' AND independent_evidence_weight = 0)
    OR (source_kind IN ('trace_knowledge','trace_guide','trace_story','trace_brief','trace_correction') AND source_role = 'internal_synthesis' AND independent_evidence_weight = 0)
  ),
  UNIQUE(knowledge_document_id, source_reference, claim_reference, relationship)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_sources_document
  ON knowledge_document_sources(knowledge_document_id, admission_state, freshness_state);

CREATE TABLE IF NOT EXISTS knowledge_document_relationships (
  id TEXT PRIMARY KEY,
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  related_type TEXT NOT NULL CHECK(related_type IN ('knowledge_document','trace_guide','story_cluster','briefing','question_gap')),
  related_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK(relationship IN ('updates','supersedes','supports','related','guide_basis','derived_from')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(knowledge_document_id, related_type, related_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_relationships_related
  ON knowledge_document_relationships(related_type, related_id);

CREATE TABLE IF NOT EXISTS knowledge_generation_jobs (
  id TEXT PRIMARY KEY,
  question_gap_id TEXT REFERENCES question_gaps(id) ON DELETE SET NULL,
  knowledge_document_id TEXT REFERENCES knowledge_documents(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN (
    'queued','checking_scope','checking_existing_knowledge','planning_research','searching','retrieving_sources',
    'admitting_sources','extracting_claims','checking_conflicts','drafting','validating','draft_ready','needs_review',
    'approved','held','rejected','expired','failed'
  )),
  policy_version TEXT NOT NULL,
  prompt_version TEXT,
  correlation_id TEXT NOT NULL,
  failure_code TEXT,
  failure_detail TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_generation_jobs_queue
  ON knowledge_generation_jobs(state, created_at ASC);
