import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashTransportBody, SOURCE_HASH_SEMANTICS_VERSION } from "../src/lib/server/source-version-identity";
import {
  buildTraceV1M2FinalManifest,
  TRACE_V1_M2_FINAL_KNOWLEDGE_IDS,
  TRACE_V1_M2_FINAL_PRIMARY_STORY_IDS,
  TRACE_V1_M2_FINAL_RESERVE_STORY_IDS,
  serializeTraceV1M2FinalManifest,
} from "../src/lib/server/trace-v1-m2-final-manifest";
import {
  executeTraceV1M2Activation,
  D1TraceV1M2ReceiptStore,
  MemoryTraceV1M2ReceiptStore,
  TRACE_V1_M2_EXECUTOR_BOUNDS,
  type TraceV1M2CurrentIdentity,
  type TraceV1M2OperationBudget,
  type TraceV1M2PreparedItem,
} from "../src/lib/server/trace-v1-m2-executor";
import {
  inspectTraceV1M2ActivationPreflight,
  TRACE_V1_M2_REQUIRED_INDEXES,
  TRACE_V1_M2_REQUIRED_TABLES,
  TRACE_V1_M2_REQUIRED_TRIGGERS,
  type TraceV1M2ActivationCatalog,
} from "../src/lib/server/trace-v1-m2-activation-preflight";
import {
  TRACE_V1_REQUIRED_FIELDS,
  type SchemaCatalogSnapshot,
  type SchemaColumnSnapshot,
  type SchemaTableSnapshot,
} from "../src/lib/server/trace-v1-m2-contract";
import type { TraceV1M2EvidenceFixture } from "../src/lib/server/trace-v1-m2-planner";
import { SQLiteD1 } from "./sqlite-d1";

function activationTables(): Record<string, SchemaTableSnapshot> {
  return {
    evidence_freshness_reviews: {
      name: "evidence_freshness_reviews",
      columns: [
        ["id", "TEXT", false, null, 1], ["claim_assertion_id", "TEXT", true, null, 0], ["prior_state", "TEXT", true, null, 0],
        ["proposed_state", "TEXT", true, null, 0], ["source_document_version_id", "TEXT", false, null, 0], ["reason", "TEXT", true, null, 0],
        ["state", "TEXT", true, "'pending'", 0], ["requested_by", "TEXT", true, null, 0], ["requested_at", "TEXT", true, "datetime('now')", 0],
        ["reviewed_by", "TEXT", false, null, 0], ["reviewed_at", "TEXT", false, null, 0], ["review_note", "TEXT", false, null, 0],
        ["idempotency_key", "TEXT", true, null, 0], ["request_fingerprint", "TEXT", true, null, 0],
      ].map(([name, declaredType, notNull, defaultValue, primaryKeyPosition]) => ({ name: name as string, declaredType: declaredType as string, notNull: notNull as boolean, defaultValue: defaultValue as string | null, primaryKeyPosition: primaryKeyPosition as number })),
      createSql: "CREATE TABLE evidence_freshness_reviews (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE)",
      foreignKeys: [
        { from: "claim_assertion_id", table: "claim_assertions", to: "id", onDelete: "RESTRICT", onUpdate: "NO ACTION" },
        { from: "source_document_version_id", table: "source_document_versions", to: "id", onDelete: "RESTRICT", onUpdate: "NO ACTION" },
      ],
    },
    trace_v1_activation_receipts: {
      name: "trace_v1_activation_receipts",
      columns: [
        ["operation_key", "TEXT", false, null, 1], ["manifest_id", "TEXT", true, null, 0], ["manifest_hash", "TEXT", true, null, 0],
        ["item_type", "TEXT", true, null, 0], ["item_id", "TEXT", true, null, 0], ["stage", "TEXT", true, null, 0],
        ["environment", "TEXT", true, null, 0], ["source_id", "INTEGER", false, null, 0], ["canonical_source_url", "TEXT", false, null, 0],
        ["canonical_source_url_hash", "TEXT", false, null, 0], ["connector", "TEXT", false, null, 0], ["source_document_id", "TEXT", false, null, 0],
        ["source_document_version_id", "TEXT", false, null, 0], ["content_hash", "TEXT", false, null, 0], ["transport_hash", "TEXT", false, null, 0],
        ["normalized_content_hash", "TEXT", false, null, 0], ["hash_semantics_version", "TEXT", false, null, 0], ["outcome", "TEXT", true, null, 0],
        ["reason_code", "TEXT", true, null, 0], ["detail", "TEXT", true, null, 0], ["receipt_fingerprint", "TEXT", true, null, 0],
        ["created_at", "TEXT", true, "datetime('now')", 0],
      ].map(([name, declaredType, notNull, defaultValue, primaryKeyPosition]) => ({ name: name as string, declaredType: declaredType as string, notNull: notNull as boolean, defaultValue: defaultValue as string | null, primaryKeyPosition: primaryKeyPosition as number })),
      createSql: "CREATE TABLE trace_v1_activation_receipts (operation_key TEXT PRIMARY KEY, item_type TEXT NOT NULL CHECK(item_type IN ('story','knowledge')), environment TEXT NOT NULL CHECK(environment IN ('LOCAL_TEST','PREVIEW','PRODUCTION')), outcome TEXT NOT NULL CHECK(outcome IN ('completed','replayed','blocked','failed')))",
      foreignKeys: [],
    },
  };
}

