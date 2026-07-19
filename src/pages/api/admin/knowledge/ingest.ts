// ADR 0017: Knowledge document ingestion endpoint.
// Publisher-only. Accepts Markdown with YAML frontmatter via drag-and-drop,
// parses, validates, and inserts into knowledge_documents.

import type { APIRoute } from "astro";
import { authenticateAccessRequest, type AccessEnvironment } from "../../../../security/access-auth";
import { extractEvidenceUrls, linkKnowledgeSources } from "../../../../lib/server/knowledge-sources";

export const prerender = false;

// ── Minimal frontmatter parser ────────────────────────────────────

interface ParsedFrontmatter {
  canonical_question?: string;
  section?: string;
  topics?: string[];
  knowledge_type?: string;
  evidence_status?: string;
  valid_from?: string;
  review_after?: string;
  hard_expiry?: string;
  source_set_hash?: string;
}

const VALID_KNOWLEDGE_TYPES = [
  "definition", "explainer", "comparison", "recommendation", "how_to",
  "current_status", "timeline", "product_profile", "model_profile",
  "policy_summary", "security_advisory", "frequently_asked_question",
];

const VALID_EVIDENCE_STATUSES = [
  "confirmed", "strongly_supported", "provisionally_supported",
  "vendor_reported", "community_reported", "disputed", "unverified",
  "insufficient", "stale",
];

