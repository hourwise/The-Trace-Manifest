import type { APIRoute } from "astro";
import { authenticateAccessRequest, type OperatorRole } from "../../../security/access-auth";
import { sameOriginRequest } from "../../../security/origin-policy";
import { signInternalRequest } from "../../../security/internal-signature";

export const prerender = false;

const MAX_BODY_BYTES = 64 * 1024;
const READ_ROUTES = new Set([
  "sources", "sources/health", "jobs", "cron-runs", "corrections",
  "published-stories", "clusters", "cluster-sources",
]);
const PUBLISH_ROUTES = new Set([
  "ingest", "classify", "dedup", "cluster", "extract-claims", "detect-conflicts",
  "correct", "seed-models", "extract-model-data", "publish-story", "withdraw-story",
  "publish-briefing", "archive-cluster",
]);

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

function authorisedRoute(path: string, method: string, role: OperatorRole): boolean {
  if (!/^[a-z0-9/-]+$/.test(path)) return false;
  if (method === "GET") return READ_ROUTES.has(path);
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

async function boundedBody(request: Request): Promise<string | null> {
  if (request.method === "GET") return "";
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";

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

  if (request.method === "POST" && !sameOriginRequest(request, env)) {
    if (!await auditDenial(env, identity, path, "origin_rejected")) {
      return Response.json({ error: "Audit service unavailable" }, { status: 503 });
    }
    return Response.json({ error: "Origin rejected" }, { status: 403 });
  }
  if (!authorisedRoute(path, request.method, identity.role)) {
    if (!await auditDenial(env, identity, path, "route_or_role_rejected")) {
      return Response.json({ error: "Audit service unavailable" }, { status: 503 });
    }
    return Response.json({ error: identity.role === "reader" ? "Forbidden" : "Not found" }, { status: identity.role === "reader" ? 403 : 404 });
  }

  const workerOrigin = validWorkerOrigin(env.TRACE_INGESTION_WORKER_URL);
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "";
  if (!workerOrigin || secret.length < 32) {
    return Response.json({ error: "Admin service is not configured." }, { status: 503 });
  }

  const body = await boundedBody(request);
  if (body === null) return Response.json({ error: "Request body is too large." }, { status: 413 });

  const incoming = new URL(request.url);
  const pathAndQuery = `/admin/${path}${incoming.search}`;
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signatureIdentity = { operator: identity.email, role: identity.role, timestamp, nonce };
  const signature = await signInternalRequest(secret, request.method, pathAndQuery, body, signatureIdentity);

  let upstream: Response;
  try {
    upstream = await fetch(`${workerOrigin}${pathAndQuery}`, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "X-Trace-Internal-Version": "v1",
        "X-Trace-Operator": identity.email,
        "X-Trace-Role": identity.role,
        "X-Trace-Timestamp": timestamp,
        "X-Trace-Nonce": nonce,
        "X-Trace-Signature": signature,
      },
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
