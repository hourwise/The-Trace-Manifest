import assert from "node:assert/strict";
import { buildKnowledgeLaunchPlan, buildSourceCohortPlan, buildStoryLaunchPlan, extractMigrationStructureIdentities, inspectSchemaParity, projectAskReadiness, type KnowledgeCandidateSnapshot, type SchemaSnapshot, type SourceCohortSnapshot, type StoryCandidateSnapshot } from "../src/lib/server/trace-v1-m1";
import { approveFreshnessReview, EvidenceFreshnessReviewError, rejectFreshnessReview, requestFreshnessReview } from "../src/lib/server/evidence-freshness-review";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import { migrationPlanForGaps } from "../scripts/trace-v1-m1-readiness";

function assertion(overrides: Record<string, unknown> = {}) {
  return {
    id: "assertion-1", canonicalClaimId: "claim-1", sourceDocumentVersionId: "version-1", sourceChunkId: "chunk-1", sourceDocumentId: "document-1", sourceDocumentAdmissionState: "admitted", sourceDocumentCurrentVersionId: "version-1", sourceVersionExtractionState: "extracted", sourceUrl: "https://example.com/source", sourceChunkStartLocator: "p1", sourceChunkEndLocator: "p2", admissionState: "admitted", freshnessState: "current", reviewerState: "accepted", sourceRole: "evidence", evidenceTreatment: "factual_support", relationship: "supports", provenanceGroupId: "group-1", ...overrides,
  };
}

function story(overrides: Partial<StoryCandidateSnapshot> = {}): StoryCandidateSnapshot {
  return { id: 1, title: "Current AI story", slug: "current-ai-story", topic: "ai-agents", publicationStatus: "published", evidenceStatus: "strongly_supported", publishedAt: "2026-08-20T00:00:00Z", updatedAt: "2026-08-20T00:00:00Z", reviewedBy: "publisher", reviewedAt: "2026-08-20T00:00:00Z", summaryPresent: true, hasPublishedFeedMember: true, publishedCorrection: false, unresolvedConflict: false, claims: [{ canonicalClaimId: "claim-1", role: "primary", reviewedBy: "publisher", reviewedAt: "2026-08-20T00:00:00Z", claimExists: true, claimState: "active", assertions: [assertion()] }], ...overrides };
}

function knowledge(overrides: Partial<KnowledgeCandidateSnapshot> = {}): KnowledgeCandidateSnapshot {
  return { id: "knowledge-1", canonicalQuestion: "What is the current agent state?", status: "approved", visibility: "public_knowledge", evidenceStatus: "confirmed", contentPresent: true, approvedBy: "publisher", approvedAt: "2026-08-20T00:00:00Z", claimLinks: [{ canonicalClaimId: "claim-1", claimState: "active", reviewedBy: "publisher", reviewedAt: "2026-08-20T00:00:00Z" }], assertions: [{ assertionId: "assertion-1", canonicalClaimId: "claim-1", admissionState: "admitted", reviewerState: "accepted", freshnessState: "current", relationship: "supports", sourceRole: "evidence", evidenceTreatment: "factual_support", sourceDocumentId: "document-1", sourceDocumentAdmissionState: "admitted", sourceDocumentVersionId: "version-1", sourceDocumentCurrentVersionId: "version-1", sourceVersionExtractionState: "extracted", sourceChunkId: "chunk-1", locatorPresent: true, sourceUrl: "https://example.com/source" }], publishedCorrection: false, unresolvedConflict: false, ...overrides };
}

