// KNOWLEDGE-10 census + eligibility funnel against the local Production snapshot.
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const out = {};
const q = (key, sql) => {
  try { out[key] = { sql: sql.replace(/\s+/g, " ").trim(), rows: db.prepare(sql).all() }; }
  catch (e) { out[key] = { sql: sql.replace(/\s+/g, " ").trim(), error: e.message }; }
};

// Census
q("stories.publication", "SELECT publication_status, COUNT(*) n, SUM(reviewed_by IS NOT NULL) reviewed, SUM(slug IS NOT NULL) slugged FROM story_clusters GROUP BY 1");
q("stories.evidence_status", "SELECT publication_status, evidence_status, COUNT(*) n FROM story_clusters GROUP BY 1,2 ORDER BY 1,3 DESC");
q("stories.published_with_assertion", "SELECT COUNT(DISTINCT sc.id) n FROM story_clusters sc JOIN story_claims s ON s.story_cluster_id=sc.id JOIN claim_assertions ca ON ca.canonical_claim_id=s.canonical_claim_id WHERE sc.publication_status='published'");
q("canonical.state", "SELECT current_state, COUNT(*) n FROM canonical_claims GROUP BY 1");
q("canonical.class", "SELECT claim_class, claim_domain, COUNT(*) n FROM canonical_claims GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20");
q("canonical.materiality", "SELECT materiality, COUNT(*) n FROM canonical_claims GROUP BY 1");
q("canonical.without_assertion_by_pub", "SELECT COALESCE(sc.publication_status,'no-story') p, COUNT(DISTINCT cc.id) n FROM canonical_claims cc LEFT JOIN story_claims s ON s.canonical_claim_id=cc.id LEFT JOIN story_clusters sc ON sc.id=s.story_cluster_id WHERE NOT EXISTS (SELECT 1 FROM claim_assertions a WHERE a.canonical_claim_id=cc.id) GROUP BY 1");
q("canonical.with_assertion_by_pub", "SELECT COALESCE(sc.publication_status,'no-story') p, COUNT(DISTINCT cc.id) n FROM canonical_claims cc LEFT JOIN story_claims s ON s.canonical_claim_id=cc.id LEFT JOIN story_clusters sc ON sc.id=s.story_cluster_id WHERE EXISTS (SELECT 1 FROM claim_assertions a WHERE a.canonical_claim_id=cc.id) GROUP BY 1");
q("assertions.axes", "SELECT admission_state, reviewer_state, freshness_state, COUNT(*) n FROM claim_assertions GROUP BY 1,2,3 ORDER BY 4 DESC");
q("assertions.shape", "SELECT source_role, evidence_treatment, relationship, directness, COUNT(*) n FROM claim_assertions GROUP BY 1,2,3,4 ORDER BY 5 DESC");
q("assertions.links", "SELECT SUM(source_document_version_id IS NOT NULL) with_version, SUM(source_chunk_id IS NOT NULL) with_chunk, SUM(start_locator IS NOT NULL AND end_locator IS NOT NULL) with_locator, SUM(provenance_group_id IS NOT NULL) with_provenance, SUM(legacy_claim_id IS NOT NULL) with_legacy_claim, SUM(id IN (SELECT assertion_id FROM legacy_claim_evidence_map)) legacy_mapped, COUNT(*) total FROM claim_assertions");
q("assertions.extraction", "SELECT extraction_method, extraction_version, model_provider, COUNT(*) n FROM claim_assertions GROUP BY 1,2,3");
q("assertions.reviewed", "SELECT reviewer_state, reviewed_by IS NOT NULL has_reviewer, COUNT(*) n, MIN(reviewed_at) first, MAX(reviewed_at) last FROM claim_assertions GROUP BY 1,2");
q("sources.docs", "SELECT media_kind, admission_state, capture_state, retrieval_state, copyright_storage_mode, COUNT(*) n FROM source_documents GROUP BY 1,2,3,4,5");
q("sources.versions", "SELECT extraction_status, extraction_state, storage_state, hash_semantics_version, COUNT(*) n, SUM(r2_original_key IS NOT NULL) r2 FROM source_document_versions GROUP BY 1,2,3,4");
q("sources.doc_registry", "SELECT s.ingestion_type, s.tier, COUNT(*) n FROM source_documents sd LEFT JOIN sources s ON s.id=sd.source_id GROUP BY 1,2");
q("sources.doc_assertions", "SELECT COUNT(*) n FROM claim_assertions WHERE source_document_version_id IS NOT NULL");
q("chunks", "SELECT COUNT(*) n FROM source_chunks");
q("provenance", "SELECT (SELECT COUNT(*) FROM provenance_groups) grps, (SELECT COUNT(*) FROM source_provenance_memberships) memberships");
q("knowledge.docs", "SELECT status, visibility, evidence_status, knowledge_type, COUNT(*) n, SUM(review_after IS NOT NULL AND datetime(review_after)<=datetime('now')) review_due, SUM(hard_expiry IS NOT NULL AND datetime(hard_expiry)<=datetime('now')) expired FROM knowledge_documents GROUP BY 1,2,3,4");
q("knowledge.sources", "SELECT source_kind, source_role, admission_state, freshness_state, COUNT(*) n FROM knowledge_document_sources GROUP BY 1,2,3,4");
q("knowledge.mappings", "SELECT (SELECT COUNT(*) FROM knowledge_document_claims) claims, (SELECT COUNT(*) FROM knowledge_document_claim_assertions) assertions, (SELECT COUNT(*) FROM knowledge_document_revisions) revisions, (SELECT COUNT(*) FROM knowledge_change_proposals) proposals");
q("extraction", "SELECT (SELECT COUNT(*) FROM claim_extraction_runs) runs, (SELECT COUNT(*) FROM claim_extraction_run_items) items, (SELECT COUNT(*) FROM claim_extraction_run_effects) effects, (SELECT COUNT(*) FROM knowledge_extraction_runs) k_runs");
q("search", "SELECT record_type, COUNT(*) n FROM knowledge_search_records GROUP BY 1");
q("search.drafts_indexed", "SELECT sc.publication_status, COUNT(*) n FROM knowledge_search_records r JOIN story_clusters sc ON sc.id = r.record_id WHERE r.record_type='published_story' GROUP BY 1");
q("vector", "SELECT (SELECT COUNT(*) FROM knowledge_embedding_index_items) items, (SELECT COUNT(*) FROM knowledge_embedding_runs) runs, (SELECT COUNT(*) FROM knowledge_index_operations) ops");
q("ai.requests_cols", "SELECT group_concat(name) cols FROM pragma_table_info('ai_requests')");
q("ai.ledger_cols", "SELECT group_concat(name) cols FROM pragma_table_info('ai_usage_ledger')");
q("question_gaps", "SELECT * FROM question_gaps");
q("feed.status", "SELECT ingestion_status, COUNT(*) n FROM feed_items GROUP BY 1");
q("feed.range", "SELECT MIN(fetched_at) a, MAX(fetched_at) b FROM feed_items");
q("jobs.status", "SELECT status, COUNT(*) n FROM ingestion_jobs GROUP BY 1");
q("candidates.state", "SELECT state, COUNT(*) n FROM editorial_candidates GROUP BY 1");
q("sources.registry", "SELECT ingestion_type, active, COUNT(*) n FROM sources GROUP BY 1,2");
q("source93", "SELECT id, name, ingestion_type, active, tier, treatment, health_status, consecutive_failures, last_fetched_at, last_success_at, last_error_at FROM sources WHERE id=93");

