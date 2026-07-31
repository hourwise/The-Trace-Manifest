/**
 * KC-03C: persist an already-admitted source version without making it public
 * evidence. Large/original bodies and structured extraction stay in private
 * R2; D1 receives identifiers, hashes, metadata, and an idempotent R2 outbox.
 */

import type { ExtractedHtmlDocument } from "./source-extraction";
import { triggerKnowledgeReview } from "./knowledge-change-proposals";
import {
  hashNormalizedSourceContent,
  hashTransportBody,
  policyVersionFor,
  SOURCE_HASH_SEMANTICS_VERSION,
  LEGACY_SOURCE_HASH_SEMANTICS_VERSION,
} from "./source-version-identity";

export type SourceCaptureStorageMode = "metadata_only" | "short_excerpt" | "private_full_text" | "editor_supplied_document" | "prohibited";

export interface SourceCaptureEnvironment {
  DB: D1Database;
  RAW_STORE: Pick<R2Bucket, "put" | "delete">;
}

export interface SourceCaptureInput {
  canonicalUrl: string;
  retrievedUrl: string;
  contentType: string;
  body: string;
  extraction: ExtractedHtmlDocument;
  mediaKind: "html" | "markdown" | "plain_text" | "pdf" | "image" | "other";
  admissionState: "admitted";
  copyrightStorageMode: SourceCaptureStorageMode;
  sourceId?: number | null;
  httpStatus?: number | null;
  retrievedAt?: string;
  correlationId?: string;
  maximumBytes?: number;
  /** Exact response-byte hash from the retrieval boundary, when available. */
  transportHash?: string;
}

export interface SourceCaptureResult {
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  canonicalUrlHash: string;
  /** Compatibility alias: exact transport hash formerly called contentHash. */
  contentHash: string;
  transportHash: string;
  normalizedContentHash: string;
  hashSemanticsVersion: typeof SOURCE_HASH_SEMANTICS_VERSION | typeof LEGACY_SOURCE_HASH_SEMANTICS_VERSION;
  r2OriginalKey: string | null;
  r2ExtractedKey: string | null;
  extractionStatus: "captured" | "metadata_only";
  idempotencyKey: string | null;
}

export type SourceCaptureErrorCode = "invalid_input" | "storage_not_permitted" | "body_too_large" | "r2_write_failed" | "database_write_failed";

export class SourceCaptureError extends Error {
  constructor(message: string, readonly code: SourceCaptureErrorCode, readonly status: 400 | 413 | 500 = 400) {
    super(message);
    this.name = "SourceCaptureError";
  }
}

const DEFAULT_MAXIMUM_BYTES = 512 * 1024;