async function schemaTests(): Promise<void> {
  const expected: SchemaSnapshot = { objects: [{ name: "sources", type: "table", sql: "CREATE TABLE sources (id TEXT PRIMARY KEY, value TEXT)" }, { name: "idx_sources_value", type: "index", sql: "CREATE INDEX idx_sources_value ON sources(value)", tableName: "sources" }, { name: "protect_sources", type: "trigger", sql: "CREATE TRIGGER protect_sources BEFORE DELETE ON sources BEGIN SELECT RAISE(ABORT, 'immutable'); END" }], columns: { sources: [{ name: "id", type: "TEXT", primaryKeyPosition: 1 }, { name: "value", type: "TEXT", primaryKeyPosition: 0 }] } };
  const compatible = inspectSchemaParity(expected, expected);
  assert.equal(compatible.items.find((item) => item.key === "table:sources")?.classification, "PRESENT_COMPATIBLE");
  assert.equal(compatible.items.find((item) => item.key === "index:idx_sources_value")?.classification, "PRESENT_COMPATIBLE");
  assert.equal(compatible.items.find((item) => item.key === "trigger:protect_sources")?.classification, "PRESENT_COMPATIBLE");
  const missing = inspectSchemaParity(expected, { objects: [], columns: {} });
  assert.equal(missing.items.find((item) => item.key === "table:sources")?.classification, "MISSING");
  assert.equal(missing.items.find((item) => item.key === "column:sources.value")?.classification, "MISSING");
  assert.equal(missing.items.find((item) => item.key === "index:idx_sources_value")?.classification, "MISSING");
  assert.equal(missing.items.find((item) => item.key === "trigger:protect_sources")?.classification, "MISSING");
  const legacy = inspectSchemaParity(expected, { objects: [{ ...expected.objects[0] }, { name: "claims", type: "table", sql: "CREATE TABLE claims (id INTEGER PRIMARY KEY)" }], columns: { sources: expected.columns.sources, claims: [{ name: "id", type: "INTEGER", primaryKeyPosition: 1 }] } });
  assert.equal(legacy.items.find((item) => item.key === "table:claims")?.classification, "PRESENT_LEGACY_COMPATIBLE");
  const incompatible = inspectSchemaParity(expected, { objects: [{ name: "sources", type: "table", sql: "CREATE TABLE sources (id INTEGER PRIMARY KEY, value TEXT)" }], columns: { sources: [{ name: "id", type: "INTEGER", primaryKeyPosition: 1 }, { name: "value", type: "TEXT", primaryKeyPosition: 0 }] } });
  assert.equal(incompatible.items.find((item) => item.key === "column:sources.id")?.classification, "INCOMPATIBLE");
}

