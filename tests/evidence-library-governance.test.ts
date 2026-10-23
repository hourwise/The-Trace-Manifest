import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import {
  AssertionGovernanceError,
  governAssertionAdmission,
  governAssertionReviewerDecision,
  resolveGovernanceScope,
  type AssertionGovernanceExpectedState,
} from "../src/lib/server/assertion-governance";
import { getAssertionGovernanceHistory } from "../src/lib/server/assertion-governance-history";
import { approveFreshnessReview, requestFreshnessReview } from "../src/lib/server/evidence-freshness-review";
import { listEvidenceLibrary } from "../src/lib/server/evidence-library-queue";
import { retrieveApprovedKnowledge, retrievePublishedEvidence } from "../src/lib/server/ask-evidence";
import { getPublicStoryEvidence } from "../src/lib/server/public-evidence";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { authorisedRoute } from "../src/pages/api/admin/[...path]";
import { D1_MAX_BOUND_PARAMETERS } from "./sqlite-d1";

// SEED-01 / migration 0076: Evidence Library assertion governance.

const SECRET = "l".repeat(32);
const LIBRARY_CLAIM = "library-claim";
const LIBRARY_ASSERTION = "library-assertion";
const STORY_ID = 4401;
const HOLDING_ID = 4402;

type Admission = AssertionGovernanceExpectedState["admissionState"];
type Reviewer = AssertionGovernanceExpectedState["reviewerState"];
type Freshness = AssertionGovernanceExpectedState["freshnessState"];

function expected(admissionState: Admission = "pending", reviewerState: Reviewer = "proposed", freshnessState: Freshness = "unknown"): AssertionGovernanceExpectedState {
  return { admissionState, reviewerState, freshnessState };
}

/** A captured, located, provenance-backed assertion that no story carries. */
function seedLibrary(database: SQLiteD1, options: { assertionId?: string; claimId?: string; sourceAdmission?: string; withSource?: boolean } = {}): string {
  const assertionId = options.assertionId ?? LIBRARY_ASSERTION;
  const claimId = options.claimId ?? LIBRARY_CLAIM;
  const suffix = assertionId;
  const withSource = options.withSource ?? true;
  // The source-less (legacy-shaped) assertion references a pre-cutover claim,
  // and claims are read-only after cutover, so that one key is not enforced.
  if (!withSource) database.sqlite.exec("PRAGMA foreign_keys = OFF");
  database.sqlite.exec(`
    INSERT OR IGNORE INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (4400, 'Library source', 'https://library.example', 'A', 'A', 'primary-technical', 'manual');
    INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES ('${claimId}', 'The specification defines library behaviour ${suffix}.', 'specification_defined', 'general', 'active', 'high');
    ${withSource ? `
    INSERT INTO source_documents (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode, current_version_id)
    VALUES ('doc-${suffix}', 'https://library.example/${suffix}', 'hash-${suffix}', 4400, 'html', '${options.sourceAdmission ?? "admitted"}', 'private_full_text', 'version-${suffix}');
    INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, http_status, media_type, extraction_status, extraction_state, storage_state)
    VALUES ('version-${suffix}', 'doc-${suffix}', 'content-${suffix}', 'https://library.example/${suffix}', '2026-10-20 08:00:00', 200, 'text/html', 'captured', 'extracted', 'private_stored');
    INSERT INTO source_chunks (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
    VALUES ('chunk-${suffix}', 'version-${suffix}', 0, 'The specification defines library behaviour.', 'chunk-hash-${suffix}', 'p:1', 'p:2');
    INSERT INTO provenance_groups (id, root_source_document_id, origin_type, explanation, determined_by, determination_method, reviewed_at)
    VALUES ('group-${suffix}', 'doc-${suffix}', 'primary', 'Direct specification source.', 'publisher@example.test', 'editor_review', '2026-10-20 09:00:00');` : ""}
    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
       legacy_claim_id, assertion_text, relationship, source_role, directness, evidence_treatment,
       admission_state, freshness_state, provenance_group_id, extraction_method, extraction_version, confidence, reviewer_state)
    VALUES ('${assertionId}', '${claimId}', ${withSource ? `'version-${suffix}', 'chunk-${suffix}', 'p:1', 'p:2'` : "NULL, NULL, NULL, NULL"},
            ${withSource ? "NULL" : "4400"}, 'The specification defines library behaviour.', 'supports', 'evidence', 'direct', 'factual_support',
            'pending', 'unknown', ${withSource ? `'group-${suffix}'` : "NULL"}, 'deterministic', 'test-v1', 0.9, 'proposed');
  `);
  if (!withSource) database.sqlite.exec("PRAGMA foreign_keys = ON");
  return assertionId;
}

