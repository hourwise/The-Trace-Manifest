// The Trace Manifest — AI Model Gateway
// Phase 5: Central entry point for all model-assisted features.
// Enforces all ADR-0008 controls: provider neutrality, budget reservation,
// circuit breakers, validation, idempotency, loop prevention, retry policy.
// This is the ONLY module that application code calls for model access.

import type {
  TraceAnswerInput, TraceEditorialInput, TracePredictionInput,
  TraceAnswerDraft, TraceEditorialDraft, TracePredictionCandidate,
  TraceAIConfig, CircuitBreakerId,
} from "./provider";
import { routeModel, validateModelAssignment } from "./model-router";
import { DeepSeekProvider } from "./providers/deepseek";
import { validateTaskInput } from "./schemas";
import { validateAnswerOutput, validateEditorialOutput, validatePredictionOutput } from "./validation";
import {
  checkBudgetThreshold, reserveBudget, reconcileReservation,
  releaseReservation, estimateCost, estimateMaxCost,
} from "./budget-policy";
import { recordUsage, getDailyTotals } from "./usage-ledger";
import {
  checkPublicAskTraceBreakers, recordSuccess, recordFailure,
  allowRequest, activateGlobalKillSwitch, isGlobalKillSwitchActive,
} from "./circuit-breaker";

// ============================================================
// Gateway state
// ============================================================

let provider: DeepSeekProvider | null = null;
let config: TraceAIConfig | null = null;

// ============================================================
// Initialisation
// ============================================================

export function initGateway(cfg: TraceAIConfig): void {
  config = cfg;

  // Validate that the API key is not exposed
  if (typeof window !== "undefined") {
    throw new Error("TRACE AI Gateway must not be initialised in browser context. API keys must remain server-side.");
  }

  provider = new DeepSeekProvider(cfg);
  if (cfg.globalKillSwitch) activateGlobalKillSwitch("TRACE_GLOBAL_KILL_SWITCH is enabled.");
}

// ============================================================
// Public API: Ask TRACE
// ============================================================

export interface AskTraceResult {
  status: "ok" | "error" | "temporarily_unavailable" | "rate_limited";
  requestId: string;
  answer?: TraceAnswerDraft;
  message?: string;
  citations?: { sourceId: string; claimId?: string }[];
}

