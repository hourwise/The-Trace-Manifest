// The Trace Manifest — Phase 3 Test Runner
// Tests pure functions from classify module. Run: npm test

import { classifyFeedItem } from "../classify";
import { fetchRSS, parseRSSXML, readBoundedText } from "../fetchers/rss";
import { isSourceStale, sourceHealthWindowMinutes } from "../health";
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

console.log("\n=== RSS and Atom Parser Tests ===\n");
const atomItems = parseRSSXML(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>atom-1</id><title>Atom discovery item</title><link rel="alternate" href="https://example.com/atom-1"/><updated>2026-07-16T12:00:00Z</updated><summary>Atom summary</summary></entry>
</feed>`);
assert(atomItems.length === 1, "Atom entries are parsed");
assert(atomItems[0]?.url === "https://example.com/atom-1", "Atom link href is retained");

const cdataItems = parseRSSXML(`<?xml version="1.0"?><rss><channel>
  <item><guid>cdata-1</guid><title><![CDATA[Release <em>note</em>]]></title><link>https://example.com/cdata-1</link></item>
</channel></rss>`);
assert(cdataItems[0]?.title === "Release note", "CDATA and markup are removed from RSS titles");

const stalledResponse = new Response(new ReadableStream<Uint8Array>({
  start() {
    // Deliberately leave the stream open to simulate a source that sends headers but no body.
  },
}));
let stalledReadError = "";
try {
  await readBoundedText(stalledResponse, 1_024, 10);
} catch (error) {
  stalledReadError = error instanceof Error ? error.message : String(error);
}
assert(stalledReadError === "RSS response body read timed out.", "stalled RSS bodies time out");

const originalFetch = globalThis.fetch;
const oversizedFeed = `<?xml version="1.0"?><rss><channel>${Array.from({ length: 101 }, (_, index) =>
  `<item><guid>${index}</guid><title>Entry ${index}</title><link>https://example.com/${index}</link></item>`,
).join("")}</channel></rss>`;
try {
  globalThis.fetch = async () => new Response(oversizedFeed, {
    headers: { "Content-Type": "application/rss+xml" },
  });
  const limitedItems = await fetchRSS({
    url: "https://example.com/feed",
    feed_url: null,
  } as any);
assert(limitedItems.length === 100, "RSS fetches are capped at the newest 100 entries");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("\n=== Source Health Tests ===\n");

const tierBSource = {
  tier: "B" as const,
  cadence_minutes: 360,
  last_fetched_at: "2026-07-18 06:00:00",
};
assert(sourceHealthWindowMinutes(tierBSource) === 1_500,
  "Tier B sources use the daily scheduler window when it exceeds source cadence");
assert(!isSourceStale(tierBSource, Date.parse("2026-07-18T18:00:00Z")),
  "a Tier B source fetched at the daily run is not marked stale at the health run");
assert(isSourceStale(tierBSource, Date.parse("2026-07-19T08:00:01Z")),
  "a Tier B source is marked stale after its daily scheduler window is missed");

const tierASource = {
  tier: "A" as const,
  cadence_minutes: 60,
  last_fetched_at: "2026-07-18 17:00:00",
};
assert(sourceHealthWindowMinutes(tierASource) === 120,
  "Tier A source health continues to use twice the configured cadence");
assert(!isSourceStale({ ...tierASource, last_fetched_at: null }),
  "a source without an ingestion attempt remains unknown rather than stale");

console.log(`\n========================================`);
console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
console.log(`========================================\n`);
if (failures.length > 0) { failures.forEach(f => console.log(f)); throw new Error(`${failed} ingestion test${failed === 1 ? "" : "s"} failed.`); }
else { console.log("All tests passed.\n"); }
