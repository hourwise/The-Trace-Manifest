/** KC-11C: bounded, review-gated source-document backfill. */
import { extractHtmlDocument } from "./source-extraction";
import { captureAdmittedSource, normaliseSourceUrl, type SourceCaptureStorageMode } from "./source-capture";
import { retrieveRemoteSource, SourceRetrievalError } from "./source-retrieval";
import { hashNormalizedSourceContent, type SourceIdentityMediaKind } from "./source-version-identity";

export const BACKFILL_CEILINGS = Object.freeze({
  maxRecords: 25, maxConcurrency: 1, maxRedirects: 3, maxBytesPerRecord: 512 * 1024,
  maxTotalBytes: 5 * 1024 * 1024, maxRetries: 2, maxDurationMs: 30_000,
  staleExecutionSeconds: 120,
});
export const BACKFILL_POLICY_VERSION = "kc-11c-v1" as const;
export const BACKFILL_INVENTORY_SCHEMA_VERSION = "kc-11a-v1" as const;
export type BackfillOutcome = "planned" | "captured_new_document" | "captured_new_version" | "unchanged" | "metadata_only" | "unavailable" | "excluded" | "held_for_review" | "failed_retryable" | "failed_terminal";
export type InventoryRecord = { id: string; label?: string; state?: string; url?: string; origin?: string | string[]; category?: string };
export type BackfillSelection = { category?: string; recordIds?: string[]; limit: number; newestFirst?: boolean };
export type BackfillPlanItem = InventoryRecord & { category: string; canonicalUrl: string | null; fetchability: "eligible" | "ineligible"; admissionOutcome: "eligible" | "excluded"; duplicateOutcome: "unknown_until_fetch" | "not_applicable"; storageMode: SourceCaptureStorageMode; exclusionReason?: string };
export type BackfillPlan = { schemaVersion: "kc-11a-v1"; planVersion: "kc-11c-v1"; inventorySnapshotId: string; inventoryIdentity: string; selection: BackfillSelection; ceilings: typeof BACKFILL_CEILINGS; selected: BackfillPlanItem[]; excluded: Array<{ recordId: string; category: string; reason: string }>; estimatedRequestCount: number; estimatedStorageBytesCeiling: number; planHash: string };
export type BackfillInventory = { schemaVersion?: string; generatedAt?: string; categories?: Record<string, InventoryRecord[]>; [key: string]: unknown };
export type InventoryAuthorityResult = {
  snapshotId: string;
  inventoryIdentity: string;
  authorityDecisionId: string;
  snapshotCreatedAt: string;
  authorisedAt: string;
  generation: number;
};

function eligibleRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value); const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && !hostname.includes(":") && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)
      && hostname !== "localhost" && !hostname.endsWith(".localhost") && !hostname.endsWith(".local") && !hostname.endsWith(".internal") && !hostname.endsWith(".home") && !hostname.endsWith(".lan") && hostname.includes(".");
  } catch { return false; }
}

function stable(value: unknown, path = "$"): string {
  if (value === undefined) throw new Error(`Undefined value is not allowed in canonical data at ${path}.`);
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const values: string[] = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error(`Sparse arrays are not allowed in canonical data at ${path}.`);
      values.push(stable(value[index], `${path}[${index}]`));
    }
    return `[${values.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key], `${path}.${key}`)}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Non-finite numbers are not allowed in canonical data at ${path}.`);
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error(`Unsupported value is not allowed in canonical data at ${path}.`);
  return encoded;
}
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""); }

export async function inventoryIdentityFor(inventory: BackfillInventory): Promise<string> {
  if (inventory.schemaVersion !== BACKFILL_INVENTORY_SCHEMA_VERSION || !inventory.categories || typeof inventory.categories !== "object") {
    throw new Error("A KC-11A versioned inventory is required.");
  }
  return sha256(stable(inventory));
}

export function inventoryRecords(inventory: { schemaVersion?: string; categories?: Record<string, InventoryRecord[]> }): InventoryRecord[] {
  if (inventory.schemaVersion !== "kc-11a-v1" || !inventory.categories) throw new Error("A KC-11A versioned inventory is required.");
  return Object.entries(inventory.categories).flatMap(([category, records]) => (records ?? []).map((record) => ({ ...record, id: String(record.id), category })));
}

