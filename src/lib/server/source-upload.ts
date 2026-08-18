import { extractHtmlDocument, extractMarkdownDocument, extractPlainTextDocument, type ExtractedSourceDocument } from "./source-extraction";
import { captureAdmittedSource } from "./source-capture";
import { extractStructuredSource } from "./source-structured-extraction";
import { recordVersionExtractionState } from "./source-governance-state";
import { SOURCE_HASH_SEMANTICS_VERSION } from "./source-version-identity";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_FILENAME_LENGTH = 255;

export type UploadMediaKind = "html" | "markdown" | "plain_text";
export type UploadOutcomeState = "extracted" | "metadata_only" | "unsupported" | "extraction_failed";

export interface SourceUploadEnvironment {
  DB: D1Database;
  RAW_STORE: Pick<R2Bucket, "put" | "delete">;
}

export interface SourceUploadInput {
  bytes: Uint8Array;
  displayFilename: string;
  mediaType: string;
  uploaderEmail: string;
  idempotencyKey?: string | null;
  correlationId?: string;
  retrievedAt?: string;
}

export interface SourceUploadResult {
  intakeId: string;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  displayFilename: string;
  mediaType: string;
  mediaKind: UploadMediaKind | "unsupported";
  byteLength: number;
  contentHash: string;
  state: UploadOutcomeState;
  reason: string | null;
  diagnostics: Record<string, unknown>;
  idempotentReplay: boolean;
}

export class SourceUploadError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_upload" | "upload_too_large" | "upload_conflict" | "upload_failed",
    readonly status: 400 | 409 | 413 | 500 = 400,
  ) {
    super(message);
    this.name = "SourceUploadError";
  }
}

export function publisherOnlyUploadAllowed(role: "reader" | "publisher" | null): role is "publisher" {
  return role === "publisher";
}

interface ValidatedUpload {
  mediaKind: UploadMediaKind | "unsupported";
  reason: string | null;
  decodedBody: string | null;
}

const MEDIA_TYPES: Record<string, UploadMediaKind> = {
  "text/plain": "plain_text",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/html": "html",
  "application/xhtml+xml": "html",
};

const EXTENSIONS: Record<UploadMediaKind, ReadonlySet<string>> = {
  plain_text: new Set([".txt", ".text"]),
  markdown: new Set([".md", ".markdown"]),
  html: new Set([".html", ".htm"]),
};

