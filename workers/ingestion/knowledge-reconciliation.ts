// KC-02H: retry-safe reconciliation for records that span D1, R2, and Vectorize.
// This module is deliberately not a Queue consumer yet. KC-03 owns source capture;
// KC-09 owns embedding/index production. It provides the auditable repair primitive
// those later tasks will call after their respective admission and policy gates.

type OperationKind = "r2_put" | "r2_delete" | "vector_upsert" | "vector_delete";
type OperationState = "pending" | "running" | "failed" | "reconciliation_required";
type ReconciliationOutcome = "completed" | "deferred" | "repair_required" | "failed";
type ReconciliationTrigger = "manual" | "queue" | "scheduled";

interface IndexOperation {
  id: string;
  operation_kind: OperationKind;
  subject_type: "source_document_version" | "source_chunk";
  subject_id: string;
  desired_content_hash: string | null;
  state: OperationState;
}

interface SourceDocumentVersion {
  id: string;
  content_hash: string;
  r2_original_key: string | null;
  r2_extracted_key: string | null;
}

interface VectorDeleteIndex {
  deleteByIds(ids: string[]): Promise<{ mutationId: string }>;
  getByIds(ids: string[]): Promise<Array<{ id: string }>>;
}

export interface KnowledgeReconciliationEnvironment {
  DB: D1Database;
  RAW_STORE: Pick<R2Bucket, "head" | "delete">;
  // Intentionally absent from the deployed Worker until the KC-09 embedding gate.
  KNOWLEDGE_VECTOR_INDEX?: VectorDeleteIndex;
}

export interface ReconciliationOptions {
  limit?: number;
  trigger?: ReconciliationTrigger;
}

export interface ReconciliationSummary {
  completed: number;
  deferred: number;
  repairRequired: number;
  failed: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
}

async function recordRun(
  env: KnowledgeReconciliationEnvironment,
  operationId: string,
  trigger: ReconciliationTrigger,
  outcome: ReconciliationOutcome,
  detailCode: string,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO knowledge_reconciliation_runs (id, operation_id, trigger_kind, outcome, detail_code)
    VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), operationId, trigger, outcome, detailCode).run();
}

async function markRepairRequired(
  env: KnowledgeReconciliationEnvironment,
  operation: IndexOperation,
  trigger: ReconciliationTrigger,
  detailCode: string,
): Promise<ReconciliationOutcome> {
  await env.DB.prepare(`
    UPDATE knowledge_index_operations
    SET state = 'reconciliation_required', last_error = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(detailCode, operation.id).run();
  await recordRun(env, operation.id, trigger, "repair_required", detailCode);
  return "repair_required";
}

async function markCompleted(
  env: KnowledgeReconciliationEnvironment,
  operation: IndexOperation,
  trigger: ReconciliationTrigger,
  detailCode: string,
): Promise<ReconciliationOutcome> {
  await env.DB.prepare(`
    UPDATE knowledge_index_operations
    SET state = 'completed', last_error = NULL, completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).bind(operation.id).run();
  await recordRun(env, operation.id, trigger, "completed", detailCode);
  return "completed";
}

async function reconcileR2Put(
  env: KnowledgeReconciliationEnvironment,
  operation: IndexOperation,
  trigger: ReconciliationTrigger,
): Promise<ReconciliationOutcome> {
  if (operation.subject_type !== "source_document_version") {
    return markRepairRequired(env, operation, trigger, "r2_put_subject_invalid");
  }
  const version = await env.DB.prepare(`
    SELECT id, content_hash, r2_original_key, r2_extracted_key
    FROM source_document_versions WHERE id = ?
  `).bind(operation.subject_id).first<SourceDocumentVersion>();
  if (!version || !version.r2_original_key) {
    return markRepairRequired(env, operation, trigger, "r2_put_target_missing");
  }
  if (operation.desired_content_hash && version.content_hash !== operation.desired_content_hash) {
    return markRepairRequired(env, operation, trigger, "r2_put_hash_mismatch");
  }

  const object = await env.RAW_STORE.head(version.r2_original_key);
  if (!object) return markRepairRequired(env, operation, trigger, "r2_object_missing");
  const storedHash = object.customMetadata?.content_hash;
  if (storedHash && operation.desired_content_hash && storedHash !== operation.desired_content_hash) {
    return markRepairRequired(env, operation, trigger, "r2_object_hash_mismatch");
  }
  if (version.r2_extracted_key) {
    const extractedObject = await env.RAW_STORE.head(version.r2_extracted_key);
    if (!extractedObject) return markRepairRequired(env, operation, trigger, "r2_extraction_missing");
    const sourceHash = extractedObject.customMetadata?.source_content_hash;
    if (sourceHash && operation.desired_content_hash && sourceHash !== operation.desired_content_hash) {
      return markRepairRequired(env, operation, trigger, "r2_extraction_hash_mismatch");
    }
  }

  await env.DB.prepare(`
    UPDATE source_document_versions
    SET extraction_status = CASE WHEN extraction_status = 'pending' THEN 'captured' ELSE extraction_status END
    WHERE id = ?
  `).bind(version.id).run();
  return markCompleted(env, operation, trigger, "r2_object_attached");
}

