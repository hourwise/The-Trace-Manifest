// The Trace Manifest — AI Schemas
// Phase 5: Runtime validation schemas for model inputs and outputs.
// Hand-rolled to avoid external dependencies in Worker environment.
// Validates structure, types, ranges, and required fields.

import type {
  TraceAnswerInput, TraceEditorialInput, TracePredictionInput,
  TraceAnswerDraft, TraceEditorialDraft, TracePredictionCandidate,
  EvidenceExcerpt, TraceTaskInput,
} from "./provider";

// ============================================================
// Validation result
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult { return { valid: true, errors: [] }; }
function fail(...errors: string[]): ValidationResult { return { valid: false, errors }; }

// ============================================================
// Primitives
// ============================================================

function isString(v: unknown, maxLen?: number): v is string {
  return typeof v === "string" && v.length > 0 && (maxLen == null || v.length <= maxLen);
}

function isNumber(v: unknown, min?: number, max?: number): v is number {
  return typeof v === "number" && !isNaN(v) && (min == null || v >= min) && (max == null || v <= max);
}

function isArray(v: unknown, minLen?: number, maxLen?: number): v is unknown[] {
  return Array.isArray(v) && (minLen == null || v.length >= minLen) && (maxLen == null || v.length <= maxLen);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function isStringArray(v: unknown, maxLen?: number): v is string[] {
  return isArray(v, 0, maxLen) && v.every(item => typeof item === "string");
}

// ============================================================
// Evidence excerpt validator
// ============================================================

export function validateEvidenceExcerpt(v: unknown): v is EvidenceExcerpt {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return isString(e.sourceId) && isString(e.text) && isString(e.sourceClassification);
}

export function validateEvidenceExcerpts(excerpts: unknown): ValidationResult {
  if (!isArray(excerpts, 0, 16)) return fail("evidenceExcerpts must be an array of 0–16 items");
  for (let i = 0; i < (excerpts as unknown[]).length; i++) {
    if (!validateEvidenceExcerpt((excerpts as unknown[])[i])) {
      return fail(`evidenceExcerpts[${i}] is invalid — requires sourceId, text, sourceClassification`);
    }
  }
  return ok();
}

// ============================================================
// Task input validators
// ============================================================

export function validateAskTraceInput(input: unknown): ValidationResult {
  const i = input as Record<string, unknown>;
  if (!i || typeof i !== "object") return fail("Input must be an object");

  if (i.taskType !== "ask_trace") return fail("taskType must be 'ask_trace'");
  if (!isString(i.question, 1000)) return fail("question is required, max 1000 characters");

  const excerpts = i.evidenceExcerpts;
  if (excerpts !== undefined) {
    const evResult = validateEvidenceExcerpts(excerpts);
    if (!evResult.valid) return evResult;
  }

  if (i.maxOutputTokens !== undefined && !isNumber(i.maxOutputTokens, 1, 4000)) {
    return fail("maxOutputTokens must be 1–4000");
  }

  return ok();
}

export function validateEditorialInput(input: unknown): ValidationResult {
  const i = input as Record<string, unknown>;
  if (!i || typeof i !== "object") return fail("Input must be an object");

  if (i.taskType !== "editorial") return fail("taskType must be 'editorial'");
  if (!isString(i.instruction, 4000)) return fail("instruction is required, max 4000 characters");

  if (i.sourceMaterial !== undefined) {
    const evResult = validateEvidenceExcerpts(i.sourceMaterial);
    if (!evResult.valid) return evResult;
  }

  if (i.maxOutputTokens !== undefined && !isNumber(i.maxOutputTokens, 1, 8000)) {
    return fail("maxOutputTokens must be 1–8000");
  }

  return ok();
}

export function validatePredictionInput(input: unknown): ValidationResult {
  const i = input as Record<string, unknown>;
  if (!i || typeof i !== "object") return fail("Input must be an object");

  if (i.taskType !== "prediction") return fail("taskType must be 'prediction'");
  if (!isString(i.evidenceSummary, 8000)) return fail("evidenceSummary is required, max 8000 characters");
  if (!isNumber(i.candidateCount, 1, 5)) return fail("candidateCount must be 1–5");

  if (i.maxOutputTokens !== undefined && !isNumber(i.maxOutputTokens, 1, 8000)) {
    return fail("maxOutputTokens must be 1–8000");
  }

  return ok();
}

export function validateTaskInput(input: unknown, taskType: string): ValidationResult {
  switch (taskType) {
    case "ask_trace": return validateAskTraceInput(input);
    case "editorial": return validateEditorialInput(input);
    case "prediction": return validatePredictionInput(input);
    default: return fail(`Unknown taskType: ${taskType}`);
  }
}

// ============================================================
// Output validators
// ============================================================

export function validateAnswerDraft(output: unknown): ValidationResult {
  const o = output as Record<string, unknown>;
  if (!o || typeof o !== "object") return fail("Output must be an object");

  const errors: string[] = [];
  if (!isString(o.answer)) errors.push("answer is required and must be a non-empty string");
  if (!isStringArray(o.keyPoints)) errors.push("keyPoints must be a string array");
  if (!isStringArray(o.citedSourceIds)) errors.push("citedSourceIds must be a string array");
  if (!isStringArray(o.citedClaimIds)) errors.push("citedClaimIds must be a string array");
  if (!isStringArray(o.confirmedFacts)) errors.push("confirmedFacts must be a string array");
  if (!isStringArray(o.reportedClaims)) errors.push("reportedClaims must be a string array");
  if (!isStringArray(o.disagreements)) errors.push("disagreements must be a string array");
  if (!isStringArray(o.caveats)) errors.push("caveats must be a string array");

  const validConfidences = ["high", "medium", "low", "insufficient_evidence"];
  if (!isString(o.proposedConfidence) || !validConfidences.includes(o.proposedConfidence as string)) {
    errors.push(`proposedConfidence must be one of: ${validConfidences.join(", ")}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

export function validateEditorialDraft(output: unknown): ValidationResult {
  const o = output as Record<string, unknown>;
  if (!o || typeof o !== "object") return fail("Output must be an object");

  const errors: string[] = [];
  if (o.headline !== undefined && !isString(o.headline, 150)) errors.push("headline must be a non-empty string of at most 150 characters");
  if (!isString(o.summary)) errors.push("summary is required");
  if (!isString(o.analysis)) errors.push("analysis is required");
  if (o.whyItMatters !== undefined && !isString(o.whyItMatters, 300)) errors.push("whyItMatters must be a non-empty string of at most 300 characters");
  if (o.isNewsworthy !== undefined && !isBoolean(o.isNewsworthy)) errors.push("isNewsworthy must be a boolean");
  if (!isStringArray(o.keyPoints, 10)) errors.push("keyPoints must be a string array");
  if (!isStringArray(o.citedSourceIds, 16)) errors.push("citedSourceIds must be a string array");
  if (!isStringArray(o.caveats, 10)) errors.push("caveats must be a string array");

  const validConfidences = ["high", "medium", "low"];
  if (!isString(o.proposedConfidence) || !validConfidences.includes(o.proposedConfidence as string)) {
    errors.push(`proposedConfidence must be one of: ${validConfidences.join(", ")}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

export function validatePredictionCandidate(output: unknown): ValidationResult {
  const o = output as Record<string, unknown>;
  if (!o || typeof o !== "object") return fail("Output must be an object");

  const errors: string[] = [];
  if (!isString(o.title)) errors.push("title is required");
  if (!isString(o.prediction)) errors.push("prediction is required");
  if (!isNumber(o.probability, 0, 100)) errors.push("probability must be 0–100");
  if (!isString(o.reasoning)) errors.push("reasoning is required");
  if (!isString(o.confirmationCriteria)) errors.push("confirmationCriteria is required");
  if (!isString(o.failureCriteria)) errors.push("failureCriteria is required");

  return errors.length === 0 ? ok() : fail(...errors);
}

// ============================================================
// Citation validation (ADR-0008 section 9)
// ============================================================

export interface CitationCheckResult {
  valid: boolean;
  unknownSourceIds: string[];
  unknownClaimIds: string[];
  unsupportedClaims: string[];
}

export function validateCitations(
  citedSourceIds: string[],
  citedClaimIds: string[],
  suppliedSourceIds: string[],
  suppliedClaimIds: string[],
): CitationCheckResult {
  const suppliedSourceSet = new Set(suppliedSourceIds);
  const suppliedClaimSet = new Set(suppliedClaimIds);

  const unknownSourceIds = citedSourceIds.filter(id => !suppliedSourceSet.has(id));
  const unknownClaimIds = citedClaimIds.filter(id => !suppliedClaimSet.has(id));

  return {
    valid: unknownSourceIds.length === 0 && unknownClaimIds.length === 0,
    unknownSourceIds,
    unknownClaimIds,
    unsupportedClaims: [], // Populated by deeper validation
  };
}

// ============================================================
// Truncation detection
// ============================================================

export function isTruncated(text: string, maxTokens: number): boolean {
  // Heuristic: if output ends mid-sentence or at the exact token limit, likely truncated
  if (text.length === 0) return false;
  const lastChar = text[text.length - 1];
  const sentenceEnders = new Set([".", "!", "?", ")", "\"", "'", "]", "}"]);
  // If within 5% of max, flag for review
  const estimatedTokens = Math.ceil(text.length / 4); // rough ~4 chars/token
  if (estimatedTokens >= maxTokens * 0.95 && !sentenceEnders.has(lastChar)) {
    return true;
  }
  return false;
}
