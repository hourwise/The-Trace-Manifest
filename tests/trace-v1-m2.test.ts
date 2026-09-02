import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  inspectTraceV1M2Compatibility,
  TRACE_V1_REQUIRED_FIELDS,
  TRACE_V1_RUNTIME_BLOCKERS,
  TRACE_V1_SOURCE_DOCUMENT_FIELDS,
  TRACE_V1_SOURCE_DOCUMENT_VERSION_FIELDS,
  type SchemaCatalogSnapshot,
  type SchemaColumnSnapshot,
  type SchemaTableSnapshot,
} from "../src/lib/server/trace-v1-m2-contract";
import {
  buildTraceV1M2Manifest,
  buildTraceV1M2ManifestFromBody,
  serializeTraceV1M2Manifest,
  traceV1M2ManifestBody,
  type TraceV1M2Manifest,
  type TraceV1M2ManifestBody,
  type TraceV1M2ManifestItem,
} from "../src/lib/server/trace-v1-m2-manifest";
import {
  planTraceV1M2Activation,
  TRACE_V1_M2_STAGES,
  verifyTraceV1M2SourceIdentity,
  type TraceV1M2EvidenceFixture,
} from "../src/lib/server/trace-v1-m2-planner";
import { SOURCE_HASH_SEMANTICS_VERSION } from "../src/lib/server/source-version-identity";

function column(contract: typeof TRACE_V1_REQUIRED_FIELDS[number], overrides: Partial<SchemaColumnSnapshot> = {}): SchemaColumnSnapshot {
  return {
    name: contract.column,
    declaredType: contract.sqliteType,
    notNull: !contract.nullable,
    defaultValue: contract.defaultValue === null ? null : String(contract.defaultValue),
    ...overrides,
  };
}

function catalogFromColumns(columns: readonly SchemaColumnSnapshot[], overrides: Partial<SchemaTableSnapshot> = {}): SchemaTableSnapshot {
  return { name: overrides.name ?? "fixture", columns, ...overrides };
}

function completeCatalog(overrides: Partial<Record<string, Partial<SchemaColumnSnapshot>>> = {}): SchemaCatalogSnapshot {
  const tables: Record<string, SchemaTableSnapshot> = {};
  for (const tableName of ["sources", "corrections", "source_documents", "source_document_versions"]) {
    const fields = TRACE_V1_REQUIRED_FIELDS.filter((field) => field.table === tableName);
    tables[tableName] = catalogFromColumns(fields.map((contract) => column(contract, overrides[`${tableName}.${contract.column}`])) , { name: tableName });
  }
  return { schemaIdentity: "fixture-compatible-v1", tables };
}

function legacyCatalog(): SchemaCatalogSnapshot {
  const catalog = completeCatalog({
    "corrections.correction_type": { defaultValue: "'other'" },
    "corrections.published": { defaultValue: "0" },
  });
  return catalog;
}

function minimalMissingCatalog(): SchemaCatalogSnapshot {
  return {
    schemaIdentity: "fixture-legacy-missing-capture-v1",
    tables: {
      sources: { name: "sources", columns: [column(TRACE_V1_RUNTIME_BLOCKERS[0])] },
      corrections: { name: "corrections", columns: [column(TRACE_V1_RUNTIME_BLOCKERS[1]), column(TRACE_V1_RUNTIME_BLOCKERS[2])] },
      source_documents: { name: "source_documents", columns: [] },
      source_document_versions: { name: "source_document_versions", columns: [] },
    },
  };
}

function readSqliteCatalog(database: DatabaseSync, schemaIdentity: string): SchemaCatalogSnapshot {
  const tables: Record<string, SchemaTableSnapshot> = {};
  for (const tableName of ["sources", "corrections", "source_documents", "source_document_versions"]) {
    const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string; type: string | null; notnull: number; dflt_value: string | null; pk: number }>;
    const distinctValues: Record<string, readonly (string | number | null)[]> = {};
    for (const columnName of tableName === "sources" ? ["ingestion_type"] : tableName === "corrections" ? ["correction_type", "published"] : []) {
      const values = database.prepare(`SELECT DISTINCT ${columnName} AS value FROM ${tableName} ORDER BY ${columnName}`).all() as Array<{ value: string | number | null }>;
      distinctValues[columnName] = values.map((value) => value.value);
    }
    tables[tableName] = {
      name: tableName,
      columns: rows.map((row) => ({ name: row.name, declaredType: row.type, notNull: row.notnull === 1, defaultValue: row.dflt_value, primaryKeyPosition: row.pk })),
      createSql: (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { sql: string | null } | undefined)?.sql,
      distinctValues,
    };
  }
  return { schemaIdentity, tables };
}

