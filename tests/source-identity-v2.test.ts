import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractHtmlDocument } from "../src/lib/server/source-extraction";
import { captureAdmittedSource } from "../src/lib/server/source-capture";
import {
  hashNormalizedSourceContent,
  hashTransportBody,
  SOURCE_HASH_SEMANTICS_VERSION,
  SOURCE_NORMALIZATION_POLICY_VERSIONS,
} from "../src/lib/server/source-version-identity";
import {
  approveBackfillPlan,
  buildBackfillPlan,
  establishAuthoritativeInventory,
  loadCurrentBackfillInventory,
  verifyPlanHash,
} from "../src/lib/server/knowledge-source-backfill";
import { SQLiteD1 } from "./sqlite-d1";

const BASE_URL = "https://example.test/articles/model-context-protocol";

function htmlIdentity(body: string, canonicalUrl = BASE_URL) {
  return hashNormalizedSourceContent({
    mediaKind: "html",
    body,
    extraction: extractHtmlDocument(body),
    canonicalUrl,
  });
}

function linkFixture(links: string): string {
  return `<html><head><title>Stable evidence</title><meta name="author" content="A. Writer"><meta name="description" content="Stable description"></head><body><article><h1>Stable evidence</h1><p>Article prose remains stable.</p><div>${links}</div></article></body></html>`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  return hashTransportBody(value);
}

