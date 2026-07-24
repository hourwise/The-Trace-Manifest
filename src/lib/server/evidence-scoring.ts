/**
 * KC-07A deterministic claim and story evidence scoring.
 *
 * This module is deliberately pure. It evaluates supplied reviewed records but
 * does not read D1, mutate story status, or create score snapshots. Triggering
 * and persistence belong to KC-07B/C.
 */

export const EVIDENCE_SCORE_POLICY_VERSION = "kc-07a-v1";

export type EvidenceStatus =
  | "confirmed" | "strongly_supported" | "provisionally_supported"
  | "vendor_reported" | "community_reported" | "disputed" | "unverified"
  | "corrected" | "superseded" | "outdated";

export type ClaimMateriality = "low" | "standard" | "high" | "critical";

export interface ScoringAssertion {
  admissionState: "pending" | "admitted" | "quarantined" | "rejected";
  reviewerState: "proposed" | "accepted" | "amended" | "rejected" | "duplicate" | "unsupported" | "needs_research";
  freshnessState: "current" | "stale" | "unknown";
  relationship: "supports" | "partially_supports" | "qualifies" | "contradicts" | "reports" | "reproduces" | "fails_to_reproduce" | "supersedes" | "corrects" | "contextualises";
  sourceRole: "evidence" | "reported_claim" | "discovery_context" | "internal_synthesis";
  directness: "direct" | "indirect" | "derivative" | "unknown";
  evidenceTreatment: "factual_support" | "attributed_opinion" | "context_only" | "discovery_only" | "internal_synthesis";
  provenanceGroupId: string | null;
  provenanceOriginType?: "primary" | "vendor_statement" | "independent_test" | "research" | "government" | "community" | "unknown";
  confidence: number;
}

export interface ScoringConflict {
  unresolved: boolean;
  materiality: ClaimMateriality;
}

export interface ClaimScoringInput {
  id: string;
  currentState: "active" | "qualified" | "disputed" | "corrected" | "superseded" | "retired";
  materiality: ClaimMateriality;
  claimClass: "specification_defined" | "official_vendor_claim" | "observed_implementation_behaviour" | "independent_research_finding" | "benchmark_result" | "community_report" | "legal_or_regulatory_statement" | "editorial_synthesis" | "trace_manifest_inference";
  assertions: ScoringAssertion[];
  conflicts?: ScoringConflict[];
}

export interface ClaimScoreComponents {
  sourceAdmissionAndDirectness: number;
  independentProvenance: number;
  primaryEvidence: number;
  reproductionSupport: number;
  freshness: number;
  consistency: number;
  unresolvedConflictPenalty: number;
  eligibleAssertionCount: number;
  eligibleProvenanceRoots: number;
}

export interface ClaimScore {
  claimId: string;
  score: number;
  evidenceStatus: EvidenceStatus;
  components: ClaimScoreComponents;
  policyVersion: string;
}

