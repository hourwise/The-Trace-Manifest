import assert from "node:assert/strict";
import { SQLiteD1 } from "./sqlite-d1";
import {
  AssertionGovernanceError,
  governAssertionAdmission,
  type AssertionGovernanceAction,
  type AssertionGovernanceExpectedState,
} from "../src/lib/server/assertion-governance";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { getPublicStoryEvidence } from "../src/lib/server/public-evidence";
import { publishStory } from "../workers/ingestion/publish";
import { authorisedRoute, buildWorkerAdminPath } from "../src/pages/api/admin/[...path]";

const SECRET = "g".repeat(32);
const CLUSTER_ID = 2101;
const CLAIM_ID = "governance-claim";
const ASSERTION_ID = "governance-assertion";

interface FixtureOptions {
  admissionState?: "pending" | "admitted" | "quarantined" | "rejected";
  reviewerState?: "proposed" | "accepted" | "amended" | "rejected" | "duplicate" | "unsupported" | "needs_research";
  freshnessState?: "current" | "stale" | "unknown";
  storyEvidenceStatus?: string;
  publicationStatus?: "draft" | "review" | "published";
  assertionId?: string;
}

function seedFixture(database: SQLiteD1, options: FixtureOptions = {}): { assertionId: string } {
  const admissionState = options.admissionState ?? "pending";
  const reviewerState = options.reviewerState ?? "accepted";
  const freshnessState = options.freshnessState ?? "current";
  const publicationStatus = options.publicationStatus ?? "published";
  const assertionId = options.assertionId ?? ASSERTION_ID;
  const reviewed = reviewerState === "accepted" || reviewerState === "amended";
  const reviewedBy = reviewed ? "publisher@example.test" : null;
  const reviewedAt = reviewed ? "2026-09-06 10:00:00" : null;
  const storyReviewedBy = publicationStatus === "published" ? "publisher@example.test" : null;
  const storyReviewedAt = publicationStatus === "published" ? "2026-09-06 10:00:00" : null;
  const publishedAt = publicationStatus === "published" ? "2026-09-06 09:00:00" : null;

  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (2101, 'Governance source', 'https://source.example', 'A', 'A', 'primary-technical', 'rss');
    INSERT INTO feed_items
      (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status)
    VALUES (2101, 2101, 'https://source.example/story', 'governance-feed-hash',
            'Governance source story', 'A stored source item.', datetime('now'), 'published');
    INSERT INTO story_clusters
      (id, slug, title, topic, summary, publication_status, evidence_status,
       published_at, reviewed_by, reviewed_at)
    VALUES (2101, 'governance-story', 'Governance story', 'ai-agents',
            'A reviewed story used for governance tests.', '${publicationStatus}',
            '${options.storyEvidenceStatus ?? "strongly_supported"}',
            ${publishedAt ? `'${publishedAt}'` : "NULL"},
            ${storyReviewedBy ? `'${storyReviewedBy}'` : "NULL"},
            ${storyReviewedAt ? `'${storyReviewedAt}'` : "NULL"});
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
    VALUES (2101, 2101, 1);
    INSERT INTO source_documents
      (id, canonical_url, canonical_url_hash, source_id, media_kind,
       admission_state, copyright_storage_mode)
    VALUES ('governance-source', 'https://source.example/story', 'governance-url-hash',
            2101, 'html', 'admitted', 'private_full_text');
    INSERT INTO source_document_versions
      (id, source_document_id, content_hash, retrieved_url, retrieved_at,
       http_status, media_type, extraction_status, extraction_state, storage_state)
    VALUES ('governance-version', 'governance-source', 'governance-content-hash',
            'https://source.example/story', '2026-09-06 08:00:00', 200, 'text/html',
            'captured', 'extracted', 'private_stored');
    INSERT INTO source_chunks
      (id, source_document_version_id, chunk_index, text_excerpt, text_hash,
       start_locator, end_locator)
    VALUES ('governance-chunk', 'governance-version', 0, 'Stored governance evidence.',
            'governance-chunk-hash', 'article:1', 'article:2');
    INSERT INTO provenance_groups
      (id, root_source_document_id, origin_type, explanation, determined_by,
       determination_method, reviewed_at)
    VALUES ('governance-provenance', 'governance-source', 'primary',
            'The stored source is the direct origin.', 'publisher@example.test',
            'editor_review', '2026-09-06 09:00:00');
    INSERT INTO canonical_claims
      (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES ('governance-claim', 'The source supports the governance test claim.',
            'specification_defined', 'general', 'active', 'high');
    INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
    VALUES (2101, 'governance-claim', 'primary', 'high', 1);
    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id,
       start_locator, end_locator, assertion_text, relationship, source_role,
       directness, evidence_treatment, admission_state, freshness_state,
       provenance_group_id, extraction_method, extraction_version, confidence,
       reviewer_state, reviewed_by, reviewed_at)
    VALUES ('${assertionId}', 'governance-claim', 'governance-version', 'governance-chunk',
            'article:1', 'article:2', 'Original immutable assertion text.', 'supports',
            'evidence', 'direct', 'factual_support', '${admissionState}', '${freshnessState}',
            'governance-provenance', 'deterministic', 'test-v1', 0.95,
            '${reviewerState}', ${reviewedBy ? `'${reviewedBy}'` : "NULL"}, ${reviewedAt ? `'${reviewedAt}'` : "NULL"});
  `);
  return { assertionId };
}

function expected(
  admissionState: AssertionGovernanceExpectedState["admissionState"] = "pending",
  reviewerState: AssertionGovernanceExpectedState["reviewerState"] = "accepted",
  freshnessState: AssertionGovernanceExpectedState["freshnessState"] = "current",
): AssertionGovernanceExpectedState {
  return { admissionState, reviewerState, freshnessState };
}

function input(
  assertionId: string,
  action: AssertionGovernanceAction,
  idempotencyKey: string,
  requestId: string,
  state = expected(),
  reason = "Reviewed against the stored source and locator.",
) {
  return {
    clusterId: CLUSTER_ID,
    assertionId,
    action,
    expected: state,
    reason,
    idempotencyKey,
    actor: "Publisher@example.test",
    requestId,
  };
}

async function assertGovernanceError(work: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => error instanceof AssertionGovernanceError && error.code === code);
}

async function mutationTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(database);
    const before = await database.prepare(`
      SELECT assertion_text, source_document_version_id, source_chunk_id, start_locator,
             end_locator, provenance_group_id, source_role, evidence_treatment, relationship,
             reviewer_state, freshness_state
      FROM claim_assertions WHERE id = ?
    `).bind(assertionId).first<Record<string, unknown>>();
    const result = await governAssertionAdmission(database.asD1(), input(assertionId, "admit", "governance-key-1", "request-1"));
    assert.equal(result.current.admissionState, "admitted");
    assert.equal(result.current.reviewerState, "accepted");
    assert.equal(result.current.freshnessState, "current");
    assert.equal(result.previous.admissionState, "pending");
    assert.equal(result.recalculation.status, "completed");
    assert.deepEqual(result.recalculation.claimIds, [CLAIM_ID]);
    assert.deepEqual(result.recalculation.storyIds, [CLUSTER_ID]);
    assert.equal(result.publicationImpact, "may_change");

    const after = await database.prepare(`
      SELECT assertion_text, source_document_version_id, source_chunk_id, start_locator,
             end_locator, provenance_group_id, source_role, evidence_treatment, relationship,
             reviewer_state, freshness_state
      FROM claim_assertions WHERE id = ?
    `).bind(assertionId).first<Record<string, unknown>>();
    assert.deepEqual(after, before, "admission changes no assertion content or independent state axis");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots").first<{ count: number }>())?.count, 1);

    const event = await database.prepare(`
      SELECT assertion_id, canonical_claim_id, cluster_id, action,
             previous_admission_state, new_admission_state,
             previous_reviewer_state, new_reviewer_state,
             previous_freshness_state, new_freshness_state,
             actor_email, actor_role, reason, request_id, idempotency_key,
             request_fingerprint, recalculation_job_id
      FROM assertion_governance_events WHERE id = ?
    `).bind(result.eventId).first<Record<string, unknown>>();
    assert.equal(event?.assertion_id, assertionId);
    assert.equal(event?.canonical_claim_id, CLAIM_ID);
    assert.equal(event?.cluster_id, CLUSTER_ID);
    assert.equal(event?.previous_admission_state, "pending");
    assert.equal(event?.new_admission_state, "admitted");
    assert.equal(event?.previous_reviewer_state, "accepted");
    assert.equal(event?.new_reviewer_state, "accepted");
    assert.equal(event?.previous_freshness_state, "current");
    assert.equal(event?.new_freshness_state, "current");
    assert.equal(event?.actor_email, "publisher@example.test");
    assert.equal(event?.actor_role, "publisher");
    assert.equal(event?.reason, "Reviewed against the stored source and locator.");
    assert.equal(event?.request_id, "request-1");
    assert.equal(event?.idempotency_key, "governance-key-1");
    assert.match(String(event?.request_fingerprint), /^[0-9a-f]{64}$/);

    const replay = await governAssertionAdmission(database.asD1(), input(assertionId, "admit", "governance-key-1", "request-retry"));
    assert.equal(replay.replay, true);
    assert.equal(replay.recalculation.status, "replayed");
    assert.equal(replay.eventId, result.eventId);
    assert.equal(replay.requestId, "request-1", "replay returns the authoritative original request identity");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);

    for (const changed of [
      input(assertionId, "admit", "governance-key-1", "request-different-reason", expected(), "A different reason."),
      input(assertionId, "reject", "governance-key-1", "request-different-action"),
      input("other-assertion", "admit", "governance-key-1", "request-different-assertion"),
      input(assertionId, "admit", "governance-key-1", "request-different-expected", expected("quarantined")),
      { ...input(assertionId, "admit", "governance-key-1", "request-different-cluster"), clusterId: 2102 },
    ]) {
      await assertGovernanceError(governAssertionAdmission(database.asD1(), changed), "idempotency_conflict");
    }
    await assertGovernanceError(
      governAssertionAdmission(database.asD1(), input(assertionId, "admit", "governance-key-2", "request-stale")),
      "state_conflict",
    );
    await assertGovernanceError(
      governAssertionAdmission(database.asD1(), input(assertionId, "admit", "governance-key-3", "request-invalid", expected("admitted"))),
      "invalid_transition",
    );

    try { database.sqlite.exec("UPDATE assertion_governance_events SET reason = 'rewritten'"); } catch { /* expected */ }
    assert.equal((await database.prepare("SELECT reason FROM assertion_governance_events WHERE id = ?").bind(result.eventId).first<{ reason: string }>())?.reason, "Reviewed against the stored source and locator.");
    assert.throws(() => database.sqlite.exec("DELETE FROM assertion_governance_events"), /append-only/);
  } finally {
    database.close();
  }
}

async function rejectionAndBoundTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(database, {
      reviewerState: "proposed",
      freshnessState: "unknown",
      storyEvidenceStatus: "unverified",
    });
    const result = await governAssertionAdmission(database.asD1(), input(
      assertionId, "reject", "governance-reject-key", "reject-request",
      expected("pending", "proposed", "unknown"), "The stored source does not support this proposed assertion.",
    ));
    assert.equal(result.previous.admissionState, "pending");
    assert.equal(result.current.admissionState, "rejected");
    assert.equal(result.current.reviewerState, "proposed");
    assert.equal(result.current.freshnessState, "unknown");
    assert.equal(result.recalculation.status, "completed");
    const row = await database.prepare("SELECT assertion_text, admission_state, reviewer_state, freshness_state FROM claim_assertions WHERE id = ?").bind(assertionId).first<Record<string, unknown>>();
    assert.equal(row?.assertion_text, "Original immutable assertion text.");
    assert.equal(row?.admission_state, "rejected");
    assert.equal(row?.reviewer_state, "proposed");
    assert.equal(row?.freshness_state, "unknown");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);

    const quarantined = new SQLiteD1();
    try {
      const quarantinedFixture = seedFixture(quarantined, {
        admissionState: "quarantined", assertionId: "quarantined-assertion",
      });
      const admitted = await governAssertionAdmission(quarantined.asD1(), input(
        quarantinedFixture.assertionId, "admit", "quarantined-admit-key", "quarantined-request",
        expected("quarantined"),
      ));
      assert.equal(admitted.previous.admissionState, "quarantined");
      assert.equal(admitted.current.admissionState, "admitted");
    } finally { quarantined.close(); }
  } finally {
    database.close();
  }

  const association = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(association);
    association.sqlite.exec("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (2102, 'Unrelated cluster', 'unverified', 'review')");
    await assertGovernanceError(governAssertionAdmission(association.asD1(), {
      ...input(assertionId, "admit", "association-key", "association-request"), clusterId: 2102,
    }), "assertion_not_associated");
    await assertGovernanceError(governAssertionAdmission(association.asD1(), {
      ...input(assertionId, "admit", "missing-cluster-key", "missing-cluster-request"), clusterId: 9999,
    }), "cluster_not_found");
  } finally { association.close(); }

  const bounded = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(bounded);
    for (let storyId = 2200; storyId < 2225; storyId++) {
      bounded.sqlite.prepare("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (?, ?, 'unverified', 'review')").run(storyId, `Bounded story ${storyId}`);
      bounded.sqlite.prepare("INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order) VALUES (?, ?, 'supporting', 'standard', 1)").run(storyId, CLAIM_ID);
      // Real stories have member items; memberless clusters are not rescored.
      bounded.sqlite.prepare("INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (?, ?, 0)").run(storyId, CLUSTER_ID);
    }
    await assertGovernanceError(governAssertionAdmission(bounded.asD1(), input(assertionId, "admit", "bound-key", "bound-request")), "recalculation_scope_too_large");
    assert.equal((await bounded.prepare("SELECT admission_state FROM claim_assertions WHERE id = ?").bind(assertionId).first<{ admission_state: string }>())?.admission_state, "pending");
    assert.equal((await bounded.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 0);
  } finally { bounded.close(); }
}

async function concurrencyTests(): Promise<void> {
  const duplicateDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(duplicateDatabase);
    const [first, second] = await Promise.all([
      governAssertionAdmission(duplicateDatabase.asD1(), input(assertionId, "admit", "concurrent-key", "concurrent-1")),
      governAssertionAdmission(duplicateDatabase.asD1(), input(assertionId, "admit", "concurrent-key", "concurrent-2")),
    ]);
    assert.equal(first.eventId, second.eventId);
    assert.ok(first.replay || second.replay);
    assert.equal((await duplicateDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
  } finally { duplicateDatabase.close(); }

  const raceDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(raceDatabase);
    const outcomes = await Promise.allSettled([
      governAssertionAdmission(raceDatabase.asD1(), input(assertionId, "admit", "race-admit-key", "race-admit")),
      governAssertionAdmission(raceDatabase.asD1(), input(assertionId, "reject", "race-reject-key", "race-reject")),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const loser = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(loser && loser.status === "rejected");
    assert.equal((loser as PromiseRejectedResult).reason.code, "state_conflict");
    assert.equal((await raceDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
  } finally { raceDatabase.close(); }
}

async function publicAndPublicationTests(): Promise<void> {
  const publicDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(publicDatabase, { reviewerState: "accepted", freshnessState: "current" });
    const before = await getPublicStoryEvidence(publicDatabase.asD1(), CLUSTER_ID);
    assert.equal(before.assertionCount, 0, "pending assertions are absent before admission");
    await governAssertionAdmission(publicDatabase.asD1(), input(assertionId, "admit", "public-admit-key", "public-admit"));
    const after = await getPublicStoryEvidence(publicDatabase.asD1(), CLUSTER_ID);
    assert.equal(after.assertionCount, 1, "a fully eligible admitted assertion appears in public evidence");

    const rejectedDatabase = new SQLiteD1();
    try {
      const rejectedFixture = seedFixture(rejectedDatabase, { reviewerState: "accepted", freshnessState: "current" });
      await governAssertionAdmission(rejectedDatabase.asD1(), input(rejectedFixture.assertionId, "reject", "public-reject-key", "public-reject"));
      const rejected = await getPublicStoryEvidence(rejectedDatabase.asD1(), CLUSTER_ID);
      assert.equal(rejected.assertionCount, 0, "rejected assertions remain excluded");
    } finally { rejectedDatabase.close(); }
  } finally { publicDatabase.close(); }

  const ineligibleDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(ineligibleDatabase, {
      reviewerState: "proposed", freshnessState: "unknown", storyEvidenceStatus: "unverified",
      publicationStatus: "review",
    });
    await governAssertionAdmission(ineligibleDatabase.asD1(), input(assertionId, "admit", "ineligible-admit-key", "ineligible-admit", expected("pending", "proposed", "unknown")));
    const evidence = await getPublicStoryEvidence(ineligibleDatabase.asD1(), CLUSTER_ID);
    assert.equal(evidence.assertionCount, 0, "admission does not bypass reviewer/freshness/public gates");
    const publishResult = await publishStory({
      DB: ineligibleDatabase.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET,
    }, { clusterId: CLUSTER_ID, summary: "This reviewed summary is long enough for publication.", reviewedBy: "publisher@example.test" });
    assert.equal(publishResult.success, false, "admission does not bypass the story publication evidence gate");
    assert.match(publishResult.error ?? "", /not publication-eligible/);
  } finally { ineligibleDatabase.close(); }
}

async function signedRequest(
  path: string,
  body: string,
  role: "reader" | "publisher",
  nonce = crypto.randomUUID(),
): Promise<Request> {
  const timestamp = String(Date.now());
  const signature = await signInternalRequest(SECRET, "POST", path, body, {
    operator: `${role}@example.test`, role, timestamp, nonce,
  });
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": `${role}@example.test`,
      "X-Trace-Role": role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": nonce,
      "X-Trace-Signature": signature,
    },
  });
}

async function routeSecurityTests(): Promise<void> {
  assert.equal(authorisedRoute("assertion-review", "POST", "publisher"), true);
  assert.equal(authorisedRoute("assertion-review", "POST", "reader"), false);
  assert.equal(authorisedRoute("assertion-review", "GET", "publisher"), false);
  assert.equal(buildWorkerAdminPath("assertion-review"), "/admin/assertion-review");
  const database = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(database);
    const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET } as Env;
    const executionContext = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const body = JSON.stringify({
      clusterId: CLUSTER_ID, assertionId, action: "admit", expected: expected(),
      reason: "Route security test.", idempotencyKey: "route-security-key",
    });
    const unsigned = await worker.fetch(new Request("https://worker.example/admin/assertion-review", { method: "POST", body }), env, executionContext);
    assert.equal(unsigned.status, 401);
    const reader = await worker.fetch(await signedRequest("/admin/assertion-review", body, "reader"), env, executionContext);
    assert.equal(reader.status, 403);
    const malformedBody = JSON.stringify({ ...JSON.parse(body), unexpected: true });
    const malformed = await worker.fetch(await signedRequest("/admin/assertion-review", malformedBody, "publisher"), env, executionContext);
    assert.equal(malformed.status, 400);
    const methodTimestamp = String(Date.now());
    const methodNonce = crypto.randomUUID();
    const methodSignature = await signInternalRequest(SECRET, "GET", "/admin/assertion-review", "", {
      operator: "publisher@example.test", role: "publisher", timestamp: methodTimestamp, nonce: methodNonce,
    });
    const method = await worker.fetch(new Request("https://worker.example/admin/assertion-review", {
      method: "GET", headers: {
        "X-Trace-Internal-Version": "v1", "X-Trace-Operator": "publisher@example.test",
        "X-Trace-Role": "publisher", "X-Trace-Timestamp": methodTimestamp,
        "X-Trace-Nonce": methodNonce, "X-Trace-Signature": methodSignature,
      },
    }), env, executionContext);
    assert.equal(method.status, 403, "the mutation route rejects an invalid method");
    const oversized = await worker.fetch(new Request("https://worker.example/admin/assertion-review", {
      method: "POST", body: "x".repeat(65 * 1024),
    }), env, executionContext);
    assert.equal(oversized.status, 413);
    const permittedRequest = await signedRequest("/admin/assertion-review", body, "publisher");
    const replayedRequest = permittedRequest.clone();
    const permitted = await worker.fetch(permittedRequest, env, executionContext);
    assert.equal(permitted.status, 201);
    database.sqlite.exec("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (2102, 'Unrelated route cluster', 'unverified', 'review')");
    const unrelated = JSON.stringify({ ...JSON.parse(body), clusterId: 2102, idempotencyKey: "route-association-key" });
    const unrelatedResponse = await worker.fetch(await signedRequest("/admin/assertion-review", unrelated, "publisher"), env, executionContext);
    assert.equal(unrelatedResponse.status, 409);
    const replayedNonce = await worker.fetch(replayedRequest as unknown as Request, env, executionContext);
    assert.equal(replayedNonce.status, 401, "transport nonce replay is rejected independently of business idempotency");
  } finally { database.close(); }
}

await mutationTests();
await rejectionAndBoundTests();
await concurrencyTests();
await publicAndPublicationTests();
await routeSecurityTests();
console.log("Assertion governance tests passed.");
