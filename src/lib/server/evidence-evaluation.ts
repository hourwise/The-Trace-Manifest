import { scoreCanonicalClaim, type ClaimScoringInput } from "./evidence-scoring";

export const EVIDENCE_POLICY_EVALUATION_VERSION = "kc-07f-v1";
export const PUBLIC_EVIDENCE_NUMERIC_SCORES_ENABLED = false;

export type EditorialDecision = "accept" | "hold" | "reject";
export type ExpectedScoreDirection = "increase" | "decrease" | "stable";

export interface EvidencePolicyLabel {
  id: string;
  description: string;
  input: ClaimScoringInput;
  expectedStatus: string;
  expectedDecision: EditorialDecision;
  scoreBand: { minimum: number; maximum: number };
}

export interface EvidenceScoreChangeLabel {
  id: string;
  description: string;
  before: ClaimScoringInput;
  after: ClaimScoringInput;
  expectedDirection: ExpectedScoreDirection;
}

export interface EvidencePolicyEvaluationCase {
  labels: EvidencePolicyLabel[];
  changes: EvidenceScoreChangeLabel[];
}

export interface EvidencePolicyEvaluationResult {
  evaluationVersion: string;
  policyVersion: string;
  labelCount: number;
  statusMatches: number;
  decisionMatches: number;
  scoreBandMatches: number;
  changeCount: number;
  changeDirectionMatches: number;
  statusAgreement: number;
  decisionAgreement: number;
  scoreBandAgreement: number;
  changeDirectionAgreement: number;
  publicNumericScoresEnabled: false;
  pass: boolean;
  failures: string[];
}

function direction(delta: number): ExpectedScoreDirection {
  if (delta > 0.01) return "increase";
  if (delta < -0.01) return "decrease";
  return "stable";
}

function editorialDecision(status: string): EditorialDecision {
  if (["confirmed", "strongly_supported", "provisionally_supported"].includes(status)) return "accept";
  if (["corrected", "superseded", "disputed"].includes(status)) return "reject";
  return "hold";
}

export function evaluateEvidencePolicy(
  evaluationCase: EvidencePolicyEvaluationCase,
): EvidencePolicyEvaluationResult {
  const failures: string[] = [];
  let statusMatches = 0;
  let decisionMatches = 0;
  let scoreBandMatches = 0;
  for (const label of evaluationCase.labels) {
    const score = scoreCanonicalClaim(label.input);
    const actualDecision = editorialDecision(score.evidenceStatus);
    const statusMatch = score.evidenceStatus === label.expectedStatus;
    const decisionMatch = actualDecision === label.expectedDecision;
    const scoreBandMatch = score.score >= label.scoreBand.minimum && score.score <= label.scoreBand.maximum;
    if (statusMatch) statusMatches++;
    else failures.push(`${label.id}: expected status ${label.expectedStatus}, got ${score.evidenceStatus}`);
    if (decisionMatch) decisionMatches++;
    else failures.push(`${label.id}: expected editorial decision ${label.expectedDecision}, got ${actualDecision}`);
    if (scoreBandMatch) scoreBandMatches++;
    else failures.push(`${label.id}: score ${score.score} outside ${label.scoreBand.minimum}-${label.scoreBand.maximum}`);
  }

  let changeDirectionMatches = 0;
  for (const change of evaluationCase.changes) {
    const before = scoreCanonicalClaim(change.before);
    const after = scoreCanonicalClaim(change.after);
    const actualDirection = direction(after.score - before.score);
    if (actualDirection === change.expectedDirection) changeDirectionMatches++;
    else failures.push(`${change.id}: expected score ${change.expectedDirection}, got ${actualDirection} (${before.score} → ${after.score})`);
  }

  const labelCount = evaluationCase.labels.length;
  const changeCount = evaluationCase.changes.length;
  const statusAgreement = labelCount === 0 ? 0 : statusMatches / labelCount;
  const decisionAgreement = labelCount === 0 ? 0 : decisionMatches / labelCount;
  const scoreBandAgreement = labelCount === 0 ? 0 : scoreBandMatches / labelCount;
  const changeDirectionAgreement = changeCount === 0 ? 0 : changeDirectionMatches / changeCount;
  const pass = labelCount > 0 && changeCount > 0
    && statusAgreement === 1
    && decisionAgreement === 1
    && scoreBandAgreement === 1
    && changeDirectionAgreement === 1;
  return {
    evaluationVersion: EVIDENCE_POLICY_EVALUATION_VERSION,
    policyVersion: "kc-07a-v1",
    labelCount, statusMatches, decisionMatches, scoreBandMatches,
    changeCount, changeDirectionMatches, statusAgreement, decisionAgreement,
    scoreBandAgreement, changeDirectionAgreement,
    publicNumericScoresEnabled: PUBLIC_EVIDENCE_NUMERIC_SCORES_ENABLED,
    pass, failures,
  };
}
