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
}

export interface TraceV1M2GovernedOperations {
  /** This port represents existing governed capture/review paths; it is not SQL or a network callback. */
  prepareItem(item: TraceV1M2FinalManifestItem): Promise<TraceV1M2PreparedItem | null>;
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
  sourceDocumentVersionId: string | null;
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

export class MemoryTraceV1M2ReceiptStore implements TraceV1M2ReceiptStore {
  private readonly receipts = new Map<string, TraceV1M2ActivationReceipt>();

  async get(operationKey: string): Promise<TraceV1M2ActivationReceipt | null> {
    return this.receipts.get(operationKey) ?? null;
  }

  async put(receipt: TraceV1M2ActivationReceipt): Promise<void> {
    const existing = this.receipts.get(receipt.operationKey);
    if (existing && existing.receiptFingerprint !== receipt.receiptFingerprint) throw new Error("TRACE_V1_M2_REPLAY_CONFLICT");
    this.receipts.set(receipt.operationKey, existing ?? receipt);
  }
}

export class D1TraceV1M2ReceiptStore implements TraceV1M2ReceiptStore {
  constructor(private readonly db: D1Database) {}

  async get(operationKey: string): Promise<TraceV1M2ActivationReceipt | null> {
    return this.db.prepare(`
      SELECT operation_key AS operationKey, manifest_id AS manifestId, manifest_hash AS manifestHash,
             item_type AS itemType, item_id AS itemId, stage, environment, source_id AS sourceId,
             source_document_version_id AS sourceDocumentVersionId, outcome, reason_code AS reasonCode,
             detail, receipt_fingerprint AS receiptFingerprint, created_at AS createdAt
      FROM trace_v1_activation_receipts WHERE operation_key = ?
    `).bind(operationKey).first<TraceV1M2ActivationReceipt>();
  }

