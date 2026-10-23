import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { EvidenceExcerpt } from "../src/ai/provider";
import { evidenceReplayFingerprint } from "../src/lib/server/ask-evidence";

// SEED-01: /admin/ask replays a stored answer only while the governed evidence
// state is unchanged, so re-running the evaluation suite after a seeding batch
// is decided against the new evidence instead of the 7-day-old answer.

const base: EvidenceExcerpt = {
  sourceId: "source:doc-1", sourceKind: "external_primary", sourceRole: "evidence",
  admissionState: "admitted", freshnessState: "current", independentEvidenceWeight: 0,
  evidenceQuality: "moderate", claimId: "claim:a-1", canonicalClaimId: "cc-1", assertionId: "a-1",
  text: "Published claim.", sourceDocumentVersionId: "v-1", sourceChunkId: "chunk-1",
  startLocator: "p1", endLocator: "p2", relationship: "supports", isDisputed: false, provenanceGroupIds: ["g-1"],
};
const other: EvidenceExcerpt = { ...base, sourceId: "source:doc-2", claimId: "claim:a-2", assertionId: "a-2", provenanceGroupIds: ["g-2"] };

assert.equal(evidenceReplayFingerprint([base, other]), evidenceReplayFingerprint([other, base]), "order does not change the fingerprint");
assert.equal(evidenceReplayFingerprint([]), evidenceReplayFingerprint([]));
assert.notEqual(evidenceReplayFingerprint([]), evidenceReplayFingerprint([base]), "newly eligible evidence changes the key");
for (const [label, changed] of [
  ["freshness", { ...base, freshnessState: "stale" as const }],
  ["source version", { ...base, sourceDocumentVersionId: "v-2" }],
  ["locator", { ...base, endLocator: "p3" }],
  ["dispute", { ...base, isDisputed: true }],
  ["provenance", { ...base, provenanceGroupIds: ["g-1", "g-3"] }],
  ["quality", { ...base, evidenceQuality: "strong" as const }],
] as Array<[string, EvidenceExcerpt]>) {
  assert.notEqual(evidenceReplayFingerprint([base]), evidenceReplayFingerprint([changed]), `${label} change alters the replay key`);
}
assert.equal(evidenceReplayFingerprint([{ ...base, text: "Different prose only." }]), evidenceReplayFingerprint([base]),
  "display text alone does not invalidate a replay");

const route = readFileSync("src/pages/api/admin/ask.ts", "utf8");
assert.match(route, /idempotencyKeyHash: await hashPrivateIdentifier\(`admin-ask:\$\{secret\}:\$\{question\}:\$\{evidenceReplayFingerprint\(evidence\)\}`\)/,
  "the publisher Ask replay key includes the evidence fingerprint");

console.log("Ask replay key tests passed");
