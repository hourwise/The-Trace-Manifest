// KNOWLEDGE-10 absorption analysis against the local Production snapshot.
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const out = {};
const q = (key, sql) => {
  try { out[key] = { sql: sql.replace(/\s+/g, " ").trim(), rows: db.prepare(sql).all() }; }
  catch (e) { out[key] = { sql: sql.replace(/\s+/g, " ").trim(), error: e.message }; }
};
q("cols.legacy_claim_cutover", "SELECT group_concat(name) c FROM pragma_table_info('legacy_claim_cutover')");
q("cols.claim_evidence", "SELECT group_concat(name) c FROM pragma_table_info('claim_evidence')");
q("cols.legacy_claim_evidence_map", "SELECT group_concat(name) c FROM pragma_table_info('legacy_claim_evidence_map')");
q("cols.story_claims", "SELECT group_concat(name) c FROM pragma_table_info('story_claims')");
q("cols.editorial_candidates", "SELECT group_concat(name) c FROM pragma_table_info('editorial_candidates')");
q("cols.knowledge_document_sources", "SELECT group_concat(name) c FROM pragma_table_info('knowledge_document_sources')");

// Legacy cutover completeness.
q("cutover.coverage", "SELECT (SELECT COUNT(*) FROM claims) legacy_claims, (SELECT COUNT(DISTINCT legacy_claim_id) FROM legacy_claim_cutover) cut_over, (SELECT COUNT(*) FROM claims WHERE id NOT IN (SELECT legacy_claim_id FROM legacy_claim_cutover)) not_cut_over");
q("cutover.targets", "SELECT COUNT(DISTINCT canonical_claim_id) canonical_targets FROM legacy_claim_cutover");
q("canonical.not_from_cutover", "SELECT COUNT(*) n FROM canonical_claims WHERE id NOT IN (SELECT canonical_claim_id FROM legacy_claim_cutover)");

// Source URL recoverability for canonical claims (legacy claim -> feed item URL).
q("canonical.source_url_recoverable", `SELECT
   SUM(has_url) with_feed_url, SUM(NOT has_url) without_feed_url, COUNT(*) total FROM (
   SELECT cc.id, MAX(fi.url IS NOT NULL) has_url FROM canonical_claims cc
   LEFT JOIN legacy_claim_cutover lc ON lc.canonical_claim_id = cc.id
   LEFT JOIN claims c ON c.id = lc.legacy_claim_id
   LEFT JOIN feed_items fi ON fi.id = c.feed_item_id
   GROUP BY cc.id)`);
q("canonical.by_class_assertion", `SELECT cc.claim_class, SUM(EXISTS (SELECT 1 FROM claim_assertions a WHERE a.canonical_claim_id=cc.id)) with_assertion, COUNT(*) n FROM canonical_claims cc GROUP BY 1 ORDER BY 3 DESC`);
q("canonical.published_by_class", `SELECT cc.claim_class, COUNT(DISTINCT cc.id) n FROM canonical_claims cc JOIN story_claims s ON s.canonical_claim_id=cc.id JOIN story_clusters sc ON sc.id=s.story_cluster_id WHERE sc.publication_status='published' GROUP BY 1 ORDER BY 2 DESC`);

// Distinct source URLs behind assertions and published canonical claims.
q("urls.legacy_assertions", `SELECT COUNT(DISTINCT fi.url) urls, COUNT(DISTINCT fi.source_id) sources FROM claim_assertions ca JOIN legacy_claim_evidence_map lm ON lm.assertion_id=ca.id JOIN claim_evidence ce ON ce.id=lm.legacy_evidence_id JOIN feed_items fi ON fi.id=ce.feed_item_id`);
q("urls.accepted_assertions", `SELECT COUNT(DISTINCT fi.url) urls, COUNT(DISTINCT fi.source_id) sources FROM claim_assertions ca JOIN legacy_claim_evidence_map lm ON lm.assertion_id=ca.id JOIN claim_evidence ce ON ce.id=lm.legacy_evidence_id JOIN feed_items fi ON fi.id=ce.feed_item_id WHERE ca.reviewer_state='accepted'`);
q("urls.accepted_by_source", `SELECT s.name, s.tier, s.treatment, s.ingestion_type, COUNT(DISTINCT ca.id) assertions, COUNT(DISTINCT fi.url) urls FROM claim_assertions ca JOIN legacy_claim_evidence_map lm ON lm.assertion_id=ca.id JOIN claim_evidence ce ON ce.id=lm.legacy_evidence_id JOIN feed_items fi ON fi.id=ce.feed_item_id JOIN sources s ON s.id=fi.source_id WHERE ca.reviewer_state='accepted' GROUP BY 1,2,3,4 ORDER BY 5 DESC`);
q("urls.published_claims", `SELECT COUNT(DISTINCT fi.url) urls FROM canonical_claims cc JOIN story_claims s ON s.canonical_claim_id=cc.id JOIN story_clusters sc ON sc.id=s.story_cluster_id JOIN legacy_claim_cutover lc ON lc.canonical_claim_id=cc.id JOIN claims c ON c.id=lc.legacy_claim_id JOIN feed_items fi ON fi.id=c.feed_item_id WHERE sc.publication_status='published' AND cc.claim_class<>'editorial_synthesis'`);
q("urls.published_claims_by_tier", `SELECT src.tier, src.treatment, COUNT(DISTINCT fi.url) urls, COUNT(DISTINCT cc.id) claims FROM canonical_claims cc JOIN story_claims s ON s.canonical_claim_id=cc.id JOIN story_clusters sc ON sc.id=s.story_cluster_id JOIN legacy_claim_cutover lc ON lc.canonical_claim_id=cc.id JOIN claims c ON c.id=lc.legacy_claim_id JOIN feed_items fi ON fi.id=c.feed_item_id JOIN sources src ON src.id=fi.source_id WHERE sc.publication_status='published' AND cc.claim_class<>'editorial_synthesis' GROUP BY 1,2 ORDER BY 3 DESC`);
q("source_docs.vs_assertion_urls", `SELECT COUNT(*) n FROM source_documents sd WHERE sd.canonical_url IN (SELECT fi.url FROM claim_evidence ce JOIN feed_items fi ON fi.id=ce.feed_item_id)`);