function seedStory(database: SQLiteD1, id: number, withMember: boolean, claimId: string): void {
  database.sqlite.exec(`
    INSERT OR IGNORE INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality) VALUES ('${claimId}', 'Story claim ${claimId}.', 'specification_defined', 'general', 'active', 'high');
    INSERT OR IGNORE INTO feed_items (id, source_id, url, url_hash, title, ingestion_status)
    VALUES (${id}, 4400, 'https://library.example/story-${id}', 'story-hash-${id}', 'Story ${id}', 'published');
    INSERT INTO story_clusters (id, slug, title, summary, publication_status, evidence_status, published_at, reviewed_by, reviewed_at)
    VALUES (${id}, 'story-${id}', 'Story ${id}', 'A story.', 'published', 'strongly_supported', '2026-10-20 09:00:00', 'publisher@example.test', '2026-10-20 10:00:00');
    ${withMember ? `INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (${id}, ${id}, 1);` : ""}
    INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
    VALUES (${id}, '${claimId}', 'primary', 'high', 1);
  `);
}

function libraryInput(action: "admit" | "reject", key: string, state = expected(), reason = "Checked the captured specification section.") {
  return { context: "evidence_library" as const, assertionId: LIBRARY_ASSERTION, action, expected: state, reason, idempotencyKey: key, actor: "Publisher@Example.test", requestId: `request-${key}` };
}

function reviewInput(action: "accept_review" | "reject_review", key: string, state = expected("admitted")) {
  return { context: "evidence_library" as const, assertionId: LIBRARY_ASSERTION, action, expected: state, reason: "The assertion matches the located text.", idempotencyKey: key, actor: "publisher@example.test", requestId: `request-${key}` };
}

async function rejectsWith(work: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => error instanceof AssertionGovernanceError && error.code === code, `expected ${code}`);
}

const count = (database: SQLiteD1, sql: string) => Number((database.sqlite.prepare(sql).get() as { count: number }).count);

