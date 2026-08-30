// KC-09D: bounded Preview embedding and Vectorize indexing.
// D1 remains authoritative; this module only publishes recall candidates.
// Stable vector IDs make replacement idempotent, but external work is
// at-least-once: a crash after upsert and before durable confirmation may
// repeat Workers AI and Vectorize work after the stale-running lease expires.

import { KC09_EMBEDDING_POLICY, type KnowledgeVectorRecordType } from "../../src/lib/server/knowledge-embedding-policy";

export interface KnowledgeEmbeddingAi {
  run(model: string, input: { text: string[] }): Promise<unknown>;
}

export interface KnowledgeEmbeddingVectorIndex {
  upsert(vectors: VectorizeVector[]): Promise<{ ids: string[]; count: number }>;
  getByIds(ids: string[]): Promise<Array<{ id: string }>>;
}

export interface KnowledgeEmbeddingEnvironment {
  DB: D1Database;
  AI?: KnowledgeEmbeddingAi;
  KNOWLEDGE_VECTOR_INDEX?: KnowledgeEmbeddingVectorIndex;
  TRACE_ENVIRONMENT?: string;
}

export interface KnowledgeEmbeddingVector extends VectorizeVector {
  id: string;
  namespace: string;
  values: number[];
  metadata: {
    record_type: KnowledgeVectorRecordType;
    language: string;
    admission_state: string;
    publication_state: string;
    embedding_version: string;
  };
}

export interface KnowledgeEmbeddingCandidate {
  recordType: KnowledgeVectorRecordType;
  recordId: string;
  text: string;
  language: string;
  admissionState: string;
  publicationState: string;
}

export interface KnowledgeEmbeddingRunOptions {
  limit?: number;
  dryRun?: boolean;
}

export interface KnowledgeEmbeddingRunSummary {
  state: "completed" | "partial" | "failed" | "disabled";
  runId: string | null;
  selected: number;
  submitted: number;
  indexed: number;
  skipped: number;
  deferred: number;
  confirmationPending: number;
  reconciled: number;
  inputTokens: number;
  errorCode?: string;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_TEXT_CHARS = KC09_EMBEDDING_POLICY.sourceChunkPolicy.embeddingInputMaxChars;
const MAX_CONFIRMATION_ATTEMPTS = 3;
const RUNNING_RECLAIM_AFTER_MINUTES = 15;

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
}

export function estimateEmbeddingTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function normalizeEmbeddingText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function candidate(
  recordType: KnowledgeVectorRecordType,
  recordId: string | number,
  text: string,
  language: string | null | undefined,
  admissionState: string,
  publicationState: string,
): KnowledgeEmbeddingCandidate | null {
  const normalized = normalizeEmbeddingText(text);
  if (!normalized) return null;
  return {
    recordType,
    recordId: String(recordId),
    text: normalized,
    language: (language || "und").trim().toLowerCase().slice(0, 35) || "und",
    admissionState,
    publicationState,
  };
}

