import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewQueueScope, REVIEW_QUEUE_DEFAULT_LIMITS } from "../src/lib/review-queue-contract";
import { listReviewQueueClusters, listRecentlyReviewedClusters } from "../src/lib/server/review-queue";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { SQLiteD1 } from "./sqlite-d1";

const secret = "r".repeat(32);
const context = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

function seedReviewQueueFixtures(database: SQLiteD1): void {
  database.sqlite.exec(`
    INSERT INTO story_clusters
      (id, title, topic, evidence_status, publication_status, needs_human_review, summary, why_it_matters, created_at, updated_at, reviewed_by, reviewed_at)
    VALUES
      (1, 'Pending but unverified', 'models', 'unverified', 'review', 1, 'Unverified summary', NULL, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', NULL, NULL),
      (2, 'Publishable without human flag', 'models', 'confirmed', 'draft', 0, 'Publishable summary', NULL, '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z', NULL, NULL),
      (3, 'Already published', 'models', 'confirmed', 'published', 1, 'Published summary', NULL, '2026-09-03T00:00:00Z', '2026-09-03T00:00:00Z', 'publisher@example.com', '2026-09-03T01:00:00Z'),
      (4, 'Withdrawn story', 'models', 'confirmed', 'withdrawn', 1, 'Withdrawn summary', NULL, '2026-09-04T00:00:00Z', '2026-09-04T00:00:00Z', 'publisher@example.com', '2026-09-04T01:00:00Z'),
      (5, 'Superseded publication', 'models', 'confirmed', 'superseded', 1, 'Superseded summary', NULL, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z', 'publisher@example.com', '2026-09-05T01:00:00Z'),
      (6, 'Pending but outdated', 'models', 'outdated', 'review', 1, 'Outdated summary', NULL, '2026-09-06T00:00:00Z', '2026-09-06T00:00:00Z', NULL, NULL),
      (7, 'Pending but evidence superseded', 'models', 'superseded', 'draft', 1, 'Superseded evidence summary', NULL, '2026-09-07T00:00:00Z', '2026-09-07T00:00:00Z', NULL, NULL),
      (8, 'Tie ordered lower id', 'models', 'confirmed', 'draft', 1, 'Tie summary lower', NULL, '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z', NULL, NULL),
      (9, 'Tie ordered higher id', 'models', 'confirmed', 'draft', 1, 'Tie summary higher', NULL, '2026-09-09T00:00:00Z', '2026-09-09T00:00:00Z', NULL, NULL),
      (10, 'Recently reviewed', 'models', 'confirmed', 'published', 0, 'Recent review summary', NULL, '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z', 'publisher@example.com', '2026-09-10T01:00:00Z');
    UPDATE story_clusters SET updated_at = '2026-09-08T00:00:00Z' WHERE id IN (8, 9);
  `);
}

async function signedAdminRequest(
  database: SQLiteD1,
  path: string,
  method: "GET" | "POST" = "GET",
  body = "",
): Promise<Response> {
  const timestamp = String(Date.now());
  const identity = { operator: "reader@example.com", role: "reader" as const, timestamp, nonce: crypto.randomUUID() };
  const signature = await signInternalRequest(secret, method, path, body, identity);
  const env: Env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: secret };
  return worker.fetch(new Request(`https://worker.example${path}`, {
    method,
    body: method === "GET" ? undefined : body,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": identity.operator,
      "X-Trace-Role": identity.role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": identity.nonce,
      "X-Trace-Signature": signature,
    },
  }), env, context);
}