/** Captures one admitted source version, safely retryable for the same content. */
export async function captureAdmittedSource(
  env: SourceCaptureEnvironment,
  input: SourceCaptureInput,
): Promise<SourceCaptureResult> {
  const canonicalUrl = normaliseSourceUrl(input.canonicalUrl);
  const retrievedUrl = normaliseSourceUrl(input.retrievedUrl);
  const maximumBytes = boundedMaximum(input.maximumBytes);
  const bodyBytes = new TextEncoder().encode(input.body);
  if (!canonicalUrl || !retrievedUrl || !input.contentType || !input.body || input.admissionState !== "admitted") {
    throw new SourceCaptureError("Only an admitted, non-empty source can be captured.", "invalid_input");
  }
  if (bodyBytes.byteLength > maximumBytes) {
    throw new SourceCaptureError("The source exceeds the capture size limit.", "body_too_large", 413);
  }
  if (input.copyrightStorageMode === "prohibited") {
    throw new SourceCaptureError("This source storage mode prohibits capture.", "storage_not_permitted");
  }

  const canonicalUrlHash = await sha256(canonicalUrl);
  const transportHash = input.transportHash ?? await hashTransportBody(input.body);
  if (!/^[0-9a-f]{64}$/i.test(transportHash)) {
    throw new SourceCaptureError("The source transport hash is invalid.", "invalid_input");
  }
  const normalized = await hashNormalizedSourceContent({ mediaKind: input.mediaKind, body: input.body, extraction: input.extraction });
  const normalizedContentHash = normalized.normalizedContentHash;
  const sourceDocumentId = `source-${canonicalUrlHash}`;
  const existingVersion = await env.DB.prepare(`
    SELECT id, hash_semantics_version, r2_original_key, r2_extracted_key, extraction_status
    FROM source_document_versions
    WHERE source_document_id = ?
      AND (normalized_content_hash = ? OR (normalized_content_hash IS NULL AND content_hash = ?))
    ORDER BY CASE WHEN normalized_content_hash = ? THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1
  `).bind(sourceDocumentId, normalizedContentHash, transportHash, normalizedContentHash).first<{
    id: string;
    hash_semantics_version: string;
    r2_original_key: string | null;
    r2_extracted_key: string | null;
    extraction_status: "captured" | "metadata_only" | null;
  }>();
  const sourceDocumentVersionId = existingVersion?.id ?? `source-version-${canonicalUrlHash}-${normalizedContentHash}`;
  const canStoreBody = input.copyrightStorageMode === "private_full_text" || input.copyrightStorageMode === "editor_supplied_document";
  const shouldStoreBody = canStoreBody && !existingVersion;
  const extractionStatus = shouldStoreBody
    ? (input.extraction.extractionState === "extracted" ? "captured" : "metadata_only")
    : (existingVersion?.extraction_status ?? "metadata_only");
  const r2OriginalKey = existingVersion?.r2_original_key ?? (shouldStoreBody ? `knowledge/${canonicalUrlHash}/versions/${transportHash}/original` : null);
  const r2ExtractedKey = existingVersion?.r2_extracted_key ?? (shouldStoreBody ? `knowledge/${canonicalUrlHash}/versions/${transportHash}/extracted.json` : null);
  const idempotencyKey = existingVersion ? (r2OriginalKey ? `r2-put:${sourceDocumentVersionId}` : null) : (shouldStoreBody ? `r2-put:${sourceDocumentVersionId}` : null);
  const extractedBody = JSON.stringify(input.extraction);
  const retrievedAt = input.retrievedAt ?? new Date().toISOString();

  if (shouldStoreBody) {
    try {
      await env.RAW_STORE.put(r2OriginalKey!, input.body, {
        httpMetadata: { contentType: input.contentType },
        customMetadata: {
          artifact_kind: "source_original",
          content_hash: transportHash,
          source_document_id: sourceDocumentId,
          source_document_version_id: sourceDocumentVersionId,
        },
      });
      await env.RAW_STORE.put(r2ExtractedKey!, extractedBody, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          artifact_kind: "source_extraction",
          source_content_hash: transportHash,
          source_document_id: sourceDocumentId,
          source_document_version_id: sourceDocumentVersionId,
        },
      });
    } catch {
      await env.RAW_STORE.delete([r2OriginalKey!, r2ExtractedKey!]).catch(() => undefined);
      throw new SourceCaptureError("The source could not be written to private storage.", "r2_write_failed", 500);
    }
  }

  try {
    const statements = [
      env.DB.prepare(`
        INSERT OR IGNORE INTO source_documents
          (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode)
        VALUES (?, ?, ?, ?, ?, 'admitted', ?)
      `).bind(sourceDocumentId, canonicalUrl, canonicalUrlHash, input.sourceId ?? null, input.mediaKind, input.copyrightStorageMode),
      env.DB.prepare(`
        UPDATE source_documents
        SET source_id = COALESCE(?, source_id), admission_state = 'admitted',
            copyright_storage_mode = ?, last_seen_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(input.sourceId ?? null, input.copyrightStorageMode, retrievedAt, sourceDocumentId),
      ...(existingVersion ? [] : [env.DB.prepare(`
        INSERT OR IGNORE INTO source_document_versions
          (id, source_document_id, content_hash, transport_hash, normalized_content_hash,
           hash_semantics_version, retrieved_url, retrieved_at, http_status, media_type,
           byte_length, title, author, published_at, r2_original_key, r2_extracted_key,
           extraction_status, extraction_method, extraction_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sourceDocumentVersionId, sourceDocumentId, transportHash, transportHash, normalizedContentHash,
        SOURCE_HASH_SEMANTICS_VERSION, retrievedUrl, retrievedAt,
        input.httpStatus ?? null, input.contentType, bodyBytes.byteLength,
        input.extraction.title, input.extraction.author, input.extraction.publishedAt,
        r2OriginalKey, r2ExtractedKey, extractionStatus,
        input.extraction.diagnostics.extractionMethod, policyVersionFor(input.mediaKind),
      )]),
      env.DB.prepare(`
        INSERT OR IGNORE INTO source_document_version_observations
          (id, source_document_version_id, transport_hash, normalized_content_hash,
           hash_semantics_version, retrieved_url, retrieved_at, http_status, media_type,
           byte_length, extraction_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `observation-${sourceDocumentVersionId}-${transportHash}`, sourceDocumentVersionId,
        transportHash, normalizedContentHash, SOURCE_HASH_SEMANTICS_VERSION,
        retrievedUrl, retrievedAt, input.httpStatus ?? null, input.contentType,
        bodyBytes.byteLength, policyVersionFor(input.mediaKind),
      ),
      env.DB.prepare(`
        UPDATE source_documents SET current_version_id = ?, last_seen_at = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(sourceDocumentVersionId, retrievedAt, sourceDocumentId),
    ];
    if (idempotencyKey) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO knowledge_index_operations
          (id, operation_kind, subject_type, subject_id, desired_content_hash, idempotency_key)
        VALUES (?, 'r2_put', 'source_document_version', ?, ?, ?)
      `).bind(`operation-${idempotencyKey}`, sourceDocumentVersionId, transportHash, idempotencyKey));
    }
    await env.DB.batch(statements);
  } catch {
    if (shouldStoreBody) await env.RAW_STORE.delete([r2OriginalKey!, r2ExtractedKey!]).catch(() => undefined);
    throw new SourceCaptureError("The source metadata could not be recorded.", "database_write_failed", 500);
  }

  await triggerKnowledgeReview(env.DB, {
    kind: "evidence_changed",
    sourceDocumentIds: [sourceDocumentId],
    sourceDocumentVersionId,
    eventId: sourceDocumentVersionId,
  });

  return {
    sourceDocumentId, sourceDocumentVersionId, canonicalUrlHash,
    contentHash: transportHash, transportHash, normalizedContentHash,
    hashSemanticsVersion: existingVersion?.hash_semantics_version === LEGACY_SOURCE_HASH_SEMANTICS_VERSION
      ? LEGACY_SOURCE_HASH_SEMANTICS_VERSION : SOURCE_HASH_SEMANTICS_VERSION,
    r2OriginalKey, r2ExtractedKey, extractionStatus, idempotencyKey,
  };
}

function boundedMaximum(value: number | undefined): number {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 10 * 1024 * 1024) : DEFAULT_MAXIMUM_BYTES;
}

export function normaliseSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    for (const parameter of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source", "fbclid", "gclid"]) {
      url.searchParams.delete(parameter);
    }
    url.hash = "";
    let normalized = url.href;
    if (normalized.endsWith("/") && !url.pathname.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
