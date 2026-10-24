import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BACKFILL_CEILINGS } from "../src/lib/server/knowledge-source-backfill";

// SEED-03: the first curated batch is local preparation only. This test keeps
// it consistent with the approved-list candidate (pilot-01), the database
// enums, the Ask evaluation suite and the capture ceilings in code.

type Assertion = { question: string; claimClass: string; sourceRole: string; relationship: string; treatment: string; directness: string; lookFor: string };
type BatchSource = {
  id: string;
  registry: { sourceId: number | null; action: "existing" | "register"; proposed?: { name: string; tier: string; treatment: string; copyrightStorageMode: string; licenceTerms: string } };
  identity: { format: string; versionPin: string; stabilityCheck: boolean; expectedOutcome: string };
  provenance: { originType: string; group: string };
  freshness: string;
  reviewEffort: string;
  expectedAssertions: Assertion[];
};

const read = (path: string) => readFileSync(path, "utf8");
const batch = JSON.parse(read("docs/knowledge-seed-batches/pilot-01-batch-01.json"));
const pilot = JSON.parse(read("docs/knowledge-seed/pilot-01.json"));
const suite = JSON.parse(read("tests/fixtures/knowledge-10/ask-evaluation-suite.json"));
const continuity = read("db/migration-0032-knowledge-continuity.sql");