async function contractTests(): Promise<void> {
  assert.equal(TRACE_V1_RUNTIME_BLOCKERS.length, 3);
  assert.equal(TRACE_V1_SOURCE_DOCUMENT_FIELDS.length, 8);
  assert.equal(TRACE_V1_SOURCE_DOCUMENT_VERSION_FIELDS.length, 8);
  assert.equal(TRACE_V1_REQUIRED_FIELDS.length, 19);

  const current = inspectTraceV1M2Compatibility(completeCatalog());
  assert.equal(current.disposition, "ACTIVATION_ALLOWED");
  assert.equal(current.fields.every((field) => field.status === "ALREADY_COMPATIBLE"), true);

  const legacy = inspectTraceV1M2Compatibility(legacyCatalog());
  assert.equal(legacy.disposition, "ACTIVATION_ALLOWED");
  assert.equal(legacy.fields.find((field) => field.column === "correction_type")?.status, "SUPPORTED_LEGACY_SHAPE");
  assert.equal(legacy.fields.find((field) => field.column === "published")?.status, "SUPPORTED_LEGACY_SHAPE");

  const missing = inspectTraceV1M2Compatibility(minimalMissingCatalog());
  assert.equal(missing.disposition, "MIGRATION_REQUIRED");
  assert.equal(missing.missingAdditiveFields.length, 16);
  assert.equal(missing.canApplyAdditiveMigration, true);
  assert.equal(missing.activationBlocked, true);

  const incompatible = inspectTraceV1M2Compatibility(completeCatalog({ "corrections.published": { declaredType: "TEXT", defaultValue: "'yes'" } }));
  assert.equal(incompatible.disposition, "FAIL_CLOSED");
  assert.equal(incompatible.incompatibleFields.some((field) => field.column === "published"), true);
  assert.equal(incompatible.canApplyAdditiveMigration, false);

  const compatibleForAmbiguity = completeCatalog();
  const ambiguousValues: SchemaCatalogSnapshot = {
    ...compatibleForAmbiguity,
    tables: {
      ...compatibleForAmbiguity.tables,
      sources: {
        ...compatibleForAmbiguity.tables.sources!,
    distinctValues: { ingestion_type: ["rss", "unknown_connector"] },
      },
    },
  };
  const ambiguous = inspectTraceV1M2Compatibility(ambiguousValues);
  assert.equal(ambiguous.disposition, "FAIL_CLOSED");
  assert.equal(ambiguous.ambiguousFields.some((field) => field.column === "ingestion_type"), true);

  const correctConstraintBase = completeCatalog();
  const wrongConstraintBase: SchemaCatalogSnapshot = {
    ...correctConstraintBase,
    tables: {
      ...correctConstraintBase.tables,
      sources: {
        ...correctConstraintBase.tables.sources!,
        createSql: "CREATE TABLE sources (ingestion_type TEXT NOT NULL CHECK(ingestion_type IN ('rss')))",
      },
    },
  };
  const wrongConstraint = inspectTraceV1M2Compatibility(wrongConstraintBase);
  assert.equal(wrongConstraint.incompatibleFields.some((field) => field.column === "ingestion_type"), true);

  const noIdentity = inspectTraceV1M2Compatibility({ ...completeCatalog(), schemaIdentity: null });
  assert.equal(noIdentity.stopReason, "SCHEMA_IDENTITY_UNRESOLVED");
  assert.equal(noIdentity.ambiguousFields.length, TRACE_V1_REQUIRED_FIELDS.length);

  assert.deepEqual(inspectTraceV1M2Compatibility(completeCatalog()), inspectTraceV1M2Compatibility(completeCatalog()), "repeated preflight is deterministic");
}

