/**
 * TRACE V1 Mission 2 bounded activation executor.
 *
 * This module is intentionally not imported by a Worker, Pages route, or
 * scheduler.  It accepts a narrow governed-operations port, never arbitrary
 * SQL/URLs, and refuses Preview/Production execution in this candidate.
 */

import { fingerprint } from "./trace-v1-m1";
import {
  buildTraceV1M2FinalManifest,
  type TraceV1M2FinalManifest,
  type TraceV1M2FinalManifestItem,
} from "./trace-v1-m2-final-manifest";
import { hashTransportBody } from "./source-version-identity";
import { normaliseSourceUrl } from "./source-capture";
import {
  planTraceV1M2Activation,
  verifyTraceV1M2SourceIdentity,
  type TraceV1M2EvidenceFixture,
  type TraceV1M2ItemPlan,
  type TraceV1M2Plan,
} from "./trace-v1-m2-planner";
import type { CompatibilityPreflightResult } from "./trace-v1-m2-contract";

export const TRACE_V1_M2_EXECUTOR_VERSION = "trace-v1-m2-bounded-executor-v1" as const;
export type TraceV1M2ExecutionEnvironment = "LOCAL_TEST" | "PREVIEW" | "PRODUCTION";
export type TraceV1M2ExecutionMode = "plan" | "dry_run" | "execute";

export const TRACE_V1_M2_EXECUTOR_BOUNDS = Object.freeze({
  maxItemsPerInvocation: 3,
  maxSourceCaptures: 3,
  maxClaims: 12,
  maxAssertions: 24,
  maxChunks: 24,
  maxKnowledgeMappings: 3,
});

const TRACE_V1_M2_EXECUTION_ENVIRONMENTS = Object.freeze(["LOCAL_TEST", "PREVIEW", "PRODUCTION"] as const);
const TRACE_V1_M2_EXECUTION_MODES = Object.freeze(["plan", "dry_run", "execute"] as const);

export interface TraceV1M2OperationCost {
  sourceCaptures: number;
  claims: number;
  assertions: number;
  chunks: number;
  knowledgeMappings: number;
  selectedItems: number;
}

export type TraceV1M2OperationBudget = TraceV1M2OperationCost;

export interface TraceV1M2SourceIdentityProof {
  sourceId: number;
  canonicalUrl: string;
  connector: string;
  normalizedUrlHashInput: string;
  urlHash: string;
  basis: "D1_CANONICAL_SOURCE_RECORD" | "LOCAL_FIXTURE";
}

export interface TraceV1M2PreparedItem {
  identity: TraceV1M2SourceIdentityProof;
  evidence: TraceV1M2EvidenceFixture;
  cost: TraceV1M2OperationCost;
}

export interface TraceV1M2CurrentIdentity {
  identity: TraceV1M2SourceIdentityProof;
  evidence: TraceV1M2EvidenceFixture;
}

export interface TraceV1M2BoundedPreparationFailure {
  reasonCode: "BOUNDED_WORK_LIMIT_EXCEEDED";
  detail: string;
  cost: TraceV1M2OperationCost;
}

export type TraceV1M2GovernedPreparationResult =
  | TraceV1M2PreparedItem
  | TraceV1M2BoundedPreparationFailure
  | null;

export interface TraceV1M2ReceiptIdentity {
  sourceId: number | null;
  canonicalSourceUrl: string | null;
  canonicalSourceUrlHash: string | null;
  connector: string | null;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  contentHash: string | null;
  transportHash: string | null;
  normalizedContentHash: string | null;
  hashSemanticsVersion: string | null;
}

export interface TraceV1M2GovernedOperations {
  /** This port represents existing governed capture/review paths; it is not SQL or a network callback. */
  resolveCurrentIdentity(item: TraceV1M2FinalManifestItem): Promise<TraceV1M2CurrentIdentity | null>;
  prepareItem(item: TraceV1M2FinalManifestItem, budget: TraceV1M2OperationBudget): Promise<TraceV1M2GovernedPreparationResult>;
}

export type TraceV1M2ReceiptOutcome = "completed" | "replayed" | "blocked" | "failed";

