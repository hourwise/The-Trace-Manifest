// ADR 0017: Knowledge document source extraction and linking.
// Parses ## Evidence sections from knowledge docs, extracts URLs,
// matches against the source registry, and populates knowledge_document_sources.

import type { TraceSourceKind } from "../../ai/task-policy";

export interface ExtractedSource {
  url: string;
  name: string;
  description: string;
}

interface RegistrySource {
  id: number;
  name: string;
  url: string;
  tier: string;
  treatment: string;
}

/**
 * Extract URLs from the ## Evidence section of a knowledge document.
 * Handles markdown links: `- [Name](URL) — description`
 * And bare URLs on their own line.
 */
export function extractEvidenceUrls(body: string): ExtractedSource[] {
  const sources: ExtractedSource[] = [];

  // Find the ## Evidence section
  const evidenceMatch = body.match(/^## Evidence\s*\n([\s\S]*?)(?=^## |\n## |$)/m);
  if (!evidenceMatch) return sources;

  const section = evidenceMatch[1];

  // Match markdown links with optional description after —
  // Pattern: - [Name](URL) — description
  // Or: - [Name](URL)
  const linkRegex = /^-\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*[—–-]\s*(.+))?$/gm;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(section)) !== null) {
    const name = match[1].trim();
    const url = match[2].trim();
    const description = (match[3] ?? "").trim();

    // Validate URL
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    } catch {
      continue;
    }

    sources.push({ url, name, description });
  }

  // Also catch bare URLs on their own bullet line: - https://...
  const bareRegex = /^-\s*(https?:\/\/[^\s]+)\s*$/gm;
  while ((match = bareRegex.exec(section)) !== null) {
    const url = match[1].trim();
    try {
      new URL(url);
    } catch {
      continue;
    }
    // Avoid duplicates
    if (!sources.some((s) => s.url === url)) {
      sources.push({ url, name: new URL(url).hostname, description: "" });
    }
  }

  return sources;
}

/**
 * Match an extracted URL against the source registry.
 * Returns the registry source if a domain match is found, null otherwise.
 */
export async function matchSourceInRegistry(
  db: D1Database,
  url: string,
): Promise<RegistrySource | null> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  // Try exact domain match first, then partial match
  const sources = await db
    .prepare(
      `SELECT id, name, url, tier, treatment FROM sources WHERE active = 1 AND url LIKE ? LIMIT 1`,
    )
    .bind(`%${hostname}%`)
    .first<RegistrySource>();

  return sources ?? null;
}

/**
 * Determine source_kind, source_role, and independent_evidence_weight
 * based on whether the source is in the registry and its tier.
 */
export function classifySource(matched: RegistrySource | null): {
  sourceKind: TraceSourceKind;
  sourceRole: "evidence" | "reported_claim";
  admissionState: "admitted" | "quarantined";
  independentEvidenceWeight: 0 | 1;
} {
  if (!matched) {
    return {
      sourceKind: "external_vendor",
      sourceRole: "reported_claim",
      admissionState: "quarantined",
      independentEvidenceWeight: 0,
    };
  }

  // Known source in registry
  if (matched.tier === "A" || matched.tier === "B") {
    return {
      sourceKind: "external_independent",
      sourceRole: "evidence",
      admissionState: "admitted",
      independentEvidenceWeight: 1,
    };
  }

  // Tier C or other
  return {
    sourceKind: "external_vendor",
    sourceRole: "reported_claim",
    admissionState: "admitted",
    independentEvidenceWeight: 0,
  };
}

/**
 * Link extracted sources to a knowledge document.
 * Deletes existing source links for the document first (idempotent),
 * then inserts new ones.
 */
export async function linkKnowledgeSources(
  db: D1Database,
  knowledgeDocumentId: string,
  sources: ExtractedSource[],
): Promise<{ linked: number; quarantined: number }> {
  // Delete existing links for this document
  await db
    .prepare("DELETE FROM knowledge_document_sources WHERE knowledge_document_id = ?")
    .bind(knowledgeDocumentId)
    .run();

  let linked = 0;
  let quarantined = 0;

  for (const source of sources) {
    const matched = await matchSourceInRegistry(db, source.url);
    const classification = classifySource(matched);

    try {
      await db
        .prepare(
          `INSERT INTO knowledge_document_sources
           (id, knowledge_document_id, source_reference, claim_reference,
            source_kind, source_role, admission_state, freshness_state,
            independent_evidence_weight, relationship)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'current', ?, 'supports')`,
        )
        .bind(
          crypto.randomUUID(),
          knowledgeDocumentId,
          source.url,
          matched ? `source:${matched.id}` : "",
          classification.sourceKind,
          classification.sourceRole,
          classification.admissionState,
          classification.independentEvidenceWeight,
        )
        .run();

      if (classification.admissionState === "admitted") linked++;
      else quarantined++;
    } catch (err) {
      console.error(`Failed to link source ${source.url} for doc ${knowledgeDocumentId}:`, err);
    }
  }

  return { linked, quarantined };
}