function completeCatalog(): SchemaCatalogSnapshot {
  const tables: Record<string, SchemaTableSnapshot> = {};
  for (const tableName of ["sources", "corrections", "source_documents", "source_document_versions"]) {
    const columns = TRACE_V1_REQUIRED_FIELDS.filter((field) => field.table === tableName).map((field): SchemaColumnSnapshot => ({
      name: field.column,
      declaredType: field.sqliteType,
      notNull: !field.nullable,
      defaultValue: field.defaultValue === null ? null : String(field.defaultValue),
    }));
    tables[tableName] = { name: tableName, columns };
  }
  return { schemaIdentity: "fixture-m2-v1", tables: { ...tables, ...activationTables() } };
}

function completeActivationCatalog(): TraceV1M2ActivationCatalog {
  const base = completeCatalog();
  return {
    ...base,
    objects: {
      tables: [...TRACE_V1_M2_REQUIRED_TABLES],
      indexes: [...TRACE_V1_M2_REQUIRED_INDEXES],
      triggers: [...TRACE_V1_M2_REQUIRED_TRIGGERS],
      indexDefinitions: [
        { name: "idx_evidence_freshness_reviews_queue", table: "evidence_freshness_reviews", unique: false, columns: [{ name: "state", descending: false }, { name: "requested_at", descending: false }] },
        { name: "idx_evidence_freshness_reviews_assertion", table: "evidence_freshness_reviews", unique: false, columns: [{ name: "claim_assertion_id", descending: false }, { name: "requested_at", descending: true }] },
        { name: "idx_trace_v1_activation_receipts_manifest", table: "trace_v1_activation_receipts", unique: false, columns: [{ name: "manifest_hash", descending: false }, { name: "item_id", descending: false }] },
      ],
      triggerDefinitions: [
        { name: "prevent_evidence_freshness_review_delete", table: "evidence_freshness_reviews", sql: "CREATE TRIGGER prevent_evidence_freshness_review_delete BEFORE DELETE ON evidence_freshness_reviews BEGIN SELECT RAISE(ABORT, 'evidence freshness reviews are append-only'); END" },
        { name: "prevent_evidence_freshness_review_core_update", table: "evidence_freshness_reviews", sql: "CREATE TRIGGER prevent_evidence_freshness_review_core_update BEFORE UPDATE OF claim_assertion_id, prior_state, proposed_state, source_document_version_id, reason, requested_by, requested_at, idempotency_key, request_fingerprint ON evidence_freshness_reviews BEGIN SELECT RAISE(ABORT, 'evidence freshness review core fields are immutable'); END" },
      ],
    },
  };
}

function preflight(): ReturnType<typeof inspectTraceV1M2ActivationPreflight> {
  return inspectTraceV1M2ActivationPreflight(completeActivationCatalog());
}

