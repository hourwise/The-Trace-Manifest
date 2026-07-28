/** KC-11C: bounded, review-gated source-document backfill. */
import { extractHtmlDocument } from "./source-extraction";
import { captureAdmittedSource, normaliseSourceUrl, type SourceCaptureStorageMode } from "./source-capture";
import { retrieveRemoteSource, SourceRetrievalError } from "./source-retrieval";

export const BACKFILL_CEILINGS = Object.freeze({
  maxRecords: 25, maxConcurrency: 2, maxRedirects: 3, maxBytesPerRecord: 512 * 1024,
  maxTotalBytes: 5 * 1024 * 1024, maxRetries: 2, maxDurationMs: 30_000,
});
export type BackfillOutcome = "planned" | "captured_new_document" | "captured_new_version" | "unchanged" | "metadata_only" | "unavailable" | "excluded" | "held_for_review" | "failed_retryable" | "failed_terminal";
export type InventoryRecord = { id: string; label?: string; state?: string; url?: string; origin?: string | string[]; category?: string };
export type BackfillSelection = { category?: string; recordIds?: string[]; limit: number; newestFirst?: boolean };
export type BackfillPlanItem = InventoryRecord & { category: string; canonicalUrl: string | null; fetchability: "eligible" | "ineligible"; admissionOutcome: "eligible" | "excluded"; duplicateOutcome: "unknown_until_fetch" | "not_applicable"; storageMode: SourceCaptureStorageMode; exclusionReason?: string };
export type BackfillPlan = { schemaVersion: "kc-11a-v1"; planVersion: "kc-11c-v1"; inventoryIdentity: string; selection: BackfillSelection; ceilings: typeof BACKFILL_CEILINGS; selected: BackfillPlanItem[]; excluded: Array<{ recordId: string; category: string; reason: string }>; estimatedRequestCount: number; estimatedStorageBytesCeiling: number; planHash: string };

function eligibleRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value); const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && !hostname.includes(":") && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)
      && hostname !== "localhost" && !hostname.endsWith(".localhost") && !hostname.endsWith(".local") && !hostname.endsWith(".internal") && !hostname.endsWith(".home") && !hostname.endsWith(".lan") && hostname.includes(".");
  } catch { return false; }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""); }

export function inventoryRecords(inventory: { schemaVersion?: string; categories?: Record<string, InventoryRecord[]> }): InventoryRecord[] {
  if (inventory.schemaVersion !== "kc-11a-v1" || !inventory.categories) throw new Error("A KC-11A versioned inventory is required.");
  return Object.entries(inventory.categories).flatMap(([category, records]) => (records ?? []).map((record) => ({ ...record, id: String(record.id), category })));
}

export async function buildBackfillPlan(inventory: { schemaVersion?: string; generatedAt?: string; categories?: Record<string, InventoryRecord[]> }, selection: BackfillSelection): Promise<BackfillPlan> {
  if (inventory.schemaVersion !== "kc-11a-v1") throw new Error("Unsupported inventory schema.");
  if (!Number.isInteger(selection.limit) || selection.limit < 1 || selection.limit > BACKFILL_CEILINGS.maxRecords) throw new Error(`limit must be between 1 and ${BACKFILL_CEILINGS.maxRecords}.`);
  const ids = selection.recordIds?.map(String) ?? [];
  if (selection.recordIds && (!Array.isArray(selection.recordIds) || ids.length === 0 || ids.length > BACKFILL_CEILINGS.maxRecords)) throw new Error("recordIds must be a bounded, non-empty list.");
  if (!selection.category && ids.length === 0) throw new Error("An explicit category or recordIds selection is required.");
  const all = inventoryRecords(inventory).filter((record) => (!selection.category || record.category === selection.category) && (ids.length === 0 || ids.includes(record.id)));
  const ordered = [...all].sort((a, b) => a.id.localeCompare(b.id));
  if (selection.newestFirst) ordered.reverse();
  const selected: BackfillPlanItem[] = [];
  const excluded: BackfillPlan["excluded"] = [];
  for (const record of ordered) {
    const category = record.category ?? "unknown";
    const canonicalUrl = record.url ? normaliseSourceUrl(record.url) : null;
    if (!canonicalUrl || !eligibleRemoteUrl(canonicalUrl)) { excluded.push({ recordId: record.id, category, reason: "url_ineligible_or_private" }); continue; }
    if (selected.length >= selection.limit) { excluded.push({ recordId: record.id, category, reason: "outside_explicit_limit" }); continue; }
    selected.push({ ...record, category, canonicalUrl, fetchability: "eligible", admissionOutcome: "eligible", duplicateOutcome: "unknown_until_fetch", storageMode: "metadata_only" });
  }
  for (const record of all) if (!selected.some((item) => item.id === record.id) && !excluded.some((item) => item.recordId === record.id)) excluded.push({ recordId: record.id, category: record.category ?? "unknown", reason: "outside_explicit_limit" });
  const inventoryIdentity = await sha256(stable({ schemaVersion: inventory.schemaVersion, generatedAt: inventory.generatedAt ?? null, categories: inventory.categories }));
  const unsigned = { schemaVersion: "kc-11a-v1" as const, planVersion: "kc-11c-v1" as const, inventoryIdentity, selection: { ...selection, recordIds: ids.length ? ids : undefined }, ceilings: BACKFILL_CEILINGS, selected, excluded, estimatedRequestCount: selected.length, estimatedStorageBytesCeiling: selected.length * BACKFILL_CEILINGS.maxBytesPerRecord };
  return { ...unsigned, planHash: await sha256(stable(unsigned)) };
}