async function reconcileVectorDelete(
  env: KnowledgeReconciliationEnvironment,
  operation: IndexOperation,
  trigger: ReconciliationTrigger,
): Promise<ReconciliationOutcome> {
  if (operation.subject_type !== "source_chunk") {
    return markRepairRequired(env, operation, trigger, "vector_delete_subject_invalid");
  }
  const index = env.KNOWLEDGE_VECTOR_INDEX;
  if (!index) return markRepairRequired(env, operation, trigger, "vector_binding_unavailable");

  const receipt = await env.DB.prepare(`
    SELECT remote_operation_id FROM knowledge_index_operation_receipts WHERE operation_id = ?
  `).bind(operation.id).first<{ remote_operation_id: string }>();

  if (!receipt) {
    const mutation = await index.deleteByIds([operation.subject_id]);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO knowledge_index_operation_receipts (operation_id, remote_operation_id)
        VALUES (?, ?)
      `).bind(operation.id, mutation.mutationId),
      env.DB.prepare(`
        UPDATE knowledge_index_operations
        SET state = 'running', last_error = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).bind(operation.id),
    ]);
    await recordRun(env, operation.id, trigger, "deferred", "vector_delete_submitted");
    return "deferred";
  }

  const remainingVectors = await index.getByIds([operation.subject_id]);
  if (remainingVectors.some((vector) => vector.id === operation.subject_id)) {
    await recordRun(env, operation.id, trigger, "deferred", "vector_delete_awaiting_confirmation");
    return "deferred";
  }

  await env.DB.prepare(`
    UPDATE source_chunks SET embedding_state = 'deleted' WHERE id = ?
  `).bind(operation.subject_id).run();
  await env.DB.prepare(`
    UPDATE knowledge_index_operation_receipts SET confirmed_at = datetime('now') WHERE operation_id = ?
  `).bind(operation.id).run();
  return markCompleted(env, operation, trigger, "vector_delete_confirmed");
}

async function reconcileOperation(
  env: KnowledgeReconciliationEnvironment,
  operation: IndexOperation,
  trigger: ReconciliationTrigger,
): Promise<ReconciliationOutcome> {
  try {
    if (operation.operation_kind === "r2_put") return reconcileR2Put(env, operation, trigger);
    if (operation.operation_kind === "vector_delete") return reconcileVectorDelete(env, operation, trigger);
    return markRepairRequired(env, operation, trigger, `${operation.operation_kind}_not_enabled`);
  } catch {
    await env.DB.prepare(`
      UPDATE knowledge_index_operations
      SET state = 'failed', last_error = 'reconciliation_storage_error', updated_at = datetime('now')
      WHERE id = ?
    `).bind(operation.id).run();
    await recordRun(env, operation.id, trigger, "failed", "reconciliation_storage_error");
    return "failed";
  }
}

export async function reconcileKnowledgeIndexOperations(
  env: KnowledgeReconciliationEnvironment,
  options: ReconciliationOptions = {},
): Promise<ReconciliationSummary> {
  const trigger = options.trigger ?? "manual";
  const limit = boundedLimit(options.limit);
  const candidates = await env.DB.prepare(`
    SELECT id, operation_kind, subject_type, subject_id, desired_content_hash, state
    FROM knowledge_index_operations
    WHERE state IN ('pending', 'failed', 'reconciliation_required')
       OR (state = 'running' AND operation_kind = 'vector_delete')
    ORDER BY updated_at ASC
    LIMIT ?
  `).bind(limit).all<IndexOperation>();
  const summary: ReconciliationSummary = { completed: 0, deferred: 0, repairRequired: 0, failed: 0 };

  for (const operation of candidates.results) {
    const claimed = await env.DB.prepare(`
      UPDATE knowledge_index_operations
      SET state = 'running', attempt_count = attempt_count + 1, updated_at = datetime('now')
      WHERE id = ? AND state IN ('pending', 'failed', 'reconciliation_required')
    `).bind(operation.id).run();
    if (operation.state !== "running" && Number(claimed.meta.changes ?? 0) !== 1) continue;

    const outcome = await reconcileOperation(env, operation, trigger);
    if (outcome === "completed") summary.completed++;
    else if (outcome === "deferred") summary.deferred++;
    else if (outcome === "repair_required") summary.repairRequired++;
    else summary.failed++;
  }
  return summary;
}
