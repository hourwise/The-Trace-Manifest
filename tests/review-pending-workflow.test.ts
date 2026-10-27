import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUBLICATION_BLOCKED_EVIDENCE,
  canPublishSelection,
  parseReviewClusterId,
  pendingReviewGuidance,
  reviewSelectionUrl,
} from "../src/lib/admin/review-selection";
import { listReviewQueueClusters } from "../src/lib/server/review-queue";
import { authorisedRoute } from "../src/pages/api/admin/[...path]";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { SQLiteD1 } from "./sqlite-d1";

// D4 (EDITORIAL-D4-R1): Pending Review opens the existing evidence and
// governance panels in an explicit review mode, without ever making a blocked
// story publishable and without a second governance implementation.

const SECRET = "d".repeat(32);
const context = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
const PENDING_BLOCKED = 501; // unverified, needs review, one source, one claim
const PENDING_OK = 502; // vendor_reported, needs review: pending and publishable
const PUBLISHABLE_ONLY = 503; // confirmed draft, no review flag
const PENDING_OUTDATED = 504;

function seed(database: SQLiteD1, extraClusters = 0): void {
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
      (501, 'D4 Source A', 'https://d4-a.example', 'A', 'A', 'primary-technical', 'rss'),
      (502, 'D4 Source B', 'https://d4-b.example', 'B', 'B', 'discovery', 'rss');
    INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, published_at, ingestion_status) VALUES
      (501, 501, 'https://d4-a.example/1', 'd4-hash-501', 'D4 pending report', 'Pending excerpt', '2026-10-20T01:00:00Z', 'clustered'),
      (502, 502, 'https://d4-b.example/1', 'd4-hash-502', 'D4 vendor report', 'Vendor excerpt', '2026-10-21T01:00:00Z', 'clustered'),
      (503, 501, 'https://d4-a.example/2', 'd4-hash-503', 'D4 confirmed report', 'Confirmed excerpt', '2026-10-22T01:00:00Z', 'clustered');
    INSERT INTO story_clusters (id, title, topic, summary, evidence_status, publication_status, needs_human_review, created_at, updated_at) VALUES
      (${PENDING_BLOCKED}, 'D4 pending, unverified', 'models', 'A pending story that is not publication-eligible.', 'unverified', 'review', 1, '2026-10-20T00:00:00Z', '2026-10-20T00:00:00Z'),
      (${PENDING_OK}, 'D4 pending, vendor reported', 'models', 'A pending story that is publication-eligible.', 'vendor_reported', 'draft', 1, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z'),
      (${PUBLISHABLE_ONLY}, 'D4 publishable only', 'models', 'A confirmed draft.', 'confirmed', 'draft', 0, '2026-10-22T00:00:00Z', '2026-10-22T00:00:00Z'),
      (${PENDING_OUTDATED}, 'D4 pending, outdated', 'models', 'Outdated evidence.', 'outdated', 'review', 1, '2026-10-19T00:00:00Z', '2026-10-19T00:00:00Z');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (${PENDING_BLOCKED}, 501, 1), (${PENDING_OK}, 502, 1), (${PUBLISHABLE_ONLY}, 503, 1);
    INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('d4-claim', 'D4 fixture claim.', 'specification_defined', 'general', 'active', 'high');
    INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
      VALUES (${PENDING_BLOCKED}, 'd4-claim', 'primary', 'high', 1);
    INSERT INTO source_documents (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode, current_version_id)
      VALUES ('d4-doc', 'https://d4-a.example/1', 'd4-doc-hash', 501, 'html', 'admitted', 'private_full_text', 'd4-version');
    INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, http_status, media_type, extraction_status, extraction_state, storage_state)
      VALUES ('d4-version', 'd4-doc', 'd4-content', 'https://d4-a.example/1', '2026-10-20 08:00:00', 200, 'text/html', 'captured', 'extracted', 'private_stored');
    INSERT INTO source_chunks (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('d4-chunk', 'd4-version', 0, 'The D4 fixture says something specific.', 'd4-chunk-hash', 'p:1', 'p:2');
    INSERT INTO provenance_groups (id, root_source_document_id, origin_type, explanation, determined_by, determination_method, reviewed_at)
      VALUES ('d4-group', 'd4-doc', 'primary', 'Direct source.', 'publisher@example.test', 'editor_review', '2026-10-20 09:00:00');
    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
       assertion_text, relationship, source_role, directness, evidence_treatment,
       admission_state, freshness_state, provenance_group_id, extraction_method, extraction_version, confidence, reviewer_state)
      VALUES ('d4-assertion', 'd4-claim', 'd4-version', 'd4-chunk', 'p:1', 'p:2',
              'The D4 fixture says something specific.', 'supports', 'evidence', 'direct', 'factual_support',
              'pending', 'unknown', 'd4-group', 'deterministic', 'test-v1', 0.9, 'proposed');
  `);
  if (extraClusters > 0) {
    const insert = database.sqlite.prepare(`INSERT INTO story_clusters (id, title, topic, summary, evidence_status, publication_status, needs_human_review, created_at, updated_at)
      VALUES (?, ?, 'bulk', 'Bulk fixture.', ?, 'review', 1, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`);
    for (let i = 0; i < extraClusters; i++) insert.run(10_000 + i, `Bulk ${i}`, i % 2 ? "unverified" : "confirmed");
  }
}

async function signed(database: SQLiteD1, path: string, role: "reader" | "publisher", method: "GET" | "POST" = "GET", body = ""): Promise<Response> {
  const timestamp = String(Date.now());
  const identity = { operator: `${role}@example.test`, role, timestamp, nonce: crypto.randomUUID() };
  const signature = await signInternalRequest(SECRET, method, path, body, identity);
  const env: Env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET };
  return worker.fetch(new Request(`https://worker.example${path}`, {
    method, body: method === "GET" ? undefined : body,
    headers: {
      "Content-Type": "application/json", "X-Trace-Internal-Version": "v1", "X-Trace-Operator": identity.operator,
      "X-Trace-Role": role, "X-Trace-Timestamp": timestamp, "X-Trace-Nonce": identity.nonce, "X-Trace-Signature": signature,
    },
  }), env, context);
}

