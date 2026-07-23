// KC-03E: Queue consumer for admitted source capture. It performs one bounded
// retrieval/extraction/capture cycle and keeps D1 job state authoritative.

import { extractHtmlDocument } from "../../src/lib/server/source-extraction";
import { extractStructuredSource } from "../../src/lib/server/source-structured-extraction";
import { captureAdmittedSource, SourceCaptureError, normaliseSourceUrl, type SourceCaptureStorageMode } from "../../src/lib/server/source-capture";
import { retrieveRemoteSource, SourceRetrievalError } from "../../src/lib/server/source-retrieval";
import { hashURL } from "./dedup";
import type { KnowledgeCaptureMessage } from "./knowledge-capture-queue";

export interface KnowledgeCaptureConsumerEnvironment {
  DB: D1Database;
  RAW_STORE: R2Bucket;
}

interface AdmittedSourceDocument {
  id: string;
  canonical_url: string;
  source_id: number | null;
  admission_state: string;
  copyright_storage_mode: SourceCaptureStorageMode;
}

export class KnowledgeCaptureConsumerError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) {
    super(message);
    this.name = "KnowledgeCaptureConsumerError";
  }
}

export type KnowledgeCaptureProcessResult = "completed" | "already_completed";

/** Processes one validated Queue message; callers decide ack/retry policy. */
export async function processKnowledgeCaptureMessage(
  env: KnowledgeCaptureConsumerEnvironment,
  message: KnowledgeCaptureMessage,
  fetcher?: typeof fetch,
): Promise<KnowledgeCaptureProcessResult> {
  const jobId = `capture-job-${message.urlHash}`;
  const admission = await env.DB.prepare(`
    SELECT id, canonical_url, source_id, admission_state, copyright_storage_mode
    FROM source_documents WHERE id = ?
  `).bind(message.sourceDocumentId).first<AdmittedSourceDocument>();
  if (!admission) throw new KnowledgeCaptureConsumerError("The admitted source document does not exist.", "source_document_missing", true);
  if (admission.admission_state !== "admitted") throw new KnowledgeCaptureConsumerError("The source document is not admitted for capture.", "source_not_admitted", false);
  const canonicalUrl = normaliseSourceUrl(admission.canonical_url);
  if (!canonicalUrl || canonicalUrl !== message.canonicalUrl || await hashURL(canonicalUrl) !== message.urlHash) {
    throw new KnowledgeCaptureConsumerError("The capture message does not match the admitted source identity.", "source_identity_mismatch", false);
  }
  if (admission.copyright_storage_mode === "prohibited") {
    throw new KnowledgeCaptureConsumerError("The source storage policy prohibits capture.", "storage_prohibited", false);
  }

  const existingJob = await env.DB.prepare("SELECT state FROM knowledge_processing_jobs WHERE id = ?").bind(jobId).first<{ state: string }>();
  if (existingJob?.state === "completed") return "already_completed";
  if (!existingJob) throw new KnowledgeCaptureConsumerError("The capture job does not exist.", "capture_job_missing", true);
  await env.DB.prepare(`
    UPDATE knowledge_processing_jobs
    SET state = 'running', attempt_count = attempt_count + 1, started_at = COALESCE(started_at, datetime('now')),
        error_code = NULL, error_detail = NULL, updated_at = datetime('now')
    WHERE id = ? AND state IN ('queued', 'failed', 'running')
  `).bind(jobId).run();

  let structureJobId: string | null = null;
  try {
    const retrieved = await retrieveRemoteSource(canonicalUrl, {
      allowedContentTypes: ["text/html", "application/xhtml+xml"],
      maximumBytes: 512 * 1024,
      timeoutMs: 12_000,
      maxRedirects: 3,
      userAgent: "TheTraceManifest/0.1 (knowledge capture; +https://thetracemanifest.com)",
      acceptHeader: "text/html,application/xhtml+xml;q=0.9",
      fetcher,
      onAudit: (event) => {
        console.log(JSON.stringify({ stage: "knowledge_capture_retrieval", code: event.code, phase: event.phase, redirectCount: event.redirectCount, responseStatus: event.responseStatus }));
      },
    });
    const extraction = extractHtmlDocument(retrieved.body);
    const capture = await captureAdmittedSource(
      { DB: env.DB, RAW_STORE: env.RAW_STORE },
      {
        canonicalUrl,
        retrievedUrl: retrieved.finalUrl,
        contentType: retrieved.contentType,
        body: retrieved.body,
        extraction,
        mediaKind: "html",
        admissionState: "admitted",
        copyrightStorageMode: admission.copyright_storage_mode,
        sourceId: admission.source_id,
        httpStatus: retrieved.responseStatus,
        correlationId: message.correlationId,
      },
    );
    structureJobId = `structure-job-${capture.sourceDocumentVersionId}`;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO knowledge_processing_jobs
        (id, job_kind, subject_type, subject_id, content_hash, idempotency_key, state, correlation_id)
      VALUES (?, 'extract_structure', 'source_document_version', ?, ?, ?, 'running', ?)
    `).bind(
      structureJobId, capture.sourceDocumentVersionId, capture.contentHash,
      `extract-structure:${capture.sourceDocumentVersionId}`, message.correlationId,
    ).run();
    if (capture.extractionStatus === "captured") {
      await extractStructuredSource(env.DB, {
        sourceDocumentVersionId: capture.sourceDocumentVersionId,
        sourceContentHash: capture.contentHash,
        extraction,
        correlationId: message.correlationId,
      });
    }
    await env.DB.prepare(`
      UPDATE knowledge_processing_jobs
      SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now'), error_code = NULL, error_detail = NULL
      WHERE id = ?
    `).bind(structureJobId).run();
    await env.DB.prepare(`
      UPDATE knowledge_processing_jobs
      SET state = 'completed', content_hash = ?, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(capture.contentHash, jobId).run();
    return "completed";
  } catch (error) {
    const classified = classifyCaptureError(error);
    if (structureJobId) {
      await env.DB.prepare(`
        UPDATE knowledge_processing_jobs
        SET state = 'failed', error_code = ?, error_detail = ?, updated_at = datetime('now')
        WHERE id = ? AND state <> 'completed'
      `).bind(classified.code, classified.detail, structureJobId).run().catch(() => undefined);
    }
    await env.DB.prepare(`
      UPDATE knowledge_processing_jobs
      SET state = 'failed', error_code = ?, error_detail = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(classified.code, classified.detail, jobId).run();
    throw new KnowledgeCaptureConsumerError(classified.detail, classified.code, classified.retryable);
  }
}

/** Worker queue entrypoint; failures are retried so Wrangler can route them to the configured DLQ. */
export async function consumeKnowledgeCaptureBatch(
  batch: MessageBatch<KnowledgeCaptureMessage>,
  env: KnowledgeCaptureConsumerEnvironment,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processKnowledgeCaptureMessage(env, message.body);
      message.ack();
    } catch (error) {
      const retryable = error instanceof KnowledgeCaptureConsumerError ? error.retryable : true;
      message.retry();
      console.error(JSON.stringify({ stage: "knowledge_capture_consumer", code: error instanceof KnowledgeCaptureConsumerError ? error.code : "capture_consumer_error", retryable }));
    }
  }
}

function classifyCaptureError(error: unknown): { code: string; detail: string; retryable: boolean } {
  if (error instanceof SourceRetrievalError) {
    const retryable = error.code === "response_unavailable" || error.code === "response_timeout";
    return { code: error.code, detail: `source_retrieval_${error.code}`, retryable };
  }
  if (error instanceof SourceCaptureError) {
    const retryable = error.code === "r2_write_failed" || error.code === "database_write_failed";
    return { code: error.code, detail: `source_capture_${error.code}`, retryable };
  }
  return { code: "capture_processing_failed", detail: "capture_processing_failed", retryable: true };
}