function parseFrontmatter(raw: string): { frontmatter: ParsedFrontmatter; body: string } | { error: string } {
  // Must start with ---
  if (!raw.trimStart().startsWith("---")) {
    return { error: "Document must start with YAML frontmatter delimited by ---" };
  }

  const trimmed = raw.trimStart();
  const endOfFirstDelim = trimmed.indexOf("\n", 3);
  if (endOfFirstDelim === -1) {
    return { error: "Missing closing --- for YAML frontmatter" };
  }

  const rest = trimmed.slice(endOfFirstDelim + 1);
  const closingIdx = rest.indexOf("\n---");
  if (closingIdx === -1) {
    return { error: "Missing closing --- for YAML frontmatter" };
  }

  const yamlBlock = rest.slice(0, closingIdx);
  const body = rest.slice(closingIdx + 4).trim();

  const frontmatter: ParsedFrontmatter = {};
  const lines = yamlBlock.split("\n");
  let currentListKey: string | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    // List item
    if (trimmedLine.startsWith("- ") && currentListKey) {
      const value = trimmedLine.slice(2).trim().replace(/^["']|["']$/g, "");
      if (!frontmatter[currentListKey as keyof ParsedFrontmatter]) {
        (frontmatter as Record<string, unknown>)[currentListKey] = [];
      }
      ((frontmatter as Record<string, unknown>)[currentListKey] as string[]).push(value);
      continue;
    }

    // Key: value
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmedLine.slice(0, colonIdx).trim();
    let value = trimmedLine.slice(colonIdx + 1).trim();

    // Remove surrounding quotes
    value = value.replace(/^["']|["']$/g, "");

    if (!value || value === "..." || value === "YYYY-MM-DD" || value === '""') {
      // Empty/placeholder values — skip or store as empty
      if (["valid_from", "review_after", "hard_expiry", "source_set_hash"].includes(key)) {
        value = "";
      } else {
        continue; // skip empty required fields, they'll be caught in validation
      }
    }

    if (key === "topics") {
      currentListKey = "topics";
      if (value && value !== "[]") {
        frontmatter.topics = [value];
      }
      continue;
    }

    currentListKey = null;

    // Map known fields (snake_case from template → camelCase or db columns)
    (frontmatter as Record<string, unknown>)[key] = value;
  }

  return { frontmatter, body };
}

function parseBodySections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const headingRegex = /^## (.+)$/gm;
  const matches: { title: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(body)) !== null) {
    matches.push({ title: match[1].trim(), start: match.index, end: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : body.length;
    const content = body.slice(current.end, nextStart).trim();
    const slug = current.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    sections[slug] = content;
  }

  return sections;
}

async function canonicalHash(question: string): Promise<string> {
  const canonical = question.toLowerCase().trim();
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// ── Endpoint ───────────────────────────────────────────────────────

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

  // Accept raw text body (sent by client-side FileReader)
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!raw || raw.trim().length < 20) {
    return Response.json({ error: "Document content is too short. Paste the full Markdown file content." }, { status: 400 });
  }

  // Parse frontmatter
  const parsed = parseFrontmatter(raw);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { frontmatter, body } = parsed;

  // Validate required fields
  if (!frontmatter.canonical_question || frontmatter.canonical_question.trim().length < 5) {
    return Response.json({ error: "canonical_question is required (min 5 characters) in YAML frontmatter." }, { status: 400 });
  }

  if (!frontmatter.section) {
    return Response.json({ error: "section is required in YAML frontmatter (e.g. ai-agents)." }, { status: 400 });
  }

  if (!frontmatter.knowledge_type || !VALID_KNOWLEDGE_TYPES.includes(frontmatter.knowledge_type)) {
    return Response.json({
      error: `knowledge_type must be one of: ${VALID_KNOWLEDGE_TYPES.join(", ")}`,
    }, { status: 400 });
  }

  // Validate section exists
  const sectionExists = await db
    .prepare("SELECT slug FROM editorial_sections WHERE slug = ?")
    .bind(frontmatter.section)
    .first<{ slug: string }>();
  if (!sectionExists) {
    return Response.json({ error: `Section "${frontmatter.section}" not found. Check the slug.` }, { status: 400 });
  }

  // Validate topics if provided
  let topicSlug: string | null = null;
  if (frontmatter.topics && frontmatter.topics.length > 0) {
    const topic = frontmatter.topics[0]; // Use first topic
    const topicExists = await db
      .prepare("SELECT slug FROM editorial_topics WHERE slug = ? AND section_slug = ?")
      .bind(topic, frontmatter.section)
      .first<{ slug: string }>();
    if (topicExists) {
      topicSlug = topic;
    }
    // If topic doesn't exist, we just omit it — not a hard error
  }

  // Validate evidence_status
  const evidenceStatus = frontmatter.evidence_status &&
    VALID_EVIDENCE_STATUSES.includes(frontmatter.evidence_status)
    ? frontmatter.evidence_status
    : "unverified";

  // Generate ID
  const hash = await canonicalHash(frontmatter.canonical_question);
  const docId = `knowledge-${slugify(frontmatter.canonical_question)}-${hash.slice(0, 8)}`;

  // Check for duplicate
  const existing = await db
    .prepare("SELECT id, status, document_json, source_set_hash FROM knowledge_documents WHERE canonical_hash = ?")
    .bind(hash)
    .first<{ id: string; status: string; document_json: string; source_set_hash: string | null }>();

  const url = new URL(request.url);
  const overwrite = url.searchParams.get("overwrite") === "true";

  if (existing && !overwrite) {
    return Response.json({
      error: `A knowledge document already exists for this question (ID: ${existing.id}). Add ?overwrite=true to update it with a new revision.`,
      existingId: existing.id,
    }, { status: 409 });
  }

  // Parse body sections
  const bodySections = parseBodySections(body);

  // Extract direct_answer and detailed_explanation
  const directAnswer = bodySections["direct_answer"] ?? null;
  const detailedExplanation = bodySections["detailed_explanation"] ?? null;

  // Build document_json with all sections
  const documentJson = JSON.stringify({
    frontmatter,
    body,
    sections: bodySections,
  });

  // ── ADR 0017 checkbox 5: version history on overwrite ──────────
  if (existing && overwrite) {
    try {
      // Get current max revision number
      const maxRev = await db
        .prepare("SELECT MAX(revision_number) as max_rev FROM knowledge_document_revisions WHERE knowledge_document_id = ?")
        .bind(existing.id)
        .first<{ max_rev: number | null }>();
      const nextRevision = (maxRev?.max_rev ?? 0) + 1;

      // Save current version as a revision
      await db
        .prepare(
          `INSERT INTO knowledge_document_revisions
           (id, knowledge_document_id, revision_number, status, document_json, source_set_hash, change_summary, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          existing.id,
          nextRevision,
          existing.status,
          existing.document_json,
          existing.source_set_hash ?? null,
          `Overwritten via ingest API by ${identity.email}`,
          identity.email,
        )
        .run();

      // Update the existing document
      await db
        .prepare(
          `UPDATE knowledge_documents SET
           canonical_question = ?, section_slug = ?, topic_slug = ?,
           knowledge_type = ?, evidence_status = ?,
           direct_answer = ?, detailed_explanation = ?, document_json = ?,
           source_set_hash = ?, policy_version = 'trace-knowledge-v1',
           valid_from = ?, review_after = ?, hard_expiry = ?,
           updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          frontmatter.canonical_question.trim(),
          frontmatter.section,
          topicSlug,
          frontmatter.knowledge_type,
          evidenceStatus,
          directAnswer,
          detailedExplanation,
          documentJson,
          frontmatter.source_set_hash || null,
          frontmatter.valid_from || null,
          frontmatter.review_after || null,
          frontmatter.hard_expiry || null,
          existing.id,
        )
        .run();

      // ADR 0017: extract and link evidence sources
      const extractedSources = extractEvidenceUrls(body);
      const linkResult = await linkKnowledgeSources(db, existing.id, extractedSources);

      return Response.json({
        success: true,
        id: existing.id,
        canonical_question: frontmatter.canonical_question.trim(),
        knowledge_type: frontmatter.knowledge_type,
        section: frontmatter.section,
        status: existing.status,
        revision: nextRevision,
        sourcesLinked: linkResult.linked,
        sourcesQuarantined: linkResult.quarantined,
        message: `Knowledge document updated to revision ${nextRevision}. ${linkResult.linked} source(s) linked, ${linkResult.quarantined} quarantined.`,
      }, { status: 200 });
    } catch (err) {
      console.error("knowledge_document update failed:", err);
      return Response.json({
        error: "Failed to update knowledge document.",
        detail: String(err),
      }, { status: 500 });
    }
  }

  // Insert
  try {
    await db
      .prepare(
        `INSERT INTO knowledge_documents
         (id, canonical_question, canonical_hash, section_slug, topic_slug,
          knowledge_type, status, visibility, evidence_status,
          direct_answer, detailed_explanation, document_json,
          source_set_hash, policy_version,
          valid_from, review_after, hard_expiry,
          created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', 'internal', ?,
                 ?, ?, ?, ?, 'trace-knowledge-v1',
                 ?, ?, ?, ?)`,
      )
      .bind(
        docId,
        frontmatter.canonical_question.trim(),
        hash,
        frontmatter.section,
        topicSlug,
        frontmatter.knowledge_type,
        evidenceStatus,
        directAnswer,
        detailedExplanation,
        documentJson,
        frontmatter.source_set_hash || null,
        frontmatter.valid_from || null,
        frontmatter.review_after || null,
        frontmatter.hard_expiry || null,
        identity.email,
      )
      .run();

    // ADR 0017: extract and link evidence sources
    const extractedSources = extractEvidenceUrls(body);
    const linkResult = await linkKnowledgeSources(db, docId, extractedSources);

    return Response.json({
      success: true,
      id: docId,
      canonical_question: frontmatter.canonical_question.trim(),
      knowledge_type: frontmatter.knowledge_type,
      section: frontmatter.section,
      status: "draft",
      sourcesLinked: linkResult.linked,
      sourcesQuarantined: linkResult.quarantined,
      message: `Knowledge document created with ${linkResult.linked} linked source(s) and ${linkResult.quarantined} quarantined.`,
    }, { status: 201 });
  } catch (err) {
    console.error("knowledge_document insert failed:", err);
    return Response.json({
      error: "Failed to insert knowledge document.",
      detail: String(err),
    }, { status: 500 });
  }
};
