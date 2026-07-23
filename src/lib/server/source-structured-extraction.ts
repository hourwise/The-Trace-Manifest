/**
 * KC-04A–C: deterministic, review-gated structure extraction.
 *
 * Every candidate is anchored to a persisted source chunk and its original
 * HTML locator. This pass deliberately makes no claims about truth: records
 * are proposed, pending review, and carry zero external-AI cost.
 */

import type { ExtractedHtmlDocument, HtmlExtractionBlock } from "./source-extraction";

export const STRUCTURED_EXTRACTION_VERSION = "deterministic_structure_v1";

export type StructuredExtractionKind =
  | "entity"
  | "material_claim"
  | "attributed_opinion"
  | "date"
  | "model_version"
  | "benchmark_result"
  | "caveat";

export interface StructuredExtractionResult {
  chunksCreated: number;
  candidatesCreated: number;
  claimsCreated: number;
  summaryCreated: boolean;
}

interface Candidate {
  kind: StructuredExtractionKind;
  text: string;
  payload: Record<string, unknown>;
}

interface SourceChunkRow {
  id: string;
  chunkIndex: number;
  sectionLabel: string | null;
  text: string;
  textHash: string;
  locator: string;
}

/** Persists chunks, proposed structure, canonical claim candidates and a summary idempotently. */
export async function extractStructuredSource(
  db: D1Database,
  input: {
    sourceDocumentVersionId: string;
    sourceContentHash: string;
    extraction: ExtractedHtmlDocument;
  },
): Promise<StructuredExtractionResult> {
  const chunks = await buildChunks(input.sourceDocumentVersionId, input.extraction.blocks);
  let chunksCreated = 0;
  for (const chunk of chunks) {
    const result = await db.prepare(`
      INSERT OR IGNORE INTO source_chunks
        (id, source_document_version_id, chunk_index, section_label, text_excerpt, text_hash, start_locator, end_locator)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      chunk.id, input.sourceDocumentVersionId, chunk.chunkIndex, chunk.sectionLabel,
      chunk.text, chunk.textHash, chunk.locator, chunk.locator,
    ).run();
    chunksCreated += Number(result.meta.changes ?? 0);
  }

  let candidatesCreated = 0;
  let claimsCreated = 0;
  for (const chunk of chunks) {
    for (const candidate of candidatesForChunk(chunk.text)) {
      const candidateId = `extraction-${await sha256(`${input.sourceDocumentVersionId}:${chunk.id}:${candidate.kind}:${candidate.text}`)}`;
      const idempotencyKey = `${STRUCTURED_EXTRACTION_VERSION}:${input.sourceDocumentVersionId}:${chunk.id}:${candidate.kind}:${await sha256(candidate.text)}`;
      const inserted = await db.prepare(`
        INSERT OR IGNORE INTO source_extractions
          (id, source_document_version_id, source_chunk_id, extraction_kind, payload_json,
           start_locator, end_locator, extraction_method, extraction_version,
           policy_version, usage_json, cost_microusd, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'deterministic', ?, 'kc-04a-v1', ?, 0, ?)
      `).bind(
        candidateId, input.sourceDocumentVersionId, chunk.id, candidate.kind,
        JSON.stringify(candidate.payload), chunk.locator, chunk.locator,
        STRUCTURED_EXTRACTION_VERSION, JSON.stringify({ provider: "none", inputTokens: 0, outputTokens: 0 }), idempotencyKey,
      ).run();
      if (Number(inserted.meta.changes ?? 0) === 0) continue;
      candidatesCreated++;

      if (candidate.kind === "material_claim" || candidate.kind === "benchmark_result") {
        const canonicalClaimId = `canonical-${await sha256(`${input.sourceDocumentVersionId}:${candidate.text}`)}`;
        const claimText = candidate.text.slice(0, 2_000);
        await db.prepare(`
          INSERT OR IGNORE INTO canonical_claims
            (id, canonical_text, claim_class, claim_domain, predicate_key, object_json, current_state, materiality)
          VALUES (?, ?, ?, ?, ?, ?, 'active', 'standard')
        `).bind(
          canonicalClaimId, claimText,
          candidate.kind === "benchmark_result" ? "benchmark_result" : "community_report",
          candidate.kind === "benchmark_result" ? "benchmark" : "general",
          candidate.kind, JSON.stringify(candidate.payload),
        ).run();
        await db.prepare(`
          INSERT OR IGNORE INTO claim_assertions
            (id, canonical_claim_id, source_document_version_id, source_chunk_id,
             start_locator, end_locator, assertion_text, relationship, source_role,
             directness, evidence_treatment, admission_state, freshness_state,
             extraction_method, extraction_version, confidence, reviewer_state)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'reports', 'reported_claim', 'unknown',
                  'context_only', 'pending', 'unknown', 'deterministic', ?, 0.35, 'proposed')
        `).bind(
          `assertion-${candidateId}`, canonicalClaimId, input.sourceDocumentVersionId,
          chunk.id, chunk.locator, chunk.locator, claimText, STRUCTURED_EXTRACTION_VERSION,
        ).run();
        claimsCreated++;
      }
    }
  }

  const summary = buildDeterministicSummary(input.extraction);
  const summaryResult = await db.prepare(`
    INSERT OR IGNORE INTO source_summaries
      (id, source_document_version_id, summary_text, extraction_method, extraction_version,
       policy_version, usage_json, cost_microusd, source_content_hash)
    VALUES (?, ?, ?, 'deterministic', ?, 'kc-04a-v1', ?, 0, ?)
  `).bind(
    `summary-${input.sourceDocumentVersionId}`, input.sourceDocumentVersionId, summary,
    STRUCTURED_EXTRACTION_VERSION, JSON.stringify({ provider: "none", inputTokens: 0, outputTokens: 0 }),
    input.sourceContentHash,
  ).run();

  return {
    chunksCreated,
    candidatesCreated,
    claimsCreated,
    summaryCreated: Number(summaryResult.meta.changes ?? 0) > 0,
  };
}

async function buildChunks(versionId: string, blocks: HtmlExtractionBlock[]): Promise<SourceChunkRow[]> {
  const chunks: SourceChunkRow[] = [];
  for (const [chunkIndex, block] of blocks.entries()) {
    if (!block.text.trim()) continue;
    // D1 stores only a short, locator-backed excerpt; the permitted original
    // and full structured extraction remain in private R2.
    const text = block.text.trim().slice(0, 2_000);
    chunks.push({
      id: `chunk-${await sha256(`${versionId}:${chunkIndex}:${text}`)}`,
      chunkIndex,
      sectionLabel: block.kind === "heading" ? block.text.slice(0, 500) : null,
      text,
      textHash: await sha256(text),
      locator: block.locator || `html:${block.sourceStart}-${block.sourceEnd}`,
    });
  }
  return chunks;
}

function candidatesForChunk(text: string): Candidate[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length >= 35);
  const candidates: Candidate[] = [];
  for (const sentence of sentences.slice(0, 12)) {
    const lower = sentence.toLowerCase();
    let kind: StructuredExtractionKind = "material_claim";
    if (/\b(said|says|according to|argued|argues|believes|expects|told|opined)\b/i.test(sentence)) kind = "attributed_opinion";
    else if (/\b(v\d+\.\d+(?:\.\d+)?|\d+\.\d+(?:\.\d+)?\s*(?:b|m|k)?\b)/i.test(sentence) && /\b(model|release|version|parameter|weights?)\b/i.test(sentence)) kind = "model_version";
    else if (/\b(benchmark|accuracy|score|pass(?:ed)?\s+\d+%|latency|tokens?\/s)\b/i.test(sentence)) kind = "benchmark_result";
    else if (/\b(20\d{2}|19\d{2}|yesterday|today|tomorrow|last\s+(?:week|month|year))\b/i.test(sentence)) kind = "date";
    else if (/\b(however|but|caveat|limitation|may|might|could|unclear|not yet)\b/i.test(sentence)) kind = "caveat";
    if (kind === "date" && !/\b(released|announced|published|occurred|happened|scheduled)\b/i.test(lower)) continue;
    candidates.push({ kind, text: sentence.slice(0, 2_000), payload: { text: sentence.slice(0, 2_000), deterministic: true } });
  }
  return candidates;
}

function buildDeterministicSummary(extraction: ExtractedHtmlDocument): string {
  const title = extraction.title ? `${extraction.title}.` : "";
  const body = extraction.blocks
    .filter((block) => block.kind === "paragraph" || block.kind === "blockquote")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  const summary = `${title} ${body}`.trim().replace(/\s+/g, " ");
  return (summary || extraction.description || "No extractable source summary was produced.").slice(0, 2_000);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
