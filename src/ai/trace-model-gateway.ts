import type {
  EvidenceExcerpt, TraceAIConfig, TraceAnswerDraft, TraceAnswerClaim, TraceAnswerPosition,
  TraceAnswerSourceSummary, TraceEditorialDraft, TraceModelId, TraceModelProvider, TraceAnswerDecision,
} from "./provider";
import { DeepSeekAPIError, DeepSeekProvider } from "./providers/deepseek";
import { buildConfig, configuredTaskDailyBudget, type TraceAIEnvironment } from "./config";
import { validateTaskInput } from "./schemas";
import { validateAnswerOutput, validateEditorialOutput, type AnswerPolicyExpectation } from "./validation";
import { validateModelAssignment } from "./model-router";
import {
  DurableAIGovernance,
  type DurableAIConfig,
  type ProviderUsageSettlement,
} from "./durable-governance";
import {
  calculateDeterministicConfidence,
  type DeterministicConfidence,
} from "../lib/server/ask-evidence";
import { isAnswerEligibleEvidence } from "./task-policy";
import { resolveAndValidateCitationReferences } from "../lib/server/knowledge-citation-resolution";
import {
  buildAskTraceDecisionPacket,
  type AskTraceDecisionPacket,
} from "../lib/server/ask-trace-decision";
import type { KnowledgeEvidenceMode } from "../lib/server/knowledge-conclusion-policy";

export type TraceAIRuntimeEnvironment = TraceAIEnvironment & {
  DB?: D1Database;
  /** Test-only/provider-neutral seam; production defaults to DeepSeek. */
  TRACE_MODEL_PROVIDER?: TraceModelProvider;
};

export interface AskTraceContext {
  requestId: string;
  idempotencyKeyHash: string;
  visitorHash: string;
  questionHash: string;
  question: string;
  evidenceExcerpts: EvidenceExcerpt[];
  /** Optional application-selected disposition for deterministic refusals/scope responses. */
  requestedEvidenceMode?: KnowledgeEvidenceMode;
  /** Routes may precompute this packet after retrieval; the gateway verifies and consumes it. */
  decisionPacket?: AskTraceDecisionPacket;
  /** When true, allows editorial-enabled override of the public Ask TRACE gate. */
  adminOverride?: boolean;
}

export interface PublicCitation {
  sourceId: string;
  claimId?: string;
  sourceName: string;
  sourceUrl?: string;
  sourceClassification: string;
  observedAt?: string;
  publishedAt?: string;
  assertionId?: string;
  sourceDocumentVersionId?: string;
  sourceChunkId?: string;
  startLocator?: string;
  endLocator?: string;
}

export interface AskTracePayload {
  answer: string;
  evidenceMode: TraceAnswerDraft["evidenceMode"];
  conclusionMode: TraceAnswerDraft["conclusionMode"];
  directAnswer: string;
  lean: string | null;
  whyLean: string;
  positions: TraceAnswerPosition[];
  sourceSummaries: TraceAnswerSourceSummary[];
  keyPoints: string[];
  claims: TraceAnswerClaim[];
  citations: PublicCitation[];
  confidence: DeterministicConfidence["label"];
  /** Numeric confidence is internal/admin-only until KC-07 calibration passes. */
  confidenceScore: number | null;
  confidenceReasons: string[];
  limitations: string[];
  unresolvedQuestions: string[];
  freshestEvidenceAt: string | null;
  freshestObservedAt: string | null;
  hasMaterialDisagreement: boolean;
  disagreements: string[];
  caveats: string[];
  whatCouldChange: string;
  requestId: string;
  nonAnswer: boolean;
}

export interface AskTraceResult {
  status: "ok" | "error" | "temporarily_unavailable" | "rate_limited" | "in_progress";
  requestId: string;
  payload?: AskTracePayload;
  message?: string;
}

