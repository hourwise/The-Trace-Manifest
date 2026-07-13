// The Trace Manifest — AI Gateway Configuration
// Phase 5: Server-side initialisation of the AI model gateway.
// Reads DEEPSEEK_API_KEY from environment (never exposed to browser).
// Per ADR-0008: key is server-side only, stored as encrypted Worker secret.

import { initGateway } from "./trace-model-gateway";
import type { TraceAIConfig, TraceModelId } from "./provider";

// ============================================================
// Configuration from environment
// ============================================================

function getEnv(key: string): string {
  // Cloudflare Pages Functions: env vars available via process.env (dev) or context (prod)
  // In Workers/Pages Functions, use globalThis or process.env
  try {
    // @ts-ignore — Cloudflare Workers runtime
    if (typeof DEBUG !== "undefined" && typeof DEBUG === "object") {
      // @ts-ignore
      return DEBUG[key] ?? "";
    }
  } catch { /* not in Workers env */ }

  // Node.js / Astro dev
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? "";
  }

  return "";
}

// ============================================================
// Build config
// ============================================================

export function buildConfig(): TraceAIConfig {
  const apiKey = getEnv("DEEPSEEK_API_KEY");

  if (!apiKey) {
    console.warn(
      "TRACE AI Gateway: DEEPSEEK_API_KEY not set. " +
      "Set it via `wrangler secret put DEEPSEEK_API_KEY` (production) " +
      "or in `.dev.vars` as DEEPSEEK_API_KEY=sk-... (local development)."
    );
  }

  const publicModel: TraceModelId = (getEnv("TRACE_PUBLIC_MODEL") || "deepseek-v4-flash") as TraceModelId;
  const editorialModel: TraceModelId = (getEnv("TRACE_EDITORIAL_MODEL") || "deepseek-v4-pro") as TraceModelId;

  return {
    // Feature switches
    publicAskTraceEnabled: getEnv("TRACE_PUBLIC_ASK_ENABLED") !== "false",
    scheduledJobsEnabled: getEnv("TRACE_SCHEDULED_JOBS_ENABLED") === "true",
    globalKillSwitch: getEnv("TRACE_GLOBAL_KILL_SWITCH") === "true",

    // Provider config
    provider: "deepseek",
    deepseekApiKey: apiKey,

    // Model routing
    publicModel,
    editorialModel,
    modelAllowlist: ["deepseek-v4-flash", "deepseek-v4-pro"],

    // Budget (USD) — configurable via env for emergency adjustment
    dailyPublicBudget: parseFloat(getEnv("TRACE_DAILY_BUDGET") || "1.00"),
    monthlyPublicBudget: parseFloat(getEnv("TRACE_MONTHLY_BUDGET") || "10.00"),
    maxCostPerRequest: parseFloat(getEnv("TRACE_MAX_COST_PER_REQUEST") || "0.02"),
    warningBalance: parseFloat(getEnv("TRACE_WARNING_BALANCE") || "2.00"),
    restrictBalance: parseFloat(getEnv("TRACE_RESTRICT_BALANCE") || "0.50"),
    stopBalance: parseFloat(getEnv("TRACE_STOP_BALANCE") || "0.10"),

    // Limits
    maxQuestionLength: parseInt(getEnv("TRACE_MAX_QUESTION_LENGTH") || "1000"),
    maxEvidenceExcerpts: parseInt(getEnv("TRACE_MAX_EVIDENCE_EXCERPTS") || "16"),
    maxInputTokens: parseInt(getEnv("TRACE_MAX_INPUT_TOKENS") || "12000"),
    maxOutputTokens: parseInt(getEnv("TRACE_MAX_OUTPUT_TOKENS") || "1500"),
    maxModelCallsPerRequest: 1,   // ADR-0008: hard limit
    maxRetries: 1,                // ADR-0008: bounded
    maxValidationRegenerations: 0, // ADR-0008: disabled initially
    requestTimeoutMs: parseInt(getEnv("TRACE_REQUEST_TIMEOUT_MS") || "30000"),

    // Rate limiting
    dailyPublicQuestionsPerVisitor: parseInt(getEnv("TRACE_DAILY_QUESTIONS") || "3"),
    maxConcurrentPerSession: parseInt(getEnv("TRACE_MAX_CONCURRENT") || "1"),
  };
}

// ============================================================
// Lazy initialisation (called once per isolate)
// ============================================================

let initialised = false;

export function ensureInitialised(): void {
  if (initialised) return;

  const config = buildConfig();
  initGateway(config);
  initialised = true;

  console.log(
    `TRACE AI Gateway: provider=${config.provider}, ` +
    `public=${config.publicModel}, editorial=${config.editorialModel}, ` +
    `dailyBudget=$${config.dailyPublicBudget.toFixed(2)}, ` +
    `keySet=${config.deepseekApiKey ? "yes" : "NO — GATEWAY WILL FAIL"}`
  );
}
