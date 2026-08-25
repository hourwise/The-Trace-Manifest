// KC-03D: admit feed URLs into the source-document path and enqueue only
// bounded identifiers/metadata. Article bodies never enter a Queue message.

import { hashURL } from "./dedup";
import { normaliseSourceUrl, type SourceCaptureStorageMode } from "../../src/lib/server/source-capture";
import { parseKnowledgeMarkdown, type KnowledgeMarkdownEvidenceUrl } from "../../src/lib/server/knowledge-markdown";

export interface KnowledgeCaptureQueue {
  send(message: KnowledgeCaptureMessage): Promise<unknown>;
}

export interface KnowledgeCaptureMessage {
  kind: "capture_source_document";
  version: "kc03d_v1";
  sourceDocumentId: string;
  feedItemId: number | null;
  sourceId: number | null;
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

export interface ManualCaptureAdmission {
  url: string;
  sourceId?: number | null;
  copyrightStorageMode: "private_full_text" | "editor_supplied_document";
  correlationId: string;
}

export interface KnowledgeDocumentCaptureAdmission {
  knowledgeDocumentId: string;
  copyrightStorageMode?: "private_full_text" | "editor_supplied_document";
  correlationId?: string;
}

export interface KnowledgeDocumentCaptureResult {
  knowledgeDocumentId: string;
  urlsFound: number;
  queued: number;
  alreadyQueued: number;
  skippedRejected: number;
  queueUnavailable: number;
  failures: number;
  sources: Array<{
    url: string;
    sourceDocumentId: string | null;
    jobId: string | null;
    status: "queued" | "already_queued" | "skipped_rejected" | "queue_unbound" | "failed";
  }>;
}

export interface FeedCaptureQueueEnvironment {
  DB: D1Database;
  KNOWLEDGE_PROCESSING_QUEUE?: KnowledgeCaptureQueue;
}

export interface FeedCaptureQueueResult {
  sourceDocumentId: string;
  queued: boolean;
  lastSeenRefreshed: boolean;
  reason: "queued" | "already_queued" | "already_processing" | "queue_unbound" | "queue_send_failed";
  jobId: string | null;
}

// Feed cycles run more often than source recency needs to change. Keep the
// first observation and meaningful admission changes immediate, but refresh
// last_seen_at at most once per six hours for repeated duplicate deliveries.
const SOURCE_LAST_SEEN_REFRESH_INTERVAL = "-6 hours";

/** Records an admitted feed source, then produces one retry-safe capture job. */
export async function admitAndQueueFeedCapture(
  env: FeedCaptureQueueEnvironment,
  input: FeedCaptureAdmission,
): Promise<FeedCaptureQueueResult> {
  return admitAndQueueSourceCapture(env, {
    feedItemId: input.feedItemId,
    sourceId: input.sourceId,
    url: input.url,
    copyrightStorageMode: input.copyrightStorageMode,
    correlationId: input.correlationId,
  });
}

/** Admits a publisher-supplied URL into the same capture job path. */
export async function admitAndQueueManualCapture(
  env: FeedCaptureQueueEnvironment,
  input: ManualCaptureAdmission,
): Promise<FeedCaptureQueueResult> {
  return admitAndQueueSourceCapture(env, {
    feedItemId: null,
    sourceId: input.sourceId ?? null,
    url: input.url,
    copyrightStorageMode: input.copyrightStorageMode,
    correlationId: input.correlationId,
  });
}

/** Queues every unresolved evidence URL in one knowledge document idempotently. */
export async function admitAndQueueKnowledgeDocumentCapture(
  env: FeedCaptureQueueEnvironment,
  input: KnowledgeDocumentCaptureAdmission,
): Promise<KnowledgeDocumentCaptureResult> {
  if (!/^[A-Za-z0-9_-]{4,240}$/.test(input.knowledgeDocumentId)) {
    throw new Error("knowledge_document_capture_invalid");
  }
  const document = await env.DB.prepare(
    "SELECT document_json FROM knowledge_documents WHERE id = ?",
  ).bind(input.knowledgeDocumentId).first<{ document_json: string }>();
  if (!document) throw new Error("knowledge_document_not_found");

  const evidenceUrls = extractDocumentEvidenceUrls(document.document_json);
  const uniqueUrls = [...new Map(evidenceUrls.map((source) => [source.url, source])).values()];
  const result: KnowledgeDocumentCaptureResult = {
    knowledgeDocumentId: input.knowledgeDocumentId,
    urlsFound: uniqueUrls.length,
    queued: 0,
    alreadyQueued: 0,
    skippedRejected: 0,
    queueUnavailable: 0,
    failures: 0,
    sources: [],
  };

  for (const source of uniqueUrls) {
    const existing = await env.DB.prepare(`
      SELECT id, admission_state, source_id
      FROM source_documents
      WHERE canonical_url_hash = ?
      LIMIT 1
    `).bind(await hashURL(source.url)).first<{ id: string; admission_state: string; source_id: number | null }>();
    if (existing?.admission_state === "rejected") {
      result.skippedRejected++;
      result.sources.push({ url: source.url, sourceDocumentId: existing.id, jobId: null, status: "skipped_rejected" });
      continue;
    }

    const sourceId = existing?.source_id ?? await sourceRegistryId(env.DB, source.url);
    try {
      const admission = await admitAndQueueManualCapture(env, {
        url: source.url,
        sourceId,
        copyrightStorageMode: input.copyrightStorageMode ?? "private_full_text",
        correlationId: input.correlationId ?? `knowledge-${input.knowledgeDocumentId}`,
      });
      if (admission.reason === "queued") result.queued++;
      else if (admission.reason === "already_queued" || admission.reason === "already_processing") result.alreadyQueued++;
      else if (admission.reason === "queue_unbound") result.queueUnavailable++;
      result.sources.push({
        url: source.url,
        sourceDocumentId: admission.sourceDocumentId,
        jobId: admission.jobId,
        status: admission.reason === "queued" ? "queued"
          : admission.reason === "queue_unbound" ? "queue_unbound"
          : admission.reason === "queue_send_failed" ? "failed"
          : "already_queued",
      });
      if (admission.reason === "queue_send_failed") result.failures++;
    } catch {
      result.failures++;
      result.sources.push({ url: source.url, sourceDocumentId: existing?.id ?? null, jobId: null, status: "failed" });
    }
  }
  return result;
}

async function admitAndQueueSourceCapture(
  env: FeedCaptureQueueEnvironment,
  input: {
    feedItemId: number | null;
    sourceId: number | null;
    url: string;
    copyrightStorageMode?: SourceCaptureStorageMode;
    correlationId?: string;
  },
): Promise<FeedCaptureQueueResult> {
  const canonicalUrl = normaliseSourceUrl(input.url);
  if (!canonicalUrl || (input.feedItemId !== null && (!Number.isInteger(input.feedItemId) || input.feedItemId < 1)) || (input.sourceId !== null && (!Number.isInteger(input.sourceId) || input.sourceId < 1))) {
    throw new Error("feed_capture_admission_invalid");
  }
  const urlHash = await hashURL(canonicalUrl);
  const sourceDocumentId = `source-${urlHash}`;
  const storageMode = input.copyrightStorageMode ?? "metadata_only";
  const correlationId = input.correlationId ?? `feed-${input.feedItemId}-${urlHash.slice(0, 16)}`;

  const sourceWriteResults = await env.DB.batch([
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
          updated_at = datetime('now')
      WHERE id = ?
        AND (
          admission_state <> 'admitted'
          OR (? IS NOT NULL AND (source_id IS NULL OR source_id <> ?))
          OR (
            copyright_storage_mode NOT IN ('private_full_text', 'editor_supplied_document')
            AND ? IN ('private_full_text', 'editor_supplied_document')
          )
        )
    `).bind(input.sourceId, storageMode, sourceDocumentId, input.sourceId, input.sourceId, storageMode),
    env.DB.prepare(`
      UPDATE source_documents
      SET last_seen_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
        AND (last_seen_at IS NULL OR last_seen_at < datetime('now', ?))
    `).bind(sourceDocumentId, SOURCE_LAST_SEEN_REFRESH_INTERVAL),
  ]);
  const lastSeenRefreshed = Number(sourceWriteResults[2]?.meta.changes ?? 0) > 0;

  if (!env.KNOWLEDGE_PROCESSING_QUEUE) {
    return { sourceDocumentId, queued: false, lastSeenRefreshed, reason: "queue_unbound", jobId: null };
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
    return { sourceDocumentId, queued: false, lastSeenRefreshed, reason: "already_processing", jobId };
  }
  const shouldSend = Number(inserted.meta.changes ?? 0) === 1 || job?.state === "failed" || job?.state === "dead_lettered";
  if (!shouldSend) return { sourceDocumentId, queued: false, lastSeenRefreshed, reason: "already_queued", jobId };

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
    return { sourceDocumentId, queued: true, lastSeenRefreshed, reason: "queued", jobId };
  } catch {
    await env.DB.prepare(`
      UPDATE knowledge_processing_jobs
      SET state = 'failed', error_code = 'queue_send_failed', error_detail = 'capture_queue_send_failed', updated_at = datetime('now')
      WHERE id = ?
    `).bind(jobId).run();
    return { sourceDocumentId, queued: false, lastSeenRefreshed, reason: "queue_send_failed", jobId };
  }
}

function extractDocumentEvidenceUrls(documentJson: string): KnowledgeMarkdownEvidenceUrl[] {
  try {
    const document = JSON.parse(documentJson) as { body?: unknown; evidenceUrls?: unknown };
    if (Array.isArray(document.evidenceUrls)) {
      const stored = document.evidenceUrls.filter((source): source is KnowledgeMarkdownEvidenceUrl =>
        !!source && typeof source === "object" && typeof (source as { url?: unknown }).url === "string",
      );
      if (stored.length) return stored;
    }
    if (typeof document.body === "string") {
      const parsed = parseKnowledgeMarkdown(`---\nplaceholder: true\n---\n${document.body}`);
      if (!("error" in parsed)) return parsed.evidenceUrls;
    }
  } catch {
    // Malformed legacy documents produce no queue work and remain reviewable.
  }
  return [];
}

async function sourceRegistryId(db: D1Database, url: string): Promise<number | null> {
  let hostname = "";
  try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  const sources = await db.prepare("SELECT id, url FROM sources WHERE active = 1 LIMIT 500").all<{ id: number; url: string }>();
  const match = (sources.results ?? []).find((source) => {
    try { return new URL(source.url).hostname.replace(/^www\./, "") === hostname; } catch { return false; }
  });
  return match?.id ?? null;
}