async function canonicalLinkPolicyTests(): Promise<void> {
  assert.equal(SOURCE_HASH_SEMANTICS_VERSION, "normalized_content_v3");
  assert.equal(SOURCE_NORMALIZATION_POLICY_VERSIONS.html, "source-normalized-html-v3");

  const ordered = await htmlIdentity(linkFixture([
    '<a href="https://evidence.test/a">Alpha</a>',
    '<a href="https://evidence.test/b">Beta</a>',
  ].join(" ")));
  const reordered = await htmlIdentity(linkFixture([
    '<a href="https://evidence.test/b">Beta</a>',
    '<a href="https://evidence.test/a">Alpha</a>',
  ].join(" ")));
  assert.equal(ordered.diagnostics.normalizedLinksHash, reordered.diagnostics.normalizedLinksHash);
  assert.equal(ordered.normalizedContentHash, reordered.normalizedContentHash);
  assert.equal(ordered.diagnostics.normalizedMetadataHash, reordered.diagnostics.normalizedMetadataHash);
  assert.equal(ordered.diagnostics.normalizedBlocksHash, reordered.diagnostics.normalizedBlocksHash);
  assert.equal(ordered.diagnostics.normalizedStructureHash, reordered.diagnostics.normalizedStructureHash);

  const duplicateA = await htmlIdentity(linkFixture([
    '<a href="https://evidence.test/a">Alpha</a>',
    '<a href="https://evidence.test/b">Beta</a>',
    '<a href="https://evidence.test/b">Beta</a>',
  ].join(" ")));
  const duplicateB = await htmlIdentity(linkFixture([
    '<a href="https://evidence.test/b">Beta</a>',
    '<a href="https://evidence.test/a">Alpha</a>',
    '<a href="https://evidence.test/b">Beta</a>',
  ].join(" ")));
  assert.equal(duplicateA.diagnostics.normalizedLinksHash, duplicateB.diagnostics.normalizedLinksHash);
  assert.equal(duplicateA.normalizedContentHash, duplicateB.normalizedContentHash);
  assert.equal(duplicateA.diagnostics.linkCount, 3);
  assert.notEqual(ordered.diagnostics.normalizedLinksHash, duplicateA.diagnostics.normalizedLinksHash, "adding a duplicate remains observable");
  assert.notEqual(duplicateA.diagnostics.normalizedLinksHash, ordered.diagnostics.normalizedLinksHash, "removing a duplicate remains observable");

  const canonicalDestination = await htmlIdentity(linkFixture('<a href="HTTPS://Evidence.Test:443/report?b=2&a=1">Source</a>'));
  for (const href of [
    "https://evidence.test/report?a=1&b=2#section",
    "https://evidence.test/report?utm_source=session&b=2&a=1&fbclid=ignored",
    "https://evidence.test/report?b=2&utm_medium=email&a=1#other",
  ]) {
    const variant = await htmlIdentity(linkFixture(`<a href="${href}">Source</a>`));
    assert.equal(variant.normalizedContentHash, canonicalDestination.normalizedContentHash);
    assert.equal(variant.diagnostics.normalizedLinksHash, canonicalDestination.diagnostics.normalizedLinksHash);
  }

  for (const href of [
    "https://evidence.test/other?a=1&b=2",
    "https://evidence.test/report?a=1&c=2",
    "https://evidence.test/report?a=1&b=3",
    "https://other.test/report?a=1&b=2",
  ]) {
    const variant = await htmlIdentity(linkFixture(`<a href="${href}">Source</a>`));
    assert.notEqual(variant.diagnostics.normalizedLinksHash, canonicalDestination.diagnostics.normalizedLinksHash);
  }
  const changedText = await htmlIdentity(linkFixture('<a href="https://evidence.test/report?a=1&b=2">Changed source</a>'));
  assert.notEqual(changedText.diagnostics.normalizedLinksHash, canonicalDestination.diagnostics.normalizedLinksHash);
  assert.equal(changedText.normalizedContentHash, canonicalDestination.normalizedContentHash, "href-only changes do not alter v3 readable-content identity");

  const hrefOnly = await htmlIdentity(linkFixture('<a href="https://evidence.test/different?a=1&b=2">Source</a>'));
  assert.equal(hrefOnly.normalizedContentHash, canonicalDestination.normalizedContentHash, "destination-only changes reuse the content identity");
  assert.notEqual(hrefOnly.diagnostics.normalizedLinksHash, canonicalDestination.diagnostics.normalizedLinksHash, "destination-only changes remain reference-observable");

  const paragraphAnchorA = await htmlIdentity("<article><p>Read <a href=\"/paper-a\">the paper</a>.</p></article>");
  const paragraphAnchorText = await htmlIdentity("<article><p>Read <a href=\"/paper-a\">the specification</a>.</p></article>");
  assert.notEqual(paragraphAnchorA.diagnostics.normalizedBlocksHash, paragraphAnchorText.diagnostics.normalizedBlocksHash, "visible paragraph anchor text remains block evidence");
  assert.notEqual(paragraphAnchorA.normalizedContentHash, paragraphAnchorText.normalizedContentHash, "visible paragraph anchor text changes v3 content identity");
  const paragraphAnchorHref = await htmlIdentity("<article><p>Read <a href=\"/paper-b\">the paper</a>.</p></article>");
  assert.equal(paragraphAnchorA.diagnostics.normalizedBlocksHash, paragraphAnchorHref.diagnostics.normalizedBlocksHash, "href-only paragraph changes preserve block identity");
  assert.equal(paragraphAnchorA.normalizedContentHash, paragraphAnchorHref.normalizedContentHash, "href-only paragraph changes preserve v3 content identity");
  assert.notEqual(paragraphAnchorA.diagnostics.normalizedLinksHash, paragraphAnchorHref.diagnostics.normalizedLinksHash, "href-only paragraph changes remain reference-observable");

  const listAnchorA = await htmlIdentity("<article><ul><li>Read <a href=\"/paper-a\">the paper</a>.</li></ul></article>");
  const listAnchorText = await htmlIdentity("<article><ul><li>Read <a href=\"/paper-a\">the specification</a>.</li></ul></article>");
  assert.notEqual(listAnchorA.normalizedContentHash, listAnchorText.normalizedContentHash, "visible list-item anchor text changes v3 content identity");

  const relative = await htmlIdentity(linkFixture('<a href="../evidence?b=2&a=1#fragment">Relative</a>'));
  const absolute = await htmlIdentity(linkFixture('<a href="https://example.test/evidence?a=1&b=2">Relative</a>'));
  assert.equal(relative.diagnostics.normalizedLinksHash, absolute.diagnostics.normalizedLinksHash);
  const differentRelative = await htmlIdentity(linkFixture('<a href="../different?a=1&b=2">Relative</a>'));
  assert.notEqual(relative.diagnostics.normalizedLinksHash, differentRelative.diagnostics.normalizedLinksHash);
}

