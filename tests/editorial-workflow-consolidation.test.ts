import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import {
  getAssertionGovernanceHistory,
  type AssertionGovernanceHistoryEvent,
} from "../src/lib/server/assertion-governance-history";
import { signInternalRequest } from "../src/security/internal-signature";
import { extractClaimsFromItem } from "../workers/ingestion/extract-claims";
import worker, { type Env } from "../workers/ingestion/index";
import { authorisedRoute, buildWorkerAdminPath } from "../src/pages/api/admin/[...path]";

const SECRET = "h".repeat(32);
const CLUSTER_ID = 3301;
const CLAIM_ID = "editorial-history-claim";
const ASSERTION_ID = "editorial-history-assertion";

function seedFixture(database: SQLiteD1): void {
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (${CLUSTER_ID}, 'History source', 'https://history.example', 'A', 'A', 'primary-technical', 'rss');
    INSERT INTO feed_items
      (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status)
    VALUES (${CLUSTER_ID}, ${CLUSTER_ID}, 'https://history.example/story', 'history-feed-hash',
            'History story', 'Stored history evidence.', datetime('now'), 'published');
    INSERT INTO story_clusters
      (id, slug, title, topic, summary, publication_status, evidence_status)
    VALUES (${CLUSTER_ID}, 'history-story', 'History story', 'general',
            'A story used for governance history tests.', 'published', 'strongly_supported');
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
    VALUES (${CLUSTER_ID}, ${CLUSTER_ID}, 1);
    INSERT INTO source_documents
      (id, canonical_url, canonical_url_hash, source_id, media_kind,
       admission_state, copyright_storage_mode)
    VALUES ('history-source', 'https://history.example/story', 'history-url-hash',
            ${CLUSTER_ID}, 'html', 'admitted', 'private_full_text');
    INSERT INTO source_document_versions
      (id, source_document_id, content_hash, retrieved_url, retrieved_at,
       http_status, media_type, extraction_status, extraction_state, storage_state)
    VALUES ('history-version', 'history-source', 'history-content-hash',
            'https://history.example/story', '2026-09-10 08:00:00', 200, 'text/html',
            'captured', 'extracted', 'private_stored');
    INSERT INTO source_chunks
      (id, source_document_version_id, chunk_index, text_excerpt, text_hash,
       start_locator, end_locator)
    VALUES ('history-chunk', 'history-version', 0, 'Stored history evidence.',
            'history-chunk-hash', 'article:1', 'article:2');
    INSERT INTO provenance_groups
      (id, root_source_document_id, origin_type, explanation, determined_by,
       determination_method, reviewed_at)
    VALUES ('history-provenance', 'history-source', 'primary',
            'The stored source is the direct origin.', 'publisher@example.test',
            'editor_review', '2026-09-10 09:00:00');
    INSERT INTO canonical_claims
      (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES ('${CLAIM_ID}', 'The source supports the history test claim.',
            'specification_defined', 'general', 'active', 'high');
    INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
    VALUES (${CLUSTER_ID}, '${CLAIM_ID}', 'primary', 'high', 1);
    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id,
       start_locator, end_locator, assertion_text, relationship, source_role,
       directness, evidence_treatment, admission_state, freshness_state,
       provenance_group_id, extraction_method, extraction_version, confidence,
       reviewer_state)
    VALUES ('${ASSERTION_ID}', '${CLAIM_ID}', 'history-version', 'history-chunk',
            'article:1', 'article:2', 'Original immutable history assertion text.', 'supports',
            'evidence', 'direct', 'factual_support', 'admitted', 'current',
            'history-provenance', 'deterministic', 'test-v1', 0.95, 'proposed');
  `);
}

interface EventInput {
  id: string;
  action: "admit" | "reject" | "accept_review" | "reject_review";
  previousAdmission: string;
  newAdmission: string;
  previousReviewer: string;
  newReviewer: string;
  previousFreshness?: string;
  newFreshness?: string;
  previousAdmissionRevision?: number;
  newAdmissionRevision?: number;
  previousGovernanceRevision?: number;
  newGovernanceRevision?: number;
  reason?: string;
  requestId?: string;
  createdAt?: string;
}

function insertEvent(database: SQLiteD1, input: EventInput, index: number, job?: {
  state: "pending" | "running" | "completed" | "failed";
  attemptCount: number;
  lastError?: string | null;
  completedAt?: string | null;
}): void {
  const eventId = input.id;
  const jobId = `${eventId}-job`;
  const admissionEvent = input.action === "admit" || input.action === "reject";
  const previousAdmissionRevision = input.previousAdmissionRevision ?? (admissionEvent ? index : 1);
  const newAdmissionRevision = input.newAdmissionRevision ?? (admissionEvent ? previousAdmissionRevision + 1 : previousAdmissionRevision);
  const previousGovernanceRevision = input.previousGovernanceRevision ?? (admissionEvent ? previousAdmissionRevision : index);
  const newGovernanceRevision = input.newGovernanceRevision ?? (admissionEvent ? newAdmissionRevision : previousGovernanceRevision + 1);
  database.sqlite.prepare(`
    INSERT INTO assertion_governance_events
      (id, assertion_id, canonical_claim_id, governance_context, cluster_id, action,
       previous_admission_state, new_admission_state,
       previous_reviewer_state, new_reviewer_state,
       previous_freshness_state, new_freshness_state,
       previous_admission_revision, new_admission_revision,
       previous_governance_revision, new_governance_revision,
       actor_email, actor_role, reason, request_id, idempotency_key,
       request_fingerprint, recalculation_job_id, created_at)
    VALUES (?, ?, ?, 'story', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publisher', ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    ASSERTION_ID,
    CLAIM_ID,
    CLUSTER_ID,
    input.action,
    input.previousAdmission,
    input.newAdmission,
    input.previousReviewer,
    input.newReviewer,
    input.previousFreshness ?? "current",
    input.newFreshness ?? input.previousFreshness ?? "current",
    previousAdmissionRevision,
    newAdmissionRevision,
    previousGovernanceRevision,
    newGovernanceRevision,
    `publisher-${index}@example.test`,
    input.reason ?? `Governance history reason ${index}.`,
    input.requestId ?? `history-request-${index}`,
    `history-idempotency-${index}`,
    `${index}`.padStart(64, "0"),
    jobId,
    input.createdAt ?? `2026-09-10 10:00:${String(index).padStart(2, "0")}`,
  );
  if (job) {
    database.sqlite.prepare(`
      INSERT INTO assertion_governance_recalculation_jobs
        (id, event_id, assertion_id, canonical_claim_id, governance_context, cluster_id, story_scope_json,
         state, attempt_count, claim_snapshot_count, story_snapshot_count,
         status_change_count, approval_request_count, last_error, completed_at)
      VALUES (?, ?, ?, ?, 'story', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      jobId,
      eventId,
      ASSERTION_ID,
      CLAIM_ID,
      CLUSTER_ID,
      `[${CLUSTER_ID}]`,
      job.state,
      job.attemptCount,
      job.state === "completed" ? 1 : null,
      job.state === "completed" ? 1 : null,
      job.state === "completed" ? 1 : null,
      job.state === "completed" ? 0 : null,
      job.lastError ?? null,
      job.completedAt ?? null,
    );
  }
}

function assertEventShape(event: AssertionGovernanceHistoryEvent, expected: {
  action: string;
  axis: string;
  reason: string;
  status: string;
}): void {
  assert.equal(event.action, expected.action);
  assert.equal(event.axis, expected.axis);
  assert.equal(event.reason, expected.reason);
  assert.equal(event.actorEmail.endsWith("@example.test"), true);
  assert.equal(event.actorRole, "publisher");
  assert.equal(event.recalculation.status, expected.status);
  assert.equal(typeof event.recalculation.attemptCount, "number");
  assert.equal(event.replayStatus, "replays_reuse_this_event");
}

async function historyProjectionTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedFixture(database);
    const empty = await getAssertionGovernanceHistory(database.asD1(), CLUSTER_ID, ASSERTION_ID);
    assert.deepEqual(empty.events, []);
    assert.equal(empty.truncated, false);
    assert.equal(empty.order, "oldest_first");

    insertEvent(database, {
      id: "history-admission-event",
      action: "admit",
      previousAdmission: "pending",
      newAdmission: "admitted",
      previousReviewer: "proposed",
      newReviewer: "proposed",
      reason: "Admission reason from the publisher.",
      requestId: "history-admission-request",
      createdAt: "2026-09-10 10:00:00",
    }, 1, { state: "completed", attemptCount: 1, completedAt: "2026-09-10 10:00:02" });
    insertEvent(database, {
      id: "history-review-event",
      action: "accept_review",
      previousAdmission: "admitted",
      newAdmission: "admitted",
      previousReviewer: "proposed",
      newReviewer: "accepted",
      reason: "Editorial review reason from the publisher.",
      requestId: "history-review-request",
      createdAt: "2026-09-10 10:01:00",
    }, 2, { state: "pending", attemptCount: 2 });
    insertEvent(database, {
      id: "history-failed-event",
      action: "reject_review",
      previousAdmission: "admitted",
      newAdmission: "admitted",
      previousReviewer: "needs_research",
      newReviewer: "rejected",
      // One event per governance revision (migration 0076): this follows the
      // accept_review event, which moved the assertion from revision 2 to 3.
      previousGovernanceRevision: 3,
      newGovernanceRevision: 4,
      reason: "A later editorial review reason.",
      requestId: "history-failed-request",
      createdAt: "2026-09-10 10:02:00",
    }, 3, { state: "failed", attemptCount: 3, lastError: "internal failure" });

    const history = await getAssertionGovernanceHistory(database.asD1(), CLUSTER_ID, ASSERTION_ID);
    assert.equal(history.events.length, 3);
    assert.deepEqual(history.events.map((event) => event.eventId), [
      "history-admission-event", "history-review-event", "history-failed-event",
    ]);
    assertEventShape(history.events[0], {
      action: "admit", axis: "admission", reason: "Admission reason from the publisher.", status: "completed",
    });
    assert.equal(history.events[0].previous.admissionState, "pending");
    assert.equal(history.events[0].current.admissionState, "admitted");
    assert.equal(history.events[0].recalculation.completedAt, "2026-09-10 10:00:02");
    assertEventShape(history.events[1], {
      action: "accept_review", axis: "editorial_review", reason: "Editorial review reason from the publisher.", status: "queued",
    });
    assert.equal(history.events[1].previous.reviewerState, "proposed");
    assert.equal(history.events[1].current.reviewerState, "accepted");
    assertEventShape(history.events[2], {
      action: "reject_review", axis: "editorial_review", reason: "A later editorial review reason.", status: "failed",
    });
    assert.equal(history.events[2].recalculation.failureRecorded, true);

    const serialized = JSON.stringify(history);
    assert.equal(serialized.includes("idempotency"), false);
    assert.equal(serialized.includes("fingerprint"), false);
    assert.equal(serialized.includes("internal failure"), false);
    assert.equal(serialized.includes("history-admission-event-job"), false);

    const before = Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").get()?.count);
    const secondRead = await getAssertionGovernanceHistory(database.asD1(), CLUSTER_ID, ASSERTION_ID);
    assert.deepEqual(secondRead, history);
    const after = Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM assertion_governance_events").get()?.count);
    assert.equal(after, before, "history reads do not mutate the ledger");
  } finally {
    database.close();
  }
}

async function truncationAndAssociationTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedFixture(database);
    const admissionPairs = [
      ["pending", "admitted"], ["pending", "quarantined"], ["pending", "rejected"],
      ["admitted", "pending"], ["admitted", "quarantined"], ["admitted", "rejected"],
      ["quarantined", "pending"], ["quarantined", "admitted"], ["quarantined", "rejected"],
      ["rejected", "pending"], ["rejected", "admitted"], ["rejected", "quarantined"],
    ];
    const reviewerStates = ["proposed", "accepted", "amended", "rejected", "duplicate", "unsupported", "needs_research"];
    for (let index = 0; index < 51; index += 1) {
      const pair = admissionPairs[index % admissionPairs.length];
      const reviewerGroup = Math.floor(index / admissionPairs.length);
      insertEvent(database, {
        id: `history-truncation-${index}`,
        action: "admit",
        previousAdmission: pair[0],
        newAdmission: pair[1],
        previousReviewer: reviewerStates[reviewerGroup],
        newReviewer: reviewerStates[index % reviewerStates.length],
        createdAt: `2026-09-01 00:${String(index).padStart(2, "0")}:00`,
      }, 100 + index);
    }
    const history = await getAssertionGovernanceHistory(database.asD1(), CLUSTER_ID, ASSERTION_ID);
    assert.equal(history.limit, 50);
    assert.equal(history.events.length, 50);
    assert.equal(history.truncated, true);
    assert.equal(history.events[0].eventId, "history-truncation-0");
    assert.equal(history.events.at(-1)?.eventId, "history-truncation-49");

    database.sqlite.exec("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (3302, 'Unrelated story', 'unverified', 'review')");
    await assert.rejects(
      getAssertionGovernanceHistory(database.asD1(), 3302, ASSERTION_ID),
      (error: unknown) => error instanceof Error && error.message.includes("not associated"),
    );
    await assert.rejects(
      getAssertionGovernanceHistory(database.asD1(), CLUSTER_ID, "missing-assertion"),
      (error: unknown) => error instanceof Error && error.message.includes("Assertion not found"),
    );
    await assert.rejects(
      getAssertionGovernanceHistory(database.asD1(), 0, ASSERTION_ID),
      (error: unknown) => error instanceof Error && error.message.includes("positive clusterId"),
    );
  } finally {
    database.close();
  }
}

async function signedGet(path: string, role: "reader" | "publisher" = "reader"): Promise<Request> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = await signInternalRequest(SECRET, "GET", path, "", {
    operator: `${role}@example.test`, role, timestamp, nonce,
  });
  return new Request(`https://worker.example${path}`, {
    method: "GET",
    headers: {
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": `${role}@example.test`,
      "X-Trace-Role": role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": nonce,
      "X-Trace-Signature": signature,
    },
  });
}

