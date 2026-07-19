import type { APIRoute } from "astro";
import { authenticateAccessRequest } from "../../../security/access-auth";
import { signInternalRequest } from "../../../security/internal-signature";

export const prerender = false;

export const GET: APIRoute = async (ctx) => {
  const env = ctx.locals.runtime.env;
  const identity = await authenticateAccessRequest(ctx.request, env);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });

  const workerOrigin = env.TRACE_INGESTION_WORKER_URL;
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "";
  if (!workerOrigin || secret.length < 32) return Response.json({ error: "Not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const pathAndQuery = `/admin/social-signals${url.search}`;
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = await signInternalRequest(secret, "GET", pathAndQuery, "",
    { operator: identity.email, role: identity.role, timestamp, nonce });

  const upstream = await fetch(`${workerOrigin}${pathAndQuery}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": identity.email,
      "X-Trace-Role": identity.role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": nonce,
      "X-Trace-Signature": signature,
    },
    signal: AbortSignal.timeout(15_000),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
};
