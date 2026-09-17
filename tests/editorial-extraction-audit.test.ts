import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import {
  extractClaimsFromItem,
  runClaimExtraction,
} from "../workers/ingestion/extract-claims";

const SOURCE_ID = 8301;
const CLUSTER_ID = 8302;
const CLAIM_ITEM_ID = 8303;
const NO_CLAIM_ITEM_ID = 8304;

function seedExtractionFixture(database: SQLiteD1): void {
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (${SOURCE_ID}, 'Extraction audit source', 'https://audit.example', 'A', 'A', 'primary-technical', 'rss');
    INSERT INTO story_clusters (id, title, publication_status, evidence_status)
    VALUES (${CLUSTER_ID}, 'Extraction audit story', 'published', 'strongly_supported');
    INSERT INTO feed_items
      (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status)
    VALUES
      (${CLAIM_ITEM_ID}, ${SOURCE_ID}, 'https://audit.example/model', 'audit-item-url-hash-1',
       'Trace model release',
       'OpenAI announced a new model called Trace. It supports a 128k token context window.',
       datetime('now'), 'published'),
      (${NO_CLAIM_ITEM_ID}, ${SOURCE_ID}, 'https://audit.example/note', 'audit-item-url-hash-2',
       'Ordinary note',
       'This note contains ordinary words without a deterministic claim pattern.',
       datetime('now', '-1 minute'), 'published');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
    VALUES (${CLUSTER_ID}, ${CLAIM_ITEM_ID}, 1), (${CLUSTER_ID}, ${NO_CLAIM_ITEM_ID}, 0);
  `);
}

async function durableProjectionCharacterization(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedExtractionFixture(database);

    const result = await runClaimExtraction(database.asD1());
    assert.deepEqual(Object.keys(result).sort(), [
      "canonicalWriteSuccessCount", "claimsExtracted", "evidenceCreated",
      "extractedClaimCount", "failedCount", "newAssertionCount", "noClaimCount",
      "processed", "processedCount", "requestId", "runId", "runStatus", "selectedCount",
    ]);
    assert.match(result.runId, /^[0-9a-f-]{36}$/i);
    assert.equal(result.requestId, null);
    assert.equal(result.runStatus, "completed");
    assert.equal(result.selectedCount, 2);
    assert.equal(result.processedCount, 2);
    assert.equal(result.noClaimCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.extractedClaimCount, result.claimsExtracted);
    assert.equal(result.newAssertionCount, result.claimsExtracted);
    assert.equal(result.canonicalWriteSuccessCount, result.evidenceCreated);
    assert.equal(result.processed, 2, "the runner handles both selected items, including the no-claim item");
    assert.ok(result.claimsExtracted > 0, "the rule extractor creates canonical claims for the matching item");
    assert.equal(result.evidenceCreated, result.claimsExtracted, "a first run has one successful writer call per inserted assertion in this fixture");

    const stages = database.sqlite.prepare(`
      SELECT feed_item_id, algorithm_version, status, result_summary,
             started_at, completed_at, error_message
      FROM pipeline_stages
      WHERE stage = 'claim_extracted'
      ORDER BY feed_item_id
    `).all() as Array<{
      feed_item_id: number;
      algorithm_version: string;
      status: string;
      result_summary: string;
      started_at: string;
      completed_at: string;
      error_message: string | null;
    }>;
    assert.equal(stages.length, 2);
    assert.deepEqual(stages.map((stage) => [stage.feed_item_id, stage.status]), [
      [CLAIM_ITEM_ID, "completed"],
      [NO_CLAIM_ITEM_ID, "completed"],
    ]);
    assert.ok(stages.every((stage) => stage.algorithm_version === "rule-extraction-v1"));
    assert.ok(stages[0].result_summary.includes("claims extracted"));
    assert.ok(stages[1].result_summary.includes("No claims extracted"));
    assert.ok(stages.every((stage) => stage.started_at && stage.completed_at));
    assert.ok(stages.every((stage) => stage.error_message === null));

    const canonicalCounts = database.sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM canonical_claims) AS claims,
        (SELECT COUNT(*) FROM claim_assertions) AS assertions,
        (SELECT COUNT(*) FROM source_document_versions) AS source_versions,
        (SELECT COUNT(*) FROM story_claims) AS story_mappings,
        (SELECT COUNT(*) FROM claim_evidence) AS legacy_evidence
    `).get() as {
      claims: number;
      assertions: number;
      source_versions: number;
      story_mappings: number;
      legacy_evidence: number;
    };
    assert.ok(canonicalCounts.claims > 0);
    assert.equal(canonicalCounts.claims, canonicalCounts.assertions);
    assert.ok(canonicalCounts.source_versions > 0);
    assert.equal(canonicalCounts.claims, canonicalCounts.story_mappings);
    assert.equal(canonicalCounts.legacy_evidence, 0, "the canonical extraction path does not create legacy claim_evidence rows");

    const assertionIds = database.sqlite.prepare(
      "SELECT id FROM claim_assertions ORDER BY id",
    ).all() as Array<{ id: string }>;
    assert.ok(assertionIds.every((row) => row.id.startsWith(`feed-claim-assertion-${CLAIM_ITEM_ID}-`)));

    const secondResult = await runClaimExtraction(database.asD1());
    assert.equal(secondResult.processed, 0, "an existing claim_extracted stage excludes the item from a repeated bounded run");
    assert.equal(secondResult.claimsExtracted, 0);
    assert.equal(secondResult.evidenceCreated, 0);
    assert.equal(secondResult.selectedCount, 0);
    assert.equal(secondResult.processedCount, 0);
    assert.equal(secondResult.runStatus, "completed");
    assert.equal(
      Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM pipeline_stages WHERE stage = 'claim_extracted'").get()?.count),
      2,
    );

    database.sqlite.prepare(`
      UPDATE pipeline_stages
      SET status = 'failed', result_summary = 'characterized failed stage'
      WHERE feed_item_id = ? AND stage = 'claim_extracted'
    `).run(CLAIM_ITEM_ID);
    const failedStage = database.sqlite.prepare(`
      SELECT status, result_summary, error_message
      FROM pipeline_stages
      WHERE feed_item_id = ? AND stage = 'claim_extracted'
    `).get(CLAIM_ITEM_ID) as { status: string; result_summary: string; error_message: string | null };
    assert.equal(failedStage.status, "failed");
    assert.equal(failedStage.result_summary, "characterized failed stage");
    assert.equal(failedStage.error_message, null);
    const failedStageRerun = await runClaimExtraction(database.asD1());
    assert.equal(failedStageRerun.processed, 0, "a present failed stage is also excluded; this is not a retry ledger");
    assert.equal(failedStageRerun.claimsExtracted, 0);
    assert.equal(failedStageRerun.evidenceCreated, 0);
    assert.equal(failedStageRerun.selectedCount, 0);
    assert.equal(failedStageRerun.runStatus, "completed");
  } finally {
    database.close();
  }
}