async function signedPost(path: string, body: string, role: "reader" | "publisher"): Promise<Request> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
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
  assert.equal(authorisedRoute("assertion-governance-history", "GET", "reader"), true);
  assert.equal(authorisedRoute("assertion-governance-history", "GET", "publisher"), true);
  assert.equal(authorisedRoute("assertion-governance-history", "POST", "publisher"), false);
  assert.equal(buildWorkerAdminPath("assertion-governance-history", `?clusterId=${CLUSTER_ID}&assertionId=${ASSERTION_ID}`), `/admin/assertion-governance-history?clusterId=${CLUSTER_ID}&assertionId=${ASSERTION_ID}`);

  const database = new SQLiteD1();
  try {
    seedFixture(database);
    const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET } as Env;
    const executionContext = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const unsigned = await worker.fetch(new Request(`https://worker.example/admin/assertion-governance-history?clusterId=${CLUSTER_ID}&assertionId=${ASSERTION_ID}`), env, executionContext);
    assert.equal(unsigned.status, 401);
    const reader = await worker.fetch(await signedGet(`/admin/assertion-governance-history?clusterId=${CLUSTER_ID}&assertionId=${ASSERTION_ID}`), env, executionContext);
    assert.equal(reader.status, 200);
    assert.deepEqual(((await reader.json()) as { events?: unknown[] }).events, []);
    const invalid = await worker.fetch(await signedGet(`/admin/assertion-governance-history?clusterId=0&assertionId=${ASSERTION_ID}`), env, executionContext);
    assert.equal(invalid.status, 400);
    const missing = await worker.fetch(await signedGet(`/admin/assertion-governance-history?clusterId=${CLUSTER_ID}&assertionId=missing`), env, executionContext);
    assert.equal(missing.status, 404);
    database.sqlite.exec("INSERT INTO story_clusters (id, title, evidence_status, publication_status) VALUES (3302, 'Unrelated story', 'unverified', 'review')");
    const unrelated = await worker.fetch(await signedGet(`/admin/assertion-governance-history?clusterId=3302&assertionId=${ASSERTION_ID}`), env, executionContext);
    assert.equal(unrelated.status, 409);

    database.sqlite.exec(`UPDATE feed_items SET title = 'Model release', content_excerpt = 'OpenAI announced a new model called Trace. It supports a 128k token context window.' WHERE id = ${CLUSTER_ID}`);
    const readerExecute = await worker.fetch(await signedPost("/admin/extract-claims", "{}", "reader"), env, executionContext);
    assert.equal(readerExecute.status, 403, "reader cannot execute durable extraction");
    const publisherExecute = await worker.fetch(await signedPost("/admin/extract-claims", "{}", "publisher"), env, executionContext);
    assert.equal(publisherExecute.status, 200, "publisher can execute durable extraction through the Worker route");
    const firstExtraction = await publisherExecute.json() as { processed?: number; claimsExtracted?: number; evidenceCreated?: number };
    assert.equal(firstExtraction.processed, 1);
    assert.ok(Number(firstExtraction.claimsExtracted) > 0);
    assert.ok(Number(firstExtraction.evidenceCreated) > 0);
    const repeatedExecute = await worker.fetch(await signedPost("/admin/extract-claims", "{}", "publisher"), env, executionContext);
    assert.equal(repeatedExecute.status, 200);
    const repeatedExtraction = await repeatedExecute.json() as { processed?: number; claimsExtracted?: number; evidenceCreated?: number };
    assert.equal(repeatedExtraction.processed, 0, "pipeline stage makes repeated extraction a safe no-op");
    assert.equal(repeatedExtraction.claimsExtracted, 0);
    assert.equal(repeatedExtraction.evidenceCreated, 0);
  } finally {
    database.close();
  }
}

