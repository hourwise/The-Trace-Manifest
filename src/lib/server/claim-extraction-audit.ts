export const CLAIM_EXTRACTION_RUN_LIST_LIMIT = 50;
export const CLAIM_EXTRACTION_RUN_ITEM_LIMIT = 50;
export const CLAIM_EXTRACTION_RUN_EFFECT_LIMIT = 1000;

export type ClaimExtractionRunTrigger = "manual_admin" | "scheduler";
export type ClaimExtractionRunStatus =
  | "running"
  | "completed"
  | "completed_with_failures"
  | "failed"
  | "interrupted";
export type ClaimExtractionItemOutcome = "pending" | "extracted" | "no_claims" | "failed";
export type ClaimExtractionEffectOutcome = "inserted" | "reused" | "failed";

export interface ClaimExtractionRunSummary {
  runId: string;
  trigger: ClaimExtractionRunTrigger;
  algorithmVersion: string;
  requestId: string | null;
  operatorEmail: string | null;
  operatorRole: "reader" | "publisher" | null;
  startedAt: string;
  completedAt: string | null;
  status: ClaimExtractionRunStatus;
  selectedCount: number;
  processedCount: number;
  noClaimCount: number;
  failedCount: number;
  extractedClaimCount: number;
  newAssertionCount: number;
  canonicalWriteSuccessCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

export interface ClaimExtractionRunListResponse {
  runs: ClaimExtractionRunSummary[];
  limit: number;
  truncated: boolean;
}

export interface ClaimExtractionRunEffect {
  effectId: number;
  effectOrdinal: number;
  claimText: string;
  claimClass: string;
  claimDomain: string;
  attemptOutcome: ClaimExtractionEffectOutcome;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  canonicalClaimId: string | null;
  assertionId: string | null;
  canonicalClaimInserted: boolean | null;
  assertionInserted: boolean | null;
  storyClaimInserted: boolean | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
}

export interface ClaimExtractionRunItem {
  runItemId: number;
  feedItemId: number;
  ordinal: number;
  selectedAt: string;
  outcome: ClaimExtractionItemOutcome;
  pipelineStageId: number | null;
  feedItemTitle: string;
  feedItemUrl: string;
  sourceName: string | null;
  extractedClaimCount: number;
  newAssertionCount: number;
  canonicalWriteSuccessCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  completedAt: string | null;
  effects: ClaimExtractionRunEffect[];
}

export interface ClaimExtractionReconciledCounters {
  selectedCount: number;
  processedCount: number;
  noClaimCount: number;
  failedCount: number;
  extractedClaimCount: number;
  newAssertionCount: number;
  canonicalWriteSuccessCount: number;
  matchesStoredCounters: boolean;
}

export interface ClaimExtractionRunDetailResponse {
  run: ClaimExtractionRunSummary;
  items: ClaimExtractionRunItem[];
  reconciliation: ClaimExtractionReconciledCounters;
  itemLimit: number;
  effectLimit: number;
  itemsTruncated: boolean;
  effectsTruncated: boolean;
}

export class ClaimExtractionAuditError extends Error {
  constructor(readonly code: "invalid_run_id" | "run_not_found") {
    super(code);
    this.name = "ClaimExtractionAuditError";
  }
}

interface RunRow {
  id: string;
  trigger: ClaimExtractionRunTrigger;
  algorithm_version: string;
  request_id: string | null;
  operator_email: string | null;
  operator_role: "reader" | "publisher" | null;
  started_at: string;
  completed_at: string | null;
  status: ClaimExtractionRunStatus;
  selected_count: number;
  processed_count: number;
  no_claim_count: number;
  failed_count: number;
  extracted_claim_count: number;
  new_assertion_count: number;
  canonical_write_success_count: number;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
}

function mapRun(row: RunRow): ClaimExtractionRunSummary {
  return {
    runId: row.id,
    trigger: row.trigger,
    algorithmVersion: row.algorithm_version,
    requestId: row.request_id,
    operatorEmail: row.operator_email,
    operatorRole: row.operator_role,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    selectedCount: Number(row.selected_count),
    processedCount: Number(row.processed_count),
    noClaimCount: Number(row.no_claim_count),
    failedCount: Number(row.failed_count),
    extractedClaimCount: Number(row.extracted_claim_count),
    newAssertionCount: Number(row.new_assertion_count),
    canonicalWriteSuccessCount: Number(row.canonical_write_success_count),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    createdAt: row.created_at,
  };
}

function validRunId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

async function readRun(db: D1Database, runId: string): Promise<ClaimExtractionRunSummary | null> {
  const row = await db.prepare(`
    SELECT id, trigger, algorithm_version, request_id, operator_email, operator_role,
           started_at, completed_at, status, selected_count, processed_count,
           no_claim_count, failed_count, extracted_claim_count, new_assertion_count,
           canonical_write_success_count, failure_code, failure_message, created_at
    FROM claim_extraction_runs
    WHERE id = ?
  `).bind(runId).first<RunRow>();
  return row ? mapRun(row) : null;
}

export async function listClaimExtractionRuns(db: D1Database): Promise<ClaimExtractionRunListResponse> {
  const { results } = await db.prepare(`
    SELECT id, trigger, algorithm_version, request_id, operator_email, operator_role,
           started_at, completed_at, status, selected_count, processed_count,
           no_claim_count, failed_count, extracted_claim_count, new_assertion_count,
           canonical_write_success_count, failure_code, failure_message, created_at
    FROM claim_extraction_runs
    ORDER BY started_at DESC, id DESC
    LIMIT ?
  `).bind(CLAIM_EXTRACTION_RUN_LIST_LIMIT + 1).all<RunRow>();
  const rows = results ?? [];
  return {
    runs: rows.slice(0, CLAIM_EXTRACTION_RUN_LIST_LIMIT).map(mapRun),
    limit: CLAIM_EXTRACTION_RUN_LIST_LIMIT,
    truncated: rows.length > CLAIM_EXTRACTION_RUN_LIST_LIMIT,
  };
}

interface ItemRow {
  run_item_id: number;
  feed_item_id: number;
  ordinal: number;
  selected_at: string;
  outcome: ClaimExtractionItemOutcome;
  pipeline_stage_id: number | null;
  feed_item_title: string;
  feed_item_url: string;
  source_name: string | null;
  extracted_claim_count: number;
  new_assertion_count: number;
  canonical_write_success_count: number;
  failure_code: string | null;
  failure_message: string | null;
  completed_at: string | null;
}

interface EffectRow {
  effect_id: number;
  run_item_id: number;
  effect_ordinal: number;
  claim_text: string;
  claim_class: string;
  claim_domain: string;
  attempt_outcome: ClaimExtractionEffectOutcome;
  source_document_id: string | null;
  source_document_version_id: string | null;
  canonical_claim_id: string | null;
  assertion_id: string | null;
  canonical_claim_inserted: number | null;
  assertion_inserted: number | null;
  story_claim_inserted: number | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
}

function nullableBoolean(value: number | null): boolean | null {
  return value === null ? null : value === 1;
}

function mapEffect(row: EffectRow): ClaimExtractionRunEffect {
  return {
    effectId: Number(row.effect_id),
    effectOrdinal: Number(row.effect_ordinal),
    claimText: row.claim_text,
    claimClass: row.claim_class,
    claimDomain: row.claim_domain,
    attemptOutcome: row.attempt_outcome,
    sourceDocumentId: row.source_document_id,
    sourceDocumentVersionId: row.source_document_version_id,
    canonicalClaimId: row.canonical_claim_id,
    assertionId: row.assertion_id,
    canonicalClaimInserted: nullableBoolean(row.canonical_claim_inserted),
    assertionInserted: nullableBoolean(row.assertion_inserted),
    storyClaimInserted: nullableBoolean(row.story_claim_inserted),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    createdAt: row.created_at,
  };
}

function deriveCounters(
  items: ClaimExtractionRunItem[],
  run: ClaimExtractionRunSummary,
): ClaimExtractionReconciledCounters {
  const effects = items.flatMap((item) => item.effects);
  const counters = {
    selectedCount: items.length,
    processedCount: items.filter((item) => item.outcome !== "pending").length,
    noClaimCount: items.filter((item) => item.outcome === "no_claims").length,
    failedCount: items.filter((item) => item.outcome === "failed").length,
    extractedClaimCount: items.reduce((sum, item) => sum + item.extractedClaimCount, 0),
    newAssertionCount: effects.filter((effect) => effect.assertionInserted === true).length,
    canonicalWriteSuccessCount: effects.filter((effect) => effect.attemptOutcome !== "failed").length,
  };
  return {
    ...counters,
    matchesStoredCounters: counters.selectedCount === run.selectedCount
      && counters.processedCount === run.processedCount
      && counters.noClaimCount === run.noClaimCount
      && counters.failedCount === run.failedCount
      && counters.extractedClaimCount === run.extractedClaimCount
      && counters.newAssertionCount === run.newAssertionCount
      && counters.canonicalWriteSuccessCount === run.canonicalWriteSuccessCount,
  };
}

export async function getClaimExtractionRun(
  db: D1Database,
  requestedRunId: string,
): Promise<ClaimExtractionRunDetailResponse> {
  const runId = requestedRunId.trim();
  if (!validRunId(runId)) throw new ClaimExtractionAuditError("invalid_run_id");
  const run = await readRun(db, runId);
  if (!run) throw new ClaimExtractionAuditError("run_not_found");

  const itemResult = await db.prepare(`
    SELECT ri.id AS run_item_id, ri.feed_item_id, ri.ordinal, ri.selected_at,
           ri.outcome, ri.pipeline_stage_id, fi.title AS feed_item_title,
           fi.url AS feed_item_url, s.name AS source_name,
           ri.extracted_claim_count, ri.new_assertion_count,
           ri.canonical_write_success_count, ri.failure_code,
           ri.failure_message, ri.completed_at
    FROM claim_extraction_run_items ri
    JOIN feed_items fi ON fi.id = ri.feed_item_id
    LEFT JOIN sources s ON s.id = fi.source_id
    WHERE ri.run_id = ?
    ORDER BY ri.ordinal ASC
    LIMIT ?
  `).bind(runId, CLAIM_EXTRACTION_RUN_ITEM_LIMIT + 1).all<ItemRow>();
  const itemRows = itemResult.results ?? [];
  const items: ClaimExtractionRunItem[] = itemRows.slice(0, CLAIM_EXTRACTION_RUN_ITEM_LIMIT).map((row) => ({
    runItemId: Number(row.run_item_id),
    feedItemId: Number(row.feed_item_id),
    ordinal: Number(row.ordinal),
    selectedAt: row.selected_at,
    outcome: row.outcome,
    pipelineStageId: row.pipeline_stage_id === null ? null : Number(row.pipeline_stage_id),
    feedItemTitle: row.feed_item_title,
    feedItemUrl: row.feed_item_url,
    sourceName: row.source_name,
    extractedClaimCount: Number(row.extracted_claim_count),
    newAssertionCount: Number(row.new_assertion_count),
    canonicalWriteSuccessCount: Number(row.canonical_write_success_count),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    completedAt: row.completed_at,
    effects: [],
  }));

  const effectResult = await db.prepare(`
    SELECT e.id AS effect_id, e.run_item_id, e.effect_ordinal, e.claim_text, e.claim_class,
           e.claim_domain, e.attempt_outcome, e.source_document_id,
           e.source_document_version_id, e.canonical_claim_id, e.assertion_id,
           e.canonical_claim_inserted, e.assertion_inserted, e.story_claim_inserted,
           e.failure_code, e.failure_message, e.created_at
    FROM claim_extraction_run_effects e
    JOIN claim_extraction_run_items ri ON ri.id = e.run_item_id
    WHERE e.run_id = ?
    ORDER BY ri.ordinal ASC, e.effect_ordinal ASC
    LIMIT ?
  `).bind(runId, CLAIM_EXTRACTION_RUN_EFFECT_LIMIT + 1).all<EffectRow>();
  const effectRows = effectResult.results ?? [];
  const effectsByItem = new Map<number, ClaimExtractionRunEffect[]>();
  for (const row of effectRows.slice(0, CLAIM_EXTRACTION_RUN_EFFECT_LIMIT)) {
    const effects = effectsByItem.get(Number(row.run_item_id)) ?? [];
    effects.push(mapEffect(row));
    effectsByItem.set(Number(row.run_item_id), effects);
  }
  for (const item of items) item.effects = effectsByItem.get(item.runItemId) ?? [];

  return {
    run,
    items,
    reconciliation: deriveCounters(items, run),
    itemLimit: CLAIM_EXTRACTION_RUN_ITEM_LIMIT,
    effectLimit: CLAIM_EXTRACTION_RUN_EFFECT_LIMIT,
    itemsTruncated: itemRows.length > CLAIM_EXTRACTION_RUN_ITEM_LIMIT,
    effectsTruncated: effectRows.length > CLAIM_EXTRACTION_RUN_EFFECT_LIMIT,
  };
}
