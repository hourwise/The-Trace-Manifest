import assert from "node:assert/strict";
import { SQLiteD1 } from "./sqlite-d1";
import {
  approveBackfillPlan,
  buildBackfillPlan,
  establishAuthoritativeInventory,
  executeBackfill,
} from "../src/lib/server/knowledge-source-backfill";
import { recalculateExpiredEvidence } from "../src/lib/server/evidence-recalculation";
import { runCrossSourceMatching } from "../workers/ingestion/cross-source-match";

function previewEnv(database: SQLiteD1) {
  const stored = new Map<string, unknown>();
  return {
    DB: database.asD1(),
    RAW_STORE: {
      put: async (key: string, value: unknown) => { stored.set(key, value); },
      delete: async (keys: string | string[]) => {
        for (const key of (Array.isArray(keys) ? keys : [keys])) stored.delete(key);
      },
    },
    TRACE_ENVIRONMENT: "preview",
    stored,
  } as any;
}

async function boundedHistoricalReplayTests(): Promise<void> {
  const database = new SQLiteD1();
  const env = previewEnv(database);
  const inventory = {
    schemaVersion: "kc-11a-v1",
    generatedAt: "2026-08-25T00:00:00Z",
    categories: {
      source_url: [{ id: "historical-html", label: "Historical HTML", url: "https://history.example/article" }],
    },
  };
  const originalFetch = globalThis.fetch;
  const body = `<!doctype html><html><head><title>Historical model release</title></head><body><main>
    <p>The Orion model was released in 2024 and achieved 91% accuracy on the benchmark.</p>
    <p>According to the authors, the release may reduce latency, but this result needs independent verification.</p>
  </main></body></html>`;
  try {
    const authority = await establishAuthoritativeInventory(env, inventory, "kc-11c-v3", "reviewer@example.com", "kc11d-authority-html");
    const plan = await buildBackfillPlan(
      inventory,
      { category: "source_url", limit: 1, storageMode: "private_full_text" },
      authority.snapshotId,
    );
    assert.equal(plan.selected[0]?.storageMode, "private_full_text");
    const approval = await approveBackfillPlan(env, plan, plan.planHash, "publisher@example.com", "kc11d-approval-html");
    globalThis.fetch = (async () => new Response(body, { status: 200, headers: { "Content-Type": "text/html" } })) as typeof fetch;
    const first = await executeBackfill(env, approval.batchId, plan.planHash, "publisher@example.com", "kc11d-execute-html");
    assert.equal(first.state, "completed");
    assert.equal(first.captured_new_document, 1);
    assert.equal(first.extractionRuns, 1, "private historical content enters the deterministic extraction run");
    assert.ok(Number(first.extractionsCreated) > 0, "historical extraction creates proposed structure");
    assert.ok(Number(first.claimsCreated) > 0, "historical extraction creates proposed canonical claims");
    assert.ok(Number(first.matchCandidatesCreated) >= 0);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM claim_assertions WHERE reviewer_state = 'proposed' AND admission_state = 'pending'").first<{ count: number }>())?.count! > 0, true,
      "historical assertions remain review-gated");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_document_versions").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_extractions").first<{ count: number }>())?.count! > 0, true);

    const replay = await executeBackfill(env, approval.batchId, plan.planHash, "publisher@example.com", "kc11d-execute-html");
    assert.deepEqual(replay, first, "a completed batch idempotency key returns the original result");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_document_versions").first<{ count: number }>())?.count, 1,
      "replaying historical work does not create a duplicate canonical version");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_extractions").first<{ count: number }>())?.count, first.extractionsCreated,
      "replaying historical work does not duplicate extraction candidates");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
}

