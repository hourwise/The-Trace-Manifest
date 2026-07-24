import type { ClaimScoringInput } from "./evidence-scoring";
import type { EvidencePolicyEvaluationCase } from "./evidence-evaluation";

const assertion = (overrides: Partial<ClaimScoringInput["assertions"][number]> = {}): ClaimScoringInput["assertions"][number] => ({
  admissionState: "admitted", reviewerState: "accepted", freshnessState: "current",
  relationship: "supports", sourceRole: "evidence", directness: "direct",
  evidenceTreatment: "factual_support", provenanceGroupId: "root-1",
  provenanceOriginType: "primary", confidence: 0.95, ...overrides,
});

const baseClaim = (overrides: Partial<ClaimScoringInput> = {}): ClaimScoringInput => ({
  id: "fixture-claim", currentState: "active", materiality: "standard",
  claimClass: "specification_defined", assertions: [assertion()], ...overrides,
});

export function evidencePolicyEvaluationFixtures(): EvidencePolicyEvaluationCase {
  const vendorOnly = baseClaim({
    id: "vendor-only", claimClass: "official_vendor_claim",
    assertions: [assertion({ provenanceGroupId: "vendor-root", provenanceOriginType: "vendor_statement", directness: "direct" })],
  });
  const derivative = baseClaim({
    id: "derivative", assertions: [assertion({ provenanceGroupId: "derivative-root", provenanceOriginType: "vendor_statement", directness: "derivative" })],
  });
  const independentlyReproduced = baseClaim({
    id: "independently-reproduced",
    assertions: [
      assertion({ provenanceGroupId: "root-1", provenanceOriginType: "primary" }),
      assertion({ provenanceGroupId: "root-2", provenanceOriginType: "independent_test", relationship: "reproduces" }),
    ],
  });
  const disputed = baseClaim({ id: "disputed", currentState: "disputed", conflicts: [{ unresolved: true, materiality: "high" }] });
  const stale = baseClaim({ id: "stale", assertions: [assertion({ freshnessState: "stale" })] });
  const corrected = baseClaim({ id: "corrected", currentState: "corrected" });

  return {
    labels: [
      { id: "vendor-only", description: "Vendor-only claim remains vendor reported.", input: vendorOnly, expectedStatus: "vendor_reported", expectedDecision: "hold", scoreBand: { minimum: 0, maximum: 100 } },
      { id: "derivative", description: "Derivative coverage does not create corroboration.", input: derivative, expectedStatus: "unverified", expectedDecision: "hold", scoreBand: { minimum: 0, maximum: 44.99 } },
      { id: "independently-reproduced", description: "Independent reproduction supports confirmation.", input: independentlyReproduced, expectedStatus: "confirmed", expectedDecision: "accept", scoreBand: { minimum: 80, maximum: 100 } },
      { id: "disputed", description: "Material conflict remains disputed.", input: disputed, expectedStatus: "disputed", expectedDecision: "reject", scoreBand: { minimum: 0, maximum: 100 } },
      { id: "stale", description: "Stale evidence is outdated.", input: stale, expectedStatus: "outdated", expectedDecision: "hold", scoreBand: { minimum: 0, maximum: 100 } },
      { id: "corrected", description: "Corrected lifecycle state overrides score.", input: corrected, expectedStatus: "corrected", expectedDecision: "reject", scoreBand: { minimum: 0, maximum: 100 } },
    ],
    changes: [
      { id: "derivative-to-independent", description: "Independent reproduction increases support over derivative coverage.", before: derivative, after: independentlyReproduced, expectedDirection: "increase" },
      { id: "supported-to-disputed", description: "An unresolved material conflict reduces the score.", before: independentlyReproduced, after: disputed, expectedDirection: "decrease" },
      { id: "current-to-stale", description: "Evidence expiry reduces the score.", before: baseClaim({ id: "current" }), after: stale, expectedDirection: "decrease" },
    ],
  };
}