// 1. Library admission and reviewer decisions, recalculation with zero stories.
async function libraryDecisions(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedLibrary(database);
    const storiesBefore = count(database, "SELECT COUNT(*) AS count FROM story_clusters");
    const admitted = await governAssertionAdmission(database.asD1(), libraryInput("admit", "lib-admit"));
    assert.equal(admitted.context, "evidence_library");
    assert.equal(admitted.clusterId, null);
    assert.equal(admitted.current.admissionState, "admitted");
    assert.equal(admitted.replay, false);
    assert.equal(admitted.recalculation.status, "completed");
    assert.deepEqual(admitted.recalculation.storyIds, [], "no story is invented");
    assert.equal(admitted.recalculation.storySnapshotCount, 0);
    assert.ok(admitted.recalculation.claimSnapshotCount >= 1, "the canonical claim is recalculated");
    assert.equal(admitted.publicationImpact, "unchanged", "library decisions never change publication");

    const event = database.sqlite.prepare("SELECT governance_context, cluster_id, action, new_governance_revision FROM assertion_governance_events WHERE id = ?").get(admitted.eventId) as Record<string, unknown>;
    assert.deepEqual({ ...event }, { governance_context: "evidence_library", cluster_id: null, action: "admit", new_governance_revision: 1 });
    const job = database.sqlite.prepare("SELECT governance_context, cluster_id, story_scope_json, state FROM assertion_governance_recalculation_jobs WHERE event_id = ?").get(admitted.eventId) as Record<string, unknown>;
    assert.deepEqual({ ...job }, { governance_context: "evidence_library", cluster_id: null, story_scope_json: "[]", state: "completed" });

    const accepted = await governAssertionReviewerDecision(database.asD1(), reviewInput("accept_review", "lib-accept"));
    assert.equal(accepted.current.reviewerState, "accepted");
    assert.equal(accepted.context, "evidence_library");
    assert.equal(accepted.publicationImpact, "unchanged");
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM story_clusters"), storiesBefore, "library acceptance creates no story");
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM story_claims"), 0, "and links the claim to none");
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM story_clusters WHERE publication_status = 'published'"), 0);

    // Shared history, library scope.
    const history = await getAssertionGovernanceHistory(database.asD1(), null, LIBRARY_ASSERTION);
    assert.equal(history.context, "evidence_library");
    assert.deepEqual(history.events.map((item) => [item.action, item.axis, item.context, item.clusterId]), [
      ["admit", "admission", "evidence_library", null],
      ["accept_review", "editorial_review", "evidence_library", null],
    ]);

    // Idempotent replay and conflicting keys.
    const replay = await governAssertionAdmission(database.asD1(), libraryInput("admit", "lib-admit"));
    assert.equal(replay.replay, true);
    assert.equal(replay.eventId, admitted.eventId);
    await rejectsWith(governAssertionAdmission(database.asD1(), libraryInput("admit", "lib-admit", expected(), "A different reason.")), "idempotency_conflict");
    // The same key cannot be replayed into the story context.
    seedStory(database, STORY_ID, true, "other-claim-unused");
    await rejectsWith(governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "lib-admit"), context: "story", clusterId: STORY_ID }), "idempotency_conflict");
  } finally {
    database.close();
  }
}