// Funnel: stages mirror retrievePublishedEvidence in src/lib/server/ask-evidence.ts.
const base = `FROM claim_assertions ca JOIN canonical_claims cc ON cc.id=ca.canonical_claim_id
  LEFT JOIN legacy_claim_evidence_map lm ON lm.assertion_id=ca.id LEFT JOIN claim_evidence ce ON ce.id=lm.legacy_evidence_id
  LEFT JOIN feed_items fi ON fi.id=ce.feed_item_id LEFT JOIN source_document_versions sv ON sv.id=ca.source_document_version_id
  LEFT JOIN source_documents sd ON sd.id=sv.source_document_id`;
const pub = `EXISTS (SELECT 1 FROM story_claims s JOIN story_clusters sc ON sc.id=s.story_cluster_id WHERE s.canonical_claim_id=cc.id
  AND sc.publication_status='published' AND sc.published_at IS NOT NULL AND datetime(sc.published_at)<=datetime('now') AND sc.slug IS NOT NULL
  AND sc.reviewed_by IS NOT NULL AND sc.reviewed_at IS NOT NULL AND sc.summary IS NOT NULL AND trim(sc.summary)<>''
  AND sc.evidence_status NOT IN ('unverified','outdated','superseded'))`;
const stages = [
  ["01 stored", "1=1"],
  ["02 source identity (legacy evidence map or captured version)", "(lm.assertion_id IS NOT NULL OR sv.id IS NOT NULL)"],
  ["03 role/treatment acceptable", "ca.source_role IN ('evidence','reported_claim') AND ca.evidence_treatment NOT IN ('discovery_only','internal_synthesis')"],
  ["04 admitted", "ca.admission_state='admitted'"],
  ["05 accepted", "ca.reviewer_state='accepted'"],
  ["06 current", "ca.freshness_state='current'"],
  ["07 canonical claim live", "cc.current_state NOT IN ('corrected','superseded','retired')"],
  ["08 captured version usable (non-pdf, extracted)", "(sv.id IS NULL OR (sd.media_kind<>'pdf' AND sv.extraction_status IN ('captured','extracted') AND sv.extraction_state IN ('extracted','pending')))"],
  ["09 legacy feed item published", "(fi.id IS NULL OR fi.ingestion_status='published')"],
  ["10 linked to an eligible published story", pub],
];
const where = [];
out.funnel = [];
for (const [label, cond] of stages) {
  where.push(cond);
  const cumulative = db.prepare(`SELECT COUNT(DISTINCT ca.id) n ${base} WHERE ${where.join(" AND ")}`).get().n;
  const passingAlone = db.prepare(`SELECT COUNT(DISTINCT ca.id) n ${base} WHERE ${cond}`).get().n;
  out.funnel.push({ stage: label, cumulative, passingAlone });
}
// Funnel without the freshness stage, to show what freshness alone blocks.
out.funnelWithoutFreshness = db.prepare(`SELECT COUNT(DISTINCT ca.id) n ${base} WHERE ${stages.filter(([l]) => !l.startsWith("06")).map(([, c]) => c).join(" AND ")}`).get().n;

// Preconditions for the freshness-promotion gate (evidence-freshness-review.ts) and "strong" quality.
q("gate.freshness_promotion_preconditions", `SELECT COUNT(*) admitted_accepted, SUM(ca.provenance_group_id IS NOT NULL) provenance, SUM(ca.source_chunk_id IS NOT NULL) chunk,
  SUM(sv.id IS NOT NULL AND sv.extraction_state IN ('extracted','captured')) usable_version,
  SUM(ca.source_role='evidence' AND ca.evidence_treatment='factual_support') factual,
  SUM(ca.relationship IN ('supports','partially_supports','qualifies','reproduces')) relationship_ok ${base}
  WHERE ca.admission_state='admitted' AND ca.reviewer_state='accepted'`);
console.log(JSON.stringify(out, null, 1));