function anthropicShapedFixture(links: string, shell = ""): string {
  const blocks = [
    "<h1>Synthetic protocol evidence</h1>",
    ...Array.from({ length: 5 }, (_, index) => `<p>Stable evidence paragraph ${index + 1}.</p>`),
    "<h2>Synthetic section two</h2>",
    ...Array.from({ length: 5 }, (_, index) => `<p>Stable evidence paragraph ${index + 6}.</p>`),
    "<h2>Synthetic section three</h2>",
    ...Array.from({ length: 5 }, (_, index) => `<p>Stable evidence paragraph ${index + 11}.</p>`),
    "<h2>Synthetic section four</h2>",
    ...Array.from({ length: 4 }, (_, index) => `<p>Stable evidence paragraph ${index + 16}.</p>`),
  ];
  return `<html><head><title>Synthetic protocol evidence</title><meta name="author" content="Test fixture"><meta name="description" content="Privacy-safe regression fixture">${shell}</head><body><article>${blocks.join("")}<div>${links}</div></article></body></html>`;
}

async function anthropicRegressionTests(): Promise<void> {
  const destinations = Array.from({ length: 8 }, (_, index) => ({
    href: `https://fixture.test/resource/${index + 1}?evidence=${index + 1}`,
    text: `Reference ${index + 1}`,
  }));
  const linksA = destinations.map(({ href, text }) => `<a href="${href}">${text}</a>`).join(" ");
  const linksB = [...destinations].reverse().map(({ href, text }, index) => {
    const separator = href.includes("?") ? "&" : "?";
    return `<a href="${href}${separator}utm_campaign=volatile#request-${index}"> ${text} </a>`;
  }).join(" ");
  const first = await htmlIdentity(anthropicShapedFixture(linksA, '<script nonce="one">requestId="one"</script>'));
  const second = await htmlIdentity(anthropicShapedFixture(linksB, '<script nonce="two">requestId="two"</script>'));
  assert.equal(first.normalizedContentHash, second.normalizedContentHash);
  assert.deepEqual(first.diagnostics, second.diagnostics);
  assert.deepEqual(
    { blocks: first.diagnostics.blockCount, links: first.diagnostics.linkCount, headings: first.diagnostics.headingCount },
    { blocks: 23, links: 8, headings: 4 },
  );
  assert.equal(first.diagnostics.extractionContainer, "article");
  assert.equal(first.diagnostics.extractionTruncated, false);
}

async function versionSeparationAndReuseTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const canonicalUrl = "https://example.test/v2-version-separation";
    const canonicalUrlHash = await sha256(canonicalUrl);
    const sourceDocumentId = `source-${canonicalUrlHash}`;
    const bodyA = linkFixture('<a href="/evidence?utm_source=one#first">Evidence</a>');
    const bodyB = bodyA.replace("</head>", '<script nonce="different">requestId="different"</script></head>')
      .replace("utm_source=one#first", "utm_medium=two#second");
    const normalized = await htmlIdentity(bodyA, canonicalUrl);
    database.sqlite.prepare(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode, current_version_id)
      VALUES (?, ?, ?, 'html', 'admitted', 'metadata_only', 'historical-v1-version')
    `).run(sourceDocumentId, canonicalUrl, canonicalUrlHash);
    database.sqlite.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, transport_hash, normalized_content_hash,
         hash_semantics_version, retrieved_url, retrieved_at, extraction_status, extraction_version)
      VALUES ('historical-v1-version', ?, ?, ?, ?, 'normalized_content_v1', ?, '2026-08-01T00:00:00Z', 'metadata_only', 'source-normalized-html-v1')
    `).run(sourceDocumentId, "1".repeat(64), "1".repeat(64), normalized.normalizedContentHash, canonicalUrl);
    const historicalBefore = database.sqlite.prepare("SELECT * FROM source_document_versions WHERE id = 'historical-v1-version'").get();
    const rawStore = { put: async () => undefined, delete: async () => undefined } as unknown as Pick<R2Bucket, "put" | "delete">;
    const capture = (body: string) => captureAdmittedSource({ DB: database.asD1(), RAW_STORE: rawStore }, {
      canonicalUrl,
      retrievedUrl: canonicalUrl,
      contentType: "text/html",
      body,
      extraction: extractHtmlDocument(body),
      mediaKind: "html",
      admissionState: "admitted",
      copyrightStorageMode: "metadata_only",
      httpStatus: 200,
    });
    const first = await capture(bodyA);
    const second = await capture(bodyB);
    const referenceOnly = await capture(bodyB.replace("/evidence", "/different"));
    assert.notEqual(first.sourceDocumentVersionId, "historical-v1-version");
    assert.match(first.sourceDocumentVersionId, /-normalized_content_v3-/);
    assert.equal(second.sourceDocumentVersionId, first.sourceDocumentVersionId);
    assert.equal(second.observationClassification, "transport_only_drift");
    assert.equal(referenceOnly.sourceDocumentVersionId, first.sourceDocumentVersionId);
    assert.equal(referenceOnly.observationClassification, "reference_only_drift");
    assert.notEqual(first.transportHash, second.transportHash);
    assert.equal(first.normalizedContentHash, second.normalizedContentHash);
    assert.deepEqual(database.sqlite.prepare("SELECT * FROM source_document_versions WHERE id = 'historical-v1-version'").get(), historicalBefore);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM source_document_versions").get()?.count, 2);
    const observations = database.sqlite.prepare(`
      SELECT hash_semantics_version, extraction_version, normalization_policy_version
      FROM source_document_version_observations
      WHERE source_document_version_id = ? ORDER BY id
    `).all(first.sourceDocumentVersionId);
    assert.equal(observations.length, 3);
    assert.ok(observations.every((row) => row.hash_semantics_version === "normalized_content_v3"));
    assert.ok(observations.every((row) => row.extraction_version === "source-normalized-html-v3"));
    assert.ok(observations.every((row) => row.normalization_policy_version === "source-normalized-html-v3"));
  } finally {
    database.close();
  }
}