function readyFixture(): TraceV1M2EvidenceFixture {
  return {
    sourceId: 42,
    canonicalUrl: "https://example.test/evidence",
    connector: "rss",
    sourceDocumentId: "source-document-42",
    sourceAdmissionState: "admitted",
    sourceAdmissionReviewId: "admission-review-42",
    sourceDocumentVersionId: "source-version-42",
    currentVersionId: "source-version-42",
    contentHash: "a".repeat(64),
    transportHash: "b".repeat(64),
    normalizedContentHash: "c".repeat(64),
    hashSemanticsVersion: SOURCE_HASH_SEMANTICS_VERSION,
    retrievalState: "available",
    captureState: "captured",
    extractionState: "extracted",
    storageState: "private_stored",
    chunks: [{ id: "chunk-42", sourceDocumentVersionId: "source-version-42", startLocator: "p1", endLocator: "p2" }],
    canonicalClaimId: "claim-42",
    assertions: [{ id: "assertion-42", sourceDocumentVersionId: "source-version-42", sourceChunkId: "chunk-42", canonicalClaimId: "claim-42" }],
    relationshipReviewState: "approved",
    provenanceReviewId: "provenance-review-42",
    provenanceState: "approved",
    freshnessReviewId: "freshness-review-42",
    freshnessState: "current",
    conflictState: "clear",
    correctionState: "clear",
    publisherDecision: "approved",
  };
}

async function prepared(): Promise<TraceV1M2PreparedItem> {
  const canonicalUrl = "https://example.test/evidence";
  return {
    identity: {
      sourceId: 42,
      canonicalUrl,
      connector: "rss",
      normalizedUrlHashInput: canonicalUrl,
      urlHash: await hashTransportBody(canonicalUrl),
      basis: "LOCAL_FIXTURE",
    },
    evidence: readyFixture(),
    cost: { sourceCaptures: 1, claims: 1, assertions: 1, chunks: 1, knowledgeMappings: 0, selectedItems: 1 },
  };
}

function currentIdentityFrom(preparedItem: TraceV1M2PreparedItem): TraceV1M2CurrentIdentity {
  return { identity: preparedItem.identity, evidence: preparedItem.evidence };
}

async function manifestTests(): Promise<void> {
  const manifest = await buildTraceV1M2FinalManifest();
  assert.equal(manifest.items.length, 26);
  assert.deepEqual(manifest.items.filter((item) => item.cohort === "primary").map((item) => item.storyId), [...TRACE_V1_M2_FINAL_PRIMARY_STORY_IDS]);
  assert.deepEqual(manifest.items.filter((item) => item.cohort === "reserve").map((item) => item.storyId), [...TRACE_V1_M2_FINAL_RESERVE_STORY_IDS]);
  assert.deepEqual(manifest.items.filter((item) => item.kind === "knowledge").map((item) => item.knowledgeId), [...TRACE_V1_M2_FINAL_KNOWLEDGE_IDS]);
  assert.equal(manifest.sourceIdentityExpectations.length, 4);
  assert.equal(manifest.sourceIdentityExpectations.every((source) => source.status === "EXPECTED_UNVERIFIED"), true);
  assert.equal(manifest.items.every((item) => item.canonicalUrl === null && item.canonicalSourceId === null && item.expectedConnector === null), true);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.items), true);
  assert.equal(manifest.manifestHash, (await buildTraceV1M2FinalManifest()).manifestHash);
  assert.equal(serializeTraceV1M2FinalManifest(manifest), serializeTraceV1M2FinalManifest(await buildTraceV1M2FinalManifest()));
  const snapshot = JSON.parse(readFileSync("docs/v1/mission-2-bounded-activation-manifest.json", "utf8")) as typeof manifest;
  assert.equal(snapshot.manifestHash, manifest.manifestHash);
  const { manifestHash: _hash, manifestIdentity: _identity, ...snapshotBody } = snapshot;
  const { manifestHash: _actualHash, manifestIdentity: _actualIdentity, ...actualBody } = manifest;
  assert.equal(serializeTraceV1M2FinalManifest(snapshotBody), serializeTraceV1M2FinalManifest(actualBody));
}