/** What the browser reads when an item is opened, in either mode. */
async function selectionReads(database: SQLiteD1, clusterId: number, role: "reader" | "publisher"): Promise<number[]> {
  const sources = await signed(database, `/admin/cluster-sources?clusterId=${clusterId}`, role);
  const evidence = await signed(database, `/admin/cluster-evidence?clusterId=${clusterId}`, role);
  return [sources.status, evidence.status];
}

function snapshot(database: SQLiteD1): string {
  return JSON.stringify({
    clusters: database.sqlite.prepare("SELECT id, evidence_status, publication_status, needs_human_review, reviewed_by FROM story_clusters ORDER BY id").all(),
    assertions: database.sqlite.prepare("SELECT id, admission_state, reviewer_state, freshness_state, assertion_governance_revision FROM claim_assertions ORDER BY id").all(),
    events: database.sqlite.prepare("SELECT COUNT(*) AS n FROM assertion_governance_events").get(),
    storyClaims: database.sqlite.prepare("SELECT COUNT(*) AS n FROM story_claims").get(),
  });
}

// 1. Pure rules used by the page.
function helperRules(): void {
  assert.equal(parseReviewClusterId("501"), 501);
  for (const bad of [null, undefined, "", "0", "-1", "1.5", "abc", "01", "1e3", " 5", "99999999999", "2147483648"]) {
    assert.equal(parseReviewClusterId(bad as string | null), null, `review id ${JSON.stringify(bad)} is refused`);
  }
  const publishable = new Set([PENDING_OK, PUBLISHABLE_ONLY]);
  assert.equal(canPublishSelection("publish", PUBLISHABLE_ONLY, publishable), true);
  assert.equal(canPublishSelection("review", PENDING_OK, publishable), false, "review mode never enables publishing, even for a publishable item");
  assert.equal(canPublishSelection("publish", PENDING_BLOCKED, publishable), false, "a blocked item is not publishable just because it is selected");
  assert.equal(canPublishSelection("publish", null, publishable), false);

  const blocked = pendingReviewGuidance({ evidence_status: "unverified", source_count: 1, needs_human_review: true, publication_status: "review" });
  assert.equal(blocked.publicationBlocked, true);
  assert.ok(blocked.reasons.includes("Single source") && blocked.reasons.some((reason) => reason.includes("not publication-eligible")));
  assert.match(blocked.nextAction, /Publication stays blocked/);
  const ok = pendingReviewGuidance({ evidence_status: "vendor_reported", source_count: 3, needs_human_review: true, publication_status: "draft" });
  assert.equal(ok.publicationBlocked, false);
  assert.match(ok.nextAction, /publish from the publishable list/);
  assert.match(pendingReviewGuidance({ evidence_status: "confirmed", source_count: 0, needs_human_review: true, publication_status: "draft" }).nextAction, /no source items/);

  assert.equal(reviewSelectionUrl("https://x.example/admin/review?tab=a#pending", 501), "/admin/review?tab=a&review=501#pending");
  assert.equal(reviewSelectionUrl("https://x.example/admin/review?review=501&tab=a", null), "/admin/review?tab=a");
}