export async function buildBackfillPlan(inventory: BackfillInventory, selection: BackfillSelection, inventorySnapshotId = "local-untrusted"): Promise<BackfillPlan> {
  if (inventory.schemaVersion !== "kc-11a-v1") throw new Error("Unsupported inventory schema.");
  if (!Number.isInteger(selection.limit) || selection.limit < 1 || selection.limit > BACKFILL_CEILINGS.maxRecords) throw new Error(`limit must be between 1 and ${BACKFILL_CEILINGS.maxRecords}.`);
  if ("recordIds" in selection && selection.recordIds !== undefined && (!Array.isArray(selection.recordIds) || selection.recordIds.length === 0 || selection.recordIds.length > BACKFILL_CEILINGS.maxRecords || selection.recordIds.some((id) => typeof id !== "string" || id.length === 0))) throw new Error("recordIds must be a bounded, non-empty list of strings.");
  if (selection.category !== undefined && (typeof selection.category !== "string" || selection.category.length === 0)) throw new Error("category must be a non-empty string when supplied.");
  if (selection.newestFirst !== undefined && typeof selection.newestFirst !== "boolean") throw new Error("newestFirst must be a boolean when supplied.");
  const ids = selection.recordIds === undefined ? [] : selection.recordIds.map(String);
  if (!selection.category && ids.length === 0) throw new Error("An explicit category or recordIds selection is required.");
  const canonicalSelection: BackfillSelection = {
    limit: selection.limit,
    ...(selection.category !== undefined ? { category: selection.category } : {}),
    ...(ids.length > 0 ? { recordIds: ids } : {}),
    ...(selection.newestFirst !== undefined ? { newestFirst: selection.newestFirst } : {}),
  };
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
  const inventoryIdentity = await inventoryIdentityFor(inventory);
  const unsigned = { schemaVersion: "kc-11a-v1" as const, planVersion: "kc-11c-v1" as const, inventorySnapshotId, inventoryIdentity, selection: canonicalSelection, ceilings: BACKFILL_CEILINGS, selected, excluded, estimatedRequestCount: selected.length, estimatedStorageBytesCeiling: selected.length * BACKFILL_CEILINGS.maxBytesPerRecord };
  return { ...unsigned, planHash: await sha256(stable(unsigned)) };
}

export async function verifyPlanHash(plan: BackfillPlan, expected: string): Promise<boolean> {
  try {
    const { planHash: _ignored, ...unsigned } = plan;
    return (await sha256(stable(unsigned))) === expected && plan.planHash === expected;
  } catch {
    return false;
  }
}

export type BackfillDb = Pick<D1Database, "prepare" | "batch" | "exec" | "dump" | "withSession">;
export type BackfillEnv = { DB: BackfillDb; RAW_STORE: Pick<R2Bucket, "put" | "delete">; TRACE_ENVIRONMENT?: string };

/**
 * Runtime objects required by KC-11C capture and its deterministic review
 * trigger. Keep this list explicit so a migration drift fails closed before
 * an execution lease or network retrieval is acquired.
 */
export const KC11C_RUNTIME_SCHEMA_OBJECTS = Object.freeze([
  "knowledge_source_backfill_batches",
  "knowledge_source_backfill_items",
  "knowledge_source_backfill_attempts",
  "knowledge_source_backfill_item_events",
  "knowledge_source_backfill_current_inventory_authority",
  "source_documents",
  "source_document_versions",
  "source_document_version_observations",
  "knowledge_index_operations",
  "knowledge_documents",
  "knowledge_document_claims",
  "knowledge_document_claim_assertions",
  "claim_assertions",
  "canonical_claims",
  "knowledge_change_proposals",
  "knowledge_claim_conflict_cases",
] as const);

