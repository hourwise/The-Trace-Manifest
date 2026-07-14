import type { TraceAIConfig, TraceModelId } from "./provider";

export type TraceAIEnvironment = Partial<Record<
  | "DEEPSEEK_API_KEY"
  | "TRACE_ENVIRONMENT"
  | "TRACE_AI_PUBLIC_ENABLED"
  | "TRACE_AI_EDITORIAL_ENABLED"
  | "TRACE_AI_SCHEDULED_ENABLED"
  | "TRACE_AI_GLOBAL_KILL_SWITCH"
  | "TRACE_AI_PUBLIC_MODEL"
  | "TRACE_AI_EDITORIAL_MODEL"
  | "TRACE_AI_DAILY_PUBLIC_BUDGET_USD"
  | "TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD"
  | "TRACE_AI_ASK_DAILY_BUDGET_USD"
  | "TRACE_AI_EDITORIAL_DAILY_BUDGET_USD"
  | "TRACE_AI_MAX_COST_PER_REQUEST_USD"
  | "TRACE_AI_MAX_QUESTION_LENGTH"
  | "TRACE_AI_MAX_EVIDENCE_EXCERPTS"
  | "TRACE_AI_MAX_INPUT_TOKENS"
  | "TRACE_AI_MAX_OUTPUT_TOKENS"
  | "TRACE_AI_REQUEST_TIMEOUT_MS"
  | "TRACE_AI_DAILY_QUESTIONS"
  | "TRACE_AI_MAX_CONCURRENT"
  | "TRACE_AI_FLASH_INPUT_USD_PER_MILLION"
  | "TRACE_AI_FLASH_OUTPUT_USD_PER_MILLION"
  | "TRACE_AI_PRO_INPUT_USD_PER_MILLION"
  | "TRACE_AI_PRO_OUTPUT_USD_PER_MILLION",
  string
>>;

function getEnv(runtimeEnv: TraceAIEnvironment, key: keyof TraceAIEnvironment): string {
  const runtimeValue = runtimeEnv[key];
  if (typeof runtimeValue === "string") return runtimeValue;
  const processEnvironment = typeof process !== "undefined" && process.env
    ? process.env.TRACE_ENVIRONMENT
    : undefined;
  const effectiveEnvironment = runtimeEnv.TRACE_ENVIRONMENT || processEnvironment;
  if (key === "TRACE_ENVIRONMENT" && processEnvironment) return processEnvironment;
  if (typeof process !== "undefined" && process.env && effectiveEnvironment !== "production") {
    return process.env[key] ?? "";
  }
  return "";
}

