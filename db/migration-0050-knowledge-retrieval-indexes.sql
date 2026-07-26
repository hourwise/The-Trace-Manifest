-- TRACE KC-09B lexical/entity retrieval indexes.
-- Additive only: D1 remains authoritative; Vectorize is an optional recall layer.
-- Apply after migration-0049-knowledge-change-proposal-index.sql.

-- Entity and relationship lookups are the deterministic candidate path used
-- before any semantic/vector candidate is considered.
CREATE INDEX IF NOT EXISTS idx_entities_search_name
  ON entities(name COLLATE NOCASE, type);
CREATE INDEX IF NOT EXISTS idx_story_entities_entity_cluster
  ON story_entities(entity_id, cluster_id);
CREATE INDEX IF NOT EXISTS idx_story_claims_claim_role
  ON story_claims(canonical_claim_id, role, story_cluster_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_document_claims_claim
  ON knowledge_document_claims(canonical_claim_id, relationship, knowledge_document_id);
CREATE INDEX IF NOT EXISTS idx_claim_assertions_retrieval
  ON claim_assertions(canonical_claim_id, admission_state, reviewer_state, freshness_state);
CREATE INDEX IF NOT EXISTS idx_source_chunks_retrieval
  ON source_chunks(source_document_version_id, chunk_index, embedding_state);

-- A single, record-type-agnostic FTS5 surface keeps the lexical path bounded
-- and lets later retrieval code resolve every hit back to D1 by rowid. Raw
-- source text remains in the existing D1/R2 boundary; this table is not a
-- publication or evidence-authority store.
CREATE TABLE IF NOT EXISTS knowledge_search_records (
  record_key TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK(record_type IN (
    'source_chunk','canonical_claim','knowledge_document','published_story','guide','correction'
  )),
  record_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  entity_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(record_type, record_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_search_records_type
  ON knowledge_search_records(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_search_records_entity
  ON knowledge_search_records(entity_text COLLATE NOCASE);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_search_fts USING fts5(
  content,
  entity_text,
  content='knowledge_search_records',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS knowledge_search_records_ai
AFTER INSERT ON knowledge_search_records
BEGIN
  INSERT INTO knowledge_search_fts(rowid, content, entity_text)
  VALUES (new.rowid, new.content, new.entity_text);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_search_records_ad
AFTER DELETE ON knowledge_search_records
BEGIN
  INSERT INTO knowledge_search_fts(knowledge_search_fts, rowid, content, entity_text)
  VALUES ('delete', old.rowid, old.content, old.entity_text);
END;
CREATE TRIGGER IF NOT EXISTS knowledge_search_records_au
AFTER UPDATE ON knowledge_search_records
BEGIN
  INSERT INTO knowledge_search_fts(knowledge_search_fts, rowid, content, entity_text)
  VALUES ('delete', old.rowid, old.content, old.entity_text);
  INSERT INTO knowledge_search_fts(rowid, content, entity_text)
  VALUES (new.rowid, new.content, new.entity_text);
END;

-- Source chunks: preserve the locator-backed chunk boundary and add version
-- metadata only as searchable context.
CREATE TRIGGER IF NOT EXISTS source_chunks_knowledge_search_ai
AFTER INSERT ON source_chunks
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  SELECT 'source_chunk:' || new.id, 'source_chunk', new.id,
         trim(COALESCE(new.section_label, '') || ' ' || new.text_excerpt || ' ' ||
              COALESCE(version.title, '') || ' ' || COALESCE(version.source_language, '')),
         ''
    FROM source_document_versions version
   WHERE version.id = new.source_document_version_id;
END;
CREATE TRIGGER IF NOT EXISTS source_chunks_knowledge_search_au
AFTER UPDATE OF section_label, text_excerpt, source_document_version_id ON source_chunks
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  SELECT 'source_chunk:' || new.id, 'source_chunk', new.id,
         trim(COALESCE(new.section_label, '') || ' ' || new.text_excerpt || ' ' ||
              COALESCE(version.title, '') || ' ' || COALESCE(version.source_language, '')),
         ''
    FROM source_document_versions version
   WHERE version.id = new.source_document_version_id
  ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS source_chunks_knowledge_search_ad
AFTER DELETE ON source_chunks
BEGIN
  DELETE FROM knowledge_search_records WHERE record_key = 'source_chunk:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS canonical_claims_knowledge_search_ai
AFTER INSERT ON canonical_claims
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  SELECT 'canonical_claim:' || new.id, 'canonical_claim', new.id,
         trim(new.canonical_text || ' ' || COALESCE(new.predicate_key, '') || ' ' || COALESCE(new.object_json, '')),
         COALESCE(entity.name, '')
    FROM canonical_claims claim
    LEFT JOIN entities entity ON entity.id = new.subject_entity_id
   WHERE claim.id = new.id;
END;
CREATE TRIGGER IF NOT EXISTS canonical_claims_knowledge_search_au
AFTER UPDATE OF canonical_text, predicate_key, object_json, subject_entity_id ON canonical_claims
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  SELECT 'canonical_claim:' || new.id, 'canonical_claim', new.id,
         trim(new.canonical_text || ' ' || COALESCE(new.predicate_key, '') || ' ' || COALESCE(new.object_json, '')),
         COALESCE(entity.name, '')
    FROM entities entity
   WHERE entity.id = new.subject_entity_id
  ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, entity_text = excluded.entity_text, updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS canonical_claims_knowledge_search_ad
AFTER DELETE ON canonical_claims
BEGIN
  DELETE FROM knowledge_search_records WHERE record_key = 'canonical_claim:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS knowledge_documents_knowledge_search_ai
AFTER INSERT ON knowledge_documents
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  VALUES ('knowledge_document:' || new.id, 'knowledge_document', new.id,
          trim(new.canonical_question || ' ' || COALESCE(new.direct_answer, '') || ' ' ||
               COALESCE(new.detailed_explanation, '') || ' ' || COALESCE(new.section_slug, '')), '');
END;
CREATE TRIGGER IF NOT EXISTS knowledge_documents_knowledge_search_au
AFTER UPDATE OF canonical_question, direct_answer, detailed_explanation, section_slug ON knowledge_documents
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  VALUES ('knowledge_document:' || new.id, 'knowledge_document', new.id,
          trim(new.canonical_question || ' ' || COALESCE(new.direct_answer, '') || ' ' ||
               COALESCE(new.detailed_explanation, '') || ' ' || COALESCE(new.section_slug, '')), '')
  ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS knowledge_documents_knowledge_search_ad
AFTER DELETE ON knowledge_documents
BEGIN
  DELETE FROM knowledge_search_records WHERE record_key = 'knowledge_document:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS story_clusters_knowledge_search_ai
AFTER INSERT ON story_clusters
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  SELECT 'published_story:' || new.id, 'published_story', new.id,
         trim(COALESCE(new.title, '') || ' ' || COALESCE(new.topic, '') || ' ' ||
              COALESCE(new.summary, '') || ' ' || COALESCE(new.why_it_matters, '')),
         COALESCE((SELECT group_concat(entity.name, ' ') FROM story_entities se JOIN entities entity ON entity.id = se.entity_id WHERE se.cluster_id = new.id), '')
  FROM story_clusters cluster WHERE cluster.id = new.id;
END;
CREATE TRIGGER IF NOT EXISTS story_clusters_knowledge_search_au
AFTER UPDATE OF title, topic, summary, why_it_matters, publication_status ON story_clusters
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  SELECT 'published_story:' || new.id, 'published_story', new.id,
         trim(COALESCE(new.title, '') || ' ' || COALESCE(new.topic, '') || ' ' ||
              COALESCE(new.summary, '') || ' ' || COALESCE(new.why_it_matters, '')),
         COALESCE((SELECT group_concat(entity.name, ' ') FROM story_entities se JOIN entities entity ON entity.id = se.entity_id WHERE se.cluster_id = new.id), '')
  FROM story_clusters cluster WHERE cluster.id = new.id
  ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, entity_text = excluded.entity_text, updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS story_clusters_knowledge_search_ad
AFTER DELETE ON story_clusters
BEGIN
  DELETE FROM knowledge_search_records WHERE record_key = 'published_story:' || old.id;
END;

CREATE TRIGGER IF NOT EXISTS corrections_knowledge_search_ai
AFTER INSERT ON corrections
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  VALUES ('correction:' || new.id, 'correction', new.id,
          trim(new.previous_statement || ' ' || new.updated_statement || ' ' || new.reason), '');
END;
CREATE TRIGGER IF NOT EXISTS corrections_knowledge_search_au
AFTER UPDATE OF previous_statement, updated_statement, reason, published ON corrections
BEGIN
  INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
  VALUES ('correction:' || new.id, 'correction', new.id,
          trim(new.previous_statement || ' ' || new.updated_statement || ' ' || new.reason), '')
  ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, updated_at = datetime('now');
END;
CREATE TRIGGER IF NOT EXISTS corrections_knowledge_search_ad
AFTER DELETE ON corrections
BEGIN
  DELETE FROM knowledge_search_records WHERE record_key = 'correction:' || old.id;
END;

-- Entity memberships can change independently of their story row. Refresh the
-- story's denormalised entity text so entity recall remains deterministic.
CREATE TRIGGER IF NOT EXISTS story_entities_knowledge_search_ai
AFTER INSERT ON story_entities
BEGIN
  UPDATE knowledge_search_records
     SET entity_text = COALESCE((
       SELECT group_concat(entity.name, ' ')
         FROM story_entities se JOIN entities entity ON entity.id = se.entity_id
        WHERE se.cluster_id = new.cluster_id
     ), ''), updated_at = datetime('now')
   WHERE record_key = 'published_story:' || new.cluster_id;
END;
CREATE TRIGGER IF NOT EXISTS story_entities_knowledge_search_ad
AFTER DELETE ON story_entities
BEGIN
  UPDATE knowledge_search_records
     SET entity_text = COALESCE((
       SELECT group_concat(entity.name, ' ')
         FROM story_entities se JOIN entities entity ON entity.id = se.entity_id
        WHERE se.cluster_id = old.cluster_id
     ), ''), updated_at = datetime('now')
   WHERE record_key = 'published_story:' || old.cluster_id;
END;

-- Backfill existing rows and rebuild the external-content FTS index. Re-running
-- this migration is safe: records are upserted and the rebuild is deterministic.
INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
SELECT 'source_chunk:' || chunk.id, 'source_chunk', chunk.id,
       trim(COALESCE(chunk.section_label, '') || ' ' || chunk.text_excerpt || ' ' ||
            COALESCE(version.title, '') || ' ' || COALESCE(version.source_language, '')), ''
  FROM source_chunks chunk JOIN source_document_versions version ON version.id = chunk.source_document_version_id
 WHERE 1
ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, updated_at = datetime('now');
INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
SELECT 'canonical_claim:' || claim.id, 'canonical_claim', claim.id,
       trim(claim.canonical_text || ' ' || COALESCE(claim.predicate_key, '') || ' ' || COALESCE(claim.object_json, '')),
       COALESCE(entity.name, '')
  FROM canonical_claims claim LEFT JOIN entities entity ON entity.id = claim.subject_entity_id
 WHERE 1
ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, entity_text = excluded.entity_text, updated_at = datetime('now');
INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
SELECT 'knowledge_document:' || document.id, 'knowledge_document', document.id,
       trim(document.canonical_question || ' ' || COALESCE(document.direct_answer, '') || ' ' ||
            COALESCE(document.detailed_explanation, '') || ' ' || COALESCE(document.section_slug, '')), ''
  FROM knowledge_documents document
 WHERE 1
ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, updated_at = datetime('now');
INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
SELECT 'published_story:' || story.id, 'published_story', story.id,
       trim(COALESCE(story.title, '') || ' ' || COALESCE(story.topic, '') || ' ' ||
            COALESCE(story.summary, '') || ' ' || COALESCE(story.why_it_matters, '')),
       COALESCE((SELECT group_concat(entity.name, ' ') FROM story_entities se JOIN entities entity ON entity.id = se.entity_id WHERE se.cluster_id = story.id), '')
  FROM story_clusters story
 WHERE 1
ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, entity_text = excluded.entity_text, updated_at = datetime('now');
INSERT INTO knowledge_search_records(record_key, record_type, record_id, content, entity_text)
SELECT 'correction:' || correction.id, 'correction', correction.id,
       trim(correction.previous_statement || ' ' || correction.updated_statement || ' ' || correction.reason), ''
  FROM corrections correction
 WHERE 1
ON CONFLICT(record_key) DO UPDATE SET content = excluded.content, updated_at = datetime('now');

INSERT INTO knowledge_search_fts(knowledge_search_fts) VALUES ('rebuild');
