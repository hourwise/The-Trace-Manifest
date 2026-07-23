import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { sameOriginRequest, type OriginPolicyEnvironment } from "../../../../security/origin-policy";
import {
  ClaimProvenanceReviewError,
  reviewClaimProvenanceProposal,
  type ClaimProvenanceReviewDecision,
} from "../../../../lib/server/claim-provenance-review";

export const prerender = false;
const decisions = new Set<ClaimProvenanceReviewDecision>(["accept", "reject"]);

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOriginRequest(request, env as unknown as OriginPolicyEnvironment)) return Response.json({ error: "Origin rejected" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Database unavailable." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16_000) return Response.json({ error: "Request body is too large." }, { status: 413 });
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
  const decision = body.decision;
  if (!/^[A-Za-z0-9_-]{4,240}$/.test(proposalId)) return Response.json({ error: "Invalid proposalId." }, { status: 400 });
  if (typeof decision !== "string" || !decisions.has(decision as ClaimProvenanceReviewDecision)) {
    return Response.json({ error: "decision must be accept or reject." }, { status: 400 });
  }
  const reviewNote = body.reviewNote === undefined || body.reviewNote === null ? null : String(body.reviewNote).trim();
  if (reviewNote && reviewNote.length > 2_000) return Response.json({ error: "Review notes must be 2,000 characters or fewer." }, { status: 400 });

  const requestId = crypto.randomUUID();
  try {
    const result = await reviewClaimProvenanceProposal(env.DB as D1Database, {
      proposalId,
      decision: decision as ClaimProvenanceReviewDecision,
      reviewerEmail: identity.email,
      reviewerRole: "publisher",
      reviewNote,
      requestId,
    });
    return Response.json({ success: true, ...result, requestId });
  } catch (error) {
    if (error instanceof ClaimProvenanceReviewError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("claim provenance review failed", error);
    return Response.json({ error: "Provenance review could not be saved." }, { status: 500 });
  }
};
