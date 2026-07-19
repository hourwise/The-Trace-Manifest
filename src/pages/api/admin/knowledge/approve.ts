// ADR 0017: Knowledge document approval endpoint.
// Publisher-only. Approves a draft knowledge document for Ask TRACE retrieval.

import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = env.DB as D1Database;
  if (!db) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: { id?: string; visibility?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const docId = (body.id ?? "").trim();
  if (!docId || docId.length < 10 || docId.length > 200) {
    return Response.json({ error: "id is required." }, { status: 400 });
  }

  // Validate the document exists and is in a valid state
  const doc = await db
    .prepare("SELECT id, status, canonical_question, direct_answer FROM knowledge_documents WHERE id = ?")
    .bind(docId)
    .first<{ id: string; status: string; canonical_question: string; direct_answer: string | null }>();

  if (!doc) {
    return Response.json({ error: "Knowledge document not found." }, { status: 404 });
  }

  if (doc.status === "approved") {
    return Response.json({ error: "Document is already approved.", id: doc.id }, { status: 409 });
  }

  if (!doc.direct_answer || doc.direct_answer.trim().length < 10) {
    return Response.json({
      error: "Document must have a direct_answer before approval. Edit the document first.",
    }, { status: 400 });
  }

  // Determine visibility: public_knowledge (retrievable, not a public page) or public_guide
  const visibility = body.visibility === "public_guide" ? "public_guide" : "public_knowledge";

  try {
    await db
      .prepare(
        `UPDATE knowledge_documents SET
         status = 'approved',
         visibility = ?,
         approved_by = ?,
         approved_at = datetime('now'),
         updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(visibility, identity.email, docId)
      .run();

    return Response.json({
      success: true,
      id: docId,
      status: "approved",
      visibility,
      canonical_question: doc.canonical_question,
      message: `Knowledge document approved as ${visibility}. It is now retrievable by Ask TRACE.`,
    });
  } catch (err) {
    console.error("knowledge_document approve failed:", err);
    return Response.json({
      error: "Failed to approve knowledge document.",
      detail: String(err),
    }, { status: 500 });
  }
};
