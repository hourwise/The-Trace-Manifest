import type { APIRoute } from "astro";
import { CAPTURE_PROTOCOL, readCaptureBody, verifyReceipt } from "../../../lib/server/capture-receipt";
export const prerender = false;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };
export const GET: APIRoute = () => Response.json({ protocol: CAPTURE_PROTOCOL }, { headers });
/**
 * Read-only proof redemption, reachable without Cloudflare Access by design.
 * A server-signed receipt AND the phone-only verifier are both required before
 * the single D1 read, so the route cannot enumerate, list or change anything.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const input = await readCaptureBody(request, 8192) as { receipt?: unknown; verifier?: unknown } | null;
  if (!input || typeof input.receipt !== "string" || typeof input.verifier !== "string") return Response.json({ error: "Invalid receipt." }, { status: 400, headers });
  const env = locals.runtime.env;
  if (!env.DB || (env.TRACE_INTERNAL_SERVICE_SECRET?.length ?? 0) < 32) return Response.json({ error: "Receipt service is not configured." }, { status: 503, headers });
  const r = await verifyReceipt(input.receipt, input.verifier, new URL(request.url).origin, env.TRACE_INTERNAL_SERVICE_SECRET!, env.TRACE_ENVIRONMENT ?? "");
  if (!r) return Response.json({ error: "Invalid or expired receipt." }, { status: 401, headers });
  try {
    const row = r.kind === "social"
      ? await env.DB.prepare("SELECT id FROM social_signals WHERE id = ?").bind(Number(r.id)).first()
      : await env.DB.prepare("SELECT id FROM editorial_candidates WHERE id = ?").bind(r.id).first();
    if (!row) return Response.json({ error: "Record not found." }, { status: 404, headers });
    return Response.json({ captureId: r.captureId, requestId: r.requestId, digest: r.digest,
      kind: r.kind, id: r.id, duplicate: r.duplicate }, { headers });
  } catch { return Response.json({ error: "Receipt service unavailable." }, { status: 503, headers }); }
};