// 2. Scope validation: ambiguous, spoofed and invalid combinations.
async function scopeValidation(): Promise<void> {
  assert.deepEqual(resolveGovernanceScope({ clusterId: 7 }), { context: "story", clusterId: 7 }, "existing callers keep story context");
  assert.deepEqual(resolveGovernanceScope({ context: "evidence_library" }), { context: "evidence_library", clusterId: null });
  for (const [label, scope, code] of [
    ["library with a cluster", { context: "evidence_library", clusterId: 7 }, "invalid_scope"],
    ["story without a cluster", { context: "story" }, "invalid_cluster_id"],
    ["story with a bad cluster", { context: "story", clusterId: 0 }, "invalid_cluster_id"],
    ["no scope at all", {}, "invalid_scope"],
    ["unknown context", { context: "global" }, "invalid_scope"],
  ] as const) {
    assert.throws(() => resolveGovernanceScope(scope as never), (error: unknown) => error instanceof AssertionGovernanceError && error.code === code, label);
  }

  const database = new SQLiteD1();
  try {
    seedLibrary(database);
    // Database-level enforcement, not just application validation.
    const insertEvent = (context: string, cluster: string) => database.sqlite.exec(`
      INSERT INTO assertion_governance_events
        (id, assertion_id, canonical_claim_id, governance_context, cluster_id, action,
         previous_admission_state, new_admission_state, previous_reviewer_state, new_reviewer_state,
         previous_freshness_state, new_freshness_state, previous_admission_revision, new_admission_revision,
         previous_governance_revision, new_governance_revision, actor_email, actor_role, reason,
         request_id, idempotency_key, request_fingerprint, recalculation_job_id)
      VALUES ('forged-${context}-${cluster}', '${LIBRARY_ASSERTION}', '${LIBRARY_CLAIM}', '${context}', ${cluster}, 'admit',
              'pending', 'admitted', 'proposed', 'proposed', 'unknown', 'unknown', 0, 1, 0, 1,
              'p@example.test', 'publisher', 'Forged.', 'forged-request-${context}-${cluster}', 'forged-key-${context}-${cluster}', 'x', 'forged-job-${context}-${cluster}');
    `);
    seedStory(database, STORY_ID, true, "other-claim-unused");
    assert.throws(() => insertEvent("evidence_library", String(STORY_ID)), /CHECK constraint/, "a library event cannot carry a cluster");
    assert.throws(() => insertEvent("story", "NULL"), /CHECK constraint/, "a story event must carry a cluster");
    assert.throws(() => insertEvent("global", "NULL"), /CHECK constraint/, "unknown contexts are refused");
    assert.throws(() => database.sqlite.exec(`
      INSERT INTO assertion_governance_events
        (id, assertion_id, canonical_claim_id, governance_context, cluster_id, action,
         previous_admission_state, new_admission_state, previous_reviewer_state, new_reviewer_state,
         previous_freshness_state, new_freshness_state, previous_admission_revision, new_admission_revision,
         previous_governance_revision, new_governance_revision, actor_email, actor_role, reason,
         request_id, idempotency_key, request_fingerprint, recalculation_job_id)
      VALUES ('forged-fresh', '${LIBRARY_ASSERTION}', '${LIBRARY_CLAIM}', 'evidence_library', NULL, 'mark_current',
              'pending', 'pending', 'proposed', 'proposed', 'unknown', 'current', 0, 0, 0, 1,
              'p@example.test', 'publisher', 'Forged.', 'forged-fresh-request', 'forged-fresh-key', 'x', 'forged-fresh-job');
    `), /CHECK constraint/, "mark_current needs an admitted, accepted assertion and a freshness review");
    assert.throws(() => database.sqlite.exec(`
      INSERT INTO assertion_governance_recalculation_jobs (id, event_id, assertion_id, canonical_claim_id, governance_context, cluster_id, story_scope_json)
      VALUES ('forged-job', 'missing-event', '${LIBRARY_ASSERTION}', '${LIBRARY_CLAIM}', 'evidence_library', ${STORY_ID}, '[]');
    `), /CHECK constraint|FOREIGN KEY/, "jobs enforce the same context rule");

    // Missing assertion, missing or unadmitted source.
    await rejectsWith(governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "missing"), assertionId: "no-such-assertion" }), "assertion_not_found");
    seedLibrary(database, { assertionId: "no-source", claimId: "no-source-claim", withSource: false });
    await rejectsWith(governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "no-source-admit"), assertionId: "no-source" }), "source_missing");
    const rejected = await governAssertionAdmission(database.asD1(), { ...libraryInput("reject", "no-source-reject"), assertionId: "no-source" });
    assert.equal(rejected.current.admissionState, "rejected", "rejection needs no source");
    seedLibrary(database, { assertionId: "quarantined-source", claimId: "quarantined-claim", sourceAdmission: "quarantined" });
    await rejectsWith(governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "q-admit"), assertionId: "quarantined-source" }), "source_not_admitted");

    // Stale expected state.
    await rejectsWith(governAssertionAdmission(database.asD1(), libraryInput("admit", "stale", expected("pending", "proposed", "current"))), "state_conflict");
  } finally {
    database.close();
  }
}

// 3. Forged associations: story context needs a real link; library context
//    refuses real-story claims but not memberless holding clusters.
async function forgedAssociations(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedLibrary(database);
    seedStory(database, STORY_ID, true, "unrelated-claim-placeholder");
    database.sqlite.exec("INSERT OR IGNORE INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality) VALUES ('unrelated-claim-placeholder', 'Unrelated.', 'specification_defined', 'general', 'active', 'high')");
    await rejectsWith(governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "forged-story"), context: "story", clusterId: STORY_ID }), "assertion_not_associated");
    await rejectsWith(governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "missing-story"), context: "story", clusterId: 999_999 }), "cluster_not_found");

    // A memberless holding cluster (like Production story 358) is not a story.
    seedStory(database, HOLDING_ID, false, LIBRARY_CLAIM);
    const viaLibrary = await governAssertionAdmission(database.asD1(), libraryInput("admit", "holding-admit"));
    assert.equal(viaLibrary.context, "evidence_library");
    assert.deepEqual(viaLibrary.recalculation.storyIds, [], "the holding cluster receives no recalculation");

    // Once the claim joins a real story, library review is refused.
    database.sqlite.exec(`INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order) VALUES (${STORY_ID}, '${LIBRARY_CLAIM}', 'supporting', 'high', 2)`);
    await rejectsWith(governAssertionReviewerDecision(database.asD1(), reviewInput("accept_review", "now-in-story")), "assertion_story_linked");
    // ...and the story context works, keeping the earlier library history.
    const viaStory = await governAssertionReviewerDecision(database.asD1(), { ...reviewInput("accept_review", "story-accept"), context: "story", clusterId: STORY_ID });
    assert.equal(viaStory.context, "story");
    assert.equal(viaStory.clusterId, STORY_ID);
    const history = await getAssertionGovernanceHistory(database.asD1(), STORY_ID, LIBRARY_ASSERTION);
    assert.deepEqual(history.events.map((item) => item.context), ["evidence_library", "story"], "library history survives the move into a story");
  } finally {
    database.close();
  }
}

