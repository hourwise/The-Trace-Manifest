// The Trace Manifest — AI Gateway Configuration
// Builds configuration from request-time Cloudflare bindings.
// Secrets remain server-side and are never read from the client bundle.

import { initGateway } from "./trace-model-gateway";
import type { TraceAIConfig, TraceModelId } from "./provider";

export type TraceAIEnvironment = Partial<Record<
  | "DEEPSEEK_API_KEY"
  | "TRACE_PUBLIC_MODEL"
  | "TRACE_EDITORIAL_MODEL"
  | "TRACE_PUBLIC_ASK_ENABLED"
  | "TRACE_SCHEDULED_JOBS_ENABLED"
  | "TRACE_GLOBAL_KILL_SWITCH"
  | "TRACE_DAILY_BUDGET"
  | "TRACE_MONTHLY_BUDGET"
  | "TRACE_MAX_COST_PER_REQUEST"
  | "TRACE_WARNING_BALANCE"
  | "TRACE_RESTRICT_BALANCE"
  | "TRACE_STOP_BALANCE"
  | "TRACE_MAX_QUESTION_LENGTH"
  | "TRACE_MAX_EVIDENCE_EXCERPTS"
  | "TRACE_MAX_INPUT_TOKENS"
  | "TRACE_MAX_OUTPUT_TOKENS"
  | "TRACE_REQUEST_TIMEOUT_MS"
  | "TRACE_DAILY_QUESTIONS"
  | "TRACE_MAX_CONCURRENT",
  string
>>;

function getEnv(runtimeEnv: TraceAIEnvironment, key: keyof TraceAIEnvironment): string {
  const runtimeValue = runtimeEnv[key];
  if (typeof runtimeValue === "string") return runtimeValue;

  // Supports the Node-based test runner and local development outside platformProxy.
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? "";
  }

  return "";
}

export function buildConfig(runtimeEnv: TraceAIEnvironment = {}): TraceAIConfig {
  const env = (key: keyof TraceAIEnvironment): string => getEnv(runtimeEnv, key);
  const apiKey = env("DEEPSEEK_API_KEY");

  const publicModel = (env("TRACE_PUBLIC_MODEL") || "deepseek-v4-flash") as TraceModelId;
  const editorialModel = (env("TRACE_EDITORIAL_MODEL") || "deepseek-v4-pro") as TraceModelId;

  return {
    publicAskTraceEnabled: env("TRACE_PUBLIC_ASK_ENABLED") !== "false",
    scheduledJobsEnabled: env("TRACE_SCHEDULED_JOBS_ENABLED") === "true",
    globalKillSwitch: env("TRACE_GLOBAL_KILL_SWITCH") === "true",

    provider: "deepseek",
    deepseekApiKey: apiKey,

    publicModel,
    editorialModel,
    modelAllowlist: ["deepseek-v4-flash", "deepseek-v4-pro"],

    dailyPublicBudget: parseFloat(env("TRACE_DAILY_BUDGET") || "1.00"),
    monthlyPublicBudget: parseFloat(env("TRACE_MONTHLY_BUDGET") || "10.00"),
    maxCostPerRequest: parseFloat(env("TRACE_MAX_COST_PER_REQUEST") || "0.02"),
    warningBalance: parseFloat(env("TRACE_WARNING_BALANCE") || "2.00"),
    restrictBalance: parseFloat(env("TRACE_RESTRICT_BALANCE") || "0.50"),
    stopBalance: parseFloat(env("TRACE_STOP_BALANCE") || "0.10"),

    maxQuestionLength: parseInt(env("TRACE_MAX_QUESTION_LENGTH") || "1000", 10),
    maxEvidenceExcerpts: parseInt(env("TRACE_MAX_EVIDENCE_EXCERPTS") || "16", 10),
    maxInputTokens: parseInt(env("TRACE_MAX_INPUT_TOKENS") || "12000", 10),
    maxOutputTokens: parseInt(env("TRACE_MAX_OUTPUT_TOKENS") || "1500", 10),
    maxModelCallsPerRequest: 1,
    maxRetries: 1,
    maxValidationRegenerations: 0,
    requestTimeoutMs: parseInt(env("TRACE_REQUEST_TIMEOUT_MS") || "30000", 10),

    dailyPublicQuestionsPerVisitor: parseInt(env("TRACE_DAILY_QUESTIONS") || "3", 10),
    maxConcurrentPerSession: parseInt(env("TRACE_MAX_CONCURRENT") || "1", 10),
  };
}

let initialised = false;

export function ensureInitialised(runtimeEnv: TraceAIEnvironment = {}): void {
  if (initialised) return;

  const config = buildConfig(runtimeEnv);
  if (!config.deepseekApiKey) {
    throw new Error("TRACE AI Gateway cannot initialise without DEEPSEEK_API_KEY.");
  }

  initGateway(config);
  initialised = true;

  console.log(JSON.stringify({
    message: "TRACE AI Gateway initialised",
    provider: config.provider,
    publicModel: config.publicModel,
    editorialModel: config.editorialModel,
    dailyBudget: config.dailyPublicBudget,
  }));
}
