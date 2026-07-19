import type { APIRoute } from "astro";
import { authenticateAccessRequest } from "../../../security/access-auth";
import { sameOriginRequest } from "../../../security/origin-policy";
import { signInternalRequest } from "../../../security/internal-signature";

export const prerender = false;

async function proxyToWorker(request: Request, env: any): Promise<Response> {
  const identity = await authenticateAccessRequest(request, env);
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });

  if (request.method === "POST" && !sameOriginRequest(request, env)) {
    return Response.json({ error: "Origin rejected" }, { status: 403 });
  }

  const workerOrigin = (() => {
    const raw = env.TRACE_INGESTION_WORKER_URL;
    if (!raw) return null;
    try { const u = new URL(raw); return u.protocol === "https:" && !u.username && !u.password ? u.origin : null; } catch { return null; }
  })();
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "";
  if (!workerOrigin || secret.length < 32) return Response.json({ error: "Not configured" }, { status: 503 });

  const url = new URL(request.url);
  const pathAndQuery = `/admin/social-signals${url.search}`;
  const body = request.method === "GET" ? "" : await request.text();
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = await signInternalRequest(secret, request.method, pathAndQuery, body, { operator: identity.email, role: identity.role, timestamp, nonce });

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
      body: body || undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-store" },
  });
}

export const GET: APIRoute = async (ctx) => proxyToWorker(ctx.request, ctx.locals.runtime.env);
export const POST: APIRoute = async (ctx) => proxyToWorker(ctx.request, ctx.locals.runtime.env);
