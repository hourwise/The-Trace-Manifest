// The Trace Manifest — AI Schemas
// Phase 5: Runtime validation schemas for model inputs and outputs.
// Hand-rolled to avoid external dependencies in Worker environment.
// Validates structure, types, ranges, and required fields.

import type {
  EvidenceExcerpt,
} from "./provider";
import {
  independentEvidenceWeightFor, isKnownAdmissionState, isKnownFreshnessState,
  isKnownSourceKind, isTraceSourceKind, sourceRoleFor,
} from "./task-policy";

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

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function isOptionalString(v: unknown, maxLen: number): v is string | undefined {
  return v === undefined || isString(v, maxLen);
}

// ============================================================
// Evidence excerpt validator
// ============================================================

export function validateEvidenceExcerpt(v: unknown): v is EvidenceExcerpt {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return hasOnlyKeys(e, [
    "sourceId", "sourceKind", "sourceRole", "admissionState", "freshnessState", "independentEvidenceWeight",
    "claimId", "text", "sourceClassification", "sourceName", "sourceUrl",
    "observedAt", "publishedAt", "trustNotes", "relationship", "isDisputed",
    "externalEvidenceResolved", "assertionId", "sourceDocumentVersionId", "sourceChunkId",
    "startLocator", "endLocator", "knowledgeDocumentId",
    "canonicalClaimId", "provenanceGroupIds", "directness",
  ])
    && isString(e.sourceId, 128)
    && isKnownSourceKind(e.sourceKind)
    && (e.sourceRole === sourceRoleFor(e.sourceKind)
      || (e.sourceRole === "reported_claim" && !isTraceSourceKind(e.sourceKind)))
    && isKnownAdmissionState(e.admissionState)
    && isKnownFreshnessState(e.freshnessState)
    && e.independentEvidenceWeight === independentEvidenceWeightFor(e.sourceKind)
    && isOptionalString(e.claimId, 128)
    && isString(e.text, 8_000)
    && isString(e.sourceClassification, 300)
    && isOptionalString(e.sourceName, 300)
    && isOptionalString(e.sourceUrl, 2_048)
    && isOptionalString(e.observedAt, 64)
    && isOptionalString(e.publishedAt, 64)
    && isOptionalString(e.trustNotes, 1_000)
    && isOptionalString(e.relationship, 100)
    && (e.isDisputed === undefined || isBoolean(e.isDisputed))
    && (e.externalEvidenceResolved === undefined || isBoolean(e.externalEvidenceResolved))
    && isOptionalString(e.assertionId, 128)
    && isOptionalString(e.sourceDocumentVersionId, 128)
    && isOptionalString(e.sourceChunkId, 128)
    && isOptionalString(e.startLocator, 500)
    && isOptionalString(e.endLocator, 500)
    && isOptionalString(e.knowledgeDocumentId, 128)
    && isOptionalString(e.canonicalClaimId, 128)
    && (e.provenanceGroupIds === undefined || isStringArray(e.provenanceGroupIds, 32))
    && (e.directness === undefined || ["direct", "indirect", "derivative", "unknown"].includes(e.directness as string));
}

export function validateEvidenceExcerpts(excerpts: unknown, minimum = 0): ValidationResult {
  if (!isArray(excerpts, minimum, 16)) return fail(`evidenceExcerpts must be an array of ${minimum}–16 items`);
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
  if (!i || typeof i !== "object" || Array.isArray(i)) return fail("Input must be an object");
  if (!hasOnlyKeys(i, ["taskType", "question", "evidenceExcerpts", "timeWindow", "maxOutputTokens"])) {
    return fail("Ask TRACE input contains unknown fields");
  }

  if (i.taskType !== "ask_trace") return fail("taskType must be 'ask_trace'");
  if (!isString(i.question, 1000)) return fail("question is required, max 1000 characters");
  const evResult = validateEvidenceExcerpts(i.evidenceExcerpts, 0);
  if (!evResult.valid) return evResult;
  if (i.timeWindow !== undefined) {
    if (!i.timeWindow || typeof i.timeWindow !== "object" || Array.isArray(i.timeWindow)) {
      return fail("timeWindow must be an object when supplied");
    }
    const window = i.timeWindow as Record<string, unknown>;
    if (!hasOnlyKeys(window, ["from", "to"]) || !isOptionalString(window.from, 64) || !isOptionalString(window.to, 64)) {
      return fail("timeWindow may contain only bounded from and to values");
    }
  }
  if (!isNumber(i.maxOutputTokens, 1, 4000)) {
    return fail("maxOutputTokens must be 1–4000");
  }

  return ok();
}