async function allCandidates(db: D1Database, limit: number): Promise<KnowledgeEmbeddingCandidate[]> {
  const candidates: KnowledgeEmbeddingCandidate[] = [];

  const chunks = await db.prepare(`
    SELECT chunk.id, chunk.text_excerpt, chunk.section_label, version.title,
           version.source_language
    FROM source_chunks chunk
    JOIN source_document_versions version ON version.id = chunk.source_document_version_id
    JOIN source_documents document ON document.id = version.source_document_id
    WHERE document.admission_state = 'admitted'
      AND version.extraction_status IN ('captured', 'extracted')
      AND version.extraction_state IN ('extracted', 'pending')
      AND document.media_kind <> 'pdf'
      AND chunk.start_locator IS NOT NULL AND chunk.end_locator IS NOT NULL
      AND length(chunk.text_excerpt) > 0
      AND (chunk.embedding_state <> 'indexed'
           OR chunk.embedding_version <> ?
           OR chunk.embedding_model <> ?)
    ORDER BY chunk.created_at ASC
    LIMIT ?
  `).bind(KC09_EMBEDDING_POLICY.policyVersion, KC09_EMBEDDING_POLICY.embeddingModel, limit).all<{
    id: string; text_excerpt: string; section_label: string | null; title: string | null; source_language: string | null;
  }>();
  for (const row of chunks.results) {
    const item = candidate("source_chunk", row.id,
      `${row.section_label ?? ""} ${row.title ?? ""} ${row.text_excerpt}`,
      row.source_language, "admitted", "not_applicable");
    if (item) candidates.push(item);
  }

  const claims = await db.prepare(`
    SELECT claim.id, claim.canonical_text, COALESCE(version.source_language, 'und') AS language
    FROM canonical_claims claim
    JOIN claim_assertions assertion ON assertion.canonical_claim_id = claim.id
    LEFT JOIN source_document_versions version ON version.id = assertion.source_document_version_id
    WHERE claim.current_state NOT IN ('retired', 'corrected', 'superseded')
      AND assertion.admission_state = 'admitted'
      AND assertion.reviewer_state = 'accepted'
      AND assertion.freshness_state IN ('current', 'unknown')
    GROUP BY claim.id
    ORDER BY claim.updated_at ASC
    LIMIT ?
  `).bind(limit).all<{ id: string; canonical_text: string; language: string }>();
  for (const row of claims.results) {
    const item = candidate("canonical_claim", row.id, row.canonical_text, row.language, "admitted", "not_applicable");
    if (item) candidates.push(item);
  }

  const stories = await db.prepare(`
    SELECT id, title, topic, summary, why_it_matters, publication_status
    FROM story_clusters
    WHERE publication_status = 'published'
      AND published_at IS NOT NULL
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND COALESCE(summary, '') <> ''
    ORDER BY published_at ASC
    LIMIT ?
  `).bind(limit).all<{
    id: number; title: string; topic: string | null; summary: string | null;
    why_it_matters: string | null; publication_status: string;
  }>();
  for (const row of stories.results) {
    const item = candidate("published_story", row.id,
      `${row.title} ${row.topic ?? ""} ${row.summary ?? ""} ${row.why_it_matters ?? ""}`,
      "und", "admitted", row.publication_status);
    if (item) candidates.push(item);
  }

  const knowledge = await db.prepare(`
    SELECT id, canonical_question, direct_answer, detailed_explanation, section_slug,
           visibility
    FROM knowledge_documents
    WHERE status = 'approved'
      AND visibility IN ('public_knowledge', 'public_guide')
      AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND (hard_expiry IS NULL OR datetime(hard_expiry) > datetime('now'))
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_change_proposals proposal
        WHERE proposal.knowledge_document_id = knowledge_documents.id
          AND proposal.state = 'proposed'
      )
    ORDER BY approved_at ASC
    LIMIT ?
  `).bind(limit).all<{
    id: string; canonical_question: string; direct_answer: string | null;
    detailed_explanation: string | null; section_slug: string; visibility: string;
  }>();
  for (const row of knowledge.results) {
    const item = candidate("knowledge_section", `${row.id}:${row.section_slug}`,
      `${row.canonical_question} ${row.direct_answer ?? ""} ${row.detailed_explanation ?? ""}`,
      "und", "admitted", row.visibility);
    if (item) candidates.push(item);
  }

  // Guides are an optional legacy migration in some Preview databases. KC-09D
  // indexes them when present, without making the core migration depend on it.
  try {
    const guides = await db.prepare(`
      SELECT id, title, category, body_markdown, status, visibility
      FROM guides
      WHERE status = 'published' AND visibility = 'public'
      ORDER BY published_at ASC
      LIMIT ?
    `).bind(limit).all<{
      id: string; title: string; category: string; body_markdown: string;
      status: string; visibility: string;
    }>();
    for (const row of guides.results) {
      const item = candidate("guide", row.id, `${row.title} ${row.category} ${row.body_markdown}`,
        "und", "admitted", row.status);
      if (item) candidates.push(item);
    }
  } catch {
    // The optional Guides migration is not part of the KC-09 core dependency.
  }

  const corrections = await db.prepare(`
    SELECT id, previous_statement, updated_statement, reason
    FROM corrections
    WHERE published = 1
    ORDER BY corrected_at ASC
    LIMIT ?
  `).bind(limit).all<{
    id: number; previous_statement: string; updated_statement: string; reason: string;
  }>();
  for (const row of corrections.results) {
    const item = candidate("correction", row.id,
      `${row.previous_statement} ${row.updated_statement} ${row.reason}`,
      "und", "admitted", "published");
    if (item) candidates.push(item);
  }

  return candidates.slice(0, limit);
}

