import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import {
  getClaimExtractionRun,
  listClaimExtractionRuns,
} from "../src/lib/server/claim-extraction-audit";
import {
  extractClaimsFromItem,
  runClaimExtraction,
} from "../workers/ingestion/extract-claims";
import { writeCanonicalClaim } from "../src/lib/server/canonical-claim-write";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { authorisedRoute } from "../src/pages/api/admin/[...path]";

const SECRET = "e".repeat(32);
const SOURCE_ID = 8801;
const CLUSTER_ID = 8802;
const FIRST_ITEM_ID = 8803;
const RUN_REQUEST_ID = "88000000-0000-4000-8000-000000000001";

function timestampMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

function seedSourceAndCluster(database: SQLiteD1): void {
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (${SOURCE_ID}, 'Run ledger source', 'https://ledger.example', 'A', 'A', 'primary-technical', 'rss');
    INSERT INTO story_clusters (id, title, publication_status, evidence_status)
    VALUES (${CLUSTER_ID}, 'Run ledger story', 'published', 'strongly_supported');
  `);
}

function insertItem(database: SQLiteD1, id: number, index: number, content: string): void {
  database.sqlite.prepare(`
    INSERT INTO feed_items
      (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published')
  `).run(
    id,
    SOURCE_ID,
    `https://ledger.example/item-${id}`,
    `ledger-item-hash-${id}`,
    `Ledger item ${id}`,
    content,
    timestampMinutesAgo(index),
  );
  database.sqlite.prepare(`
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
    VALUES (?, ?, ?)
  `).run(CLUSTER_ID, id, index === 0 ? 1 : 0);
}

function seedEligibleFixture(database: SQLiteD1, count = 52): void {
  seedSourceAndCluster(database);
  for (let index = 0; index < count; index++) {
    const id = FIRST_ITEM_ID + index;
    const content = index === 0
      ? "OpenAI announced a new model called Trace."
      : index === 2
        ? "OpenAI announced a new model called Reused."
        : "This ordinary editorial note has no deterministic claim pattern.";
    insertItem(database, id, index, content);
  }
}

function seedSingleItem(database: SQLiteD1, content: string): void {
  seedSourceAndCluster(database);
  insertItem(database, FIRST_ITEM_ID, 0, content);
}

async function preseedReuse(database: SQLiteD1): Promise<void> {
  const row = database.sqlite.prepare("SELECT * FROM feed_items WHERE id = ?").get(FIRST_ITEM_ID) as Record<string, unknown>;
  const item = row as unknown as Parameters<typeof extractClaimsFromItem>[0];
  const claim = extractClaimsFromItem(item, "A", "primary-technical")[0];
  assert.ok(claim, "the reuse fixture must produce one deterministic claim");
  const written = await writeCanonicalClaim(database.asD1(), {
    feedItemId: FIRST_ITEM_ID,
    clusterId: CLUSTER_ID,
    sourceId: SOURCE_ID,
    sourceUrl: String(row.url),
    sourceUrlHash: String(row.url_hash),
    title: String(row.title),
    author: null,
    publishedAt: null,
    content: String(row.content_excerpt),
    claimText: claim.claimText,
    claimClass: claim.claimClass,
    claimDomain: claim.claimDomain,
    materiality: "high",
    confidence: claim.confidenceScore,
    extractionMethod: "rule_based",
    extractionVersion: "rule-extraction-v1",
  });
  assert.equal(written.inserted, true);
}

function makeEnvironment(database: SQLiteD1): Env {
  return {
    DB: database.asD1(),
    RAW_STORE: {} as R2Bucket,
    TRACE_INTERNAL_SERVICE_SECRET: SECRET,
  } as Env;
}