async function observationChronologyTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const rawStore = { put: async () => undefined, delete: async () => undefined } as unknown as Pick<R2Bucket, "put" | "delete">;
    const canonicalUrl = "https://example.test/observation-chronology";
    const capture = (body: string, retrievedAt: string, transportHash: string) => captureAdmittedSource({ DB: database.asD1(), RAW_STORE: rawStore }, {
      canonicalUrl,
      retrievedUrl: canonicalUrl,
      contentType: "text/html",
      body,
      extraction: extractHtmlDocument(body),
      mediaKind: "html",
      admissionState: "admitted",
      copyrightStorageMode: "metadata_only",
      httpStatus: 200,
      retrievedAt,
      transportHash,
    });
    const paperA = "<article><p>Read <a href=\"/paper-a\">the paper</a>.</p></article>";
    const paperB = "<article><p>Read <a href=\"/paper-b\">the paper</a>.</p></article>";
    await capture(paperA, "2026-08-10T00:00:01Z", "1".repeat(64));
    await capture(paperB, "2026-08-10T00:00:03Z", "0".repeat(64));
    database.sqlite.exec("UPDATE source_document_version_observations SET created_at = '2026-08-10 00:00:00'");
    const latestByRetrievedAt = await capture(paperA, "2026-08-10T00:00:02Z", "f".repeat(64));
    assert.equal(latestByRetrievedAt.observationClassification, "reference_only_drift", "classification uses the latest retrieved observation, not hash-derived observation ID order");
    const retrievedOrder = database.sqlite.prepare(`
      SELECT retrieved_at FROM source_document_version_observations
      ORDER BY julianday(retrieved_at) DESC, retrieved_at DESC, id DESC
    `).all().map((row) => row.retrieved_at);
    assert.deepEqual(retrievedOrder, ["2026-08-10T00:00:03Z", "2026-08-10T00:00:02Z", "2026-08-10T00:00:01Z"]);
  } finally {
    database.close();
  }
}