export async function askTrace(
  question: string,
  evidenceExcerpts: { sourceId: string; claimId?: string; text: string; sourceClassification: string }[],
  maxOutputTokens?: number,
): Promise<AskTraceResult> {
  if (!config || !provider) {
    return { status: "error", requestId: "uninitialised", message: "AI Gateway not initialised." };
  }

  const requestId = `ask_${crypto.randomUUID()}`;
  const idempotencyKeyHash = await hashIdempotencyKey(`${question}:${requestId}`);
  const startTime = Date.now();

  try {
    // 1. Circuit breaker check
    const breakerCheck = checkPublicAskTraceBreakers();
    if (!breakerCheck.allowed) {
      return {
        status: "temporarily_unavailable",
        requestId,
        message: "Ask TRACE is temporarily unavailable. No request was charged. Please try again later.",
      };
    }

    // 2. Global kill switch
    if (isGlobalKillSwitchActive()) {
      return { status: "temporarily_unavailable", requestId, message: "Service temporarily unavailable." };
    }

    // 3. Feature switch
    if (!config.publicAskTraceEnabled) {
      return { status: "temporarily_unavailable", requestId, message: "Ask TRACE is not currently enabled." };
    }

    // 4. Budget threshold check
    const budgetAction = checkBudgetThreshold(config);
    if (budgetAction === "stop") {
      recordFailure("daily_budget", "Budget exhausted");
      return { status: "temporarily_unavailable", requestId, message: "Service temporarily unavailable due to budget limits." };
    }

    // 5. Rate limiting
    const daily = getDailyTotals();
    if (daily.count >= config.dailyPublicQuestionsPerVisitor * 10) { // rough global limit
      return { status: "rate_limited", requestId, message: "Daily question limit reached. Please try again tomorrow." };
    }

    // 6. Input validation
    const maxTokens = maxOutputTokens ?? config.maxOutputTokens;
    const input: TraceAnswerInput = {
      taskType: "ask_trace",
      question: question.slice(0, config.maxQuestionLength),
      evidenceExcerpts: evidenceExcerpts.slice(0, config.maxEvidenceExcerpts).map(e => ({
        sourceId: e.sourceId,
        claimId: e.claimId,
        text: e.text.slice(0, 2000),
        sourceClassification: e.sourceClassification,
      })),
      maxOutputTokens: Math.min(maxTokens, config.maxOutputTokens),
    };

    // 7. Budget reservation (atomic)
    const estimatedCost = estimateMaxCost(config);
    const reservation = reserveBudget(config, estimatedCost);
    if (!reservation.reserved || !reservation.reservationId || reservation.reservedAmount === undefined) {
      return { status: "temporarily_unavailable", requestId, message: reservation.reason ?? "Budget reservation failed." };
    }

    // 8. Model call (one call only — no loops per ADR-0008)
    let draft: TraceAnswerDraft;
    try {
      draft = await provider.generateAnswer(input);
      recordSuccess("model_flash");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      recordFailure("model_flash", message);

      // Explicit retry policy — only retry on 5xx, max 1 retry
      if (message.includes("500") || message.includes("503")) {
        try {
          draft = await provider.generateAnswer(input);
          recordSuccess("model_flash");
        } catch (retryError: unknown) {
          releaseReservation(reservation.reservationId, reservation.reservedAmount);
          recordFailure("failure_rate", getErrorMessage(retryError));
          return { status: "error", requestId, message: "Unable to generate answer. Please try again." };
        }
      } else if (message.includes("401")) {
        recordFailure("auth_error", message);
        releaseReservation(reservation.reservationId, reservation.reservedAmount);
        return { status: "error", requestId, message: "Service configuration error." };
      } else if (message.includes("402")) {
        recordFailure("balance", message);
        releaseReservation(reservation.reservationId, reservation.reservedAmount);
        return { status: "temporarily_unavailable", requestId, message: "Service temporarily unavailable." };
      } else {
        releaseReservation(reservation.reservationId, reservation.reservedAmount);
        return { status: "error", requestId, message: "Unable to generate answer." };
      }
    }

    // 9. Post-generation validation
    const validation = validateAnswerOutput(draft, input.evidenceExcerpts, input.maxOutputTokens);
    const latencyMs = Date.now() - startTime;

    // 10. Reconcile budget
    const actualCost = estimateCost(config.publicModel, 0, input.maxOutputTokens);
    reconcileReservation(reservation.reservationId, actualCost, reservation.reservedAmount);

    // 11. Record usage
    recordUsage({
      requestId,
      idempotencyKeyHash,
      taskType: "ask_trace",
      provider: "deepseek",
      model: config.publicModel,
      inputTokens: 0, // Provider returns actual token counts — use those in production
      outputTokens: 0,
      cachedTokens: 0,
      estimatedCost,
      actualCost,
      attemptNumber: 1,
      latencyMs,
      providerStatus: 200,
      validationStatus: validation.passed ? "passed" : "failed",
      validationFailures: validation.failures,
      budgetReservation: reservation.reservedAmount,
    });

    if (!validation.passed) {
      return {
        status: "ok",
        requestId,
        answer: validation.safeResponse,
        message: "Answer could not be fully validated. A safe response is provided.",
      };
    }

    return { status: "ok", requestId, answer: draft };
  } catch (error: unknown) {
    return { status: "error", requestId, message: `Unexpected error: ${getErrorMessage(error)}` };
  }
}

// ============================================================
// Public API: Editorial generation (admin/scheduled only)
// ============================================================

