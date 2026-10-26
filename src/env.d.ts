/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

import type { OperatorIdentity } from "./security/access-auth";

interface CloudflarePagesEnv {
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  TRACE_ENVIRONMENT?: string;
  TRACE_ASK_MODE?: string;
  TRACE_ALLOWED_ORIGINS?: string;
  TRACE_VISITOR_HASH_SECRET?: string;
  TRACE_INTERNAL_SERVICE_SECRET?: string;
  TRACE_INGESTION_WORKER_URL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  TRACE_ADMIN_READERS?: string;
  TRACE_ADMIN_PUBLISHERS?: string;
  TRACE_AI_PUBLIC_ENABLED?: string;
  TRACE_AI_EDITORIAL_ENABLED?: string;
  TRACE_AI_SCHEDULED_ENABLED?: string;
  TRACE_AI_GLOBAL_KILL_SWITCH?: string;
  TRACE_AI_PUBLIC_MODEL?: string;
  TRACE_AI_EDITORIAL_MODEL?: string;
  TRACE_AI_DAILY_PUBLIC_BUDGET_USD?: string;
  TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD?: string;
  TRACE_AI_ASK_DAILY_BUDGET_USD?: string;
  TRACE_AI_EDITORIAL_DAILY_BUDGET_USD?: string;
  TRACE_AI_MAX_COST_PER_REQUEST_USD?: string;
  TRACE_AI_MAX_QUESTION_LENGTH?: string;
  TRACE_AI_MAX_EVIDENCE_EXCERPTS?: string;
  TRACE_AI_MAX_INPUT_TOKENS?: string;
  TRACE_AI_MAX_OUTPUT_TOKENS?: string;
  TRACE_AI_REQUEST_TIMEOUT_MS?: string;
  TRACE_AI_DAILY_QUESTIONS?: string;
  TRACE_AI_MAX_CONCURRENT?: string;
  TRACE_AI_FLASH_INPUT_USD_PER_MILLION?: string;
  TRACE_AI_FLASH_OUTPUT_USD_PER_MILLION?: string;
  TRACE_AI_PRO_INPUT_USD_PER_MILLION?: string;
  TRACE_AI_PRO_OUTPUT_USD_PER_MILLION?: string;
  /** TRACE Weekly signup; "true" opens /newsletter (also needs the newsletter and visitor secrets). */
  TRACE_NEWSLETTER_SIGNUP_ENABLED?: string;
  /** HMAC key (32+ chars) for address hashes and unsubscribe tokens. Secret. */
  TRACE_NEWSLETTER_SECRET?: string;
  /** "true" lets the outbox send through the configured provider. */
  TRACE_EMAIL_DELIVERY_ENABLED?: string;
  /** Only "resend" is implemented. */
  TRACE_EMAIL_PROVIDER?: string;
  /** Provider API key. Secret. */
  TRACE_EMAIL_API_KEY?: string;
  /** Verified sender, e.g. "TRACE Weekly <weekly@thetracemanifest.com>". */
  TRACE_EMAIL_FROM?: string;
}

type CloudflareRuntime = import("@astrojs/cloudflare").Runtime<CloudflarePagesEnv>;

declare global {
  namespace App {
    interface Locals extends CloudflareRuntime {
      operator?: OperatorIdentity;
    }
  }
}

export {};