/** Fail closed on migration drift without mutating the backfill ledger. */
export async function assertBackfillRuntimeSchema(env: BackfillEnv): Promise<void> {
  const placeholders = KC11C_RUNTIME_SCHEMA_OBJECTS.map(() => "?").join(", ");
  const rows = await env.DB.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE (type = 'table' OR type = 'view')
      AND name IN (${placeholders})
  `).bind(...KC11C_RUNTIME_SCHEMA_OBJECTS).all<{ name: string }>();
  const present = new Set((rows.results ?? []).map((row) => String(row.name)));
  const missing = KC11C_RUNTIME_SCHEMA_OBJECTS.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(`KC-11C runtime schema is incomplete; missing: ${missing.join(", ")}`);
  }
}

function parseBody(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function idempotencyFor(batchId: string, recordId: string): string { return `kc11c:${batchId}:${recordId}`; }

async function authoritativeSnapshot(env: BackfillEnv, plan: BackfillPlan): Promise<void> {
  if (!plan.inventorySnapshotId || plan.inventorySnapshotId === "local-untrusted") throw new Error("An authoritative KC-11A inventory snapshot is required.");
  const snapshot = await env.DB.prepare(`
    SELECT snapshot_id, schema_version, inventory_identity, policy_version
    FROM knowledge_source_backfill_current_inventory_authority
    WHERE snapshot_id = ?
  `).bind(plan.inventorySnapshotId).first<any>();
  if (!snapshot || snapshot.schema_version !== plan.schemaVersion || snapshot.policy_version !== plan.planVersion || snapshot.inventory_identity !== plan.inventoryIdentity) throw new Error("The plan does not reference the currently authorised inventory snapshot.");
  if (stable(BACKFILL_CEILINGS) !== stable(plan.ceilings)) throw new Error("Backfill policy ceilings changed; approval is invalid.");
}

export async function loadCurrentBackfillInventory(
  env: BackfillEnv,
  snapshotId: string,
): Promise<{ inventory: BackfillInventory; inventoryIdentity: string }> {
  const authority = await env.DB.prepare(`
    SELECT snapshot_id, inventory_identity, snapshot_json, schema_version, policy_version
    FROM knowledge_source_backfill_current_inventory_authority
    WHERE snapshot_id = ?
  `).bind(snapshotId).first<any>();
  if (!authority || authority.schema_version !== BACKFILL_INVENTORY_SCHEMA_VERSION || authority.policy_version !== BACKFILL_POLICY_VERSION) {
    throw new Error("The requested inventory snapshot is not currently authorised.");
  }
  const inventory = JSON.parse(String(authority.snapshot_json)) as BackfillInventory;
  if (await inventoryIdentityFor(inventory) !== authority.inventory_identity) {
    throw new Error("The stored inventory snapshot failed its identity check.");
  }
  return { inventory, inventoryIdentity: String(authority.inventory_identity) };
}

export async function establishAuthoritativeInventory(
  env: BackfillEnv,
  inventory: BackfillInventory,
  policyVersion: string,
  actor: string,
  idempotencyKey: string,
  correlationId: string = crypto.randomUUID(),
): Promise<InventoryAuthorityResult> {
  if (env.TRACE_ENVIRONMENT !== "preview") throw new Error("KC-11C inventory authority is Preview-only.");
  if (policyVersion !== BACKFILL_POLICY_VERSION) throw new Error("Unsupported backfill policy version.");
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("A bounded authority idempotency key is required.");
  const inventoryIdentity = await inventoryIdentityFor(inventory);
  const canonicalSnapshot = stable(inventory);

  const prior = await env.DB.prepare(`
    SELECT authority.id, authority.snapshot_id, authority.generation, authority.created_at AS authorised_at,
           snapshot.inventory_identity, snapshot.created_at AS snapshot_created_at
    FROM knowledge_source_backfill_inventory_authority AS authority
    JOIN knowledge_source_backfill_inventory_snapshots AS snapshot ON snapshot.id = authority.snapshot_id
    WHERE authority.idempotency_key = ?
  `).bind(idempotencyKey).first<any>();
  if (prior) {
    if (prior.inventory_identity !== inventoryIdentity) throw new Error("The authority idempotency key was already used for another inventory.");
    return {
      snapshotId: String(prior.snapshot_id),
      inventoryIdentity,
      authorityDecisionId: String(prior.id),
      snapshotCreatedAt: String(prior.snapshot_created_at),
      authorisedAt: String(prior.authorised_at),
      generation: Number(prior.generation),
    };
  }

  let snapshot = await env.DB.prepare(`
    SELECT id, inventory_identity, snapshot_json, created_at
    FROM knowledge_source_backfill_inventory_snapshots
    WHERE inventory_identity = ?
  `).bind(inventoryIdentity).first<any>();
  if (snapshot && snapshot.snapshot_json !== canonicalSnapshot) throw new Error("Inventory identity collision detected.");
  if (!snapshot) {
    const snapshotId = crypto.randomUUID();
    try {
      await env.DB.prepare(`
        INSERT INTO knowledge_source_backfill_inventory_snapshots
          (id, schema_version, inventory_identity, snapshot_json, policy_version, created_by, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).bind(snapshotId, BACKFILL_INVENTORY_SCHEMA_VERSION, inventoryIdentity, canonicalSnapshot, BACKFILL_POLICY_VERSION, actor).run();
    } catch {
      // A concurrent identical publisher request may have inserted the same
      // immutable identity. Re-read it; any other failure still fails closed.
    }
    snapshot = await env.DB.prepare(`
      SELECT id, inventory_identity, snapshot_json, created_at
      FROM knowledge_source_backfill_inventory_snapshots
      WHERE inventory_identity = ?
    `).bind(inventoryIdentity).first<any>();
    if (!snapshot || snapshot.snapshot_json !== canonicalSnapshot) throw new Error("The immutable inventory snapshot could not be established.");
  }

  const authorityDecisionId = crypto.randomUUID();
  try {
    await env.DB.prepare(`
      INSERT INTO knowledge_source_backfill_inventory_authority
        (id, snapshot_id, schema_version, policy_version, decision, actor, idempotency_key, correlation_id)
      VALUES (?, ?, ?, ?, 'authorised', ?, ?, ?)
    `).bind(authorityDecisionId, snapshot.id, BACKFILL_INVENTORY_SCHEMA_VERSION, BACKFILL_POLICY_VERSION, actor, idempotencyKey, correlationId).run();
  } catch {
    const raced = await env.DB.prepare(`
      SELECT id, snapshot_id FROM knowledge_source_backfill_inventory_authority WHERE idempotency_key = ?
    `).bind(idempotencyKey).first<any>();
    if (!raced || raced.snapshot_id !== snapshot.id) throw new Error("The inventory authority decision could not be recorded.");
  }

  const recorded = await env.DB.prepare(`
    SELECT authority.id, authority.snapshot_id, authority.generation, authority.created_at AS authorised_at,
           snapshot.inventory_identity, snapshot.created_at AS snapshot_created_at
    FROM knowledge_source_backfill_inventory_authority AS authority
    JOIN knowledge_source_backfill_inventory_snapshots AS snapshot ON snapshot.id = authority.snapshot_id
    WHERE authority.idempotency_key = ?
  `).bind(idempotencyKey).first<any>();
  if (!recorded || recorded.inventory_identity !== inventoryIdentity) throw new Error("The inventory authority decision could not be verified.");
  return {
    snapshotId: String(recorded.snapshot_id),
    inventoryIdentity,
    authorityDecisionId: String(recorded.id),
    snapshotCreatedAt: String(recorded.snapshot_created_at),
    authorisedAt: String(recorded.authorised_at),
    generation: Number(recorded.generation),
  };
}

