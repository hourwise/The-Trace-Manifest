// The Trace Manifest — Circuit Breaker
// Phase 5: 10 circuit breakers per ADR-0008 section 11.
// Fail closed: when a circuit opens, requests are rejected safely.
// In-memory implementation for Cloudflare Worker (stateless across isolates).

import type { CircuitBreakerId, CircuitState, CircuitStatus } from "./provider";

// ============================================================
// Configuration
// ============================================================

interface BreakerConfig {
  failureThreshold: number;    // consecutive failures to open
  resetTimeoutMs: number;      // time before attempting half-open
  halfOpenMaxRequests: number; // max requests in half-open before deciding
}

const DEFAULT_CONFIGS: Record<CircuitBreakerId, BreakerConfig> = {
  global_kill:       { failureThreshold: 1,  resetTimeoutMs: Infinity, halfOpenMaxRequests: 0 },
  public_ask:        { failureThreshold: 10, resetTimeoutMs: 60_000,  halfOpenMaxRequests: 3 },
  scheduled_jobs:    { failureThreshold: 5,  resetTimeoutMs: 300_000, halfOpenMaxRequests: 1 },
  provider_deepseek: { failureThreshold: 5,  resetTimeoutMs: 120_000, halfOpenMaxRequests: 2 },
  model_flash:       { failureThreshold: 5,  resetTimeoutMs: 120_000, halfOpenMaxRequests: 2 },
  model_pro:         { failureThreshold: 3,  resetTimeoutMs: 300_000, halfOpenMaxRequests: 1 },
  daily_budget:      { failureThreshold: 1,  resetTimeoutMs: 86_400_000, halfOpenMaxRequests: 0 },
  monthly_budget:    { failureThreshold: 1,  resetTimeoutMs: 2_592_000_000, halfOpenMaxRequests: 0 },
  balance:           { failureThreshold: 1,  resetTimeoutMs: 86_400_000, halfOpenMaxRequests: 0 },
  auth_error:        { failureThreshold: 1,  resetTimeoutMs: Infinity, halfOpenMaxRequests: 0 },
  failure_rate:      { failureThreshold: 10, resetTimeoutMs: 300_000, halfOpenMaxRequests: 3 },
  latency:           { failureThreshold: 5,  resetTimeoutMs: 120_000, halfOpenMaxRequests: 2 },
};

// ============================================================
// Breaker state store (in-memory per isolate)
// ============================================================

interface BreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  lastFailureReason: string;
  openedAt: number;
  halfOpenRequests: number;
  successCount: number;
}

const breakers = new Map<CircuitBreakerId, BreakerState>();

function getBreaker(id: CircuitBreakerId): BreakerState {
  if (!breakers.has(id)) {
    breakers.set(id, {
      state: "closed",
      failureCount: 0,
      lastFailureAt: 0,
      lastFailureReason: "",
      openedAt: 0,
      halfOpenRequests: 0,
      successCount: 0,
    });
  }
  return breakers.get(id)!;
}

// ============================================================
// Public API
// ============================================================

/** Check if a request can proceed through this breaker. Returns true if allowed. */
export function allowRequest(id: CircuitBreakerId): boolean {
  const breaker = getBreaker(id);
  const config = DEFAULT_CONFIGS[id];

  switch (breaker.state) {
    case "closed":
      return true;

    case "open": {
      // Check if reset timeout has elapsed
      const now = Date.now();
      if (config.resetTimeoutMs !== Infinity && now - breaker.openedAt >= config.resetTimeoutMs) {
        breaker.state = "half_open";
        breaker.halfOpenRequests = 0;
        breaker.successCount = 0;
        return true; // Allow one probe request
      }
      return false;
    }

    case "half_open":
      return breaker.halfOpenRequests < config.halfOpenMaxRequests;

    default:
      return false;
  }
}

/** Record a successful request through this breaker. */
export function recordSuccess(id: CircuitBreakerId): void {
  const breaker = getBreaker(id);

  if (breaker.state === "half_open") {
    breaker.successCount++;
    if (breaker.successCount >= DEFAULT_CONFIGS[id].halfOpenMaxRequests) {
      breaker.state = "closed";
      breaker.failureCount = 0;
    }
  } else if (breaker.state === "closed") {
    breaker.failureCount = 0; // Reset on success
  }
}

/** Record a failed request through this breaker. May open the circuit. */
export function recordFailure(id: CircuitBreakerId, reason: string): void {
  const breaker = getBreaker(id);
  const config = DEFAULT_CONFIGS[id];

  breaker.failureCount++;
  breaker.lastFailureAt = Date.now();
  breaker.lastFailureReason = reason;

  if (breaker.failureCount >= config.failureThreshold) {
    breaker.state = "open";
    breaker.openedAt = Date.now();
    console.warn(`Circuit breaker OPEN: ${id} — ${reason} (${breaker.failureCount} failures)`);
  } else if (breaker.state === "half_open") {
    breaker.state = "open";
    breaker.openedAt = Date.now();
  }
}

/** Manually reset a breaker to closed state. */
export function resetBreaker(id: CircuitBreakerId): void {
  breakers.set(id, {
    state: "closed",
    failureCount: 0,
    lastFailureAt: 0,
    lastFailureReason: "",
    openedAt: 0,
    halfOpenRequests: 0,
    successCount: 0,
  });
}

/** Activate the global kill switch immediately. */
export function activateGlobalKillSwitch(reason: string): void {
  const breaker = getBreaker("global_kill");
  breaker.state = "open";
  breaker.openedAt = Date.now();
  breaker.lastFailureReason = reason;
  console.error(`GLOBAL KILL SWITCH ACTIVATED: ${reason}`);
}

/** Check if global kill switch is active. */
export function isGlobalKillSwitchActive(): boolean {
  return getBreaker("global_kill").state === "open";
}

/** Get status of all circuit breakers. */
export function getAllBreakerStatuses(): CircuitStatus[] {
  const result: CircuitStatus[] = [];
  for (const id of Object.keys(DEFAULT_CONFIGS) as CircuitBreakerId[]) {
    const breaker = getBreaker(id);
    result.push({
      breakerId: id,
      state: breaker.state,
      openedAt: breaker.openedAt > 0 ? new Date(breaker.openedAt).toISOString() : undefined,
      failureCount: breaker.failureCount,
      lastFailureAt: breaker.lastFailureAt > 0 ? new Date(breaker.lastFailureAt).toISOString() : undefined,
      lastFailureReason: breaker.lastFailureReason || undefined,
    });
  }
  return result;
}

/** Check which breakers would block a public Ask TRACE request. */
export function checkPublicAskTraceBreakers(): { allowed: boolean; blockingBreaker?: CircuitBreakerId; reason?: string } {
  const checks: CircuitBreakerId[] = [
    "global_kill", "public_ask", "provider_deepseek",
    "model_flash", "daily_budget", "monthly_budget", "balance",
    "auth_error", "failure_rate",
  ];

  for (const id of checks) {
    if (!allowRequest(id)) {
      const breaker = getBreaker(id);
      return { allowed: false, blockingBreaker: id, reason: breaker.lastFailureReason };
    }
  }

  return { allowed: true };
}