async function failureProjectionCharacterization(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedExtractionFixture(database);
    const originalBatch = database.batch.bind(database) as unknown as (statements: unknown[]) => Promise<D1Result[]>;
    let batchCalls = 0;
    const failingDatabase = database as unknown as {
      batch: D1Database["batch"];
    };
    failingDatabase.batch = (async (_statements) => {
      batchCalls++;
      if (batchCalls > 1) throw new Error("simulated canonical write failure");
      return originalBatch(_statements as unknown[]);
    }) as D1Database["batch"];

    const result = await runClaimExtraction(database.asD1());
    assert.equal(result.processed, 2, "a canonical batch failure is reflected in the transient counters");
    assert.equal(result.claimsExtracted, 0);
    assert.equal(result.evidenceCreated, 0);
    assert.equal(result.selectedCount, 2);
    assert.equal(result.failedCount, 1);
    assert.equal(result.runStatus, "completed_with_failures");
    const failedStage = database.sqlite.prepare(`
      SELECT status, result_summary, error_message
      FROM pipeline_stages
      WHERE feed_item_id = ? AND stage = 'claim_extracted'
    `).get(CLAIM_ITEM_ID) as {
      status: string;
      result_summary: string;
      error_message: string | null;
    };
    assert.equal(failedStage.status, "failed");
    assert.match(failedStage.result_summary, /Claim insert failed: simulated canonical write failure/);
    assert.equal(failedStage.error_message, null, "the runner places the failure text in result_summary, not error_message");
    assert.equal(
      Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM claim_assertions").get()?.count),
      0,
      "a failed canonical batch leaves no canonical rows in this fixture");

    const repeated = await runClaimExtraction(database.asD1());
    assert.equal(repeated.processed, 0, "the failed pipeline marker is not retried by the current runner");
    assert.equal(repeated.claimsExtracted, 0);
    assert.equal(repeated.evidenceCreated, 0);
    assert.equal(repeated.selectedCount, 0);
    assert.equal(repeated.runStatus, "completed");
  } finally {
    database.close();
  }
}