export interface TraceV1M2ActivationReceipt {
  operationKey: string;
  manifestId: string;
  manifestHash: string;
  itemType: "story" | "knowledge";
  itemId: string;
  stage: string;
  environment: TraceV1M2ExecutionEnvironment;
  sourceId: number | null;
  canonicalSourceUrl: string | null;
  canonicalSourceUrlHash: string | null;
  connector: string | null;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  contentHash: string | null;
  transportHash: string | null;
  normalizedContentHash: string | null;
  hashSemanticsVersion: string | null;
  outcome: TraceV1M2ReceiptOutcome;
  reasonCode: string;
  detail: string;
  receiptFingerprint: string;
  createdAt: string;
}

export interface TraceV1M2ReceiptStore {
  get(operationKey: string): Promise<TraceV1M2ActivationReceipt | null>;
  put(receipt: TraceV1M2ActivationReceipt): Promise<void>;
}

function resumeOperationKey(baseOperationKey: string): string {
  return `${baseOperationKey}:resume`;
}

function isResumeOperationKey(value: string): boolean {
  return value.endsWith(":resume");
}

function isResumableReceipt(receipt: TraceV1M2ActivationReceipt): boolean {
  return receipt.outcome === "blocked";
}

export class MemoryTraceV1M2ReceiptStore implements TraceV1M2ReceiptStore {
  private readonly receipts = new Map<string, TraceV1M2ActivationReceipt>();

  async get(operationKey: string): Promise<TraceV1M2ActivationReceipt | null> {
    if (isResumeOperationKey(operationKey)) return this.receipts.get(operationKey) ?? null;
    return this.receipts.get(resumeOperationKey(operationKey)) ?? this.receipts.get(operationKey) ?? null;
  }

  async put(receipt: TraceV1M2ActivationReceipt): Promise<void> {
    const existing = this.receipts.get(receipt.operationKey);
    if (existing && existing.receiptFingerprint !== receipt.receiptFingerprint
      && !(isResumeOperationKey(receipt.operationKey) && isResumableReceipt(existing))) {
      throw new Error("TRACE_V1_M2_REPLAY_CONFLICT");
    }
    this.receipts.set(receipt.operationKey, existing?.receiptFingerprint === receipt.receiptFingerprint ? existing : receipt);
  }
}

export class D1TraceV1M2ReceiptStore implements TraceV1M2ReceiptStore {
  constructor(private readonly db: D1Database) {}

  private async getExact(operationKey: string): Promise<TraceV1M2ActivationReceipt | null> {
    return this.db.prepare(`
      SELECT operation_key AS operationKey, manifest_id AS manifestId, manifest_hash AS manifestHash,
             item_type AS itemType, item_id AS itemId, stage, environment, source_id AS sourceId,
             canonical_source_url AS canonicalSourceUrl, canonical_source_url_hash AS canonicalSourceUrlHash,
             connector, source_document_id AS sourceDocumentId,
             source_document_version_id AS sourceDocumentVersionId, content_hash AS contentHash,
             transport_hash AS transportHash, normalized_content_hash AS normalizedContentHash,
             hash_semantics_version AS hashSemanticsVersion, outcome, reason_code AS reasonCode,
             detail, receipt_fingerprint AS receiptFingerprint, created_at AS createdAt
      FROM trace_v1_activation_receipts WHERE operation_key = ?
    `).bind(operationKey).first<TraceV1M2ActivationReceipt>();
  }

  async get(operationKey: string): Promise<TraceV1M2ActivationReceipt | null> {
    if (isResumeOperationKey(operationKey)) return this.getExact(operationKey);
    return await this.getExact(resumeOperationKey(operationKey)) ?? await this.getExact(operationKey);
  }

