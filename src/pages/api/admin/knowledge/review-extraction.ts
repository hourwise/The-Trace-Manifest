import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { sameOriginRequest, type OriginPolicyEnvironment } from "../../../../security/origin-policy";
import {
  ExtractionReviewError,
  reviewKnowledgeExtraction,
  type ExtractionReviewState,
  type ExtractionReviewTarget,
} from "../../../../lib/server/knowledge-extraction-review";

export const prerender = false;

const states = new Set<ExtractionReviewState>([
  "proposed", "accepted", "amended", "rejected", "duplicate", "unsupported", "needs_research",
]);

export const PATCH: APIRoute = async ({ request, locals }) => {
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
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const targetType = body.targetType;
  const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const nextState = body.nextState;
  if (targetType !== "source_extraction" && targetType !== "source_summary") {
    return Response.json({ error: "targetType must be source_extraction or source_summary." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{4,240}$/.test(targetId)) return Response.json({ error: "Invalid targetId." }, { status: 400 });
  if (typeof nextState !== "string" || !states.has(nextState as ExtractionReviewState)) {
    return Response.json({ error: "Invalid review state." }, { status: 400 });
  }

  const note = body.reviewNote === undefined || body.reviewNote === null ? null : String(body.reviewNote).trim();
  if (note && note.length > 2_000) return Response.json({ error: "Review notes must be 2,000 characters or fewer." }, { status: 400 });

  let amendedValueJson: string | null = null;
  if (nextState === "amended") {
    if (targetType === "source_extraction") {
      const payload = body.amendedPayload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return Response.json({ error: "amendedPayload must be an object." }, { status: 400 });
      }
      const text = (payload as { text?: unknown }).text;
      if (typeof text !== "string" || text.trim().length < 1 || text.length > 2_000) {
        return Response.json({ error: "amendedPayload.text must be between 1 and 2,000 characters." }, { status: 400 });
      }
      amendedValueJson = JSON.stringify(payload);
    } else {
      const summaryText = body.summaryText;
      if (typeof summaryText !== "string" || summaryText.trim().length < 1 || summaryText.length > 2_000) {
        return Response.json({ error: "summaryText must be between 1 and 2,000 characters." }, { status: 400 });
      }
      amendedValueJson = JSON.stringify({ summaryText: summaryText.trim() });
    }
  } else if (body.amendedPayload !== undefined || body.summaryText !== undefined) {
    return Response.json({ error: "Amended content requires the amended review state." }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  try {
    const result = await reviewKnowledgeExtraction(env.DB as D1Database, {
      targetType: targetType as ExtractionReviewTarget,
      targetId,
      nextState: nextState as ExtractionReviewState,
      reviewerEmail: identity.email,
      reviewerRole: "publisher",
      reviewNote: note,
      amendedValueJson,
      requestId,
    });
    return Response.json({ success: true, ...result, requestId });
  } catch (error) {
    if (error instanceof ExtractionReviewError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("knowledge extraction review failed", error);
    return Response.json({ error: "Review could not be saved." }, { status: 500 });
  }
};
