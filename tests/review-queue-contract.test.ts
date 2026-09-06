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
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
      (201, 'Alpha & Ω', 'https://alpha.example', 'A', 'A', 'primary', 'rss'),
      (202, 'Beta / Δ', 'https://beta.example', 'B', 'B', 'independent', 'rss'),
      (203, 'Gamma: Prime', 'https://gamma.example', 'B', 'B', 'independent', 'rss'),
      (204, 'Delta – News', 'https://delta.example', 'A', 'A', 'primary', 'rss'),
      (205, 'Epsilon [Test]', 'https://epsilon.example', 'C', 'C', 'discovery', 'rss');
    INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, published_at, ingestion_status) VALUES
      (201, 201, 'https://alpha.example/one', 'metadata-hash-201', 'Alpha report', 'Alpha excerpt', '2026-09-01T01:00:00Z', 'clustered'),
      (202, 202, 'https://beta.example/one', 'metadata-hash-202', 'Beta report', 'Beta excerpt', '2026-09-02T01:00:00Z', 'clustered'),
      (203, 203, 'https://gamma.example/one', 'metadata-hash-203', 'Gamma report', 'Gamma excerpt', '2026-09-03T01:00:00Z', 'clustered'),
      (204, 204, 'https://delta.example/one', 'metadata-hash-204', 'Delta report', 'Delta excerpt', '2026-09-04T01:00:00Z', 'clustered'),
      (205, 205, 'https://epsilon.example/one', 'metadata-hash-205', 'Epsilon report', 'Epsilon excerpt', '2026-09-05T01:00:00Z', 'clustered'),
      (206, 201, 'https://alpha.example/two', 'metadata-hash-206', 'Alpha follow-up', 'Alpha follow-up excerpt', '2026-09-06T01:00:00Z', 'clustered');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (2, 201, 1), (2, 206, 0), (2, 202, 0),
      (8, 204, 1), (8, 202, 0), (8, 203, 0), (8, 205, 0);
  `);
}

function countedD1(database: SQLiteD1): { db: D1Database; prepares: () => number } {
  const base = database.asD1();
  let prepareCount = 0;
  return {
    db: {
      prepare(query: string) {
        prepareCount += 1;
        return base.prepare(query);
      },
    } as unknown as D1Database,
    prepares: () => prepareCount,
  };
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

    const countedPending = countedD1(database);
    const pending = await listReviewQueueClusters(countedPending.db, { scope: "pending-review", limit: 200 });
    assert.equal(countedPending.prepares(), 1, "pending-review uses only its bounded queue query when source labels are not needed");
    assert.equal(pending.every((cluster) => cluster.source_names.length === 0), true, "pending-review does not perform publish-selector metadata enrichment");
    assert.deepEqual(pending.map((cluster) => cluster.id), [9, 8, 7, 6, 1], "pending-review includes human-review rows regardless of evidence state");
    assert.equal(pending.find((cluster) => cluster.id === 1)?.needs_human_review, true);
    assert.equal(pending.find((cluster) => cluster.id === 7)?.evidence_status, "superseded");
    assert.equal(pending.some((cluster) => cluster.id === 2), false, "non-human publishable rows are not pending review");
    assert.equal(pending.some((cluster) => [3, 4, 5].includes(cluster.id)), false, "published, withdrawn, and superseded publications are not pending");

    const countedPublishable = countedD1(database);
    const publishable = await listReviewQueueClusters(countedPublishable.db, { scope: "publishable", limit: 200 });
    assert.equal(countedPublishable.prepares(), 2, "publishable metadata uses one queue query plus one set-based batch query");
    assert.deepEqual(Object.keys(publishable[0] ?? {}).sort(), [
      "created_at", "id", "publication_status", "source_count", "source_names", "summary", "title", "topic", "why_it_matters",
    ], "publishable list uses the browser projection rather than the full review-queue row");
    assert.equal(pending.every((cluster) => "evidence_status" in cluster && "needs_human_review" in cluster && "updated_at" in cluster && "reviewed_by" in cluster && "reviewed_at" in cluster), true, "pending-review keeps the full SSR contract");
    assert.deepEqual(publishable.map((cluster) => cluster.id), [9, 8, 2], "publishable does not require the human-review flag");
    assert.equal(publishable.some((cluster) => [1, 6, 7].includes(cluster.id)), false, "blocked evidence is excluded from publishable");
    assert.equal(publishable.some((cluster) => [3, 4, 5].includes(cluster.id)), false, "publication states outside draft/review are excluded");
    assert.deepEqual(publishable.find((cluster) => cluster.id === 2)?.source_names, ["Alpha & Ω", "Beta / Δ"], "source names map to the correct cluster and deduplicate repeated sources");
    assert.deepEqual(publishable.find((cluster) => cluster.id === 8)?.source_names, ["Delta – News", "Beta / Δ", "Gamma: Prime"], "source names use deterministic primary/tier/id ordering");
    assert.deepEqual(publishable.find((cluster) => cluster.id === 9)?.source_names, [], "clusters without source metadata remain valid list rows");
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
    const apiPublishable = await apiPublishableResponse.json() as Array<Record<string, unknown> & { id: number; source_names: string[] }>;
    assert.equal(apiPublishable.every((cluster) => !["evidence_status", "needs_human_review", "updated_at", "reviewed_by", "reviewed_at"].some((field) => field in cluster)), true, "publishable API rows do not serialize full-contract fields unused by the browser");
    assert.deepEqual(apiPublishable.map((cluster) => [cluster.id, cluster.source_names]), [
      [9, []], [8, ["Delta – News", "Beta / Δ", "Gamma: Prime"]], [2, ["Alpha & Ω", "Beta / Δ"]],
    ], "Worker API exposes the same bounded metadata contract");

    const detailResponse = await signedAdminRequest(database, "/admin/cluster-sources?clusterId=8");
    assert.equal(detailResponse.status, 200, "selected-cluster detail route remains available");
    const detailRows = await detailResponse.json() as Array<{ title: string; url: string; excerpt: string | null; sourceName: string; sourceTier: string; publishedAt: string | null }>;
    assert.equal(detailRows.length, 4, "full selected-cluster source membership remains separate from capped list metadata");
    assert.deepEqual(Object.keys(detailRows[0] ?? {}).sort(), ["excerpt", "publishedAt", "sourceName", "sourceTier", "title", "url"]);

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
    assert.match(reviewPage, /source_names/, "selector labels consume bounded list metadata");
    assert.doesNotMatch(reviewPage, /\/api\/admin\/clusters\?limit=200/, "browser no longer calls the unnamed broad selector");
    assert.doesNotMatch(reviewPage, /allClusters\.slice\(0, 20\)/, "selector no longer schedules first-20 metadata work");
    assert.doesNotMatch(reviewPage, /Promise\.all\(allClusters/, "selector no longer schedules per-cluster source requests");
    assert.doesNotMatch(reviewPage, /clusterMeta/, "obsolete source-name cache is removed");
    assert.equal((reviewPage.match(/\/api\/admin\/cluster-sources\?clusterId=/g) ?? []).length, 1, "one full source-detail request remains only for selected-cluster inspection");
  } finally {
    database.close();
  }
}

await reviewQueueContractTests();
console.log("Review queue contract tests passed.");