export function validateEditorialInput(input: unknown): ValidationResult {
  const i = input as Record<string, unknown>;
  if (!i || typeof i !== "object" || Array.isArray(i)) return fail("Input must be an object");
  if (!hasOnlyKeys(i, ["taskType", "model", "instruction", "sourceMaterial", "editorialContext", "maxOutputTokens"])) {
    return fail("Editorial input contains unknown fields");
  }

  if (i.taskType !== "editorial") return fail("taskType must be 'editorial'");
  if (i.model !== undefined && i.model !== "deepseek-v4-flash" && i.model !== "deepseek-v4-pro") {
    return fail("model is not allowlisted");
  }
  if (!isString(i.instruction, 4000)) return fail("instruction is required, max 4000 characters");
  if (!isOptionalString(i.editorialContext, 4_000)) return fail("editorialContext must be bounded when supplied");

  if (!isArray(i.sourceMaterial, 1, 16)) return fail("sourceMaterial must contain 1–16 evidence items");
  const evResult = validateEvidenceExcerpts(i.sourceMaterial, 1);
  if (!evResult.valid) return evResult;

  if (!isNumber(i.maxOutputTokens, 1, 8000)) {
    return fail("maxOutputTokens must be 1–8000");
  }

  return ok();
}

export function validatePredictionInput(input: unknown): ValidationResult {
  const i = input as Record<string, unknown>;
  if (!i || typeof i !== "object" || Array.isArray(i)) return fail("Input must be an object");
  if (!hasOnlyKeys(i, ["taskType", "evidenceSummary", "candidateCount", "forecastWindow", "maxOutputTokens"])) {
    return fail("Prediction input contains unknown fields");
  }

  if (i.taskType !== "prediction") return fail("taskType must be 'prediction'");
  if (!isString(i.evidenceSummary, 8000)) return fail("evidenceSummary is required, max 8000 characters");
  if (!isNumber(i.candidateCount, 1, 5)) return fail("candidateCount must be 1–5");

  if (!i.forecastWindow || typeof i.forecastWindow !== "object" || Array.isArray(i.forecastWindow)) {
    return fail("forecastWindow is required");
  }
  const window = i.forecastWindow as Record<string, unknown>;
  if (!hasOnlyKeys(window, ["from", "to"]) || !isString(window.from, 64) || !isString(window.to, 64)) {
    return fail("forecastWindow requires bounded from and to values");
  }
  if (!isNumber(i.maxOutputTokens, 1, 8000)) {
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
  if (!hasOnlyKeys(o, [
    "answer", "evidenceMode", "conclusionMode", "directAnswer", "lean", "whyLean", "positions",
    "sourceSummaries", "confidence", "confidenceScore", "confidenceReasons", "limitations",
    "unresolvedQuestions", "freshestEvidenceAt", "keyPoints", "claims", "citations", "citedSourceIds",
    "citedClaimIds", "confirmedFacts", "reportedClaims", "analysis", "disagreements", "caveats",
    "whatCouldChange", "proposedConfidence",
  ])) errors.push("answer contains unknown fields");
  if (!isString(o.answer)) errors.push("answer is required and must be a non-empty string");
  const validEvidenceModes = ["knowledge", "researched", "insufficient", "out_of_scope", "refused"];
  if (!isString(o.evidenceMode) || !validEvidenceModes.includes(o.evidenceMode as string)) errors.push("evidenceMode is invalid");
  const validConclusionModes = ["supported", "qualified_lean", "multiple_positions", "insufficient_evidence"];
  if (!isString(o.conclusionMode) || !validConclusionModes.includes(o.conclusionMode as string)) errors.push("conclusionMode is invalid");
  if (!isString(o.directAnswer, 4_000)) errors.push("directAnswer is required and must be bounded");
  if (!(o.lean === null || isString(o.lean, 500))) errors.push("lean must be null or a bounded string");
  if (!isString(o.whyLean, 2_000)) errors.push("whyLean is required and must be bounded");
  if (!isArray(o.positions, 0, 8) || !(o.positions as unknown[]).every((position) => {
    if (!position || typeof position !== "object" || Array.isArray(position)) return false;
    const item = position as Record<string, unknown>;
    return hasOnlyKeys(item, ["positionId", "label", "summary", "supportingClaimIds", "contradictingClaimIds", "sourceIds"])
      && isString(item.positionId, 128) && isString(item.label, 300) && isString(item.summary, 2_000)
      && isStringArray(item.supportingClaimIds, 16) && isStringArray(item.contradictingClaimIds, 16)
      && isStringArray(item.sourceIds, 16)
      && ((item.supportingClaimIds as string[]).length + (item.contradictingClaimIds as string[]).length > 0);
  })) errors.push("positions must contain bounded evidence-linked position objects");
  if (!isArray(o.sourceSummaries, 0, 16) || !(o.sourceSummaries as unknown[]).every((summary) => {
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) return false;
    const item = summary as Record<string, unknown>;
    return hasOnlyKeys(item, ["sourceId", "sourceName", "sourceRole", "summary", "materialClaims", "caveats", "publishedAt", "retrievedAt"])
      && isString(item.sourceId, 128) && isString(item.sourceName, 300) && isString(item.sourceRole, 100)
      && isString(item.summary, 2_000) && isStringArray(item.materialClaims, 16)
      && isStringArray(item.caveats, 16) && (item.publishedAt === null || isString(item.publishedAt, 64))
      && (item.retrievedAt === null || isString(item.retrievedAt, 64));
  })) errors.push("sourceSummaries must contain bounded source summary objects");
  const validConfidences = ["high", "medium", "low", "insufficient_evidence"];
  if (!isString(o.confidence) || !validConfidences.includes(o.confidence as string)) errors.push("confidence is invalid");
  if (!(o.confidenceScore === null || isNumber(o.confidenceScore, 0, 100))) errors.push("confidenceScore must be null or 0-100");
  if (!isStringArray(o.confidenceReasons, 10) || !(o.confidenceReasons as string[]).every((item) => isString(item, 1_000))) errors.push("confidenceReasons must contain at most 10 bounded strings");
  if (!isStringArray(o.limitations, 10) || !(o.limitations as string[]).every((item) => isString(item, 1_000))) errors.push("limitations must contain at most 10 bounded strings");
  if (!isStringArray(o.unresolvedQuestions, 10) || !(o.unresolvedQuestions as string[]).every((item) => isString(item, 1_000))) errors.push("unresolvedQuestions must contain at most 10 bounded strings");
  if (!(o.freshestEvidenceAt === null || isString(o.freshestEvidenceAt, 64))) errors.push("freshestEvidenceAt must be null or a bounded timestamp");
  if (!isStringArray(o.keyPoints, 10) || !(o.keyPoints as string[]).every((item) => isString(item, 1_000))) errors.push("keyPoints must contain at most 10 bounded strings");
  if (!isArray(o.claims, 0, 20) || !(o.claims as unknown[]).every((claim) => {
    if (!claim || typeof claim !== "object") return false;
    const item = claim as Record<string, unknown>;
    return hasOnlyKeys(item, ["text", "evidenceSourceIds", "evidenceClaimIds", "claimId", "statement", "relationship", "citationAssertionIds"])
      && isString(item.text, 1000) && isString(item.claimId, 128) && isString(item.statement, 1_000)
      && isString(item.relationship, 100)
      && isStringArray(item.evidenceSourceIds, 16)
      && isStringArray(item.evidenceClaimIds, 16)
      && isStringArray(item.citationAssertionIds, 16)
      && (item.evidenceSourceIds as string[]).length > 0
      && (item.evidenceClaimIds as string[]).length > 0
      && (item.citationAssertionIds as string[]).length > 0;
  })) errors.push("claims must contain evidence-linked claim objects");
  if (!isArray(o.citations, 0, 32) || !(o.citations as unknown[]).every((citation) => {
    if (!citation || typeof citation !== "object" || Array.isArray(citation)) return false;
    const item = citation as Record<string, unknown>;
    return hasOnlyKeys(item, ["assertionId", "sourceDocumentVersionId", "sourceChunkId", "startLocator", "endLocator"])
      && isString(item.assertionId, 128) && isString(item.sourceDocumentVersionId, 128)
      && isString(item.sourceChunkId, 128) && isString(item.startLocator, 500) && isString(item.endLocator, 500);
  })) errors.push("citations must contain bounded assertion locator objects");
  if (!isStringArray(o.citedSourceIds, 16)) errors.push("citedSourceIds must contain at most 16 strings");
  if (!isStringArray(o.citedClaimIds, 16)) errors.push("citedClaimIds must contain at most 16 strings");
  if (!isStringArray(o.confirmedFacts, 10) || !(o.confirmedFacts as string[]).every((item) => isString(item, 1_000))) errors.push("confirmedFacts must contain at most 10 bounded strings");
  if (!isStringArray(o.reportedClaims, 10) || !(o.reportedClaims as string[]).every((item) => isString(item, 1_000))) errors.push("reportedClaims must contain at most 10 bounded strings");
  if (!isStringArray(o.disagreements, 10) || !(o.disagreements as string[]).every((item) => isString(item, 1_000))) errors.push("disagreements must contain at most 10 bounded strings");
  if (!isStringArray(o.caveats, 10) || !(o.caveats as string[]).every((item) => isString(item, 1_000))) errors.push("caveats must contain at most 10 bounded strings");
  if (o.analysis !== undefined && (typeof o.analysis !== "string" || o.analysis.length > 4_000)) errors.push("analysis must be a bounded string when supplied");
  if (!isString(o.whatCouldChange, 2_000)) errors.push("whatCouldChange is required and must be bounded");

  if (["insufficient", "out_of_scope", "refused"].includes(o.evidenceMode as string)
    && o.conclusionMode !== "insufficient_evidence") {
    errors.push("non-answer evidence modes require insufficient_evidence conclusionMode");
  }
  if (o.conclusionMode !== "insufficient_evidence" && Array.isArray(o.positions) && o.positions.length === 0) {
    errors.push("conclusive modes require at least one position");
  }
  if (o.conclusionMode === "qualified_lean" && o.lean === null) {
    errors.push("qualified_lean requires a selected lean position");
  }

  if (!isString(o.proposedConfidence) || !validConfidences.includes(o.proposedConfidence as string)) {
    errors.push(`proposedConfidence must be one of: ${validConfidences.join(", ")}`);
  }

  return errors.length === 0 ? ok() : fail(...errors);
}