function pureExtractorTests(): void {
  const database = new SQLiteD1();
  try {
    seedFixture(database);
    const item = {
      id: CLUSTER_ID,
      source_id: CLUSTER_ID,
      external_id: null,
      url: "https://history.example/story",
      url_hash: "history-feed-hash",
      title: "Model release",
      summary: null,
      content_excerpt: "OpenAI announced a new model called Trace.",
      author: null,
      published_at: null,
      fetched_at: "2026-09-10 08:00:00",
      raw_metadata: null,
      ingestion_status: "published",
      duplicate_of: null,
      created_at: "2026-09-10 08:00:00",
    } as Parameters<typeof extractClaimsFromItem>[0];
    const before = Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM claim_assertions").get()?.count);
    const first = extractClaimsFromItem(item, "A", "primary-technical");
    const second = extractClaimsFromItem(item, "A", "primary-technical");
    assert.deepEqual(second, first, "pure extraction remains deterministic");
    assert.ok(first.length > 0);
    const after = Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM claim_assertions").get()?.count);
    assert.equal(after, before, "debug/pure extraction performs no canonical writes");
  } finally {
    database.close();
  }
}

function staticWorkflowTests(): void {
  const extractPage = readFileSync("src/pages/admin/extract-claims.astro", "utf8");
  const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8");
  const workerSource = readFileSync("workers/ingestion/index.ts", "utf8");
  const extractEngineSource = readFileSync("workers/ingestion/extract-claims.ts", "utf8");
  const proxySource = readFileSync("src/pages/api/admin/[...path].ts", "utf8");

  assert.doesNotMatch(extractPage, /runClaimExtraction/);
  assert.match(extractPage, /fetch\("\/api\/admin\/extract-claims"/);
  assert.match(extractPage, /extractClaimsFromItem/);
  assert.match(extractPage, /LIMIT 3/);
  assert.match(extractPage, /up to 50/);
  assert.match(extractPage, /no AI dependency/);
  assert.match(extractPage, /read-only diagnostic preview/);
  assert.match(extractPage, /Return to Review Queue/);
  assert.match(extractPage, /submitting/);
  assert.match(workerSource, /"\/admin\/extract-claims"/);
  assert.match(workerSource, /case "\/admin\/extract-claims"/);
  assert.match(workerSource, /runClaimExtraction\(env\.DB,/);
  assert.match(workerSource, /trigger: "scheduler"/);
  assert.match(extractEngineSource, /LIMIT 50/);

  assert.match(reviewPage, /No canonical claims are currently mapped to this story\./);
  assert.match(reviewPage, /Open deterministic claim extraction/);
  assert.match(reviewPage, /\/admin\/extract-claims\?returnTo=/);
  assert.match(reviewPage, /data-governance-history/);
  assert.match(reviewPage, /details\.addEventListener\("toggle"/);
  assert.match(reviewPage, /\/api\/admin\/assertion-governance-history\?clusterId=/);
  assert.equal((reviewPage.match(/\/api\/admin\/assertion-governance-history/g) ?? []).length, 1, "history has one lazy request site");
  assert.equal((reviewPage.match(/const evidenceRefreshed = await loadEditorialEvidence\(clusterId, true\);/g) ?? []).length, 2, "successful admission and reviewer decisions refresh open histories");
  assert.doesNotMatch(reviewPage, /runClaimExtraction/);
  assert.match(proxySource, /"assertion-governance-history"/);
}

await historyProjectionTests();
await truncationAndAssociationTests();
await routeSecurityTests();
pureExtractorTests();
staticWorkflowTests();
console.log("editorial workflow consolidation tests passed");
