import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { sameOriginRequest, type OriginPolicyEnvironment } from "../../../../security/origin-policy";
import { KnowledgeRevisionError, listKnowledgeRevisionHistory, proposeKnowledgeRevision, reviewKnowledgeRevision, type KnowledgeRevisionPayload } from "../../../../lib/server/knowledge-revisions";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOriginRequest(request, env as unknown as OriginPolicyEnvironment)) return Response.json({ error: "Origin rejected" }, { status: 403 });
  try {
    const body = await request.json() as {
      knowledgeDocumentId?: string; payload?: KnowledgeRevisionPayload; rationale?: string; changeSummary?: string; proposalId?: string | null;
    };
    const result = await proposeKnowledgeRevision(env.DB as D1Database, {
      knowledgeDocumentId: body.knowledgeDocumentId ?? "", payload: body.payload as KnowledgeRevisionPayload,
      rationale: body.rationale ?? "", changeSummary: body.changeSummary ?? "", proposalId: body.proposalId, createdBy: identity.email,
    });
    await audit(env.DB as D1Database, identity.email, "propose_knowledge_revision", result.revisionId, "succeeded");
    return Response.json(result, { status: 201 });
  } catch (error) { return revisionError(error); }
};

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });
  const documentId = new URL(request.url).searchParams.get("documentId") ?? "";
  try {
    const history = await listKnowledgeRevisionHistory(env.DB as D1Database, { knowledgeDocumentId: documentId });
    return Response.json({ knowledgeDocumentId: documentId, history });
  } catch (error) { return revisionError(error); }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOriginRequest(request, env as unknown as OriginPolicyEnvironment)) return Response.json({ error: "Origin rejected" }, { status: 403 });
  try {
    const body = await request.json() as { revisionId?: string; decision?: "approve" | "reject"; reviewNote?: string };
    if (body.decision !== "approve" && body.decision !== "reject") return Response.json({ error: "decision must be approve or reject." }, { status: 400 });
    const result = await reviewKnowledgeRevision(env.DB as D1Database, { revisionId: body.revisionId ?? "", decision: body.decision, reviewer: identity.email, reviewNote: body.reviewNote });
    await audit(env.DB as D1Database, identity.email, `review_knowledge_revision_${result.decision}`, result.revisionId, "succeeded");
    return Response.json(result);
  } catch (error) { return revisionError(error); }
};

async function audit(db: D1Database, email: string, action: string, targetId: string, outcome: string): Promise<void> {
  await db.prepare(`INSERT INTO admin_audit_log (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code) VALUES (?, ?, 'publisher', ?, 'knowledge_document_revision', ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), email, action, targetId, crypto.randomUUID(), outcome, "kc-10d").run();
}
function revisionError(error: unknown): Response {
  if (error instanceof KnowledgeRevisionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  return Response.json({ error: "Knowledge revision request failed." }, { status: 500 });
}