async function preflightAndMigrationTests(): Promise<void> {
  const allowed = preflight();
  assert.equal(allowed.activationDisposition, "ACTIVATION_ALLOWED");
  const missing = inspectTraceV1M2ActivationPreflight({ ...completeCatalog(), objects: { tables: [], indexes: [], triggers: [], indexDefinitions: [], triggerDefinitions: [] } });
  assert.equal(missing.activationDisposition, "ACTIVATION_BLOCKED");
  assert.equal(missing.disposition, "MIGRATION_REQUIRED");
  assert.equal(missing.missingObjects.length, 7);

  const wrongReceiptShape = preflight();
  const wrongReceiptTables = completeCatalog().tables as Record<string, SchemaTableSnapshot>;
  wrongReceiptTables.trace_v1_activation_receipts = {
    ...wrongReceiptTables.trace_v1_activation_receipts,
    columns: wrongReceiptTables.trace_v1_activation_receipts.columns.filter((column) => column.name !== "receipt_fingerprint"),
  };
  const wrongReceipt = inspectTraceV1M2ActivationPreflight({
    ...completeCatalog(),
    tables: wrongReceiptTables,
    objects: completeActivationCatalog().objects,
  });
  assert.equal(wrongReceiptShape.activationDisposition, "ACTIVATION_ALLOWED");
  assert.equal(wrongReceipt.activationDisposition, "ACTIVATION_BLOCKED");
  assert.ok(wrongReceipt.invalidObjects.some((issue) => issue.includes("receipt_fingerprint")));

  const wrongReceiptConstraintTables = completeCatalog().tables as Record<string, SchemaTableSnapshot>;
  wrongReceiptConstraintTables.trace_v1_activation_receipts = {
    ...wrongReceiptConstraintTables.trace_v1_activation_receipts,
    createSql: "CREATE TABLE trace_v1_activation_receipts (operation_key TEXT PRIMARY KEY)",
  };
  const wrongReceiptConstraint = inspectTraceV1M2ActivationPreflight({ ...completeCatalog(), tables: wrongReceiptConstraintTables, objects: completeActivationCatalog().objects });
  assert.equal(wrongReceiptConstraint.activationDisposition, "ACTIVATION_BLOCKED");
  assert.ok(wrongReceiptConstraint.invalidObjects.some((issue) => issue.includes("constraint:item_type")));

  const wrongIndex = inspectTraceV1M2ActivationPreflight({
    ...completeCatalog(),
    objects: {
      ...completeActivationCatalog().objects,
      indexDefinitions: completeActivationCatalog().objects.indexDefinitions.map((definition) => definition.name === "idx_trace_v1_activation_receipts_manifest"
        ? { ...definition, table: "evidence_freshness_reviews" }
        : definition),
    },
  });
  assert.equal(wrongIndex.activationDisposition, "ACTIVATION_BLOCKED");
  assert.ok(wrongIndex.invalidObjects.includes("index:idx_trace_v1_activation_receipts_manifest:definition"));

  const wrongTrigger = inspectTraceV1M2ActivationPreflight({
    ...completeCatalog(),
    objects: {
      ...completeActivationCatalog().objects,
      triggerDefinitions: completeActivationCatalog().objects.triggerDefinitions.map((definition) => definition.name === "prevent_evidence_freshness_review_delete"
        ? { ...definition, sql: definition.sql?.replace("BEFORE DELETE", "AFTER DELETE") ?? null }
        : definition),
    },
  });
  assert.equal(wrongTrigger.activationDisposition, "ACTIVATION_BLOCKED");
  assert.ok(wrongTrigger.invalidObjects.includes("trigger:prevent_evidence_freshness_review_delete:definition"));

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(readFileSync("db/schema.sql", "utf8"));
    for (const file of [
      "db/migration-5e-publication.sql", "db/migration-stabilisation-security.sql", "db/migration-0015-editorial-desk.sql",
      "db/migration-0016-knowledge-builder-foundation.sql", "db/migration-0017-multilingual-source-provenance.sql", "db/migration-0032-knowledge-continuity.sql",
      "db/migration-0033-knowledge-reconciliation-state.sql", "db/migration-0034-structured-source-extraction.sql", "db/migration-0035-extraction-run-metadata.sql",
      "db/migration-0036-extraction-review-history.sql", "db/migration-0037-claim-match-candidates.sql", "db/migration-0038-claim-match-review.sql",
      "db/migration-0039-claim-provenance-proposals.sql", "db/migration-0040-provenance-group-proposals.sql", "db/migration-0041-claim-relationship-proposals.sql",
      "db/migration-0042-claim-conflict-cases.sql", "db/migration-0043-legacy-claims-cutover.sql", "db/migration-0044-story-related-item-reviews.sql",
      "db/migration-0045-claim-score-snapshots.sql", "db/migration-0046-score-snapshot-explanations.sql", "db/migration-0047-evidence-change-approvals.sql",
      "db/migration-0048-knowledge-source-link-audit.sql", "db/migration-0049-knowledge-change-proposal-index.sql", "db/migration-0050-knowledge-retrieval-indexes.sql",
      "db/migration-0051-knowledge-embedding-index-state.sql", "db/migration-0052-knowledge-impact-proposals.sql", "db/migration-0053-knowledge-revision-decisions.sql",
      "db/migration-0054-knowledge-revision-immutability.sql", "db/migration-0055-knowledge-embedding-confirmation.sql", "db/migration-0056-kc-11c-bounded-source-backfill.sql",
      "db/migration-0057-kc-11c-backfill-integrity.sql", "db/migration-0058-kc-11c-final-integrity.sql", "db/migration-0059-source-version-hash-semantics.sql",
      "db/migration-0060-source-identity-component-diagnostics.sql", "db/migration-0061-normalized-content-v2.sql", "db/migration-0062-normalized-content-v3-reference-drift.sql",
      "db/migration-0063-kc-03f-upload-source-states.sql", "db/migration-0064-kc-03h-pdf-upload-state.sql", "db/migration-0065-public-evidence-graph-indexes.sql",
      "db/migration-0066-kc-11d-bounded-expiry.sql", "db/migration-0067-kc-11g-h-remediation.sql", "db/migration-0068-v1-freshness-review.sql",
    ]) database.exec(readFileSync(file, "utf8"));
    database.exec(readFileSync("db/migration-0071-trace-v1-bounded-activation.sql", "utf8"));
    database.exec(readFileSync("db/migration-0071-trace-v1-bounded-activation.sql", "utf8"));
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trace_v1_activation_receipts'").get()?.name, "trace_v1_activation_receipts");
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'prevent_evidence_freshness_review_delete'").get()?.name, "prevent_evidence_freshness_review_delete");
  } finally {
    database.close();
  }
}

