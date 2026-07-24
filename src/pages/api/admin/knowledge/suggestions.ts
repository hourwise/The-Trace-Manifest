// KC-08B: publisher-only, read-only suggestions for knowledge-to-evidence mapping.
import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import {
  KnowledgeLinkSuggestionError,
  suggestKnowledgeLinks,
} from "../../../../lib/server/knowledge-link-suggestions";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const identity = await authenticateAccessRequest(request, env as unknown as AccessEnvironment);
  if (!identity || identity.role !== "publisher") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Database unavailable." }, { status: 503 });

  const url = new URL(request.url);
  const knowledgeDocumentId = (url.searchParams.get("id") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{4,240}$/.test(knowledgeDocumentId)) {
    return Response.json({ error: "A valid knowledge document id is required." }, { status: 400 });
  }

  const maxClaims = parseLimit(url.searchParams.get("maxClaims"));
  const maxSources = parseLimit(url.searchParams.get("maxSources"));
  try {
    const result = await suggestKnowledgeLinks(env.DB as D1Database, {
      knowledgeDocumentId,
      maxClaims,
      maxSources,
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof KnowledgeLinkSuggestionError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("knowledge link suggestion failed", error);
    return Response.json({ error: "Knowledge link suggestions could not be generated." }, { status: 500 });
  }
};

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 25) : undefined;
}
