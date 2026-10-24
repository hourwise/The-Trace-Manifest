import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// KNOWLEDGE-10: the Ask evaluation suite is an expectation fixture, not
// evidence. Keep it well-formed and keep its negative and hardware coverage.

interface GeneralCase { id: string; topic: string; kind: string; question: string; requiredEvidence: string[]; expectedAfterSeed: string; citationQuality: string; inference: string; gapAction: string }
interface HardwareCase { id: string; scenario: string; profile: string; workload: string; expected: string; currentOutcome: string }

const suite = JSON.parse(readFileSync("tests/fixtures/knowledge-10/ask-evaluation-suite.json", "utf8")) as {
  schemaVersion: string; conclusionModes: string[]; general: GeneralCase[]; hardware: HardwareCase[];
};

assert.equal(suite.schemaVersion, "knowledge-10-ask-evaluation-v1");

const ids = [...suite.general, ...suite.hardware].map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, "case ids are unique");

assert.ok(suite.general.length >= 20 && suite.general.length <= 30, "20-30 general questions");
for (const item of suite.general) {
  for (const field of ["topic", "kind", "question", "expectedAfterSeed", "citationQuality", "inference", "gapAction"] as const) {
    assert.ok(typeof item[field] === "string" && item[field].trim(), `${item.id}.${field}`);
  }
  assert.ok(Array.isArray(item.requiredEvidence) && item.requiredEvidence.length > 0, `${item.id}.requiredEvidence`);
  const mode = item.expectedAfterSeed.split(/[\s(;]/)[0];
  assert.ok(suite.conclusionModes.includes(mode) || item.kind.startsWith("negative_injection"), `${item.id} uses a known conclusion mode`);
}

const negativeKinds = new Set(suite.general.filter((item) => item.kind.startsWith("negative_")).map((item) => item.kind));
for (const kind of ["negative_unsupported", "negative_outdated", "negative_vendor_only", "negative_contradictory", "negative_out_of_scope", "negative_missing", "negative_injection_in_source"]) {
  assert.ok(negativeKinds.has(kind), `negative case present: ${kind}`);
}

// Vendor-only evidence never yields a supported conclusion.
for (const item of suite.general.filter((entry) => entry.kind === "negative_vendor_only")) {
  assert.ok(!item.expectedAfterSeed.startsWith("supported"), `${item.id} must not expect a supported answer`);
}

assert.ok(suite.hardware.length >= 12 && suite.hardware.length <= 20, "12-20 hardware scenarios");
for (const item of suite.hardware) {
  for (const field of ["scenario", "profile", "workload", "expected", "currentOutcome"] as const) {
    assert.ok(typeof item[field] === "string" && item[field].trim(), `${item.id}.${field}`);
  }
}
// The memory rules ADR 0019 requires must stay represented.
const hardwareText = suite.hardware.map((item) => `${item.scenario} ${item.expected}`).join("\n").toLowerCase();
for (const rule of ["never treated as one 32 gb device", "not active parameters", "no tokens-per-second figure invented", "never summed vram"]) {
  assert.ok(hardwareText.includes(rule), `hardware rule represented: ${rule}`);
}

console.log("knowledge-10 Ask evaluation suite fixture tests passed");
