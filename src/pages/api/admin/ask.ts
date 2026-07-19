// ADR 0016: Governed admin Ask TRACE research endpoint.
// Publisher-only, uses existing evidence retrieval + AI gateway + all safety checks.
// Separate from public Ask TRACE (which stays disabled).
// Uses authenticateAccessRequest directly because locals.operator is undefined
// in Astro API routes (Cloudflare adapter limitation).

import type { APIRoute } from "astro";
import { buildConfig } from "../../../ai/config";
import { askTrace, hashPrivateIdentifier } from "../../../ai/trace-model-gateway";
import { retrievePublishedEvidence } from "../../../lib/server/ask-evidence";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../security/access-auth";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = buildConfig(env);
  if (!config.deepseekApiKey || config.globalKillSwitch) {
    return Response.json({ error: "Admin Ask TRACE is not configured." }, { status: 503 });
  }

  let body: { question?: string };
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question || question.length > config.maxQuestionLength) {
    return Response.json({ error: `question is required (max ${config.maxQuestionLength} chars).` }, { status: 400 });
  }

  if (!env.DB) return Response.json({ error: "Database unavailable." }, { status: 503 });

  const evidence = await retrievePublishedEvidence(env.DB, question, config.maxEvidenceExcerpts);
  const requestId = `admin_ask_${crypto.randomUUID()}`;
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "admin-research";
  const visitorSecret = env.TRACE_VISITOR_HASH_SECRET ?? secret;

  const result = await askTrace(env, {
    requestId,
    idempotencyKeyHash: await hashPrivateIdentifier(`admin-ask:${secret}:${question}`),
    visitorHash: await hashPrivateIdentifier(`admin:${visitorSecret}:${identity.email}`),
    questionHash: await hashPrivateIdentifier(`admin-q:${visitorSecret}:${question.toLowerCase()}`),
    question,
    evidenceExcerpts: evidence,
  });

  if (result.status === "ok" && result.payload) {
    return Response.json(result.payload, { headers: { "Cache-Control": "no-store" } });
  }

  const status = result.status === "rate_limited" ? 429
    : result.status === "in_progress" ? 409
    : 503;
  return Response.json({ error: result.message || "Ask TRACE is unavailable." }, { status });
};

// GET returns a simple status page
export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = buildConfig(env);
  return Response.json({
    status: config.deepseekApiKey && !config.globalKillSwitch ? "available" : "unavailable",
    model: config.publicModel,
    maxQuestionLength: config.maxQuestionLength,
    dailyBudget: config.dailyPublicBudget,
  });
};