/** The allowed values of the first `CHECK(column IN (...))` in a migration. */
function checkValues(sql: string, column: string): Set<string> {
  const match = new RegExp(`CHECK\\(${column} IN \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `no CHECK list for ${column}`);
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]));
}

const enums = {
  claimClass: checkValues(continuity, "claim_class"),
  relationship: checkValues(continuity.slice(continuity.indexOf("CREATE TABLE IF NOT EXISTS claim_assertions")), "relationship"),
  sourceRole: checkValues(continuity, "source_role"),
  directness: checkValues(continuity, "directness"),
  treatment: checkValues(continuity, "evidence_treatment"),
  originType: checkValues(continuity, "origin_type"),
  storage: checkValues(continuity, "copyright_storage_mode"),
};
const SOURCE_TREATMENTS = new Set(["primary-technical", "primary-research", "vendor-reported", "discovery"]);
const sources = batch.sources as BatchSource[];
const pilotById = new Map((pilot.sources as { id: string; registrySourceId: number | null; questions: string[]; identityStabilityCheck?: boolean }[]).map((source) => [source.id, source]));
const questionIds = new Set([...suite.general, ...suite.hardware].map((item: { id: string }) => item.id));

// Identity and scope.
assert.equal(batch.approval, "proposed", "only an owner decision approves a batch");
assert.equal(batch.environment, "preview");
assert.equal(batch.listId, pilot.listId);
const ids = sources.map((source) => source.id);
assert.equal(new Set(ids).size, ids.length, "no source appears twice");
assert.ok(ids.length <= BACKFILL_CEILINGS.maxRecords, "one plan never exceeds the record ceiling");
const excluded = (batch.excludedFromBatch as { id: string }[]).map((item) => item.id);
assert.deepEqual([...ids, ...excluded].sort(), [...pilotById.keys()].sort(), "batch plus exclusions is exactly the pilot list");
assert.deepEqual(excluded.sort(), ["S25", "S26", "S27"], "only the P-1 tests wait for the P-1 decision");

// Capture plan and budgets.
const { capture, d1 } = batch.budgets;
assert.equal(capture.storageMode, "private_full_text", "only private_full_text captures can become evidence");
assert.ok(capture.maxRecords <= BACKFILL_CEILINGS.maxRecords);
assert.ok(capture.concurrency <= BACKFILL_CEILINGS.maxConcurrency);
assert.ok(capture.maxBytesPerRecordKiB * 1024 <= BACKFILL_CEILINGS.maxBytesPerRecord);
assert.ok(capture.maxBytesPerBatchMiB * 1024 * 1024 <= BACKFILL_CEILINGS.maxTotalBytes);
assert.ok(capture.maxRetriesPerItem <= BACKFILL_CEILINGS.maxRetries);
assert.ok(capture.extractionPerRecord.maxBlocks <= BACKFILL_CEILINGS.maxExtractedBlocks);
assert.ok(capture.extractionPerRecord.maxCandidates <= BACKFILL_CEILINGS.maxCandidatesPerRecord);
assert.ok(capture.extractionPerRecord.maxProvenanceGroups <= BACKFILL_CEILINGS.maxProvenanceGroups);
const stabilityPasses = sources.filter((source) => source.identity.stabilityCheck).length;
assert.ok(capture.maxSourceRequests >= ids.length + stabilityPasses, "the request budget covers every fetch plus the second stability passes");
assert.ok(capture.maxSourceRequests <= 64, "within the pilot request limit (seeding plan, section 4)");
assert.ok(d1.stopRowsReadPerBatch <= 50_000 && d1.stopRowsWrittenPerBatch <= 10_000, "stop limits never exceed the seeding plan");
assert.ok(d1.targetRowsReadPerPhase <= d1.stopRowsReadPerBatch && d1.targetRowsWrittenPerPhase <= d1.stopRowsWrittenPerBatch);
assert.ok(d1.governanceSessionMaxAssertions * d1.measuredGovernanceRowsWrittenPerAssertion <= d1.targetRowsWrittenPerPhase,
  "a governance session fits the per-phase write target at the measured rate");

// Registry and identity.
for (const source of sources) {
  const listed = pilotById.get(source.id)!;
  if (listed.registrySourceId === null) {
    assert.equal(source.registry.action, "register", `${source.id} must be registered before capture`);
    const proposed = source.registry.proposed!;
    assert.ok(proposed.name && ["A", "B", "C"].includes(proposed.tier) && SOURCE_TREATMENTS.has(proposed.treatment), `${source.id} registry proposal`);
    assert.ok(enums.storage.has(proposed.copyrightStorageMode) && proposed.copyrightStorageMode !== "prohibited");
    assert.ok(proposed.licenceTerms.length > 0, `${source.id} records its licence position`);
  } else {
    assert.equal(source.registry.action, "existing");
    assert.equal(source.registry.sourceId, listed.registrySourceId, `${source.id} keeps its registry id`);
  }
  assert.equal(source.identity.stabilityCheck, listed.identityStabilityCheck === true, `${source.id} stability check matches the list`);
  assert.ok(source.identity.versionPin.length > 0 && source.identity.format.length > 0);
  assert.ok(enums.originType.has(source.provenance.originType), `${source.id} origin type`);
  assert.ok(["L", "M"].includes(source.reviewEffort));
  assert.ok(/^(\d+d|stable|on_spec_revision)$/.test(source.freshness), `${source.id} freshness interval`);
}

// Independence groups partition the batch.
const groups = batch.independenceGroups as Record<string, string[]>;
const grouped = Object.values(groups).flat();
assert.deepEqual([...grouped].sort(), [...ids].sort(), "every source sits in exactly one independence group");
for (const source of sources) assert.ok(groups[source.provenance.group]?.includes(source.id), `${source.id} group matches`);

// Expected assertions are valid rows and serve listed questions.
for (const source of sources) {
  assert.ok(source.expectedAssertions.length > 0, `${source.id} has a purpose`);
  for (const expected of source.expectedAssertions) {
    assert.ok(questionIds.has(expected.question), `${source.id} → ${expected.question} is an evaluation question`);
    assert.ok(pilotById.get(source.id)!.questions.includes(expected.question), `${source.id} → ${expected.question} is a listed target`);
    for (const key of ["claimClass", "relationship", "sourceRole", "directness", "treatment"] as const) {
      assert.ok(enums[key].has(expected[key]), `${source.id} ${key} '${expected[key]}' is allowed by the schema`);
    }
    assert.ok(expected.lookFor.length >= 20, "a reviewer prompt, not a label");
    if (source.provenance.originType === "vendor_statement") {
      assert.equal(expected.sourceRole, "reported_claim", `${source.id}: vendor sources are reported claims`);
      assert.notEqual(expected.claimClass, "independent_research_finding");
    } else {
      assert.equal(expected.sourceRole, "evidence");
    }
  }
}

// Review requirements are explicit.
assert.ok(batch.reviewRequirements.everyAssertion.length >= 5);
assert.ok(batch.reviewRequirements.neverAdmit.includes("metadata_only captures"));

console.log("SEED-03 batch-01 checks passed");
