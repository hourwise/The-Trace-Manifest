/**
 * KC-04A–C: deterministic, review-gated structure extraction.
 *
 * Every candidate is anchored to a persisted source chunk and its original
 * HTML locator. This pass deliberately makes no claims about truth: records
 * are proposed, pending review, and carry zero external-AI cost.
 */

import type { ExtractedHtmlDocument, HtmlExtractionBlock } from "./source-extraction";
import {
  claimKnowledgeExtractionRun,
  failKnowledgeExtractionRun,
  settleKnowledgeExtractionRun,
} from "./knowledge-extraction-cache";
import { generateClaimMatchCandidates } from "./claim-match-candidates";

export const STRUCTURED_EXTRACTION_VERSION = "deterministic_structure_v1";
export const STRUCTURED_EXTRACTION_POLICY_VERSION = "kc-04a-v1";
export const STRUCTURED_EXTRACTION_PROMPT_VERSION = "none";
const STRUCTURED_EXTRACTION_TASK = "extract_source_structure" as const;

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
  matchCandidatesCreated: number;
  summaryCreated: boolean;
  extractionRunId: string;
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
    correlationId?: string;
  },
): Promise<StructuredExtractionResult> {
  const run = await beginExtractionRun(db, input);
  if (run.alreadyCompleted) {
    return {
      chunksCreated: 0,
      candidatesCreated: 0,
      claimsCreated: 0,
      matchCandidatesCreated: 0,
      summaryCreated: false,
      extractionRunId: run.id,
    };
  }
  if (run.inProgress) throw new Error("extraction_run_in_progress");

  try {
    const result = await persistStructuredExtraction(db, input, run.id);
    await settleKnowledgeExtractionRun(db, run.id, {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      estimatedCostMicrousd: 0,
      actualCostMicrousd: null,
      costBasis: "none",
      validationState: "valid",
      validation: {
      schema: "source_extraction_v1",
      locatorChecks: "passed",
      chunksCreated: result.chunksCreated,
      candidatesCreated: result.candidatesCreated,
      claimsCreated: result.claimsCreated,
      matchCandidatesCreated: result.matchCandidatesCreated,
      summaryCreated: result.summaryCreated,
      },
    });
    return { ...result, extractionRunId: run.id };
  } catch (error) {
    await failKnowledgeExtractionRun(db, run.id, classifyExtractionError(error)).catch(() => undefined);
    throw error;
  }
}

interface ExtractionRunHandle {
  id: string;
  alreadyCompleted: boolean;
  inProgress: boolean;
}

async function beginExtractionRun(
  db: D1Database,
  input: { sourceDocumentVersionId: string; sourceContentHash: string; correlationId?: string },
): Promise<ExtractionRunHandle> {
  const claim = await claimKnowledgeExtractionRun(db, {
    sourceDocumentVersionId: input.sourceDocumentVersionId,
    sourceContentHash: input.sourceContentHash,
    taskType: STRUCTURED_EXTRACTION_TASK,
    extractionMethod: "deterministic",
    extractionVersion: STRUCTURED_EXTRACTION_VERSION,
    modelProvider: null,
    modelIdentifier: null,
    promptVersion: STRUCTURED_EXTRACTION_PROMPT_VERSION,
    policyVersion: STRUCTURED_EXTRACTION_POLICY_VERSION,
    correlationId: input.correlationId ?? `kc04-${input.sourceDocumentVersionId}`,
  });
  return { id: claim.runId, alreadyCompleted: claim.status === "cached", inProgress: claim.status === "in_progress" };
}

async function persistStructuredExtraction(
  db: D1Database,
  input: { sourceDocumentVersionId: string; sourceContentHash: string; extraction: ExtractedHtmlDocument },
  extractionRunId: string,
): Promise<Omit<StructuredExtractionResult, "extractionRunId">> {
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
  let matchCandidatesCreated = 0;
  for (const chunk of chunks) {
    for (const candidate of candidatesForChunk(chunk.text)) {
      const candidateId = `extraction-${await sha256(`${input.sourceDocumentVersionId}:${chunk.id}:${candidate.kind}:${candidate.text}`)}`;
      const idempotencyKey = `${STRUCTURED_EXTRACTION_VERSION}:${input.sourceDocumentVersionId}:${chunk.id}:${candidate.kind}:${await sha256(candidate.text)}`;
      const inserted = await db.prepare(`
        INSERT OR IGNORE INTO source_extractions
          (id, source_document_version_id, source_chunk_id, extraction_kind, payload_json,
           start_locator, end_locator, extraction_method, extraction_version,
           policy_version, usage_json, cost_microusd, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'deterministic', ?, ?, ?, 0, ?)
      `).bind(
        candidateId, input.sourceDocumentVersionId, chunk.id, candidate.kind,
        JSON.stringify(candidate.payload), chunk.locator, chunk.locator,
        STRUCTURED_EXTRACTION_VERSION, STRUCTURED_EXTRACTION_POLICY_VERSION,
        JSON.stringify({ provider: "none", inputTokens: 0, outputTokens: 0, cachedTokens: 0, costMicrousd: 0 }), idempotencyKey,
      ).run();
      if (Number(inserted.meta.changes ?? 0) === 0) continue;
      candidatesCreated++;
      await db.prepare(`
        INSERT OR IGNORE INTO knowledge_extraction_run_outputs (extraction_run_id, output_type, output_id)
        VALUES (?, 'source_extraction', ?)
      `).bind(extractionRunId, candidateId).run();

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
        const matchResult = await generateClaimMatchCandidates(db, { sourceExtractionId: candidateId });
        matchCandidatesCreated += matchResult.candidatesCreated;
      }
    }
  }

  const summary = buildDeterministicSummary(input.extraction);
  const summaryResult = await db.prepare(`
    INSERT OR IGNORE INTO source_summaries
      (id, source_document_version_id, summary_text, extraction_method, extraction_version,
       policy_version, usage_json, cost_microusd, source_content_hash)
    VALUES (?, ?, ?, 'deterministic', ?, ?, ?, 0, ?)
  `).bind(
    `summary-${input.sourceDocumentVersionId}`, input.sourceDocumentVersionId, summary,
    STRUCTURED_EXTRACTION_VERSION, STRUCTURED_EXTRACTION_POLICY_VERSION,
    JSON.stringify({ provider: "none", inputTokens: 0, outputTokens: 0, cachedTokens: 0, costMicrousd: 0 }),
    input.sourceContentHash,
  ).run();
  await db.prepare(`
    INSERT OR IGNORE INTO knowledge_extraction_run_outputs (extraction_run_id, output_type, output_id)
    VALUES (?, 'source_summary', ?)
  `).bind(extractionRunId, `summary-${input.sourceDocumentVersionId}`).run();

  return {
    chunksCreated,
    candidatesCreated,
    claimsCreated,
    matchCandidatesCreated,
    summaryCreated: Number(summaryResult.meta.changes ?? 0) > 0,
  };
}

function classifyExtractionError(error: unknown): string {
  if (error instanceof Error && /constraint|foreign key|unique/i.test(error.message)) return "metadata_constraint_failed";
  return "structured_extraction_failed";
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