export async function approveBackfillPlan(env: BackfillEnv, plan: BackfillPlan, planHash: string, actor: string, idempotencyKey: string, correlationId = crypto.randomUUID()): Promise<{ batchId: string }> {
  if (env.TRACE_ENVIRONMENT !== "preview") throw new Error("KC-11C backfill is Preview-only.");
  if (!(await verifyPlanHash(plan, planHash))) throw new Error("Plan hash does not match the submitted plan.");
  await authoritativeSnapshot(env, plan);
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

export async function executeBackfill(env: BackfillEnv, batchId: string, planHash: string, actor: string, idempotencyKey: string, mode: "initial" | "retry" = "initial"): Promise<Record<string, unknown>> {
  if (env.TRACE_ENVIRONMENT !== "preview") throw new Error("KC-11C backfill is Preview-only.");
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("A bounded execution idempotency key is required.");
  await assertBackfillRuntimeSchema(env);
  const batch = await env.DB.prepare("SELECT * FROM knowledge_source_backfill_batches WHERE id = ? AND plan_hash = ?").bind(batchId, planHash).first<any>();
  if (!batch) throw new Error("The exact approved plan is required.");
  const prior = await env.DB.prepare("SELECT * FROM knowledge_source_backfill_attempts WHERE batch_id = ? AND idempotency_key = ?").bind(batchId, idempotencyKey).first<any>();
  if (prior?.state === "completed" && prior.result_json) return JSON.parse(prior.result_json);
  if (prior?.state === "running") throw new Error("An execution with this idempotency key is already running.");
  const requiredState = mode === "retry" ? "partial" : "approved";
  if (batch.state !== requiredState) throw new Error(mode === "retry" ? "Only partial batches can be retried." : "The exact approved plan is required.");
  await authoritativeSnapshot(env, JSON.parse(batch.plan_json) as BackfillPlan);
  const attemptId = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO knowledge_source_backfill_attempts (id, batch_id, idempotency_key, actor, state, correlation_id) VALUES (?, ?, ?, ?, 'running', ?)").bind(attemptId, batchId, idempotencyKey, actor, batch.correlation_id).run();
  } catch { throw new Error("Another execution attempt is already active or the idempotency key was already used."); }
  const acquired = await env.DB.prepare("UPDATE knowledge_source_backfill_batches SET state = 'running', executed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND state = ?").bind(batchId, requiredState).run();
  if (Number(acquired.meta.changes ?? 0) !== 1) { await env.DB.prepare("UPDATE knowledge_source_backfill_attempts SET state = 'failed', completed_at = datetime('now'), result_json = ? WHERE id = ?").bind(JSON.stringify({ error: "execution_lease_lost" }), attemptId).run(); throw new Error("Another execution already owns this batch."); }
  const started = Date.now();
  const items = await env.DB.prepare("SELECT * FROM knowledge_source_backfill_items WHERE batch_id = ? AND (outcome = 'planned' OR (outcome = 'failed_retryable' AND retry_count < ?)) ORDER BY id").bind(batchId, BACKFILL_CEILINGS.maxRetries).all<any>();
  const plan = JSON.parse(batch.plan_json) as BackfillPlan;
  const counters: Record<string, number> = { captured_new_document: 0, captured_new_version: 0, unchanged: 0, metadata_only: 0, unavailable: 0, excluded: 0, held_for_review: 0, failed_retryable: 0, failed_terminal: 0, processed: 0 };
  let totalBytes = 0;
  for (const item of (items.results ?? []).slice(0, BACKFILL_CEILINGS.maxRecords)) {
    const selected = plan.selected.find((candidate) => candidate.id === item.inventory_record_id);
    if (!selected?.canonicalUrl) { await settleItem(env, batch, item, "excluded", "approved_plan_item_missing", actor, counters); continue; }
    const remaining = BACKFILL_CEILINGS.maxTotalBytes - totalBytes;
    if (Date.now() - started > BACKFILL_CEILINGS.maxDurationMs || remaining <= 0) { await settleItem(env, batch, item, "held_for_review", "bounded_execution_ceiling", actor, counters); continue; }
    let outcome: BackfillOutcome = "failed_retryable"; let reason = "unknown"; let retrieved: Awaited<ReturnType<typeof retrieveRemoteSource>> | null = null; let capture: Awaited<ReturnType<typeof captureAdmittedSource>> | null = null;
    let contentHash: string | null = item.transport_hash ?? item.content_hash ?? null;
    let normalizedContentHash: string | null = item.normalized_content_hash ?? null;
    let hashSemanticsVersion: string | null = item.hash_semantics_version ?? null;
    let sourceDocumentId: string | null = item.source_document_id ?? null;
    let sourceDocumentVersionId: string | null = item.source_document_version_id ?? null;
    try {
      const maximumBytes = Math.min(BACKFILL_CEILINGS.maxBytesPerRecord, remaining);
      retrieved = await retrieveRemoteSource(selected.canonicalUrl, { allowedContentTypes: ["text/html", "text/plain", "text/markdown", "application/pdf"], maximumBytes, timeoutMs: 8_000, maxRedirects: BACKFILL_CEILINGS.maxRedirects, userAgent: "TRACE-KC11C-Preview/1.0" });
      totalBytes += retrieved.byteLength;
      contentHash = retrieved.transportHash;
      const mediaKind: SourceIdentityMediaKind = retrieved.contentType === "text/html"
        ? "html"
        : retrieved.contentType === "text/markdown"
          ? "markdown"
          : retrieved.contentType === "application/pdf"
            ? "pdf"
            : "plain_text";
      const extraction = mediaKind === "html"
        ? extractHtmlDocument(retrieved.body)
        : extractHtmlDocument(`<main><p>${retrieved.body.slice(0, 12000)}</p></main>`);
      normalizedContentHash = (await hashNormalizedSourceContent({ mediaKind, body: retrieved.body, extraction })).normalizedContentHash;
      hashSemanticsVersion = "normalized_content_v1";
      const existingDocument = await env.DB.prepare("SELECT id FROM source_documents WHERE canonical_url = ?").bind(selected.canonicalUrl).first<{ id: string }>();
      sourceDocumentId = existingDocument?.id ?? null;
      const existingVersion = existingDocument ? await env.DB.prepare(`
        SELECT id, hash_semantics_version
        FROM source_document_versions
        WHERE source_document_id = ?
          AND (normalized_content_hash = ? OR (normalized_content_hash IS NULL AND content_hash = ?))
        ORDER BY CASE WHEN normalized_content_hash = ? THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1
      `).bind(existingDocument.id, normalizedContentHash, contentHash, normalizedContentHash).first<{ id: string; hash_semantics_version: string }>() : null;
      if (existingVersion) {
        // Route the unchanged path through capture so the exact transport
        // observation is retained and the idempotent review trigger is replayed
        // after a post-commit failure without creating a new version.
        capture = await captureAdmittedSource(env, {
          canonicalUrl: selected.canonicalUrl,
          retrievedUrl: retrieved.finalUrl,
          contentType: retrieved.contentType,
          body: retrieved.body,
          extraction,
          mediaKind,
          admissionState: "admitted",
          copyrightStorageMode: selected.storageMode,
          httpStatus: retrieved.responseStatus,
          correlationId: batch.correlation_id,
          maximumBytes,
          transportHash: retrieved.transportHash,
        });
        sourceDocumentId = capture.sourceDocumentId;
        sourceDocumentVersionId = capture.sourceDocumentVersionId;
        contentHash = capture.transportHash;
        normalizedContentHash = capture.normalizedContentHash;
        hashSemanticsVersion = capture.hashSemanticsVersion;
        outcome = "unchanged";
        reason = "normalized_content_hash_unchanged";
      }
      else {
        capture = await captureAdmittedSource(env, { canonicalUrl: selected.canonicalUrl, retrievedUrl: retrieved.finalUrl, contentType: retrieved.contentType, body: retrieved.body, extraction, mediaKind, admissionState: "admitted", copyrightStorageMode: selected.storageMode, httpStatus: retrieved.responseStatus, correlationId: batch.correlation_id, maximumBytes, transportHash: retrieved.transportHash });
        sourceDocumentId = capture.sourceDocumentId;
        sourceDocumentVersionId = capture.sourceDocumentVersionId;
        contentHash = capture.contentHash;
        normalizedContentHash = capture.normalizedContentHash;
        hashSemanticsVersion = capture.hashSemanticsVersion;
        outcome = capture.extractionStatus === "metadata_only" ? "metadata_only" : (existingDocument ? "captured_new_version" : "captured_new_document"); reason = "captured_admitted_source";
      }
    } catch (error) {
      // A capture commits deterministic source rows before it invokes the
      // downstream review trigger. Re-read those rows so a post-commit
      // failure remains retryable and truthful without duplicating content.
      if (contentHash) {
        const committed = await env.DB.prepare(`
          SELECT document.id AS source_document_id, version.id AS source_document_version_id,
                 version.normalized_content_hash, version.hash_semantics_version
          FROM source_documents document
          JOIN source_document_versions version ON version.source_document_id = document.id
          WHERE document.canonical_url = ?
            AND (version.normalized_content_hash = ? OR (version.normalized_content_hash IS NULL AND version.content_hash = ?))
          ORDER BY CASE WHEN version.normalized_content_hash = ? THEN 0 ELSE 1 END, version.created_at ASC
          LIMIT 1
        `).bind(selected.canonicalUrl, normalizedContentHash, contentHash, normalizedContentHash).first<{ source_document_id: string; source_document_version_id: string; normalized_content_hash: string | null; hash_semantics_version: string | null }>().catch(() => null);
        if (committed) {
          sourceDocumentId = committed.source_document_id;
          sourceDocumentVersionId = committed.source_document_version_id;
          normalizedContentHash = committed.normalized_content_hash;
          hashSemanticsVersion = committed.hash_semantics_version;
        }
      }
      reason = error instanceof SourceRetrievalError ? error.code : error instanceof Error ? error.message.slice(0, 120) : "capture_failed";
      const retryCount = Number(item.retry_count ?? 0) + 1;
      outcome = error instanceof SourceRetrievalError && ["url_ineligible", "redirect_rejected", "content_type_rejected", "response_status_rejected", "response_too_large"].includes(error.code) ? "excluded" : retryCount >= BACKFILL_CEILINGS.maxRetries ? "failed_terminal" : "failed_retryable";
    }
    await settleItem(env, batch, item, outcome, reason, actor, counters, { sourceDocumentId, sourceDocumentVersionId, httpStatus: retrieved?.responseStatus ?? null, retrievedUrl: retrieved?.finalUrl ?? null, redirectCount: retrieved?.redirectCount ?? null, byteLength: retrieved?.byteLength ?? null, contentHash, transportHash: contentHash, normalizedContentHash, hashSemanticsVersion });
  }
  const remainingRows = await env.DB.prepare("SELECT COUNT(*) AS count FROM knowledge_source_backfill_items WHERE batch_id = ? AND outcome IN ('planned','failed_retryable','failed_terminal')").bind(batchId).first<{ count: number }>();
  const state = Number(remainingRows?.count ?? 0) > 0 ? "partial" : "completed";
  const result = { state, batchId, planHash, mode, ...counters, totalBytes };
  await env.DB.prepare("UPDATE knowledge_source_backfill_batches SET state = ?, updated_at = datetime('now') WHERE id = ? AND state = 'running'").bind(state, batchId).run();
  await env.DB.prepare("UPDATE knowledge_source_backfill_attempts SET state = 'completed', completed_at = datetime('now'), result_json = ? WHERE id = ?").bind(JSON.stringify(result), attemptId).run();
  return result;
}

