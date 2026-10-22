import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ASSERTION_GOVERNANCE_REASON_MAX_LENGTH,
  buildAssertionGovernancePayload,
  governanceDecisionMessage,
  governanceFailureMessage,
  isAssertionGovernanceEligible,
  shouldKeepAssertionDetailsOpen,
  shouldRenderAssertionGovernanceControls,
  shouldRefreshEvidenceAfterFailure,
  shouldRefreshPublishableClusters,
} from "../src/lib/admin/assertion-governance-ui";
import type { EditorialAssertion } from "../src/lib/editorial-evidence-contract";

function assertion(admissionState: EditorialAssertion["admissionState"]): EditorialAssertion {
  return {
    assertionId: "assertion-ui-test",
    text: "A canonical assertion used by the focused UI contract test.",
    relationship: "supports",
    sourceRole: "evidence",
    directness: "direct",
    evidenceTreatment: "factual_support",
    admissionState,
    reviewerState: "accepted",
    freshnessState: "current",
    confidence: 0.9,
    source: null,
    sourceDocument: null,
    provenance: null,
    reviewedBy: null,
    reviewedAt: null,
  };
}

assert.equal(isAssertionGovernanceEligible("pending"), true);
assert.equal(isAssertionGovernanceEligible("quarantined"), true);
assert.equal(isAssertionGovernanceEligible("admitted"), false);
assert.equal(isAssertionGovernanceEligible("rejected"), false);
assert.equal(shouldRenderAssertionGovernanceControls("publisher", "pending"), true);
assert.equal(shouldRenderAssertionGovernanceControls("publisher", "quarantined"), true);
assert.equal(shouldRenderAssertionGovernanceControls("publisher", "admitted"), false);
assert.equal(shouldRenderAssertionGovernanceControls("reader", "pending"), false);

const payload = buildAssertionGovernancePayload(
  42,
  assertion("quarantined"),
  "admit",
  "  Publisher verified the cited source and its relationship to the claim.  ",
  "ui-test-idempotency-key",
);
assert.deepEqual(payload, {
  clusterId: 42,
  assertionId: "assertion-ui-test",
  action: "admit",
  expected: {
    admissionState: "quarantined",
    reviewerState: "accepted",
    freshnessState: "current",
  },
  reason: "Publisher verified the cited source and its relationship to the claim.",
  idempotencyKey: "ui-test-idempotency-key",
});
assert.equal(assertion("quarantined").admissionState, "quarantined");

assert.throws(
  () => buildAssertionGovernancePayload(42, assertion("pending"), "reject", "   ", "key"),
  /human reason is required/,
);
assert.throws(
  () => buildAssertionGovernancePayload(42, assertion("admitted"), "reject", "reason", "key"),
  /no longer eligible/,
);
assert.throws(
  () => buildAssertionGovernancePayload(42, assertion("pending"), "reject", "x".repeat(ASSERTION_GOVERNANCE_REASON_MAX_LENGTH + 1), "key"),
  /2,000 characters or fewer/,
);

assert.match(
  governanceDecisionMessage({
    success: true,
    action: "admit",
    recalculation: { status: "queued", jobId: "job-1" },
    publicationImpact: "may_change",
    replay: false,
  }),
  /queued and is not yet complete.*does not automatically mark.*accepted or current/,
);
assert.match(
  governanceDecisionMessage({
    success: true,
    action: "reject",
    recalculation: { status: "replayed" },
    publicationImpact: "unchanged",
    replay: true,
  }),
  /replayed safely.*does not delete or rewrite assertion history/,
);
assert.equal(shouldRefreshPublishableClusters({
  success: true,
  action: "admit",
  recalculation: { status: "completed" },
  publicationImpact: "may_change",
  replay: false,
}), true);
assert.equal(shouldRefreshPublishableClusters({
  success: true,
  action: "reject",
  recalculation: { status: "completed" },
  publicationImpact: "unchanged",
  replay: false,
}), false);

assert.match(governanceFailureMessage(503, "recalculation_unavailable", "fallback"), /may have been recorded/);
assert.match(governanceFailureMessage(409, "idempotency_conflict", "fallback"), /new decision with a new key/);
assert.equal(shouldRefreshEvidenceAfterFailure("state_conflict"), true);
assert.equal(shouldRefreshEvidenceAfterFailure("invalid_transition"), true);
assert.equal(shouldRefreshEvidenceAfterFailure("idempotency_conflict"), false);

// Every evidence reload follows a decision or conflict, so it must drop cached
// governance history before re-rendering; otherwise a history disclosure that
// was closed during the decision reopens with pre-decision events.
const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8").replace(/\r\n/g, "\n");
const loadEvidenceStart = reviewPage.indexOf("async function loadEditorialEvidence(");
const loadEvidenceEnd = reviewPage.indexOf("\n      }\n", loadEvidenceStart);
assert.ok(loadEvidenceStart >= 0 && loadEvidenceEnd > loadEvidenceStart, "loadEditorialEvidence is present");
const loadEvidence = reviewPage.slice(loadEvidenceStart, loadEvidenceEnd);
const cacheClear = loadEvidence.indexOf("assertionGovernanceHistoryCache.clear()");
assert.ok(cacheClear >= 0, "evidence reload invalidates cached governance history");
assert.ok(cacheClear < loadEvidence.indexOf("renderEditorialEvidence(data)"), "history cache is cleared before the refreshed evidence renders");
assert.ok(loadEvidence.includes("loadAssertionGovernanceHistory(assertionId, true)"), "open histories are still force-refreshed");

// Opening an admission or reviewer form re-renders the evidence panel, so the
// assertion row must stay expanded while either form is active; otherwise the
// just-opened reason form is hidden inside a collapsed row.
const admissionDrafts = new Map([["assertion-a", {}]]);
const reviewerDrafts = new Map([["assertion-b", {}]]);
assert.equal(shouldKeepAssertionDetailsOpen("assertion-a", admissionDrafts, reviewerDrafts), true);
assert.equal(shouldKeepAssertionDetailsOpen("assertion-b", admissionDrafts, reviewerDrafts), true);
assert.equal(shouldKeepAssertionDetailsOpen("assertion-c", admissionDrafts, reviewerDrafts), false);
assert.equal(shouldKeepAssertionDetailsOpen("assertion-a", new Map(), new Map()), false);
const assertionMarkupStart = reviewPage.indexOf("function assertionMarkup(");
const assertionMarkupSource = reviewPage.slice(assertionMarkupStart, reviewPage.indexOf("\n      }\n", assertionMarkupStart));
assert.match(assertionMarkupSource, /shouldKeepAssertionDetailsOpen\(assertion\.assertionId, assertionGovernanceDrafts, assertionReviewerGovernanceDrafts\)/,
  "assertion rows consult both draft maps");
assert.match(assertionMarkupSource, /<details data-assertion-details[^>]*\$\{detailsOpen\}/, "the assertion row renders open while a form is active");

console.log("assertion governance UI tests passed");
