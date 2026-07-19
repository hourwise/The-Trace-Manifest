// ADR 0017: Re-link knowledge document sources.
// Extracts evidence URLs from an existing document and populates
// knowledge_document_sources. Publisher-only.

import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { extractEvidenceUrls, linkKnowledgeSources } from "../../../../lib/server/knowledge-sources";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = env.DB as D1Database;
  if (!db) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const docId = (body.id ?? "").trim();
  if (!docId || docId.length < 10 || docId.length > 200) {
    return Response.json({ error: "id is required." }, { status: 400 });
  }

  // Get the document body
  const doc = await db
    .prepare("SELECT id, document_json, canonical_question FROM knowledge_documents WHERE id = ?")
    .bind(docId)
    .first<{ id: string; document_json: string; canonical_question: string }>();

  if (!doc) {
    return Response.json({ error: "Knowledge document not found." }, { status: 404 });
  }

  // Extract body from document_json
  let bodyText = "";
  try {
    const parsed = JSON.parse(doc.document_json);
    bodyText = parsed.body ?? "";
  } catch {
    bodyText = "";
  }

  if (!bodyText) {
    return Response.json({ error: "Document has no body content to extract sources from." }, { status: 400 });
  }

  // Extract and link
  const sources = extractEvidenceUrls(bodyText);
  if (sources.length === 0) {
    return Response.json({
      success: true,
      id: docId,
      sourcesLinked: 0,
      sourcesQuarantined: 0,
      message: "No evidence URLs found in the document body.",
    });
  }

  const result = await linkKnowledgeSources(db, docId, sources);

  return Response.json({
    success: true,
    id: docId,
    canonical_question: doc.canonical_question,
    sourcesFound: sources.length,
    sourcesLinked: result.linked,
    sourcesQuarantined: result.quarantined,
    message: `${sources.length} URL(s) found, ${result.linked} linked to registry, ${result.quarantined} quarantined.`,
  });
};
