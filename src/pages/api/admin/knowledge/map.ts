// KC-08D/E: publisher-only reviewed knowledge-to-evidence mapping and legacy-link migration.
import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { sameOriginRequest, type OriginPolicyEnvironment } from "../../../../security/origin-policy";
import {
  KnowledgeDocumentMappingError,
  mapKnowledgeDocumentClaim,
  type KnowledgeAssertionRelationship,
} from "../../../../lib/server/knowledge-document-mapping";
import type { KnowledgeClaimRelationship } from "../../../../lib/server/knowledge-markdown";

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
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const knowledgeDocumentId = text(body.knowledgeDocumentId);
  const sectionKey = text(body.sectionKey);
  const canonicalClaimId = text(body.canonicalClaimId);
  const legacySourceLinkId = text(body.legacySourceLinkId) || undefined;
  const claimRelationship = body.claimRelationship;
  const requestId = text(body.requestId) || crypto.randomUUID();
  if (!knowledgeDocumentId || !sectionKey || !canonicalClaimId) {
    return Response.json({ error: "knowledgeDocumentId, sectionKey, and canonicalClaimId are required." }, { status: 400 });
  }
  if (typeof claimRelationship !== "string") {
    return Response.json({ error: "claimRelationship is required." }, { status: 400 });
  }
  const assertions = parseAssertions(body.assertions);
  if (!assertions) return Response.json({ error: "assertions must be an array of assertion ids and relationships." }, { status: 400 });

  try {
    const result = await mapKnowledgeDocumentClaim(env.DB as D1Database, {
      knowledgeDocumentId,
      sectionKey,
      canonicalClaimId,
      claimRelationship: claimRelationship as KnowledgeClaimRelationship,
      assertions,
      reviewerEmail: identity.email,
      requestId,
      legacySourceLinkId,
    });
    return Response.json({ success: true, ...result, requestId });
  } catch (error) {
    if (error instanceof KnowledgeDocumentMappingError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("knowledge document mapping failed", error);
    return Response.json({ error: "Knowledge document mapping could not be saved." }, { status: 500 });
  }
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAssertions(value: unknown): Array<{ claimAssertionId: string; relationship: KnowledgeAssertionRelationship }> | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const assertions: Array<{ claimAssertionId: string; relationship: KnowledgeAssertionRelationship }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const assertion = item as { claimAssertionId?: unknown; relationship?: unknown };
    if (typeof assertion.claimAssertionId !== "string" || typeof assertion.relationship !== "string") return null;
    assertions.push({
      claimAssertionId: assertion.claimAssertionId.trim(),
      relationship: assertion.relationship as KnowledgeAssertionRelationship,
    });
  }
  return assertions;
}
