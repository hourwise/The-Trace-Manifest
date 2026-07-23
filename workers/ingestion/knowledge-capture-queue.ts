// KC-03D: admit feed URLs into the source-document path and enqueue only
// bounded identifiers/metadata. Article bodies never enter a Queue message.

import { hashURL } from "./dedup";
import { normaliseSourceUrl, type SourceCaptureStorageMode } from "../../src/lib/server/source-capture";

export interface KnowledgeCaptureQueue {
  send(message: KnowledgeCaptureMessage): Promise<unknown>;
}

export interface KnowledgeCaptureMessage {
  kind: "capture_source_document";
  version: "kc03d_v1";
  sourceDocumentId: string;
  feedItemId: number;
  sourceId: number;
  canonicalUrl: string;
  urlHash: string;
  mediaKind: "html";
  copyrightStorageMode: SourceCaptureStorageMode;
  correlationId: string;
}

export interface FeedCaptureAdmission {
  feedItemId: number;
  sourceId: number;
  url: string;
  copyrightStorageMode?: SourceCaptureStorageMode;
  correlationId?: string;
}

export interface FeedCaptureQueueEnvironment {
  DB: D1Database;
  KNOWLEDGE_PROCESSING_QUEUE?: KnowledgeCaptureQueue;
}

export interface FeedCaptureQueueResult {
  sourceDocumentId: string;
  queued: boolean;
  reason: "queued" | "already_queued" | "already_processing" | "queue_unbound" | "queue_send_failed";
  jobId: string | null;
}

/** Records an admitted feed source, then produces one retry-safe capture job. */
export async function admitAndQueueFeedCapture(
  env: FeedCaptureQueueEnvironment,
  input: FeedCaptureAdmission,
): Promise<FeedCaptureQueueResult> {
  const canonicalUrl = normaliseSourceUrl(input.url);
  if (!canonicalUrl || !Number.isInteger(input.feedItemId) || input.feedItemId < 1 || !Number.isInteger(input.sourceId) || input.sourceId < 1) {
    throw new Error("feed_capture_admission_invalid");
  }
  const urlHash = await hashURL(canonicalUrl);
  const sourceDocumentId = `source-${urlHash}`;
  const storageMode = input.copyrightStorageMode ?? "metadata_only";
  const correlationId = input.correlationId ?? `feed-${input.feedItemId}-${urlHash.slice(0, 16)}`;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO source_documents
        (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode)
      VALUES (?, ?, ?, ?, 'html', 'admitted', ?)
    `).bind(sourceDocumentId, canonicalUrl, urlHash, input.sourceId, storageMode),
    env.DB.prepare(`
      UPDATE source_documents
      SET source_id = COALESCE(?, source_id), admission_state = 'admitted',
          copyright_storage_mode = CASE
            WHEN copyright_storage_mode IN ('private_full_text', 'editor_supplied_document')
              THEN copyright_storage_mode
            ELSE ?
          END,
          last_seen_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(input.sourceId, storageMode, sourceDocumentId),
  ]);

  if (!env.KNOWLEDGE_PROCESSING_QUEUE) {
    return { sourceDocumentId, queued: false, reason: "queue_unbound", jobId: null };
  }

  const jobId = `capture-job-${urlHash}`;
  const idempotencyKey = `capture-source:${sourceDocumentId}`;
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO knowledge_processing_jobs
      (id, job_kind, subject_type, subject_id, idempotency_key, state, correlation_id)
    VALUES (?, 'capture_source', 'source_document', ?, ?, 'queued', ?)
  `).bind(jobId, sourceDocumentId, idempotencyKey, correlationId).run();
  const job = await env.DB.prepare(`
    SELECT state FROM knowledge_processing_jobs WHERE id = ?
  `).bind(jobId).first<{ state: string }>();

  if (job?.state === "completed" || job?.state === "running") {
    return { sourceDocumentId, queued: false, reason: "already_processing", jobId };
  }
  const shouldSend = Number(inserted.meta.changes ?? 0) === 1 || job?.state === "failed" || job?.state === "dead_lettered";
  if (!shouldSend) return { sourceDocumentId, queued: false, reason: "already_queued", jobId };

  const message: KnowledgeCaptureMessage = {
    kind: "capture_source_document",
    version: "kc03d_v1",
    sourceDocumentId,
    feedItemId: input.feedItemId,
    sourceId: input.sourceId,
    canonicalUrl,
    urlHash,
    mediaKind: "html",
    copyrightStorageMode: storageMode,
    correlationId,
  };
  try {
    if (JSON.stringify(message).length > 16_384) throw new Error("capture_message_too_large");
    await env.KNOWLEDGE_PROCESSING_QUEUE.send(message);
    await env.DB.prepare(`
      UPDATE knowledge_processing_jobs
      SET state = 'queued', error_code = NULL, error_detail = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).bind(jobId).run();
    return { sourceDocumentId, queued: true, reason: "queued", jobId };
  } catch {
    await env.DB.prepare(`
      UPDATE knowledge_processing_jobs
      SET state = 'failed', error_code = 'queue_send_failed', error_detail = 'capture_queue_send_failed', updated_at = datetime('now')
      WHERE id = ?
    `).bind(jobId).run();
    return { sourceDocumentId, queued: false, reason: "queue_send_failed", jobId };
  }
}