// 4. Concurrency, append-only history, freshness alignment, recalculation scope.
async function concurrencyAndFreshness(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedLibrary(database);
    const sameKey = await Promise.all(Array.from({ length: 8 }, () => governAssertionAdmission(database.asD1(), libraryInput("admit", "concurrent-key"))));
    assert.equal(new Set(sameKey.map((result) => result.eventId)).size, 1, "concurrent replays converge on one event");
    assert.equal(sameKey.filter((result) => !result.replay).length, 1);

    seedLibrary(database, { assertionId: "race", claimId: "race-claim" });
    const outcomes = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => governAssertionAdmission(database.asD1(), {
      ...libraryInput(index % 2 ? "reject" : "admit", `race-${index}`), assertionId: "race",
    })));
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1, "exactly one competing decision commits");
    for (const outcome of outcomes.filter((item): item is PromiseRejectedResult => item.status === "rejected")) {
      assert.ok(outcome.reason instanceof AssertionGovernanceError && ["state_conflict", "invalid_transition"].includes(outcome.reason.code));
    }
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM assertion_governance_events WHERE assertion_id = 'race'"), 1);

    assert.throws(() => database.sqlite.exec("UPDATE assertion_governance_events SET reason = 'edited'"), /append-only/);
    assert.throws(() => database.sqlite.exec("DELETE FROM assertion_governance_events"), /append-only/);
    assert.throws(() => database.sqlite.exec("UPDATE assertion_governance_recalculation_jobs SET governance_context = 'story'"), /immutable|CHECK/);

    // Unreviewed and unmapped library evidence is not answer evidence.
    const question = "specification defines library behaviour";
    assert.equal((await retrievePublishedEvidence(database.asD1(), question, 8)).length, 0, "admitted but unaccepted: not evidence");

    await governAssertionReviewerDecision(database.asD1(), reviewInput("accept_review", "fresh-accept"));
    // Freshness approval is now a governance event with a recalculation obligation.
    const request = await requestFreshnessReview(database.asD1(), {
      claimAssertionId: LIBRARY_ASSERTION, proposedState: "current", sourceDocumentVersionId: `version-${LIBRARY_ASSERTION}`,
      reason: "Checked the current version and locator.", actor: "publisher@example.test", idempotencyKey: "fresh-request",
    });
    const approved = await approveFreshnessReview(database.asD1(), request.reviewId, "publisher@example.test", "Approved.", "fresh-approval-request");
    assert.equal(approved.inserted, true);
    assert.ok(approved.governanceEventId, "the approval recorded a governance event");
    assert.equal(approved.recalculation?.status, "completed");
    assert.deepEqual(approved.recalculation?.storyIds, [], "no linked story, no story recalculation");
    const freshnessEvent = database.sqlite.prepare("SELECT action, governance_context, cluster_id, freshness_review_id, previous_governance_revision, new_governance_revision FROM assertion_governance_events WHERE id = ?").get(approved.governanceEventId!) as Record<string, unknown>;
    assert.deepEqual({ ...freshnessEvent }, { action: "mark_current", governance_context: "evidence_library", cluster_id: null, freshness_review_id: request.reviewId, previous_governance_revision: 2, new_governance_revision: 3 });
    assert.equal(count(database, `SELECT assertion_governance_revision AS count FROM claim_assertions WHERE id = '${LIBRARY_ASSERTION}'`), 3, "freshness advances the shared CAS revision");
    const replayed = await approveFreshnessReview(database.asD1(), request.reviewId, "publisher@example.test");
    assert.equal(replayed.replay, true);
    assert.equal(replayed.governanceEventId, approved.governanceEventId);

    // Accepted and current, but with no publication path: still not Ask evidence.
    assert.equal((await retrievePublishedEvidence(database.asD1(), question, 8)).length, 0, "no published story");
    assert.equal((await retrieveApprovedKnowledge(database.asD1(), question, 4)).length, 0, "no approved knowledge mapping");
    const queue = await listEvidenceLibrary(database.asD1(), { filter: "accepted" });
    const listed = queue.items.find((item) => item.assertionId === LIBRARY_ASSERTION)!;
    assert.deepEqual(listed.ineligibility, ["no_publication_path"], "only the publication path is missing");

    // A freshness change on a claim in a real story recalculates that story,
    // and only that story.
    seedLibrary(database, { assertionId: "storied", claimId: "storied-claim" });
    seedStory(database, STORY_ID, true, "storied-claim");
    seedStory(database, HOLDING_ID, false, "storied-claim");
    await governAssertionAdmission(database.asD1(), { ...libraryInput("admit", "storied-admit"), assertionId: "storied", context: "story", clusterId: STORY_ID });
    await governAssertionReviewerDecision(database.asD1(), { ...reviewInput("accept_review", "storied-accept"), assertionId: "storied", context: "story", clusterId: STORY_ID });
    const storiedRequest = await requestFreshnessReview(database.asD1(), {
      claimAssertionId: "storied", proposedState: "current", sourceDocumentVersionId: "version-storied",
      reason: "Checked.", actor: "publisher@example.test", idempotencyKey: "storied-fresh",
    });
    const storied = await approveFreshnessReview(database.asD1(), storiedRequest.reviewId, "publisher@example.test");
    assert.deepEqual(storied.recalculation?.storyIds, [STORY_ID], "only the genuinely associated story is recalculated");
    assert.equal(count(database, `SELECT COUNT(*) AS count FROM evidence_score_snapshots WHERE story_cluster_id = ${HOLDING_ID}`), 0);
  } finally {
    database.close();
  }
}

