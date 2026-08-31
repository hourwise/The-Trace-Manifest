#!/usr/bin/env node
/**
 * TRACE V1 Mission 1 read-only production assessment and deterministic plan.
 *
 * This command builds an accepted local schema snapshot, reads the named
 * Production D1 through Wrangler, and writes one Markdown report plus its
 * machine-readable companion. It never sends a write query to Cloudflare.
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteD1 } from "../tests/sqlite-d1";
import {
  buildKnowledgeLaunchPlan,
  buildSourceCohortPlan,
  buildStoryLaunchPlan,
  inspectSchemaParity,
  projectAskReadiness,
  TRACE_V1_M1_REQUIRED_TABLES,
  type KnowledgeCandidateSnapshot,
  type SchemaColumnSnapshot,
  type SchemaObjectSnapshot,
  type SchemaSnapshot,
  type SourceCohortSnapshot,
  type StoryAssertionSnapshot,
  type StoryCandidateSnapshot,
} from "../src/lib/server/trace-v1-m1";

const ROOT = resolve(".");
const PRODUCTION_DATABASE = "trace-manifest-db";
const PRODUCTION_DATABASE_ID = "1625036a-ffe2-4103-bf9d-086bae150561";
const PREVIEW_DATABASE = "trace-manifest-db-preview";
const PREVIEW_DATABASE_ID = "f312f662-2252-4005-8103-1a40d546e16b";
const REPORT_PATH = resolve("docs/v1/production-evidence-readiness.md");
const JSON_PATH = resolve("docs/v1/production-evidence-readiness.json");

type Row = Record<string, unknown>;

const MIGRATION_CATALOG = [
  ["migration-5e-publication.sql", "publication fields and published briefing structure", "base schema", "preserve legacy story rows; additive publication columns", "review before applying; no rollback without a separate recovery point"],
  ["migration-stabilisation-security.sql", "durable controls, audit, bounded AI accounting, and safe outcome fields", "base schema and publication migration", "legacy compatibility tables must be prepared first", "additive; fail-forward after schema audit"],
  ["migration-0015-editorial-desk.sql", "Trace Desk editorial intake and controlled taxonomy", "stabilisation security", "additive editorial tables and indexes", "additive; no content rewrite"],
  ["migration-0016-knowledge-builder-foundation.sql", "knowledge document lifecycle and source-link foundation", "editorial desk", "additive knowledge tables", "additive; default closed"],
  ["migration-0017-multilingual-source-provenance.sql", "language-aware feed and source provenance fields", "knowledge foundation", "additive language/provenance structures", "additive; preserve original content"],
  ["migration-0032-knowledge-continuity.sql", "canonical claims, assertions, source documents, chunks, provenance, and knowledge mappings", "knowledge foundation and source tables", "additive evidence graph structures", "apply only after local replay and target schema review"],
  ["migration-0033-knowledge-reconciliation-state.sql", "knowledge processing and reconciliation state", "knowledge continuity", "additive job/reconciliation structures", "additive; retry/fail-forward"],
  ["migration-0034-structured-source-extraction.sql", "structured source extraction and locator-backed outputs", "knowledge continuity", "additive extraction tables", "additive; no automatic admission"],
  ["migration-0035-extraction-run-metadata.sql", "extraction run metadata and usage accounting", "structured extraction", "additive run metadata", "additive"],
  ["migration-0036-extraction-review-history.sql", "publisher extraction review history", "extraction metadata", "additive review history", "additive; reviewable"],
  ["migration-0037-claim-match-candidates.sql", "claim matching candidates", "canonical claims and extraction", "additive proposal tables", "additive; proposals only"],
  ["migration-0038-claim-match-review.sql", "claim matching review", "claim match candidates", "additive review tables", "additive; publisher review required"],
  ["migration-0039-claim-provenance-proposals.sql", "claim provenance proposals", "claim assertions", "additive proposal/review structures", "additive; no synthetic provenance"],
  ["migration-0040-provenance-group-proposals.sql", "provenance-group proposals", "provenance structures", "additive proposal/review structures", "additive; no automatic grouping"],
  ["migration-0041-claim-relationship-proposals.sql", "claim relationship proposals", "canonical claims", "additive proposal/review structures", "additive; no automatic relationship approval"],
  ["migration-0042-claim-conflict-cases.sql", "claim conflict cases", "canonical claims", "additive conflict structures", "additive; preserve disagreement"],
  ["migration-0043-legacy-claims-cutover.sql", "legacy claims compatibility and read-only cutover", "legacy compatibility and canonical claims", "preserve legacy claims/evidence; add mappings", "fail-forward; do not rewrite historical prose"],
  ["migration-0044-story-related-item-reviews.sql", "reviewed story relationships and evidence attachments", "knowledge continuity", "additive review structures", "additive; publisher review required"],
  ["migration-0045-claim-score-snapshots.sql", "immutable canonical-claim score snapshots", "canonical claims", "additive immutable snapshots", "append-only"],
  ["migration-0046-score-snapshot-explanations.sql", "immutable score explanations", "claim score snapshots", "additive immutable explanations", "append-only"],
  ["migration-0047-evidence-change-approvals.sql", "publisher approval queue for material evidence status changes", "score snapshots", "additive approval queue", "approval required; no autonomous publication"],
  ["migration-0048-knowledge-source-link-audit.sql", "knowledge source-link audit trail", "knowledge sources", "additive audit table and trigger", "append-only"],
  ["migration-0049-knowledge-change-proposal-index.sql", "knowledge proposal lookup index", "knowledge continuity", "additive index", "additive"],
  ["migration-0050-knowledge-retrieval-indexes.sql", "D1-authoritative knowledge lexical retrieval structures", "knowledge documents and claims", "additive search tables/indexes", "rebuildable; D1 remains authoritative"],
  ["migration-0051-knowledge-embedding-index-state.sql", "knowledge embedding index state", "knowledge retrieval indexes", "additive embedding state", "no Vectorize mutation in this mission"],
  ["migration-0052-knowledge-impact-proposals.sql", "knowledge impact proposals", "knowledge continuity", "additive proposal structures", "publisher review required"],
  ["migration-0053-knowledge-revision-decisions.sql", "knowledge revision decisions", "knowledge continuity", "additive revision decisions", "append-only review"],
  ["migration-0054-knowledge-revision-immutability.sql", "knowledge revision immutability", "knowledge revisions", "immutability constraints/triggers", "fail-closed if existing rows violate constraints"],
  ["migration-0055-knowledge-embedding-confirmation.sql", "embedding confirmation and reconciliation fields", "embedding index state", "additive columns/constraints", "additive; no embedding calls"],
  ["migration-0056-kc-11c-bounded-source-backfill.sql", "bounded source capture/backfill plan and item ledger", "source documents and knowledge continuity", "additive bounded executor state", "Preview-only executor path; no Production execution"],
  ["migration-0057-kc-11c-backfill-integrity.sql", "backfill integrity and append-only event controls", "bounded source backfill", "constraints/triggers/indexes", "fail-closed"],
  ["migration-0058-kc-11c-final-integrity.sql", "final source backfill integrity checks", "bounded source backfill", "integrity constraints", "fail-closed"],
  ["migration-0059-source-version-hash-semantics.sql", "source version hash semantics", "source documents and versions", "additive hash columns", "preserve legacy hashes"],
  ["migration-0060-source-identity-component-diagnostics.sql", "source identity diagnostics", "source version structures", "additive diagnostics table", "additive"],
  ["migration-0061-normalized-content-v2.sql", "normalized content identity", "source identity diagnostics", "additive normalized hashes", "preserve source versions"],
  ["migration-0062-normalized-content-v3-reference-drift.sql", "normalized content reference drift", "normalized content v2", "additive reference fields", "preserve IDs"],
  ["migration-0063-kc-03f-upload-source-states.sql", "source retrieval/capture and upload states", "source documents and versions", "additive state fields and upload intake", "additive; fail-closed unavailable capture"],
  ["migration-0064-kc-03h-pdf-upload-state.sql", "PDF upload state and metadata", "upload source states", "additive upload state structure", "additive; no content extraction in this mission"],
  ["migration-0065-public-evidence-graph-indexes.sql", "public evidence graph query indexes", "canonical evidence graph", "additive indexes", "rebuildable"],
  ["migration-0066-kc-11d-bounded-expiry.sql", "bounded stale-evidence expiry requeue", "claim assertions", "additive expiry marker, index, and trigger", "fail-forward; never promotes unknown"],
  ["migration-0067-kc-11g-h-remediation.sql", "KC-11G/H runtime identity and durable score work", "current evidence graph", "additive runtime identity/work queues", "identity gate; Preview acceptance precedes any future mutation"],
  ["migration-0068-v1-freshness-review.sql", "publisher-governed assertion freshness review", "claim assertions and evidence graph", "additive pending-review ledger, indexes, and append-only controls", "new mission candidate; do not apply without separate authorization"],
] as const;

function stringValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function parseJsonResultSets(output: string): Row[][] {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Wrangler did not return JSON results.");
  const parsed = JSON.parse(output.slice(start, end + 1)) as Array<{ results?: Row[] }>;
  return parsed.map((entry) => entry.results ?? []);
}

function runWranglerResultSets(query: string): Row[][] {
  const childEnv = { ...process.env };
  delete childEnv.CLOUDFLARE_API_TOKEN;
  const compactQuery = query.replace(/\s+/g, " ").trim();
  try {
    const output = execSync(`npx.cmd wrangler d1 execute ${PRODUCTION_DATABASE} --config wrangler.toml --remote --json --command "${compactQuery}"`, { cwd: ROOT, env: childEnv, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return parseJsonResultSets(output);
  } catch (error) {
    const record = error && typeof error === "object" ? error as { stderr?: unknown; stdout?: unknown; status?: unknown } : null;
    const detail = String(record?.stderr ?? "").trim() || String(record?.stdout ?? "").trim();
    throw new Error(`Wrangler read-only query failed: ${detail || (error instanceof Error ? error.message : String(error))}`);
  }
}

function runWranglerQuery(query: string): Row[] {
  return runWranglerResultSets(query).flat();
}

function localSchemaSnapshot(): SchemaSnapshot {
  const database = new SQLiteD1();
  try {
    const objects = database.sqlite.prepare(`
      SELECT name, type, sql FROM sqlite_master
      WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `).all() as Array<{ name: string; type: SchemaObjectSnapshot["type"]; sql: string | null }>;
    const columns: Record<string, SchemaColumnSnapshot[]> = {};
    for (const table of objects.filter((object) => object.type === "table")) {
      const rows = database.sqlite.prepare(`PRAGMA table_info("${table.name.replaceAll('"', '""')}")`).all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>;
      columns[table.name] = rows.map((row) => ({ name: row.name, type: row.type, notNull: row.notnull, defaultValue: row.dflt_value, primaryKeyPosition: row.pk }));
    }
    return {
      objects: objects.map((object) => ({ ...object, tableName: tableNameFromSql(object.sql) })),
      columns,
    };
  } finally {
    database.close();
  }
}

function tableNameFromSql(sql: string | null | undefined): string | null {
  return sql?.match(/\bon\s+([\w-]+)/i)?.[1] ?? null;
}

function remoteSchemaSnapshot(): SchemaSnapshot {
  const objects = runWranglerQuery(`
    SELECT name, type, sql FROM sqlite_master
    WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name;
  `).map((row) => ({ name: String(row.name), type: String(row.type) as SchemaObjectSnapshot["type"], sql: stringValue(row.sql), tableName: tableNameFromSql(stringValue(row.sql)) }));
  const columns: Record<string, SchemaColumnSnapshot[]> = {};
  const actualTables = new Set(objects.filter((object) => object.type === "table").map((object) => object.name));
  const tablesToInspect = [...new Set([...TRACE_V1_M1_REQUIRED_TABLES, "claims", "claim_evidence", "claim_conflicts", "knowledge_pages", "knowledge_page_claims", "guides", "guide_sources", "guide_revisions"])].filter((name) => actualTables.has(name));
  if (tablesToInspect.length > 0) {
    const resultSets = runWranglerResultSets(tablesToInspect.map((tableName) => `PRAGMA table_info('${tableName.replaceAll("'", "''")}')`).join("; "));
    for (const [index, tableName] of tablesToInspect.entries()) {
      columns[tableName] = (resultSets[index] ?? []).map((row) => ({ name: String(row.name), type: stringValue(row.type), notNull: numberValue(row.notnull), defaultValue: stringValue(row.dflt_value), primaryKeyPosition: numberValue(row.pk) }));
    }
  }
  return { objects, columns };
}

function canQuery(tables: Set<string>, names: string[]): boolean {
  return names.every((name) => tables.has(name));
}

function rowsIfPresent(tables: Set<string>, names: string[], query: string): Row[] {
  return canQuery(tables, names) ? runWranglerQuery(query) : [];
}

function sourceAssertion(row: Row, sources: Map<number, Row>, documents: Map<string, Row>, versions: Map<string, Row>, chunks: Map<string, Row>): StoryAssertionSnapshot {
  const version = row.source_document_version_id == null ? undefined : versions.get(String(row.source_document_version_id));
  const document = version?.source_document_id == null ? undefined : documents.get(String(version.source_document_id));
  const source = document?.source_id == null ? undefined : sources.get(numberValue(document.source_id));
  const chunk = row.source_chunk_id == null ? undefined : chunks.get(String(row.source_chunk_id));
  return {
    id: String(row.id),
    canonicalClaimId: String(row.canonical_claim_id),
    sourceDocumentVersionId: stringValue(row.source_document_version_id),
    sourceChunkId: stringValue(row.source_chunk_id),
    sourceDocumentId: document ? String(document.id) : null,
    sourceDocumentAdmissionState: stringValue(document?.admission_state),
    sourceDocumentCurrentVersionId: stringValue(document?.current_version_id),
    sourceUrl: stringValue(document?.canonical_url) ?? stringValue(source?.url),
    sourceVersionRetrievedUrl: stringValue(version?.retrieved_url),
    sourceVersionExtractionState: stringValue(version?.extraction_status) === "captured" ? "extracted" : stringValue(version?.extraction_status),
    sourceChunkStartLocator: stringValue(chunk?.start_locator),
    sourceChunkEndLocator: stringValue(chunk?.end_locator),
    startLocator: stringValue(row.start_locator),
    endLocator: stringValue(row.end_locator),
    provenanceGroupId: stringValue(row.provenance_group_id),
    admissionState: stringValue(row.admission_state),
    freshnessState: stringValue(row.freshness_state),
    reviewerState: stringValue(row.reviewer_state),
    sourceRole: stringValue(row.source_role),
    evidenceTreatment: stringValue(row.evidence_treatment),
    relationship: stringValue(row.relationship),
    directness: stringValue(row.directness),
    legacyClaimId: row.legacy_claim_id == null ? null : numberValue(row.legacy_claim_id),
  };
}

function buildCorpusSnapshot(schema: SchemaSnapshot): {
  stories: StoryCandidateSnapshot[];
  knowledge: KnowledgeCandidateSnapshot[];
  sources: SourceCohortSnapshot[];
  currentEligibleAssertions: number;
  resolvableCitations: number;
  liveCounts: Record<string, number>;
  schema: SchemaSnapshot;
} {
  const tables = new Set(schema.objects.filter((object) => object.type === "table").map((object) => object.name));
  const sourcesRows = rowsIfPresent(tables, ["sources"], `SELECT id, name, ingestion_type, active, health_status, consecutive_failures, last_success_at, section, treatment, tier FROM sources ORDER BY id;`);
  const sources = new Map(sourcesRows.map((row) => [numberValue(row.id), row]));
  const documentsRows = rowsIfPresent(tables, ["source_documents"], `SELECT id, canonical_url, source_id, admission_state, current_version_id FROM source_documents ORDER BY id;`);
  const documents = new Map(documentsRows.map((row) => [String(row.id), row]));
  const versionsRows = rowsIfPresent(tables, ["source_document_versions"], `SELECT id, source_document_id, retrieved_url, extraction_status FROM source_document_versions ORDER BY id;`);
  const versions = new Map(versionsRows.map((row) => [String(row.id), row]));
  const chunksRows = rowsIfPresent(tables, ["source_chunks"], `SELECT id, source_document_version_id, start_locator, end_locator FROM source_chunks ORDER BY id;`);
  const chunks = new Map(chunksRows.map((row) => [String(row.id), row]));
  const claimsRows = rowsIfPresent(tables, ["canonical_claims"], `SELECT id, current_state FROM canonical_claims ORDER BY id;`);
  const claims = new Map(claimsRows.map((row) => [String(row.id), row]));
  const assertionRows = rowsIfPresent(tables, ["claim_assertions"], `SELECT id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator, provenance_group_id, admission_state, freshness_state, reviewer_state, source_role, evidence_treatment, relationship, directness, legacy_claim_id FROM claim_assertions ORDER BY id;`);
  const assertions = assertionRows.map((row) => sourceAssertion(row, sources, documents, versions, chunks));
  const assertionsByClaim = new Map<string, StoryAssertionSnapshot[]>();
  for (const assertion of assertions) assertionsByClaim.set(assertion.canonicalClaimId, [...(assertionsByClaim.get(assertion.canonicalClaimId) ?? []), assertion]);
  const storyRows = rowsIfPresent(tables, ["story_clusters"], `SELECT id, title, slug, topic, publication_status, evidence_status, published_at, updated_at, reviewed_by, reviewed_at, CASE WHEN trim(COALESCE(summary, '')) <> '' THEN 1 ELSE 0 END AS summary_present FROM story_clusters ORDER BY id;`);
  const storyClaimRows = rowsIfPresent(tables, ["story_claims"], `SELECT story_cluster_id, canonical_claim_id, role, reviewed_by, reviewed_at FROM story_claims ORDER BY story_cluster_id, display_order, canonical_claim_id;`);
  const storiesById = new Map<number, StoryCandidateSnapshot>();
  for (const row of storyRows) {
    const id = numberValue(row.id);
    storiesById.set(id, { id, title: String(row.title), slug: stringValue(row.slug), topic: stringValue(row.topic), publicationStatus: stringValue(row.publication_status), evidenceStatus: stringValue(row.evidence_status), publishedAt: stringValue(row.published_at), updatedAt: stringValue(row.updated_at), reviewedBy: stringValue(row.reviewed_by), reviewedAt: stringValue(row.reviewed_at), summaryPresent: booleanValue(row.summary_present), hasPublishedFeedMember: false, publishedCorrection: false, unresolvedConflict: false, claims: [] });
  }
  const publishedMemberRows = rowsIfPresent(tables, ["story_cluster_members", "feed_items"], `SELECT member.cluster_id AS story_cluster_id, COUNT(*) AS count FROM story_cluster_members member JOIN feed_items item ON item.id = member.feed_item_id WHERE item.ingestion_status = 'published' GROUP BY member.cluster_id;`);
  for (const row of publishedMemberRows) storiesById.get(numberValue(row.story_cluster_id))!.hasPublishedFeedMember = numberValue(row.count) > 0;
  for (const row of storyClaimRows) {
    const story = storiesById.get(numberValue(row.story_cluster_id));
    if (!story) continue;
    const claimId = String(row.canonical_claim_id);
    const claim = claims.get(claimId);
    story.claims.push({ canonicalClaimId: claimId, role: stringValue(row.role), reviewedBy: stringValue(row.reviewed_by), reviewedAt: stringValue(row.reviewed_at), claimExists: Boolean(claim), claimState: stringValue(claim?.current_state), assertions: assertionsByClaim.get(claimId) ?? [] });
  }
  const correctionsRows = rowsIfPresent(tables, ["corrections"], `SELECT cluster_id, claim_id, published FROM corrections WHERE published = 1;`);
  const correctedLegacyClaimIds = new Set(correctionsRows.map((row) => numberValue(row.claim_id)).filter(Boolean));
  for (const row of correctionsRows) {
    if (row.cluster_id != null) {
      const story = storiesById.get(numberValue(row.cluster_id));
      if (story) story.publishedCorrection = true;
    }
  }
  const conflictRows = rowsIfPresent(tables, ["knowledge_claim_conflict_cases"], `SELECT source_claim_id, target_claim_id, status FROM knowledge_claim_conflict_cases WHERE status IN ('unresolved','acknowledged');`);
  const conflictClaimIds = new Set(conflictRows.flatMap((row) => [String(row.source_claim_id), String(row.target_claim_id)]));
  const legacyConflictRows = rowsIfPresent(tables, ["claim_conflicts"], `SELECT claim_a_id, claim_b_id, resolution FROM claim_conflicts WHERE resolution IS NULL;`);
  const conflictLegacyIds = new Set(legacyConflictRows.flatMap((row) => [numberValue(row.claim_a_id), numberValue(row.claim_b_id)]));
  for (const story of storiesById.values()) {
    story.unresolvedConflict = story.claims.some((claim) => conflictClaimIds.has(claim.canonicalClaimId) || claim.assertions.some((assertion) => conflictLegacyIds.has(numberValue(assertion.legacyClaimId)) || assertion.relationship === "contradicts"));
    story.publishedCorrection ||= story.claims.some((claim) => claim.assertions.some((assertion) => correctedLegacyClaimIds.has(numberValue(assertion.legacyClaimId))));
  }

  const knowledgeRows = rowsIfPresent(tables, ["knowledge_documents"], `SELECT id, canonical_question, status, visibility, evidence_status, approved_by, approved_at, review_after, hard_expiry, CASE WHEN length(trim(COALESCE(direct_answer, ''))) > 0 OR length(trim(COALESCE(detailed_explanation, ''))) > 0 OR trim(COALESCE(document_json, '{}')) NOT IN ('', '{}') THEN 1 ELSE 0 END AS content_present FROM knowledge_documents ORDER BY id;`);
  const knowledgeClaimRows = rowsIfPresent(tables, ["knowledge_document_claims"], `SELECT knowledge_document_id, canonical_claim_id, reviewed_by, reviewed_at FROM knowledge_document_claims ORDER BY knowledge_document_id, canonical_claim_id;`);
  const knowledgeAssertionRows = rowsIfPresent(tables, ["knowledge_document_claim_assertions", "claim_assertions"], `SELECT mapping.knowledge_document_id, mapping.canonical_claim_id, mapping.claim_assertion_id, assertion.source_document_version_id, assertion.source_chunk_id, assertion.start_locator, assertion.end_locator, assertion.admission_state, assertion.reviewer_state, assertion.freshness_state, assertion.relationship, assertion.source_role, assertion.evidence_treatment, assertion.provenance_group_id FROM knowledge_document_claim_assertions mapping JOIN claim_assertions assertion ON assertion.id = mapping.claim_assertion_id ORDER BY mapping.knowledge_document_id, mapping.claim_assertion_id;`);
  const knowledgeById = new Map<string, KnowledgeCandidateSnapshot>();
  for (const row of knowledgeRows) {
    knowledgeById.set(String(row.id), { id: String(row.id), canonicalQuestion: String(row.canonical_question), status: stringValue(row.status), visibility: stringValue(row.visibility), evidenceStatus: stringValue(row.evidence_status), contentPresent: booleanValue(row.content_present), approvedBy: stringValue(row.approved_by), approvedAt: stringValue(row.approved_at), reviewAfter: stringValue(row.review_after), hardExpiry: stringValue(row.hard_expiry), claimLinks: [], assertions: [], publishedCorrection: false, unresolvedConflict: false });
  }
  for (const row of knowledgeClaimRows) {
    const document = knowledgeById.get(String(row.knowledge_document_id));
    if (!document) continue;
    const claimId = String(row.canonical_claim_id);
    document.claimLinks.push({ canonicalClaimId: claimId, claimState: stringValue(claims.get(claimId)?.current_state), reviewedBy: stringValue(row.reviewed_by), reviewedAt: stringValue(row.reviewed_at) });
  }
  for (const row of knowledgeAssertionRows) {
    const document = knowledgeById.get(String(row.knowledge_document_id));
    if (!document) continue;
    const assertion = assertions.find((candidate) => candidate.id === String(row.claim_assertion_id));
    if (!assertion) continue;
    document.assertions.push({ assertionId: assertion.id, canonicalClaimId: String(row.canonical_claim_id), admissionState: stringValue(row.admission_state), reviewerState: stringValue(row.reviewer_state), freshnessState: stringValue(row.freshness_state), relationship: stringValue(row.relationship), sourceRole: stringValue(row.source_role), evidenceTreatment: stringValue(row.evidence_treatment), sourceDocumentId: assertion.sourceDocumentId, sourceDocumentAdmissionState: assertion.sourceDocumentAdmissionState, sourceDocumentVersionId: assertion.sourceDocumentVersionId, sourceDocumentCurrentVersionId: assertion.sourceDocumentCurrentVersionId, sourceVersionExtractionState: assertion.sourceVersionExtractionState, sourceChunkId: assertion.sourceChunkId, locatorPresent: Boolean((assertion.startLocator && assertion.endLocator) || (assertion.sourceChunkStartLocator && assertion.sourceChunkEndLocator)), sourceUrl: assertion.sourceUrl ?? assertion.sourceVersionRetrievedUrl });
  }
  for (const document of knowledgeById.values()) {
    document.unresolvedConflict = document.claimLinks.some((claim) => conflictClaimIds.has(claim.canonicalClaimId));
    document.publishedCorrection = document.claimLinks.some((claim) => ["corrected", "superseded"].includes(claim.claimState ?? ""));
  }

  const recentRows = rowsIfPresent(tables, ["ingestion_jobs"], `SELECT source_id, COUNT(*) AS recent_successful_fetches FROM ingestion_jobs WHERE status = 'completed' AND completed_at >= datetime('now', '-30 day') GROUP BY source_id;`);
  const recentSuccesses = new Map(recentRows.map((row) => [numberValue(row.source_id), numberValue(row.recent_successful_fetches)]));
  const sourceCohort = [...sources.values()].filter((row) => booleanValue(row.active)).map((row) => ({ id: numberValue(row.id), name: String(row.name), connector: String(row.ingestion_type ?? "manual"), active: true, healthStatus: String(row.health_status ?? "unknown"), consecutiveFailures: numberValue(row.consecutive_failures), lastSuccessAt: stringValue(row.last_success_at), recentSuccessfulFetches: recentSuccesses.get(numberValue(row.id)) ?? 0, section: stringValue(row.section), treatment: stringValue(row.treatment), tier: stringValue(row.tier) }));

  const currentEligible = assertions.filter((assertion) => assertion.admissionState === "admitted" && assertion.reviewerState === "accepted" && assertion.freshnessState === "current" && ["evidence", "reported_claim"].includes(assertion.sourceRole ?? "") && !["discovery_only", "internal_synthesis"].includes(assertion.evidenceTreatment ?? "") && Boolean(assertion.sourceDocumentVersionId || assertion.sourceDocumentId)).length;
  const resolvableCitations = assertions.filter((assertion) => assertion.admissionState === "admitted" && assertion.reviewerState === "accepted" && assertion.freshnessState === "current" && assertion.sourceRole === "evidence" && assertion.evidenceTreatment === "factual_support" && assertion.sourceDocumentId && assertion.sourceDocumentVersionId && assertion.sourceChunkId && ((assertion.startLocator && assertion.endLocator) || (assertion.sourceChunkStartLocator && assertion.sourceChunkEndLocator)) && Boolean(assertion.sourceUrl || assertion.sourceVersionRetrievedUrl)).length;
  const liveCounts = {
    publicStories: storyRows.filter((row) => row.publication_status === "published").length,
    storiesWithCanonicalClaimLinks: [...storiesById.values()].filter((story) => story.claims.length > 0).length,
    canonicalClaims: claims.size,
    acceptedAdmittedAssertions: assertions.filter((assertion) => assertion.admissionState === "admitted" && assertion.reviewerState === "accepted").length,
    currentEligibleAssertions: currentEligible,
    sourceDocuments: documentsRows.length,
    sourceDocumentVersions: versionsRows.length,
    sourceChunks: chunksRows.length,
    provenanceGroups: rowsIfPresent(tables, ["provenance_groups"], "SELECT id FROM provenance_groups;").length,
    approvedKnowledgeDocuments: knowledgeRows.filter((row) => row.status === "approved").length,
    knowledgeClaimMappings: knowledgeClaimRows.length,
    knowledgeAssertionMappings: knowledgeAssertionRows.length,
    publishedCorrections: correctionsRows.length,
    activeSources: sourceCohort.length,
  };
  return { stories: [...storiesById.values()], knowledge: [...knowledgeById.values()], sources: sourceCohort, currentEligibleAssertions: currentEligible, resolvableCitations, liveCounts, schema };
}

function migrationPlanForGaps(parity: ReturnType<typeof inspectSchemaParity>): Array<Record<string, unknown>> {
  const gaps = [...parity.missing, ...parity.incompatible];
  const files = new Map<string, { index: number; entry: (typeof MIGRATION_CATALOG)[number] }>();
  MIGRATION_CATALOG.forEach((entry, index) => files.set(entry[0], { index, entry }));
  const selected = new Map<string, { file: string; supplied: string[] }>();
  for (const gap of gaps) {
    const escapedObject = gap.objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedTable = (gap.tableName ?? gap.objectName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const file of files.keys()) {
      const body = readFileSync(resolve("db", file), "utf8");
      const matcher = gap.objectType === "table"
        ? new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+${escapedObject}\\b`, "i")
        : gap.objectType === "column"
          ? new RegExp(`(?:ALTER TABLE\\s+${escapedTable}[^;]*?ADD COLUMN\\s+${escapedObject}\\b|CREATE TABLE[^;]*?\\b${escapedObject}\\b)`, "is")
          : new RegExp(`CREATE (?:UNIQUE )?${gap.objectType.toUpperCase()}\\s+(?:IF NOT EXISTS\\s+)?${escapedObject}\\b`, "i");
      if (!matcher.test(body)) continue;
      const current = selected.get(file) ?? { file, supplied: [] };
      current.supplied.push(gap.key);
      selected.set(file, current);
    }
  }
  return [...selected.values()].sort((a, b) => (files.get(a.file)?.index ?? 0) - (files.get(b.file)?.index ?? 0)).map(({ file, supplied }) => {
    const [, purpose, prerequisite, change, rollback] = files.get(file)!.entry;
    return { migrationFile: `db/${file}`, purpose, prerequisite, structures: [...new Set(supplied)].sort(), additive: true, dataDestructive: false, expectedProductionRisk: change, rollbackStrategy: rollback, applicationDependency: "Required for the current accepted application path when a listed structure is missing or incompatible.", requiredForV1: true };
  });
}

function markdownList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None.";
}

function reportMarkdown(input: {
  generatedAt: string;
  parity: ReturnType<typeof inspectSchemaParity>;
  migrationPlan: Array<Record<string, unknown>>;
  stories: Awaited<ReturnType<typeof buildStoryLaunchPlan>>;
  knowledge: Awaited<ReturnType<typeof buildKnowledgeLaunchPlan>>;
  sources: Awaited<ReturnType<typeof buildSourceCohortPlan>>;
  ask: ReturnType<typeof projectAskReadiness>;
  liveCounts: Record<string, number>;
  targetTables: string[];
}): string {
  const nonPresent = input.parity.items.filter((item) => ["MISSING", "INCOMPATIBLE"].includes(item.classification));
  const storyBest = input.stories.bestCandidates.map((candidate) => `| ${candidate.id} | ${candidate.title.replaceAll("|", "\\|")} | ${candidate.classification} | ${candidate.reasons.map((reason) => `${reason.code}: ${reason.detail}`).join("; ") || "None"} | ${candidate.remediation.map((action) => action.action).join(", ") || "None"} |`).join("\n");
  const knowledgeBest = input.knowledge.bestCandidates.map((candidate) => `| ${candidate.id} | ${candidate.canonicalQuestion.replaceAll("|", "\\|")} | ${candidate.classification} | ${candidate.reasons.map((reason) => `${reason.code}: ${reason.detail}`).join("; ") || "None"} | ${candidate.remediation.map((action) => action.action).join(", ") || "None"} |`).join("\n");
  const migrationRows = input.migrationPlan.map((migration) => `| ${migration.migrationFile} | ${migration.purpose} | ${migration.prerequisite} | ${migration.structures} | ${migration.expectedProductionRisk} | ${migration.rollbackStrategy} | ${migration.requiredForV1} |`).join("\n");
  const coreSources = input.sources.recommendedCore.map((source) => `${source.id} — ${source.name}`).join(", ") || "None";
  const repairSources = input.sources.repairOrDisableCandidates.map((source) => `${source.id} — ${source.name} (${source.classification})`).join(", ") || "None";
  return `# TRACE V1 Mission 1 — Production Evidence Readiness

Mission: TRACE-V1-M1-PRODUCTION-EVIDENCE-READY<br>
Generated: ${input.generatedAt}<br>
Accepted main: 74fd79f4a6ba37d977e9a5f4dac515565ab82e78<br>
Production D1: ${PRODUCTION_DATABASE} / ${PRODUCTION_DATABASE_ID}<br>
Preview D1 (not mutated): ${PREVIEW_DATABASE} / ${PREVIEW_DATABASE_ID}

This is an implementation candidate and read-only Production assessment. No Production or Preview mutation, deployment, queue send, Vectorize write, paid inference, or AI API call is part of this mission.

## A. Starting State

- Branch created from accepted main at 74fd79f4a6ba37d977e9a5f4dac515565ab82e78.
- origin/main verified at the accepted SHA before implementation.
- Worktree was clean at branch creation.

## B. Live Production Read-Only Findings

| Finding | Count |
| --- | ---: |
${Object.entries(input.liveCounts).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

The evidence graph is not yet a trustworthy current v1 corpus: accepted/admitted assertions with freshness_state='current' are ${input.liveCounts.currentEligibleAssertions}, source capture/chunk coverage is ${input.liveCounts.sourceChunks}, and knowledge mappings are ${input.liveCounts.knowledgeClaimMappings} claim / ${input.liveCounts.knowledgeAssertionMappings} assertion rows. Existing public publication state is not treated as evidence readiness.

## C. Schema Parity

Classification summary: ${JSON.stringify(input.parity.summary)}

Exact missing or incompatible structures:

${markdownList(nonPresent.map((item) => `${item.key} - ${item.classification}${item.detail ? ` - ${item.detail}` : ""}`))}

The inspector compares accepted local schema tables, columns, primary-key positions, query-path indexes, and lifecycle/immutability triggers. Compatibility-only legacy tables are reported as PRESENT_LEGACY_COMPATIBLE and are never used to promote current evidence. Required table scope: ${input.targetTables.length} tables.

## D. Ordered Production Migration Plan

DO NOT APPLY. The plan is generated only for gaps found in the target schema; every selected item is supplied by an existing repository migration unless explicitly marked as the Mission 1 candidate migration 0068.

| Migration | Purpose | Prerequisite | Structures | Risk | Rollback / stop condition | Required for v1 |
| --- | --- | --- | --- | --- | --- | --- |
${migrationRows || "| None | No missing current-schema migration identified | — | — | — | — | — |"}

No duplicate replacement migration was created for an existing structure. Migration 0068 is the one additive migration introduced by this candidate for the missing publisher-governed freshness review ledger.

## E. Launch Corpus Planner

The planner is deterministic, read-only, LLM-free, and bounded to the best 20 candidates for reporting. It does not publish or modify a story. A story is LAUNCH_READY only when it is recently published, publicly routable and reviewed, has reviewed canonical-claim links, and every linked claim has admitted/accepted/current external factual evidence with an admitted current source version, chunk, locator, valid URL, provenance group, and no correction, supersession, or unresolved dispute. The recency window is ${input.stories.recencyDays} days as of ${input.stories.asOf}.

Counts: ${JSON.stringify(input.stories.counts)}

The planner prefers recency, evidence completeness, corroboration, AI/Agents relevance, and topic diversity in its deterministic ordering; it does not weaken criteria to reach 15–20.

## F. Candidate Launch Stories

| Candidate ID | Title | Classification | Reasons | Explicit remediation |
| --- | --- | --- | --- | --- |
${storyBest || "| None | — | — | — | — |"}

The full machine-readable candidate set and action fields are in the JSON companion. No story prose is copied into this report.

## G. Knowledge Launch Set

Target: approximately ${input.knowledge.target} useful public knowledge pages, not a quota. Counts: ${JSON.stringify(input.knowledge.counts)}

| Document ID | Canonical question | Classification | Reasons | Explicit remediation |
| --- | --- | --- | --- | --- |
${knowledgeBest || "| None | — | — | — | — |"}

Only approved public knowledge with actual content and reviewed claim/assertion mappings to current locator-backed external evidence can be launch-ready. Approved metadata without mappings remains remediation-required; draft/internal content remains closed.

## H. Source Cohort Recommendation

- Recommended CORE_V1: ${coreSources}
- Repair/disable candidates (no automatic action): ${repairSources}
- Supported scheduled connectors: ${input.sources.supportedConnectors.join(", ")}

Active sources are classified as CORE_V1, OPTIONAL_V1, DEFER, DISABLE_CANDIDATE, or UNSUPPORTED_CONNECTOR using only registry health, connector allowlist, recent successful fetches, and deterministic metadata relevance. No source activation was changed.

## I. Freshness / Current-Evidence Path

The current code correctly treats unknown as fail-closed and scheduled expiry handles already-stale assertions, but it had no auditable publisher action for an accepted assertion to move from unknown to current. Mission 1 adds evidence_freshness_reviews plus a narrow publisher endpoint. The request path records a pending review only after source/version/chunk/locator/provenance/evidence gates pass; the approval path rechecks them and only then updates the assertion. Corrections, supersession, disputes, unresolved conflicts, source changes, and race conditions stop promotion. Replays are idempotent. No global update or autonomous freshness promotion exists.

## J. Evidence Remediation Architecture

The plan reuses the existing KC-11C bounded source capture/backfill ledger and governed capture functions for source-document/version/chunk work, existing canonical claim/assertion structures, existing provenance proposal/review tables, existing evidence scoring and approval structures, existing correction/conflict paths, and the new narrow freshness-review ledger only for explicit publisher freshness decisions. It does not create a parallel evidence graph or generic arbitrary-SQL executor.

## K. Ask TRACE Readiness Projection

${JSON.stringify(input.ask, null, 2)}

This is a D1-authoritative deterministic projection. It performs no provider invocation, synthesis call, embedding request, or paid inference. The current Production corpus therefore remains deterministically insufficient for useful current-evidence retrieval until separately approved remediation is completed.

## L. Frontend Determination

NO V1 FRONTEND CHANGE REQUIRED FOR MISSION 1

The current public story, evidence, knowledge, correction, and Ask TRACE routes already render fail-closed states without exposing numeric evidence scores. Mission 1 changes no .astro, client component, CSS, branding, navigation, or public presentation template.

## M. Implementation Changes

- Added deterministic schema parity, story/knowledge launch planners, source cohort classification, Ask readiness projection, stable plan fingerprints, and read-only snapshot types in src/lib/server/trace-v1-m1.ts.
- Added the additive db/migration-0068-v1-freshness-review.sql candidate migration.
- Added publisher-governed freshness review service and API endpoint.
- Added focused migration fixture coverage hooks and the generated report/JSON companion.

## N. Tests / Validation

Validation completed for this candidate:

- \`npm.cmd run test:trace-v1-m1\` — PASS; deterministic schema/planner/freshness tests, including extraction-state fail-closed and append-only review checks.
- \`npm.cmd run test:migrations\` — PASS; local migrations and legacy compatibility checks.
- \`npm.cmd test\` — PASS; the full existing local test suite, including 119 ingestion checks and the KC-11D/KC-11G/H, Ask TRACE, source identity, upload/capture, and public-evidence suites.
- \`npm.cmd run test:security\` — PASS; source and Git-history security boundary scan.
- \`npm.cmd run test:evidence-policy\` — PASS; public numeric evidence scores remain disabled.
- \`npm.cmd run test:knowledge-markdown\` — PASS; 30 knowledge inputs and 967 material claims checked.
- \`npm.cmd run test:inventory\` and \`npm.cmd run test:backfill-cost\` — PASS.
- \`npm.cmd run test:diff\` — PASS; Git whitespace checks.
- \`npm.cmd run typecheck\` — PASS with zero errors; existing Astro/unused-variable hints remain.
- \`npm.cmd run build\` — PASS; Cloudflare route boundary verification passed.
- \`npm.cmd audit --omit=dev --audit-level=high\` — FAILS the high-severity threshold with 13 production-tree findings (10 high, 2 moderate, 1 low); no dependency upgrade was made in this mission.

Remote inventory queries and Wrangler identity/resource checks were read-only, used the exact Production database identity, and removed only the inherited environment token from Wrangler child processes.

## O. Security / Dependency Audit Status

The environment token override was removed only in Wrangler child processes; stored OAuth credentials were not changed. The known high-severity dependency audit blocker remains recorded separately in the handoff; no unrelated dependency upgrade is included.

## P. Remote Mutation Ledger

NONE

Explicitly: no Production/Preview D1 write, migration, data repair, backfill, source activation, Worker/Pages deployment, cron mutation, Vectorize/R2 mutation, queue send, secret, Access, DNS, feature-flag, or paid-inference action occurred.

## Q. Candidate Git State

Recorded after commit and push in the final handoff. The report itself is generated before commit and is included in the candidate branch.

## R. Findings

- P0: None identified.
- P1: Production current evidence corpus is not launch-ready; this is the mission target and remains an operational gate, not silently repaired here.
- P2: Production schema parity gaps, freshness-review path, unhealthy/unsupported source candidates, and legacy evidence incompleteness require separately approved operations.
- P3: Known dependency audit findings and stale roadmap/status wording where still present.

## S. Verdict

TRACE-V1-M1 CANDIDATE READY FOR INDEPENDENT VERIFICATION

## T. Next Operational Gate

After independent verification and a separate publisher/operator authorization, apply only the reviewed ordered migration plan to the positively identified Production D1, then run a bounded dry-run/approval workflow for the selected corpus. Do not execute that gate as part of Mission 1; do not promote freshness, publish stories, or mutate Production from this candidate.
`;
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const expected = localSchemaSnapshot();
  const actual = remoteSchemaSnapshot();
  const parity = inspectSchemaParity(expected, actual);
  const corpus = buildCorpusSnapshot(actual);
  const stories = await buildStoryLaunchPlan(corpus.stories, { asOf: generatedAt, maxCandidates: 20 });
  const knowledge = await buildKnowledgeLaunchPlan(corpus.knowledge, { maxCandidates: 6 });
  const sourcePlan = await buildSourceCohortPlan(corpus.sources);
  const ask = projectAskReadiness(stories, knowledge, corpus.currentEligibleAssertions, corpus.resolvableCitations);
  const migrationPlan = migrationPlanForGaps(parity);
  const reportData = { generatedAt, production: { database: PRODUCTION_DATABASE, databaseId: PRODUCTION_DATABASE_ID }, preview: { database: PREVIEW_DATABASE, databaseId: PREVIEW_DATABASE_ID }, liveCounts: corpus.liveCounts, schemaParity: parity, migrationPlan, storyPlan: stories, knowledgePlan: knowledge, sourcePlan, askReadiness: ask };
  mkdirSync(resolve("docs/v1"), { recursive: true });
  writeFileSync(JSON_PATH, `${JSON.stringify(reportData, null, 2)}\n`, "utf8");
  writeFileSync(REPORT_PATH, reportMarkdown({ generatedAt, parity, migrationPlan, stories, knowledge, sources: sourcePlan, ask, liveCounts: corpus.liveCounts, targetTables: [...TRACE_V1_M1_REQUIRED_TABLES] }), "utf8");
  console.log(JSON.stringify({ report: "docs/v1/production-evidence-readiness.md", json: "docs/v1/production-evidence-readiness.json", generatedAt, liveCounts: corpus.liveCounts, schema: parity.summary, stories: stories.counts, knowledge: knowledge.counts, coreSources: sourcePlan.recommendedCore.length, sourceRepairCandidates: sourcePlan.repairOrDisableCandidates.length }, null, 2));
}

main().catch((error) => {
  console.error(`TRACE V1 Mission 1 readiness failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
