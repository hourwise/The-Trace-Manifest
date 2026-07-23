export type KnowledgeExtractionMethod = "deterministic" | "governed_ai";
export type KnowledgeExtractionTask = "extract_source_structure" | "extract_source_claims" | "summarise_source";

export interface ExtractionCacheInput {
  sourceDocumentVersionId: string;
  sourceContentHash: string;
  taskType: KnowledgeExtractionTask;
  extractionMethod: KnowledgeExtractionMethod;
  extractionVersion: string;
  modelProvider: string | null;
  modelIdentifier: string | null;
  promptVersion: string;
  policyVersion: string;
  correlationId: string;
}

export interface ExtractionCacheClaim {
  status: "owned" | "cached" | "in_progress";
  runId: string;
  idempotencyKey: string;
  cachedCostMicrousd: number;
}

export interface ExtractionRunSettlement {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostMicrousd: number;
  actualCostMicrousd: number | null;
  costBasis: "provider_usage" | "estimated" | "none" | "unknown";
  validationState: "valid" | "invalid" | "not_run";
  validation: Record<string, unknown>;
}

/** Claims one source/task/model/prompt/policy identity before any provider call. */
export async function claimKnowledgeExtractionRun(
  db: D1Database,
  input: ExtractionCacheInput,
): Promise<ExtractionCacheClaim> {
  const promptHash = await sha256(input.promptVersion);
  const idempotencyKey = await sha256([
    input.sourceDocumentVersionId,
    input.sourceContentHash,
    input.taskType,
    input.extractionMethod,
    input.extractionVersion,
    input.modelProvider ?? "none",
    input.modelIdentifier ?? "none",
    input.promptVersion,
    promptHash,
    input.policyVersion,
  ].join(":"));
  const runId = `extraction-run-${idempotencyKey}`;
  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO knowledge_extraction_runs
      (id, source_document_version_id, source_content_hash, task_type, extraction_method,
       extraction_version, model_provider, model_identifier, prompt_version, prompt_hash,
       policy_version, usage_json, cost_basis, validation_state, audit_json, correlation_id,
       idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 'pending', ?, ?, ?)
  `).bind(
    runId, input.sourceDocumentVersionId, input.sourceContentHash, input.taskType,
    input.extractionMethod, input.extractionVersion, input.modelProvider, input.modelIdentifier,
    input.promptVersion, promptHash, input.policyVersion,
    JSON.stringify({ provider: input.modelProvider ?? "none", inputTokens: 0, outputTokens: 0, cachedTokens: 0 }),
    JSON.stringify({ boundary: "knowledge_extraction", actor: "system", sourceVersion: input.sourceDocumentVersionId }),
    input.correlationId, idempotencyKey,
  ).run();
  if (Number(inserted.meta.changes ?? 0) === 1) {
    return { status: "owned", runId, idempotencyKey, cachedCostMicrousd: 0 };
  }

  const existing = await db.prepare(`
    SELECT state, actual_cost_microusd FROM knowledge_extraction_runs WHERE id = ?
  `).bind(runId).first<{ state: string; actual_cost_microusd: number | null }>();
  if (existing?.state === "completed") {
    return { status: "cached", runId, idempotencyKey, cachedCostMicrousd: existing.actual_cost_microusd ?? 0 };
  }
  if (existing?.state === "running") {
    return { status: "in_progress", runId, idempotencyKey, cachedCostMicrousd: 0 };
  }
  await db.prepare(`
    UPDATE knowledge_extraction_runs
    SET state = 'running', validation_state = 'pending', error_code = NULL,
        completed_at = NULL, updated_at = datetime('now')
    WHERE id = ? AND state IN ('failed','skipped')
  `).bind(runId).run();
  return { status: "owned", runId, idempotencyKey, cachedCostMicrousd: 0 };
}

/** Settles one owned run after validation; this is the only path that records AI cost. */
export async function settleKnowledgeExtractionRun(
  db: D1Database,
  runId: string,
  settlement: ExtractionRunSettlement,
): Promise<void> {
  if (!Number.isInteger(settlement.inputTokens) || settlement.inputTokens < 0
    || !Number.isInteger(settlement.outputTokens) || settlement.outputTokens < 0
    || !Number.isInteger(settlement.cachedTokens) || settlement.cachedTokens < 0
    || !Number.isInteger(settlement.estimatedCostMicrousd) || settlement.estimatedCostMicrousd < 0
    || (settlement.actualCostMicrousd !== null
      && (!Number.isInteger(settlement.actualCostMicrousd) || settlement.actualCostMicrousd < 0))
    || (settlement.costBasis === "none" && settlement.actualCostMicrousd !== null)) {
    throw new Error("Invalid extraction usage settlement.");
  }
  const updated = await db.prepare(`
    UPDATE knowledge_extraction_runs
    SET usage_json = ?, input_tokens = ?, output_tokens = ?, cached_tokens = ?,
        estimated_cost_microusd = ?, actual_cost_microusd = ?, cost_basis = ?,
        validation_state = ?, validation_json = ?, state = 'completed',
        completed_at = datetime('now'), updated_at = datetime('now'), error_code = NULL
    WHERE id = ? AND state = 'running'
  `).bind(
    JSON.stringify({ inputTokens: settlement.inputTokens, outputTokens: settlement.outputTokens, cachedTokens: settlement.cachedTokens }),
    settlement.inputTokens, settlement.outputTokens, settlement.cachedTokens,
    settlement.estimatedCostMicrousd, settlement.actualCostMicrousd, settlement.costBasis,
    settlement.validationState, JSON.stringify(settlement.validation), runId,
  ).run();
  if (Number(updated.meta.changes ?? 0) !== 1) throw new Error("Extraction run is not owned or has already settled.");
}

export async function failKnowledgeExtractionRun(db: D1Database, runId: string, errorCode: string): Promise<void> {
  const safeCode = /^[a-z0-9_:-]{1,80}$/.test(errorCode) ? errorCode : "extraction_failed";
  await db.prepare(`
    UPDATE knowledge_extraction_runs
    SET state = 'failed', validation_state = 'invalid', error_code = ?, updated_at = datetime('now')
    WHERE id = ? AND state = 'running'
  `).bind(safeCode, runId).run();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
