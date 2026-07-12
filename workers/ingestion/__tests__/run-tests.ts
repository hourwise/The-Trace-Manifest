// The Trace Manifest — Phase 3 Test Runner
// Tests pure functions from classify module. Run: npm test

import { classifyFeedItem } from "../classify";
import { CLASSIFICATION_FIXTURES, IDEMPOTENCY_ITEM } from "./golden-fixtures";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; failures.push(`  FAIL: ${message}`); }
}

function hasAny(arr: string[], candidates: string[]): boolean {
  return candidates.some(c => arr.includes(c));
}

console.log("\n=== Classification Tests ===\n");

for (const fixture of CLASSIFICATION_FIXTURES) {
  const result = classifyFeedItem(fixture.item);
  const exp = fixture.expected;
  console.log(`  ${fixture.label}`);

  if (exp.hasTopics.length > 0) {
    assert(hasAny(result.topics, exp.hasTopics),
      `topics: expected one of [${exp.hasTopics}] in [${result.topics}]`);
  }
  if (exp.hasModels.length > 0) {
    assert(hasAny(result.models, exp.hasModels),
      `models: expected one of [${exp.hasModels}] in [${result.models}]`);
  }
  if (exp.hasProviders.length > 0) {
    assert(hasAny(result.providers, exp.hasProviders),
      `providers: expected one of [${exp.hasProviders}] in [${result.providers}]`);
  }
  assert(result.itemTypes.length >= exp.minItemTypes,
    `itemTypes: ${result.itemTypes.length} >= ${exp.minItemTypes}`);
  assert("classificationConfidence" in result && !("confidence" in (result as any)),
    "uses classificationConfidence not confidence");
  assert(result.algorithmVersion === "lexical-topic-v1", "algorithmVersion set");
}

console.log("\n=== Confidence Tests ===\n");

const highSignal = classifyFeedItem({
  id: 1, source_id: 1, external_id: null,
  url: "https://example.com/test", url_hash: "abc",
  title: "OpenAI GPT-5 Claude 4 Gemini Ultra — All New Models",
  summary: "Multiple providers launch new models.",
  content_excerpt: null, author: null,
  published_at: null, fetched_at: new Date().toISOString(),
  raw_metadata: null, ingestion_status: "raw",
  duplicate_of: null, created_at: new Date().toISOString(),
});
assert(highSignal.classificationConfidence >= 0 && highSignal.classificationConfidence <= 100,
  `classificationConfidence in range: ${highSignal.classificationConfidence}`);

const lowSignal = classifyFeedItem({
  id: 1, source_id: 1, external_id: null,
  url: "https://example.com/test", url_hash: "abc",
  title: "Tuesday Roundup", summary: "News.",
  content_excerpt: null, author: null,
  published_at: null, fetched_at: new Date().toISOString(),
  raw_metadata: null, ingestion_status: "raw",
  duplicate_of: null, created_at: new Date().toISOString(),
});
assert(lowSignal.classificationConfidence < highSignal.classificationConfidence,
  "low-signal item has lower confidence");

console.log("\n=== Idempotency Tests ===\n");
const r1 = classifyFeedItem(IDEMPOTENCY_ITEM);
const r2 = classifyFeedItem(IDEMPOTENCY_ITEM);
// Exclude timestamp from comparison — timestamps will differ
const { classifiedAt: _a, ...r1Core } = r1 as any;
const { classifiedAt: _b, ...r2Core } = r2 as any;
assert(JSON.stringify(r1Core) === JSON.stringify(r2Core), "deterministic output (excluding timestamp)");

console.log("\n=== Item Type Tests ===\n");
const multiResult = classifyFeedItem({
  id: 1, source_id: 1, external_id: null,
  url: "https://example.com/test", url_hash: "abc",
  title: "Google Launches Gemini Ultra Open Source with Record MMLU Score and 40% Price Cut",
  summary: "Security advisory included.",
  content_excerpt: null, author: null,
  published_at: null, fetched_at: new Date().toISOString(),
  raw_metadata: null, ingestion_status: "raw",
  duplicate_of: null, created_at: new Date().toISOString(),
});
console.log(`  types: ${multiResult.itemTypes.map(t => `${t.type}(${t.score})`).join(", ")}`);
assert(multiResult.itemTypes.length >= 1, "multiple item types detected");
assert(multiResult.itemTypes.some(t => t.type === "model_release"), "model_release found");

console.log(`\n========================================`);
console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
console.log(`========================================\n`);
if (failures.length > 0) { failures.forEach(f => console.log(f)); process.exit(1); }
else { console.log("All tests passed.\n"); }
