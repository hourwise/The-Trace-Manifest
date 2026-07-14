// The Trace Manifest — authenticated AI triage endpoint.
// All provider access flows through the TRACE model gateway.

import type { APIRoute } from "astro";
import { ensureInitialised, type TraceAIEnvironment } from "../../../ai/config";
import { generateEditorial } from "../../../ai/trace-model-gateway";

export const prerender = false;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SOURCES = 10;
const MAX_TITLE_LENGTH = 300;
const MAX_EXCERPT_LENGTH = 4000;

interface TriageSource {
  title: string;
  excerpt: string | null;
}

type TriageEnvironment = TraceAIEnvironment & {
  ADMIN_API_TOKEN?: string;
  DEEPSEEK_API_KEY?: string;
};

interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean;
}

function jsonError(error: string, status: number, requestId?: string): Response {
  return Response.json(
    { error, ...(requestId ? { requestId } : {}) },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function secureEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);

  const subtle = crypto.subtle as TimingSafeSubtleCrypto;
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(leftHash, rightHash);
  }

  // Node-based local tests do not expose Cloudflare's timingSafeEqual extension.
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function parseSources(value: unknown): TriageSource[] | null {
  if (!value || typeof value !== "object") return null;
  const sources = (value as { sources?: unknown }).sources;
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const parsed: TriageSource[] = [];
  for (const source of sources.slice(0, MAX_SOURCES)) {
    if (!source || typeof source !== "object") return null;
    const candidate = source as { title?: unknown; excerpt?: unknown };
    if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) return null;
    if (candidate.excerpt !== null && candidate.excerpt !== undefined && typeof candidate.excerpt !== "string") return null;

    parsed.push({
      title: candidate.title.trim().slice(0, MAX_TITLE_LENGTH),
      excerpt: typeof candidate.excerpt === "string"
        ? candidate.excerpt.trim().slice(0, MAX_EXCERPT_LENGTH)
        : null,
    });
  }

  return parsed;
}

export async function handleTriageRequest(request: Request, env: TriageEnvironment): Promise<Response> {
  const expectedToken = env.ADMIN_API_TOKEN ?? "";
  const authorization = request.headers.get("Authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!expectedToken || !suppliedToken || !(await secureEqual(suppliedToken, expectedToken))) {
    return jsonError("Unauthorized", 401);
  }

  if (!env.DEEPSEEK_API_KEY) {
    return jsonError("AI service is not configured for this deployment.", 503);
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) return jsonError("Request body is too large.", 413);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const sources = parseSources(parsedBody);
  if (!sources) {
    return jsonError("sources must contain at least one valid source object.", 400);
  }

  try {
    ensureInitialised(env);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown initialisation error";
    console.error(JSON.stringify({ message: "AI gateway initialisation failed", error: message }));
    return jsonError("AI service is unavailable.", 503);
  }

  const instruction = `Analyze the supplied sources for the admin review queue.
Return a factual headline, a neutral two-to-three sentence summary, a separate analysis,
a one-sentence why-it-matters statement, two-to-four concrete key points, and whether the item is newsworthy.
Routine patches, minor version bumps, and documentation-only changes are not newsworthy.
Do not invent facts or use hype. If the sources are thin, state that explicitly.`;

  const result = await generateEditorial(
    instruction,
    sources.map((source, index) => ({
      sourceId: `source-${index + 1}`,
      text: `TITLE: ${source.title}\n\n${source.excerpt || "[No excerpt available]"}`,
      sourceClassification: "ingestion-feed",
    })),
    { maxOutputTokens: 600, modelTier: "routine" },
  );

  if (result.status !== "ok" || !result.draft) {
    const status = result.status === "temporarily_unavailable" ? 503 : 502;
    return jsonError(result.error ?? "AI analysis is unavailable.", status, result.requestId);
  }

  const draft = result.draft;
  return Response.json({
    isNewsworthy: draft.isNewsworthy !== false,
    headline: (draft.headline || sources[0].title).slice(0, 150),
    summary: draft.summary.slice(0, 500),
    whyItMatters: (draft.whyItMatters || draft.analysis).slice(0, 300),
    keyFacts: draft.keyPoints.slice(0, 5),
    requestId: result.requestId,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  return handleTriageRequest(request, locals.runtime.env);
};
