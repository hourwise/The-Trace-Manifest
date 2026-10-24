import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import { buildFreshnessDecisionPayload } from "../src/lib/admin/freshness-review-ui";
import { EvidenceFreshnessReviewError, rejectFreshnessReview } from "../src/lib/server/evidence-freshness-review";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";

// SEED-02 follow-up: rejecting a freshness review needs a human reason and a
// confirm step, like every assertion governance decision.

const SECRET = "f".repeat(32);

/** A pending review row; reject reads only this table, so the assertion key is not enforced. */
function seedReview(database: SQLiteD1, id: string): void {
  database.sqlite.exec("PRAGMA foreign_keys = OFF");
  database.sqlite.exec(`
    INSERT INTO evidence_freshness_reviews (id, claim_assertion_id, prior_state, proposed_state, reason, requested_by, idempotency_key, request_fingerprint)
    VALUES ('${id}', 'assertion-${id}', 'unknown', 'current', 'Checked the current version.', 'publisher@example.test', 'key-${id}', 'fingerprint-${id}')
  `);
  database.sqlite.exec("PRAGMA foreign_keys = ON");
}

function reviewRow(database: SQLiteD1, id: string): { state: string; review_note: string | null } {
  return database.sqlite.prepare("SELECT state, review_note FROM evidence_freshness_reviews WHERE id = ?").get(id) as { state: string; review_note: string | null };
}

async function rejectsWith(work: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error) => error instanceof EvidenceFreshnessReviewError && error.code === code);
}

function payloadBuilder(): void {
  assert.deepEqual(buildFreshnessDecisionPayload("approve", " review-1 ", ""), { operation: "approve", reviewId: "review-1" }, "approval note stays optional");
  assert.deepEqual(buildFreshnessDecisionPayload("approve", "review-1", " Checked. "), { operation: "approve", reviewId: "review-1", reviewNote: "Checked." });
  assert.throws(() => buildFreshnessDecisionPayload("reject", "review-1", ""), /rejection reason is required/);
  assert.throws(() => buildFreshnessDecisionPayload("reject", "review-1", "   \n "), /rejection reason is required/, "whitespace is not a reason");
  assert.deepEqual(buildFreshnessDecisionPayload("reject", "review-1", " Source moved. "), { operation: "reject", reviewId: "review-1", reviewNote: "Source moved." });
  assert.throws(() => buildFreshnessDecisionPayload("reject", "review-1", "x".repeat(2_001)), /2,000 characters/);
  assert.throws(() => buildFreshnessDecisionPayload("reject", " ", "Reason."), /review is required/);
}

async function serviceRequiresReason(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedReview(database, "service");
    await rejectsWith(rejectFreshnessReview(database.asD1(), "service", "publisher@example.test"), "rejection_reason_required");
    await rejectsWith(rejectFreshnessReview(database.asD1(), "service", "publisher@example.test", "  "), "rejection_reason_required");
    assert.equal(reviewRow(database, "service").state, "pending", "a reasonless rejection writes nothing");

    const rejected = await rejectFreshnessReview(database.asD1(), "service", "publisher@example.test", " Source was withdrawn. ");
    assert.equal(rejected.state, "rejected");
    assert.deepEqual({ ...reviewRow(database, "service") }, { state: "rejected", review_note: "Source was withdrawn." }, "the reason is recorded");
    assert.equal((await rejectFreshnessReview(database.asD1(), "service", "publisher@example.test", "Source was withdrawn.")).replay, true);
  } finally {
    database.close();
  }
}

async function signedRequest(body: string, role: "reader" | "publisher"): Promise<Request> {
  const path = "/admin/knowledge/freshness";
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

async function workerRequiresReason(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedReview(database, "route");
    const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: SECRET } as Env;
    const context = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
    const send = async (body: Record<string, unknown>, role: "reader" | "publisher" = "publisher") =>
      worker.fetch(await signedRequest(JSON.stringify(body), role), env, context);

    const missing = await send({ operation: "reject", reviewId: "route" });
    assert.equal(missing.status, 400, "reject without a reason is refused");
    assert.equal(((await missing.json()) as { code?: string }).code, "rejection_reason_required");
    assert.equal((await send({ operation: "reject", reviewId: "route", reviewNote: " \t " })).status, 400, "a blank reason is refused");
    assert.equal((await send({ operation: "reject", reviewId: "route", reviewNote: "Reader attempt." }, "reader")).status, 403, "readers cannot reject");
    assert.equal(reviewRow(database, "route").state, "pending", "refused rejections write nothing");

    const rejected = await send({ operation: "reject", reviewId: "route", reviewNote: "Superseded by a newer version." });
    assert.equal(rejected.status, 200);
    assert.deepEqual({ ...reviewRow(database, "route") }, { state: "rejected", review_note: "Superseded by a newer version." });
  } finally {
    database.close();
  }
}

function pageNeedsConfirmStep(): void {
  const page = readFileSync(new URL("../src/pages/admin/knowledge/freshness.astro", import.meta.url), "utf8");
  assert.match(page, /<button type="button"[^>]*data-reject-open>Reject<\/button>/, "Reject only opens the reason form");
  assert.match(page, /<button type="submit"[^>]*data-operation="reject">Confirm reject<\/button>/, "only Confirm reject submits a rejection");
  assert.equal((page.match(/data-operation="reject"/g) ?? []).length, 1, "no other control submits a rejection");
  assert.match(page, /class="reject-panel" hidden/, "the reason form starts closed");
  assert.match(page, /buildFreshnessDecisionPayload\(/, "the page validates through the shared builder");
}

payloadBuilder();
await serviceRequiresReason();
await workerRequiresReason();
pageNeedsConfirmStep();
console.log("freshness reject reason tests passed");