export async function verifyPlanHash(plan: BackfillPlan, expected: string): Promise<boolean> {
  const { planHash: _ignored, ...unsigned } = plan;
  return (await sha256(stable(unsigned))) === expected && plan.planHash === expected;
}

export type BackfillDb = Pick<D1Database, "prepare" | "batch" | "exec" | "dump" | "withSession">;
export type BackfillEnv = { DB: BackfillDb; RAW_STORE: Pick<R2Bucket, "put" | "delete">; TRACE_ENVIRONMENT?: string };

function parseBody(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function idempotencyFor(batchId: string, recordId: string): string { return `kc11c:${batchId}:${recordId}`; }

export async function approveBackfillPlan(env: BackfillEnv, plan: BackfillPlan, planHash: string, actor: string, idempotencyKey: string, correlationId = crypto.randomUUID()): Promise<{ batchId: string }> {
  if (env.TRACE_ENVIRONMENT !== "preview") throw new Error("KC-11C backfill is Preview-only.");
  if (!(await verifyPlanHash(plan, planHash))) throw new Error("Plan hash does not match the submitted plan.");
  const batchId = crypto.randomUUID();
  const statements = [env.DB.prepare(`INSERT INTO knowledge_source_backfill_batches (id, environment, inventory_schema_version, inventory_identity, plan_hash, plan_json, selection_json, ceilings_json, state, approved_by, approved_at, idempotency_key, correlation_id) VALUES (?, 'preview', ?, ?, ?, ?, ?, ?, 'approved', ?, datetime('now'), ?, ?)`)
    .bind(batchId, plan.schemaVersion, plan.inventoryIdentity, planHash, JSON.stringify(plan), JSON.stringify(plan.selection), JSON.stringify(plan.ceilings), actor, idempotencyKey, correlationId)];
  for (const item of plan.selected) {
    const itemId = crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO knowledge_source_backfill_items (id, batch_id, inventory_record_id, category, canonical_url, outcome, reason_code, correlation_id, idempotency_key, actor) VALUES (?, ?, ?, ?, ?, 'planned', NULL, ?, ?, ?)`)
      .bind(itemId, batchId, item.id, item.category, item.canonicalUrl, correlationId, idempotencyFor(batchId, item.id), actor));
    statements.push(env.DB.prepare(`INSERT INTO knowledge_source_backfill_item_events (id, batch_id, item_id, outcome, metadata_json, actor, correlation_id) VALUES (?, ?, ?, 'planned', ?, ?, ?)`)
      .bind(crypto.randomUUID(), batchId, itemId, JSON.stringify({ planHash, canonicalUrl: item.canonicalUrl }), actor, correlationId));
  }
  await env.DB.batch(statements);
  return { batchId };
}

export async function executeBackfill(env: BackfillEnv, batchId: string, planHash: string, actor: string, idempotencyKey: string): Promise<Record<string, unknown>> {
  if (env.TRACE_ENVIRONMENT !== "preview") throw new Error("KC-11C backfill is Preview-only.");
  const batch = await env.DB.prepare("SELECT * FROM knowledge_source_backfill_batches WHERE id = ? AND plan_hash = ?").bind(batchId, planHash).first<any>();
  if (!batch || batch.state !== "approved") throw new Error("The exact approved plan is required.");
  const started = Date.now();
  await env.DB.prepare("UPDATE knowledge_source_backfill_batches SET state = 'running', executed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND state = 'approved'").bind(batchId).run();
  const items = await env.DB.prepare("SELECT * FROM knowledge_source_backfill_items WHERE batch_id = ? AND outcome IN ('planned','failed_retryable') ORDER BY id").bind(batchId).all<any>();
  const counters: Record<string, number> = { captured_new_document: 0, captured_new_version: 0, unchanged: 0, metadata_only: 0, unavailable: 0, excluded: 0, failed_retryable: 0, failed_terminal: 0, processed: 0 };
  let totalBytes = 0;
  for (const item of (items.results ?? []).slice(0, BACKFILL_CEILINGS.maxRecords)) {
    if (Date.now() - started > BACKFILL_CEILINGS.maxDurationMs || totalBytes >= BACKFILL_CEILINGS.maxTotalBytes) break;
    const plan = JSON.parse(batch.plan_json) as BackfillPlan;
    const selected = plan.selected.find((candidate) => candidate.id === item.inventory_record_id);
    if (!selected?.canonicalUrl) { counters.excluded++; continue; }
    let outcome: BackfillOutcome = "failed_retryable"; let reason = "unknown"; let retrieved: Awaited<ReturnType<typeof retrieveRemoteSource>> | null = null; let capture: Awaited<ReturnType<typeof captureAdmittedSource>> | null = null;
    try {
      retrieved = await retrieveRemoteSource(selected.canonicalUrl, { allowedContentTypes: ["text/html", "text/plain", "text/markdown", "application/pdf"], maximumBytes: BACKFILL_CEILINGS.maxBytesPerRecord, timeoutMs: 8_000, maxRedirects: BACKFILL_CEILINGS.maxRedirects, userAgent: "TRACE-KC11C-Preview/1.0" });
      totalBytes += retrieved.byteLength;
      const existing = await env.DB.prepare("SELECT id FROM source_document_versions WHERE source_document_id = (SELECT id FROM source_documents WHERE canonical_url = ?) AND content_hash = ?").bind(selected.canonicalUrl, await sha256(retrieved.body)).first<{ id: string }>();
      if (existing) { outcome = "unchanged"; reason = "content_hash_unchanged"; }
      else {
        const extraction = retrieved.contentType === "text/html" ? extractHtmlDocument(retrieved.body) : extractHtmlDocument(`<main><p>${retrieved.body.slice(0, 12000)}</p></main>`);
        capture = await captureAdmittedSource(env, { canonicalUrl: selected.canonicalUrl, retrievedUrl: retrieved.finalUrl, contentType: retrieved.contentType, body: retrieved.body, extraction, mediaKind: retrieved.contentType === "text/html" ? "html" : "plain_text", admissionState: "admitted", copyrightStorageMode: selected.storageMode, httpStatus: retrieved.responseStatus, correlationId: batch.correlation_id, maximumBytes: BACKFILL_CEILINGS.maxBytesPerRecord });
        outcome = capture.extractionStatus === "metadata_only" ? "metadata_only" : (capture.sourceDocumentId ? (capture.sourceDocumentVersionId ? "captured_new_version" : "captured_new_document") : "failed_retryable"); reason = "captured_admitted_source";
      }
    } catch (error) {
      reason = error instanceof SourceRetrievalError ? error.code : error instanceof Error ? error.message.slice(0, 120) : "capture_failed";
      outcome = error instanceof SourceRetrievalError && ["url_ineligible", "redirect_rejected", "content_type_rejected", "response_status_rejected", "response_too_large"].includes(error.code) ? "excluded" : "failed_retryable";
    }
    counters[outcome] = (counters[outcome] ?? 0) + 1; counters.processed++;
    await env.DB.prepare("UPDATE knowledge_source_backfill_items SET outcome = ?, reason_code = ?, source_document_id = ?, source_document_version_id = ?, http_status = ?, retrieved_url = ?, redirect_count = ?, byte_length = ?, content_hash = ?, retry_count = retry_count + CASE WHEN ? IN ('failed_retryable','failed_terminal') THEN 1 ELSE 0 END, updated_at = datetime('now') WHERE id = ?")
      .bind(outcome, reason, capture?.sourceDocumentId ?? null, capture?.sourceDocumentVersionId ?? null, retrieved?.responseStatus ?? null, retrieved?.finalUrl ?? null, retrieved?.redirectCount ?? null, retrieved?.byteLength ?? null, capture?.contentHash ?? null, outcome, item.id).run();
    await env.DB.prepare("INSERT INTO knowledge_source_backfill_item_events (id, batch_id, item_id, outcome, reason_code, metadata_json, actor, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), batchId, item.id, outcome, reason, JSON.stringify({ httpStatus: retrieved?.responseStatus ?? null, byteLength: retrieved?.byteLength ?? null }), actor, batch.correlation_id).run();
  }
  const state = counters.failed_retryable > 0 || counters.processed < (items.results?.length ?? 0) ? "partial" : "completed";
  await env.DB.prepare("UPDATE knowledge_source_backfill_batches SET state = ?, updated_at = datetime('now') WHERE id = ?").bind(state, batchId).run();
  return { state, batchId, planHash, ...counters, totalBytes };
}

export function parseBackfillRequest(value: unknown): { inventory?: unknown; selection?: BackfillSelection; plan?: BackfillPlan; planHash?: string; batchId?: string; idempotencyKey?: string } | null {
  const body = parseBody(value); if (!body) return null;
  if (body.selection !== undefined && (!parseBody(body.selection) || !Number.isInteger((body.selection as any).limit))) return null;
  return body as any;
}