async function hashContent(candidateItem: KnowledgeEmbeddingCandidate): Promise<string> {
  const value = `${KC09_EMBEDDING_POLICY.policyVersion}\n${candidateItem.recordType}\n${candidateItem.recordId}\n${candidateItem.text}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseEmbeddings(value: unknown): number[][] {
  const data = value && typeof value === "object" && "data" in value
    ? (value as { data?: unknown }).data
    : value;
  if (!Array.isArray(data)) throw new Error("workers_ai_invalid_embedding_response");
  return data.map((row) => {
    if (!Array.isArray(row) || row.some(value => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error("workers_ai_invalid_embedding_vector");
    }
    return row as number[];
  });
}

interface ExistingEmbeddingItem {
  id: string;
  state: string;
  content_hash: string;
  vector_id: string;
  confirmation_attempt_count: number;
  active_running: number;
}

async function existingItem(
  db: D1Database,
  item: KnowledgeEmbeddingCandidate,
  contentHash: string,
): Promise<ExistingEmbeddingItem | null> {
  return db.prepare(`
    SELECT id, state, content_hash, vector_id, confirmation_attempt_count,
           CASE WHEN state = 'running'
                  AND datetime(updated_at) > datetime('now', '-${RUNNING_RECLAIM_AFTER_MINUTES} minutes')
                THEN 1 ELSE 0 END AS active_running
    FROM knowledge_embedding_index_items
    WHERE record_type = ? AND record_id = ? AND policy_version = ?
  `).bind(item.recordType, item.recordId, KC09_EMBEDDING_POLICY.policyVersion)
    .first<ExistingEmbeddingItem>();
}

async function reserveItem(
  db: D1Database,
  item: KnowledgeEmbeddingCandidate,
  contentHash: string,
  runId: string,
): Promise<"reserved" | "skip" | "deferred"> {
  const existing = await existingItem(db, item, contentHash);
  if (existing?.content_hash === contentHash && existing.state === "indexed") return "skip";
  if (existing?.content_hash === contentHash && existing.state === "running" && existing.active_running === 1) return "deferred";
  const id = existing?.id ?? crypto.randomUUID();
  await db.prepare(`
    INSERT INTO knowledge_embedding_index_items
      (id, record_type, record_id, policy_version, namespace, vector_id, content_hash,
       input_chars, estimated_input_tokens, language, admission_state, publication_state,
       state, attempt_count, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
    ON CONFLICT(record_type, record_id, policy_version) DO UPDATE SET
      namespace = excluded.namespace, vector_id = excluded.vector_id,
      content_hash = excluded.content_hash, input_chars = excluded.input_chars,
      estimated_input_tokens = excluded.estimated_input_tokens, language = excluded.language,
      admission_state = excluded.admission_state, publication_state = excluded.publication_state,
      state = 'pending', attempt_count = knowledge_embedding_index_items.attempt_count + 1,
      confirmation_attempt_count = 0, last_error = NULL, run_id = excluded.run_id,
      updated_at = datetime('now')
  `).bind(
    id, item.recordType, item.recordId, KC09_EMBEDDING_POLICY.policyVersion,
    KC09_EMBEDDING_POLICY.rollout.namespace, `${item.recordType}:${item.recordId}`,
    contentHash, item.text.length, estimateEmbeddingTokens(item.text), item.language,
    item.admissionState, item.publicationState, runId,
  ).run();
  return "reserved";
}

async function markConfirmationPending(
  db: D1Database,
  item: KnowledgeEmbeddingCandidate,
  runId: string,
  confirmationAttemptCount: number,
  errorCode = "vector_confirmation_pending",
): Promise<void> {
  await db.prepare(`
    UPDATE knowledge_embedding_index_items
    SET state = 'confirmation_pending', confirmation_attempt_count = ?,
        last_error = ?, run_id = ?, updated_at = datetime('now')
    WHERE record_type = ? AND record_id = ? AND policy_version = ?
  `).bind(
    confirmationAttemptCount, errorCode, runId,
    item.recordType, item.recordId, KC09_EMBEDDING_POLICY.policyVersion,
  ).run();
}

async function markConfirmationFailure(
  db: D1Database,
  item: KnowledgeEmbeddingCandidate,
  runId: string,
  confirmationAttemptCount: number,
): Promise<void> {
  await db.prepare(`
    UPDATE knowledge_embedding_index_items
    SET state = 'failed', confirmation_attempt_count = ?,
        last_error = 'vector_confirmation_exhausted', run_id = ?, updated_at = datetime('now')
    WHERE record_type = ? AND record_id = ? AND policy_version = ?
  `).bind(
    confirmationAttemptCount, runId,
    item.recordType, item.recordId, KC09_EMBEDDING_POLICY.policyVersion,
  ).run();
}

async function reconcileConfirmationPending(
  db: D1Database,
  index: KnowledgeEmbeddingVectorIndex,
  item: KnowledgeEmbeddingCandidate,
  existing: ExistingEmbeddingItem,
  runId: string,
): Promise<"reconciled" | "pending" | "failed"> {
  const attempt = existing.confirmation_attempt_count + 1;
  let confirmed = false;
  try {
    const vectors = await index.getByIds([existing.vector_id]);
    confirmed = vectors.some(vector => vector.id === existing.vector_id);
  } catch {
    // A transient confirmation failure is treated like a bounded miss. The
    // submitted vector remains authoritative-pending; no new embedding is run.
  }

  if (confirmed) {
    await markItems(db, [item], "indexed", runId, undefined);
    return "reconciled";
  }
  if (attempt >= MAX_CONFIRMATION_ATTEMPTS) {
    await markConfirmationFailure(db, item, runId, attempt);
    return "failed";
  }
  await markConfirmationPending(db, item, runId, attempt);
  return "pending";
}

async function markItems(
  db: D1Database,
  items: KnowledgeEmbeddingCandidate[],
  state: "running" | "indexed" | "failed",
  runId: string,
  mutationId: string | undefined,
  errorCode?: string,
): Promise<void> {
  for (const item of items) {
    await db.prepare(`
      UPDATE knowledge_embedding_index_items
      SET state = ?, remote_operation_id = COALESCE(?, remote_operation_id),
          last_error = ?, confirmation_attempt_count = CASE WHEN ? = 'indexed' OR ? = 'running' THEN 0 ELSE confirmation_attempt_count END,
          run_id = ?, updated_at = datetime('now'),
          indexed_at = CASE WHEN ? = 'indexed' THEN datetime('now') ELSE indexed_at END
      WHERE record_type = ? AND record_id = ? AND policy_version = ?
    `).bind(
      state, mutationId ?? null, errorCode ?? null, state, state, runId, state,
      item.recordType, item.recordId, KC09_EMBEDDING_POLICY.policyVersion,
    ).run();
    if (state === "indexed" && item.recordType === "source_chunk") {
      await db.prepare(`
        UPDATE source_chunks
        SET embedding_state = 'indexed', embedding_model = ?, embedding_version = ?
        WHERE id = ?
      `).bind(KC09_EMBEDDING_POLICY.embeddingModel, KC09_EMBEDDING_POLICY.policyVersion, item.recordId).run();
    }
  }
}

export async function indexKnowledgeEmbeddings(
  env: KnowledgeEmbeddingEnvironment,
  options: KnowledgeEmbeddingRunOptions = {},
): Promise<KnowledgeEmbeddingRunSummary> {
  const limit = boundedLimit(options.limit);
  if (env.TRACE_ENVIRONMENT !== "preview" || !env.AI || !env.KNOWLEDGE_VECTOR_INDEX) {
    return {
      state: "disabled", runId: null, selected: 0, submitted: 0, indexed: 0,
      skipped: 0, deferred: 0, confirmationPending: 0, reconciled: 0, inputTokens: 0,
    };
  }

  const candidates = await allCandidates(env.DB, limit);
  let inputTokens = 0;
  const selected: KnowledgeEmbeddingCandidate[] = [];
  const maxDailyTokens = KC09_EMBEDDING_POLICY.budget.previewDailyInputTokenCeiling;
  const usedToday = await env.DB.prepare(`
    SELECT COALESCE(SUM(input_tokens), 0) AS input_tokens
    FROM knowledge_embedding_runs
    WHERE environment = 'preview'
      AND date(created_at) = date('now')
      AND state IN ('running', 'completed', 'partial')
  `).first<{ input_tokens: number }>();
  let remainingTokens = Math.max(0, maxDailyTokens - Number(usedToday?.input_tokens ?? 0));
  for (const item of candidates) {
    const contentHash = await hashContent(item);
    const existing = await existingItem(env.DB, item, contentHash);
    const confirmationOnly = existing?.content_hash === contentHash && existing.state === "confirmation_pending";
    const indexedOnly = existing?.content_hash === contentHash && existing.state === "indexed";
    const activeRunningOnly = existing?.content_hash === contentHash
      && existing.state === "running" && existing.active_running === 1;
    const estimated = estimateEmbeddingTokens(item.text);
    if (!confirmationOnly && !indexedOnly && !activeRunningOnly && estimated > remainingTokens) break;
    selected.push(item);
    if (!confirmationOnly && !indexedOnly && !activeRunningOnly) {
      inputTokens += estimated;
      remainingTokens -= estimated;
    }
  }

  if (options.dryRun) {
    return {
      state: "completed", runId: null, selected: selected.length, submitted: 0, indexed: 0,
      skipped: 0, deferred: 0, confirmationPending: 0, reconciled: 0, inputTokens,
    };
  }

  const runId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO knowledge_embedding_runs
      (id, environment, policy_version, namespace, state, requested_limit, input_tokens)
    VALUES (?, 'preview', ?, ?, 'running', ?, ?)
  `).bind(runId, KC09_EMBEDDING_POLICY.policyVersion, KC09_EMBEDDING_POLICY.rollout.namespace, limit, 0).run();

  let skipped = 0;
  let deferred = 0;
  let confirmationPending = 0;
  let reconciled = 0;
  let runInputTokens = 0;
  let confirmationFailed = false;
  let indexed = 0;
  const reserved: KnowledgeEmbeddingCandidate[] = [];
  for (const item of selected) {
    const contentHash = await hashContent(item);
    const existing = await existingItem(env.DB, item, contentHash);
    if (existing?.content_hash === contentHash && existing.state === "confirmation_pending") {
      const outcome = await reconcileConfirmationPending(env.DB, env.KNOWLEDGE_VECTOR_INDEX, item, existing, runId);
      if (outcome === "reconciled") {
        indexed++;
        reconciled++;
      } else if (outcome === "pending") {
        deferred++;
        confirmationPending++;
      } else {
        confirmationFailed = true;
      }
      continue;
    }
    const status = await reserveItem(env.DB, item, contentHash, runId);
    if (status === "skip") skipped++;
    else if (status === "deferred") deferred++;
    else reserved.push(item);
  }

  let submitted = 0;
  let failed = false;
  const maxBatchTokens = KC09_EMBEDDING_POLICY.budget.maximumInputTokensPerBatch;
  for (let offset = 0; offset < reserved.length; ) {
    const batch: KnowledgeEmbeddingCandidate[] = [];
    let batchTokens = 0;
    while (offset < reserved.length) {
      const next = reserved[offset];
      const nextTokens = estimateEmbeddingTokens(next.text);
      if (batch.length > 0 && batchTokens + nextTokens > maxBatchTokens) break;
      batch.push(next);
      batchTokens += nextTokens;
      offset++;
    }
    try {
      runInputTokens += batchTokens;
      await markItems(env.DB, batch, "running", runId, undefined);
      const embeddings = parseEmbeddings(await env.AI.run(KC09_EMBEDDING_POLICY.embeddingModel, { text: batch.map(item => item.text) }));
      if (embeddings.length !== batch.length || embeddings.some(values => values.length !== KC09_EMBEDDING_POLICY.dimensions)) {
        throw new Error("workers_ai_embedding_dimension_mismatch");
      }
      const vectors = batch.map((item, index): KnowledgeEmbeddingVector => ({
        id: `${item.recordType}:${item.recordId}`,
        namespace: KC09_EMBEDDING_POLICY.rollout.namespace,
        values: embeddings[index],
        metadata: {
          record_type: item.recordType,
          language: item.language,
          admission_state: item.admissionState,
          publication_state: item.publicationState,
          embedding_version: KC09_EMBEDDING_POLICY.policyVersion,
        },
      }));
      await env.KNOWLEDGE_VECTOR_INDEX.upsert(vectors);
      submitted += batch.length;
      let confirmed: Array<{ id: string }> = [];
      try {
        confirmed = await env.KNOWLEDGE_VECTOR_INDEX.getByIds(vectors.map(vector => vector.id));
      } catch {
        // The upsert succeeded; a transient confirmation error must not turn
        // active embedding work into a duplicate submission on the next run.
      }
      const confirmedIds = new Set(confirmed.map(vector => vector.id));
      const confirmedItems = batch.filter(item => confirmedIds.has(`${item.recordType}:${item.recordId}`));
      const deferredItems = batch.filter(item => !confirmedIds.has(`${item.recordType}:${item.recordId}`));
      if (confirmedItems.length) {
        await markItems(env.DB, confirmedItems, "indexed", runId, undefined);
        indexed += confirmedItems.length;
      }
      for (const item of deferredItems) {
        await markConfirmationPending(env.DB, item, runId, 1);
      }
      if (deferredItems.length) {
        deferred += deferredItems.length;
        confirmationPending += deferredItems.length;
      }
    } catch {
      failed = true;
      await markItems(env.DB, batch, "failed", runId, undefined, "embedding_index_failed");
      break;
    }
  }

  const state = failed || confirmationFailed ? "failed" : deferred > 0 ? "partial" : "completed";
  await env.DB.prepare(`
    UPDATE knowledge_embedding_runs
    SET state = ?, vector_count = ?, skipped_count = ?, input_tokens = ?,
        confirmation_pending_count = ?, reconciled_count = ?, completed_at = datetime('now'),
        error_code = CASE WHEN ? = 'failed' AND ? = 1 THEN 'embedding_index_failed'
                          WHEN ? = 'failed' THEN 'vector_confirmation_exhausted'
                          ELSE NULL END
    WHERE id = ?
  `).bind(
    state, indexed, skipped, runInputTokens, confirmationPending, reconciled,
    state, failed ? 1 : 0, state, runId,
  ).run();
  return {
    state, runId, selected: selected.length, submitted, indexed, skipped, deferred,
    confirmationPending, reconciled, inputTokens: runInputTokens,
    ...((failed || confirmationFailed)
      ? { errorCode: failed ? "embedding_index_failed" : "vector_confirmation_exhausted" }
      : {}),
  };
}