  async put(receipt: TraceV1M2ActivationReceipt): Promise<void> {
    const existing = await this.getExact(receipt.operationKey);
    if (existing && existing.receiptFingerprint !== receipt.receiptFingerprint
      && !(isResumeOperationKey(receipt.operationKey) && isResumableReceipt(existing))) {
      throw new Error("TRACE_V1_M2_REPLAY_CONFLICT");
    }
    const insertMode = isResumeOperationKey(receipt.operationKey) ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
    await this.db.prepare(`
      ${insertMode} INTO trace_v1_activation_receipts
        (operation_key, manifest_id, manifest_hash, item_type, item_id, stage, environment,
         source_id, canonical_source_url, canonical_source_url_hash, connector, source_document_id,
         source_document_version_id, content_hash, transport_hash, normalized_content_hash,
         hash_semantics_version, outcome, reason_code, detail, receipt_fingerprint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      receipt.operationKey, receipt.manifestId, receipt.manifestHash, receipt.itemType, receipt.itemId,
      receipt.stage, receipt.environment, receipt.sourceId, receipt.canonicalSourceUrl,
      receipt.canonicalSourceUrlHash, receipt.connector, receipt.sourceDocumentId,
      receipt.sourceDocumentVersionId, receipt.contentHash, receipt.transportHash,
      receipt.normalizedContentHash, receipt.hashSemanticsVersion, receipt.outcome,
      receipt.reasonCode, receipt.detail, receipt.receiptFingerprint, receipt.createdAt,
    ).run();
    const stored = await this.getExact(receipt.operationKey);
    if (!stored || stored.receiptFingerprint !== receipt.receiptFingerprint) throw new Error("TRACE_V1_M2_REPLAY_CONFLICT");
  }
}

export interface TraceV1M2ActivationItemResult {
  itemId: string;
  operationKey: string;
  outcome: "completed" | "replayed" | "blocked";
  reasonCode: string;
  detail: string;
  plan: TraceV1M2ItemPlan | null;
  receipt: TraceV1M2ActivationReceipt | null;
}

export interface TraceV1M2ActivationRunResult {
  executorVersion: typeof TRACE_V1_M2_EXECUTOR_VERSION;
  mode: TraceV1M2ExecutionMode;
  environment: TraceV1M2ExecutionEnvironment;
  manifestId: string;
  manifestHash: string;
  bounded: true;
  sideEffectFree: boolean;
  cost: TraceV1M2OperationCost;
  items: readonly TraceV1M2ActivationItemResult[];
}

export interface TraceV1M2ActivationRequest {
  manifest: TraceV1M2FinalManifest;
  schemaPreflight: CompatibilityPreflightResult;
  environment: TraceV1M2ExecutionEnvironment;
  mode: TraceV1M2ExecutionMode;
  itemLimit?: number;
  itemIds?: readonly string[];
  operations: TraceV1M2GovernedOperations;
  receiptStore?: TraceV1M2ReceiptStore;
  now?: () => string;
}

function bodyOf(manifest: TraceV1M2FinalManifest): Record<string, unknown> {
  const { manifestHash: _hash, manifestIdentity: _identity, ...body } = manifest;
  return body;
}

function operationKey(manifest: TraceV1M2FinalManifest, item: TraceV1M2FinalManifestItem): string {
  return `${manifest.manifestHash}:${item.itemId}:bounded-activation-v1`;
}

function validHash(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExecutionEnvironment(value: unknown): value is TraceV1M2ExecutionEnvironment {
  return typeof value === "string" && (TRACE_V1_M2_EXECUTION_ENVIRONMENTS as readonly string[]).includes(value);
}

function isExecutionMode(value: unknown): value is TraceV1M2ExecutionMode {
  return typeof value === "string" && (TRACE_V1_M2_EXECUTION_MODES as readonly string[]).includes(value);
}

function validateRuntimeRequest(request: TraceV1M2ActivationRequest): void {
  if (!isRecord(request)) throw new Error("TRACE_V1_M2_REQUEST_INVALID");
  if (!isExecutionEnvironment(request.environment)) throw new Error("TRACE_V1_M2_ENVIRONMENT_INVALID");
  if (!isExecutionMode(request.mode)) throw new Error("TRACE_V1_M2_MODE_INVALID");
  if (!isRecord(request.manifest) || !isRecord(request.schemaPreflight) || !isRecord(request.operations)) {
    throw new Error("TRACE_V1_M2_REQUEST_INVALID");
  }
  if (typeof request.operations.resolveCurrentIdentity !== "function" || typeof request.operations.prepareItem !== "function") {
    throw new Error("TRACE_V1_M2_OPERATIONS_PORT_INVALID");
  }
  if (request.itemIds !== undefined && (!Array.isArray(request.itemIds) || request.itemIds.some((itemId) => typeof itemId !== "string"))) {
    throw new Error("TRACE_V1_M2_ITEM_SELECTION_INVALID");
  }
  if (request.itemLimit !== undefined && !Number.isSafeInteger(request.itemLimit)) {
    throw new Error("TRACE_V1_M2_ITEM_BOUND_INVALID");
  }
}

function zeroCost(): TraceV1M2OperationCost {
  return { sourceCaptures: 0, claims: 0, assertions: 0, chunks: 0, knowledgeMappings: 0, selectedItems: 0 };
}

function operationBudget(cost: TraceV1M2OperationCost): TraceV1M2OperationBudget {
  return {
    sourceCaptures: TRACE_V1_M2_EXECUTOR_BOUNDS.maxSourceCaptures - cost.sourceCaptures,
    claims: TRACE_V1_M2_EXECUTOR_BOUNDS.maxClaims - cost.claims,
    assertions: TRACE_V1_M2_EXECUTOR_BOUNDS.maxAssertions - cost.assertions,
    chunks: TRACE_V1_M2_EXECUTOR_BOUNDS.maxChunks - cost.chunks,
    knowledgeMappings: TRACE_V1_M2_EXECUTOR_BOUNDS.maxKnowledgeMappings - cost.knowledgeMappings,
    selectedItems: TRACE_V1_M2_EXECUTOR_BOUNDS.maxItemsPerInvocation - cost.selectedItems,
  };
}

function validCost(cost: TraceV1M2OperationCost): boolean {
  return Object.values(cost).every((value) => Number.isSafeInteger(value) && value >= 0);
}

function costWithinBudget(cost: TraceV1M2OperationCost, budget: TraceV1M2OperationBudget): boolean {
  return cost.sourceCaptures <= budget.sourceCaptures
    && cost.claims <= budget.claims
    && cost.assertions <= budget.assertions
    && cost.chunks <= budget.chunks
    && cost.knowledgeMappings <= budget.knowledgeMappings
    && cost.selectedItems <= budget.selectedItems;
}

function addCost(total: TraceV1M2OperationCost, itemCost: TraceV1M2OperationCost): TraceV1M2OperationCost {
  return {
    sourceCaptures: total.sourceCaptures + itemCost.sourceCaptures,
    claims: total.claims + itemCost.claims,
    assertions: total.assertions + itemCost.assertions,
    chunks: total.chunks + itemCost.chunks,
    knowledgeMappings: total.knowledgeMappings + itemCost.knowledgeMappings,
    selectedItems: total.selectedItems + itemCost.selectedItems,
  };
}

async function verifyManifest(manifest: TraceV1M2FinalManifest): Promise<void> {
  const recomputed = await fingerprint(bodyOf(manifest));
  if (recomputed !== manifest.manifestHash || manifest.manifestIdentity !== `${manifest.manifestVersion}:${manifest.manifestHash}`) {
    throw new Error("TRACE_V1_M2_MANIFEST_HASH_MISMATCH");
  }
  const canonical = await buildTraceV1M2FinalManifest();
  if (canonical.manifestHash !== manifest.manifestHash) throw new Error("TRACE_V1_M2_MANIFEST_NOT_ACCEPTED");
}

function selectedItems(manifest: TraceV1M2FinalManifest, itemIds: readonly string[] | undefined, itemLimit: number): TraceV1M2FinalManifestItem[] {
  if (!Number.isSafeInteger(itemLimit) || itemLimit < 1 || itemLimit > TRACE_V1_M2_EXECUTOR_BOUNDS.maxItemsPerInvocation) {
    throw new Error("TRACE_V1_M2_ITEM_BOUND_INVALID");
  }
  const requested = itemIds ? [...itemIds] : manifest.items.filter((item) => item.cohort === "primary").map((item) => item.itemId).slice(0, itemLimit);
  if (requested.length === 0 || requested.length > itemLimit || new Set(requested).size !== requested.length) throw new Error("TRACE_V1_M2_ITEM_SELECTION_INVALID");
  const items = requested.map((id) => manifest.items.find((item) => item.itemId === id));
  if (items.some((item): item is undefined => !item)) throw new Error("TRACE_V1_M2_ITEM_NOT_IN_MANIFEST");
  if (items.some((item) => item!.cohort === "reserve")) throw new Error("TRACE_V1_M2_RESERVE_REQUIRES_REVIEWED_MANIFEST_REVISION");
  return items as TraceV1M2FinalManifestItem[];
}

async function sourceIdentityFor(
  manifest: TraceV1M2FinalManifest,
  item: TraceV1M2FinalManifestItem,
  proof: TraceV1M2SourceIdentityProof,
): Promise<{ ok: true; canonicalUrl: string; sourceId: number; connector: string; urlHash: string } | { ok: false; reasonCode: string; detail: string }> {
  if (!Number.isSafeInteger(proof.sourceId) || proof.sourceId <= 0 || !validHash(proof.urlHash)) {
    return { ok: false, reasonCode: "SOURCE_IDENTITY_UNRESOLVED", detail: "Source identity proof lacks a valid source ID or URL hash." };
  }
  const expected = item.sourceIdentityExpectationKey
    ? manifest.sourceIdentityExpectations.find((candidate) => candidate.identityKey === item.sourceIdentityExpectationKey)
    : { sourceId: proof.sourceId, canonicalUrl: proof.canonicalUrl, connector: proof.connector };
  if (!expected) return { ok: false, reasonCode: "SOURCE_IDENTITY_UNRESOLVED", detail: "Manifest source identity expectation is absent." };
  const normalizedUrlHashInput = normaliseSourceUrl(proof.canonicalUrl);
  if (!normalizedUrlHashInput || proof.normalizedUrlHashInput !== normalizedUrlHashInput || await hashTransportBody(normalizedUrlHashInput) !== proof.urlHash) {
    return { ok: false, reasonCode: "SOURCE_IDENTITY_UNRESOLVED", detail: "Source identity URL hash proof does not match the normalized canonical URL." };
  }
  if (item.sourceIdentityExpectationKey && proof.basis !== "D1_CANONICAL_SOURCE_RECORD") {
    return { ok: false, reasonCode: "SOURCE_IDENTITY_UNRESOLVED", detail: "Expected source identity requires a canonical source-record proof." };
  }
  const check = await verifyTraceV1M2SourceIdentity(
    { canonicalUrl: expected.canonicalUrl, sourceId: expected.sourceId, connector: expected.connector },
    { canonicalUrl: proof.canonicalUrl, sourceId: proof.sourceId, connector: proof.connector },
  );
  return check.ok && check.identity?.urlHash === proof.urlHash
    ? { ok: true, canonicalUrl: check.identity.canonicalUrl, sourceId: check.identity.sourceId, connector: check.identity.expectedConnector, urlHash: check.identity.urlHash }
    : { ok: false, reasonCode: "SOURCE_IDENTITY_UNRESOLVED", detail: check.detail };
}

function adapterItem(item: TraceV1M2FinalManifestItem, identity: { canonicalUrl: string; sourceId: number; connector: string }): TraceV1M2FinalManifestItem {
  return {
    ...item,
    canonicalUrl: identity.canonicalUrl,
    canonicalSourceId: identity.sourceId,
    expectedConnector: identity.connector,
    normalizedUrlHashInput: identity.canonicalUrl,
    sourceIdentityStatus: "RESOLVED",
    unresolvedFields: [],
  };
}

function adapterManifest(manifest: TraceV1M2FinalManifest, item: TraceV1M2FinalManifestItem): TraceV1M2FinalManifest {
  return { ...manifest, items: [item] };
}

function receiptFingerprintInput(receipt: Omit<TraceV1M2ActivationReceipt, "receiptFingerprint">): Omit<TraceV1M2ActivationReceipt, "receiptFingerprint"> {
  return receipt;
}

function receiptIdentityFromPrepared(
  prepared: TraceV1M2PreparedItem | TraceV1M2CurrentIdentity,
  verifiedSource: { canonicalUrl: string; sourceId: number; connector: string; urlHash: string },
): TraceV1M2ReceiptIdentity {
  const evidence = prepared.evidence;
  const legacy = evidence.hashSemanticsVersion === "legacy_raw_v1";
  return {
    sourceId: verifiedSource.sourceId,
    canonicalSourceUrl: verifiedSource.canonicalUrl,
    canonicalSourceUrlHash: verifiedSource.urlHash,
    connector: verifiedSource.connector,
    sourceDocumentId: evidence.sourceDocumentId,
    sourceDocumentVersionId: evidence.sourceDocumentVersionId,
    contentHash: evidence.contentHash,
    transportHash: evidence.transportHash ?? (legacy ? evidence.contentHash : null),
    normalizedContentHash: evidence.normalizedContentHash,
    hashSemanticsVersion: evidence.hashSemanticsVersion,
  };
}

function receiptIdentityFromReceipt(receipt: TraceV1M2ActivationReceipt): TraceV1M2ReceiptIdentity {
  return {
    sourceId: receipt.sourceId,
    canonicalSourceUrl: receipt.canonicalSourceUrl,
    canonicalSourceUrlHash: receipt.canonicalSourceUrlHash,
    connector: receipt.connector,
    sourceDocumentId: receipt.sourceDocumentId,
    sourceDocumentVersionId: receipt.sourceDocumentVersionId,
    contentHash: receipt.contentHash,
    transportHash: receipt.transportHash,
    normalizedContentHash: receipt.normalizedContentHash,
    hashSemanticsVersion: receipt.hashSemanticsVersion,
  };
}

function sameReceiptIdentity(left: TraceV1M2ReceiptIdentity, right: TraceV1M2ReceiptIdentity): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function replayIdentityIsComplete(identity: TraceV1M2ReceiptIdentity): boolean {
  const hashFields = [identity.contentHash, identity.transportHash, identity.canonicalSourceUrlHash];
  const hashesValid = hashFields.every((value) => typeof value === "string" && validHash(value));
  const normalizedValid = identity.hashSemanticsVersion === "legacy_raw_v1"
    ? identity.normalizedContentHash === null
    : typeof identity.normalizedContentHash === "string" && validHash(identity.normalizedContentHash);
  return identity.sourceId !== null
    && Number.isSafeInteger(identity.sourceId)
    && identity.sourceId > 0
    && typeof identity.canonicalSourceUrl === "string"
    && typeof identity.connector === "string"
    && typeof identity.sourceDocumentId === "string"
    && typeof identity.sourceDocumentVersionId === "string"
    && typeof identity.hashSemanticsVersion === "string"
    && hashesValid
    && normalizedValid;
}

async function currentReceiptIdentity(
  manifest: TraceV1M2FinalManifest,
  item: TraceV1M2FinalManifestItem,
  current: TraceV1M2CurrentIdentity,
): Promise<{ ok: true; identity: TraceV1M2ReceiptIdentity } | { ok: false; reasonCode: string; detail: string }> {
  const verified = await sourceIdentityFor(manifest, item, current.identity);
  if (!verified.ok) return verified;
  if (current.evidence.currentVersionId !== undefined
    && current.evidence.currentVersionId !== current.evidence.sourceDocumentVersionId) {
    return { ok: false, reasonCode: "REPLAY_IDENTITY_CHANGED", detail: "The current source document version does not match the prepared version." };
  }
  const identity = receiptIdentityFromPrepared(current, verified);
  if (!replayIdentityIsComplete(identity)) {
    return { ok: false, reasonCode: "REPLAY_IDENTITY_UNRESOLVED", detail: "The current source/version/content identity is incomplete." };
  }
  return { ok: true, identity };
}

async function makeReceipt(
  manifest: TraceV1M2FinalManifest,
  item: TraceV1M2FinalManifestItem,
  environment: TraceV1M2ExecutionEnvironment,
  outcome: TraceV1M2ReceiptOutcome,
  reasonCode: string,
  detail: string,
  identity: TraceV1M2ReceiptIdentity | null,
  now: string,
  receiptOperationKey = operationKey(manifest, item),
  receiptStage = "bounded_activation",
): Promise<TraceV1M2ActivationReceipt> {
  const base = {
    operationKey: receiptOperationKey,
    manifestId: manifest.manifestId,
    manifestHash: manifest.manifestHash,
    itemType: item.kind,
    itemId: item.itemId,
    stage: receiptStage,
    environment,
    ...(identity ?? {
      sourceId: null,
      canonicalSourceUrl: null,
      canonicalSourceUrlHash: null,
      connector: null,
      sourceDocumentId: null,
      sourceDocumentVersionId: null,
      contentHash: null,
      transportHash: null,
      normalizedContentHash: null,
      hashSemanticsVersion: null,
    }),
    outcome,
    reasonCode,
    detail,
    createdAt: now,
  } as const;
  return { ...base, receiptFingerprint: await fingerprint(receiptFingerprintInput(base)) };
}

async function blockedResult(
  request: TraceV1M2ActivationRequest,
  item: TraceV1M2FinalManifestItem,
  reasonCode: string,
  detail: string,
  store: TraceV1M2ReceiptStore | undefined,
  now: string,
  identity: TraceV1M2ReceiptIdentity | null = null,
  receiptOperationKey = operationKey(request.manifest, item),
  receiptStage = "bounded_activation",
): Promise<TraceV1M2ActivationItemResult> {
  const receipt = request.mode === "execute" && request.environment === "LOCAL_TEST" && store
    ? await makeReceipt(request.manifest, item, request.environment, "blocked", reasonCode, detail, identity, now, receiptOperationKey, receiptStage)
    : null;
  if (receipt && store) await store.put(receipt);
  return { itemId: item.itemId, operationKey: operationKey(request.manifest, item), outcome: "blocked", reasonCode, detail, plan: null, receipt };
}

function isBoundedPreparationFailure(value: TraceV1M2GovernedPreparationResult): value is TraceV1M2BoundedPreparationFailure {
  return isRecord(value)
    && value.reasonCode === "BOUNDED_WORK_LIMIT_EXCEEDED"
    && typeof value.detail === "string"
    && isRecord(value.cost)
    && validCost(value.cost as TraceV1M2OperationCost);
}

export async function executeTraceV1M2Activation(request: TraceV1M2ActivationRequest): Promise<TraceV1M2ActivationRunResult> {
  validateRuntimeRequest(request);
  await verifyManifest(request.manifest);
  const itemLimit = request.itemLimit ?? TRACE_V1_M2_EXECUTOR_BOUNDS.maxItemsPerInvocation;
  const items = selectedItems(request.manifest, request.itemIds, itemLimit);
  const now = request.now ?? (() => new Date().toISOString());
  const store = request.receiptStore;
  if (request.environment !== "LOCAL_TEST") {
    return {
      executorVersion: TRACE_V1_M2_EXECUTOR_VERSION,
      mode: request.mode,
      environment: request.environment,
      manifestId: request.manifest.manifestId,
      manifestHash: request.manifest.manifestHash,
      bounded: true,
      sideEffectFree: true,
      cost: { ...zeroCost(), selectedItems: items.length },
      items: items.map((item) => ({
        itemId: item.itemId,
        operationKey: operationKey(request.manifest, item),
        outcome: "blocked" as const,
        reasonCode: "EXECUTION_UNAUTHORIZED",
        detail: "Preview and Production operation invocation is not authorized by the Mission 2 candidate.",
        plan: null,
        receipt: null,
      })),
    };
  }

  const results: TraceV1M2ActivationItemResult[] = [];
  let operationCost = zeroCost();
  for (const item of items) {
    const key = operationKey(request.manifest, item);
    let resuming = false;
    let resumedReceiptIdentity: TraceV1M2ReceiptIdentity | null = null;
    const receiptOperation = resumeOperationKey(key);
    const receiptStage = "bounded_activation_resume";
    if (request.mode === "execute" && store) {
      const previous = await store.get(key);
      if (previous) {
        const current = await request.operations.resolveCurrentIdentity(item);
        const currentIdentity = current ? await currentReceiptIdentity(request.manifest, item, current) : {
          ok: false as const,
          reasonCode: "REPLAY_IDENTITY_UNRESOLVED",
          detail: "The current source/version/content identity could not be resolved before replay.",
        };
        if (!currentIdentity.ok) {
          operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
          results.push(await blockedResult(request, item, currentIdentity.reasonCode, currentIdentity.detail, undefined, now()));
          continue;
        }
        const expected = await makeReceipt(
          request.manifest,
          item,
          request.environment,
          previous.outcome,
          previous.reasonCode,
          previous.detail,
          receiptIdentityFromReceipt(previous),
          previous.createdAt,
          previous.operationKey,
          previous.stage,
        );
        if (expected.receiptFingerprint !== previous.receiptFingerprint) throw new Error("TRACE_V1_M2_REPLAY_CONFLICT");
        if (!sameReceiptIdentity(receiptIdentityFromReceipt(previous), currentIdentity.identity)) {
          operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
          results.push(await blockedResult(request, item, "REPLAY_IDENTITY_CHANGED", "The current verified source/version/content identity differs from the stored receipt.", undefined, now()));
          continue;
        }
        if (!isResumableReceipt(previous)) {
          operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
          results.push({ itemId: item.itemId, operationKey: key, outcome: "replayed", reasonCode: previous.reasonCode, detail: previous.detail, plan: null, receipt: { ...previous, outcome: "replayed" } });
          continue;
        }
        resuming = true;
        resumedReceiptIdentity = currentIdentity.identity;
      }
    }
    if (request.schemaPreflight.disposition !== "ACTIVATION_ALLOWED") {
      operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
      results.push(await blockedResult(request, item, "SCHEMA_PREFLIGHT_BLOCKED", `Schema preflight disposition is ${request.schemaPreflight.disposition}.`, store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
      continue;
    }
    const budget = operationBudget(operationCost);
    const prepared = await request.operations.prepareItem(item, budget);
    if (isBoundedPreparationFailure(prepared)) {
      if (prepared.cost.selectedItems !== 1 || !costWithinBudget(prepared.cost, budget)) {
        operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
        results.push(await blockedResult(request, item, "BOUNDED_WORK_LIMIT_EXCEEDED", "Governed preparation returned an invalid bounded cost summary.", store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
        continue;
      }
      operationCost = addCost(operationCost, prepared.cost);
      results.push(await blockedResult(request, item, prepared.reasonCode, prepared.detail, store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
      continue;
    }
    if (!prepared) {
      operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
      results.push(await blockedResult(request, item, "SOURCE_IDENTITY_UNRESOLVED", "Governed preparation did not produce a source identity proof and evidence fixture.", store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
      continue;
    }
    if (!validCost(prepared.cost) || prepared.cost.selectedItems !== 1 || !costWithinBudget(prepared.cost, budget)) {
      operationCost = { ...operationCost, selectedItems: operationCost.selectedItems + 1 };
      results.push(await blockedResult(request, item, "BOUNDED_WORK_LIMIT_EXCEEDED", "Governed preparation exceeded the remaining invocation cost budget.", store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
      continue;
    }
    operationCost = addCost(operationCost, prepared.cost);
    if (prepared.evidence.chunks.length > TRACE_V1_M2_EXECUTOR_BOUNDS.maxChunks
      || prepared.evidence.assertions.length > TRACE_V1_M2_EXECUTOR_BOUNDS.maxAssertions) {
      results.push(await blockedResult(request, item, "ITEM_WORK_BOUND_EXCEEDED", "Prepared item exceeded the fixed chunk or assertion bound.", store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
      continue;
    }
    const identity = await sourceIdentityFor(request.manifest, item, prepared.identity);
    if (!identity.ok) {
      results.push(await blockedResult(request, item, identity.reasonCode, identity.detail, store, now(), resumedReceiptIdentity, resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation"));
      continue;
    }
    const receiptIdentity = receiptIdentityFromPrepared(prepared, identity);
    const resolvedItem = adapterItem(item, identity);
    const planManifest = adapterManifest(request.manifest, resolvedItem);
    const plan: TraceV1M2Plan = await planTraceV1M2Activation(planManifest, {
      schemaPreflight: request.schemaPreflight,
      evidenceByItemId: { [resolvedItem.itemId]: prepared.evidence },
    });
    const itemPlan = plan.items[0];
    const outcome: "completed" | "blocked" = itemPlan.activationReady ? "completed" : "blocked";
    const reasonCode = itemPlan.stopReason ?? "ACTIVATION_READY_PENDING_PUBLISHER_RECORD";
    const detail = itemPlan.stopDetail ?? "All bounded evidence stages are complete; no publication action was performed.";
    const receipt = request.mode === "execute" && store
      ? await makeReceipt(request.manifest, item, request.environment, outcome, reasonCode, detail, receiptIdentity, now(), resuming ? receiptOperation : key, resuming ? receiptStage : "bounded_activation")
      : null;
    if (receipt && store) await store.put(receipt);
    results.push({ itemId: item.itemId, operationKey: key, outcome, reasonCode, detail, plan: itemPlan, receipt });
  }
  return {
    executorVersion: TRACE_V1_M2_EXECUTOR_VERSION,
    mode: request.mode,
    environment: request.environment,
    manifestId: request.manifest.manifestId,
    manifestHash: request.manifest.manifestHash,
    bounded: true,
    sideEffectFree: request.mode !== "execute",
    cost: operationCost,
    items: results,
  };
}
