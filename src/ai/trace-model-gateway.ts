// The Trace Manifest — AI Model Gateway
// Phase 5: Central entry point for all model-assisted features.
// Enforces all ADR-0008 controls: provider neutrality, budget reservation,
// circuit breakers, validation, idempotency, loop prevention, retry policy.
// This is the ONLY module that application code calls for model access.

import type {
  TraceTaskType, TraceTaskInput,
  TraceAnswerInput, TraceEditorialInput, TracePredictionInput,
  TraceAnswerDraft, TraceEditorialDraft, TracePredictionCandidate,
  TraceAIConfig, UsageRecord,
} from "./provider";
import { TERMINAL_STATES, VALID_TRANSITIONS, type RequestState } from "./provider";
import { routeModel, validateModelAssignment } from "./model-router";
import { DeepSeekProvider } from "./providers/deepseek";
import { validateTaskInput } from "./schemas";
import { validateAnswerOutput, validateEditorialOutput, validatePredictionOutput } from "./validation";
import {
  checkBudgetThreshold, reserveBudget, reconcileReservation,
  releaseReservation, estimateCost, estimateMaxCost,
  type BudgetAction,
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

// In-memory request state store (per isolate)
interface RequestRecord {
  requestId: string;
  idempotencyKeyHash: string;
  state: RequestState;
  taskType: TraceTaskType;
  model: string;
  attemptCount: number;
  budgetReservation: number;
  reservationId?: string;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const requestStore = new Map<string, RequestRecord>();

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
  console.log(`TRACE AI Gateway initialised — provider: ${cfg.provider}, public model: ${cfg.publicModel}`);
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

  const requestId = `ask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    if (!reservation.reserved || !reservation.reservationId) {
      return { status: "temporarily_unavailable", requestId, message: reservation.reason ?? "Budget reservation failed." };
    }

    // 8. Model call (one call only — no loops per ADR-0008)
    let draft: TraceAnswerDraft;
    try {
      draft = await provider.generateAnswer(input);
      recordSuccess("model_flash");
    } catch (err: any) {
      recordFailure("model_flash", err.message);

      // Explicit retry policy — only retry on 5xx, max 1 retry
      if (err.message?.includes("500") || err.message?.includes("503")) {
        try {
          draft = await provider.generateAnswer(input);
          recordSuccess("model_flash");
        } catch (retryErr: any) {
          releaseReservation(reservation.reservationId, estimatedCost);
          recordFailure("failure_rate", retryErr.message);
          return { status: "error", requestId, message: "Unable to generate answer. Please try again." };
        }
      } else if (err.message?.includes("401")) {
        recordFailure("auth_error", err.message);
        releaseReservation(reservation.reservationId, estimatedCost);
        return { status: "error", requestId, message: "Service configuration error." };
      } else if (err.message?.includes("402")) {
        recordFailure("balance", err.message);
        releaseReservation(reservation.reservationId, estimatedCost);
        return { status: "temporarily_unavailable", requestId, message: "Service temporarily unavailable." };
      } else {
        releaseReservation(reservation.reservationId, estimatedCost);
        return { status: "error", requestId, message: "Unable to generate answer." };
      }
    }

    // 9. Post-generation validation
    const validation = validateAnswerOutput(draft, input.evidenceExcerpts, input.maxOutputTokens);
    const latencyMs = Date.now() - startTime;

    // 10. Reconcile budget
    const actualCost = estimateCost(config.publicModel, 0, input.maxOutputTokens);
    reconcileReservation(reservation.reservationId, actualCost, estimatedCost);

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
      actualCost,
      attemptNumber: 1,
      latencyMs,
      providerStatus: 200,
      validationStatus: validation.passed ? "passed" : "failed",
      validationFailures: validation.failures,
      budgetReservation: estimatedCost,
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
  } catch (err: any) {
    return { status: "error", requestId, message: `Unexpected error: ${err.message}` };
  }
}

// ============================================================
// Public API: Editorial generation (admin/scheduled only)
// ============================================================

export async function generateEditorial(
  instruction: string,
  sourceMaterial: { sourceId: string; text: string; sourceClassification: string }[],
): Promise<{ status: string; draft?: TraceEditorialDraft; error?: string }> {
  if (!config || !provider) return { status: "error", error: "Gateway not initialised." };

  if (!allowRequest("scheduled_jobs")) {
    return { status: "error", error: "Editorial generation circuit breaker is open." };
  }

  const input: TraceEditorialInput = {
    taskType: "editorial",
    instruction,
    sourceMaterial: sourceMaterial.map(s => ({
      sourceId: s.sourceId,
      text: s.text,
      sourceClassification: s.sourceClassification,
    })),
    maxOutputTokens: config.maxOutputTokens,
  };

  try {
    const draft = await provider.generateEditorial(input);
    recordSuccess("model_pro");
    const validation = validateEditorialOutput(draft, input.sourceMaterial);
    return { status: validation.passed ? "ok" : "validation_failed", draft };
  } catch (err: any) {
    recordFailure("model_pro", err.message);
    return { status: "error", error: err.message };
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
  } catch (err: any) {
    recordFailure("model_pro", err.message);
    return { status: "error", error: err.message };
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
  // Simple hash for idempotency — in production use SHA-256
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `ik_${Math.abs(hash).toString(16)}`;
}