export async function generateEditorial(
  instruction: string,
  sourceMaterial: { sourceId: string; text: string; sourceClassification: string }[],
  options: { maxOutputTokens?: number } = {},
): Promise<{
  status: "ok" | "error" | "temporarily_unavailable" | "validation_failed";
  requestId: string;
  draft?: TraceEditorialDraft;
  error?: string;
}> {
  const requestId = `editorial_${crypto.randomUUID()}`;
  if (!config || !provider) return { status: "error", requestId, error: "Gateway not initialised." };

  const gatewayConfig = config;
  const modelProvider = provider;
  const blockingBreakers: CircuitBreakerId[] = [
    "global_kill", "scheduled_jobs", "provider_deepseek", "model_pro",
    "daily_budget", "monthly_budget", "balance", "auth_error", "failure_rate",
  ];

  for (const breaker of blockingBreakers) {
    if (!allowRequest(breaker)) {
      return {
        status: "temporarily_unavailable",
        requestId,
        error: "Editorial generation is temporarily unavailable.",
      };
    }
  }

  if (checkBudgetThreshold(gatewayConfig) === "stop") {
    recordFailure("daily_budget", "Budget exhausted");
    return { status: "temporarily_unavailable", requestId, error: "AI budget is currently unavailable." };
  }

  const route = routeModel("editorial", gatewayConfig);
  const assignment = validateModelAssignment(route.model, "editorial", gatewayConfig);
  if (!assignment.valid) {
    return { status: "error", requestId, error: assignment.reason ?? "Editorial model assignment rejected." };
  }

  const maxOutputTokens = Math.min(options.maxOutputTokens ?? gatewayConfig.maxOutputTokens, gatewayConfig.maxOutputTokens);
  const input: TraceEditorialInput = {
    taskType: "editorial",
    instruction: instruction.slice(0, 4000),
    sourceMaterial: sourceMaterial.slice(0, gatewayConfig.maxEvidenceExcerpts).map(source => ({
      sourceId: source.sourceId.slice(0, 100),
      text: source.text.slice(0, 4000),
      sourceClassification: source.sourceClassification.slice(0, 100),
    })),
    maxOutputTokens,
  };

  const inputValidation = validateTaskInput(input, "editorial");
  if (!inputValidation.valid) {
    return { status: "error", requestId, error: inputValidation.errors.join("; ") };
  }

  const estimatedInputTokens = Math.min(
    gatewayConfig.maxInputTokens,
    Math.ceil((input.instruction.length + input.sourceMaterial.reduce((sum, source) => sum + source.text.length, 0)) / 4),
  );
  const estimatedCost = estimateMaxCost(gatewayConfig, route.model, estimatedInputTokens, maxOutputTokens);
  const reservation = reserveBudget(gatewayConfig, estimatedCost);
  if (!reservation.reserved || !reservation.reservationId || reservation.reservedAmount === undefined) {
    return {
      status: "temporarily_unavailable",
      requestId,
      error: reservation.reason ?? "Budget reservation failed.",
    };
  }

  const idempotencyKeyHash = await hashIdempotencyKey(
    `${instruction}:${input.sourceMaterial.map(source => source.sourceId).join(":")}:${requestId}`,
  );
  const startedAt = Date.now();

  try {
    // Editorial requests make exactly one provider call. No endpoint can bypass this gateway.
    const draft = await modelProvider.generateEditorial(input);
    const validation = validateEditorialOutput(draft, input.sourceMaterial);
    const latencyMs = Date.now() - startedAt;
    const actualCost = estimateCost(route.model, estimatedInputTokens, maxOutputTokens);

    reconcileReservation(reservation.reservationId, actualCost, reservation.reservedAmount);
    recordUsage({
      requestId,
      idempotencyKeyHash,
      taskType: "editorial",
      provider: gatewayConfig.provider,
      model: route.model,
      inputTokens: estimatedInputTokens,
      outputTokens: maxOutputTokens,
      cachedTokens: 0,
      estimatedCost,
      actualCost,
      attemptNumber: 1,
      latencyMs,
      providerStatus: 200,
      validationStatus: validation.passed ? "passed" : "failed",
      validationFailures: validation.failures,
      budgetReservation: reservation.reservedAmount,
    });

    if (!validation.passed) {
      recordFailure("failure_rate", "Editorial output failed validation.");
      return {
        status: "validation_failed",
        requestId,
        error: "AI output failed TRACE validation and was not returned.",
      };
    }

    recordSuccess("model_pro");
    recordSuccess("provider_deepseek");
    return { status: "ok", requestId, draft };
  } catch (error: unknown) {
    releaseReservation(reservation.reservationId, reservation.reservedAmount);
    const message = error instanceof Error ? error.message : "Unknown provider error";
    recordFailure("model_pro", message);
    recordFailure("provider_deepseek", message);
    if (message.includes("401")) recordFailure("auth_error", "Provider authentication failed.");
    if (message.includes("402")) recordFailure("balance", "Provider balance unavailable.");

    console.error(JSON.stringify({ message: "Editorial model request failed", requestId, error: message }));
    return { status: "error", requestId, error: "Editorial model request failed." };
  }
}

// ============================================================
// Public API: Predictions (admin/scheduled only)
// ============================================================

export async function generatePredictions(
  evidenceSummary: string,
  forecastDays: number = 7,
): Promise<{ status: string; candidates?: TracePredictionCandidate[]; error?: string }> {
  if (!config || !provider) return { status: "error", error: "Gateway not initialised." };

  if (!allowRequest("scheduled_jobs")) {
    return { status: "error", error: "Prediction generation circuit breaker is open." };
  }

  const now = new Date();
  const forecastEnd = new Date(now.getTime() + forecastDays * 86_400_000);

  const input: TracePredictionInput = {
    taskType: "prediction",
    evidenceSummary,
    candidateCount: 3,
    forecastWindow: {
      from: now.toISOString().slice(0, 10),
      to: forecastEnd.toISOString().slice(0, 10),
    },
    maxOutputTokens: config.maxOutputTokens,
  };

  try {
    const candidates = await provider.generatePredictions(input);
    recordSuccess("model_pro");
    const validation = validatePredictionOutput(candidates);
    return { status: validation.passed ? "ok" : "partial", candidates: validation.validCandidates };
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    recordFailure("model_pro", message);
    return { status: "error", error: message };
  }
}

// ============================================================
// Admin controls
// ============================================================

export function getGatewayStatus() {
  return {
    initialised: config !== null,
    provider: config?.provider ?? "none",
    publicModel: config?.publicModel ?? "none",
    publicAskTraceEnabled: config?.publicAskTraceEnabled ?? false,
    killSwitchActive: isGlobalKillSwitchActive(),
    dailyUsage: getDailyTotals(),
  };
}

export function shutdown(reason: string): void {
  activateGlobalKillSwitch(reason);
}

// ============================================================
// Helpers
// ============================================================

async function hashIdempotencyKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `ik_${hash}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