async function reviewQueueContractTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedReviewQueueFixtures(database);

    assert.equal(isReviewQueueScope("pending-review"), true);
    assert.equal(isReviewQueueScope("publishable"), true);
    assert.equal(isReviewQueueScope("all"), false, "unknown scopes fail closed at the contract boundary");
    assert.deepEqual(REVIEW_QUEUE_DEFAULT_LIMITS, { "pending-review": 50, publishable: 200 });

    const pending = await listReviewQueueClusters(database.asD1(), { scope: "pending-review", limit: 200 });
    assert.deepEqual(pending.map((cluster) => cluster.id), [9, 8, 7, 6, 1], "pending-review includes human-review rows regardless of evidence state");
    assert.equal(pending.find((cluster) => cluster.id === 1)?.needs_human_review, true);
    assert.equal(pending.find((cluster) => cluster.id === 7)?.evidence_status, "superseded");
    assert.equal(pending.some((cluster) => cluster.id === 2), false, "non-human publishable rows are not pending review");
    assert.equal(pending.some((cluster) => [3, 4, 5].includes(cluster.id)), false, "published, withdrawn, and superseded publications are not pending");

    const publishable = await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 200 });
    assert.deepEqual(publishable.map((cluster) => cluster.id), [9, 8, 2], "publishable does not require the human-review flag");
    assert.equal(publishable.some((cluster) => [1, 6, 7].includes(cluster.id)), false, "blocked evidence is excluded from publishable");
    assert.equal(publishable.some((cluster) => [3, 4, 5].includes(cluster.id)), false, "publication states outside draft/review are excluded");
    assert.deepEqual(
      (await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 2 })).map((cluster) => cluster.id),
      [9, 8],
      "queue limits are bounded and tie ordering uses id as a deterministic tiebreaker",
    );

    const recent = await listRecentlyReviewedClusters(database.asD1(), 20);
    assert.deepEqual(recent.map((cluster) => cluster.id), [10, 5, 4, 3], "recent review history remains a separate read");

    const unsignedEnv: Env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: secret };
    const unsignedResponse = await worker.fetch(new Request("https://worker.example/admin/clusters?scope=publishable", { method: "GET" }), unsignedEnv, context);
    assert.equal(unsignedResponse.status, 401, "cluster reads remain behind signed internal authentication");

    const directPending = pending.map((cluster) => cluster.id);
    const apiPendingResponse = await signedAdminRequest(database, "/admin/clusters?scope=pending-review&limit=200");
    assert.equal(apiPendingResponse.status, 200);
    const apiPending = await apiPendingResponse.json() as Array<{ id: number }>;
    assert.deepEqual(apiPending.map((cluster) => cluster.id), directPending, "Worker API and shared SSR contract return the same pending rows");

    const apiPublishableResponse = await signedAdminRequest(database, "/admin/clusters?scope=publishable&limit=200");
    assert.equal(apiPublishableResponse.status, 200);
    assert.deepEqual((await apiPublishableResponse.json() as Array<{ id: number }>).map((cluster) => cluster.id), [9, 8, 2]);

    const omittedScopeResponse = await signedAdminRequest(database, "/admin/clusters?limit=200");
    assert.equal(omittedScopeResponse.status, 200, "omitted scope keeps the compatibility default");
    assert.deepEqual((await omittedScopeResponse.json() as Array<{ id: number }>).map((cluster) => cluster.id), [9, 8, 2]);
    assert.equal((await signedAdminRequest(database, "/admin/clusters?scope=all&limit=200")).status, 400, "unknown scope is rejected");
    assert.equal((await signedAdminRequest(database, "/admin/clusters?scope=publishable&limit=0")).status, 400, "zero limit is rejected");
    assert.equal((await signedAdminRequest(database, "/admin/clusters?scope=publishable&limit=201")).status, 400, "limit above 200 is rejected");

    const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8");
    assert.match(reviewPage, /listReviewQueueClusters\(db, \{ scope: "pending-review", limit: 50 \}\)/, "SSR pending queue uses the shared query");
    assert.match(reviewPage, /\/api\/admin\/clusters\?scope=publishable&limit=200/, "browser publish selector declares its scope");
    assert.match(reviewPage, /allClusters = allClusters\.filter\(\(cluster\) => cluster\.id !== clusterId\)/, "successful publish/archive removes the local selector row");
    assert.match(reviewPage, /function resetSelectedClusterState\(\)/, "successful actions clear selected editor state");
    assert.doesNotMatch(reviewPage, /\/api\/admin\/clusters\?limit=200/, "browser no longer calls the unnamed broad selector");
  } finally {
    database.close();
  }
}

await reviewQueueContractTests();
console.log("Review queue contract tests passed.");
