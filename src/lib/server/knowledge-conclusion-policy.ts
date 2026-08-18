// KC-09G: deterministic sufficiency, confidence, and answer-mode selection.
//
// This policy consumes application-selected evidence mode plus D1-derived
// position quality. Recall similarity and model prose are intentionally absent
// from the inputs: they cannot upgrade an answer's evidence or conclusion mode.

export type KnowledgeEvidenceMode = "knowledge" | "researched" | "insufficient" | "out_of_scope" | "refused";
export type KnowledgeConclusionMode = "supported" | "qualified_lean" | "multiple_positions" | "insufficient_evidence";
export type KnowledgeConfidence = "high" | "medium" | "low" | "insufficient_evidence";

export interface KnowledgePositionAssessment {
  positionId: string;
  evidenceCount: number;
  currentEvidenceCount: number;
  directEvidenceCount: number;
  independentProvenanceGroupCount: number;
  strongEvidenceCount?: number;
  staleEvidenceCount?: number;
  disputedEvidenceCount?: number;
  derivativeOnly?: boolean;
}

export interface KnowledgePositionCompetition {
  leftPositionId: string;
  rightPositionId: string;
  unresolved?: boolean;
}

export interface KnowledgeConclusionPolicyInput {
  evidenceMode: KnowledgeEvidenceMode;
  positions: KnowledgePositionAssessment[];
  competitions?: KnowledgePositionCompetition[];
  whatCouldChange?: string[];
}

export interface KnowledgeConclusionPolicyResult {
  evidenceMode: KnowledgeEvidenceMode;
  conclusionMode: KnowledgeConclusionMode;
  confidence: KnowledgeConfidence;
  confidenceScore: number;
  confidenceReasons: string[];
  leanPositionId: string | null;
  sufficient: boolean;
  whatCouldChange: string[];
}

const MIN_SUPPORTED_SCORE = 60;
const MIN_LEAN_SCORE = 55;
const MIN_INDEPENDENT_GROUPS = 2;

