import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import {
  AssertionGovernanceError,
  governAssertionAdmission,
  governAssertionReviewerDecision,
  type AssertionGovernanceExpectedState,
  type AssertionReviewerGovernanceAction,
} from "../src/lib/server/assertion-governance";
import { getPublicStoryEvidence } from "../src/lib/server/public-evidence";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { authorisedRoute, buildWorkerAdminPath } from "../src/pages/api/admin/[...path]";

const SECRET = "r".repeat(32);
const CLUSTER_ID = 3101;
const CLAIM_ID = "reviewer-governance-claim";
const ASSERTION_ID = "reviewer-governance-assertion";

type AdmissionState = "pending" | "admitted" | "quarantined" | "rejected";
type ReviewerState = "proposed" | "accepted" | "amended" | "rejected" | "duplicate" | "unsupported" | "needs_research";
type FreshnessState = "current" | "stale" | "unknown";

interface FixtureOptions {
  admissionState?: AdmissionState;
  reviewerState?: ReviewerState;
  freshnessState?: FreshnessState;
  assertionId?: string;
}

function seedFixture(database: SQLiteD1, options: FixtureOptions = {}): { assertionId: string } {
  const admissionState = options.admissionState ?? "admitted";
  const reviewerState = options.reviewerState ?? "proposed";
  const freshnessState = options.freshnessState ?? "current";
  const assertionId = options.assertionId ?? ASSERTION_ID;
  const reviewed = reviewerState === "accepted" || reviewerState === "amended";
  const reviewedBy = reviewed ? "publisher@example.test" : null;
  const reviewedAt = reviewed ? "2026-09-06 10:00:00" : null;

  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (${CLUSTER_ID}, 'Reviewer source', 'https://reviewer.example', 'A', 'A', 'primary-technical', 'rss');
    INSERT INTO feed_items
      (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status)
    VALUES (${CLUSTER_ID}, ${CLUSTER_ID}, 'https://reviewer.example/story', 'reviewer-feed-hash',
            'Reviewer story', 'Stored reviewer evidence.', datetime('now'), 'published');
    INSERT INTO story_clusters
      (id, slug, title, topic, summary, publication_status, evidence_status,
       published_at, reviewed_by, reviewed_at)
    VALUES (${CLUSTER_ID}, 'reviewer-story', 'Reviewer story', 'ai-agents',
            'A reviewer governance story.', 'published', 'strongly_supported',
            '2026-09-06 09:00:00', 'publisher@example.test', '2026-09-06 10:00:00');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
    VALUES (${CLUSTER_ID}, ${CLUSTER_ID}, 1);
    INSERT INTO source_documents
      (id, canonical_url, canonical_url_hash, source_id, media_kind,
       admission_state, copyright_storage_mode)
    VALUES ('reviewer-source', 'https://reviewer.example/story', 'reviewer-url-hash',
            ${CLUSTER_ID}, 'html', 'admitted', 'private_full_text');
    INSERT INTO source_document_versions
      (id, source_document_id, content_hash, retrieved_url, retrieved_at,
       http_status, media_type, extraction_status, extraction_state, storage_state)
    VALUES ('reviewer-version', 'reviewer-source', 'reviewer-content-hash',
            'https://reviewer.example/story', '2026-09-06 08:00:00', 200, 'text/html',
            'captured', 'extracted', 'private_stored');
    INSERT INTO source_chunks
      (id, source_document_version_id, chunk_index, text_excerpt, text_hash,
       start_locator, end_locator)
    VALUES ('reviewer-chunk', 'reviewer-version', 0, 'Stored reviewer evidence.',
            'reviewer-chunk-hash', 'article:1', 'article:2');
    INSERT INTO provenance_groups
      (id, root_source_document_id, origin_type, explanation, determined_by,
       determination_method, reviewed_at)
    VALUES ('reviewer-provenance', 'reviewer-source', 'primary',
            'The stored source is the direct origin.', 'publisher@example.test',
            'editor_review', '2026-09-06 09:00:00');
    INSERT INTO canonical_claims
      (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES ('${CLAIM_ID}', 'The source supports the reviewer governance claim.',
            'specification_defined', 'general', 'active', 'high');
    INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
    VALUES (${CLUSTER_ID}, '${CLAIM_ID}', 'primary', 'high', 1);
    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id,
       start_locator, end_locator, assertion_text, relationship, source_role,
       directness, evidence_treatment, admission_state, freshness_state,
       provenance_group_id, extraction_method, extraction_version, confidence,
       reviewer_state, reviewed_by, reviewed_at)
    VALUES ('${assertionId}', '${CLAIM_ID}', 'reviewer-version', 'reviewer-chunk',
            'article:1', 'article:2', 'Original immutable reviewer assertion text.', 'supports',
            'evidence', 'direct', 'factual_support', '${admissionState}', '${freshnessState}',
            'reviewer-provenance', 'deterministic', 'test-v1', 0.95,
            '${reviewerState}', ${reviewedBy ? `'${reviewedBy}'` : "NULL"}, ${reviewedAt ? `'${reviewedAt}'` : "NULL"});
  `);
  return { assertionId };
}

function expected(
  admissionState: AdmissionState = "admitted",
  reviewerState: ReviewerState = "proposed",
  freshnessState: FreshnessState = "current",
): AssertionGovernanceExpectedState {
  return { admissionState, reviewerState, freshnessState };
}

function input(
  assertionId: string,
  action: AssertionReviewerGovernanceAction,
  idempotencyKey: string,
  requestId: string,
  state = expected(),
  reason = "Publisher reviewed the stored source and assertion relationship.",
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

async function migrationPreserves0073Rows(): Promise<void> {
  const database = new SQLiteD1(true, true, true, false);
  try {
    seedFixture(database, { admissionState: "pending", reviewerState: "accepted" });
    database.sqlite.exec(`
      INSERT INTO assertion_governance_events
        (id, assertion_id, canonical_claim_id, cluster_id, action,
         previous_admission_state, new_admission_state,
         previous_reviewer_state, new_reviewer_state,
         previous_freshness_state, new_freshness_state,
         previous_admission_revision, new_admission_revision,
         actor_email, actor_role, reason, request_id, idempotency_key,
         request_fingerprint, recalculation_job_id)
      VALUES ('legacy-event', '${ASSERTION_ID}', '${CLAIM_ID}', ${CLUSTER_ID}, 'admit',
              'pending', 'admitted', 'accepted', 'accepted', 'current', 'current',
              0, 1, 'publisher@example.test', 'publisher', 'Legacy admission event',
              'legacy-request', 'legacy-key', '${"0".repeat(64)}', 'legacy-job');
      INSERT INTO assertion_governance_recalculation_jobs
        (id, event_id, assertion_id, canonical_claim_id, cluster_id, story_scope_json)
      VALUES ('legacy-job', 'legacy-event', '${ASSERTION_ID}', '${CLAIM_ID}', ${CLUSTER_ID}, '[${CLUSTER_ID}]');
    `);
    database.sqlite.exec(readFileSync("db/migration-0074-assertion-reviewer-governance.sql", "utf8"));
    const event = database.sqlite.prepare(`
      SELECT action, previous_admission_state, new_admission_state,
             previous_governance_revision, new_governance_revision
      FROM assertion_governance_events WHERE id = 'legacy-event'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...event }, {
      action: "admit",
      previous_admission_state: "pending",
      new_admission_state: "admitted",
      previous_governance_revision: 0,
      new_governance_revision: 1,
    });
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM assertion_governance_recalculation_jobs WHERE id = 'legacy-job'").get()?.count, 1);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE '%_0073'").get()?.count, 0);
  } finally {
    database.close();
  }
}