// 2. The UI's mirror of blocked states must match both server authorities.
function eligibilityUnchanged(): void {
  const queue = readFileSync("src/lib/server/review-queue.ts", "utf8");
  assert.ok(queue.includes(`"sc.publication_status IN ('draft','review') AND sc.evidence_status NOT IN ('unverified','outdated','superseded')"`),
    "the publishable predicate is unchanged");
  assert.ok(queue.includes(`"sc.needs_human_review = 1 AND sc.publication_status IN ('draft','review')"`), "the pending-review predicate is unchanged");
  const publish = readFileSync("workers/ingestion/publish.ts", "utf8");
  assert.ok(publish.includes(`if (["unverified", "outdated", "superseded"].includes(cluster.evidence_status)) {`), "the Worker publish guard is unchanged");
  assert.deepEqual([...PUBLICATION_BLOCKED_EVIDENCE], ["unverified", "outdated", "superseded"]);
}

// 3. Server behaviour for pending items opened from the queue.
async function serverBehaviour(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seed(database);
    const pending = (await listReviewQueueClusters(database.asD1(), { scope: "pending-review", limit: 50 })).map((c) => c.id);
    const publishableBefore = (await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 200 })).map((c) => c.id);
    assert.deepEqual(pending, [PENDING_OK, PENDING_BLOCKED, PENDING_OUTDATED], "pending review lists flagged items regardless of evidence");
    assert.deepEqual(publishableBefore, [PUBLISHABLE_ONLY, PENDING_OK], "publishable excludes blocked evidence");

    // Publisher opens a blocked pending item and inspects its governance panel.
    assert.deepEqual(await selectionReads(database, PENDING_BLOCKED, "publisher"), [200, 200]);
    const evidence = await (await signed(database, `/admin/cluster-evidence?clusterId=${PENDING_BLOCKED}`, "publisher")).json() as {
      clusterId: number; claims: Array<{ assertions: Array<{ assertionId: string; admissionState: string }> }>;
    };
    assert.equal(evidence.clusterId, PENDING_BLOCKED);
    assert.equal(evidence.claims[0]?.assertions[0]?.assertionId, "d4-assertion", "the pending item's claim and assertion are visible");
    const history = await signed(database, `/admin/assertion-governance-history?clusterId=${PENDING_BLOCKED}&assertionId=d4-assertion`, "publisher");
    assert.equal(history.status, 200, "governance history is readable for the pending item");

    // Reader inspects the same evidence and history, but cannot mutate.
    assert.deepEqual(await selectionReads(database, PENDING_BLOCKED, "reader"), [200, 200]);
    assert.equal((await signed(database, `/admin/assertion-governance-history?clusterId=${PENDING_BLOCKED}&assertionId=d4-assertion`, "reader")).status, 200);
    const admit = JSON.stringify({ clusterId: PENDING_BLOCKED, assertionId: "d4-assertion", action: "admit",
      expected: { admissionState: "pending", reviewerState: "proposed", freshnessState: "unknown" }, reason: "D4 reader probe.", idempotencyKey: "d4-reader" });
    assert.equal((await signed(database, "/admin/assertion-review", "reader", "POST", admit)).status, 403, "reader admission refused");
    assert.equal((await signed(database, "/admin/related-items", "reader", "POST", JSON.stringify({ sourceStoryId: PENDING_BLOCKED, targetStoryId: PENDING_OK, action: "related_context" }))).status, 403, "reader related-item review refused");
    assert.equal(authorisedRoute("related-items", "GET", "reader"), true, "readers keep related-item search");
    assert.equal(authorisedRoute("related-items", "POST", "reader"), false);
    assert.equal(authorisedRoute("cluster-evidence", "GET", "reader"), true);
    assert.equal(authorisedRoute("cluster-sources", "GET", "reader"), true);

    // Repeated selections are reads only: no events, no state change.
    const before = snapshot(database);
    for (let i = 0; i < 5; i++) {
      await selectionReads(database, PENDING_BLOCKED, "publisher");
      await selectionReads(database, PENDING_OK, "reader");
    }
    assert.equal(snapshot(database), before, "repeated selections write no governance events and change no cluster or assertion");
    assert.deepEqual((await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 200 })).map((c) => c.id), publishableBefore,
      "selecting pending items does not change the publishable list");

    // Blocked evidence never becomes publishable through selection.
    const publishBlocked = await signed(database, "/admin/publish-story", "publisher", "POST",
      JSON.stringify({ clusterId: PENDING_BLOCKED, summary: "A reviewed summary that is long enough to publish." }));
    assert.equal(publishBlocked.status, 400);
    assert.match(((await publishBlocked.json()) as { error: string }).error, /not publication-eligible/);
    assert.equal(snapshot(database), before, "a refused publish attempt changes nothing");

    // Missing and malformed ids fail safely.
    assert.equal((await signed(database, "/admin/cluster-evidence?clusterId=999999", "publisher")).status, 404);
    assert.equal((await signed(database, "/admin/cluster-evidence?clusterId=abc", "publisher")).status, 400);
    assert.equal((await signed(database, "/admin/cluster-sources?clusterId=0", "publisher")).status, 400);

    // The governance panel reached from Pending Review is the existing one:
    // a publisher decision is recorded once, in story context, and replays.
    const decide = JSON.stringify({ clusterId: PENDING_BLOCKED, assertionId: "d4-assertion", action: "admit",
      expected: { admissionState: "pending", reviewerState: "proposed", freshnessState: "unknown" }, reason: "D4 publisher review.", idempotencyKey: "d4-publisher" });
    assert.equal((await signed(database, "/admin/assertion-review", "publisher", "POST", decide)).status, 201);
    assert.equal((await signed(database, "/admin/assertion-review", "publisher", "POST", decide)).status, 200, "a repeated decision replays");
    assert.equal((database.sqlite.prepare("SELECT COUNT(*) AS n FROM assertion_governance_events WHERE assertion_id = 'd4-assertion'").get() as { n: number }).n, 1,
      "exactly one governance event for the decision");
    assert.equal((database.sqlite.prepare("SELECT governance_context AS c, cluster_id AS id FROM assertion_governance_events").get() as { c: string; id: number }).id, PENDING_BLOCKED);
    assert.equal((database.sqlite.prepare("SELECT publication_status AS s FROM story_clusters WHERE id = ?").get(PENDING_BLOCKED) as { s: string }).s, "review",
      "reviewing a pending item never publishes it");
  } finally {
    database.close();
  }
}