async function executorTests(): Promise<void> {
  const manifest = await buildTraceV1M2FinalManifest();
  let evidence = await prepared();
  let prepareCalls = 0;
  let identityCalls = 0;
  const operations = {
    resolveCurrentIdentity: async (): Promise<TraceV1M2CurrentIdentity> => { identityCalls += 1; return currentIdentityFrom(evidence); },
    prepareItem: async (): Promise<TraceV1M2PreparedItem> => { prepareCalls += 1; return evidence; },
  };
  const dryRun = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "dry_run", itemIds: ["story-377"], operations });
  assert.equal(dryRun.sideEffectFree, true);
  assert.equal(dryRun.items[0].outcome, "completed");
  assert.equal(prepareCalls, 1);
  assert.equal(dryRun.items[0].receipt, null);
  assert.equal(dryRun.cost.selectedItems, 1);

  const store = new MemoryTraceV1M2ReceiptStore();
  const first = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: store, now: () => "2026-09-05T00:00:00.000Z" });
  assert.equal(first.items[0].outcome, "completed");
  assert.equal(first.items[0].receipt?.outcome, "completed");
  const callsAfterFirst = prepareCalls;
  const replay = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: store, now: () => "2099-01-01T00:00:00.000Z" });
  assert.equal(replay.items[0].outcome, "replayed");
  assert.equal(prepareCalls, callsAfterFirst);
  assert.equal(identityCalls, 1);

  const changedVersion = await prepared();
  changedVersion.evidence = { ...changedVersion.evidence, sourceDocumentVersionId: "source-version-43", currentVersionId: "source-version-43" };
  evidence = changedVersion;
  const changedVersionReplay = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: store, now: () => "2099-01-01T00:00:00.000Z" });
  assert.equal(changedVersionReplay.items[0].reasonCode, "REPLAY_IDENTITY_CHANGED");

  async function assertReplayIdentityChange(mutator: (base: TraceV1M2PreparedItem) => TraceV1M2PreparedItem | Promise<TraceV1M2PreparedItem>): Promise<void> {
    const baseline = await prepared();
    const localStore = new MemoryTraceV1M2ReceiptStore();
    let current = baseline;
    const localOperations = {
      resolveCurrentIdentity: async (): Promise<TraceV1M2CurrentIdentity> => currentIdentityFrom(current),
      prepareItem: async (): Promise<TraceV1M2PreparedItem> => current,
    };
    await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations: localOperations, receiptStore: localStore, now: () => "2026-09-05T00:00:00.000Z" });
    current = await mutator(baseline);
    const result = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations: localOperations, receiptStore: localStore, now: () => "2026-09-05T00:00:00.000Z" });
    assert.equal(result.items[0].reasonCode, "REPLAY_IDENTITY_CHANGED");
  }

  await assertReplayIdentityChange((base) => ({ ...base, evidence: { ...base.evidence, contentHash: "d".repeat(64) } }));
  await assertReplayIdentityChange((base) => ({ ...base, evidence: { ...base.evidence, normalizedContentHash: "e".repeat(64) } }));
  await assertReplayIdentityChange(async (base) => ({
    ...base,
    identity: { ...base.identity, canonicalUrl: "https://example.test/changed", normalizedUrlHashInput: "https://example.test/changed", urlHash: await hashTransportBody("https://example.test/changed") },
    evidence: { ...base.evidence, canonicalUrl: "https://example.test/changed" },
  }));
  await assertReplayIdentityChange((base) => ({
    ...base,
    identity: { ...base.identity, connector: "github_api" },
    evidence: { ...base.evidence, connector: "github_api" },
  }));

  const corruptedStore = new MemoryTraceV1M2ReceiptStore();
  evidence = await prepared();
  await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: corruptedStore, now: () => "2026-09-05T00:00:00.000Z" });
  const corruptedReceipt = await corruptedStore.get(`${manifest.manifestHash}:story-377:bounded-activation-v1`);
  assert.ok(corruptedReceipt);
  corruptedReceipt!.receiptFingerprint = "0".repeat(64);
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: corruptedStore }), /REPLAY_CONFLICT/);

  const alteredManifest = { ...manifest, manifestHash: "0".repeat(64), manifestIdentity: `${manifest.manifestVersion}:${"0".repeat(64)}` };
  await assert.rejects(() => executeTraceV1M2Activation({ manifest: alteredManifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations }), /MANIFEST_HASH_MISMATCH/);

  const d1 = new SQLiteD1();
  try {
    d1.sqlite.exec(readFileSync("db/migration-0071-trace-v1-bounded-activation.sql", "utf8"));
    const durableStore = new D1TraceV1M2ReceiptStore(d1.asD1());
    const durable = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-328"], operations, receiptStore: durableStore, now: () => "2026-09-05T00:00:00.000Z" });
    assert.equal(durable.items[0].receipt?.outcome, "completed");
    assert.equal((await d1.prepare("SELECT COUNT(*) AS count FROM trace_v1_activation_receipts").first<{ count: number }>())?.count, 1);
  } finally {
    d1.close();
  }

  for (const [environment, mode] of [["PREVIEW", "plan"], ["PREVIEW", "execute"], ["PRODUCTION", "plan"], ["PRODUCTION", "execute"]] as const) {
    const before: number = prepareCalls + identityCalls;
    const result = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment, mode, itemIds: ["story-377"], operations });
    assert.equal(result.items[0].reasonCode, "EXECUTION_UNAUTHORIZED");
    assert.equal(prepareCalls + identityCalls, before);
  }
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "production" as "PRODUCTION", mode: "plan", itemIds: ["story-377"], operations }), /ENVIRONMENT_INVALID/);
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "EXECUTE" as "execute", itemIds: ["story-377"], operations }), /MODE_INVALID/);
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "PRODUCTION", mode: "EXECUTE" as "execute", itemIds: ["story-377"], operations }), /MODE_INVALID/);
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-339"], operations, receiptStore: store }), /RESERVE_REQUIRES_REVIEWED_MANIFEST_REVISION/);

  const blocked = await executeTraceV1M2Activation({ manifest, schemaPreflight: { ...preflight(), disposition: "MIGRATION_REQUIRED" }, environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: new MemoryTraceV1M2ReceiptStore() });
  assert.equal(blocked.items[0].reasonCode, "SCHEMA_PREFLIGHT_BLOCKED");
  assert.equal(TRACE_V1_M2_EXECUTOR_BOUNDS.maxItemsPerInvocation, 3);
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "plan", itemIds: ["story-377", "story-328", "story-376", "story-347"], operations }), /ITEM_SELECTION_INVALID/);

  const boundMetricTests: Array<[keyof TraceV1M2OperationBudget, number]> = [
    ["sourceCaptures", TRACE_V1_M2_EXECUTOR_BOUNDS.maxSourceCaptures],
    ["claims", TRACE_V1_M2_EXECUTOR_BOUNDS.maxClaims],
    ["assertions", TRACE_V1_M2_EXECUTOR_BOUNDS.maxAssertions],
    ["chunks", TRACE_V1_M2_EXECUTOR_BOUNDS.maxChunks],
    ["knowledgeMappings", TRACE_V1_M2_EXECUTOR_BOUNDS.maxKnowledgeMappings],
  ];
  for (const [metric, limit] of boundMetricTests) {
    const allowedCost: TraceV1M2OperationBudget = { sourceCaptures: 0, claims: 0, assertions: 0, chunks: 0, knowledgeMappings: 0, selectedItems: 1 };
    allowedCost[metric] = limit;
    const allowedOperations = {
      resolveCurrentIdentity: async (): Promise<TraceV1M2CurrentIdentity> => currentIdentityFrom(await prepared()),
      prepareItem: async (): Promise<TraceV1M2PreparedItem> => ({ ...(await prepared()), cost: allowedCost }),
    };
    const allowed = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "plan", itemIds: ["story-377"], operations: allowedOperations });
    assert.equal(allowed.items[0].outcome, "completed", `${metric} at bound is allowed`);
    assert.equal(allowed.cost[metric], limit);

    const overCost = { ...allowedCost, [metric]: limit + 1 };
    const counters = { actual: 0 };
    const overOperations = {
      resolveCurrentIdentity: async (): Promise<TraceV1M2CurrentIdentity> => currentIdentityFrom(await prepared()),
      prepareItem: async (_item: unknown, budget: TraceV1M2OperationBudget) => {
        const permitted = Math.min(overCost[metric], budget[metric]);
        counters.actual = permitted;
        if (overCost[metric] > budget[metric]) {
          return { reasonCode: "BOUNDED_WORK_LIMIT_EXCEEDED" as const, detail: `Stopped before ${metric} unit ${limit + 1}.`, cost: { sourceCaptures: metric === "sourceCaptures" ? permitted : 0, claims: metric === "claims" ? permitted : 0, assertions: metric === "assertions" ? permitted : 0, chunks: metric === "chunks" ? permitted : 0, knowledgeMappings: metric === "knowledgeMappings" ? permitted : 0, selectedItems: 1 } };
        }
        return { ...(await prepared()), cost: overCost };
      },
    };
    const over = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "plan", itemIds: ["story-377"], operations: overOperations });
    assert.equal(over.items[0].reasonCode, "BOUNDED_WORK_LIMIT_EXCEEDED");
    assert.equal(counters.actual, limit, `${metric} stopped before exceeding the limit`);
    assert.equal(over.cost[metric], limit);
  }

  const aggregateCalls: number[] = [];
  const aggregateOperations = {
    resolveCurrentIdentity: async (): Promise<TraceV1M2CurrentIdentity> => currentIdentityFrom(await prepared()),
    prepareItem: async (_item: unknown, budget: TraceV1M2OperationBudget): Promise<TraceV1M2PreparedItem | { reasonCode: "BOUNDED_WORK_LIMIT_EXCEEDED"; detail: string; cost: TraceV1M2OperationBudget }> => {
      const claims = Math.min(5, budget.claims);
      aggregateCalls.push(claims);
      const base = await prepared();
      if (claims < 5) return { reasonCode: "BOUNDED_WORK_LIMIT_EXCEEDED", detail: "Stopped before aggregate claim bound was exceeded.", cost: { ...base.cost, claims, selectedItems: 1 } };
      return { ...base, cost: { ...base.cost, claims, selectedItems: 1 } };
    },
  };
  const aggregate = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "plan", itemIds: ["story-377", "story-328", "story-376"], operations: aggregateOperations });
  assert.deepEqual(aggregateCalls, [5, 5, 2]);
  assert.equal(aggregate.cost.claims, TRACE_V1_M2_EXECUTOR_BOUNDS.maxClaims);
  assert.equal(aggregate.items[2].reasonCode, "BOUNDED_WORK_LIMIT_EXCEEDED");
}

await manifestTests();
await preflightAndMigrationTests();
await executorTests();
console.log("TRACE V1 Mission 2 bounded activation tests passed.");
