/**
 * KC-03G: explicit source/capture state semantics. Retrieval, extraction and
 * storage are intentionally separate from admission; none of these states can
 * establish evidentiary trust or publication eligibility.
 */

export type SourceRetrievalState = "available" | "unavailable" | "paywalled" | "policy_restricted";
export type SourceExtractionState = "pending" | "extracted" | "metadata_only" | "unsupported" | "extraction_failed";
export type SourceStorageState = "not_stored" | "private_pending" | "private_stored" | "metadata_only" | "reconciliation_required";
export type SourceCaptureState = "not_attempted" | "captured" | "metadata_only" | "unsupported" | "extraction_failed";

/**
 * PDF v1 has no approved parser. A permitted artifact retained under a
 * future-extraction storage policy therefore stays in the existing durable
 * `pending` state, with this reason distinguishing it from an unattempted
 * legacy/default row. Metadata-only policy is terminal and never queued.
 */
export function pdfExtractionStateForStorageMode(storageMode: "metadata_only" | "short_excerpt" | "private_full_text" | "editor_supplied_document" | "prohibited"): "pending" | "metadata_only" {
  return storageMode === "private_full_text" || storageMode === "editor_supplied_document" ? "pending" : "metadata_only";
}

export interface GovernedSourceState {
  retrievalState: SourceRetrievalState;
  extractionState: SourceExtractionState;
  storageState: SourceStorageState;
  reason: string | null;
  diagnostics: Record<string, unknown>;
  retryable: boolean;
}

export const NON_EXTRACTABLE_SOURCE_STATES = new Set<SourceExtractionState>([
  "pending", "metadata_only", "unsupported", "extraction_failed",
]);

export function sourceStateAllowsClaimExtraction(state: Pick<GovernedSourceState, "retrievalState" | "extractionState" | "storageState">): boolean {
  return state.retrievalState === "available"
    && state.extractionState === "extracted"
    && (state.storageState === "private_stored" || state.storageState === "not_stored");
}

export function sourceStateAllowsExternalEvidence(state: Pick<GovernedSourceState, "retrievalState" | "extractionState">): boolean {
  return state.retrievalState === "available" && state.extractionState === "extracted";
}

export function legacyExtractionStatusFor(state: SourceExtractionState): "pending" | "captured" | "metadata_only" | "unsupported" | "restricted" | "paywalled" | "failed" | "extracted" {
  switch (state) {
    case "extracted": return "captured";
    case "metadata_only": return "metadata_only";
    case "unsupported": return "unsupported";
    case "extraction_failed": return "failed";
    default: return "pending";
  }
}

export async function recordSourceRetrievalState(
  db: D1Database,
  input: {
    sourceDocumentId: string;
    state: Exclude<SourceRetrievalState, "available">;
    reason: string;
    diagnostics?: Record<string, unknown>;
    retryable: boolean;
  },
): Promise<void> {
  await db.prepare(`
    UPDATE source_documents
    SET retrieval_state = ?, retrieval_reason = ?, retrieval_diagnostics_json = ?,
        retrieval_retryable = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    input.state,
    input.reason,
    JSON.stringify(input.diagnostics ?? {}),
    input.retryable ? 1 : 0,
    input.sourceDocumentId,
  ).run();
}

export async function recordSourceCaptureState(
  db: D1Database,
  input: {
    sourceDocumentId: string;
    state: Exclude<SourceCaptureState, "not_attempted">;
    reason: string;
    diagnostics?: Record<string, unknown>;
    retryable: boolean;
  },
): Promise<void> {
  await db.prepare(`
    UPDATE source_documents
    SET capture_state = ?, capture_reason = ?, capture_diagnostics_json = ?,
        capture_retryable = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    input.state,
    input.reason,
    JSON.stringify(input.diagnostics ?? {}),
    input.retryable ? 1 : 0,
    input.sourceDocumentId,
  ).run();
}

export async function recordVersionExtractionState(
  db: D1Database,
  input: {
    sourceDocumentVersionId: string;
    state: Exclude<SourceExtractionState, "pending">;
    storageState: SourceStorageState;
    reason: string;
    diagnostics?: Record<string, unknown>;
    retryable: boolean;
  },
): Promise<void> {
  await db.prepare(`
    UPDATE source_document_versions
    SET extraction_status = ?, extraction_state = ?, storage_state = ?, state_reason = ?,
        state_diagnostics_json = ?, processing_retryable = ?
    WHERE id = ?
  `).bind(
    legacyExtractionStatusFor(input.state),
    input.state,
    input.storageState,
    input.reason,
    JSON.stringify(input.diagnostics ?? {}),
    input.retryable ? 1 : 0,
    input.sourceDocumentVersionId,
  ).run();
}

export async function recordVersionExtractionPendingState(
  db: D1Database,
  input: {
    sourceDocumentVersionId: string;
    storageState: SourceStorageState;
    reason: string;
    diagnostics?: Record<string, unknown>;
    retryable: boolean;
  },
): Promise<void> {
  await db.prepare(`
    UPDATE source_document_versions
    SET extraction_status = 'pending', extraction_state = 'pending', storage_state = ?, state_reason = ?,
        state_diagnostics_json = ?, processing_retryable = ?
    WHERE id = ?
  `).bind(
    input.storageState,
    input.reason,
    JSON.stringify(input.diagnostics ?? {}),
    input.retryable ? 1 : 0,
    input.sourceDocumentVersionId,
  ).run();
}
