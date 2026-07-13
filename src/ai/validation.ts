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
  type ValidationResult, type CitationCheckResult,
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

// ============================================================
// Answer validation
// ============================================================

export function validateAnswerOutput(
  draft: unknown,
  suppliedExcerpts: EvidenceExcerpt[],
  maxOutputTokens: number,
): PostValidationResult {
  const failures: string[] = [];

  // 1. Structural validation
  const structResult = validateAnswerDraft(draft);
  if (!structResult.valid) {
    failures.push(...structResult.errors);
    return { passed: false, failures, safeResponse: safeNonAnswer("Answer structure validation failed.") };
  }

  const answer = draft as TraceAnswerDraft;

  // 2. Citation validation — every cited source was supplied
  const suppliedSourceIds = suppliedExcerpts.map(e => e.sourceId);
  const suppliedClaimIds = suppliedExcerpts.filter(e => e.claimId).map(e => e.claimId!);
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
  if (suppliedExcerpts.length >= 2 && answer.disagreements.length === 0) {
    // Not a hard failure, but note it
    // In production, check if the supplied excerpts actually contain disagreements
  }

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
    keyPoints: ["No validated answer could be produced."],
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
