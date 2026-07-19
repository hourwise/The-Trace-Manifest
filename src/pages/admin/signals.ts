import type { APIRoute } from "astro";
import { authenticateAccessRequest } from "../../security/access-auth";
import { signInternalRequest } from "../../security/internal-signature";

export const prerender = false;

async function proxy(env: any, request: Request): Promise<Response> {
  const identity = await authenticateAccessRequest(request, env);
  // TEMPORARY: accept any authenticated role — the Worker enforces HMAC signing
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const workerOrigin = env.TRACE_INGESTION_WORKER_URL;
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "";
  if (!workerOrigin || secret.length < 32) return Response.json({ error: "Not configured" }, { status: 503 });

  const url = new URL(request.url);
  const pathAndQuery = `/admin/social-signals${url.search}`;
  const body = request.method === "GET" ? "" : await request.text();
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const sig = await signInternalRequest(secret, request.method, pathAndQuery, body, { operator: identity.email, role: identity.role, timestamp: ts, nonce });

  const upstream = await fetch(`${workerOrigin}${pathAndQuery}`, {
    method: request.method,
    headers: { "Content-Type": "application/json", "X-Trace-Internal-Version": "v1", "X-Trace-Operator": identity.email, "X-Trace-Role": identity.role, "X-Trace-Timestamp": ts, "X-Trace-Nonce": nonce, "X-Trace-Signature": sig },
    body: body || undefined,
    signal: AbortSignal.timeout(15_000),
  });
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" } });
}

export const GET: APIRoute = async (ctx) => proxy(ctx.locals.runtime.env, ctx.request);
export const POST: APIRoute = async (ctx) => proxy(ctx.locals.runtime.env, ctx.request);