function boundedInteger(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

function boundedScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function positionScore(position: KnowledgePositionAssessment): number {
  const evidenceCount = boundedInteger(position.evidenceCount);
  const current = Math.min(evidenceCount, boundedInteger(position.currentEvidenceCount));
  const direct = Math.min(current, boundedInteger(position.directEvidenceCount));
  const independent = boundedInteger(position.independentProvenanceGroupCount);
  const strong = Math.min(current, boundedInteger(position.strongEvidenceCount));
  const stale = Math.min(evidenceCount, boundedInteger(position.staleEvidenceCount));
  const disputed = Math.min(evidenceCount, boundedInteger(position.disputedEvidenceCount));
  if (evidenceCount === 0 || current === 0 || position.derivativeOnly) return 0;
  return boundedScore(
    Math.min(35, independent * 20)
      + Math.min(25, direct * 12)
      + Math.min(20, current * 8)
      + Math.min(15, strong * 8)
      + Math.min(5, evidenceCount)
      - Math.min(20, stale * 10)
      - Math.min(25, disputed * 15),
  );
}

function confidenceFor(score: number, sufficient: boolean): KnowledgeConfidence {
  if (!sufficient || score < 35) return "insufficient_evidence";
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function defaultWhatCouldChange(input: KnowledgeConclusionPolicyInput, conclusionMode: KnowledgeConclusionMode): string[] {
  if (input.whatCouldChange?.length) return [...new Set(input.whatCouldChange)].slice(0, 8);
  if (conclusionMode === "qualified_lean" || conclusionMode === "multiple_positions") {
    return ["A current, independently rooted source that directly tests or documents the competing position."];
  }
  if (conclusionMode === "insufficient_evidence") {
    return ["A current admitted source with a reviewed assertion and locator-backed evidence."];
  }
  return ["A material correction, supersession, or newly reviewed contradictory source."];
}

/** Select the conclusion mode only from D1-derived evidence quality. */
export function selectKnowledgeConclusion(
  input: KnowledgeConclusionPolicyInput,
): KnowledgeConclusionPolicyResult {
  const positions = input.positions
    .filter(position => Boolean(position.positionId))
    .map(position => ({ position, score: positionScore(position) }))
    .sort((left, right) => right.score - left.score || left.position.positionId.localeCompare(right.position.positionId));
  const reasons: string[] = [];
  const noAnswerMode = input.evidenceMode === "insufficient" || input.evidenceMode === "out_of_scope" || input.evidenceMode === "refused";
  const eligible = positions.filter(item => item.score > 0 && !item.position.derivativeOnly);
  const totalIndependentGroups = Math.max(0, ...eligible.map(item => boundedInteger(item.position.independentProvenanceGroupCount)));
  const strongest = eligible[0];
  const runnerUp = eligible[1];
  const competitionPairs = (input.competitions ?? []).filter(pair => pair.unresolved !== false);
  const hasMaterialCompetition = competitionPairs.length > 0 && eligible.length > 1;
  const strongestScore = strongest?.score ?? 0;
  const runnerUpScore = runnerUp?.score ?? 0;
  const margin = strongestScore - runnerUpScore;
  const corroborated = totalIndependentGroups >= MIN_INDEPENDENT_GROUPS;
  const strongSinglePosition = strongestScore >= MIN_SUPPORTED_SCORE
    && corroborated
    && (strongest?.position.directEvidenceCount ?? 0) > 0;

  let conclusionMode: KnowledgeConclusionMode;
  let sufficient = false;
  let leanPositionId: string | null = null;
  if (noAnswerMode || eligible.length === 0) {
    conclusionMode = "insufficient_evidence";
    reasons.push("The selected evidence mode does not permit a grounded conclusion.");
  } else if (hasMaterialCompetition) {
    if (strongestScore >= MIN_LEAN_SCORE && margin >= 20
      && (strongest?.position.independentProvenanceGroupCount ?? 0) >= 1
      && (strongest?.position.directEvidenceCount ?? 0) > 0) {
      conclusionMode = "qualified_lean";
      sufficient = true;
      leanPositionId = strongest.position.positionId;
      reasons.push("Multiple positions remain, but one has a material evidence-quality advantage.");
    } else {
      conclusionMode = "multiple_positions";
      sufficient = true;
      reasons.push("Multiple positions remain without a defensible evidence advantage.");
    }
  } else if (strongSinglePosition) {
    conclusionMode = "supported";
    sufficient = true;
    leanPositionId = strongest.position.positionId;
    reasons.push("The strongest position has current evidence from at least two independent provenance groups.");
  } else {
    conclusionMode = "insufficient_evidence";
    reasons.push("Evidence is current but below the corroboration or directness threshold.");
  }

  if (input.evidenceMode === "knowledge") reasons.push("The evidence packet is grounded in approved TRACE knowledge.");
  if (input.evidenceMode === "researched") reasons.push("The evidence packet is bounded research and is not permanent approved knowledge.");
  if (competitionPairs.length > 0) reasons.push(`${competitionPairs.length} unresolved competition pair${competitionPairs.length === 1 ? "" : "s"} was supplied.`);
  if (eligible.some(item => (item.position.staleEvidenceCount ?? 0) > 0)) reasons.push("Stale evidence was excluded from sufficiency credit.");
  if (eligible.some(item => (item.position.disputedEvidenceCount ?? 0) > 0)) reasons.push("Disputed evidence reduced the position score.");

  const confidenceScore = boundedScore(strongestScore * (conclusionMode === "multiple_positions" ? 0.85 : 1));
  return {
    evidenceMode: input.evidenceMode,
    conclusionMode,
    confidence: confidenceFor(confidenceScore, sufficient),
    confidenceScore,
    confidenceReasons: reasons,
    leanPositionId,
    sufficient,
    whatCouldChange: defaultWhatCouldChange(input, conclusionMode),
  };
}

export const evaluateKnowledgeConclusion = selectKnowledgeConclusion;