async function plannerTests(): Promise<void> {
  const readyInput = story();
  const readyInputBefore = JSON.stringify(readyInput);
  const ready = await buildStoryLaunchPlan([readyInput], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(ready.counts.LAUNCH_READY, 1);
  assert.equal(ready.candidates[0].remediation.length, 0);
  assert.equal(JSON.stringify(readyInput), readyInputBefore);
  const noLinks = await buildStoryLaunchPlan([story({ claims: [] })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(noLinks.candidates[0].classification, "REMEDIATION_REQUIRED");
  assert.equal(noLinks.candidates[0].remediation.some((item) => item.reasonCode === "missing_canonical_claim_links"), true);
  const unknown = await buildStoryLaunchPlan([story({ claims: [{ ...story().claims[0], assertions: [assertion({ freshnessState: "unknown" })] }] })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(unknown.candidates[0].classification, "REMEDIATION_REQUIRED");
  assert.equal(unknown.candidates[0].remediation.some((item) => item.action === "request_freshness_review"), true);
  const missingLocator = await buildStoryLaunchPlan([story({ claims: [{ ...story().claims[0], assertions: [assertion({ sourceChunkId: null, sourceChunkStartLocator: null, sourceChunkEndLocator: null })] }] })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(missingLocator.candidates[0].remediation.some((item) => item.reasonCode === "missing_locator"), true);
  const corrected = await buildStoryLaunchPlan([story({ evidenceStatus: "corrected" })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(corrected.candidates[0].classification, "EXCLUDE_FROM_V1");
  const disputed = await buildStoryLaunchPlan([story({ unresolvedConflict: true })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(disputed.candidates[0].classification, "EXCLUDE_FROM_V1");
  const insufficient = await buildStoryLaunchPlan([story({ claims: [{ ...story().claims[0], assertions: [assertion({ admissionState: "pending" })] }] })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(insufficient.candidates[0].classification, "REMEDIATION_REQUIRED");
  const many = await buildStoryLaunchPlan(Array.from({ length: 25 }, (_, index) => story({ id: index + 1, title: `Story ${index + 1}` })), { asOf: "2026-08-31T00:00:00Z", maxCandidates: 20 });
  assert.equal(many.bestCandidates.length, 20);
  const mixed = await buildStoryLaunchPlan([story({ id: 1, evidenceStatus: "corrected" }), story({ id: 2, claims: [] })], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(mixed.bestCandidates[0].classification, "REMEDIATION_REQUIRED");
  const repeat = await buildStoryLaunchPlan([story()], { asOf: "2026-08-31T00:00:00Z" });
  assert.equal(repeat.planFingerprint, ready.planFingerprint);
  const sourceInputs: SourceCohortSnapshot[] = [
    { id: 1, name: "AI Research RSS", connector: "rss", active: true, healthStatus: "healthy", consecutiveFailures: 0, recentSuccessfulFetches: 2, section: "research", treatment: "primary-research", tier: "A" },
    { id: 2, name: "Broken source", connector: "rss", active: true, healthStatus: "failing", consecutiveFailures: 4, recentSuccessfulFetches: 0 },
    { id: 3, name: "Manual archive", connector: "manual", active: true, healthStatus: "healthy", consecutiveFailures: 0, recentSuccessfulFetches: 1 },
  ];
  const sourcePlan = await buildSourceCohortPlan(sourceInputs);
  assert.equal(sourcePlan.assessments.find((item) => item.id === "1")?.classification, "CORE_V1");
  assert.equal(sourcePlan.assessments.find((item) => item.id === "2")?.classification, "DISABLE_CANDIDATE");
  assert.equal(sourcePlan.assessments.find((item) => item.id === "3")?.classification, "UNSUPPORTED_CONNECTOR");
  const readyKnowledge = await buildKnowledgeLaunchPlan([knowledge()]);
  assert.equal(readyKnowledge.counts.LAUNCH_READY, 1);
  const metadataOnly = await buildKnowledgeLaunchPlan([knowledge({ visibility: "internal", assertions: [] })]);
  assert.equal(metadataOnly.candidates[0].classification, "REMEDIATION_REQUIRED");
  const draft = await buildKnowledgeLaunchPlan([knowledge({ status: "draft" })]);
  assert.equal(draft.candidates[0].classification, "EXCLUDE_FROM_V1");
  const stale = await buildKnowledgeLaunchPlan([knowledge({ assertions: [{ ...knowledge().assertions[0], freshnessState: "stale" }] })]);
  assert.equal(stale.candidates[0].remediation.some((item) => item.reasonCode === "freshness_review_required"), true);
  const knowledgeCorrected = await buildKnowledgeLaunchPlan([knowledge({ claimLinks: [{ ...knowledge().claimLinks[0], claimState: "corrected" }] })]);
  assert.equal(knowledgeCorrected.candidates[0].classification, "EXCLUDE_FROM_V1");
  const ask = projectAskReadiness(ready, readyKnowledge, 1, 1);
  assert.deepEqual(ask, { currentEligibleAssertions: 1, launchReadyStories: 1, launchReadyKnowledgePages: 1, resolvableCitations: 1, deterministicInsufficiencyCandidates: 0, projectedAfterApprovedRemediation: { storiesWithEvidencePlan: 0, knowledgePagesWithEvidencePlan: 0 } });
}

function migrationIdentityTests(): void {
  const identities = extractMigrationStructureIdentities(`
    CREATE TABLE first (id TEXT PRIMARY KEY, shared TEXT, first_only INTEGER);
    CREATE TABLE second (id TEXT PRIMARY KEY, shared TEXT, second_only INTEGER);
    CREATE INDEX first_shared_idx ON first(shared);
    CREATE INDEX second_shared_idx ON second(shared);
    CREATE TRIGGER first_guard BEFORE UPDATE ON first BEGIN SELECT 1; END;
    CREATE TRIGGER second_guard BEFORE UPDATE ON second BEGIN SELECT 1; END;
    ALTER TABLE second ADD COLUMN added TEXT;
  `);
  assert.ok(identities.some((item) => item.objectType === "column" && item.tableName === "first" && item.objectName === "shared"));
  assert.ok(identities.some((item) => item.objectType === "column" && item.tableName === "second" && item.objectName === "shared"));
  assert.ok(identities.some((item) => item.objectType === "index" && item.tableName === "first" && item.objectName === "first_shared_idx"));
  assert.ok(identities.some((item) => item.objectType === "index" && item.tableName === "second" && item.objectName === "second_shared_idx"));
  assert.ok(identities.some((item) => item.objectType === "trigger" && item.tableName === "first" && item.objectName === "first_guard"));
  assert.ok(identities.some((item) => item.objectType === "trigger" && item.tableName === "second" && item.objectName === "second_guard"));
  assert.ok(identities.some((item) => item.objectType === "column" && item.tableName === "second" && item.objectName === "added"));
  assert.equal(identities.some((item) => item.objectType === "column" && item.tableName === "first" && item.objectName === "added"), false);

  const freshnessMigration = extractMigrationStructureIdentities(readFileSync("db/migration-0068-v1-freshness-review.sql", "utf8"));
  assert.ok(freshnessMigration.length >= 8);
  assert.equal(freshnessMigration.every((item) => item.objectType === "table" ? item.objectName === "evidence_freshness_reviews" : item.tableName === "evidence_freshness_reviews"), true,
    "migration 0068 identities stay scoped to its freshness-review table");

  const targetGap = { key: "table:evidence_freshness_reviews", objectType: "table" as const, objectName: "evidence_freshness_reviews", classification: "MISSING" as const, requiredForV1: true };
  const resolution = migrationPlanForGaps({
    version: "trace-v1-m1-v1", items: [targetGap], summary: { PRESENT_COMPATIBLE: 0, PRESENT_LEGACY_COMPATIBLE: 0, MISSING: 1, INCOMPATIBLE: 0, NOT_REQUIRED_FOR_V1: 0 },
    missing: [targetGap], incompatible: [],
  });
  const assessment = resolution.relevantAssessments.find((item) => item.migrationFile === "db/migration-0068-v1-freshness-review.sql");
  assert.equal(assessment?.ownershipStatus, "CONFIRMED", "migration planner confirms 0068 ownership by exact identity");
  assert.equal(assessment?.appliedState, "UNKNOWN", "missing migration ledger is modeled as unknown");
  assert.equal(assessment?.productionPlanEligible, false, "assessment never becomes an executable production plan");
}

async function freshnessTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (900, 'Test source', 'https://example.com', 'A', 'A', 'primary-research', 'rss');
      INSERT INTO canonical_claims (id, canonical_text, claim_class) VALUES ('freshness-claim', 'A reviewed test claim.', 'independent_research_finding');
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode, current_version_id) VALUES ('freshness-document', 'https://example.com/source', 'freshness-url-hash', 900, 'html', 'admitted', 'metadata_only', 'freshness-version');
      INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, extraction_state, storage_state) VALUES ('freshness-version', 'freshness-document', 'freshness-content-hash', 'https://example.com/source', '2026-08-30T00:00:00Z', 'extracted', 'extracted', 'metadata_only');
      INSERT INTO source_chunks (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator) VALUES ('freshness-chunk', 'freshness-version', 0, 'Reviewed excerpt.', 'freshness-text-hash', 'p1', 'p2');
      INSERT INTO provenance_groups (id, origin_type, explanation, determined_by, determination_method, reviewed_at) VALUES ('freshness-group', 'research', 'Independent test provenance.', 'publisher', 'editor_review', '2026-08-30T00:00:00Z');
      INSERT INTO claim_assertions (id, canonical_claim_id, source_document_version_id, source_chunk_id, assertion_text, relationship, source_role, directness, evidence_treatment, admission_state, freshness_state, provenance_group_id, extraction_method, reviewer_state, reviewed_by, reviewed_at) VALUES ('freshness-assertion', 'freshness-claim', 'freshness-version', 'freshness-chunk', 'The reviewed test claim.', 'supports', 'evidence', 'direct', 'factual_support', 'admitted', 'unknown', 'freshness-group', 'test', 'accepted', 'publisher', '2026-08-30T00:00:00Z');
    `);
    database.sqlite.exec("UPDATE source_document_versions SET extraction_state = 'metadata_only' WHERE id = 'freshness-version'");
    await assert.rejects(
      () => requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Blocked until extraction is usable.", actor: "publisher@example.com", idempotencyKey: "freshness-review-blocked-extraction" }),
      (error: unknown) => error instanceof EvidenceFreshnessReviewError && error.code === "source_extraction_blocks_current",
    );
    database.sqlite.exec("UPDATE source_document_versions SET extraction_state = 'extracted' WHERE id = 'freshness-version'");
    const pending = await requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Publisher reviewed the current source version and locator.", actor: "publisher@example.com", idempotencyKey: "freshness-review-1" });
    assert.equal(pending.state, "pending");
    const replay = await requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Publisher reviewed the current source version and locator.", actor: "publisher@example.com", idempotencyKey: "freshness-review-1" });
    assert.equal(replay.replay, true);
    await assert.rejects(
      () => requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Changed assertion for the same key.", actor: "publisher@example.com", idempotencyKey: "freshness-review-1" }),
      (error: unknown) => error instanceof EvidenceFreshnessReviewError && error.code === "idempotency_conflict",
    );
    const approved = await approveFreshnessReview(database.asD1(), pending.reviewId, "publisher@example.com", "Approved after review.");
    assert.equal(approved.state, "approved");
    assert.throws(() => database.sqlite.exec(`DELETE FROM evidence_freshness_reviews WHERE id = '${pending.reviewId}'`), /append-only/);
    assert.equal(database.sqlite.prepare("SELECT freshness_state FROM claim_assertions WHERE id = 'freshness-assertion'").get()?.freshness_state, "current");
    assert.equal((await approveFreshnessReview(database.asD1(), pending.reviewId, "publisher@example.com")).replay, true);
    const concurrentRequests = await Promise.all(Array.from({ length: 10 }, () => requestFreshnessReview(database.asD1(), {
      claimAssertionId: "freshness-assertion", proposedState: "stale",
      reason: "One convergent concurrent proposal.", actor: "publisher@example.com", idempotencyKey: "freshness-review-concurrent",
    })));
    assert.equal(concurrentRequests.filter((result) => result.inserted).length, 1, "exactly one concurrent proposal inserts");
    assert.equal(new Set(concurrentRequests.map((result) => result.reviewId)).size, 1, "concurrent proposals converge on one review");
    const concurrentReview = concurrentRequests[0];
    const concurrentApprovals = await Promise.all(Array.from({ length: 10 }, () => approveFreshnessReview(database.asD1(), concurrentReview.reviewId, "publisher@example.com", "Convergent approval.")));
    assert.equal(concurrentApprovals.filter((result) => result.inserted).length, 1, "exactly one concurrent approval commits");
    assert.equal(concurrentApprovals.every((result) => result.state === "approved"), true, "concurrent approvals converge on approved");
    const rejectedRequest = await requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Publisher rejected this current transition for test coverage.", actor: "publisher@example.com", idempotencyKey: "freshness-review-reject" });
    const rejected = await rejectFreshnessReview(database.asD1(), rejectedRequest.reviewId, "publisher@example.com", "Rejected by publisher.");
    assert.equal(rejected.state, "rejected");
    assert.equal((await rejectFreshnessReview(database.asD1(), rejectedRequest.reviewId, "publisher@example.com")).replay, true);
    database.sqlite.exec(`
      UPDATE source_documents SET current_version_id = 'freshness-version' WHERE id = 'freshness-document';
      INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, extraction_state, storage_state)
        VALUES ('freshness-version-2', 'freshness-document', 'freshness-content-hash-2', 'https://example.com/source', '2026-08-31T00:00:00Z', 'extracted', 'extracted', 'metadata_only');
    `);
    const toctou = await requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Source version must remain current through approval.", actor: "publisher@example.com", idempotencyKey: "freshness-review-toctou" });
    database.sqlite.exec("UPDATE source_documents SET current_version_id = 'freshness-version-2' WHERE id = 'freshness-document'");
    await assert.rejects(
      () => approveFreshnessReview(database.asD1(), toctou.reviewId, "publisher@example.com"),
      (error: unknown) => error instanceof EvidenceFreshnessReviewError && error.code === "source_version_blocks_current",
    );
    await assert.rejects(() => requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "stale", reason: "No-op", actor: "publisher@example.com", idempotencyKey: "freshness-review-noop" }), (error: unknown) => error instanceof EvidenceFreshnessReviewError && error.code === "freshness_state_unchanged");
    database.sqlite.exec("UPDATE canonical_claims SET current_state = 'corrected' WHERE id = 'freshness-claim'; UPDATE claim_assertions SET freshness_state = 'unknown' WHERE id = 'freshness-assertion';");
    await assert.rejects(() => requestFreshnessReview(database.asD1(), { claimAssertionId: "freshness-assertion", proposedState: "current", sourceDocumentVersionId: "freshness-version", reason: "Correction must win.", actor: "publisher@example.com", idempotencyKey: "freshness-review-corrected" }), (error: unknown) => error instanceof EvidenceFreshnessReviewError && error.code === "claim_state_blocks_current");
  } finally {
    database.close();
  }
}

await schemaTests();
await plannerTests();
migrationIdentityTests();
await freshnessTests();
console.log("TRACE V1 Mission 1 focused tests passed.");
