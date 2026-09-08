import assert from "node:assert/strict";
import {
  ASSERTION_GOVERNANCE_REASON_MAX_LENGTH,
  buildAssertionGovernancePayload,
  governanceDecisionMessage,
  governanceFailureMessage,
  isAssertionGovernanceEligible,
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

console.log("assertion governance UI tests passed");
