// The Trace Manifest — Post-Generation Validation
// Phase 5: Validates model output before any answer is served.
// Per ADR-0008 section 9: every cited source must have been supplied,
// claims must be linked to evidence, analysis must be labelled.
// Validation failure → safe non-answer (never unvalidated publication).

import type {
  TraceAnswerDraft, TraceEditorialDraft, TracePredictionCandidate,
  EvidenceExcerpt,
} from "./provider";
import {
  validateAnswerDraft, validateEditorialDraft, validatePredictionCandidate,
  validateCitations, isTruncated,
} from "./schemas";

// ============================================================
// Validation outcome
// ============================================================

export interface PostValidationResult {
  passed: boolean;
  failures: string[];
  safeResponse?: TraceAnswerDraft;    // Safe non-answer if validation fails
  correctedDraft?: TraceAnswerDraft;  // Auto-corrected draft (rare)
}

export interface AnswerPolicyExpectation {
  evidenceMode: "knowledge" | "researched" | "insufficient" | "out_of_scope" | "refused";
  conclusionMode: "supported" | "qualified_lean" | "multiple_positions" | "insufficient_evidence";
  confidence: "high" | "medium" | "low" | "insufficient_evidence";
  leanPositionId?: string | null;
}

// ============================================================
// Answer validation
// ============================================================

