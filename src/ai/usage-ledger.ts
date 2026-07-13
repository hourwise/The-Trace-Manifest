// The Trace Manifest — Usage Ledger
// Phase 5: Records AI usage for audit, cost tracking, and budget reconciliation.
// Per ADR-0008 section 10: logs must not contain secrets, PII, or raw IPs.

import type { UsageRecord, TraceTaskType, TraceModelId } from "./provider";

// ============================================================
// In-memory ledger (per Worker isolate)
// For production: persist to D1 or durable object
// ============================================================

const usageRecords: UsageRecord[] = [];
const MAX_IN_MEMORY_RECORDS = 1000;

// ============================================================
// Record usage
// ============================================================

export function recordUsage(params: {
  requestId: string;
  idempotencyKeyHash: string;
  taskType: TraceTaskType;
  provider: string;
  model: TraceModelId;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  actualCost: number;
  attemptNumber: number;
  latencyMs: number;
  providerStatus: number;
  validationStatus: "passed" | "failed" | "skipped";
  validationFailures: string[];
  budgetReservation: number;
}): UsageRecord {
  const record: UsageRecord = {
    id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    requestId: params.requestId,
    idempotencyKeyHash: params.idempotencyKeyHash,
    taskType: params.taskType,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cachedTokens: params.cachedTokens,
    estimatedCost: 0, // Set by caller
    actualCost: params.actualCost,
    attemptNumber: params.attemptNumber,
    latencyMs: params.latencyMs,
    providerStatus: params.providerStatus,
    validationStatus: params.validationStatus,
    validationFailures: params.validationFailures,
    budgetReservation: params.budgetReservation,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  usageRecords.push(record);

  // Prune old records if exceeding max
  while (usageRecords.length > MAX_IN_MEMORY_RECORDS) {
    usageRecords.shift();
  }

  return record;
}

// ============================================================
// Query usage
// ============================================================

export function getRecentUsage(limit: number = 100): UsageRecord[] {
  return usageRecords.slice(-limit).reverse();
}

export function getUsageByTaskType(taskType: TraceTaskType): UsageRecord[] {
  return usageRecords.filter(r => r.taskType === taskType);
}

export function getDailyTotals(): { count: number; totalCost: number; totalTokens: number } {
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = usageRecords.filter(r => r.createdAt.startsWith(today));

  return {
    count: todayRecords.length,
    totalCost: todayRecords.reduce((sum, r) => sum + r.actualCost, 0),
    totalTokens: todayRecords.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
  };
}

export function getMonthlyTotals(): { count: number; totalCost: number; totalTokens: number } {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRecords = usageRecords.filter(r => r.createdAt.startsWith(thisMonth));

  return {
    count: monthRecords.length,
    totalCost: monthRecords.reduce((sum, r) => sum + r.actualCost, 0),
    totalTokens: monthRecords.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
  };
}

// ============================================================
// Export for persistence
// ============================================================

export function exportUsageRecords(): UsageRecord[] {
  return [...usageRecords];
}

export function clearUsageRecords(): void {
  usageRecords.length = 0;
}