export async function ingestUploadedDocument(
  env: SourceUploadEnvironment,
  input: SourceUploadInput,
): Promise<SourceUploadResult> {
  const displayFilename = validateFilename(input.displayFilename);
  const mediaType = normaliseMediaType(input.mediaType);
  const bytes = input.bytes;
  const contentHash = await sha256Bytes(bytes);
  const mediaKind = MEDIA_TYPES[mediaType] ?? "unsupported";
  const identityHash = await sha256(`${input.uploaderEmail.trim().toLowerCase()}\n${displayFilename.toLowerCase()}\n${mediaType}`);
  const idempotencyKey = normaliseIdempotencyKey(input.idempotencyKey) ?? `upload:${identityHash}:${contentHash}`;

  const existing = await env.DB.prepare(`
    SELECT id, source_document_id, source_document_version_id, display_filename, media_type,
           media_kind, content_hash, byte_length, outcome_state, state_reason,
           state_diagnostics_json
    FROM source_upload_intakes
    WHERE idempotency_key = ?
  `).bind(idempotencyKey).first<UploadIntakeRow>();
  if (existing) {
    if (existing.content_hash !== contentHash) throw new SourceUploadError("The idempotency key was already used for different content.", "upload_conflict", 409);
    return uploadResultFromRow(existing, true);
  }

  if (bytes.byteLength === 0) throw new SourceUploadError("The uploaded document is empty.", "invalid_upload");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new SourceUploadError("The uploaded document exceeds the 2 MiB limit.", "upload_too_large", 413);

  const validation = validateUpload(bytes, displayFilename, mediaType, mediaKind);
  if (validation.mediaKind === "unsupported") {
    return persistUnsupportedUpload(env, {
      ...input,
      bytes,
      displayFilename,
      mediaType,
      uploaderEmail: input.uploaderEmail.trim().toLowerCase(),
      idempotencyKey,
      identityHash,
      contentHash,
      reason: validation.reason ?? "unsupported_media_type",
    });
  }
  if (!validation.decodedBody) throw new SourceUploadError("The uploaded document could not be decoded as UTF-8 text.", "invalid_upload");

  const extraction = validation.mediaKind === "html"
    ? extractHtmlDocument(validation.decodedBody)
    : validation.mediaKind === "markdown"
      ? extractMarkdownDocument(validation.decodedBody)
      : extractPlainTextDocument(validation.decodedBody);
  const canonicalUrl = `https://uploads.trace.invalid/${identityHash}`;
  let capture;
  try {
    capture = await captureAdmittedSource(
      { DB: env.DB, RAW_STORE: env.RAW_STORE },
      {
        canonicalUrl,
        retrievedUrl: canonicalUrl,
        contentType: mediaType,
        body: validation.decodedBody,
        extraction,
        mediaKind: validation.mediaKind,
        admissionState: "admitted",
        copyrightStorageMode: "editor_supplied_document",
        retrievedAt: input.retrievedAt,
        correlationId: input.correlationId,
        transportHash: contentHash,
        maximumBytes: MAX_UPLOAD_BYTES,
      },
    );
  } catch (error) {
    if (error instanceof SourceUploadError) throw error;
    throw new SourceUploadError("The uploaded document could not be captured.", "upload_failed", 500);
  }

  let state: UploadOutcomeState = extraction.extractionState === "extracted" ? "extracted" : "metadata_only";
  let reason: string | null = extraction.extractionState === "extracted" ? null : "no_usable_extracted_text";
  let diagnostics: Record<string, unknown> = extractionDiagnostics(extraction);
  if (state === "extracted") {
    try {
      await extractStructuredSource(env.DB, {
        sourceDocumentVersionId: capture.sourceDocumentVersionId,
        sourceContentHash: capture.contentHash,
        extraction,
        correlationId: input.correlationId,
      });
    } catch {
      state = "extraction_failed";
      reason = "deterministic_structured_extraction_failed";
      diagnostics = { ...diagnostics, structuredExtraction: "failed" };
      await recordVersionExtractionState(env.DB, {
        sourceDocumentVersionId: capture.sourceDocumentVersionId,
        state: "extraction_failed",
        storageState: "private_stored",
        reason,
        diagnostics,
        retryable: true,
      }).catch(() => undefined);
    }
  }

  const intakeId = `upload-intake-${await sha256(idempotencyKey)}`;
  await insertIntake(env.DB, {
    id: intakeId,
    sourceDocumentId: capture.sourceDocumentId,
    sourceDocumentVersionId: capture.sourceDocumentVersionId,
    idempotencyKey,
    uploadIdentityHash: identityHash,
    uploaderEmail: input.uploaderEmail.trim().toLowerCase(),
    displayFilename,
    mediaType,
    mediaKind: validation.mediaKind,
    contentHash,
    byteLength: bytes.byteLength,
    outcomeState: state,
    stateReason: reason,
    diagnostics,
  });

  if (state === "extracted") {
    await recordVersionExtractionState(env.DB, {
      sourceDocumentVersionId: capture.sourceDocumentVersionId,
      state: "extracted",
      storageState: "private_stored",
      reason: "deterministic_extraction_complete",
      diagnostics,
      retryable: false,
    });
  } else if (state === "metadata_only") {
    await recordVersionExtractionState(env.DB, {
      sourceDocumentVersionId: capture.sourceDocumentVersionId,
      state: "metadata_only",
      storageState: "private_stored",
      reason: reason ?? "metadata_only",
      diagnostics,
      retryable: false,
    });
  }

  return {
    intakeId,
    sourceDocumentId: capture.sourceDocumentId,
    sourceDocumentVersionId: capture.sourceDocumentVersionId,
    displayFilename,
    mediaType,
    mediaKind: validation.mediaKind,
    byteLength: bytes.byteLength,
    contentHash,
    state,
    reason,
    diagnostics,
    idempotentReplay: false,
  };
}