export function validateAnswerOutput(
  draft: unknown,
  suppliedExcerpts: EvidenceExcerpt[],
  maxOutputTokens: number,
  expectedPolicy?: AnswerPolicyExpectation,
): PostValidationResult {
  const failures: string[] = [];

  // 1. Structural validation
  const structResult = validateAnswerDraft(draft);
  if (!structResult.valid) {
    failures.push(...structResult.errors);
    return { passed: false, failures, safeResponse: safeNonAnswer("Answer structure validation failed.") };
  }

  const answer = draft as TraceAnswerDraft;

  // 0. Application policy is authoritative; the model cannot choose modes or
  // confidence. A caller that has not yet wired KC-09G can omit this check
  // while still receiving the structural and identifier checks below.
  if (expectedPolicy) {
    if (answer.evidenceMode !== expectedPolicy.evidenceMode) failures.push("Model changed the application-selected evidenceMode.");
    if (answer.conclusionMode !== expectedPolicy.conclusionMode) failures.push("Model changed the application-selected conclusionMode.");
    if (answer.confidence !== expectedPolicy.confidence) failures.push("Model changed the application-selected confidence.");
    if (expectedPolicy.leanPositionId !== undefined && answer.lean !== expectedPolicy.leanPositionId) {
      failures.push("Model changed the application-selected lean position.");
    }
  }

  // 2. Citation validation — every cited source was supplied
  const suppliedSourceIds = suppliedExcerpts.map(e => e.sourceId);
  const suppliedClaimIds = suppliedExcerpts.filter(e => e.claimId).map(e => e.claimId!);
  const suppliedPairs = new Set(
    suppliedExcerpts.filter((excerpt) => excerpt.claimId).map((excerpt) => `${excerpt.sourceId}\u0000${excerpt.claimId}`),
  );
  const suppliedAssertions = new Map(
    suppliedExcerpts.filter((excerpt) => excerpt.assertionId).map((excerpt) => [excerpt.assertionId!, excerpt]),
  );
  const citationCheck = validateCitations(
    answer.citedSourceIds,
    answer.citedClaimIds,
    suppliedSourceIds,
    suppliedClaimIds,
  );

  if (!citationCheck.valid) {
    failures.push(
      `Unknown source IDs cited: ${citationCheck.unknownSourceIds.join(", ")}`,
      `Unknown claim IDs cited: ${citationCheck.unknownClaimIds.join(", ")}`,
    );
  }

  for (const [index, claim] of answer.claims.entries()) {
    const claimCheck = validateCitations(
      claim.evidenceSourceIds,
      claim.evidenceClaimIds,
      suppliedSourceIds,
      suppliedClaimIds,
    );
    const pairsAreValid = claim.evidenceClaimIds.every((claimId) =>
      claim.evidenceSourceIds.some((sourceId) => suppliedPairs.has(`${sourceId}\u0000${claimId}`)),
    );
    if (!claimCheck.valid || claim.evidenceSourceIds.length === 0 || claim.evidenceClaimIds.length === 0 || !pairsAreValid) {
      failures.push(`Claim ${index + 1} is not linked only to supplied evidence.`);
    }
    if (!suppliedClaimIds.includes(claim.claimId)) failures.push(`Claim ${index + 1} has an unknown claimId.`);
    for (const assertionId of claim.citationAssertionIds) {
      if (!suppliedAssertions.has(assertionId)) failures.push(`Claim ${index + 1} cites an unknown assertionId.`);
    }
  }
  const isRefusalOrNonAnswer = ["insufficient", "out_of_scope", "refused"].includes(answer.evidenceMode);
  if (answer.claims.length === 0 && !isRefusalOrNonAnswer) {
    failures.push("Answer has no evidence-linked claims.");
  }

  const positionIds = new Set<string>();
  for (const [index, position] of answer.positions.entries()) {
    if (positionIds.has(position.positionId)) failures.push(`Position ${index + 1} is duplicated.`);
    positionIds.add(position.positionId);
    if (position.sourceIds.some((id) => !suppliedSourceIds.includes(id))) failures.push(`Position ${index + 1} cites an unknown source.`);
    if ([...position.supportingClaimIds, ...position.contradictingClaimIds].some((id) => !suppliedClaimIds.includes(id))) {
      failures.push(`Position ${index + 1} cites an unknown claim.`);
    }
  }
  if (expectedPolicy && expectedPolicy.conclusionMode !== "insufficient_evidence" && answer.positions.length === 0) {
    failures.push("A conclusive answer must include at least one position.");
  }
  for (const [index, summary] of answer.sourceSummaries.entries()) {
    if (!suppliedSourceIds.includes(summary.sourceId)) failures.push(`Source summary ${index + 1} cites an unknown source.`);
  }
  for (const citation of answer.citations) {
    const supplied = suppliedAssertions.get(citation.assertionId);
    if (!supplied) {
      failures.push(`Citation references an unknown assertionId: ${citation.assertionId}`);
      continue;
    }
    if (supplied.sourceDocumentVersionId !== citation.sourceDocumentVersionId
      || supplied.sourceChunkId !== citation.sourceChunkId
      || supplied.startLocator !== citation.startLocator
      || supplied.endLocator !== citation.endLocator) {
      failures.push(`Citation ${citation.assertionId} does not match the supplied reviewed locator.`);
    }
  }

  // 3. Truncation check
  if (isTruncated(answer.answer, maxOutputTokens)) {
    failures.push("Output appears truncated — may not have completed generation.");
  }

  // 4. Content checks
  if (!answer.answer || answer.answer.trim().length < 10) {
    failures.push("Answer is too short or empty.");
  }

  // 5. Analysis must be labelled
  if (answer.analysis && answer.analysis.length > 0) {
    // Analysis is present — this is fine, it's labelled in the structure
    // But check it doesn't contain unlabelled factual claims
    if (answer.analysis.includes("is confirmed") || answer.analysis.includes("is proven")) {
      failures.push("Analysis section contains absolute certainty language — should be qualified.");
    }
  }

  // 6. Disagreements should not be suppressed
  const suppliedDisagreement = suppliedExcerpts.some((excerpt) => excerpt.isDisputed || excerpt.relationship === "contradicts");
  if (suppliedDisagreement && answer.disagreements.length === 0) failures.push("Material disagreement in the supplied evidence was omitted.");

  // 7. Confidence sanity check
  if (answer.proposedConfidence === "high" && suppliedExcerpts.length < 2) {
    failures.push("High confidence proposed with fewer than 2 evidence sources.");
  }

  if (failures.length > 0) {
    return {
      passed: false,
      failures,
      safeResponse: safeNonAnswer(`Answer validation failed: ${failures.join("; ")}`),
    };
  }

  return { passed: true, failures: [] };
}