// 4. D1 work for opening an item does not grow with the size of the queue.
async function boundedQueries(): Promise<void> {
  const counts: number[] = [];
  for (const extra of [0, 250]) {
    const database = new SQLiteD1();
    try {
      seed(database, extra);
      database.statementLog.length = 0;
      await selectionReads(database, PENDING_BLOCKED, "publisher");
      counts.push(database.statementLog.length);
      assert.ok(database.statementLog.every((entry) => entry.parameterCount <= 100), "no statement exceeds D1's parameter limit");

      database.statementLog.length = 0;
      const pending = await listReviewQueueClusters(database.asD1(), { scope: "pending-review", limit: 50 });
      assert.equal(database.statementLog.length, 1, "the SSR pending queue is one bounded statement");
      assert.ok(pending.length <= 50, "the SSR pending queue stays capped at 50");
    } finally {
      database.close();
    }
  }
  console.log(JSON.stringify({ kind: "d4_open_item_statements", queueSize0: counts[0], queueSize250: counts[1] }));
  assert.equal(counts[0], counts[1], `opening an item costs the same statements with 0 or 250 other clusters (${counts.join(" vs ")})`);
  assert.ok(counts[0] <= 16, `opening an item is a small fixed number of statements (${counts[0]})`);
}

// 5. Page structure: modes, role rendering and the D6 script rule.
function pageStructure(): void {
  const source = readFileSync("src/pages/admin/review.astro", "utf8").replace(/\r\n/g, "\n");
  const markup = source.slice(0, source.indexOf("<script>"));
  const script = source.slice(source.indexOf("<script>"), source.indexOf("</script>"));

  // D6: one unconditional page script for every role.
  assert.equal(source.split("<script>").length - 1, 1);
  assert.doesNotMatch(source, /&&\s*\(\s*\n?\s*<script>/);

  // Pending Review is actionable for both roles, with role-appropriate wording.
  assert.match(markup, /data-review-open=\{String\(item\.id\)\}/, "every pending card has an open action");
  assert.match(markup, /\{isPublisher \? "Open review" : "Inspect evidence and history"\}/);
  assert.match(markup, /pendingReviewGuidance\(item, conflicts\)/, "cards show reasons, source conflicts and the next action");
  assert.match(markup, /id="review-mode-banner"[^>]*hidden/, "review mode starts hidden");
  assert.match(markup, /id="publish-form-card"/);

  // AI Analyze is publisher-only markup; readers get an explanation instead.
  const aiAt = markup.indexOf('id="ai-analyze-btn"');
  assert.ok(aiAt > markup.lastIndexOf("{isPublisher", aiAt) && markup.lastIndexOf("{isPublisher", aiAt) > 0, "AI Analyze renders only in the publisher branch");
  assert.match(markup, /data-ai-reader-note/);
  assert.match(script, /\$<HTMLButtonElement>\("ai-analyze-btn"\)\?\.addEventListener/, "the script tolerates the missing button");

  // Related-item review controls are publisher-only; readers see state text.
  assert.match(script, /!canGovernAssertions\s*\n\s*\? '<span class="meta" data-related-readonly/);

  // Mode separation in the script.
  assert.match(script, /canPublishSelection\(selectionMode, selectedId,/, "publish readiness requires publish mode");
  assert.match(script, /archBtn\.disabled = selectionMode !== "publish"/, "archive is unavailable in review mode");
  assert.match(script, /if \(!card\) \{\s*\n\s*showPendingNotice\(/, "stale or forged ?review= ids show a notice and load nothing");
  assert.match(script, /resetSelectedClusterState\(\);\s*\n\s*selectionMode = "review";/, "entering review mode clears the publish selection first");
  assert.match(script, /const detail = selectionMode === "publish" \? clusterDetail\[clusterId\] : undefined;/, "review mode never prefills publication fields");
  assert.match(script, /const clusterId = activeClusterId;\s*\n\s*if \(!clusterId\) \{ status\("Select a cluster first\."/, "related search follows the active selection");
  assert.equal((source.match(/\/api\/admin\/cluster-sources\?clusterId=/g) ?? []).length, 1, "one shared source-detail request");
  assert.equal((source.match(/\/api\/admin\/cluster-evidence\?clusterId=/g) ?? []).length, 1, "one shared evidence request");
  assert.equal((source.match(/\/api\/admin\/assertion-review"/g) ?? []).length, 1, "no second governance implementation");
}

helperRules();
eligibilityUnchanged();
await serverBehaviour();
await boundedQueries();
pageStructure();
console.log("review pending workflow (D4) tests passed");
