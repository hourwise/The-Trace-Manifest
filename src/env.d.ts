/// <reference types="astro/client" />

// Cloudflare Pages runtime types (Astro adapter)
declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
        PUBLIC_INGESTION_API_URL: string;
      };
      cf: IncomingRequestCfProperties;
      ctx: ExecutionContext;
    };
  }
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

interface D1Result<T = Record<string, unknown>> {
  results: T[];
}

// Cloudflare runtime types
interface IncomingRequestCfProperties {
  city?: string;
  country?: string;
  [key: string]: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ImportMetaEnv {
  readonly PUBLIC_INGESTION_API_URL: string;
  readonly ADMIN_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