// 5. Worker routes: library bodies, scope spoofing and reader rejection.
async function signedRequest(path: string, body: string, role: "reader" | "publisher"): Promise<Request> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = await signInternalRequest(SECRET, "POST", path, body, { operator: `${role}@example.test`, role, timestamp, nonce });
  return new Request(`https://worker.example${path}`, {
    method: "POST", body,
    headers: {
      "Content-Type": "application/json", "X-Trace-Internal-Version": "v1", "X-Trace-Operator": `${role}@example.test`,
      "X-Trace-Role": role, "X-Trace-Timestamp": timestamp, "X-Trace-Nonce": nonce, "X-Trace-Signature": signature,
    },
  });
}

async function workerRoutes(): Promise<void> {
  assert.equal(authorisedRoute("assertion-review", "POST", "reader"), false, "the proxy never forwards reader mutations");
  assert.equal(authorisedRoute("assertion-governance-history", "GET", "reader"), true, "readers may read history");
  const database = new SQLiteD1();
  try {
    seedLibrary(database);
    seedStory(database, STORY_ID, true, "unrelated-route-claim");
    database.sqlite.exec("INSERT OR IGNORE INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality) VALUES ('unrelated-route-claim', 'Unrelated.', 'specification_defined', 'general', 'active', 'high')");
    const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET } as Env;
    const context = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const send = async (path: string, body: Record<string, unknown>, role: "reader" | "publisher" = "publisher") =>
      worker.fetch(await signedRequest(path, JSON.stringify(body), role), env, context);
    const body = { context: "evidence_library", assertionId: LIBRARY_ASSERTION, action: "admit", expected: expected(), reason: "Route test.", idempotencyKey: "route-lib" };

    assert.equal((await send("/admin/assertion-review", body, "reader")).status, 403, "readers cannot mutate");
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM assertion_governance_events"), 0);
    assert.equal((await send("/admin/assertion-review", { ...body, clusterId: STORY_ID })).status, 400, "library body cannot name a cluster");
    assert.equal((await send("/admin/assertion-review", { ...body, context: "story" })).status, 400, "story body needs a cluster");
    assert.equal((await send("/admin/assertion-review", { ...body, context: "anything" })).status, 400);
    assert.equal((await send("/admin/assertion-review", { ...body, context: undefined })).status, 400, "no scope at all is refused");
    assert.equal((await send("/admin/assertion-review", { ...body, context: "story", clusterId: STORY_ID, idempotencyKey: "route-forged" })).status, 409, "a forged story association is refused");
    const created = await send("/admin/assertion-review", body);
    assert.equal(created.status, 201);
    assert.equal(((await created.json()) as { context: string }).context, "evidence_library");
    assert.equal((await send("/admin/assertion-review", body)).status, 200, "replay");
    const review = await send("/admin/assertion-reviewer-decision", { ...body, action: "accept_review", expected: expected("admitted"), idempotencyKey: "route-lib-review" });
    assert.equal(review.status, 201);
  } finally {
    database.close();
  }
}