async function reviewerMutationTests(): Promise<void> {
  const acceptedDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(acceptedDatabase);
    assert.equal((await getPublicStoryEvidence(acceptedDatabase.asD1(), CLUSTER_ID)).assertionCount, 0);
    const before = await acceptedDatabase.prepare(`
      SELECT assertion_text, source_document_version_id, source_chunk_id,
             start_locator, end_locator, provenance_group_id, admission_state,
             freshness_state, relationship, source_role, evidence_treatment
      FROM claim_assertions WHERE id = ?
    `).bind(assertionId).first<Record<string, unknown>>();
    const result = await governAssertionReviewerDecision(acceptedDatabase.asD1(), input(
      assertionId, "accept_review", "reviewer-accept-key", "reviewer-accept-request",
    ));
    assert.equal(result.current.admissionState, "admitted");
    assert.equal(result.current.reviewerState, "accepted");
    assert.equal(result.current.freshnessState, "current");
    assert.equal(result.previous.reviewerState, "proposed");
    assert.equal(result.recalculation.status, "completed");
    assert.equal(result.publicationImpact, "may_change");
    assert.equal((await getPublicStoryEvidence(acceptedDatabase.asD1(), CLUSTER_ID)).assertionCount, 1);
    const after = await acceptedDatabase.prepare(`
      SELECT assertion_text, source_document_version_id, source_chunk_id,
             start_locator, end_locator, provenance_group_id, admission_state,
             freshness_state, relationship, source_role, evidence_treatment
      FROM claim_assertions WHERE id = ?
    `).bind(assertionId).first<Record<string, unknown>>();
    assert.deepEqual(after, before, "reviewer governance changes no admission, freshness, text, source, locator, provenance, or evidence treatment");

    const event = await acceptedDatabase.prepare(`
      SELECT action, previous_admission_state, new_admission_state,
             previous_reviewer_state, new_reviewer_state,
             previous_freshness_state, new_freshness_state,
             previous_admission_revision, new_admission_revision,
             previous_governance_revision, new_governance_revision
      FROM assertion_governance_events WHERE id = ?
    `).bind(result.eventId).first<Record<string, unknown>>();
    assert.equal(event?.action, "accept_review");
    assert.equal(event?.previous_admission_state, "admitted");
    assert.equal(event?.new_admission_state, "admitted");
    assert.equal(event?.previous_reviewer_state, "proposed");
    assert.equal(event?.new_reviewer_state, "accepted");
    assert.equal(event?.previous_admission_revision, 0);
    assert.equal(event?.new_admission_revision, 0);
    assert.equal(event?.previous_governance_revision, 0);
    assert.equal(event?.new_governance_revision, 1);

    const replay = await governAssertionReviewerDecision(acceptedDatabase.asD1(), input(
      assertionId, "accept_review", "reviewer-accept-key", "new-transport-request",
    ));
    assert.equal(replay.replay, true);
    assert.equal(replay.eventId, result.eventId);
    assert.equal(replay.requestId, "reviewer-accept-request");
    assert.equal(replay.recalculation.status, "replayed");
    assert.equal((await acceptedDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
    assert.equal((await acceptedDatabase.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, 1, "replay does not create duplicate score snapshots");
    assert.equal((await acceptedDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_recalculation_jobs").first<{ count: number }>())?.count, 1, "replay does not create duplicate recalculation jobs");

    for (const changed of [
      input(assertionId, "accept_review", "reviewer-accept-key", "different-reason-request", expected(), "A changed reason."),
      input(assertionId, "reject_review", "reviewer-accept-key", "different-action-request"),
    ]) {
      await assertGovernanceError(governAssertionReviewerDecision(acceptedDatabase.asD1(), changed), "idempotency_conflict");
    }
    await assertGovernanceError(governAssertionReviewerDecision(acceptedDatabase.asD1(), input(
      assertionId, "reject_review", "reviewer-reject-key", "deferred-revocation",
      expected("admitted", "accepted", "current"),
    )), "invalid_transition");
    await assertGovernanceError(governAssertionReviewerDecision(acceptedDatabase.asD1(), input(
      assertionId, "accept_review", "reviewer-restore-key", "deferred-restoration",
      expected("admitted", "accepted", "current"),
    )), "invalid_transition");
    assert.equal((await acceptedDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
  } finally {
    acceptedDatabase.close();
  }

  const notAdmittedDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(notAdmittedDatabase, { admissionState: "pending" });
    await governAssertionReviewerDecision(notAdmittedDatabase.asD1(), input(
      assertionId, "accept_review", "not-admitted-accept-key", "not-admitted-accept-request",
      expected("pending", "proposed", "current"),
    ));
    assert.equal((await getPublicStoryEvidence(notAdmittedDatabase.asD1(), CLUSTER_ID)).assertionCount, 0, "accepted but not admitted evidence remains absent publicly");
  } finally {
    notAdmittedDatabase.close();
  }

  const needsResearchDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(needsResearchDatabase, { reviewerState: "needs_research" });
    const accepted = await governAssertionReviewerDecision(needsResearchDatabase.asD1(), input(
      assertionId, "accept_review", "needs-research-accept", "needs-research-accept-request",
      expected("admitted", "needs_research", "current"),
    ));
    assert.equal(accepted.current.reviewerState, "accepted");
  } finally {
    needsResearchDatabase.close();
  }

  const rejectedDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(rejectedDatabase);
    const rejected = await governAssertionReviewerDecision(rejectedDatabase.asD1(), input(
      assertionId, "reject_review", "reviewer-reject-key", "reviewer-reject-request",
    ));
    assert.equal(rejected.previous.admissionState, "admitted");
    assert.equal(rejected.current.admissionState, "admitted");
    assert.equal(rejected.current.reviewerState, "rejected");
    assert.equal((await getPublicStoryEvidence(rejectedDatabase.asD1(), CLUSTER_ID)).assertionCount, 0);
  } finally {
    rejectedDatabase.close();
  }

  for (const deferredState of ["amended", "duplicate", "unsupported", "rejected"] as ReviewerState[]) {
    const database = new SQLiteD1();
    try {
      const { assertionId } = seedFixture(database, { reviewerState: deferredState });
      await assertGovernanceError(governAssertionReviewerDecision(database.asD1(), input(
        assertionId, "accept_review", `deferred-${deferredState}`, `deferred-${deferredState}-request`,
        expected("admitted", deferredState, "current"),
      )), "invalid_transition");
    } finally {
      database.close();
    }
  }

  const staleDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(staleDatabase, { freshnessState: "stale" });
    await governAssertionReviewerDecision(staleDatabase.asD1(), input(
      assertionId, "accept_review", "stale-accept-key", "stale-accept-request",
      expected("admitted", "proposed", "stale"),
    ));
    assert.equal((await getPublicStoryEvidence(staleDatabase.asD1(), CLUSTER_ID)).assertionCount, 0, "accepted but stale evidence remains absent publicly");
  } finally {
    staleDatabase.close();
  }
}

async function concurrencyTests(): Promise<void> {
  const duplicateDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(duplicateDatabase);
    const [first, second] = await Promise.all([
      governAssertionReviewerDecision(duplicateDatabase.asD1(), input(assertionId, "accept_review", "concurrent-review-key", "concurrent-review-1")),
      governAssertionReviewerDecision(duplicateDatabase.asD1(), input(assertionId, "accept_review", "concurrent-review-key", "concurrent-review-2")),
    ]);
    assert.equal(first.eventId, second.eventId);
    assert.ok(first.replay || second.replay);
    assert.equal((await duplicateDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
  } finally {
    duplicateDatabase.close();
  }

  const decisionRaceDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(decisionRaceDatabase);
    const outcomes = await Promise.allSettled([
      governAssertionReviewerDecision(decisionRaceDatabase.asD1(), input(assertionId, "accept_review", "race-accept-key", "race-accept")),
      governAssertionReviewerDecision(decisionRaceDatabase.asD1(), input(assertionId, "reject_review", "race-reject-key", "race-reject")),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const loser = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(loser && loser.status === "rejected");
    assert.equal((loser as PromiseRejectedResult).reason.code, "state_conflict");
    assert.equal((await decisionRaceDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
  } finally {
    decisionRaceDatabase.close();
  }

  const crossAxisDatabase = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(crossAxisDatabase, { admissionState: "pending" });
    const outcomes = await Promise.allSettled([
      governAssertionAdmission(crossAxisDatabase.asD1(), {
        clusterId: CLUSTER_ID, assertionId, action: "admit",
        expected: expected("pending", "proposed", "current"),
        reason: "Admission race must not rewrite reviewer state.",
        idempotencyKey: "cross-axis-admission", actor: "Publisher@example.test", requestId: "cross-axis-admission-request",
      }),
      governAssertionReviewerDecision(crossAxisDatabase.asD1(), input(
        assertionId, "accept_review", "cross-axis-review", "cross-axis-review-request",
        expected("pending", "proposed", "current"),
      )),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal((await crossAxisDatabase.prepare("SELECT assertion_governance_revision FROM claim_assertions WHERE id = ?").bind(assertionId).first<{ assertion_governance_revision: number }>())?.assertion_governance_revision, 1);
    assert.equal((await crossAxisDatabase.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 1);
  } finally {
    crossAxisDatabase.close();
  }
}

async function boundScopeTest(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(database);
    for (let storyId = 3200; storyId < 3225; storyId++) {
      database.sqlite.prepare("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (?, ?, 'unverified', 'review')").run(storyId, `Bounded reviewer story ${storyId}`);
      database.sqlite.prepare("INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order) VALUES (?, ?, 'supporting', 'standard', 1)").run(storyId, CLAIM_ID);
    }
    await assertGovernanceError(governAssertionReviewerDecision(database.asD1(), input(assertionId, "accept_review", "reviewer-bound-key", "reviewer-bound-request")), "recalculation_scope_too_large");
    assert.equal((await database.prepare("SELECT reviewer_state, assertion_governance_revision FROM claim_assertions WHERE id = ?").bind(assertionId).first<Record<string, unknown>>())?.reviewer_state, "proposed");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").first<{ count: number }>())?.count, 0);
  } finally {
    database.close();
  }
}

async function signedRequest(path: string, body: string, role: "reader" | "publisher", nonce = crypto.randomUUID()): Promise<Request> {
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
  assert.equal(authorisedRoute("assertion-reviewer-decision", "POST", "publisher"), true);
  assert.equal(authorisedRoute("assertion-reviewer-decision", "POST", "reader"), false);
  assert.equal(authorisedRoute("assertion-reviewer-decision", "GET", "publisher"), false);
  assert.equal(buildWorkerAdminPath("assertion-reviewer-decision"), "/admin/assertion-reviewer-decision");

  const database = new SQLiteD1();
  try {
    const { assertionId } = seedFixture(database);
    const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET } as Env;
    const executionContext = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const body = JSON.stringify({
      clusterId: CLUSTER_ID, assertionId, action: "accept_review", expected: expected(),
      reason: "Route reviewer decision test.", idempotencyKey: "route-reviewer-key",
    });
    const unsigned = await worker.fetch(new Request("https://worker.example/admin/assertion-reviewer-decision", { method: "POST", body }), env, executionContext);
    assert.equal(unsigned.status, 401);
    const reader = await worker.fetch(await signedRequest("/admin/assertion-reviewer-decision", body, "reader"), env, executionContext);
    assert.equal(reader.status, 403);
    const malformed = await worker.fetch(await signedRequest(
      "/admin/assertion-reviewer-decision",
      JSON.stringify({ ...JSON.parse(body), action: "admit" }),
      "publisher",
    ), env, executionContext);
    assert.equal(malformed.status, 400);
    const oversized = await worker.fetch(new Request("https://worker.example/admin/assertion-reviewer-decision", {
      method: "POST", body: "x".repeat(65 * 1024),
    }), env, executionContext);
    assert.equal(oversized.status, 413);

    const permitted = await worker.fetch(await signedRequest("/admin/assertion-reviewer-decision", body, "publisher"), env, executionContext);
    assert.equal(permitted.status, 201);
    const missingClusterBody = JSON.stringify({ ...JSON.parse(body), clusterId: 9999, idempotencyKey: "missing-reviewer-cluster" });
    assert.equal((await worker.fetch(await signedRequest("/admin/assertion-reviewer-decision", missingClusterBody, "publisher"), env, executionContext)).status, 404);
    database.sqlite.exec("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (3102, 'Unrelated reviewer cluster', 'unverified', 'review')");
    const unrelatedBody = JSON.stringify({ ...JSON.parse(body), clusterId: 3102, idempotencyKey: "unrelated-reviewer-cluster" });
    assert.equal((await worker.fetch(await signedRequest("/admin/assertion-reviewer-decision", unrelatedBody, "publisher"), env, executionContext)).status, 409);
    const stateConflictBody = JSON.stringify({ ...JSON.parse(body), idempotencyKey: "reviewer-state-conflict", expected: expected() });
    assert.equal((await worker.fetch(await signedRequest("/admin/assertion-reviewer-decision", stateConflictBody, "publisher"), env, executionContext)).status, 409);
  } finally {
    database.close();
  }
}

await migrationPreserves0073Rows();
await reviewerMutationTests();
await concurrencyTests();
await boundScopeTest();
await routeSecurityTests();
console.log("Assertion reviewer governance tests passed.");
