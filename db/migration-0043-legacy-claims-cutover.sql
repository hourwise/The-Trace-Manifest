-- TRACE Knowledge Continuity KC-05G.
-- Map legacy claims/evidence into the canonical claim graph, then freeze the
-- legacy tables as compatibility data. This migration is additive and safe to
-- rerun; it never deletes or rewrites legacy rows.

CREATE TABLE IF NOT EXISTS legacy_claim_cutover (
  legacy_claim_id INTEGER PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
  canonical_claim_id TEXT REFERENCES canonical_claims(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK(state IN ('mapped','quarantined')),
  reason TEXT NOT NULL,
  mapped_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_legacy_claim_cutover_canonical
  ON legacy_claim_cutover(canonical_claim_id, state);

CREATE TABLE IF NOT EXISTS legacy_claim_evidence_map (
  legacy_evidence_id INTEGER PRIMARY KEY REFERENCES claim_evidence(id) ON DELETE CASCADE,
  legacy_claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  assertion_id TEXT NOT NULL UNIQUE REFERENCES claim_assertions(id) ON DELETE CASCADE,
  mapped_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_legacy_claim_evidence_map_claim
  ON legacy_claim_evidence_map(legacy_claim_id);

-- Only governed legacy classes can enter the canonical graph. Production
-- forward repairs deliberately label unknown historical rows
-- legacy_unclassified; those remain readable but cannot become evidence by
-- inference during this cutover.
INSERT OR IGNORE INTO canonical_claims
  (id, canonical_text, claim_class, claim_domain, current_state, materiality, created_at, updated_at)
SELECT
  'legacy-claim-' || c.id,
  c.claim_text,
  c.claim_class,
  c.claim_domain,
  CASE
    WHEN c.is_corrected = 1 THEN 'corrected'
    WHEN c.superseded_by IS NOT NULL THEN 'superseded'
    WHEN c.is_disputed = 1 OR c.evidence_quality = 'disputed' THEN 'disputed'
    ELSE 'active'
  END,
  CASE c.severity WHEN 'extraordinary' THEN 'critical' ELSE c.severity END,
  c.created_at,
  COALESCE(c.updated_at, c.created_at)
FROM claims c
WHERE c.claim_class IN (
  'specification_defined','official_vendor_claim','observed_implementation_behaviour',
  'independent_research_finding','benchmark_result','community_report',
  'legal_or_regulatory_statement','editorial_synthesis','trace_manifest_inference'
);

INSERT OR IGNORE INTO legacy_claim_cutover
  (legacy_claim_id, canonical_claim_id, state, reason)
SELECT c.id, 'legacy-claim-' || c.id, 'mapped',
       'Legacy claim mapped to canonical claim with retained legacy identifier.'
FROM claims c
WHERE c.claim_class IN (
  'specification_defined','official_vendor_claim','observed_implementation_behaviour',
  'independent_research_finding','benchmark_result','community_report',
  'legal_or_regulatory_statement','editorial_synthesis','trace_manifest_inference'
)
ON CONFLICT(legacy_claim_id) DO UPDATE SET
  canonical_claim_id = excluded.canonical_claim_id,
  state = excluded.state,
  reason = excluded.reason;

INSERT OR IGNORE INTO legacy_claim_cutover
  (legacy_claim_id, canonical_claim_id, state, reason)
SELECT c.id, NULL, 'quarantined',
       'Legacy claim class is unclassified; retained for audit and excluded from canonical evidence.'
FROM claims c
WHERE c.claim_class NOT IN (
  'specification_defined','official_vendor_claim','observed_implementation_behaviour',
  'independent_research_finding','benchmark_result','community_report',
  'legal_or_regulatory_statement','editorial_synthesis','trace_manifest_inference'
)
ON CONFLICT(legacy_claim_id) DO NOTHING;

-- The claim-level assertion is retained even when no source version exists;
-- legacy_claim_id is the explicit compatibility locator required by the
-- canonical schema. It is accepted only for already published/reviewed
-- stories; otherwise it remains pending for publisher review.
INSERT OR IGNORE INTO claim_assertions
  (id, canonical_claim_id, source_document_version_id, source_chunk_id,
   start_locator, end_locator, legacy_claim_id, assertion_text, relationship,
   source_role, directness, evidence_treatment, admission_state,
   freshness_state, extraction_method, extraction_version, model_provider,
   model_identifier, confidence, reviewer_state, reviewed_by, reviewed_at,
   created_at)
SELECT
  'legacy-claim-assertion-' || c.id,
  'legacy-claim-' || c.id,
  NULL, NULL, NULL, NULL, c.id, c.claim_text, 'reports',
  CASE WHEN c.claim_class IN ('editorial_synthesis','trace_manifest_inference')
       THEN 'internal_synthesis' ELSE 'reported_claim' END,
  'unknown',
  CASE WHEN c.claim_class IN ('editorial_synthesis','trace_manifest_inference')
       THEN 'internal_synthesis' ELSE 'factual_support' END,
  CASE WHEN EXISTS (
         SELECT 1 FROM story_clusters sc
         WHERE sc.id = c.cluster_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN 'admitted' ELSE 'pending' END,
  'unknown', c.extraction_method, c.extraction_version, NULL, NULL,
  c.confidence_score,
  CASE WHEN EXISTS (
         SELECT 1 FROM story_clusters sc
         WHERE sc.id = c.cluster_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN 'accepted' ELSE 'proposed' END,
  CASE WHEN EXISTS (
         SELECT 1 FROM story_clusters sc
         WHERE sc.id = c.cluster_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN 'legacy-cutover' ELSE NULL END,
  CASE WHEN EXISTS (
         SELECT 1 FROM story_clusters sc
         WHERE sc.id = c.cluster_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN COALESCE(c.updated_at, c.created_at) ELSE NULL END,
  c.created_at
FROM claims c
JOIN legacy_claim_cutover m ON m.legacy_claim_id = c.id AND m.state = 'mapped';

-- Every legacy evidence record gets its own assertion so source-level
-- relationship and summary text are not collapsed into the claim assertion.
INSERT OR IGNORE INTO claim_assertions
  (id, canonical_claim_id, source_document_version_id, source_chunk_id,
   start_locator, end_locator, legacy_claim_id, assertion_text, relationship,
   source_role, directness, evidence_treatment, admission_state,
   freshness_state, extraction_method, extraction_version, confidence,
   reviewer_state, reviewed_by, reviewed_at, created_at)
SELECT
  'legacy-evidence-' || ce.id,
  m.canonical_claim_id,
  NULL, NULL, NULL, NULL, ce.claim_id, ce.evidence_summary, ce.relationship,
  'evidence', 'unknown',
  CASE WHEN ce.relationship = 'contextualises' THEN 'context_only' ELSE 'factual_support' END,
  CASE WHEN EXISTS (
         SELECT 1 FROM claims c
         JOIN story_clusters sc ON sc.id = c.cluster_id
         WHERE c.id = ce.claim_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN 'admitted' ELSE 'pending' END,
  'unknown', 'legacy_claim_evidence', 'legacy-claim-evidence-v1',
  CASE WHEN ce.is_primary_source = 1 THEN 0.7 ELSE 0.4 END,
  CASE WHEN EXISTS (
         SELECT 1 FROM claims c
         JOIN story_clusters sc ON sc.id = c.cluster_id
         WHERE c.id = ce.claim_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN 'accepted' ELSE 'proposed' END,
  CASE WHEN EXISTS (
         SELECT 1 FROM claims c
         JOIN story_clusters sc ON sc.id = c.cluster_id
         WHERE c.id = ce.claim_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN 'legacy-cutover' ELSE NULL END,
  CASE WHEN EXISTS (
         SELECT 1 FROM claims c
         JOIN story_clusters sc ON sc.id = c.cluster_id
         WHERE c.id = ce.claim_id
           AND (sc.is_published = 1 OR sc.publication_status = 'published')
       ) THEN ce.created_at ELSE NULL END,
  ce.created_at
FROM claim_evidence ce
JOIN legacy_claim_cutover m ON m.legacy_claim_id = ce.claim_id AND m.state = 'mapped';

INSERT OR IGNORE INTO legacy_claim_evidence_map
  (legacy_evidence_id, legacy_claim_id, assertion_id)
SELECT ce.id, ce.claim_id, 'legacy-evidence-' || ce.id
FROM claim_evidence ce
JOIN legacy_claim_cutover m ON m.legacy_claim_id = ce.claim_id AND m.state = 'mapped';

-- Preserve story-to-claim ownership for existing published and draft stories.
INSERT OR IGNORE INTO story_claims
  (story_cluster_id, canonical_claim_id, role, materiality, display_order)
SELECT c.cluster_id, m.canonical_claim_id,
       CASE WHEN c.severity IN ('high','extraordinary') THEN 'primary' ELSE 'supporting' END,
       CASE c.severity WHEN 'extraordinary' THEN 'critical' ELSE c.severity END,
       c.id
FROM claims c
JOIN legacy_claim_cutover m ON m.legacy_claim_id = c.id AND m.state = 'mapped'
WHERE c.cluster_id IS NOT NULL;

-- The old tables are now compatibility-only. All active writers must use the
-- canonical tables; these guards make accidental reintroduction of dual-write
-- paths fail closed and visibly.
CREATE TRIGGER IF NOT EXISTS trg_legacy_claims_read_only_insert
BEFORE INSERT ON claims BEGIN
  SELECT RAISE(ABORT, 'legacy claims are read-only after KC-05G cutover');
END;
CREATE TRIGGER IF NOT EXISTS trg_legacy_claims_read_only_update
BEFORE UPDATE ON claims BEGIN
  SELECT RAISE(ABORT, 'legacy claims are read-only after KC-05G cutover');
END;
CREATE TRIGGER IF NOT EXISTS trg_legacy_claims_read_only_delete
BEFORE DELETE ON claims BEGIN
  SELECT RAISE(ABORT, 'legacy claims are read-only after KC-05G cutover');
END;
CREATE TRIGGER IF NOT EXISTS trg_legacy_claim_evidence_read_only_insert
BEFORE INSERT ON claim_evidence BEGIN
  SELECT RAISE(ABORT, 'legacy claim evidence is read-only after KC-05G cutover');
END;
CREATE TRIGGER IF NOT EXISTS trg_legacy_claim_evidence_read_only_update
BEFORE UPDATE ON claim_evidence BEGIN
  SELECT RAISE(ABORT, 'legacy claim evidence is read-only after KC-05G cutover');
END;
CREATE TRIGGER IF NOT EXISTS trg_legacy_claim_evidence_read_only_delete
BEFORE DELETE ON claim_evidence BEGIN
  SELECT RAISE(ABORT, 'legacy claim evidence is read-only after KC-05G cutover');
END;