async function pdfContainmentTests(): Promise<void> {
  const database = new SQLiteD1();
  const env = previewEnv(database);
  const inventory = {
    schemaVersion: "kc-11a-v1",
    generatedAt: "2026-08-25T00:00:00Z",
    categories: {
      source_url: [{ id: "historical-pdf", label: "Historical PDF", url: "https://history.example/report" }],
    },
  };
  const originalFetch = globalThis.fetch;
  try {
    const authority = await establishAuthoritativeInventory(env, inventory, "kc-11c-v3", "reviewer@example.com", "kc11d-authority-pdf");
    const plan = await buildBackfillPlan(
      inventory,
      { category: "source_url", limit: 1, storageMode: "private_full_text" },
      authority.snapshotId,
    );
    const approval = await approveBackfillPlan(env, plan, plan.planHash, "publisher@example.com", "kc11d-approval-pdf");
    const pdf = new TextEncoder().encode("%PDF-1.7\nopaque historical artifact\n%%EOF\n");
    globalThis.fetch = (async () => new Response(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } })) as typeof fetch;
    const result = await executeBackfill(env, approval.batchId, plan.planHash, "publisher@example.com", "kc11d-execute-pdf");
    assert.equal(result.state, "completed");
    assert.equal(result.metadata_only, 1, "historical PDFs remain opaque metadata-only captures");
    assert.equal(result.extractionRuns, 0, "historical PDF capture never invokes structured extraction");
    for (const table of ["source_chunks", "source_extractions", "source_summaries", "canonical_claims", "claim_assertions"]) {
      assert.equal((await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, 0,
        `historical PDF capture creates no ${table}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
}

async function boundedOperationalBatchTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
      VALUES (801, 'Batch source', 'https://batch.example', 'A', 'A', 'primary-technical', 'rss');
      INSERT INTO feed_items (id, source_id, url, url_hash, title, summary, content_excerpt, fetched_at, ingestion_status)
      VALUES
        (801, 801, 'https://batch.example/1', 'batch-url-1', 'First classified item', 'First summary', 'First excerpt', datetime('now'), 'classified'),
        (802, 801, 'https://batch.example/2', 'batch-url-2', 'Second classified item', 'Second summary', 'Second excerpt', datetime('now'), 'classified'),
        (803, 801, 'https://batch.example/3', 'batch-url-3', 'Third classified item', 'Third summary', 'Third excerpt', datetime('now'), 'classified');

      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode)
      VALUES ('expiry-doc-1', 'https://batch.example/expiry-1', 'expiry-hash-1', 'html', 'private_full_text'),
             ('expiry-doc-2', 'https://batch.example/expiry-2', 'expiry-hash-2', 'html', 'private_full_text');
      INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at)
      VALUES ('expiry-version-1', 'expiry-doc-1', 'expiry-content-1', 'https://batch.example/expiry-1', datetime('now')),
             ('expiry-version-2', 'expiry-doc-2', 'expiry-content-2', 'https://batch.example/expiry-2', datetime('now'));
      INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain)
      VALUES ('expiry-claim-a', 'Expiry claim A', 'community_report', 'general'),
             ('expiry-claim-b', 'Expiry claim B', 'community_report', 'general');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, assertion_text, relationship, source_role,
         directness, evidence_treatment, admission_state, freshness_state, extraction_method)
      VALUES
        ('expiry-assertion-a', 'expiry-claim-a', 'expiry-version-1', 'Expiry assertion A', 'reports', 'reported_claim',
         'direct', 'factual_support', 'admitted', 'stale', 'test'),
        ('expiry-assertion-b', 'expiry-claim-b', 'expiry-version-2', 'Expiry assertion B', 'reports', 'reported_claim',
         'direct', 'factual_support', 'admitted', 'stale', 'test');
    `);

    const firstMatching = await runCrossSourceMatching(database.asD1(), { limit: 2 });
    assert.equal(firstMatching.processed, 2);
    assert.equal(firstMatching.hasMore, true, "cross-source drivers stop at the explicit ceiling");
    assert.ok(firstMatching.nextCursor);
    const secondMatching = await runCrossSourceMatching(database.asD1(), { limit: 2, cursor: firstMatching.nextCursor });
    assert.equal(secondMatching.processed, 1, "the cursor resumes after the bounded driver page");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM feed_items WHERE json_extract(raw_metadata, '$.crossSourceMatch.checkedAt') IS NOT NULL").first<{ count: number }>())?.count, 3);

    const firstExpiry = await recalculateExpiredEvidence(database.asD1(), { limit: 1 });
    assert.equal(firstExpiry.processed, 1);
    assert.equal(firstExpiry.claimIds.length, 1);
    assert.ok(firstExpiry.nextCursor);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM claim_assertions WHERE expiry_recalculated_at IS NOT NULL").first<{ count: number }>())?.count, 1);
    const secondExpiry = await recalculateExpiredEvidence(database.asD1(), { limit: 1, cursor: firstExpiry.nextCursor });
    assert.equal(secondExpiry.processed, 1, "stale evidence recalculation resumes at the deterministic claim cursor");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM claim_assertions WHERE expiry_recalculated_at IS NOT NULL").first<{ count: number }>())?.count, 2);
    const emptyExpiry = await recalculateExpiredEvidence(database.asD1(), { limit: 1 });
    assert.equal(emptyExpiry.processed, 0, "already recalculated stale assertions are not reconsidered indefinitely");
    database.sqlite.exec("UPDATE claim_assertions SET freshness_state = 'current' WHERE id = 'expiry-assertion-a'; UPDATE claim_assertions SET freshness_state = 'stale' WHERE id = 'expiry-assertion-a';");
    const requeuedExpiry = await recalculateExpiredEvidence(database.asD1(), { limit: 1 });
    assert.equal(requeuedExpiry.processed, 1, "a new transition into stale requeues expiry work");
  } finally {
    database.close();
  }
}

await boundedHistoricalReplayTests();
await pdfContainmentTests();
await boundedOperationalBatchTests();
console.log("KC-11D historical continuity tests passed");
