// The Trace Manifest — Budget Policy
// Phase 5: Internal budget enforcement per ADR-0008 section 6.
// Atomic reservations prevent concurrent overspend.
// Prepaid balance is the last backstop — internal budget is authoritative.

import type { BudgetState, TraceAIConfig } from "./provider";

// ============================================================
// In-memory budget state (per Worker isolate)
// ============================================================

let dailyUsed = 0;
let monthlyUsed = 0;
let currentReservation = 0;
let lastResetDay = new Date().getUTCDate();
let lastResetMonth = new Date().getUTCMonth();

function resetIfNewPeriod(): void {
  const now = new Date();
  const today = now.getUTCDate();
  const thisMonth = now.getUTCMonth();

  if (today !== lastResetDay) {
    dailyUsed = 0;
    lastResetDay = today;
  }
  if (thisMonth !== lastResetMonth) {
    monthlyUsed = 0;
    lastResetMonth = thisMonth;
  }
}

// ============================================================
// Budget state query
// ============================================================

export function getBudgetState(config: TraceAIConfig): BudgetState {
  resetIfNewPeriod();

  return {
    dailyUsed,
    dailyLimit: config.dailyPublicBudget,
    monthlyUsed,
    monthlyLimit: config.monthlyPublicBudget,
    currentReservation,
    availableBalance: Math.min(
      config.dailyPublicBudget - dailyUsed - currentReservation,
      config.monthlyPublicBudget - monthlyUsed - currentReservation,
    ),
    warningThreshold: config.warningBalance,
    restrictThreshold: config.restrictBalance,
    stopThreshold: config.stopBalance,
    killSwitchActive: false, // Set externally via circuit breaker
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================
// Budget thresholds → action
// ============================================================

export type BudgetAction =
  | "allow"
  | "warn"
  | "restrict"
  | "stop";

export function checkBudgetThreshold(config: TraceAIConfig, providerBalance?: number): BudgetAction {
  // Check internal budgets first
  const state = getBudgetState(config);

  if (state.dailyUsed >= config.dailyPublicBudget) return "stop";
  if (state.monthlyUsed >= config.monthlyPublicBudget) return "stop";

  // Check provider balance thresholds
  if (providerBalance !== undefined) {
    if (providerBalance <= config.stopBalance) return "stop";
    if (providerBalance <= config.restrictBalance) return "restrict";
    if (providerBalance <= config.warningBalance) return "warn";
  }

  // Check approaching limits
  if (state.dailyUsed >= config.dailyPublicBudget * 0.9) return "warn";
  if (state.monthlyUsed >= config.monthlyPublicBudget * 0.9) return "warn";

  return "allow";
}

// ============================================================
// Atomic reservation (ADR-0008 section 6.3)
// ============================================================

export interface ReservationResult {
  reserved: boolean;
  reservationId?: string;
  reservedAmount?: number;
  reason?: string;
}

/**
 * Atomically reserve budget before calling the provider.
 * If reservation fails, the model request must not begin.
 */
export function reserveBudget(
  config: TraceAIConfig,
  estimatedCost: number,
  providerBalance?: number,
): ReservationResult {
  resetIfNewPeriod();

  const maxCost = Math.min(estimatedCost * 1.5, config.maxCostPerRequest);

  // Check daily cap
  if (dailyUsed + currentReservation + maxCost > config.dailyPublicBudget) {
    return { reserved: false, reason: `Daily budget exceeded (used: $${dailyUsed.toFixed(4)}, limit: $${config.dailyPublicBudget.toFixed(2)})` };
  }

  // Check monthly cap
  if (monthlyUsed + currentReservation + maxCost > config.monthlyPublicBudget) {
    return { reserved: false, reason: `Monthly budget exceeded (used: $${monthlyUsed.toFixed(4)}, limit: $${config.monthlyPublicBudget.toFixed(2)})` };
  }

  // Check provider balance
  if (providerBalance !== undefined && providerBalance < config.stopBalance) {
    return { reserved: false, reason: `Provider balance below stop threshold ($${providerBalance.toFixed(2)})` };
  }

  // Reserve
  currentReservation += maxCost;
  const reservationId = `res_${crypto.randomUUID()}`;

  return { reserved: true, reservationId, reservedAmount: maxCost };
}

/**
 * Reconcile reservation after provider call completes.
 * Records actual usage and releases unused reserved amount.
 */
export function reconcileReservation(
  reservationId: string,
  actualCost: number,
  reservedAmount: number,
): void {
  void reservationId;
  // Record actual usage
  dailyUsed += actualCost;
  monthlyUsed += actualCost;

  // Release unused reservation
  const unused = Math.max(0, reservedAmount - actualCost);
  currentReservation = Math.max(0, currentReservation - unused - actualCost);

  // Safety clamp
  if (currentReservation < 0) currentReservation = 0;
}

/**
 * Release a reservation without recording usage (for failed/cancelled requests).
 */
export function releaseReservation(reservationId: string, reservedAmount: number): void {
  void reservationId;
  currentReservation = Math.max(0, currentReservation - reservedAmount);
}

// ============================================================
// Cost estimation
// ============================================================

// Approximate DeepSeek pricing (USD per 1M tokens, subject to change)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.55, output: 2.19 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  maxOutputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0.01; // Conservative fallback

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (maxOutputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

export function estimateMaxCost(
  config: TraceAIConfig,
  model: string = config.publicModel,
  maxInputTokens: number = config.maxInputTokens,
  maxOutputTokens: number = config.maxOutputTokens,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return config.maxCostPerRequest;

  const inputCost = (maxInputTokens / 1_000_000) * pricing.input;
  const outputCost = (maxOutputTokens / 1_000_000) * pricing.output;

  return Math.min(inputCost + outputCost, config.maxCostPerRequest);
}
