#!/usr/bin/env node
import assert from "node:assert/strict";
import { BACKFILL_COST_POLICY_VERSION, estimateBackfillCost } from "./backfill-cost-report.mjs";

const inventory = {
  schemaVersion: "kc-11a-v1",
  generatedAt: "2026-07-27T00:00:00.000Z",
  totalItems: 5,
  counts: { published_story: 1, source_url: 2 },
  categories: {
    published_story: [{ id: "story-1", label: "Story", state: "published", origin: "test" }],
    approved_knowledge_document: [],
    correction: [],
    model: [],
    provider: [],
    benchmark: [],
    static_knowledge_page: [],
    guide: [],
    knowledge_authoring_input: [],
    source_url: [
      { id: "https://one.example", label: "https://one.example", state: "static_reference", url: "https://one.example", origin: "test" },
      { id: "https://two.example", label: "https://two.example", state: "static_reference", url: "https://two.example", origin: "test" },
    ],
  },
};

const report = estimateBackfillCost(inventory, {
  generatedAt: "2026-07-27T00:00:00.000Z",
  maxClaimsPerSource: 2,
  embeddingInputTokenCeiling: 32_000,
});

assert.equal(report.policyVersion, BACKFILL_COST_POLICY_VERSION);
assert.equal(report.inventory.contentItems, 1);
assert.equal(report.inventory.uniqueSourceUrls, 2);
assert.equal(report.execution.expectedDeterministicCalls, 2);
assert.equal(report.execution.expectedGovernedAiCalls, 2 * (3 + 2 + 2 + 1));
assert.equal(report.execution.expectedEmbeddingBatches, 2);
assert.equal(report.tasks.find((task) => task.taskType === "canonicalise_claim").calls, 4);
assert.equal(report.execution.budgetReserved, false);
assert.equal(report.execution.providerCalled, false);
assert.equal(report.review.status, "pending_explicit_approval");
assert.ok(report.totals.maxCostUsd > report.totals.extractionMaxCostUsd);
console.log("KC-11B backfill cost estimator tests passed.");
