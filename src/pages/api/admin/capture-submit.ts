import type { APIRoute } from "astro";
import { authenticateAccessRequest } from "../../../security/access-auth";
import { sameOriginRequest } from "../../../security/origin-policy";
import { auditDenial, handleAdminProxyRequest } from "./[...path]";
import { parseCapturePayload, readCaptureBody, sha256, signReceipt } from "../../../lib/server/capture-receipt";
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env);
  if (!identity) return Response.json({ error: "Sign in with Cloudflare Access." }, { status: 401 });
  if (identity.role !== "publisher" || !sameOriginRequest(request, env)) {
    if (!await auditDenial(env, identity, "capture-submit", "capture_origin_or_role_rejected")) {
      return Response.json({ error: "Audit service unavailable." }, { status: 503 });
    }
    return Response.json({ error: "Publisher permission and same-origin browser confirmation are required." }, { status: 403 });
  }
  const input = await readCaptureBody(request) as { payload?: unknown; challenge?: unknown } | null;
  if (!input || typeof input.payload !== "string" || typeof input.challenge !== "string" || !/^[a-f0-9]{64}$/.test(input.challenge)) {
    return Response.json({ error: "Invalid handoff." }, { status: 400 });
  }
  const p = parseCapturePayload(input.payload);
  if (!p) return Response.json({ error: "Invalid intake. Correct the original capture before starting a new attempt." }, { status: 422 });
  if (!env.DB || (env.TRACE_INTERNAL_SERVICE_SECRET?.length ?? 0) < 32) return Response.json({ error: "Receipt service is not configured." }, { status: 503 });
  try {
    const kind = p.kind;
    const body = kind === "social"
      ? { platform: p.platform, url: p.url, reason: p.reason, notes: p.notes }
      : { intakeType: kind === "lead" ? "lead" : "manual_url", url: p.url || undefined,
          lead: [p.lead, p.notes].filter(Boolean).join("\n\n"), captureRequestId: p.requestId };
    if (kind !== "social" && body.lead!.length > 8000) return Response.json({ error: "Lead plus provenance exceeds 8000 characters. Shorten the lead." }, { status: 422 });
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const upstream = await handleAdminProxyRequest(new Request(request.url, {
      method: "POST", headers, body: JSON.stringify(body),
    }), kind === "social" ? "social-signals" : "candidates", env);
    const conflict = upstream.status === 409;
    if (!upstream.ok && !(kind === "social" && conflict)) return upstream;
    // A successful POST alone is insufficient. Read the actual private queue row.
    // `duplicate` means this attempt did not create the record; `replay` means
    // an earlier try of this same attempt did (its response was lost).
    let id: string;
    let duplicate = false;
    let replay = false;
    if (kind === "social") {
      const row = await env.DB.prepare(`SELECT id, submitted_by, submission_reason, reviewer_notes
        FROM social_signals WHERE canonical_url_hash = ? AND canonical_url = ?`)
        .bind(await sha256(p.url), p.url)
        .first<{ id: number; submitted_by: string; submission_reason: string; reviewer_notes: string | null }>();
      if (!row) throw new Error("Record was not persisted.");
      id = String(row.id);
      if (conflict) {
        // The app's notes carry the capture id, so another capture of the same
        // URL never matches; only a retry of this exact attempt does.
        replay = row.submitted_by === identity.email && row.submission_reason === p.reason.trim()
          && (row.reviewer_notes ?? "") === p.notes.trim().slice(0, 4000);
        duplicate = !replay;
      }
    } else {
      const result = await upstream.json() as { id?: string; duplicate?: boolean };
      if (!result.id) throw new Error("Candidate identifier is missing.");
      const row = await env.DB.prepare("SELECT id FROM editorial_candidates WHERE id = ? AND created_by = ?")
        .bind(result.id, identity.email).first<{ id: string }>();
      if (!row) throw new Error("Record was not persisted.");
      id = row.id;
      // The candidate id is derived from this request id, so a 200 is always
      // this attempt's own record, never another submission's.
      replay = upstream.status === 200;
    }
    const receipt = await signReceipt({ version: 1, origin: new URL(request.url).origin,
      captureId: p.captureId, requestId: p.requestId, digest: await sha256(input.payload),
      challenge: input.challenge, kind, id, duplicate,
      expires: Date.now() + 7 * 86400000 }, env.TRACE_INTERNAL_SERVICE_SECRET!, env.TRACE_ENVIRONMENT ?? "");
    return Response.json({ receipt, id, kind, duplicate, replay }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Receipt could not be confirmed. Retry the same intake; do not create a new attempt." }, { status: 503 });
  }
};