async function migrationTests(): Promise<void> {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE sources (id INTEGER PRIMARY KEY, ingestion_type TEXT NOT NULL);
      CREATE TABLE corrections (id INTEGER PRIMARY KEY);
      CREATE TABLE story_cluster_members (
        cluster_id INTEGER NOT NULL,
        feed_item_id INTEGER NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT 0,
        PRIMARY KEY (cluster_id, feed_item_id)
      );
      CREATE TABLE source_documents (id TEXT PRIMARY KEY, current_version_id TEXT);
      CREATE TABLE source_document_versions (
        id TEXT PRIMARY KEY, source_document_id TEXT NOT NULL, content_hash TEXT NOT NULL,
        retrieved_url TEXT NOT NULL, retrieved_at TEXT NOT NULL, extraction_status TEXT NOT NULL,
        r2_original_key TEXT, r2_extracted_key TEXT
      );
      INSERT INTO sources (id, ingestion_type) VALUES (1, 'rss');
      INSERT INTO corrections (id) VALUES (1);
      INSERT INTO source_documents (id, current_version_id) VALUES ('document-1', 'version-1');
      INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
        VALUES ('version-1', 'document-1', 'legacy-content', 'https://example.test', '2026-09-02T00:00:00Z', 'extracted');
    `);
    const before = database.prepare("SELECT content_hash FROM source_document_versions WHERE id = 'version-1'").get();
    const r1Migration = readFileSync("db/migration-0069-trace-d1-reverse-membership-index.sql", "utf8");
    database.exec(r1Migration);
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_story_cluster_members_feed_item_primary_cluster'").get()?.name, "idx_story_cluster_members_feed_item_primary_cluster", "0069 reverse-membership index is applied first");
    const migration = readFileSync("db/migration-0070-trace-v1-evidence-activation-compatibility.sql", "utf8");
    database.exec(migration);
    const after = database.prepare("SELECT content_hash FROM source_document_versions WHERE id = 'version-1'").get();
    assert.deepEqual(after, before, "compatibility migration preserves existing values");
    const migratedCorrection = database.prepare("SELECT correction_type, published FROM corrections WHERE id = 1").get() as { correction_type: string; published: number };
    assert.equal(migratedCorrection.correction_type, "other");
    assert.equal(migratedCorrection.published, 0);
    const result = inspectTraceV1M2Compatibility(readSqliteCatalog(database, "fixture-after-0070-v1"));
    assert.equal(result.disposition, "ACTIVATION_ALLOWED");
    assert.equal(result.fields.every((field) => field.status === "ALREADY_COMPATIBLE" || field.status === "SUPPORTED_LEGACY_SHAPE"), true);
    assert.equal(database.prepare("SELECT capture_state FROM source_documents WHERE id = 'document-1'").get()?.capture_state, "captured");
    assert.equal(database.prepare("SELECT extraction_state, storage_state FROM source_document_versions WHERE id = 'version-1'").get()?.extraction_state, "extracted");
    assert.equal(database.prepare("SELECT storage_state FROM source_document_versions WHERE id = 'version-1'").get()?.storage_state, "metadata_only");
    assert.match(migration, /ALTER TABLE source_documents ADD COLUMN retrieval_state/);
    assert.doesNotMatch(migration, /DROP TABLE|CREATE TABLE source_upload_intakes|CREATE INDEX/);
    assert.equal(inspectTraceV1M2Compatibility(readSqliteCatalog(database, "fixture-after-0070-v1")).disposition, "ACTIVATION_ALLOWED", "repeated preflight is the repository-compatible replay check");
  } finally {
    database.close();
  }
}

function unresolvedItem(item: TraceV1M2ManifestItem): TraceV1M2ManifestItem {
  return { ...item, canonicalUrl: null, canonicalSourceId: null, expectedConnector: null, normalizedUrlHashInput: null, sourceIdentityStatus: "SOURCE_IDENTITY_UNRESOLVED", unresolvedFields: ["canonicalUrl", "canonicalSourceId", "expectedConnector", "normalizedUrlHashInput"] };
}

async function manifestTests(): Promise<void> {
  const body = traceV1M2ManifestBody();
  const manifest = await buildTraceV1M2Manifest();
  assert.equal(body.items.filter((item) => item.kind === "story" && item.cohort === "primary").length, 15);
  assert.equal(body.items.filter((item) => item.kind === "story" && item.cohort === "reserve").length, 5);
  assert.equal(body.items.filter((item) => item.kind === "knowledge").length, 6);
  assert.equal(new Set(body.items.map((item) => item.itemId)).size, 26, "manifest has 15 + 5 + 6 unique items");
  assert.equal(manifest.manifestHash, (await buildTraceV1M2Manifest()).manifestHash);
  assert.equal(manifest.manifestIdentity, `trace-v1-m2-activation-manifest-v1:${manifest.manifestHash}`);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.items), true);
  assert.equal(manifest.items.filter((item) => item.canonicalUrl !== null).length, 0, "no story/source URL was guessed");
  assert.equal(manifest.items.filter((item) => item.canonicalSourceId !== null).length, 0, "no source ID was treated as proven");
  assert.equal(manifest.items.find((item) => item.itemId === "story-339")?.cohort, "reserve");
  assert.equal(manifest.items.find((item) => item.itemId === "story-339")?.sourceIdentityStatus, "SOURCE_IDENTITY_UNRESOLVED");
  const knowledge = manifest.items.filter((item) => item.kind === "knowledge");
  assert.equal(knowledge.every((item) => item.localSourceReferenceCandidates?.every((candidate) => candidate.verificationStatus === "SCRIPT_REFERENCE_UNVERIFIED")), true);
  assert.equal(serializeTraceV1M2Manifest(manifest), serializeTraceV1M2Manifest(await buildTraceV1M2Manifest()));
  const snapshot = JSON.parse(readFileSync("docs/v1/trace-v1-m2-activation-manifest.json", "utf8")) as TraceV1M2Manifest & TraceV1M2ManifestBody;
  const { manifestHash: snapshotHash, manifestIdentity: snapshotIdentity, ...snapshotBody } = snapshot;
  assert.equal(snapshotHash, manifest.manifestHash);
  assert.equal(snapshotIdentity, manifest.manifestIdentity);
  assert.equal(serializeTraceV1M2Manifest(snapshotBody), serializeTraceV1M2Manifest(body), "checked-in manifest snapshot matches canonical module body");
}

function compatiblePreflight() {
  return inspectTraceV1M2Compatibility(completeCatalog());
}

function readyFixture(overrides: Partial<TraceV1M2EvidenceFixture> = {}): TraceV1M2EvidenceFixture {
  return {
    sourceId: 42,
    canonicalUrl: "HTTPS://example.test/evidence?utm_source=fixture#locator",
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
    ...overrides,
  };
}

async function plannerTests(): Promise<void> {
  const manifest = await buildTraceV1M2Manifest();
  const schemaPreflight = compatiblePreflight();
  const unresolved = await planTraceV1M2Activation(manifest, { schemaPreflight, evidenceByItemId: {} });
  assert.equal(unresolved.items.length, 26);
  assert.equal(new Set(unresolved.items.map((item) => item.idempotencyKey)).size, 26);
  assert.equal(unresolved.items.every((item) => item.stopReason === "SOURCE_IDENTITY_UNRESOLVED"), true);
  assert.equal(unresolved.items.every((item) => item.activationReady === false), true);
  assert.deepEqual(unresolved, await planTraceV1M2Activation(manifest, { schemaPreflight, evidenceByItemId: {} }), "repeated dry-runs are identical");

  const sourceIdentityExpected = { canonicalUrl: "https://example.test/evidence", sourceId: 42, connector: "rss" };
  const equivalent = await verifyTraceV1M2SourceIdentity(sourceIdentityExpected, { canonicalUrl: "HTTPS://EXAMPLE.TEST/evidence?utm_campaign=ignore#section", sourceId: 42, connector: "rss" });
  assert.equal(equivalent.ok, true);
  assert.equal(equivalent.identity?.normalizedUrlHashInput, "https://example.test/evidence");
  assert.equal(equivalent.identity?.urlHash.length, 64);
  const same = await verifyTraceV1M2SourceIdentity(sourceIdentityExpected, { canonicalUrl: "https://example.test/evidence", sourceId: 42, connector: "rss" });
  assert.equal(same.identity?.urlHash, equivalent.identity?.urlHash);
  assert.equal((await verifyTraceV1M2SourceIdentity(sourceIdentityExpected, { canonicalUrl: "https://example.test/evidence", sourceId: 99, connector: "rss" })).detailCode, "SOURCE_ID_MISMATCH");
  assert.equal((await verifyTraceV1M2SourceIdentity(sourceIdentityExpected, { canonicalUrl: "https://unknown.test/evidence", sourceId: 42, connector: "rss" })).detailCode, "URL_MISMATCH");
  assert.equal((await verifyTraceV1M2SourceIdentity(sourceIdentityExpected, { canonicalUrl: null, sourceId: null, connector: null })).detailCode, "MISSING_EXPECTED_IDENTITY");
  assert.equal((await verifyTraceV1M2SourceIdentity(sourceIdentityExpected, { canonicalUrl: "https://example.test/evidence", sourceId: 42, connector: "rss", ambiguousSourceMapping: true })).detailCode, "AMBIGUOUS_SOURCE_MAPPING");
  assert.equal((await verifyTraceV1M2SourceIdentity({ ...sourceIdentityExpected, connector: "lmsys_api" }, { canonicalUrl: sourceIdentityExpected.canonicalUrl, sourceId: 42, connector: "lmsys_api" })).detailCode, "UNSUPPORTED_CONNECTOR");

  const customItem: TraceV1M2ManifestItem = {
    ...unresolvedItem(manifest.items[0]),
    canonicalUrl: "https://example.test/evidence",
    canonicalSourceId: 42,
    expectedConnector: "rss",
    normalizedUrlHashInput: "https://example.test/evidence",
    sourceIdentityStatus: "RESOLVED",
    unresolvedFields: [],
  };
  const customBody: TraceV1M2ManifestBody = { ...traceV1M2ManifestBody(), items: [customItem] };
  const customManifest = await buildTraceV1M2ManifestFromBody(customBody);
  const stableFixture = readyFixture();
  const stableFixtureBefore = JSON.stringify(stableFixture);
  const ready = await planTraceV1M2Activation(customManifest, { schemaPreflight, evidenceByItemId: { [customItem.itemId]: stableFixture } });
  assert.equal(JSON.stringify(stableFixture), stableFixtureBefore, "dry-run does not mutate local fixtures");
  assert.equal(ready.items[0].activationReady, true);
  assert.equal(ready.items[0].stopReason, null);
  assert.deepEqual(ready.items[0].completedStages, TRACE_V1_M2_STAGES);
  assert.equal(ready.items[0].publisherActionRequired, false);

  const changedVersion = await planTraceV1M2Activation(customManifest, {
    schemaPreflight,
    evidenceByItemId: {
      [customItem.itemId]: readyFixture({
        sourceDocumentVersionId: "source-version-43",
        currentVersionId: "source-version-43",
        normalizedContentHash: "d".repeat(64),
        chunks: [{ id: "chunk-43", sourceDocumentVersionId: "source-version-43", startLocator: "p1", endLocator: "p2" }],
        assertions: [{ id: "assertion-43", sourceDocumentVersionId: "source-version-43", sourceChunkId: "chunk-43", canonicalClaimId: "claim-42" }],
      }),
    },
  });
  assert.equal(changedVersion.items[0].sourceDocumentVersionId, "source-version-43");
  assert.equal(changedVersion.items[0].idempotencyKey, ready.items[0].idempotencyKey, "item key is manifest-derived, not version-derived");
  assert.equal(changedVersion.items[0].activationReady, true, "a changed captured version is not equivalent to the prior version, but can be independently ready");

  for (const [override, reason] of [
    [{ transportHash: null }, "HASH_STATE_INCOMPLETE"],
    [{ chunks: [{ id: "chunk-42", sourceDocumentVersionId: "source-version-42", startLocator: null, endLocator: "p2" }] }, "LOCATOR_MISSING"],
    [{ assertions: [{ id: "assertion-42", sourceDocumentVersionId: "other-version", sourceChunkId: "chunk-42", canonicalClaimId: "claim-42" }] }, "ASSERTION_MISSING"],
    [{ provenanceState: "pending" }, "PROVENANCE_UNRESOLVED"],
    [{ freshnessState: "review_required" }, "FRESHNESS_REVIEW_REQUIRED"],
    [{ conflictState: "unresolved" }, "CONFLICT_UNRESOLVED"],
    [{ correctionState: "review_required" }, "CORRECTION_REVIEW_REQUIRED"],
    [{ publisherDecision: "pending" }, "PUBLISHER_DECISION_REQUIRED"],
  ] as const) {
    const result = await planTraceV1M2Activation(customManifest, { schemaPreflight, evidenceByItemId: { [customItem.itemId]: readyFixture(override) } });
    assert.equal(result.items[0].stopReason, reason);
    assert.equal(result.items[0].activationReady, false);
  }

  const schemaBlocked = await planTraceV1M2Activation(customManifest, { schemaPreflight: inspectTraceV1M2Compatibility(completeCatalog({ "sources.ingestion_type": { declaredType: "INTEGER" } })), evidenceByItemId: { [customItem.itemId]: readyFixture() } });
  assert.equal(schemaBlocked.items[0].stopReason, "SCHEMA_INCOMPATIBLE");
  assert.equal(schemaBlocked.items[0].completedStages.length, 0);
}

await contractTests();
await migrationTests();
await manifestTests();
await plannerTests();
console.log("TRACE V1 Mission 2 focused tests passed.");
