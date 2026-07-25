-- TRACE Knowledge Continuity KC-08E.
-- Preserve the legacy string-only knowledge source links as migration audit
-- records while reviewed section -> claim -> assertion joins become canonical.

CREATE TABLE IF NOT EXISTS knowledge_source_link_migration_audit (
  id TEXT PRIMARY KEY,
  legacy_source_link_id TEXT NOT NULL UNIQUE,
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  source_reference TEXT NOT NULL,
  claim_reference TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_role TEXT NOT NULL,
  admission_state TEXT NOT NULL,
  freshness_state TEXT NOT NULL,
  independent_evidence_weight INTEGER NOT NULL CHECK(independent_evidence_weight IN (0,1)),
  relationship TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending_review'
    CHECK(state IN ('pending_review','migrated','retained_legacy','rejected')),
  migrated_section_key TEXT,
  migrated_canonical_claim_id TEXT REFERENCES canonical_claims(id) ON DELETE SET NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_source_link_audit_queue
  ON knowledge_source_link_migration_audit(knowledge_document_id, state, created_at);

-- Snapshot rows that already exist. The original source_reference and
-- claim_reference are intentionally retained here for migration audit only.
INSERT OR IGNORE INTO knowledge_source_link_migration_audit
  (id, legacy_source_link_id, knowledge_document_id, source_reference,
   claim_reference, source_kind, source_role, admission_state, freshness_state,
   independent_evidence_weight, relationship)
SELECT
  'knowledge-source-link-audit-' || id,
  id,
  knowledge_document_id,
  source_reference,
  claim_reference,
  source_kind,
  source_role,
  admission_state,
  freshness_state,
  independent_evidence_weight,
  relationship
FROM knowledge_document_sources;

-- Keep the audit ledger complete for future compatibility rows without making
-- those rows eligible evidence or creating canonical joins automatically.
CREATE TRIGGER IF NOT EXISTS trg_knowledge_source_link_audit_insert
AFTER INSERT ON knowledge_document_sources
BEGIN
  INSERT OR IGNORE INTO knowledge_source_link_migration_audit
    (id, legacy_source_link_id, knowledge_document_id, source_reference,
     claim_reference, source_kind, source_role, admission_state, freshness_state,
     independent_evidence_weight, relationship)
  VALUES
    ('knowledge-source-link-audit-' || NEW.id, NEW.id, NEW.knowledge_document_id,
     NEW.source_reference, NEW.claim_reference, NEW.source_kind, NEW.source_role,
     NEW.admission_state, NEW.freshness_state, NEW.independent_evidence_weight,
     NEW.relationship);
END;
