import type {
  EvidenceExcerpt, TraceAIConfig, TraceAnswerDraft, TraceEditorialDraft, TraceModelId,
} from "./provider";
import { DeepSeekAPIError, DeepSeekProvider } from "./providers/deepseek";
import { buildConfig, configuredTaskDailyBudget, type TraceAIEnvironment } from "./config";
import { validateTaskInput } from "./schemas";
import { validateAnswerOutput, validateEditorialOutput } from "./validation";
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

export type TraceAIRuntimeEnvironment = TraceAIEnvironment & { DB?: D1Database };

export interface AskTraceContext {
  requestId: string;
  idempotencyKeyHash: string;
  visitorHash: string;
  questionHash: string;
  question: string;
  evidenceExcerpts: EvidenceExcerpt[];
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
}

export interface AskTracePayload {
  answer: string;
  keyPoints: string[];
  claims: { text: string; evidenceSourceIds: string[]; evidenceClaimIds: string[] }[];
  citations: PublicCitation[];
  confidence: DeterministicConfidence["label"];
  /** Numeric confidence is internal/admin-only until KC-07 calibration passes. */
  confidenceScore: number | null;
  confidenceReasons: string[];
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
): AskTracePayload {
  return {
    answer: "TRACE does not have enough eligible published evidence to answer this question reliably.",
    keyPoints: [],
    claims: [],
    citations: [],
    confidence: "insufficient_evidence",
    confidenceScore: exposeNumericScore ? confidence.score : null,
    confidenceReasons: [...confidence.reasons, reason],
    freshestObservedAt: confidence.freshestObservedAt,
    hasMaterialDisagreement: confidence.hasMaterialDisagreement,
    disagreements: [],
    caveats: [reason],
    whatCouldChange: "Additional reviewed and published evidence may make an answer possible.",
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
    .filter((item) => citedSources.has(item.sourceId) || Boolean(item.claimId && citedClaims.has(item.claimId)))
    .map((item) => ({
      sourceId: item.sourceId,
      claimId: item.claimId,
      sourceName: item.sourceName ?? item.sourceId,
      sourceUrl: item.sourceUrl,
      sourceClassification: item.sourceClassification,
      observedAt: item.observedAt,
      publishedAt: item.publishedAt,
    }));
}

function answerPayload(
  requestId: string,
  draft: TraceAnswerDraft,
  evidence: EvidenceExcerpt[],
  confidence: DeterministicConfidence,
  knowledgeWarning?: string | null,
  exposeNumericScore = false,
): AskTracePayload {
  const confidenceReasons = knowledgeWarning
    ? [...confidence.reasons, knowledgeWarning]
    : confidence.reasons;
  const caveats = knowledgeWarning
    ? [...draft.caveats, knowledgeWarning]
    : draft.caveats;
  return {
    answer: draft.answer,
    keyPoints: draft.keyPoints,
    claims: draft.claims,
    citations: citationsFor(draft, evidence),
    confidence: confidence.label,
    confidenceScore: exposeNumericScore ? confidence.score : null,
    confidenceReasons,
    freshestObservedAt: confidence.freshestObservedAt,
    hasMaterialDisagreement: confidence.hasMaterialDisagreement,
    disagreements: draft.disagreements,
    caveats,
    whatCouldChange: draft.whatCouldChange,
    requestId,
    nonAnswer: false,
  };
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
  if (!env.DB || !config.deepseekApiKey) {
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
  if (confidence.label === "insufficient_evidence") {
    const exclusionReason = excludedEvidence > 0
      ? `${excludedEvidence} supplied record${excludedEvidence === 1 ? " was" : "s were"} excluded because it was not admitted, current external evidence.`
      : "Eligible evidence did not meet the minimum corroboration policy.";
    const payload = safeNonAnswer(
      context.requestId,
      confidence,
      [knowledgeWarning, exclusionReason].filter(Boolean).join(" "),
      Boolean(context.adminOverride),
    );
    await governance.completeWithoutModel(context.requestId, payload);
    return { status: "ok", requestId: context.requestId, payload };
  }

  const input = { ...originalInput, evidenceExcerpts: eligibleEvidence };

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

  const provider = new DeepSeekProvider(config);
  if (!await governance.startProvider(context.requestId, config.provider, config.publicModel)) {
    return { status: "in_progress", requestId: context.requestId, message: "The request is already processing." };
  }

  const startedAt = Date.now();
  try {
    const generation = await provider.generateAnswer(input);
    const validation = validateAnswerOutput(generation.output, input.evidenceExcerpts, input.maxOutputTokens);
    const payload = validation.passed
      ? answerPayload(context.requestId, generation.output, eligibleEvidence, confidence, knowledgeWarning, Boolean(context.adminOverride))
      : safeNonAnswer(
        context.requestId,
        confidence,
        [knowledgeWarning, "The generated draft failed citation or structure validation."].filter(Boolean).join(" "),
        Boolean(context.adminOverride),
      );
    const settlement = usageSettlement(
      config, config.publicModel, generation.usage, inputTokens, input.maxOutputTokens,
      Date.now() - startedAt, generation.providerStatus, validation.passed ? "passed" : "failed",
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