interface UnsupportedUploadInput extends SourceUploadInput {
  bytes: Uint8Array;
  displayFilename: string;
  mediaType: string;
  uploaderEmail: string;
  idempotencyKey: string;
  identityHash: string;
  contentHash: string;
  reason: string;
}

async function persistUnsupportedUpload(env: SourceUploadEnvironment, input: UnsupportedUploadInput): Promise<SourceUploadResult> {
  const canonicalUrl = `https://uploads.trace.invalid/${input.identityHash}`;
  const canonicalUrlHash = await sha256(canonicalUrl);
  const normalizedContentHash = await sha256(`unsupported:${input.mediaType}:${input.contentHash}`);
  const versionContentHash = await sha256(`${SOURCE_HASH_SEMANTICS_VERSION}:${input.contentHash}`);
  const sourceDocumentId = `source-${canonicalUrlHash}`;
  const versionId = `source-version-${canonicalUrlHash}-${SOURCE_HASH_SEMANTICS_VERSION}-${normalizedContentHash}`;
  const mediaKind = input.mediaType === "application/pdf" ? "pdf" : "other";
  const diagnostics = { mediaType: input.mediaType, displayFilename: input.displayFilename, parser: "not_implemented" };
  const intakeId = `upload-intake-${await sha256(input.idempotencyKey)}`;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode)
      VALUES (?, ?, ?, ?, 'quarantined', 'metadata_only')
    `).bind(sourceDocumentId, canonicalUrl, canonicalUrlHash, mediaKind),
    env.DB.prepare(`
      INSERT OR IGNORE INTO source_document_versions
        (id, source_document_id, content_hash, transport_hash, normalized_content_hash,
         hash_semantics_version, retrieved_url, retrieved_at, media_type, byte_length,
         extraction_status, extraction_method, extraction_version, extraction_state,
         storage_state, state_reason, state_diagnostics_json, processing_retryable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unsupported', 'none', 'kc-03g-v1',
              'unsupported', 'metadata_only', ?, ?, 0)
    `).bind(
      versionId, sourceDocumentId, versionContentHash, input.contentHash, normalizedContentHash,
      SOURCE_HASH_SEMANTICS_VERSION, canonicalUrl, input.retrievedAt ?? new Date().toISOString(),
      input.mediaType, input.bytes.byteLength, input.reason, JSON.stringify(diagnostics),
    ),
    env.DB.prepare(`
      UPDATE source_documents SET current_version_id = ?, last_seen_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(versionId, sourceDocumentId),
  ]);
  await insertIntake(env.DB, {
    id: intakeId,
    sourceDocumentId,
    sourceDocumentVersionId: versionId,
    idempotencyKey: input.idempotencyKey,
    uploadIdentityHash: input.identityHash,
    uploaderEmail: input.uploaderEmail,
    displayFilename: input.displayFilename,
    mediaType: input.mediaType,
    mediaKind: "unsupported",
    contentHash: input.contentHash,
    byteLength: input.bytes.byteLength,
    outcomeState: "unsupported",
    stateReason: input.reason,
    diagnostics,
  });
  return {
    intakeId,
    sourceDocumentId,
    sourceDocumentVersionId: versionId,
    displayFilename: input.displayFilename,
    mediaType: input.mediaType,
    mediaKind: "unsupported",
    byteLength: input.bytes.byteLength,
    contentHash: input.contentHash,
    state: "unsupported",
    reason: input.reason,
    diagnostics,
    idempotentReplay: false,
  };
}