export function validateEditorialDraft(output: unknown): ValidationResult {
  const o = output as Record<string, unknown>;
  if (!o || typeof o !== "object") return fail("Output must be an object");

  const errors: string[] = [];
  if (!hasOnlyKeys(o, [
    "headline", "summary", "analysis", "whyItMatters", "isNewsworthy", "keyPoints",
    "citedSourceIds", "caveats", "proposedConfidence",
  ])) errors.push("editorial output contains unknown fields");
  if (!isString(o.headline, 150)) errors.push("headline is required and must be at most 150 characters");
  if (!isString(o.summary, 2_000)) errors.push("summary is required and must be bounded");
  if (!isString(o.analysis, 4_000)) errors.push("analysis is required and must be bounded");
  if (!isString(o.whyItMatters, 300)) errors.push("whyItMatters is required and must be at most 300 characters");
  if (!isBoolean(o.isNewsworthy)) errors.push("isNewsworthy is required and must be a boolean");
  if (!isStringArray(o.keyPoints, 10) || !(o.keyPoints as string[]).every((item) => isString(item, 1_000))) errors.push("keyPoints must contain at most 10 bounded strings");
  if (!isStringArray(o.citedSourceIds, 16) || (o.citedSourceIds as string[]).length < 1) errors.push("citedSourceIds must contain 1–16 source IDs");
  if (!isStringArray(o.caveats, 10) || !(o.caveats as string[]).every((item) => isString(item, 1_000))) errors.push("caveats must contain at most 10 bounded strings");

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