  async put(receipt: TraceV1M2ActivationReceipt): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO trace_v1_activation_receipts
        (operation_key, manifest_id, manifest_hash, item_type, item_id, stage, environment,
         source_id, source_document_version_id, outcome, reason_code, detail, receipt_fingerprint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      receipt.operationKey, receipt.manifestId, receipt.manifestHash, receipt.itemType, receipt.itemId,
      receipt.stage, receipt.environment, receipt.sourceId, receipt.sourceDocumentVersionId,
      receipt.outcome, receipt.reasonCode, receipt.detail, receipt.receiptFingerprint, receipt.createdAt,
    ).run();
    const stored = await this.get(receipt.operationKey);
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
): Promise<{ ok: true; canonicalUrl: string; sourceId: number; connector: string } | { ok: false; reasonCode: string; detail: string }> {
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
    ? { ok: true, canonicalUrl: check.identity.canonicalUrl, sourceId: check.identity.sourceId, connector: check.identity.expectedConnector }
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

async function makeReceipt(
  manifest: TraceV1M2FinalManifest,
  item: TraceV1M2FinalManifestItem,
  environment: TraceV1M2ExecutionEnvironment,
  outcome: TraceV1M2ReceiptOutcome,
  reasonCode: string,
  detail: string,
  sourceId: number | null,
  sourceDocumentVersionId: string | null,
  now: string,
): Promise<TraceV1M2ActivationReceipt> {
  const base = {
    operationKey: operationKey(manifest, item),
    manifestId: manifest.manifestId,
    manifestHash: manifest.manifestHash,
    itemType: item.kind,
    itemId: item.itemId,
    stage: "bounded_activation",
    environment,
    sourceId,
    sourceDocumentVersionId,
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
): Promise<TraceV1M2ActivationItemResult> {
  const receipt = request.mode === "execute" && request.environment === "LOCAL_TEST" && store
    ? await makeReceipt(request.manifest, item, request.environment, "blocked", reasonCode, detail, null, null, now)
    : null;
  if (receipt && store) await store.put(receipt);
  return { itemId: item.itemId, operationKey: operationKey(request.manifest, item), outcome: "blocked", reasonCode, detail, plan: null, receipt };
}

export async function executeTraceV1M2Activation(request: TraceV1M2ActivationRequest): Promise<TraceV1M2ActivationRunResult> {
  await verifyManifest(request.manifest);
  const itemLimit = request.itemLimit ?? TRACE_V1_M2_EXECUTOR_BOUNDS.maxItemsPerInvocation;
  const items = selectedItems(request.manifest, request.itemIds, itemLimit);
  const now = request.now ?? (() => new Date().toISOString());
  const store = request.receiptStore;
  if (request.mode === "execute" && request.environment !== "LOCAL_TEST") {
    return {
      executorVersion: TRACE_V1_M2_EXECUTOR_VERSION,
      mode: request.mode,
      environment: request.environment,
      manifestId: request.manifest.manifestId,
      manifestHash: request.manifest.manifestHash,
      bounded: true,
      sideEffectFree: true,
      items: items.map((item) => ({
        itemId: item.itemId,
        operationKey: operationKey(request.manifest, item),
        outcome: "blocked" as const,
        reasonCode: "EXECUTION_UNAUTHORIZED",
        detail: "Preview and Production execution are not authorized by the Mission 2 candidate.",
        plan: null,
        receipt: null,
      })),
    };
  }

  const results: TraceV1M2ActivationItemResult[] = [];
  for (const item of items) {
    const key = operationKey(request.manifest, item);
    if (request.mode === "execute" && request.environment === "LOCAL_TEST" && store) {
      const previous = await store.get(key);
      if (previous) {
        const expected = await makeReceipt(request.manifest, item, request.environment, previous.outcome, previous.reasonCode, previous.detail, previous.sourceId, previous.sourceDocumentVersionId, previous.createdAt);
        if (expected.receiptFingerprint !== previous.receiptFingerprint) throw new Error("TRACE_V1_M2_REPLAY_CONFLICT");
        results.push({ itemId: item.itemId, operationKey: key, outcome: "replayed", reasonCode: previous.reasonCode, detail: previous.detail, plan: null, receipt: { ...previous, outcome: "replayed" } });
        continue;
      }
    }
    if (request.schemaPreflight.disposition !== "ACTIVATION_ALLOWED") {
      results.push(await blockedResult(request, item, "SCHEMA_PREFLIGHT_BLOCKED", `Schema preflight disposition is ${request.schemaPreflight.disposition}.`, store, now()));
      continue;
    }
    const prepared = await request.operations.prepareItem(item);
    if (!prepared) {
      results.push(await blockedResult(request, item, "SOURCE_IDENTITY_UNRESOLVED", "Governed preparation did not produce a source identity proof and evidence fixture.", store, now()));
      continue;
    }
    if (prepared.evidence.chunks.length > TRACE_V1_M2_EXECUTOR_BOUNDS.maxChunks
      || prepared.evidence.assertions.length > TRACE_V1_M2_EXECUTOR_BOUNDS.maxAssertions) {
      results.push(await blockedResult(request, item, "ITEM_WORK_BOUND_EXCEEDED", "Prepared item exceeded the fixed chunk or assertion bound.", store, now()));
      continue;
    }
    const identity = await sourceIdentityFor(request.manifest, item, prepared.identity);
    if (!identity.ok) {
      results.push(await blockedResult(request, item, identity.reasonCode, identity.detail, store, now()));
      continue;
    }
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
    const receipt = request.mode === "execute" && request.environment === "LOCAL_TEST" && store
      ? await makeReceipt(request.manifest, item, request.environment, outcome, reasonCode, detail, prepared.identity.sourceId, prepared.evidence.sourceDocumentVersionId, now())
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
    sideEffectFree: request.mode !== "execute" || request.environment !== "LOCAL_TEST",
    items: results,
  };
}