// 6. Migration preservation, foreign keys and replay compatibility.
async function migrationPreservation(): Promise<void> {
  const database = new SQLiteD1(true, true, true, true, false);
  try {
    seedLibrary(database, { assertionId: "migrated", claimId: "migrated-claim" });
    seedStory(database, STORY_ID, true, "migrated-claim");
    // A real 0074-shaped story admission, with the exact v1 fingerprint the
    // service computes, so its key must still replay after 0076.
    const v1Input = { assertionId: "migrated", clusterId: STORY_ID, action: "admit", expected: expected(), reason: "Pre-0076 admission.", actor: "publisher@example.test" };
    const fingerprintBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ version: "assertion-governance-v1", ...v1Input })));
    const fingerprint = Array.from(new Uint8Array(fingerprintBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    database.sqlite.exec(`
      UPDATE claim_assertions SET admission_state = 'admitted', assertion_governance_revision = 1 WHERE id = 'migrated';
      INSERT INTO assertion_governance_events
        (id, assertion_id, canonical_claim_id, cluster_id, action,
         previous_admission_state, new_admission_state, previous_reviewer_state, new_reviewer_state,
         previous_freshness_state, new_freshness_state, previous_admission_revision, new_admission_revision,
         previous_governance_revision, new_governance_revision, actor_email, actor_role, reason,
         request_id, idempotency_key, request_fingerprint, recalculation_job_id, created_at)
      VALUES ('legacy-event', 'migrated', 'migrated-claim', ${STORY_ID}, 'admit',
              'pending', 'admitted', 'proposed', 'proposed', 'unknown', 'unknown', 0, 1, 0, 1,
              'publisher@example.test', 'publisher', 'Pre-0076 admission.', 'legacy-request', 'legacy-key', '${fingerprint}', 'legacy-job', '2026-10-01 10:00:00');
      INSERT INTO assertion_governance_recalculation_jobs
        (id, event_id, assertion_id, canonical_claim_id, cluster_id, story_scope_json, state, attempt_count, result_json, completed_at)
      VALUES ('legacy-job', 'legacy-event', 'migrated', 'migrated-claim', ${STORY_ID}, '[${STORY_ID}]', 'completed', 1,
              '{"claimSnapshots":1,"storySnapshots":1,"statusChanges":0,"approvalRequests":0,"claimIds":["migrated-claim"],"storyIds":[${STORY_ID}]}', '2026-10-01 10:00:05');
    `);
    const before = database.sqlite.prepare("SELECT * FROM assertion_governance_events").all();
    database.sqlite.exec("PRAGMA foreign_keys = ON");
    database.sqlite.exec(readFileSync("db/migration-0076-evidence-library-governance.sql", "utf8"));
    const after = database.sqlite.prepare("SELECT * FROM assertion_governance_events").all() as Array<Record<string, unknown>>;
    assert.equal(after.length, before.length);
    for (const row of before as Array<Record<string, unknown>>) {
      const migrated = after.find((item) => item.id === row.id)!;
      for (const [key, value] of Object.entries(row)) assert.equal(migrated[key], value, `event ${row.id}.${key} preserved`);
      assert.equal(migrated.governance_context, "story");
      assert.equal(migrated.freshness_review_id, null);
    }
    const job = database.sqlite.prepare("SELECT governance_context, cluster_id, story_scope_json, state FROM assertion_governance_recalculation_jobs WHERE id = 'legacy-job'").get() as Record<string, unknown>;
    assert.deepEqual({ ...job }, { governance_context: "story", cluster_id: STORY_ID, story_scope_json: `[${STORY_ID}]`, state: "completed" });
    assert.deepEqual(database.sqlite.prepare("PRAGMA foreign_key_check").all(), [], "no dangling foreign keys");
    assert.equal((database.sqlite.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
    assert.equal(count(database, "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE '%_0074'"), 0, "no rebuild leftovers");
    for (const name of ["prevent_assertion_governance_event_update", "prevent_assertion_governance_event_delete",
      "prevent_assertion_governance_recalc_job_delete", "prevent_assertion_governance_recalc_job_identity_update",
      "idx_assertion_governance_events_transition", "idx_assertion_governance_events_revision",
      "idx_assertion_governance_events_freshness_review", "idx_claim_assertions_governance_queue"]) {
      assert.equal(count(database, `SELECT COUNT(*) AS count FROM sqlite_master WHERE name = '${name}'`), 1, `${name} exists`);
    }
    assert.throws(() => database.sqlite.exec("UPDATE assertion_governance_events SET reason = 'x'"), /append-only/);

    // The pre-0076 idempotency key replays through the new service.
    const replay = await governAssertionAdmission(database.asD1(), { ...v1Input, action: "admit", idempotencyKey: "legacy-key", requestId: "a-new-request" });
    assert.equal(replay.replay, true);
    assert.equal(replay.eventId, "legacy-event");
    assert.equal(replay.context, "story");
  } finally {
    database.close();
  }
}

// 7. Public story evidence is unaffected by library decisions.
async function publicationBoundary(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedLibrary(database);
    seedStory(database, STORY_ID, true, "public-claim");
    database.sqlite.exec("INSERT OR IGNORE INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality) VALUES ('public-claim', 'Public claim.', 'specification_defined', 'general', 'active', 'high')");
    const before = await getPublicStoryEvidence(database.asD1(), STORY_ID);
    await governAssertionAdmission(database.asD1(), libraryInput("admit", "pub-admit"));
    await governAssertionReviewerDecision(database.asD1(), reviewInput("accept_review", "pub-accept"));
    assert.deepEqual(await getPublicStoryEvidence(database.asD1(), STORY_ID), before, "a public story's evidence does not change");
  } finally {
    database.close();
  }
}

const statementCeiling = { max: 0 };
const originalRecord = SQLiteD1.prototype.recordStatement;
SQLiteD1.prototype.recordStatement = function record(sql: string, parameterCount: number) {
  statementCeiling.max = Math.max(statementCeiling.max, parameterCount);
  return originalRecord.call(this, sql, parameterCount);
};

await libraryDecisions();
await scopeValidation();
await forgedAssociations();
await concurrencyAndFreshness();
await workerRoutes();
await migrationPreservation();
await publicationBoundary();
assert.ok(statementCeiling.max <= D1_MAX_BOUND_PARAMETERS, `largest statement bound ${statementCeiling.max} parameters`);
console.log(`Evidence Library governance tests passed (largest statement: ${statementCeiling.max} bound parameters)`);