async function planPolicyBindingTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const env = { DB: database.asD1(), RAW_STORE: { put: async () => undefined, delete: async () => undefined }, TRACE_ENVIRONMENT: "preview" } as any;
    const inventory = {
      schemaVersion: "kc-11a-v1",
      generatedAt: "2026-08-02T00:00:00Z",
      categories: { source_url: [{ id: "fixture", url: "https://example.test/fixture" }] },
    };
    const inventoryIdentity = await sha256(canonicalJson(inventory));
    const snapshotJson = canonicalJson(inventory);
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_inventory_snapshots
        (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by)
      VALUES ('historical-v1-snapshot', 'kc-11a-v1', ?, ?, 'kc-11c-v1', 'historical-reviewer')
    `).run(inventoryIdentity, snapshotJson);
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_inventory_authority
        (id, snapshot_id, schema_version, policy_version, decision, actor, idempotency_key, correlation_id)
      VALUES ('historical-v1-authority', 'historical-v1-snapshot', 'kc-11a-v1', 'kc-11c-v1', 'authorised', 'historical-reviewer', 'historical-v1-authority-key', 'historical-v1-correlation')
    `).run();
    await assert.rejects(() => loadCurrentBackfillInventory(env, "historical-v1-snapshot"), /not currently authorised/);

    const authority = await establishAuthoritativeInventory(env, inventory, "kc-11c-v3", "reviewer@example.test", "v3-authority-key");
    assert.equal(authority.snapshotId, "historical-v1-snapshot", "immutable inventory bytes may be reused without reusing their authority decision");
    const authorityPolicies = database.sqlite.prepare("SELECT policy_version FROM knowledge_source_backfill_inventory_authority ORDER BY generation").all();
    assert.deepEqual(authorityPolicies.map((row) => row.policy_version), ["kc-11c-v1", "kc-11c-v3"]);

    const plan = await buildBackfillPlan(inventory, { recordIds: ["fixture"], limit: 1 }, authority.snapshotId);
    assert.equal(plan.planVersion, "kc-11c-v3");
    assert.equal(plan.sourceHashSemanticsVersion, "normalized_content_v3");
    assert.deepEqual(plan.normalizationPolicyVersions, SOURCE_NORMALIZATION_POLICY_VERSIONS);
    assert.equal(await verifyPlanHash(plan, plan.planHash), true);

    const { planHash: _ignored, ...unsignedV2 } = plan;
    const legacyUnsigned = {
      ...unsignedV2,
      planVersion: "kc-11c-v1",
      sourceHashSemanticsVersion: "normalized_content_v1",
      normalizationPolicyVersions: Object.fromEntries(Object.keys(SOURCE_NORMALIZATION_POLICY_VERSIONS)
        .map((key) => [key, `source-normalized-${key}-v1`])),
    };
    const legacyHash = await sha256(canonicalJson(legacyUnsigned));
    const legacyPlan = { ...legacyUnsigned, planHash: legacyHash };
    assert.notEqual(legacyHash, plan.planHash);
    assert.equal(await verifyPlanHash(legacyPlan as any, legacyHash), false);
    await assert.rejects(
      () => approveBackfillPlan(env, legacyPlan as any, legacyHash, "publisher@example.test", "legacy-plan-approval"),
      /Plan hash does not match/,
    );
  } finally {
    database.close();
  }
}

function schemaObjects(database: SQLiteD1): string[] {
  const tables = [
    "source_document_versions",
    "source_document_version_observations",
    "knowledge_source_backfill_items",
    "knowledge_source_backfill_inventory_snapshots",
    "knowledge_source_backfill_inventory_authority",
  ];
  const placeholders = tables.map(() => "?").join(",");
  return database.sqlite.prepare(`
    SELECT type || ':' || name AS identity FROM sqlite_master
    WHERE (tbl_name IN (${placeholders}) AND type IN ('index','trigger'))
       OR name = 'knowledge_source_backfill_current_inventory_authority'
    ORDER BY identity
  `).all(...tables).map((row) => String(row.identity));
}

function incomingForeignKeys(database: SQLiteD1): string[] {
  const targets = new Set(["source_document_versions", "source_document_version_observations", "knowledge_source_backfill_items"]);
  const result: string[] = [];
  const tables = database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
  for (const { name } of tables) {
    const identifier = String(name).replaceAll('"', '""');
    for (const foreignKey of database.sqlite.prepare(`PRAGMA foreign_key_list("${identifier}")`).all()) {
      if (targets.has(String(foreignKey.table))) result.push(canonicalJson({ child: name, ...foreignKey }));
    }
  }
  return result.sort();
}

function rows(database: SQLiteD1, table: string, order: string): unknown[] {
  return database.sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
}

function rejectsSql(database: SQLiteD1, sql: string): void {
  assert.throws(() => database.sqlite.prepare(sql).run());
}

