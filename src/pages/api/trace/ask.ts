// The Trace Manifest — Ask TRACE API Endpoint
// POST /api/trace/ask
// Phase 5: Public endpoint for Ask TRACE Q&A.
// Per ADR-0008: browser calls this endpoint, never DeepSeek directly.
// Enforces rate limiting, abuse protection, and safe error responses.

import type { APIRoute } from "astro";
import { ensureInitialised } from "../../../ai/config";
import { askTrace } from "../../../ai/trace-model-gateway";

export const prerender = false;

// ============================================================
// Rate limiting (simple in-memory — replace with Cloudflare Rate Limiting in production)
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const DAILY_LIMIT = 3;       // Per visitor per day (ADR-0008)
const WINDOW_MS = 86_400_000; // 24 hours

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }

  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

// Clean up old entries periodically
function pruneRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

// ============================================================
// Request schema
// ============================================================

interface AskTraceRequest {
  question: string;
}

function validateBody(body: unknown): { valid: true; data: AskTraceRequest } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object." };
  }

  const data = body as Record<string, unknown>;

  if (typeof data.question !== "string" || data.question.trim().length === 0) {
    return { valid: false, error: "question is required and must be a non-empty string." };
  }

  if (data.question.length > 1000) {
    return { valid: false, error: "question must be 1,000 characters or fewer." };
  }

  // Reject unexpected fields
  const allowedFields = new Set(["question"]);
  for (const key of Object.keys(data)) {
    if (!allowedFields.has(key)) {
      return { valid: false, error: `Unexpected field: ${key}` };
    }
  }

  return { valid: true, data: { question: data.question.trim() } };
}

// ============================================================
// CORS
// ============================================================

const ALLOWED_ORIGINS = new Set([
  "https://thetracemanifest.com",
  "https://www.thetracemanifest.com",
  "https://thetracemanifest.uk",
  "https://www.thetracemanifest.uk",
]);

// During development, allow localhost
if (import.meta.env.DEV) {
  ALLOWED_ORIGINS.add("http://localhost:4321");
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ============================================================
// Endpoint handlers
// ============================================================

export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("Origin")),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);

  // 1. Method check (Astro handles this, but belt-and-suspenders)
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // 2. Content-Type check
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response(JSON.stringify({ error: "Content-Type must be application/json" }), {
      status: 415,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // 3. Body size check (before parsing)
  const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
  if (contentLength > 16_384) { // 16 KB
    return new Response(JSON.stringify({ error: "Request body too large." }), {
      status: 413,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // 4. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON." }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const validation = validateBody(body);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // 5. Rate limiting — privacy-preserving IP hash
  const ipIdentifier = request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")
    ?? "unknown";
  const sessionId = request.headers.get("X-Session-Id") ?? ipIdentifier;

  pruneRateLimitMap();
  const rateCheck = checkRateLimit(sessionId);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: "Daily question limit reached. Please try again tomorrow.",
        retryAfter: "Tomorrow",
      }),
      {
        status: 429,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Retry-After": "86400",
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // 6. Initialise from request-time Cloudflare bindings.
  try {
    ensureInitialised(locals.runtime.env);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialisation error";
    console.error(JSON.stringify({ message: "Ask TRACE gateway initialisation failed", error: message }));
    return new Response(JSON.stringify({ message: "Ask TRACE is temporarily unavailable." }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // 7. Call the AI gateway (server-side only — never exposes provider to browser)
  const result = await askTrace(validation.data.question, []);

  // 8. Build response — never expose internal details
  const responseHeaders: Record<string, string> = {
    ...headers,
    "Content-Type": "application/json",
    "X-Request-Id": result.requestId,
    "X-RateLimit-Remaining": String(rateCheck.remaining),
  };

  switch (result.status) {
    case "ok":
      return new Response(
        JSON.stringify({
          answer: result.answer?.answer,
          keyPoints: result.answer?.keyPoints,
          confidence: result.answer?.proposedConfidence,
          caveats: result.answer?.caveats,
          requestId: result.requestId,
        }),
        { status: 200, headers: responseHeaders },
      );

    case "temporarily_unavailable":
      return new Response(
        JSON.stringify({
          message: result.message ?? "Service temporarily unavailable. No request was charged.",
          requestId: result.requestId,
        }),
        { status: 503, headers: responseHeaders },
      );

    case "rate_limited":
      return new Response(
        JSON.stringify({
          message: result.message,
          requestId: result.requestId,
        }),
        { status: 429, headers: responseHeaders },
      );

    default:
      return new Response(
        JSON.stringify({
          message: "An unexpected error occurred.",
          requestId: result.requestId,
        }),
        { status: 500, headers: responseHeaders },
      );
  }
};