export async function recoverStaleBackfill(
  env: BackfillEnv,
  batchId: string,
  planHash: string,
  actor: string,
  nowMs = Date.now(),
): Promise<Record<string, unknown>> {
  if (env.TRACE_ENVIRONMENT !== "preview") throw new Error("KC-11C recovery is Preview-only.");
  const batch = await env.DB.prepare(`
    SELECT id, state, plan_hash, plan_json, correlation_id
    FROM knowledge_source_backfill_batches
    WHERE id = ? AND plan_hash = ?
  `).bind(batchId, planHash).first<any>();
  if (!batch) throw new Error("The exact approved plan is required for recovery.");
  if (batch.state !== "running") return { state: "not_recovered", reason: "batch_not_running", batchId };
  await authoritativeSnapshot(env, JSON.parse(batch.plan_json) as BackfillPlan);

  const attempt = await env.DB.prepare(`
    SELECT id, state, started_at
    FROM knowledge_source_backfill_attempts
    WHERE batch_id = ? AND state = 'running'
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `).bind(batchId).first<any>();
  if (!attempt) return { state: "not_recovered", reason: "running_attempt_not_found", batchId };
  const startedAtMs = Date.parse(String(attempt.started_at).replace(" ", "T").replace(/Z?$/, "Z"));
  if (!Number.isFinite(startedAtMs)) throw new Error("The running attempt has an invalid start time.");
  const ageSeconds = Math.floor((nowMs - startedAtMs) / 1000);
  if (ageSeconds < BACKFILL_CEILINGS.staleExecutionSeconds) {
    return {
      state: "locked",
      reason: "running_attempt_recent",
      batchId,
      attemptId: attempt.id,
      ageSeconds: Math.max(0, ageSeconds),
      staleAfterSeconds: BACKFILL_CEILINGS.staleExecutionSeconds,
    };
  }

  const recoveredAt = new Date(nowMs).toISOString();
  const settlement = JSON.stringify({
    error: "stale_execution_abandoned",
    recoveredBy: actor,
    recoveredAt,
    staleAfterSeconds: BACKFILL_CEILINGS.staleExecutionSeconds,
  });
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE knowledge_source_backfill_attempts
      SET state = 'failed', completed_at = ?, result_json = ?
      WHERE id = ? AND batch_id = ? AND state = 'running' AND started_at = ?
    `).bind(recoveredAt, settlement, attempt.id, batchId, attempt.started_at),
    env.DB.prepare(`
      UPDATE knowledge_source_backfill_batches
      SET state = 'partial', updated_at = ?
      WHERE id = ? AND state = 'running'
    `).bind(recoveredAt, batchId),
  ]);
  const attemptWon = Number(results[0]?.meta?.changes ?? 0) === 1;
  const batchWon = Number(results[1]?.meta?.changes ?? 0) === 1;
  if (!attemptWon || !batchWon) {
    return { state: "not_recovered", reason: "recovery_race_lost", batchId, attemptId: attempt.id };
  }
  return {
    state: "recovered",
    batchId,
    attemptId: attempt.id,
    recoveredAt,
    nextState: "partial",
    preservedCompletedItems: true,
  };
}

async function settleItem(env: BackfillEnv, batch: any, item: any, outcome: BackfillOutcome, reason: string, actor: string, counters: Record<string, number>, fields: Record<string, unknown> = {}): Promise<void> {
  counters[outcome] = (counters[outcome] ?? 0) + 1; counters.processed++;
  await env.DB.prepare("UPDATE knowledge_source_backfill_items SET outcome = ?, reason_code = ?, source_document_id = ?, source_document_version_id = ?, http_status = ?, retrieved_url = ?, redirect_count = ?, byte_length = ?, content_hash = ?, transport_hash = ?, normalized_content_hash = ?, hash_semantics_version = ?, retry_count = retry_count + CASE WHEN ? IN ('failed_retryable','failed_terminal') THEN 1 ELSE 0 END, updated_at = datetime('now') WHERE id = ?")
    .bind(outcome, reason, fields.sourceDocumentId ?? null, fields.sourceDocumentVersionId ?? null, fields.httpStatus ?? null, fields.retrievedUrl ?? null, fields.redirectCount ?? null, fields.byteLength ?? null, fields.contentHash ?? null, fields.transportHash ?? null, fields.normalizedContentHash ?? null, fields.hashSemanticsVersion ?? null, outcome, item.id).run();
  await env.DB.prepare("INSERT INTO knowledge_source_backfill_item_events (id, batch_id, item_id, outcome, reason_code, metadata_json, actor, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), batch.id, item.id, outcome, reason, JSON.stringify(fields), actor, batch.correlation_id).run();
}

export function parseBackfillRequest(value: unknown): { inventory?: BackfillInventory; inventorySnapshotId?: string; policyVersion?: string; selection?: BackfillSelection; plan?: BackfillPlan; planHash?: string; batchId?: string; idempotencyKey?: string } | null {
  const body = parseBody(value); if (!body) return null;
  if (body.selection !== undefined && (!parseBody(body.selection) || !Number.isInteger((body.selection as any).limit))) return null;
  return body as any;
}