// Published stories and their evidence.
q("published.stories_claims", `SELECT COUNT(DISTINCT sc.id) stories, COUNT(DISTINCT s.canonical_claim_id) claims FROM story_clusters sc JOIN story_claims s ON s.story_cluster_id=sc.id WHERE sc.publication_status='published'`);
q("published.stories_without_claims", `SELECT COUNT(*) n FROM story_clusters sc WHERE sc.publication_status='published' AND NOT EXISTS (SELECT 1 FROM story_claims s WHERE s.story_cluster_id=sc.id)`);
q("published.date_range", `SELECT MIN(published_at) a, MAX(published_at) b FROM story_clusters WHERE publication_status='published'`);
q("published.by_month", `SELECT substr(published_at,1,7) m, COUNT(*) n FROM story_clusters WHERE publication_status='published' GROUP BY 1`);

// Drafts and feed backlog shape.
q("drafts.by_age_status", `SELECT substr(created_at,1,7) m, evidence_status, COUNT(*) n FROM story_clusters WHERE publication_status='draft' GROUP BY 1,2 ORDER BY 1,3 DESC`);
q("drafts.topic", `SELECT topic, COUNT(*) n FROM story_clusters WHERE publication_status='draft' GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
q("drafts.members", `SELECT COUNT(*) n, AVG(cnt) avg_members, SUM(cnt>=2) multi_source FROM (SELECT sc.id, COUNT(m.feed_item_id) cnt FROM story_clusters sc LEFT JOIN story_cluster_members m ON m.cluster_id=sc.id WHERE sc.publication_status='draft' GROUP BY sc.id)`);
q("cols.story_cluster_members", "SELECT group_concat(name) c FROM pragma_table_info('story_cluster_members')");
q("feed.raw_by_source", `SELECT s.ingestion_type, s.tier, COUNT(*) n FROM feed_items fi JOIN sources s ON s.id=fi.source_id WHERE fi.ingestion_status IN ('raw','classified') GROUP BY 1,2 ORDER BY 3 DESC`);
q("feed.raw_by_month", `SELECT substr(fetched_at,1,7) m, ingestion_status, COUNT(*) n FROM feed_items WHERE ingestion_status IN ('raw','classified') GROUP BY 1,2`);
q("feed.duplicates", `SELECT SUM(duplicate_of IS NOT NULL) dup, COUNT(*) n FROM feed_items`);
q("candidates.intake", `SELECT intake_type, state, COUNT(*) n FROM editorial_candidates GROUP BY 1,2 ORDER BY 3 DESC`);
q("candidates.age", `SELECT substr(created_at,1,7) m, COUNT(*) n FROM editorial_candidates GROUP BY 1`);
q("candidates.section", `SELECT section_slug, topic_slug, COUNT(*) n FROM editorial_candidates GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10`);

// Knowledge documents and their links.
q("knowledge.source_refs", `SELECT knowledge_document_id, source_reference, source_kind FROM knowledge_document_sources LIMIT 5`);
q("knowledge.source_link_audit", `SELECT group_concat(name) c FROM pragma_table_info('knowledge_source_link_migration_audit')`);
q("knowledge.link_audit_outcomes", `SELECT * FROM (SELECT * FROM knowledge_source_link_migration_audit LIMIT 3)`);
q("knowledge.review_after", `SELECT MIN(review_after) a, MAX(review_after) b, MIN(approved_at) ap1, MAX(approved_at) ap2 FROM knowledge_documents`);

// Models / guides / benchmarks foundation.
q("models.fields", `SELECT SUM(hardware_requirements IS NOT NULL AND hardware_requirements<>'') hw, SUM(quantisation_options IS NOT NULL AND quantisation_options<>'') quant, SUM(local_available=1) local, SUM(openness LIKE '%open%') open_w, SUM(publication_status='published') published, COUNT(*) n FROM models`);
q("models.list", `SELECT name, provider, openness, parameter_count, context_window, local_available, publication_status, last_verified_at FROM models ORDER BY name`);
q("benchmark_runs.flags", `SELECT is_vendor_run, is_independent, publication_status, COUNT(*) n FROM benchmark_runs GROUP BY 1,2,3`);
q("guides.list", `SELECT slug, category, verification_status, status, visibility FROM guides`);

// Operational tables.
q("jobs.running_age", `SELECT job_type, MIN(created_at) a, MAX(created_at) b, COUNT(*) n FROM ingestion_jobs WHERE status='running' GROUP BY 1 ORDER BY 4 DESC`);
q("cols.ingestion_jobs", "SELECT group_concat(name) c FROM pragma_table_info('ingestion_jobs')");
q("cron.by_status", `SELECT status, COUNT(*) n FROM cron_runs GROUP BY 1`);
console.log(JSON.stringify(out, null, 1));
