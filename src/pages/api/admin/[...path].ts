import type { APIRoute } from "astro";
import { authenticateAccessRequest, type OperatorRole } from "../../../security/access-auth";
import { sameOriginRequest } from "../../../security/origin-policy";
import { signInternalRequest } from "../../../security/internal-signature";

export const prerender = false;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_INVENTORY_SNAPSHOT_BODY_BYTES = 512 * 1024;
const READ_ROUTES = new Set([
  "sources", "sources/health", "jobs", "cron-runs", "corrections",
  "published-stories", "clusters", "cluster-sources",
  "candidates", "social-signals", "related-items",
]);
const PUBLISH_ROUTES = new Set([
  "ingest", "classify", "dedup", "cluster", "extract-claims", "detect-conflicts",
  "correct", "seed-models", "extract-model-data", "publish-story", "withdraw-story",
  "publish-briefing", "archive-cluster",
  "approve-evidence-status",
  "knowledge/capture-missing",
  "knowledge/index-preview",
  "knowledge/kc-11g-h",
  "knowledge/backfill/snapshot", "knowledge/backfill/plan", "knowledge/backfill/approve",
  "knowledge/backfill/execute", "knowledge/backfill/retry", "knowledge/backfill/recover",
  "candidates", "social-signals", "related-items",
]);
const READ_ROUTES_WITH_BACKFILL = new Set(["knowledge/backfill/status"]);

interface ProxyEnvironment {
  DB?: D1Database;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  TRACE_ADMIN_READERS?: string;
  TRACE_ADMIN_PUBLISHERS?: string;
  TRACE_ENVIRONMENT?: string;
  TRACE_ALLOWED_ORIGINS?: string;
  TRACE_INGESTION_WORKER_URL?: string;
  TRACE_INTERNAL_SERVICE_SECRET?: string;
}

async function auditDenial(
  env: ProxyEnvironment,
  identity: { email: string; role: OperatorRole },
  path: string,
  detailCode: string,
): Promise<boolean> {
  if (!env.DB) return false;
  const requestId = crypto.randomUUID();
  try {
    await env.DB.prepare(`
      INSERT INTO admin_audit_log
        (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
      VALUES (?, ?, ?, ?, 'admin_proxy', ?, ?, 'denied', ?)
    `).bind(`${requestId}:denied`, identity.email, identity.role, `/api/admin/${path}`, path, requestId, detailCode).run();
    return true;
  } catch {
    return false;
  }
}

export function normaliseAdminPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0 || path.length > 200 || path.trim() !== path) return null;
  const segments = path.split("/");
  if (segments.length === 0 || segments.some((segment) => !/^[a-z0-9-]+$/.test(segment))) return null;
  return path;
}

export function buildWorkerAdminPath(path: unknown, search = ""): string | null {
  const normalised = normaliseAdminPath(path);
  if (!normalised || (search && (!search.startsWith("?") || search.includes("#")))) return null;
  return `/admin/${normalised}${search}`;
}

export function authorisedRoute(path: string, method: string, role: OperatorRole): boolean {
  const normalised = normaliseAdminPath(path);
  if (!normalised) return false;
  if (normalised === "social-signals") {
    return method === "GET" || (method === "POST" && role === "publisher"); // ADR 0009: explicit route allowance
  }
  path = normalised;
  if (method === "GET") return (READ_ROUTES.has(path) || READ_ROUTES_WITH_BACKFILL.has(path)) && (path !== "candidates" || role === "publisher");
  if (method === "POST") return role === "publisher" && PUBLISH_ROUTES.has(path);
  return false;
}

function validWorkerOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

async function boundedBody(request: Request, maximumBytes = MAX_BODY_BYTES): Promise<string | null> {
  if (request.method === "GET") return "";
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return null;
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
  return new TextDecoder().decode(bytes);
}

export async function handleAdminProxyRequest(
  request: Request,
  path: string,
  env: ProxyEnvironment,
): Promise<Response> {
  const identity = await authenticateAccessRequest(request, env);
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const normalisedPath = normaliseAdminPath(path);

  if (request.method === "POST" && !sameOriginRequest(request, env)) {
    if (!await auditDenial(env, identity, normalisedPath ?? path, "origin_rejected")) {
      return Response.json({ error: "Audit service unavailable" }, { status: 503 });
    }
    return Response.json({ error: "Origin rejected" }, { status: 403 });
  }
  if (!normalisedPath || !authorisedRoute(normalisedPath, request.method, identity.role)) {
    if (!await auditDenial(env, identity, normalisedPath ?? path, "route_or_role_rejected")) {
      return Response.json({ error: "Audit service unavailable" }, { status: 503 });
    }
    return Response.json({ error: identity.role === "reader" ? "Forbidden" : "Not found" }, { status: identity.role === "reader" ? 403 : 404 });
  }

  const workerOrigin = validWorkerOrigin(env.TRACE_INGESTION_WORKER_URL);
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "";
  if (!workerOrigin || secret.length < 32) {
    return Response.json({ error: "Admin service is not configured." }, { status: 503 });
  }

  const maximumBodyBytes = normalisedPath === "knowledge/backfill/snapshot"
    ? MAX_INVENTORY_SNAPSHOT_BODY_BYTES
    : MAX_BODY_BYTES;
  const body = await boundedBody(request, maximumBodyBytes);
  if (body === null) return Response.json({ error: "Request body is too large." }, { status: 413 });

  const incoming = new URL(request.url);
  const pathAndQuery = buildWorkerAdminPath(normalisedPath, incoming.search);
  if (!pathAndQuery) return Response.json({ error: "Malformed admin path." }, { status: 404 });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signatureIdentity = { operator: identity.email, role: identity.role, timestamp, nonce };
  const signature = await signInternalRequest(secret, request.method, pathAndQuery, body, signatureIdentity);

  let upstream: Response;
  try {
    const upstreamHeaders = new Headers({
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": identity.email,
      "X-Trace-Role": identity.role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": nonce,
      "X-Trace-Signature": signature,
    });
    const contentType = request.headers.get("content-type");
    if (contentType) upstreamHeaders.set("Content-Type", contentType);
    upstream = await fetch(`${workerOrigin}${pathAndQuery}`, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === "GET" ? undefined : body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json({ error: "Admin service is temporarily unavailable." }, { status: 503 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

const route: APIRoute = async ({ request, params, locals }) => {
  return handleAdminProxyRequest(request, params.path ?? "", locals.runtime.env);
};

export const GET = route;
export const POST = route;