function migrationPreservationTests(): void {
  const database = new SQLiteD1(true, true, false);
  try {
    database.sqlite.exec("PRAGMA foreign_keys = ON");
    database.sqlite.exec(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode, current_version_id)
      VALUES ('migration-document', 'https://example.test/migration', 'migration-url-hash', 'html', 'admitted', 'metadata_only', 'migration-v1-version');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('migration-legacy-version', 'migration-document', '${"0".repeat(64)}', 'https://example.test/migration', '2026-08-01T00:00:00Z', 'metadata_only');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, transport_hash, normalized_content_hash, hash_semantics_version,
         retrieved_url, retrieved_at, extraction_status, extraction_version)
      VALUES ('migration-v1-version', 'migration-document', '${"1".repeat(64)}', '${"1".repeat(64)}', '${"2".repeat(64)}',
              'normalized_content_v1', 'https://example.test/migration', '2026-08-01T01:00:00Z', 'metadata_only', 'source-normalized-html-v1');
      INSERT INTO source_document_version_observations
        (id, source_document_version_id, transport_hash, normalized_content_hash, hash_semantics_version,
         retrieved_url, retrieved_at, extraction_version, normalized_metadata_hash, normalized_blocks_hash,
         normalized_links_hash, normalized_structure_hash, block_count, link_count, heading_count,
         extraction_container, extraction_truncated, normalization_policy_version)
      VALUES ('migration-v1-observation', 'migration-v1-version', '${"1".repeat(64)}', '${"2".repeat(64)}',
              'normalized_content_v1', 'https://example.test/migration', '2026-08-01T01:00:00Z', 'source-normalized-html-v1',
              '${"3".repeat(64)}', '${"4".repeat(64)}', '${"5".repeat(64)}', '${"6".repeat(64)}', 23, 8, 4, 'article', 0, 'source-normalized-html-v1');
      INSERT INTO knowledge_source_backfill_batches
        (id, environment, inventory_schema_version, inventory_identity, plan_hash, plan_json,
         selection_json, ceilings_json, state, correlation_id)
      VALUES ('migration-batch', 'preview', 'kc-11a-v1', 'migration-inventory', 'migration-plan-hash',
              '{"inventorySnapshotId":"migration-v1-snapshot"}', '{}', '{}', 'completed', 'migration-correlation');
      INSERT INTO knowledge_source_backfill_items
        (id, batch_id, inventory_record_id, category, canonical_url, source_document_id,
         source_document_version_id, outcome, reason_code, content_hash, transport_hash,
         normalized_content_hash, hash_semantics_version, correlation_id, idempotency_key, actor)
      VALUES ('migration-v1-item', 'migration-batch', 'migration-record', 'source_url', 'https://example.test/migration',
              'migration-document', 'migration-v1-version', 'metadata_only', 'captured_admitted_source',
              '${"1".repeat(64)}', '${"1".repeat(64)}', '${"2".repeat(64)}', 'normalized_content_v1',
              'migration-correlation', 'migration-item-key', 'migration-actor');
      INSERT INTO knowledge_source_backfill_item_events
        (id, batch_id, item_id, outcome, reason_code, metadata_json, actor, correlation_id)
      VALUES ('migration-v1-event', 'migration-batch', 'migration-v1-item', 'metadata_only', 'captured_admitted_source', '{}', 'migration-actor', 'migration-correlation');
      INSERT INTO knowledge_source_backfill_inventory_snapshots
        (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by)
      VALUES ('migration-v1-snapshot', 'kc-11a-v1', 'migration-inventory', '{}', 'kc-11c-v1', 'migration-actor');
      INSERT INTO knowledge_source_backfill_inventory_authority
        (id, snapshot_id, schema_version, policy_version, decision, actor, idempotency_key, correlation_id)
      VALUES ('migration-v1-authority', 'migration-v1-snapshot', 'kc-11a-v1', 'kc-11c-v1', 'authorised', 'migration-actor', 'migration-authority-key', 'migration-correlation');
    `);
    const preservedTables = [
      ["source_document_versions", "id"],
      ["source_document_version_observations", "id"],
      ["knowledge_source_backfill_items", "id"],
      ["knowledge_source_backfill_inventory_snapshots", "id"],
      ["knowledge_source_backfill_inventory_authority", "generation"],
    ] as const;
    const beforeRows = Object.fromEntries(preservedTables.map(([table, order]) => [table, rows(database, table, order)]));
    const beforeObjects = schemaObjects(database);
    const beforeForeignKeys = incomingForeignKeys(database);

    database.sqlite.exec(readFileSync("db/migration-0061-normalized-content-v2.sql", "utf8"));

    for (const [table, order] of preservedTables) assert.deepEqual(rows(database, table, order), beforeRows[table], `${table} historical rows are preserved exactly`);
    assert.deepEqual(schemaObjects(database), beforeObjects, "all associated indexes, triggers, and the authority view are preserved");
    assert.deepEqual(incomingForeignKeys(database), beforeForeignKeys, "all incoming foreign-key definitions are preserved");
    assert.equal(database.sqlite.prepare("SELECT authority_decision_id FROM knowledge_source_backfill_current_inventory_authority").get()?.authority_decision_id, "migration-v1-authority");

    const beforeV3Rows = Object.fromEntries(preservedTables.map(([table, order]) => [table, rows(database, table, order)]));
    const beforeV3Objects = schemaObjects(database);
    const beforeV3ForeignKeys = incomingForeignKeys(database);
    database.sqlite.exec(readFileSync("db/migration-0062-normalized-content-v3-reference-drift.sql", "utf8"));
    for (const [table, order] of preservedTables) assert.deepEqual(rows(database, table, order), beforeV3Rows[table], `${table} v1/v2 rows are preserved exactly by v3 migration`);
    assert.deepEqual(schemaObjects(database), beforeV3Objects, "v3 migration preserves associated indexes, triggers, and authority view");
    assert.deepEqual(incomingForeignKeys(database), beforeV3ForeignKeys, "v3 migration preserves incoming foreign-key definitions");

    database.sqlite.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, transport_hash, normalized_content_hash, hash_semantics_version,
         retrieved_url, retrieved_at, extraction_status, extraction_version)
      VALUES ('migration-v2-version', 'migration-document', ?, ?, ?, 'normalized_content_v2',
              'https://example.test/migration', '2026-08-02T00:00:00Z', 'metadata_only', 'source-normalized-html-v2')
    `).run("7".repeat(64), "7".repeat(64), "8".repeat(64));
    database.sqlite.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, transport_hash, normalized_content_hash, hash_semantics_version,
         retrieved_url, retrieved_at, extraction_status, extraction_version)
      VALUES ('migration-v3-version', 'migration-document', ?, ?, ?, 'normalized_content_v3',
              'https://example.test/migration', '2026-08-03T00:00:00Z', 'metadata_only', 'source-normalized-html-v3')
    `).run("9".repeat(64), "9".repeat(64), "a".repeat(64));
    database.sqlite.prepare(`
      INSERT INTO source_document_version_observations
        (id, source_document_version_id, transport_hash, normalized_content_hash, hash_semantics_version,
         retrieved_url, retrieved_at, extraction_version, normalization_policy_version)
      VALUES ('migration-v2-observation', 'migration-v2-version', ?, ?, 'normalized_content_v2',
              'https://example.test/migration', '2026-08-02T00:00:00Z', 'source-normalized-html-v2', 'source-normalized-html-v2')
    `).run("7".repeat(64), "8".repeat(64));
    database.sqlite.prepare(`
      INSERT INTO source_document_version_observations
        (id, source_document_version_id, transport_hash, normalized_content_hash, hash_semantics_version,
         retrieved_url, retrieved_at, extraction_version, normalization_policy_version)
      VALUES ('migration-v3-observation', 'migration-v3-version', ?, ?, 'normalized_content_v3',
              'https://example.test/migration', '2026-08-03T00:00:00Z', 'source-normalized-html-v3', 'source-normalized-html-v3')
    `).run("9".repeat(64), "a".repeat(64));
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_items
        (id, batch_id, inventory_record_id, category, outcome, hash_semantics_version,
         correlation_id, idempotency_key, actor)
      VALUES ('migration-v2-item', 'migration-batch', 'migration-v2-record', 'source_url', 'planned',
              'normalized_content_v2', 'migration-correlation', 'migration-v2-item-key', 'migration-actor')
    `).run();
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_items
        (id, batch_id, inventory_record_id, category, outcome, hash_semantics_version,
         correlation_id, idempotency_key, actor)
      VALUES ('migration-v3-item', 'migration-batch', 'migration-v3-record', 'source_url', 'planned',
              'normalized_content_v3', 'migration-correlation', 'migration-v3-item-key', 'migration-actor')
    `).run();
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_items
        (id, batch_id, inventory_record_id, category, outcome, correlation_id, idempotency_key, actor)
      VALUES ('migration-legacy-item', 'migration-batch', 'migration-legacy-record', 'source_url', 'planned',
              'migration-correlation', 'migration-legacy-item-key', 'migration-actor')
    `).run();
    assert.deepEqual(database.sqlite.prepare("SELECT DISTINCT hash_semantics_version FROM source_document_versions ORDER BY hash_semantics_version").all().map((row) => row.hash_semantics_version), ["legacy_raw_v1", "normalized_content_v1", "normalized_content_v2", "normalized_content_v3"]);
    assert.deepEqual(database.sqlite.prepare("SELECT DISTINCT hash_semantics_version FROM source_document_version_observations ORDER BY hash_semantics_version").all().map((row) => row.hash_semantics_version), ["normalized_content_v1", "normalized_content_v2", "normalized_content_v3"]);
    assert.deepEqual(database.sqlite.prepare("SELECT DISTINCT hash_semantics_version FROM knowledge_source_backfill_items ORDER BY hash_semantics_version").all().map((row) => row.hash_semantics_version), ["legacy_raw_v1", "normalized_content_v1", "normalized_content_v2", "normalized_content_v3"]);

    rejectsSql(database, `INSERT INTO source_document_versions (id, source_document_id, content_hash, hash_semantics_version, retrieved_url, retrieved_at) VALUES ('bad-version', 'migration-document', 'bad-version-hash', 'unknown', 'https://example.test', '2026-08-02')`);
    rejectsSql(database, `INSERT INTO source_document_version_observations (id, source_document_version_id, transport_hash, normalized_content_hash, hash_semantics_version, retrieved_url, retrieved_at, extraction_version) VALUES ('bad-observation', 'migration-v2-version', 'bad-observation-transport', 'bad-observation-normalized', 'unknown', 'https://example.test', '2026-08-02', 'bad')`);
    rejectsSql(database, `INSERT INTO source_document_version_observations (id, source_document_version_id, transport_hash, normalized_content_hash, hash_semantics_version, retrieved_url, retrieved_at, extraction_version) VALUES ('legacy-observation', 'migration-v2-version', 'legacy-observation-transport', 'legacy-observation-normalized', 'legacy_raw_v1', 'https://example.test', '2026-08-02', 'bad')`);
    rejectsSql(database, `INSERT INTO knowledge_source_backfill_items (id, batch_id, inventory_record_id, category, outcome, hash_semantics_version, correlation_id, idempotency_key, actor) VALUES ('bad-item', 'migration-batch', 'bad-item-record', 'source_url', 'planned', 'unknown', 'migration-correlation', 'bad-item-key', 'migration-actor')`);

    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_inventory_snapshots
        (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by)
      VALUES ('migration-v2-snapshot', 'kc-11a-v1', 'migration-inventory-v2', '{}', 'kc-11c-v2', 'migration-actor')
    `).run();
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_inventory_authority
        (id, snapshot_id, schema_version, policy_version, decision, actor, idempotency_key, correlation_id)
      VALUES ('migration-v2-authority', 'migration-v2-snapshot', 'kc-11a-v1', 'kc-11c-v2', 'authorised', 'migration-actor', 'migration-v2-authority-key', 'migration-correlation')
    `).run();
    database.sqlite.prepare(`
      INSERT INTO knowledge_source_backfill_inventory_snapshots
        (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by)
      VALUES ('migration-v3-snapshot', 'kc-11a-v1', 'migration-inventory-v3', '{}', 'kc-11c-v3', 'migration-actor')
    `).run();
    rejectsSql(database, `INSERT INTO knowledge_source_backfill_inventory_snapshots (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by) VALUES ('bad-snapshot', 'kc-11a-v1', 'bad-inventory', '{}', 'kc-11c-v999', 'migration-actor')`);

    assert.throws(() => database.sqlite.prepare("DELETE FROM knowledge_source_backfill_items WHERE id = 'migration-v1-item'").run(), /backfill items are immutable/);
    assert.throws(() => database.sqlite.prepare("UPDATE knowledge_source_backfill_inventory_snapshots SET active = 0 WHERE id = 'migration-v1-snapshot'").run(), /inventory snapshots are immutable/);
    assert.throws(() => database.sqlite.prepare("DELETE FROM knowledge_source_backfill_inventory_authority WHERE id = 'migration-v1-authority'").run(), /append-only/);
    assert.equal(database.sqlite.prepare("PRAGMA quick_check").get()?.quick_check, "ok");
    assert.deepEqual(database.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
}

await canonicalLinkPolicyTests();
await anthropicRegressionTests();
await versionSeparationAndReuseTests();
await observationChronologyTests();
await planPolicyBindingTests();
migrationPreservationTests();
console.log("normalized_content_v3 identity, reference drift, plan, authority, and v1/v2 preservation tests passed");