function numberValue(
  env: (key: keyof TraceAIEnvironment) => string,
  key: keyof TraceAIEnvironment,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env(key);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid numeric TRACE configuration: ${key}.`);
  }
  return value;
}

function modelValue(value: string, fallback: TraceModelId): TraceModelId {
  const model = value || fallback;
  if (model !== "deepseek-v4-flash" && model !== "deepseek-v4-pro") {
    throw new Error("Configured TRACE model is not allowlisted.");
  }
  return model;
}

export function buildConfig(runtimeEnv: TraceAIEnvironment = {}): TraceAIConfig {
  const env = (key: keyof TraceAIEnvironment): string => getEnv(runtimeEnv, key);
  const publicAskTraceEnabled = env("TRACE_AI_PUBLIC_ENABLED") === "true";
  const editorialAIEnabled = env("TRACE_AI_EDITORIAL_ENABLED") === "true";
  const scheduledJobsEnabled = env("TRACE_AI_SCHEDULED_ENABLED") === "true";
  const anyAIEnabled = publicAskTraceEnabled || editorialAIEnabled || scheduledJobsEnabled;
  const production = env("TRACE_ENVIRONMENT") === "production";
  const apiKey = env("DEEPSEEK_API_KEY");

  if (anyAIEnabled && !apiKey) throw new Error("TRACE AI is enabled but its provider secret is missing.");
  const pricingKeys: (keyof TraceAIEnvironment)[] = [
    "TRACE_AI_FLASH_INPUT_USD_PER_MILLION", "TRACE_AI_FLASH_OUTPUT_USD_PER_MILLION",
    "TRACE_AI_PRO_INPUT_USD_PER_MILLION", "TRACE_AI_PRO_OUTPUT_USD_PER_MILLION",
  ];
  if (production && anyAIEnabled && pricingKeys.some((key) => !env(key))) {
    throw new Error("TRACE AI is enabled but reviewed provider pricing configuration is incomplete.");
  }

  return {
    publicAskTraceEnabled,
    editorialAIEnabled,
    scheduledJobsEnabled,
    globalKillSwitch: env("TRACE_AI_GLOBAL_KILL_SWITCH") === "true",
    provider: "deepseek",
    deepseekApiKey: apiKey,
    publicModel: modelValue(env("TRACE_AI_PUBLIC_MODEL"), "deepseek-v4-flash"),
    editorialModel: modelValue(env("TRACE_AI_EDITORIAL_MODEL"), "deepseek-v4-pro"),
    modelAllowlist: ["deepseek-v4-flash", "deepseek-v4-pro"],
    dailyPublicBudget: numberValue(env, "TRACE_AI_DAILY_PUBLIC_BUDGET_USD", 1, 0.01, 10_000),
    monthlyPublicBudget: numberValue(env, "TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD", 10, 0.01, 100_000),
    maxCostPerRequest: numberValue(env, "TRACE_AI_MAX_COST_PER_REQUEST_USD", 0.02, 0.000001, 100),
    warningBalance: 2,
    restrictBalance: 0.5,
    stopBalance: 0.1,
    maxQuestionLength: numberValue(env, "TRACE_AI_MAX_QUESTION_LENGTH", 1_000, 1, 4_000),
    maxEvidenceExcerpts: numberValue(env, "TRACE_AI_MAX_EVIDENCE_EXCERPTS", 8, 1, 16),
    maxInputTokens: numberValue(env, "TRACE_AI_MAX_INPUT_TOKENS", 12_000, 100, 64_000),
    maxOutputTokens: numberValue(env, "TRACE_AI_MAX_OUTPUT_TOKENS", 1_500, 50, 8_000),
    maxModelCallsPerRequest: 1,
    maxRetries: 0,
    maxValidationRegenerations: 0,
    requestTimeoutMs: numberValue(env, "TRACE_AI_REQUEST_TIMEOUT_MS", 25_000, 1_000, 55_000),
    dailyPublicQuestionsPerVisitor: numberValue(env, "TRACE_AI_DAILY_QUESTIONS", 3, 1, 100),
    maxConcurrentPerSession: numberValue(env, "TRACE_AI_MAX_CONCURRENT", 1, 1, 1),
    modelPricing: {
      "deepseek-v4-flash": {
        inputPerMillionUsd: numberValue(env, "TRACE_AI_FLASH_INPUT_USD_PER_MILLION", 1, 0.000001, 1_000),
        outputPerMillionUsd: numberValue(env, "TRACE_AI_FLASH_OUTPUT_USD_PER_MILLION", 5, 0.000001, 1_000),
      },
      "deepseek-v4-pro": {
        inputPerMillionUsd: numberValue(env, "TRACE_AI_PRO_INPUT_USD_PER_MILLION", 2, 0.000001, 1_000),
        outputPerMillionUsd: numberValue(env, "TRACE_AI_PRO_OUTPUT_USD_PER_MILLION", 10, 0.000001, 1_000),
      },
    },
  };
}

export function configuredTaskDailyBudget(
  runtimeEnv: TraceAIEnvironment,
  task: "ask_trace" | "editorial",
  fallback: number,
): number {
  const key = task === "ask_trace" ? "TRACE_AI_ASK_DAILY_BUDGET_USD" : "TRACE_AI_EDITORIAL_DAILY_BUDGET_USD";
  const value = Number(getEnv(runtimeEnv, key) || fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid numeric TRACE configuration: ${key}.`);
  return value;
}