// ============================================================
// Editorial validation
// ============================================================

export function validateEditorialOutput(
  draft: unknown,
  suppliedExcerpts: EvidenceExcerpt[],
): PostValidationResult {
  const failures: string[] = [];

  const structResult = validateEditorialDraft(draft);
  if (!structResult.valid) {
    failures.push(...structResult.errors);
    return { passed: false, failures };
  }

  const editorial = draft as TraceEditorialDraft;
  const suppliedSourceIds = suppliedExcerpts.map(e => e.sourceId);

  // Citation check
  const unknownSources = editorial.citedSourceIds.filter(id => !suppliedSourceIds.includes(id));
  if (unknownSources.length > 0) {
    failures.push(`Unknown source IDs cited: ${unknownSources.join(", ")}`);
  }

  // Summary should not be empty
  if (!editorial.summary || editorial.summary.trim().length < 20) {
    failures.push("Editorial summary is too short.");
  }

  if (failures.length > 0) {
    return { passed: false, failures };
  }

  return { passed: true, failures: [] };
}

// ============================================================
// Prediction validation
// ============================================================

export function validatePredictionOutput(
  candidates: unknown[],
): { passed: boolean; failures: string[]; validCandidates: TracePredictionCandidate[] } {
  const failures: string[] = [];
  const validCandidates: TracePredictionCandidate[] = [];

  if (!Array.isArray(candidates)) {
    return { passed: false, failures: ["Prediction output is not an array."], validCandidates: [] };
  }

  for (let i = 0; i < candidates.length; i++) {
    const result = validatePredictionCandidate(candidates[i]);
    if (!result.valid) {
      failures.push(`Candidate ${i}: ${result.errors.join("; ")}`);
    } else {
      const c = candidates[i] as TracePredictionCandidate;
      // Additional quality checks
      if (c.probability === 50) {
        failures.push(`Candidate ${i}: probability is exactly 50% — may indicate hedging.`);
      }
      if (c.prediction.length < 30) {
        failures.push(`Candidate ${i}: prediction text is too short.`);
      }
      if (!c.confirmationCriteria || c.confirmationCriteria.length < 10) {
        failures.push(`Candidate ${i}: confirmation criteria too vague.`);
      }
      validCandidates.push(c);
    }
  }

  return { passed: failures.length === 0, failures, validCandidates };
}

// ============================================================
// Safe non-answer (ADR-0008 section 11)
// ============================================================

function safeNonAnswer(reason: string): TraceAnswerDraft {
  return {
    answer: "TRACE was unable to produce a validated answer for this question. The available evidence may be insufficient, or the question may require information not currently in the TRACE corpus.",
    evidenceMode: "insufficient",
    conclusionMode: "insufficient_evidence",
    directAnswer: "TRACE does not have enough eligible evidence to answer this question reliably.",
    lean: null,
    whyLean: "No defensible lean was selected.",
    positions: [],
    sourceSummaries: [],
    confidence: "insufficient_evidence",
    confidenceScore: null,
    confidenceReasons: [reason],
    limitations: [reason],
    unresolvedQuestions: [],
    freshestEvidenceAt: null,
    keyPoints: ["No validated answer could be produced."],
    claims: [],
    citations: [],
    citedSourceIds: [],
    citedClaimIds: [],
    confirmedFacts: [],
    reportedClaims: [],
    disagreements: [],
    caveats: [`Validation failure: ${reason}`],
    whatCouldChange: "Additional evidence or a refined question may produce a validated answer.",
    proposedConfidence: "insufficient_evidence",
  };
}