function pureDiagnosticCharacterization(): void {
  const database = new SQLiteD1();
  try {
    seedExtractionFixture(database);
    const item = database.sqlite.prepare(
      "SELECT * FROM feed_items WHERE id = ?",
    ).get(CLAIM_ITEM_ID) as unknown as Parameters<typeof extractClaimsFromItem>[0];
    const before = database.sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM canonical_claims) AS claims,
        (SELECT COUNT(*) FROM claim_assertions) AS assertions,
        (SELECT COUNT(*) FROM pipeline_stages) AS stages,
        (SELECT COUNT(*) FROM claim_evidence) AS evidence
    `).get();
    const first = extractClaimsFromItem(item, "A", "primary-technical");
    const second = extractClaimsFromItem(item, "A", "primary-technical");
    assert.deepEqual(second, first, "diagnostic extraction remains deterministic");
    assert.ok(first.length > 0);
    const after = database.sqlite.prepare(`
      SELECT
        (SELECT COUNT(*) FROM canonical_claims) AS claims,
        (SELECT COUNT(*) FROM claim_assertions) AS assertions,
        (SELECT COUNT(*) FROM pipeline_stages) AS stages,
        (SELECT COUNT(*) FROM claim_evidence) AS evidence
    `).get();
    assert.deepEqual(after, before, "pure diagnostic extraction has no durable writes");
  } finally {
    database.close();
  }
}

function staticArchitectureCharacterization(): void {
  const extractPage = readFileSync("src/pages/admin/extract-claims.astro", "utf8");
  const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8");
  const runnerSource = readFileSync("workers/ingestion/extract-claims.ts", "utf8");
  const workerSource = readFileSync("workers/ingestion/index.ts", "utf8");
  const auditDocument = readFileSync("docs/audit/editorial-03b-extraction-audit.md", "utf8");

  assert.doesNotMatch(extractPage, /runClaimExtraction/);
  assert.match(extractPage, /extractClaimsFromItem/);
  assert.match(extractPage, /read-only diagnostic preview/);
  assert.match(extractPage, /fetch\("\/api\/admin\/extract-claims"/);
  assert.doesNotMatch(reviewPage, /runClaimExtraction|fetch\(["']\/api\/admin\/extract-claims/);
  assert.match(runnerSource, /LIMIT 50/);
  assert.match(runnerSource, /stage = 'claim_extracted'/);
  assert.match(workerSource, /case "\/admin\/extract-claims"/);
  assert.match(auditDocument, /OUTCOME_B_SCHEMA_GAP_IDENTIFIED/);
  assert.match(auditDocument, /TRANSIENT_ONLY/);
    assert.match(auditDocument, /no route, UI, migration, or persistence\r?\nmodel/i);
}

await durableProjectionCharacterization();
await failureProjectionCharacterization();
pureDiagnosticCharacterization();
staticArchitectureCharacterization();
console.log("editorial extraction audit characterization tests passed");
