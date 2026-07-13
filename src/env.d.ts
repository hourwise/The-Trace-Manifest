/// <reference types="astro/client" />

interface CloudflarePagesEnv {
  DB: D1Database;
  PUBLIC_INGESTION_API_URL: string;
  ADMIN_API_TOKEN?: string;
  DEEPSEEK_API_KEY?: string;
  TRACE_PUBLIC_MODEL?: string;
  TRACE_EDITORIAL_MODEL?: string;
  TRACE_PUBLIC_ASK_ENABLED?: string;
  TRACE_SCHEDULED_JOBS_ENABLED?: string;
  TRACE_GLOBAL_KILL_SWITCH?: string;
  TRACE_DAILY_BUDGET?: string;
  TRACE_MONTHLY_BUDGET?: string;
  TRACE_MAX_COST_PER_REQUEST?: string;
  TRACE_WARNING_BALANCE?: string;
  TRACE_RESTRICT_BALANCE?: string;
  TRACE_STOP_BALANCE?: string;
  TRACE_MAX_QUESTION_LENGTH?: string;
  TRACE_MAX_EVIDENCE_EXCERPTS?: string;
  TRACE_MAX_INPUT_TOKENS?: string;
  TRACE_MAX_OUTPUT_TOKENS?: string;
  TRACE_REQUEST_TIMEOUT_MS?: string;
  TRACE_DAILY_QUESTIONS?: string;
  TRACE_MAX_CONCURRENT?: string;
}

type CloudflareRuntime = import("@astrojs/cloudflare").Runtime<CloudflarePagesEnv>;

declare namespace App {
  interface Locals extends CloudflareRuntime {}
}

// D1 types (subset used by public data layer)
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { last_row_id: number } }>;
}

interface ImportMetaEnv {
  readonly PUBLIC_INGESTION_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