function dollarsToMicrousd(value: number): number {
  return Math.ceil(value * 1_000_000);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimatedCost(config: TraceAIConfig, model: TraceModelId, inputTokens: number, outputTokens: number): number {
  const pricing = config.modelPricing[model];
  return (inputTokens * pricing.inputPerMillionUsd + outputTokens * pricing.outputPerMillionUsd) / 1_000_000;
}

function durableConfig(
  config: TraceAIConfig,
  env: TraceAIEnvironment,
  task: "ask_trace" | "editorial",
): DurableAIConfig {
  const fallback = task === "ask_trace" ? config.dailyPublicBudget : config.dailyPublicBudget;
  return {
    dailyBudgetMicrousd: dollarsToMicrousd(config.dailyPublicBudget),
    monthlyBudgetMicrousd: dollarsToMicrousd(config.monthlyPublicBudget),
    taskDailyBudgetMicrousd: dollarsToMicrousd(configuredTaskDailyBudget(env, task, fallback)),
    maxRequestMicrousd: dollarsToMicrousd(config.maxCostPerRequest),
    dailyQuestionsPerVisitor: config.dailyPublicQuestionsPerVisitor,
  };
}

function safeNonAnswer(
  requestId: string,
  confidence: DeterministicConfidence,
  reason: string,
  exposeNumericScore = false,
  policy?: AnswerPolicyExpectation,
): AskTracePayload {
  const evidenceMode = policy?.evidenceMode ?? "insufficient";
  const conclusionMode = policy?.conclusionMode ?? "insufficient_evidence";
  const governedScore = policy && typeof policy.confidenceScore === "number"
    ? Math.min(confidence.score, policy.confidenceScore)
    : confidence.score;
  return {
    answer: "TRACE does not have enough eligible published evidence to answer this question reliably.",
    evidenceMode,
    conclusionMode,
    directAnswer: "TRACE does not have enough eligible published evidence to answer this question reliably.",
    lean: policy?.leanPositionId ?? null,
    whyLean: policy?.leanPositionId
      ? "TRACE selected this lean from the deterministic evidence policy."
      : "No defensible lean was selected.",
    positions: [],
    sourceSummaries: [],
    keyPoints: [],
    claims: [],
    citations: [],
    confidence: "insufficient_evidence",
    confidenceScore: exposeNumericScore ? governedScore : null,
    confidenceReasons: [...confidence.reasons, reason],
    limitations: [reason],
    unresolvedQuestions: [],
    freshestEvidenceAt: confidence.freshestObservedAt,
    freshestObservedAt: confidence.freshestObservedAt,
    hasMaterialDisagreement: confidence.hasMaterialDisagreement,
    disagreements: [],
    caveats: [reason],
    whatCouldChange: policy?.whatCouldChange ?? "Additional reviewed and published evidence may make an answer possible.",
    requestId,
    nonAnswer: true,
  };
}

function unresolvedKnowledgeWarning(evidence: EvidenceExcerpt[]): string | null {
  const unresolvedCount = evidence.filter((item) =>
    item.sourceKind === "trace_knowledge"
    && item.externalEvidenceResolved !== true,
  ).length;
  if (unresolvedCount === 0) return null;
  return `${unresolvedCount} approved TRACE knowledge record${unresolvedCount === 1 ? " was" : "s were"} found, but could not be used as evidence because the external claim and source bundle are unresolved.`;
}

function citationsFor(draft: TraceAnswerDraft, evidence: EvidenceExcerpt[]): PublicCitation[] {
  const citedSources = new Set([
    ...draft.citedSourceIds,
    ...draft.claims.flatMap((claim) => claim.evidenceSourceIds),
  ]);
  const citedClaims = new Set([
    ...draft.citedClaimIds,
    ...draft.claims.flatMap((claim) => claim.evidenceClaimIds),
  ]);
  return evidence
    .filter((item) => citedSources.has(item.sourceId) || Boolean(item.claimId && citedClaims.has(item.claimId))
      || draft.citations.some((citation) => citation.assertionId === item.assertionId))
    .map((item) => ({
      sourceId: item.sourceId,
      claimId: item.claimId,
      sourceName: item.sourceName ?? item.sourceId,
      sourceUrl: item.sourceUrl,
      sourceClassification: item.sourceClassification,
      observedAt: item.observedAt,
      publishedAt: item.publishedAt,
      assertionId: item.assertionId,
      sourceDocumentVersionId: item.sourceDocumentVersionId,
      sourceChunkId: item.sourceChunkId,
      startLocator: item.startLocator,
      endLocator: item.endLocator,
    }));
}

function policyExpectationFromDecision(decision: AskTraceDecisionPacket): AnswerPolicyExpectation {
  return {
    evidenceMode: decision.evidenceMode,
    conclusionMode: decision.conclusionMode,
    confidence: decision.confidence,
    confidenceScore: decision.confidenceScore,
    leanPositionId: decision.leanPositionId,
    positionIds: decision.positions.map(position => position.id),
    whatCouldChange: decision.whatCouldChange.join(" "),
  };
}

/**
 * Compatibility adapter for direct pre-KC-09 gateway callers that provide only
 * the old excerpt shape. Public/admin routes always provide structured D1
 * grouping metadata and never use this fallback.
 */
function legacyDecisionPacket(confidence: DeterministicConfidence, evidence: EvidenceExcerpt[]): AskTraceDecisionPacket {
  const supported = confidence.label !== "insufficient_evidence";
  const positionId = "position:legacy-supported";
  return {
    evidenceMode: "researched",
    conclusionMode: supported ? "supported" : "insufficient_evidence",
    confidence: supported ? confidence.label : "insufficient_evidence",
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    leanPositionId: supported ? positionId : null,
    sufficient: supported,
    whatCouldChange: ["A material correction, supersession, or newly reviewed contradictory source."],
    positions: supported ? [{
      id: positionId,
      claimIds: [...new Set(evidence.map(item => item.claimId).filter((id): id is string => Boolean(id)))],
      evidenceIds: evidence.map((item, index) => item.assertionId ? `assertion:${item.assertionId}` : `${item.sourceId}:${item.claimId ?? index}`),
      statements: ["The supplied evidence supports the bounded answer."],
      provenanceGroupIds: [],
      score: confidence.score,
    }] : [],
    competitions: [],
    eligibleEvidenceIds: [...new Set(evidence.map(item => item.sourceId))],
    eligibleClaimIds: [...new Set(evidence.map(item => item.claimId).filter((id): id is string => Boolean(id)))],
    eligibleAssertionIds: [...new Set(evidence.map(item => item.assertionId).filter((id): id is string => Boolean(id)))],
    synthesisMode: supported ? "model" : "none",
  };
}

function decisionPacketsMatch(left: AskTraceDecisionPacket, right: AskTraceDecisionPacket): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function providerDecision(decision: AskTraceDecisionPacket, evidence: EvidenceExcerpt[]): TraceAnswerDecision {
  return {
    evidenceMode: decision.evidenceMode,
    conclusionMode: decision.conclusionMode,
    confidence: decision.confidence,
    confidenceScore: decision.confidenceScore,
    confidenceReasons: decision.confidenceReasons,
    leanPositionId: decision.leanPositionId,
    positionIds: decision.positions.map(position => position.id),
    positions: providerPositions(decision, evidence),
    competitions: decision.competitions.map(competition => ({
      leftPositionId: competition.leftPositionId,
      rightPositionId: competition.rightPositionId,
      relationships: competition.relationships,
    })),
    evidenceIds: [...new Set(evidence.map(item => item.sourceId))],
    claimIds: [...new Set(evidence.map(item => item.claimId).filter((id): id is string => Boolean(id)))],
    assertionIds: [...new Set(evidence.map(item => item.assertionId).filter((id): id is string => Boolean(id)))],
    whatCouldChange: decision.whatCouldChange,
  };
}

function providerPositions(decision: AskTraceDecisionPacket, evidence: EvidenceExcerpt[]): TraceAnswerPosition[] {
  return decision.positions.map(position => {
    const members = evidence.filter(item => {
      const canonical = item.canonicalClaimId ?? item.claimId;
      return position.claimIds.includes(canonical ?? "");
    });
    return {
      positionId: position.id,
      label: position.statements[0] ?? position.id,
      summary: position.statements.join(" "),
      supportingClaimIds: [...new Set(members.filter(item => item.relationship !== "contradicts").map(item => item.claimId).filter((id): id is string => Boolean(id)))],
      contradictingClaimIds: [...new Set(members.filter(item => item.relationship === "contradicts").map(item => item.claimId).filter((id): id is string => Boolean(id)))],
      sourceIds: [...new Set(members.map(item => item.sourceId))],
    };
  });
}

function answerPayload(
  requestId: string,
  draft: TraceAnswerDraft,
  evidence: EvidenceExcerpt[],
  confidence: DeterministicConfidence,
  knowledgeWarning?: string | null,
  exposeNumericScore = false,
  policy?: AnswerPolicyExpectation,
  decision?: AskTraceDecisionPacket,
): AskTracePayload {
  const confidenceReasons = [
    ...(decision?.confidenceReasons ?? confidence.reasons),
    ...(knowledgeWarning ? [knowledgeWarning] : []),
  ];
  const caveats = knowledgeWarning
    ? [...draft.caveats, knowledgeWarning]
    : draft.caveats;
  return {
    answer: draft.answer,
    evidenceMode: policy?.evidenceMode ?? draft.evidenceMode,
    conclusionMode: policy?.conclusionMode ?? draft.conclusionMode,
    directAnswer: draft.directAnswer,
    lean: policy?.leanPositionId === undefined ? draft.lean : policy.leanPositionId,
    whyLean: draft.whyLean,
    positions: draft.positions,
    sourceSummaries: draft.sourceSummaries,
    keyPoints: draft.keyPoints,
    claims: draft.claims,
    citations: citationsFor(draft, evidence),
    confidence: decision?.confidence ?? confidence.label,
    confidenceScore: exposeNumericScore ? (decision?.confidenceScore ?? confidence.score) : null,
    confidenceReasons,
    limitations: draft.limitations,
    unresolvedQuestions: draft.unresolvedQuestions,
    freshestEvidenceAt: draft.freshestEvidenceAt ?? confidence.freshestObservedAt,
    freshestObservedAt: confidence.freshestObservedAt,
    hasMaterialDisagreement: confidence.hasMaterialDisagreement,
    disagreements: draft.disagreements,
    caveats,
    whatCouldChange: decision?.whatCouldChange.join(" ") ?? draft.whatCouldChange,
    requestId,
    nonAnswer: false,
  };
}

/**
 * Application-owned Ask TRACE response.  It deliberately uses evidence text,
 * identifiers, and the already-governed decision packet only; it never calls
 * a model and never presents a generated claim as evidence.
 */
async function deterministicAnswerPayload(
  env: TraceAIRuntimeEnvironment,
  requestId: string,
  evidence: EvidenceExcerpt[],
  confidence: DeterministicConfidence,
  knowledgeWarning: string | null,
  decision: AskTraceDecisionPacket,
  policy: AnswerPolicyExpectation,
): Promise<AskTracePayload> {
  if (decision.conclusionMode === "multiple_positions") {
    return safeNonAnswer(requestId, confidence, "The deterministic evidence policy found materially competing positions.", false, policy);
  }
  const structured = evidence.some((item) => item.canonicalClaimId !== undefined || item.provenanceGroupIds !== undefined);
  const citationReady = evidence.filter((item) => item.assertionId && item.sourceDocumentVersionId && item.sourceChunkId
    && item.startLocator && item.endLocator && item.sourceUrl && /^https?:\/\//.test(item.sourceUrl));
  if (structured && citationReady.length !== evidence.length) {
    return safeNonAnswer(requestId, confidence, "Deterministic mode requires a locator-backed citation for every structured evidence record.", false, policy);
  }
  if (structured) {
    const citationInputs = citationReady.map((item) => ({
      assertionId: item.assertionId!,
      sourceDocumentVersionId: item.sourceDocumentVersionId!,
      sourceChunkId: item.sourceChunkId!,
      startLocator: item.startLocator!,
      endLocator: item.endLocator!,
    }));
    const citationResolution = await resolveAndValidateCitationReferences(env.DB!, citationInputs, citationInputs.map((item) => item.assertionId));
    if (!citationResolution.passed) {
      return safeNonAnswer(requestId, confidence, "A deterministic citation did not resolve to the admitted assertion, version, chunk, and locator relationship.", false, policy);
    }
  }
  const answerEvidence = structured ? citationReady : evidence;
  const grouped = new Map<string, EvidenceExcerpt[]>();
  for (const item of answerEvidence) {
    const key = item.sourceId;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  const sourceSummaries: TraceAnswerSourceSummary[] = [...grouped.entries()].slice(0, 8).map(([sourceId, items]) => ({
    sourceId,
    sourceName: items[0].sourceName ?? sourceId,
    sourceRole: items[0].sourceRole,
    summary: `${items.length} reviewed evidence record${items.length === 1 ? "" : "s"} retained by deterministic policy.`,
    materialClaims: items.slice(0, 4).map((item) => item.text),
    caveats: items[0].trustNotes ? [items[0].trustNotes] : [],
    publishedAt: items[0].publishedAt ?? null,
    retrievedAt: items[0].observedAt ?? null,
  }));
  const claims: TraceAnswerClaim[] = [];
  const claimsById = new Map<string, EvidenceExcerpt[]>();
  for (const item of answerEvidence) {
    const claimId = item.canonicalClaimId ?? item.claimId ?? `evidence:${item.sourceId}`;
    const group = claimsById.get(claimId) ?? [];
    group.push(item);
    claimsById.set(claimId, group);
  }
  for (const [claimId, items] of [...claimsById.entries()].slice(0, 12)) {
    claims.push({
      text: items[0].text,
      evidenceSourceIds: [...new Set(items.map((item) => item.sourceId))],
      evidenceClaimIds: [...new Set(items.map((item) => item.claimId).filter((id): id is string => Boolean(id)))],
      claimId,
      statement: items[0].text,
      relationship: items[0].relationship ?? "supports",
      citationAssertionIds: items.map((item) => item.assertionId).filter((id): id is string => Boolean(id)),
    });
  }
  const citations = answerEvidence.filter((item) => item.assertionId && item.sourceDocumentVersionId && item.sourceChunkId && item.startLocator && item.endLocator).map((item) => ({
    assertionId: item.assertionId!,
    sourceDocumentVersionId: item.sourceDocumentVersionId!,
    sourceChunkId: item.sourceChunkId!,
    startLocator: item.startLocator!,
    endLocator: item.endLocator!,
  }));
  const draft: TraceAnswerDraft = {
    answer: "TRACE's reviewed evidence supports a bounded answer to this question.",
    evidenceMode: decision.evidenceMode,
    conclusionMode: decision.conclusionMode,
    directAnswer: "TRACE's reviewed evidence supports a bounded answer to this question.",
    lean: decision.leanPositionId,
    whyLean: "The lean is selected by the deterministic evidence policy; no model synthesis was performed.",
    positions: providerPositions(decision, answerEvidence),
    sourceSummaries,
    confidence: decision.confidence,
    confidenceScore: decision.confidenceScore,
    confidenceReasons: decision.confidenceReasons,
    limitations: ["Deterministic mode returns application-owned evidence summaries and does not use a provider."],
    unresolvedQuestions: [],
    freshestEvidenceAt: confidence.freshestObservedAt,
    keyPoints: answerEvidence.slice(0, 6).map((item) => item.text),
    claims,
    citations,
    citedSourceIds: [...new Set(answerEvidence.map((item) => item.sourceId))],
    citedClaimIds: [...new Set(answerEvidence.map((item) => item.claimId).filter((id): id is string => Boolean(id)))],
    confirmedFacts: [],
    reportedClaims: [],
    disagreements: [],
    caveats: knowledgeWarning ? [knowledgeWarning] : [],
    whatCouldChange: decision.whatCouldChange.join(" "),
    proposedConfidence: decision.confidence,
  };
  return answerPayload(requestId, draft, answerEvidence, confidence, knowledgeWarning, false, policy, decision);
}

function usageSettlement(
  config: TraceAIConfig,
  model: TraceModelId,
  usage: { inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null },
  fallbackInput: number,
  fallbackOutput: number,
  latencyMs: number,
  providerStatus: number | null,
  validationStatus: string,
  billingUncertain = false,
): ProviderUsageSettlement {
  const actualAvailable = usage.inputTokens !== null && usage.outputTokens !== null;
  const cost = estimatedCost(
    config,
    model,
    usage.inputTokens ?? fallbackInput,
    usage.outputTokens ?? fallbackOutput,
  );
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedTokens,
    actualMicrousd: dollarsToMicrousd(cost),
    costBasis: actualAvailable ? "provider_usage" : "estimated",
    billingUncertain,
    latencyMs,
    providerStatus,
    validationStatus,
  };
}

function failurePublicMessage(error: unknown): string {
  if (!(error instanceof DeepSeekAPIError)) return "TRACE could not produce a validated response.";
  if (["rate_limit", "provider", "timeout", "network", "balance"].includes(error.kind)) {
    return "TRACE is temporarily unavailable.";
  }
  return "TRACE could not produce a validated response.";
}

function failureCircuit(error: unknown): { id: string; threshold: number; seconds: number | null } {
  if (error instanceof DeepSeekAPIError && error.kind === "authentication") return { id: "auth_error", threshold: 1, seconds: null };
  if (error instanceof DeepSeekAPIError && error.kind === "balance") return { id: "balance", threshold: 1, seconds: null };
  if (error instanceof DeepSeekAPIError && error.kind === "rate_limit") return { id: "provider_deepseek", threshold: 3, seconds: 120 };
  return { id: "provider_deepseek", threshold: 3, seconds: 300 };
}

function billingUncertain(error: unknown): boolean {
  if (!(error instanceof DeepSeekAPIError)) return true;
  return ["timeout", "network", "provider", "invalid_response"].includes(error.kind);
}

function failedUsageSettlement(
  latencyMs: number,
  providerStatus: number | null,
  uncertain: boolean,
): ProviderUsageSettlement {
  return {
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    actualMicrousd: null,
    costBasis: "unknown",
    billingUncertain: uncertain,
    latencyMs,
    providerStatus,
    validationStatus: "failed",
  };
}

export async function askTrace(env: TraceAIRuntimeEnvironment, context: AskTraceContext): Promise<AskTraceResult> {
  const config = buildConfig(env);
  const askEnabled = context.adminOverride ? config.editorialAIEnabled : config.publicAskTraceEnabled;
  if (!askEnabled || config.globalKillSwitch) {
    return { status: "temporarily_unavailable", requestId: context.requestId, message: "Ask TRACE is not currently enabled." };
  }
  if (!env.DB || config.askMode === "provider" && !config.deepseekApiKey || context.adminOverride && !config.deepseekApiKey) {
    return { status: "temporarily_unavailable", requestId: context.requestId, message: "Ask TRACE is not configured." };
  }

  const governance = new DurableAIGovernance(env.DB);
  const begin = await governance.begin({
    requestId: context.requestId,
    idempotencyKeyHash: context.idempotencyKeyHash,
    visitorHash: context.visitorHash,
    questionHash: context.questionHash,
    taskType: "ask_trace",
    evidenceIds: context.evidenceExcerpts.flatMap((item) => [item.sourceId, ...(item.claimId ? [item.claimId] : [])]),
  });
  if (begin.status === "duplicate_completed") {
    return { status: "ok", requestId: context.requestId, payload: begin.response as AskTracePayload };
  }
  if (begin.status === "duplicate_in_progress") {
    return { status: "in_progress", requestId: begin.requestId, message: "The original request is still processing." };
  }
  if (begin.status === "duplicate_terminal") {
    return { status: "error", requestId: context.requestId, message: begin.message };
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const quota = await governance.consumeQuota(context.requestId, context.visitorHash, dayKey, config.dailyPublicQuestionsPerVisitor);
  if (quota !== "accepted") {
    return {
      status: "rate_limited",
      requestId: context.requestId,
      message: quota === "concurrency_limit" ? "Another question is already processing." : "Daily question limit reached.",
    };
  }

  const originalInput = {
    taskType: "ask_trace" as const,
    question: context.question,
    evidenceExcerpts: context.evidenceExcerpts,
    maxOutputTokens: config.maxOutputTokens,
  };
  const inputValidation = validateTaskInput(originalInput, "ask_trace");
  if (!inputValidation.valid) {
    await governance.reject(context.requestId, "Request validation failed.");
    return { status: "error", requestId: context.requestId, message: "Request validation failed." };
  }
  await governance.validate(context.requestId);

  const eligibleEvidence = context.evidenceExcerpts.filter(isAnswerEligibleEvidence);
  const excludedEvidence = context.evidenceExcerpts.length - eligibleEvidence.length;
  const knowledgeWarning = unresolvedKnowledgeWarning(context.evidenceExcerpts);
  const confidence = calculateDeterministicConfidence(eligibleEvidence);
  const hasStructuredDecisionInputs = context.evidenceExcerpts.some((item) =>
    item.canonicalClaimId !== undefined || item.provenanceGroupIds !== undefined,
  );
  const derivedDecision = hasStructuredDecisionInputs
    ? await buildAskTraceDecisionPacket(env.DB, context.evidenceExcerpts, context.requestedEvidenceMode)
    : legacyDecisionPacket(confidence, eligibleEvidence);
  // A route may pass its precomputed packet for observability, but D1-derived
  // state is authoritative and the gateway refuses a packet that does not
  // exactly match a fresh deterministic derivation.
  const decision = context.decisionPacket && decisionPacketsMatch(context.decisionPacket, derivedDecision)
    ? context.decisionPacket
    : derivedDecision;
  const answerPolicy = policyExpectationFromDecision(decision);
  if (decision.synthesisMode === "none") {
    const exclusionReason = excludedEvidence > 0
      ? `${excludedEvidence} supplied record${excludedEvidence === 1 ? " was" : "s were"} excluded because it was not admitted, current external evidence.`
      : "Eligible evidence did not meet the minimum corroboration policy.";
    const payload = safeNonAnswer(
      context.requestId,
      confidence,
      [knowledgeWarning, exclusionReason, ...decision.confidenceReasons].filter(Boolean).join(" "),
      Boolean(context.adminOverride),
      answerPolicy,
    );
    await governance.completeWithoutModel(context.requestId, payload);
    return { status: "ok", requestId: context.requestId, payload };
  }

  if (config.askMode === "deterministic" && !context.adminOverride) {
    const payload = await deterministicAnswerPayload(
      env,
      context.requestId,
      eligibleEvidence,
      confidence,
      knowledgeWarning,
      decision,
      answerPolicy,
    );
    await governance.completeWithoutModel(context.requestId, payload);
    return { status: "ok", requestId: context.requestId, payload };
  }

  const input = {
    ...originalInput,
    evidenceExcerpts: eligibleEvidence,
    decision: providerDecision(decision, eligibleEvidence),
  };

  if (await governance.anyCircuitOpen(["global_kill", "public_ask", "provider_deepseek", "model_flash", "daily_budget", "monthly_budget", "balance", "auth_error"])) {
    await governance.reject(context.requestId, "Ask TRACE is temporarily unavailable.", "circuit_open");
    return { status: "temporarily_unavailable", requestId: context.requestId, message: "Ask TRACE is temporarily unavailable." };
  }

  const inputTokens = Math.min(config.maxInputTokens, estimateTokens(context.question + eligibleEvidence.map((item) => item.text).join("\n")));
  const estimatedMicrousd = dollarsToMicrousd(estimatedCost(config, config.publicModel, inputTokens, config.maxOutputTokens));
  const reservation = await governance.reserve(context.requestId, "ask_trace", estimatedMicrousd, durableConfig(config, env, "ask_trace"));
  if (!reservation) {
    await governance.reject(context.requestId, "Ask TRACE is temporarily unavailable due to budget policy.");
    return { status: "temporarily_unavailable", requestId: context.requestId, message: "Ask TRACE is temporarily unavailable." };
  }

  const provider = env.TRACE_MODEL_PROVIDER ?? new DeepSeekProvider(config);
  if (!await governance.startProvider(context.requestId, config.provider, config.publicModel)) {
    return { status: "in_progress", requestId: context.requestId, message: "The request is already processing." };
  }

  const startedAt = Date.now();
  try {
    const generation = await provider.generateAnswer(input);
    const validation = validateAnswerOutput(generation.output, input.evidenceExcerpts, input.maxOutputTokens, answerPolicy);
    const referencedAssertionIds = generation.output.claims.flatMap((claim) => claim.citationAssertionIds);
    const d1BackedCitations = generation.output.citations.length > 0
      && generation.output.citations.every((citation) => input.evidenceExcerpts.some((excerpt) =>
        excerpt.assertionId === citation.assertionId && excerpt.externalEvidenceResolved === true));
    const citationResolution = env.DB && d1BackedCitations
      ? await resolveAndValidateCitationReferences(env.DB, generation.output.citations, referencedAssertionIds)
      : null;
    const answerValidated = validation.passed && (!citationResolution || citationResolution.passed);
    const payload = answerValidated
      ? answerPayload(context.requestId, generation.output, eligibleEvidence, confidence, knowledgeWarning, Boolean(context.adminOverride), answerPolicy, decision)
      : safeNonAnswer(
        context.requestId,
        confidence,
        [knowledgeWarning, "The generated draft failed citation or structure validation."].filter(Boolean).join(" "),
        Boolean(context.adminOverride),
        answerPolicy,
      );
    const settlement = usageSettlement(
      config, config.publicModel, generation.usage, inputTokens, input.maxOutputTokens,
      Date.now() - startedAt, generation.providerStatus, answerValidated ? "passed" : "failed",
    );
    await governance.settleSuccess(
      context.requestId, reservation.reservationId, config.provider, config.publicModel,
      estimatedMicrousd, settlement, payload,
    );
    await governance.recordCircuitSuccess("provider_deepseek");
    await governance.recordCircuitSuccess("model_flash");
    return { status: "ok", requestId: context.requestId, payload };
  } catch (error: unknown) {
    const circuit = failureCircuit(error);
    await governance.recordCircuitFailure(circuit.id, error instanceof DeepSeekAPIError ? error.kind : "invalid_response", circuit.threshold, circuit.seconds);
    const uncertain = billingUncertain(error);
    await governance.settleFailure(
      context.requestId, reservation.reservationId, config.provider, config.publicModel, estimatedMicrousd,
      failedUsageSettlement(Date.now() - startedAt, error instanceof DeepSeekAPIError ? error.status ?? null : null, uncertain),
      failurePublicMessage(error),
    );
    console.error(JSON.stringify({ message: "TRACE model request failed", requestId: context.requestId, kind: error instanceof DeepSeekAPIError ? error.kind : "invalid_response" }));
    return { status: "temporarily_unavailable", requestId: context.requestId, message: failurePublicMessage(error) };
  }
}

export interface EditorialContext {
  requestId: string;
  idempotencyKeyHash: string;
  instruction: string;
  sourceMaterial: EvidenceExcerpt[];
  modelTier?: "routine" | "editorial";
  maxOutputTokens?: number;
}

export async function generateEditorial(
  env: TraceAIRuntimeEnvironment,
  context: EditorialContext,
): Promise<{ status: "ok" | "error" | "temporarily_unavailable" | "in_progress"; requestId: string; draft?: TraceEditorialDraft; error?: string }> {
  const config = buildConfig(env);
  if (!config.editorialAIEnabled || config.globalKillSwitch || !env.DB || !config.deepseekApiKey) {
    return { status: "temporarily_unavailable", requestId: context.requestId, error: "Editorial AI is not configured." };
  }
  const governance = new DurableAIGovernance(env.DB);
  const begin = await governance.begin({
    requestId: context.requestId,
    idempotencyKeyHash: context.idempotencyKeyHash,
    visitorHash: null,
    questionHash: null,
    taskType: "editorial",
    evidenceIds: context.sourceMaterial.map((item) => item.sourceId),
  });
  if (begin.status === "duplicate_completed") {
    const stored = begin.response as { draft?: TraceEditorialDraft };
    return stored.draft ? { status: "ok", requestId: context.requestId, draft: stored.draft } : { status: "error", requestId: context.requestId, error: "Stored result is unavailable." };
  }
  if (begin.status === "duplicate_in_progress") return { status: "in_progress", requestId: begin.requestId, error: "The original request is still processing." };
  if (begin.status === "duplicate_terminal") return { status: "error", requestId: context.requestId, error: begin.message };

  const selectedModel = context.modelTier === "routine" ? config.publicModel : config.editorialModel;
  const assignment = validateModelAssignment(selectedModel, "editorial", config);
  const maxOutputTokens = Math.min(context.maxOutputTokens ?? config.maxOutputTokens, config.maxOutputTokens);
  const input = {
    taskType: "editorial" as const,
    model: selectedModel,
    instruction: context.instruction.slice(0, 4_000),
    sourceMaterial: context.sourceMaterial.slice(0, config.maxEvidenceExcerpts),
    maxOutputTokens,
  };
  const validation = validateTaskInput(input, "editorial");
  if (!assignment.valid || !validation.valid) {
    await governance.reject(context.requestId, "Editorial request validation failed.");
    return { status: "error", requestId: context.requestId, error: "Editorial request validation failed." };
  }
  await governance.validate(context.requestId);
  const modelBreaker = selectedModel === config.publicModel ? "model_flash" : "model_pro";
  if (await governance.anyCircuitOpen(["global_kill", "provider_deepseek", modelBreaker, "daily_budget", "monthly_budget", "balance", "auth_error"])) {
    await governance.reject(context.requestId, "Editorial AI is temporarily unavailable.", "circuit_open");
    return { status: "temporarily_unavailable", requestId: context.requestId, error: "Editorial AI is temporarily unavailable." };
  }

  const inputTokens = Math.min(config.maxInputTokens, estimateTokens(input.instruction + input.sourceMaterial.map((item) => item.text).join("\n")));
  const estimatedMicrousd = dollarsToMicrousd(estimatedCost(config, selectedModel, inputTokens, maxOutputTokens));
  const reservation = await governance.reserve(context.requestId, "editorial", estimatedMicrousd, durableConfig(config, env, "editorial"));
  if (!reservation) {
    await governance.reject(context.requestId, "Editorial AI is unavailable due to budget policy.");
    return { status: "temporarily_unavailable", requestId: context.requestId, error: "Editorial AI is temporarily unavailable." };
  }
  if (!await governance.startProvider(context.requestId, config.provider, selectedModel)) {
    return { status: "in_progress", requestId: context.requestId, error: "The request is already processing." };
  }

  const provider = new DeepSeekProvider(config);
  const startedAt = Date.now();
  try {
    const generation = await provider.generateEditorial(input);
    const outputValidation = validateEditorialOutput(generation.output, input.sourceMaterial);
    if (!outputValidation.passed) {
      await governance.settleSuccess(
        context.requestId, reservation.reservationId, config.provider, selectedModel, estimatedMicrousd,
        usageSettlement(config, selectedModel, generation.usage, inputTokens, maxOutputTokens, Date.now() - startedAt, generation.providerStatus, "failed"),
        { draft: null, validationFailed: true },
      );
      return { status: "error", requestId: context.requestId, error: "AI output failed TRACE validation and was not returned." };
    }
    const response = { draft: generation.output };
    await governance.settleSuccess(
      context.requestId, reservation.reservationId, config.provider, selectedModel, estimatedMicrousd,
      usageSettlement(config, selectedModel, generation.usage, inputTokens, maxOutputTokens, Date.now() - startedAt, generation.providerStatus, "passed"),
      response,
    );
    await governance.recordCircuitSuccess("provider_deepseek");
    await governance.recordCircuitSuccess(modelBreaker);
    return { status: "ok", requestId: context.requestId, draft: generation.output };
  } catch (error: unknown) {
    const circuit = failureCircuit(error);
    await governance.recordCircuitFailure(circuit.id, error instanceof DeepSeekAPIError ? error.kind : "invalid_response", circuit.threshold, circuit.seconds);
    await governance.settleFailure(
      context.requestId, reservation.reservationId, config.provider, selectedModel, estimatedMicrousd,
      failedUsageSettlement(Date.now() - startedAt, error instanceof DeepSeekAPIError ? error.status ?? null : null, billingUncertain(error)),
      failurePublicMessage(error),
    );
    console.error(JSON.stringify({ message: "TRACE editorial request failed", requestId: context.requestId, kind: error instanceof DeepSeekAPIError ? error.kind : "invalid_response" }));
    return { status: "temporarily_unavailable", requestId: context.requestId, error: failurePublicMessage(error) };
  }
}

export async function hashPrivateIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
