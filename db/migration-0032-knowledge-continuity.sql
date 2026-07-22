-- TRACE Knowledge Continuity foundation (KC-02, migration 0032).
-- Apply after migrations 0015–0017. Additive schema only: no capture,
-- extraction, queue consumer, public route, or automatic evidence promotion.

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  canonical_url_hash TEXT NOT NULL UNIQUE,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('html','markdown','plain_text','pdf','image','other')),
  admission_state TEXT NOT NULL DEFAULT 'pending' CHECK(admission_state IN ('pending','admitted','quarantined','rejected','restricted')),
  retention_class TEXT NOT NULL DEFAULT 'standard' CHECK(retention_class IN ('ephemeral','standard','long_term','legal_hold','delete_requested')),
  copyright_storage_mode TEXT NOT NULL CHECK(copyright_storage_mode IN ('metadata_only','short_excerpt','private_full_text','editor_supplied_document','prohibited')),
  current_version_id TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_source_documents_source_admission ON source_documents(source_id, admission_state, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_documents_retention ON source_documents(retention_class, copyright_storage_mode);

CREATE TABLE IF NOT EXISTS source_document_versions (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  retrieved_url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  http_status INTEGER,
  media_type TEXT,
  byte_length INTEGER CHECK(byte_length IS NULL OR byte_length >= 0),
  title TEXT,
  author TEXT,
  published_at TEXT,
  r2_original_key TEXT,
  r2_extracted_key TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK(extraction_status IN ('pending','captured','metadata_only','unsupported','restricted','paywalled','failed','extracted')),
  extraction_method TEXT,
  extraction_version TEXT,
  source_language TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_document_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_source_document_versions_document ON source_document_versions(source_document_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_document_versions_extraction ON source_document_versions(extraction_status, retrieved_at ASC);

CREATE TABLE IF NOT EXISTS source_chunks (
  id TEXT PRIMARY KEY,
  source_document_version_id TEXT NOT NULL REFERENCES source_document_versions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0),
  section_label TEXT,
  text_excerpt TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  start_locator TEXT,
  end_locator TEXT,
  r2_chunk_key TEXT,
  embedding_state TEXT NOT NULL DEFAULT 'not_requested' CHECK(embedding_state IN ('not_requested','pending','indexed','failed','stale','deleted')),
  embedding_model TEXT,
  embedding_version TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_document_version_id, chunk_index),
  UNIQUE(source_document_version_id, text_hash)
);
CREATE INDEX IF NOT EXISTS idx_source_chunks_embedding ON source_chunks(embedding_state, embedding_model, embedding_version);

CREATE TABLE IF NOT EXISTS provenance_groups (
  id TEXT PRIMARY KEY,
  root_source_document_id TEXT REFERENCES source_documents(id) ON DELETE SET NULL,
  root_claim_locator TEXT,
  origin_type TEXT NOT NULL CHECK(origin_type IN ('primary','vendor_statement','independent_test','research','government','community','unknown')),
  explanation TEXT NOT NULL,
  determined_by TEXT NOT NULL,
  determination_method TEXT NOT NULL CHECK(determination_method IN ('editor_review','imported_metadata','rule_proposal','model_proposal')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_provenance_memberships (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  provenance_group_id TEXT NOT NULL REFERENCES provenance_groups(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK(relationship IN ('original','syndicated_from','quotes','summarises','reports_on','independently_tests','unknown')),
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_document_id, provenance_group_id)
);
CREATE INDEX IF NOT EXISTS idx_source_provenance_group ON source_provenance_memberships(provenance_group_id, relationship);

CREATE TABLE IF NOT EXISTS canonical_claims (
  id TEXT PRIMARY KEY,
  canonical_text TEXT NOT NULL,
  claim_class TEXT NOT NULL CHECK(claim_class IN ('specification_defined','official_vendor_claim','observed_implementation_behaviour','independent_research_finding','benchmark_result','community_report','legal_or_regulatory_statement','editorial_synthesis','trace_manifest_inference')),
  claim_domain TEXT NOT NULL DEFAULT 'general' CHECK(claim_domain IN ('model_capability','model_release','benchmark','pricing','security','licence','regulation','research','product','funding','hardware','general')),
  subject_entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
  predicate_key TEXT,
  object_json TEXT,
  valid_from TEXT,
  valid_until TEXT,
  current_state TEXT NOT NULL DEFAULT 'active' CHECK(current_state IN ('active','qualified','disputed','corrected','superseded','retired')),
  materiality TEXT NOT NULL DEFAULT 'standard' CHECK(materiality IN ('low','standard','high','critical')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_canonical_claims_entity_state ON canonical_claims(subject_entity_id, current_state, claim_domain);

CREATE TABLE IF NOT EXISTS claim_assertions (
  id TEXT PRIMARY KEY,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  source_document_version_id TEXT REFERENCES source_document_versions(id) ON DELETE SET NULL,
  source_chunk_id TEXT REFERENCES source_chunks(id) ON DELETE SET NULL,
  start_locator TEXT,
  end_locator TEXT,
  legacy_claim_id INTEGER REFERENCES claims(id) ON DELETE SET NULL,
  assertion_text TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK(relationship IN ('supports','partially_supports','qualifies','contradicts','reports','reproduces','fails_to_reproduce','supersedes','corrects','contextualises')),
  source_role TEXT NOT NULL CHECK(source_role IN ('evidence','reported_claim','discovery_context','internal_synthesis')),
  directness TEXT NOT NULL CHECK(directness IN ('direct','indirect','derivative','unknown')),
  evidence_treatment TEXT NOT NULL CHECK(evidence_treatment IN ('factual_support','attributed_opinion','context_only','discovery_only','internal_synthesis')),
  admission_state TEXT NOT NULL CHECK(admission_state IN ('pending','admitted','quarantined','rejected')),
  freshness_state TEXT NOT NULL DEFAULT 'unknown' CHECK(freshness_state IN ('current','stale','unknown')),
  provenance_group_id TEXT REFERENCES provenance_groups(id) ON DELETE SET NULL,
  extraction_method TEXT NOT NULL,
  extraction_version TEXT,
  model_provider TEXT,
  model_identifier TEXT,
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence >= 0 AND confidence <= 1),
  reviewer_state TEXT NOT NULL DEFAULT 'proposed' CHECK(reviewer_state IN ('proposed','accepted','amended','rejected','duplicate','unsupported','needs_research')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(source_document_version_id IS NOT NULL OR legacy_claim_id IS NOT NULL),
  CHECK(source_chunk_id IS NULL OR source_document_version_id IS NOT NULL),
  CHECK((reviewer_state = 'accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR reviewer_state <> 'accepted')
);
CREATE INDEX IF NOT EXISTS idx_claim_assertions_claim_review ON claim_assertions(canonical_claim_id, reviewer_state, freshness_state);
CREATE INDEX IF NOT EXISTS idx_claim_assertions_provenance ON claim_assertions(provenance_group_id, relationship, admission_state);
CREATE INDEX IF NOT EXISTS idx_claim_assertions_legacy ON claim_assertions(legacy_claim_id);

CREATE TABLE IF NOT EXISTS story_claims (
  story_cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('primary','supporting','context','caveat','correction')),
  materiality TEXT NOT NULL DEFAULT 'standard' CHECK(materiality IN ('low','standard','high','critical')),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order >= 0),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(story_cluster_id, canonical_claim_id)
);

CREATE TABLE IF NOT EXISTS knowledge_document_claims (
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK(relationship IN ('answers','supports','qualifies','contradicts','contextualises','inference_basis')),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order >= 0),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(knowledge_document_id, canonical_claim_id, section_key)
);

CREATE TABLE IF NOT EXISTS knowledge_document_claim_assertions (
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  canonical_claim_id TEXT NOT NULL REFERENCES canonical_claims(id) ON DELETE CASCADE,
  claim_assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK(relationship IN ('supports','qualifies','contradicts','contextualises','reports')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id)
);

CREATE TABLE IF NOT EXISTS story_relationships (
  id TEXT PRIMARY KEY,
  source_story_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  target_story_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK(relationship IN ('same_event','follow_up_to','updates','contradicts','supersedes','corrects','compares_with','same_model_family','related_context')),
  explanation TEXT,
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence >= 0 AND confidence <= 1),
  created_by TEXT NOT NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(source_story_id <> target_story_id),
  UNIQUE(source_story_id, target_story_id, relationship)
);
CREATE INDEX IF NOT EXISTS idx_story_relationships_target ON story_relationships(target_story_id, relationship);

CREATE TABLE IF NOT EXISTS knowledge_change_proposals (
  id TEXT PRIMARY KEY,
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  triggering_story_id INTEGER REFERENCES story_clusters(id) ON DELETE SET NULL,
  triggering_claim_id TEXT REFERENCES canonical_claims(id) ON DELETE SET NULL,
  proposal_type TEXT NOT NULL CHECK(proposal_type IN ('update','correction','supersession','freshness_review','conflict_review')),
  proposed_change_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  detector_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','merged','expired')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_change_proposals_queue ON knowledge_change_proposals(state, created_at ASC);

CREATE TABLE IF NOT EXISTS evidence_score_snapshots (
  id TEXT PRIMARY KEY,
  story_cluster_id INTEGER NOT NULL REFERENCES story_clusters(id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
  evidence_status TEXT NOT NULL,
  component_json TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  triggering_event TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_score_snapshots_story ON evidence_score_snapshots(story_cluster_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_processing_jobs (
  id TEXT PRIMARY KEY,
  job_kind TEXT NOT NULL CHECK(job_kind IN ('capture_source','extract_structure','extract_claims','summarise_source','canonicalise_claim','index_chunk','reconcile_storage')),
  subject_type TEXT NOT NULL CHECK(subject_type IN ('source_document','source_document_version','source_chunk','canonical_claim','knowledge_document')),
  subject_id TEXT NOT NULL,
  content_hash TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed','cancelled','dead_lettered')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  correlation_id TEXT NOT NULL,
  error_code TEXT,
  error_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_processing_jobs_queue ON knowledge_processing_jobs(state, job_kind, created_at ASC);

CREATE TABLE IF NOT EXISTS knowledge_index_operations (
  id TEXT PRIMARY KEY,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('r2_put','r2_delete','vector_upsert','vector_delete')),
  subject_type TEXT NOT NULL CHECK(subject_type IN ('source_document_version','source_chunk')),
  subject_id TEXT NOT NULL,
  desired_content_hash TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','completed','failed','reconciliation_required','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_knowledge_index_operations_reconcile ON knowledge_index_operations(state, operation_kind, updated_at ASC);
