import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ASSERTION_REVIEWER_GOVERNANCE_REASON_MAX_LENGTH,
  buildAssertionReviewerGovernancePayload,
  createAssertionReviewerGovernanceIdempotencyKey,
  isAssertionReviewerGovernanceEligible,
  reviewerGovernanceDecisionMessage,
  reviewerGovernanceFailureMessage,
  shouldRefreshReviewerEvidenceAfterFailure,
  shouldRefreshReviewerPublishableClusters,
  shouldRenderAssertionReviewerGovernanceControls,
  type AssertionReviewerGovernanceResponse,
} from "../src/lib/admin/assertion-reviewer-governance-ui";
import type { EditorialAssertion } from "../src/lib/editorial-evidence-contract";

const reviewerStates: EditorialAssertion["reviewerState"][] = [
  "proposed", "needs_research", "accepted", "rejected", "amended", "duplicate", "unsupported",
];

function assertion(reviewerState: EditorialAssertion["reviewerState"], overrides: Partial<EditorialAssertion> = {}): EditorialAssertion {
  return {
    assertionId: "reviewer-ui-assertion",
    text: "An assertion used by the reviewer governance UI contract test.",
    relationship: "supports",
    sourceRole: "evidence",
    directness: "direct",
    evidenceTreatment: "factual_support",
    admissionState: "admitted",
    reviewerState,
    freshnessState: "current",
    confidence: 0.9,
    source: null,
    sourceDocument: null,
    provenance: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
}

for (const state of reviewerStates) {
  const eligible = state === "proposed" || state === "needs_research";
  assert.equal(isAssertionReviewerGovernanceEligible(state), eligible, `${state} eligibility`);
  assert.equal(shouldRenderAssertionReviewerGovernanceControls("publisher", state), eligible, `publisher ${state} visibility`);
  assert.equal(shouldRenderAssertionReviewerGovernanceControls("reader", state), false, `reader ${state} visibility`);
}

const key = createAssertionReviewerGovernanceIdempotencyKey();
assert.match(key, /^[0-9a-f-]{36}$/i);
const payload = buildAssertionReviewerGovernancePayload(
  3101,
  assertion("needs_research", { admissionState: "pending", freshnessState: "unknown" }),
  "accept_review",
  "  Publisher reviewed the stored source and assertion relationship.  ",
  key,
);
assert.deepEqual(payload, {
  clusterId: 3101,
  assertionId: "reviewer-ui-assertion",
  action: "accept_review",
  expected: {
    admissionState: "pending",
    reviewerState: "needs_research",
    freshnessState: "unknown",
  },
  reason: "Publisher reviewed the stored source and assertion relationship.",
  idempotencyKey: key,
});

const rejectPayload = buildAssertionReviewerGovernancePayload(
  3101,
  assertion("proposed"),
  "reject_review",
  "The cited source does not support this assertion.",
  "reject-review-key",
);
assert.equal(rejectPayload.action, "reject_review");

assert.throws(
  () => buildAssertionReviewerGovernancePayload(3101, assertion("accepted"), "reject_review", "reason", "key"),
  /no longer eligible for reviewer governance/,
);
assert.throws(
  () => buildAssertionReviewerGovernancePayload(3101, assertion("proposed"), "accept_review", "   ", "key"),
  /human reviewer reason is required/,
);
assert.throws(
  () => buildAssertionReviewerGovernancePayload(3101, assertion("proposed"), "accept_review", "x".repeat(ASSERTION_REVIEWER_GOVERNANCE_REASON_MAX_LENGTH + 1), "key"),
  /2,000 characters or fewer/,
);
assert.throws(
  () => buildAssertionReviewerGovernancePayload(3101, assertion("proposed"), "accept_review", "reason", "   "),
  /safe reviewer idempotency key is required/,
);

function response(
  action: "accept_review" | "reject_review",
  status: "completed" | "queued" | "replayed",
  publicationImpact: "unchanged" | "may_change" = "unchanged",
  replay = false,
): AssertionReviewerGovernanceResponse {
  return { success: true, action, recalculation: { status }, publicationImpact, replay };
}

assert.match(
  reviewerGovernanceDecisionMessage(response("accept_review", "completed", "may_change")),
  /reviewer acceptance recorded.*review axis.*does not admit.*mark it current.*recalculation completed/i,
);
assert.match(
  reviewerGovernanceDecisionMessage(response("reject_review", "queued")),
  /reviewer rejection recorded.*does not delete.*change its admission state.*remains queued/i,
);
assert.match(
  reviewerGovernanceDecisionMessage(response("accept_review", "replayed", "unchanged", true)),
  /original durable reviewer decision.*no second review event/i,
);
assert.equal(shouldRefreshReviewerPublishableClusters(response("accept_review", "completed", "may_change")), true);
assert.equal(shouldRefreshReviewerPublishableClusters(response("reject_review", "completed", "unchanged")), false);

assert.match(reviewerGovernanceFailureMessage(400, "invalid_reason", "fallback"), /reviewer reason/i);
assert.match(reviewerGovernanceFailureMessage(401, undefined, "fallback"), /fallback/);
assert.match(reviewerGovernanceFailureMessage(403, undefined, "fallback"), /permission.*reviewer decisions/i);
assert.match(reviewerGovernanceFailureMessage(404, undefined, "fallback"), /fallback/);
assert.match(reviewerGovernanceFailureMessage(409, "state_conflict", "fallback"), /changed since it was loaded.*refreshed/i);
assert.match(reviewerGovernanceFailureMessage(409, "invalid_transition", "fallback"), /no longer eligible/i);
assert.match(reviewerGovernanceFailureMessage(409, "idempotency_conflict", "fallback"), /new key/i);
assert.match(reviewerGovernanceFailureMessage(503, "recalculation_unavailable", "fallback"), /may already be durable.*same request key/i);
assert.equal(shouldRefreshReviewerEvidenceAfterFailure("state_conflict"), true);
assert.equal(shouldRefreshReviewerEvidenceAfterFailure("invalid_transition"), true);
assert.equal(shouldRefreshReviewerEvidenceAfterFailure("assertion_not_associated"), true);
assert.equal(shouldRefreshReviewerEvidenceAfterFailure("idempotency_conflict"), false);

const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8");
for (const label of ["Admission:", "Review:", "Freshness:", "Admit evidence", "Reject admission", "Accept assertion", "Reject review"]) {
  assert.match(reviewPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} remains explicit in the review UI`);
}
for (const marker of [
  "/api/admin/assertion-reviewer-decision",
  "data-assertion-reviewer-governance",
  "data-reviewer-action=\"accept_review\"",
  "data-reviewer-action=\"reject_review\"",
  "data-reviewer-form",
  "data-reviewer-reason",
  "focusReviewerGovernanceAction",
  "shouldRefreshReviewerPublishableClusters",
]) {
  assert.match(reviewPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${marker} is wired`);
}
for (const unsupported of ["data-reviewer-action=\"amended\"", "data-reviewer-action=\"duplicate\"", "data-reviewer-action=\"unsupported\"", "data-reviewer-action=\"needs_research\""]) {
  assert.equal(reviewPage.includes(unsupported), false, `${unsupported} is not exposed`);
}
assert.equal(reviewPage.includes("fetch(\"/admin/assertion-reviewer-decision"), false, "browser does not call the Worker route directly");

console.log("assertion reviewer governance UI tests passed");