function validateUpload(bytes: Uint8Array, filename: string, mediaType: string, mediaKind: UploadMediaKind | "unsupported"): ValidatedUpload {
  if (mediaKind === "unsupported") return { mediaKind, reason: `unsupported_media_type:${mediaType}`, decodedBody: null };
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!EXTENSIONS[mediaKind].has(extension)) return { mediaKind: "unsupported", reason: `filename_extension_mismatch:${extension}`, decodedBody: null };
  if (bytes.includes(0)) return { mediaKind: "unsupported", reason: "embedded_null_byte", decodedBody: null };
  try {
    return { mediaKind, reason: null, decodedBody: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { mediaKind: "unsupported", reason: "invalid_utf8", decodedBody: null };
  }
}

function validateFilename(value: string): string {
  const filename = value.trim();
  if (!filename || filename.length > MAX_UPLOAD_FILENAME_LENGTH || /[\\/\u0000-\u001f\u007f]/.test(filename) || filename === "." || filename === "..") {
    throw new SourceUploadError("The uploaded filename is invalid.", "invalid_upload");
  }
  return filename;
}

function normaliseMediaType(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function normaliseIdempotencyKey(value: string | null | undefined): string | null {
  const key = value?.trim();
  if (!key) return null;
  if (key.length > 240 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw new SourceUploadError("The idempotency key is invalid.", "invalid_upload");
  return key;
}

function extractionDiagnostics(extraction: ExtractedSourceDocument): Record<string, unknown> {
  return {
    extractionMethod: extraction.diagnostics.extractionMethod,
    blockCount: extraction.diagnostics.blockCount,
    headingCount: extraction.diagnostics.headingCount,
    outputCharacters: extraction.diagnostics.outputCharacters,
    warnings: extraction.diagnostics.warnings,
    removedElements: extraction.diagnostics.removedElements,
  };
}

interface IntakeInsert {
  id: string;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  idempotencyKey: string;
  uploadIdentityHash: string;
  uploaderEmail: string;
  displayFilename: string;
  mediaType: string;
  mediaKind: UploadMediaKind | "unsupported";
  contentHash: string;
  byteLength: number;
  outcomeState: UploadOutcomeState | "rejected";
  stateReason: string | null;
  diagnostics: Record<string, unknown>;
}

async function insertIntake(db: D1Database, input: IntakeInsert): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO source_upload_intakes
      (id, source_document_id, source_document_version_id, idempotency_key, upload_identity_hash,
       uploader_email, display_filename, media_type, media_kind, content_hash, byte_length,
       outcome_state, state_reason, state_diagnostics_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.id, input.sourceDocumentId, input.sourceDocumentVersionId, input.idempotencyKey,
    input.uploadIdentityHash, input.uploaderEmail, input.displayFilename, input.mediaType,
    input.mediaKind, input.contentHash, input.byteLength, input.outcomeState,
    input.stateReason, JSON.stringify(input.diagnostics),
  ).run();
}

interface UploadIntakeRow {
  id: string;
  source_document_id: string | null;
  source_document_version_id: string | null;
  display_filename: string;
  media_type: string;
  media_kind: UploadMediaKind | "unsupported";
  content_hash: string;
  byte_length: number;
  outcome_state: UploadOutcomeState | "rejected";
  state_reason: string | null;
  state_diagnostics_json: string;
}

function uploadResultFromRow(row: UploadIntakeRow, idempotentReplay: boolean): SourceUploadResult {
  let diagnostics: Record<string, unknown> = {};
  try { diagnostics = JSON.parse(row.state_diagnostics_json) as Record<string, unknown>; } catch { /* keep an empty safe diagnostic envelope */ }
  return {
    intakeId: row.id,
    sourceDocumentId: row.source_document_id,
    sourceDocumentVersionId: row.source_document_version_id,
    displayFilename: row.display_filename,
    mediaType: row.media_type,
    mediaKind: row.media_kind,
    byteLength: row.byte_length,
    contentHash: row.content_hash,
    state: row.outcome_state === "rejected" ? "unsupported" : row.outcome_state,
    reason: row.state_reason,
    diagnostics,
    idempotentReplay,
  };
}

async function sha256(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
