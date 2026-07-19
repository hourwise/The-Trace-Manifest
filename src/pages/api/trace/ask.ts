import type { APIRoute } from "astro";
import { buildConfig } from "../../../ai/config";
import { askTrace, hashPrivateIdentifier, type TraceAIRuntimeEnvironment } from "../../../ai/trace-model-gateway";
import { retrievePublishedEvidence, retrieveApprovedKnowledge } from "../../../lib/server/ask-evidence";
import { corsHeaders, isAllowedOrigin, type OriginPolicyEnvironment } from "../../../security/origin-policy";

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

type AskEnvironment = TraceAIRuntimeEnvironment & OriginPolicyEnvironment & {
  TRACE_VISITOR_HASH_SECRET?: string;
};

interface AskTraceRequest { question: string }

export function validateAskBody(body: unknown, maximumLength = 1_000):
  | { valid: true; data: AskTraceRequest }
  | { valid: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Request body must be a JSON object." };
  }
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "question")) return { valid: false, error: "Unexpected request field." };
  if (typeof data.question !== "string") return { valid: false, error: "question is required." };
  const question = data.question.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!question) return { valid: false, error: "question must not be empty." };
  if (question.length > maximumLength) return { valid: false, error: `question must be ${maximumLength.toLocaleString("en-GB")} characters or fewer.` };
  return { valid: true, data: { question } };
}

async function readBoundedJson(request: Request): Promise<{ body?: unknown; error?: string; status?: number }> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return { error: "Request body too large.", status: 413 };
  if (!request.body) return { error: "Invalid JSON.", status: 400 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: "Request body too large.", status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: "Invalid JSON.", status: 400 };
  }
}

function json(message: unknown, status: number, headers: Record<string, string>, requestId?: string): Response {
  return Response.json(message, {
    status,
    headers: {
      ...headers,
      "Cache-Control": "no-store",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
  });
}

async function visitorIdentity(request: Request, env: AskEnvironment, dayKey: string): Promise<string | null> {
  const secret = env.TRACE_VISITOR_HASH_SECRET ?? "";
  const production = env.TRACE_ENVIRONMENT === "production";
  if (secret.length < 32) return null;
  const cloudflareIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (production && !cloudflareIp) return null;
  const networkIdentity = cloudflareIp || `${new URL(request.url).hostname}:development`;
  return hashPrivateIdentifier(`${secret}:${dayKey}:${networkIdentity}`);
}

export async function handleAskRequest(request: Request, env: AskEnvironment): Promise<Response> {
  const originHeaders = corsHeaders(request, env, "POST, OPTIONS");
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, env)) return json({ error: "Origin rejected." }, 403, originHeaders);
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, originHeaders);
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json." }, 415, originHeaders);
  }

  const parsed = await readBoundedJson(request);
  if (parsed.error) return json({ error: parsed.error }, parsed.status ?? 400, originHeaders);

  let config;
  try {
    config = buildConfig(env);
  } catch {
    return json({ message: "Ask TRACE is not configured." }, 503, originHeaders);
  }
  const validation = validateAskBody(parsed.body, config.maxQuestionLength);
  if (!validation.valid) return json({ error: validation.error }, 400, originHeaders);
  if (!config.publicAskTraceEnabled || config.globalKillSwitch) {
    return json({ message: "Ask TRACE is not currently enabled." }, 503, originHeaders);
  }
  if (!env.DB) return json({ message: "Ask TRACE is not configured." }, 503, originHeaders);

  const suppliedIdempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (suppliedIdempotencyKey && !IDEMPOTENCY_PATTERN.test(suppliedIdempotencyKey)) {
    return json({ error: "Idempotency-Key is malformed." }, 400, originHeaders);
  }

  const requestId = `ask_${crypto.randomUUID()}`;
  const dayKey = new Date().toISOString().slice(0, 10);
  const visitorHash = await visitorIdentity(request, env, dayKey);
  if (!visitorHash) return json({ message: "Ask TRACE abuse controls are not configured." }, 503, originHeaders, requestId);
  const questionHash = await hashPrivateIdentifier(`${env.TRACE_VISITOR_HASH_SECRET}:question:${validation.data.question.toLowerCase()}`);
  const stableActionKey = `${dayKey}:${visitorHash}:${suppliedIdempotencyKey || questionHash}`;
  const idempotencyKeyHash = await hashPrivateIdentifier(`${env.TRACE_VISITOR_HASH_SECRET}:${stableActionKey}`);

  let evidence;
  try {
    const storyEvidence = await retrievePublishedEvidence(env.DB, validation.data.question, config.maxEvidenceExcerpts);
    const knowledgeEvidence = await retrieveApprovedKnowledge(env.DB, validation.data.question, 4);
    const seenSourceIds = new Set(storyEvidence.map((e) => e.sourceId));
    const uniqueKnowledge = knowledgeEvidence.filter((e) => !seenSourceIds.has(e.sourceId));
    evidence = [...storyEvidence, ...uniqueKnowledge];
  } catch {
    console.error(JSON.stringify({ message: "Ask TRACE evidence retrieval failed", requestId }));
    return json({ message: "Ask TRACE evidence is temporarily unavailable.", requestId }, 503, originHeaders, requestId);
  }

  let result;
  try {
    result = await askTrace(env, {
      requestId,
      idempotencyKeyHash,
      visitorHash,
      questionHash,
      question: validation.data.question,
      evidenceExcerpts: evidence,
    });
  } catch {
    console.error(JSON.stringify({ message: "Ask TRACE request failed closed", requestId }));
    return json({ message: "Ask TRACE is temporarily unavailable.", requestId }, 503, originHeaders, requestId);
  }

  if (result.status === "ok" && result.payload) return json(result.payload, 200, originHeaders, result.payload.requestId);
  if (result.status === "rate_limited") {
    const retryAfter = result.message?.startsWith("Daily") ? "86400" : "30";
    return json({ message: result.message, requestId: result.requestId }, 429, { ...originHeaders, "Retry-After": retryAfter }, result.requestId);
  }
  if (result.status === "in_progress") return json({ message: result.message, requestId: result.requestId }, 409, originHeaders, result.requestId);
  return json({ message: result.message ?? "Ask TRACE is temporarily unavailable.", requestId: result.requestId }, result.status === "error" ? 422 : 503, originHeaders, result.requestId);
}

export const OPTIONS: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime?.env ?? {}) as AskEnvironment;
  const headers = corsHeaders(request, env, "POST, OPTIONS");
  return isAllowedOrigin(request.headers.get("Origin"), env)
    ? new Response(null, { status: 204, headers })
    : new Response(null, { status: 403, headers });
};

export const POST: APIRoute = async ({ request, locals }) => {
  return handleAskRequest(request, locals.runtime.env as AskEnvironment);
};