const MATERIALITY_WEIGHT: Record<ClaimMateriality, number> = {
  low: 1,
  standard: 2,
  high: 3,
  critical: 4,
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function usableAssertion(assertion: ScoringAssertion): boolean {
  return assertion.admissionState === "admitted"
    && ["accepted", "amended"].includes(assertion.reviewerState)
    && assertion.sourceRole === "evidence"
    && assertion.evidenceTreatment === "factual_support"
    && ["supports", "partially_supports", "qualifies", "reproduces"].includes(assertion.relationship)
    && !["attributed_opinion", "context_only", "discovery_only", "internal_synthesis"].includes(assertion.evidenceTreatment);
}

function confidenceFactor(confidence: number): number {
  return clamp(Number.isFinite(confidence) ? confidence : 0, 0, 1);
}

function directnessPoints(directness: ScoringAssertion["directness"]): number {
  return { direct: 25, indirect: 15, derivative: 5, unknown: 0 }[directness];
}

function primaryEvidencePoints(assertion: ScoringAssertion): number {
  const origin = assertion.provenanceOriginType ?? "unknown";
  const points = {
    primary: 15, government: 15, research: 15, independent_test: 14,
    vendor_statement: 8, community: 3, unknown: 0,
  }[origin];
  return points * confidenceFactor(assertion.confidence);
}

function isVendorOnly(input: ClaimScoringInput, assertions: ScoringAssertion[]): boolean {
  return input.claimClass === "official_vendor_claim"
    && assertions.length > 0
    && assertions.every((assertion) => (assertion.provenanceOriginType ?? "unknown") === "vendor_statement");
}

function isCommunityOnly(input: ClaimScoringInput, assertions: ScoringAssertion[]): boolean {
  return input.claimClass === "community_report"
    && assertions.length > 0
    && assertions.every((assertion) => (assertion.provenanceOriginType ?? "unknown") === "community");
}

/** Score one canonical claim from reviewed, admitted assertion records. */
export function scoreCanonicalClaim(input: ClaimScoringInput): ClaimScore {
  const assertions = input.assertions.filter(usableAssertion);
  const currentState = input.currentState;
  const provenanceRoots = new Set(assertions.map((assertion) => assertion.provenanceGroupId).filter(Boolean));
  const unresolvedConflicts = (input.conflicts ?? []).filter((conflict) => conflict.unresolved);
  const sourceAdmissionAndDirectness = assertions.length === 0
    ? 0
    : Math.max(...assertions.map((assertion) => directnessPoints(assertion.directness) * confidenceFactor(assertion.confidence)));
  const independentProvenance = clamp([...provenanceRoots].filter((root) => root !== null).length * 12.5, 0, 25);
  const primaryEvidence = assertions.length === 0 ? 0 : Math.min(15, Math.max(...assertions.map(primaryEvidencePoints)));
  const reproductionAssertions = assertions.filter((assertion) => assertion.relationship === "reproduces" || assertion.provenanceOriginType === "independent_test");
  const reproductionSupport = reproductionAssertions.length === 0
    ? 0
    : Math.min(15, Math.max(...reproductionAssertions.map((assertion) => 15 * confidenceFactor(assertion.confidence))));
  const freshness = assertions.length === 0
    ? 0
    : Math.max(...assertions.map((assertion) => assertion.freshnessState === "current" ? 10 : assertion.freshnessState === "unknown" ? 5 : 0));
  const unresolvedConflictPenalty = Math.min(10, unresolvedConflicts.reduce((total, conflict) => total + (conflict.materiality === "critical" || conflict.materiality === "high" ? 10 : 5), 0));
  const consistency = clamp(10 - unresolvedConflictPenalty);
  const components: ClaimScoreComponents = {
    sourceAdmissionAndDirectness: Math.round(sourceAdmissionAndDirectness * 100) / 100,
    independentProvenance,
    primaryEvidence: Math.round(primaryEvidence * 100) / 100,
    reproductionSupport: Math.round(reproductionSupport * 100) / 100,
    freshness,
    consistency,
    unresolvedConflictPenalty,
    eligibleAssertionCount: assertions.length,
    eligibleProvenanceRoots: provenanceRoots.size,
  };
  const score = Math.round(clamp(
    components.sourceAdmissionAndDirectness
      + components.independentProvenance
      + components.primaryEvidence
      + components.reproductionSupport
      + components.freshness
      + components.consistency
      - components.unresolvedConflictPenalty,
  ) * 100) / 100;

  let evidenceStatus: EvidenceStatus = "unverified";
  if (currentState === "corrected") evidenceStatus = "corrected";
  else if (currentState === "superseded" || currentState === "retired") evidenceStatus = "superseded";
  else if (unresolvedConflicts.length > 0 || currentState === "disputed") evidenceStatus = "disputed";
  else if (assertions.every((assertion) => assertion.freshnessState === "stale") && assertions.length > 0) evidenceStatus = "outdated";
  else if (isVendorOnly(input, assertions)) evidenceStatus = "vendor_reported";
  else if (isCommunityOnly(input, assertions)) evidenceStatus = "community_reported";
  else if (score >= 80 && components.primaryEvidence >= 8 && components.consistency === 10) evidenceStatus = "confirmed";
  else if (score >= 65 && components.eligibleProvenanceRoots >= 2 && components.primaryEvidence >= 8) evidenceStatus = "strongly_supported";
  else if (score >= 45 && components.eligibleAssertionCount > 0) evidenceStatus = "provisionally_supported";

  return { claimId: input.id, score, evidenceStatus, components, policyVersion: EVIDENCE_SCORE_POLICY_VERSION };
}

export interface StoryClaimForScoring extends ClaimScoringInput {
  materiality: ClaimMateriality;
}

export interface StoryScore {
  score: number;
  evidenceStatus: EvidenceStatus;
  claimScores: ClaimScore[];
  policyVersion: string;
}

/** Roll materiality-weighted claim scores up to a story score. */
export function scoreStory(claims: StoryClaimForScoring[]): StoryScore {
  const claimScores = claims.map(scoreCanonicalClaim);
  if (claimScores.length === 0) {
    return { score: 0, evidenceStatus: "unverified", claimScores, policyVersion: EVIDENCE_SCORE_POLICY_VERSION };
  }
  const totalWeight = claims.reduce((total, claim) => total + MATERIALITY_WEIGHT[claim.materiality], 0);
  const weightedScore = claimScores.reduce((total, score, index) => total + score.score * MATERIALITY_WEIGHT[claims[index].materiality], 0) / totalWeight;
  const score = Math.round(clamp(weightedScore) * 100) / 100;
  const statuses = claimScores.map((claim) => claim.evidenceStatus);
  let evidenceStatus: EvidenceStatus;
  if (statuses.includes("disputed")) evidenceStatus = "disputed";
  else if (statuses.includes("corrected")) evidenceStatus = "corrected";
  else if (statuses.includes("superseded")) evidenceStatus = "superseded";
  else if (statuses.every((status) => status === "vendor_reported")) evidenceStatus = "vendor_reported";
  else if (statuses.every((status) => status === "community_reported")) evidenceStatus = "community_reported";
  else if (score >= 80 && statuses.some((status) => status === "confirmed")) evidenceStatus = "confirmed";
  else if (score >= 65) evidenceStatus = "strongly_supported";
  else if (score >= 45 && statuses.some((status) => status !== "unverified" && status !== "outdated")) evidenceStatus = "provisionally_supported";
  else if (statuses.every((status) => status === "outdated")) evidenceStatus = "outdated";
  else evidenceStatus = "unverified";
  return { score, evidenceStatus, claimScores, policyVersion: EVIDENCE_SCORE_POLICY_VERSION };
}
