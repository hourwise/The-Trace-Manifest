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
  type TraceV1M2PreparedItem,
} from "../src/lib/server/trace-v1-m2-executor";
import {
  inspectTraceV1M2ActivationPreflight,
  TRACE_V1_M2_REQUIRED_INDEXES,
  TRACE_V1_M2_REQUIRED_TABLES,
  TRACE_V1_M2_REQUIRED_TRIGGERS,
} from "../src/lib/server/trace-v1-m2-activation-preflight";
import {
  TRACE_V1_REQUIRED_FIELDS,
  type SchemaCatalogSnapshot,
  type SchemaColumnSnapshot,
  type SchemaTableSnapshot,
} from "../src/lib/server/trace-v1-m2-contract";
import type { TraceV1M2EvidenceFixture } from "../src/lib/server/trace-v1-m2-planner";
import { SQLiteD1 } from "./sqlite-d1";

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
  return { schemaIdentity: "fixture-m2-v1", tables };
}

function preflight() {
  const base = completeCatalog();
  return inspectTraceV1M2ActivationPreflight({
    ...base,
    objects: {
      tables: [...TRACE_V1_M2_REQUIRED_TABLES],
      indexes: [...TRACE_V1_M2_REQUIRED_INDEXES],
      triggers: [...TRACE_V1_M2_REQUIRED_TRIGGERS],
    },
  });
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
  };
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
  const missing = inspectTraceV1M2ActivationPreflight({ ...completeCatalog(), objects: { tables: [], indexes: [], triggers: [] } });
  assert.equal(missing.activationDisposition, "MIGRATION_REQUIRED");
  assert.equal(missing.missingObjects.length, 7);

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
  const evidence = await prepared();
  let prepareCalls = 0;
  const operations = { prepareItem: async (): Promise<TraceV1M2PreparedItem> => { prepareCalls += 1; return evidence; } };
  const dryRun = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "dry_run", itemIds: ["story-377"], operations });
  assert.equal(dryRun.sideEffectFree, true);
  assert.equal(dryRun.items[0].outcome, "completed");
  assert.equal(prepareCalls, 1);
  assert.equal(dryRun.items[0].receipt, null);

  const store = new MemoryTraceV1M2ReceiptStore();
  const first = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: store, now: () => "2026-09-05T00:00:00.000Z" });
  assert.equal(first.items[0].outcome, "completed");
  assert.equal(first.items[0].receipt?.outcome, "completed");
  const callsAfterFirst = prepareCalls;
  const replay = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: store, now: () => "2099-01-01T00:00:00.000Z" });
  assert.equal(replay.items[0].outcome, "replayed");
  assert.equal(prepareCalls, callsAfterFirst);

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

  const production = await executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "PRODUCTION", mode: "execute", itemIds: ["story-377"], operations, receiptStore: store });
  assert.equal(production.items[0].reasonCode, "EXECUTION_UNAUTHORIZED");
  assert.equal(prepareCalls, callsAfterFirst + 1, "Preview/Production refusal does not invoke operations");
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-339"], operations, receiptStore: store }), /RESERVE_REQUIRES_REVIEWED_MANIFEST_REVISION/);

  const blocked = await executeTraceV1M2Activation({ manifest, schemaPreflight: { ...preflight(), disposition: "MIGRATION_REQUIRED" }, environment: "LOCAL_TEST", mode: "execute", itemIds: ["story-377"], operations, receiptStore: new MemoryTraceV1M2ReceiptStore() });
  assert.equal(blocked.items[0].reasonCode, "SCHEMA_PREFLIGHT_BLOCKED");
  assert.equal(TRACE_V1_M2_EXECUTOR_BOUNDS.maxItemsPerInvocation, 3);
  await assert.rejects(() => executeTraceV1M2Activation({ manifest, schemaPreflight: preflight(), environment: "LOCAL_TEST", mode: "plan", itemIds: ["story-377", "story-328", "story-376", "story-347"], operations }), /ITEM_SELECTION_INVALID/);
}

await manifestTests();
await preflightAndMigrationTests();
await executorTests();
console.log("TRACE V1 Mission 2 bounded activation tests passed.");