async function signedRequest(method: string, path: string, role: "reader" | "publisher", body = ""): Promise<Request> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const operator = `${role}@example.test`;
  const signature = await signInternalRequest(SECRET, method, path, body, {
    operator,
    role,
    timestamp,
    nonce,
  });
  const headers = new Headers({
    "X-Trace-Internal-Version": "v1",
    "X-Trace-Operator": operator,
    "X-Trace-Role": role,
    "X-Trace-Timestamp": timestamp,
    "X-Trace-Nonce": nonce,
    "X-Trace-Signature": signature,
  });
  if (method !== "GET") headers.set("Content-Type", "application/json");
  return new Request(`https://worker.example${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
  });
}

async function durableLedgerRunTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedEligibleFixture(database);
    await preseedReuse(database);
    const result = await runClaimExtraction(database.asD1(), undefined, {
      trigger: "manual_admin",
      requestId: RUN_REQUEST_ID,
      operatorEmail: "publisher@example.test",
      operatorRole: "publisher",
    });

    assert.match(result.runId, /^[0-9a-f-]{36}$/i);
    assert.equal(result.requestId, RUN_REQUEST_ID);
    assert.equal(result.runStatus, "completed");
    assert.equal(result.selectedCount, 50, "the current bounded selection remains exactly 50");
    assert.equal(result.processedCount, 50);
    assert.equal(result.noClaimCount, 48, "the two claim-bearing selected items are terminal extracted items");
    assert.equal(result.failedCount, 0);
    assert.equal(result.extractedClaimCount, 2);
    assert.equal(result.newAssertionCount, 1, "the pre-existing first assertion is reused");
    assert.equal(result.canonicalWriteSuccessCount, 2);
    assert.equal(result.claimsExtracted, 1);
    assert.equal(result.evidenceCreated, 2, "legacy evidenceCreated is successful writer calls, not claim_evidence rows");

    const membership = database.sqlite.prepare(`
      SELECT feed_item_id, ordinal
      FROM claim_extraction_run_items
      WHERE run_id = ? ORDER BY ordinal
    `).all(result.runId) as Array<{ feed_item_id: number; ordinal: number }>;
    assert.equal(membership.length, 50);
    assert.deepEqual(membership.map((row) => row.feed_item_id),
      Array.from({ length: 50 }, (_, index) => FIRST_ITEM_ID + index),
      "the exact newest-first selection order is durable");
    assert.deepEqual(membership.map((row) => row.ordinal), Array.from({ length: 50 }, (_, index) => index));
    assert.equal(
      Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM claim_extraction_run_items WHERE run_id = ? AND feed_item_id = ?").get(result.runId, FIRST_ITEM_ID + 50)?.count),
      0,
      "the 51st eligible item is not silently inferred into the run");

    const detail = await getClaimExtractionRun(database.asD1(), result.runId);
    assert.equal(detail.items.length, 50);
    assert.equal(detail.itemsTruncated, false);
    assert.equal(detail.effectsTruncated, false);
    assert.deepEqual(detail.reconciliation, {
      selectedCount: 50,
      processedCount: 50,
      noClaimCount: 48,
      failedCount: 0,
      extractedClaimCount: 2,
      newAssertionCount: 1,
      canonicalWriteSuccessCount: 2,
      matchesStoredCounters: true,
    });

    const first = detail.items.find((item) => item.feedItemId === FIRST_ITEM_ID);
    assert.ok(first);
    assert.equal(first.outcome, "extracted");
    assert.equal(first.effects.length, 1);
    assert.equal(first.effects[0].attemptOutcome, "reused");
    assert.equal(first.effects[0].assertionInserted, false);
    assert.equal(first.effects[0].canonicalClaimInserted, false);
    assert.equal(first.effects[0].assertionId?.startsWith(`feed-claim-assertion-${FIRST_ITEM_ID}-`), true);

    const noClaim = detail.items.find((item) => item.feedItemId === FIRST_ITEM_ID + 1);
    assert.ok(noClaim);
    assert.equal(noClaim.outcome, "no_claims");
    assert.equal(noClaim.effects.length, 0);

    const inserted = detail.items.find((item) => item.feedItemId === FIRST_ITEM_ID + 3);
    assert.ok(inserted);
    assert.equal(inserted.effects.length, 0, "ordinary rows do not manufacture effects");
    const effectRows = database.sqlite.prepare(`
      SELECT feed_item_id, attempt_outcome, canonical_claim_id, assertion_id,
             canonical_claim_inserted, assertion_inserted
      FROM claim_extraction_run_effects WHERE run_id = ? ORDER BY feed_item_id
    `).all(result.runId) as Array<Record<string, unknown>>;
    assert.equal(effectRows.length, 2);
    const newEffect = effectRows.find((row) => Number(row.feed_item_id) === FIRST_ITEM_ID + 2);
    assert.ok(newEffect);
    assert.equal(newEffect.attempt_outcome, "inserted");
    assert.equal(newEffect.canonical_claim_inserted, 1);
    assert.equal(newEffect.assertion_inserted, 1);
    assert.match(String(newEffect.canonical_claim_id), /^feed-canonical-claim-/);
    assert.match(String(newEffect.assertion_id), /^feed-claim-assertion-/);
    assert.equal(
      Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM claim_evidence").get()?.count),
      0,
      "the ledger does not reintroduce frozen legacy evidence writes");

    const runRow = database.sqlite.prepare(`
      SELECT trigger, algorithm_version, request_id, operator_email, operator_role,
             status, selected_count, processed_count, no_claim_count, failed_count,
             extracted_claim_count, new_assertion_count, canonical_write_success_count
      FROM claim_extraction_runs WHERE id = ?
    `).get(result.runId) as Record<string, unknown>;
    assert.deepEqual({ ...runRow }, {
      trigger: "manual_admin",
      algorithm_version: "rule-extraction-v1",
      request_id: RUN_REQUEST_ID,
      operator_email: "publisher@example.test",
      operator_role: "publisher",
      status: "completed",
      selected_count: 50,
      processed_count: 50,
      no_claim_count: 48,
      failed_count: 0,
      extracted_claim_count: 2,
      new_assertion_count: 1,
      canonical_write_success_count: 2,
    });

    const schedulerRun = await runClaimExtraction(database.asD1(), undefined, { trigger: "scheduler" });
    assert.equal(schedulerRun.runStatus, "completed");
    assert.equal(schedulerRun.selectedCount, 2, "the common runner records scheduler selection through the same bounded path");
    assert.equal(schedulerRun.processedCount, 2);
    assert.equal(schedulerRun.noClaimCount, 2);
    const schedulerRow = database.sqlite.prepare(
      "SELECT trigger, operator_email, operator_role FROM claim_extraction_runs WHERE id = ?",
    ).get(schedulerRun.runId) as Record<string, unknown>;
    assert.deepEqual({ ...schedulerRow }, { trigger: "scheduler", operator_email: null, operator_role: null });
  } finally {
    database.close();
  }
}

async function failureAndPartialEffectTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedSingleItem(database, "OpenAI announced a new model called Partial. The model supports a context window of 128k tokens.");
    const originalBatch = database.batch.bind(database) as unknown as (statements: unknown[]) => Promise<D1Result[]>;
    let batchCalls = 0;
    const failingDatabase = database as unknown as { batch: D1Database["batch"] };
    failingDatabase.batch = (async (statements) => {
      batchCalls++;
      if (batchCalls === 3) throw new Error("simulated second canonical write failure");
      return originalBatch(statements as unknown[]);
    }) as D1Database["batch"];

    const result = await runClaimExtraction(database.asD1());
    assert.equal(result.selectedCount, 1);
    assert.equal(result.processedCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.runStatus, "completed_with_failures");
    assert.equal(result.extractedClaimCount, 2);
    assert.equal(result.newAssertionCount, 1);
    assert.equal(result.canonicalWriteSuccessCount, 1);

    const item = database.sqlite.prepare(`
      SELECT outcome, extracted_claim_count, new_assertion_count,
             canonical_write_success_count, failure_code, failure_message
      FROM claim_extraction_run_items WHERE run_id = ?
    `).get(result.runId) as Record<string, unknown>;
    assert.equal(item.outcome, "failed");
    assert.equal(item.extracted_claim_count, 2);
    assert.equal(item.new_assertion_count, 1);
    assert.equal(item.canonical_write_success_count, 1);
    assert.equal(item.failure_code, "canonical_write_failed");
    assert.match(String(item.failure_message), /simulated second canonical write failure/);

    const effects = database.sqlite.prepare(`
      SELECT attempt_outcome, assertion_inserted, failure_code, failure_message
      FROM claim_extraction_run_effects WHERE run_id = ? ORDER BY effect_ordinal
    `).all(result.runId) as Array<Record<string, unknown>>;
    assert.equal(effects.length, 2);
    assert.deepEqual(effects.map((effect) => effect.attempt_outcome), ["inserted", "failed"]);
    assert.equal(effects[0].assertion_inserted, 1);
    assert.equal(effects[1].failure_code, "canonical_write_failed");
    assert.match(String(effects[1].failure_message), /simulated second canonical write failure/);

    const detail = await getClaimExtractionRun(database.asD1(), result.runId);
    assert.equal(detail.reconciliation.matchesStoredCounters, true);
    assert.equal(detail.items[0].outcome, "failed");
    assert.equal(detail.items[0].effects[0].attemptOutcome, "inserted");
    assert.equal(detail.items[0].effects[1].attemptOutcome, "failed");
  } finally {
    database.close();
  }
}

async function routeAndBoundTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedSingleItem(database, "OpenAI announced a new model called Routed.");
    const env = makeEnvironment(database);
    const executionContext = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

    assert.equal(authorisedRoute("extraction-runs", "GET", "reader"), true);
    assert.equal(authorisedRoute("extraction-run", "GET", "publisher"), true);
    assert.equal(authorisedRoute("extraction-runs", "POST", "publisher"), false);
    assert.equal(authorisedRoute("extraction-run", "DELETE", "publisher"), false);

    const unsigned = await worker.fetch(new Request("https://worker.example/admin/extraction-runs"), env, executionContext);
    assert.equal(unsigned.status, 401);

    const readerExecute = await worker.fetch(await signedRequest("POST", "/admin/extract-claims", "reader", "{}"), env, executionContext);
    assert.equal(readerExecute.status, 403);
    const publisherExecute = await worker.fetch(await signedRequest("POST", "/admin/extract-claims", "publisher", "{}"), env, executionContext);
    assert.equal(publisherExecute.status, 200);
    const result = await publisherExecute.json() as {
      runId: string;
      requestId: string | null;
      runStatus: string;
      selectedCount: number;
      processedCount: number;
      newAssertionCount: number;
      canonicalWriteSuccessCount: number;
    };
    assert.match(result.runId, /^[0-9a-f-]{36}$/i);
    assert.match(String(result.requestId), /^[0-9a-f-]{36}$/i);
    assert.equal(result.runStatus, "completed");
    assert.equal(result.selectedCount, 1);
    assert.equal(result.processedCount, 1);
    assert.equal(result.newAssertionCount, 1);
    assert.equal(result.canonicalWriteSuccessCount, 1);

    const attributed = database.sqlite.prepare(`
      SELECT trigger, request_id, operator_email, operator_role, status
      FROM claim_extraction_runs WHERE id = ?
    `).get(result.runId) as Record<string, unknown>;
    assert.deepEqual({ ...attributed }, {
      trigger: "manual_admin",
      request_id: result.requestId,
      operator_email: "publisher@example.test",
      operator_role: "publisher",
      status: "completed",
    });

    const countsBefore = database.sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM claim_extraction_runs) AS runs,
        (SELECT COUNT(*) FROM claim_extraction_run_items) AS items,
        (SELECT COUNT(*) FROM claim_extraction_run_effects) AS effects
    `).get() as Record<string, unknown>;
    const listResponse = await worker.fetch(await signedRequest("GET", "/admin/extraction-runs", "reader"), env, executionContext);
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json() as { runs: Array<Record<string, unknown>>; limit: number; truncated: boolean };
    assert.equal(list.runs.length, 1);
    assert.equal(list.limit, 50);
    assert.equal(list.truncated, false);
    assert.equal(list.runs[0].requestId, result.requestId);
    assert.doesNotMatch(JSON.stringify(list), /signature|nonce|fingerprint/i);

    const detailResponse = await worker.fetch(await signedRequest("GET", `/admin/extraction-run?runId=${result.runId}`, "reader"), env, executionContext);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as { run: { runId: string }; reconciliation: { matchesStoredCounters: boolean }; items: unknown[] };
    assert.equal(detail.run.runId, result.runId);
    assert.equal(detail.reconciliation.matchesStoredCounters, true);
    assert.equal(detail.items.length, 1);

    const invalid = await worker.fetch(await signedRequest("GET", "/admin/extraction-run?runId=invalid", "reader"), env, executionContext);
    assert.equal(invalid.status, 400);
    const missing = await worker.fetch(await signedRequest("GET", `/admin/extraction-run?runId=${crypto.randomUUID()}`, "reader"), env, executionContext);
    assert.equal(missing.status, 404);

    const countsAfter = database.sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM claim_extraction_runs) AS runs,
        (SELECT COUNT(*) FROM claim_extraction_run_items) AS items,
        (SELECT COUNT(*) FROM claim_extraction_run_effects) AS effects
    `).get() as Record<string, unknown>;
    assert.deepEqual(countsAfter, countsBefore, "read routes do not write ledger facts");

    for (let index = 0; index < 51; index++) {
      database.sqlite.prepare(`
        INSERT INTO claim_extraction_runs (id, trigger, algorithm_version, started_at)
        VALUES (?, 'scheduler', 'rule-extraction-v1', ?)
      `).run(crypto.randomUUID(), timestampMinutesAgo(index + 1));
    }
    const bounded = await listClaimExtractionRuns(database.asD1());
    assert.equal(bounded.runs.length, 50);
    assert.equal(bounded.limit, 50);
    assert.equal(bounded.truncated, true);
    assert.ok(bounded.runs.every((run) => run.trigger === "scheduler" || run.trigger === "manual_admin"));
  } finally {
    database.close();
  }
}

function schemaAndUiCharacterizationTests(): void {
  const database = new SQLiteD1();
  try {
    const tables = database.sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'claim_extraction_run%'
      ORDER BY name
    `).all() as Array<{ name: string }>;
    assert.deepEqual(tables.map((row) => row.name), [
      "claim_extraction_run_effects",
      "claim_extraction_run_items",
      "claim_extraction_runs",
    ]);
    const indexes = database.sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_claim_extraction%'
    `).all() as Array<{ name: string }>;
    assert.ok(indexes.some((row) => row.name === "idx_claim_extraction_runs_started"));
    assert.ok(indexes.some((row) => row.name === "idx_claim_extraction_run_items_run_order"));
    assert.ok(indexes.some((row) => row.name === "idx_claim_extraction_run_effects_run"));
  } finally {
    database.close();
  }

  const page = readFileSync("src/pages/admin/extract-claims.astro", "utf8");
  const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8");
  const runner = readFileSync("workers/ingestion/extract-claims.ts", "utf8");
  const workerSource = readFileSync("workers/ingestion/index.ts", "utf8");
  const proxy = readFileSync("src/pages/api/admin/[...path].ts", "utf8");
  assert.match(page, /Recent extraction runs/);
  assert.ok(page.includes("/api/admin/extraction-runs"));
  assert.ok(page.includes("/api/admin/extraction-run?runId="));
  assert.match(page, /recentRunsDisclosure\?\.addEventListener\("toggle"/);
  assert.match(page, /new assertions/);
  assert.match(page, /canonical-writer calls/);
  assert.match(page, /No-claim items/);
  assert.match(page, /completed with failures/);
  assert.match(page, /Run did not record normal completion/);
  assert.doesNotMatch(page, /setInterval|setTimeout/);
  assert.match(runner, /persistSelectedItems/);
  assert.match(runner, /trigger: ClaimExtractionRunTrigger/);
  assert.match(runner, /claim_extraction_run_effects/);
  assert.doesNotMatch(reviewPage, /extraction-runs|extraction-run/);
  assert.match(workerSource, /"\/admin\/extraction-runs"/);
  assert.match(workerSource, /trigger: "scheduler"/);
  assert.match(proxy, /"extraction-runs"/);
  assert.match(proxy, /"extraction-run"/);
}

await durableLedgerRunTests();
await failureAndPartialEffectTests();
await routeAndBoundTests();
schemaAndUiCharacterizationTests();
console.log("editorial extraction run ledger tests passed");
