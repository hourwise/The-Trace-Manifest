// TRACE V1 Mission 1: narrow publisher-governed freshness review endpoint.
import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { sameOriginRequest, type OriginPolicyEnvironment } from "../../../../security/origin-policy";
import {
  approveFreshnessReview,
  EvidenceFreshnessReviewError,
  requestFreshnessReview,
  type ProposedFreshnessState,
} from "../../../../lib/server/evidence-freshness-review";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOriginRequest(request, env as unknown as OriginPolicyEnvironment)) {
    return Response.json({ error: "Origin rejected" }, { status: 403 });
  }
  if (!env.DB) return Response.json({ error: "Database unavailable." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 32_000) return Response.json({ error: "Request body is too large." }, { status: 413 });
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    if (body.operation === "request") {
      const result = await requestFreshnessReview(env.DB as D1Database, {
        claimAssertionId: text(body.claimAssertionId),
        proposedState: text(body.proposedState) as ProposedFreshnessState,
        sourceDocumentVersionId: text(body.sourceDocumentVersionId) || null,
        reason: text(body.reason),
        actor: identity.email,
        idempotencyKey: text(body.idempotencyKey),
      });
      return Response.json({ success: true, operation: "request", ...result });
    }
    if (body.operation === "approve") {
      const result = await approveFreshnessReview(env.DB as D1Database, text(body.reviewId), identity.email, text(body.reviewNote));
      return Response.json({ success: true, operation: "approve", ...result });
    }
    return Response.json({ error: "operation must be request or approve." }, { status: 400 });
  } catch (error) {
    if (error instanceof EvidenceFreshnessReviewError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("evidence freshness review failed", error);
    return Response.json({ error: "Evidence freshness review could not be saved." }, { status: 500 });
  }
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
