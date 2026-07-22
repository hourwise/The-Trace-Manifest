// ADR 0016: Governed admin Ask TRACE research endpoint.
// Publisher-only, uses existing evidence retrieval + AI gateway + all safety checks.
// Separate from public Ask TRACE (which stays disabled).
// Uses authenticateAccessRequest directly because locals.operator is undefined
// in Astro API routes (Cloudflare adapter limitation).
//
// ADR 0017: Records unanswered / low-confidence questions in the question_gaps
// queue so editors can prioritise knowledge-building work.

import type { APIRoute } from "astro";
import { buildConfig } from "../../../ai/config";
import { askTrace, hashPrivateIdentifier } from "../../../ai/trace-model-gateway";
import { retrievePublishedEvidence, retrieveApprovedKnowledge } from "../../../lib/server/ask-evidence";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../security/access-auth";

export const prerender = false;

// ── Question-gap recording (ADR 0017) ──────────────────────────────

const VALID_FAILURE_REASONS = [
  "insufficient", "stale", "disputed", "research_unavailable",
  "knowledge_missing", "out_of_scope", "low_confidence",
] as const;

async function canonicalHash(question: string): Promise<string> {
  const canonical = question.toLowerCase().trim();
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function recordQuestionGap(
  db: D1Database,
  question: string,
  failureReason: string,
): Promise<void> {
  try {
    const hash = await canonicalHash(question);
    const canonical = question.toLowerCase().trim();
    const reason = (VALID_FAILURE_REASONS as readonly string[]).includes(failureReason)
      ? failureReason
      : "knowledge_missing";

    const existing = await db
      .prepare("SELECT id FROM question_gaps WHERE canonical_hash = ?")
      .bind(hash)
      .first<{ id: string }>();

    if (existing) {
      await db
        .prepare(
          "UPDATE question_gaps SET request_count = request_count + 1, last_requested_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        )
        .bind(existing.id)
        .run();
      await db
        .prepare(
          "INSERT INTO question_gap_examples (id, question_gap_id, sanitised_question, source_kind) VALUES (?, ?, ?, 'ask_trace')",
        )
        .bind(crypto.randomUUID(), existing.id, question)
        .run();
    } else {
      const gapId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO question_gaps (id, canonical_question, canonical_hash, failure_reason, request_count, first_requested_at, last_requested_at) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))",
        )
        .bind(gapId, canonical, hash, reason)
        .run();
      await db
        .prepare(
          "INSERT INTO question_gap_examples (id, question_gap_id, sanitised_question, source_kind) VALUES (?, ?, ?, 'ask_trace')",
        )
        .bind(crypto.randomUUID(), gapId, question)
        .run();
    }
  } catch (err) {
    // Gap recording is best-effort; never fail the Ask TRACE request.
    console.error("question_gap record failed:", err);
  }
}

// ── Endpoint ───────────────────────────────────────────────────────

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

  // ADR 0017: merge published story evidence with approved knowledge documents.
  const storyEvidence = await retrievePublishedEvidence(env.DB, question, config.maxEvidenceExcerpts);
  const knowledgeEvidence = await retrieveApprovedKnowledge(env.DB, question, 4);
  // Deduplicate and interleave: stories first (higher weight), then knowledge
  const seenSourceIds = new Set(storyEvidence.map((e) => e.sourceId));
  const uniqueKnowledge = knowledgeEvidence.filter((e) => !seenSourceIds.has(e.sourceId));
  const evidence = [...storyEvidence, ...uniqueKnowledge];

  if (evidence.length === 0) {
    // ADR 0017: record the unanswered question before returning.
    await recordQuestionGap(env.DB, question, "knowledge_missing");
    return Response.json({
      answer: "No published evidence matches your question. Try broader terms, or publish relevant stories first via the Review queue.",
      keyPoints: [],
      claims: [],
      citations: [],
      confidence: "insufficient_evidence",
      confidenceScore: 0,
      confidenceReasons: ["No published evidence matched the question terms."],
      freshestObservedAt: null,
      hasMaterialDisagreement: false,
      disagreements: [],
      caveats: ["The knowledge base has no published stories with claims matching these search terms."],
      whatCouldChange: "Publishing relevant stories with extracted claims would make an answer possible.",
      requestId: `admin_ask_${crypto.randomUUID()}`,
      nonAnswer: true,
    }, { headers: { "Cache-Control": "no-store" } });
  }

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
    adminOverride: true,
  });

  if (result.status === "ok" && result.payload) {
    // ADR 0017: record gaps for non-answers or low-confidence results.
    if (result.payload.nonAnswer || (typeof result.payload.confidenceScore === "number" && result.payload.confidenceScore < 40)) {
      const reason = result.payload.nonAnswer
        ? (result.payload.confidence === "insufficient_evidence" ? "insufficient" : "knowledge_missing")
        : "low_confidence";
      await recordQuestionGap(env.DB, question, reason);
    }
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
