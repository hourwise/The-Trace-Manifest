/**
 * TRACE V1 Mission 2 bounded activation planner.
 *
 * The planner consumes an immutable manifest plus an in-memory evidence
 * snapshot. It validates the governed sequence without touching D1, R2,
 * Queue, Vectorize, providers, or the network. It creates no records; all
 * identifiers in its output come from the manifest or supplied fixture.
 */

import { normaliseSourceUrl } from "./source-capture";
import {
  hashTransportBody,
  LEGACY_SOURCE_HASH_SEMANTICS_VERSION,
  SOURCE_HASH_SEMANTICS_VERSION,
} from "./source-version-identity";
import type { CompatibilityPreflightResult } from "./trace-v1-m2-contract";
import type { TraceV1M2Manifest, TraceV1M2ManifestItem } from "./trace-v1-m2-manifest";

export const TRACE_V1_M2_STAGES = Object.freeze([
  "admitted_canonical_source_identity",
  "source_document",
  "source_document_version",
  "transport_and_normalized_hashes",
  "retrieval_capture_extraction_storage_state",
  "locator_backed_source_chunks",
  "canonical_claim_relationship",
  "claim_assertion",
  "relationship_source_role_directness_evidence_treatment",
  "provenance_proposal_review",
  "source_admission",
  "freshness_request_review",
  "conflict_dispute_correction_supersession_checks",
  "publisher_decision",
] as const);

export type TraceV1M2Stage = (typeof TRACE_V1_M2_STAGES)[number];

export type TraceV1M2StopReason =
  | "SCHEMA_INCOMPATIBLE"
  | "SCHEMA_IDENTITY_UNRESOLVED"
  | "SOURCE_IDENTITY_UNRESOLVED"
  | "SOURCE_NOT_ADMITTED"
  | "SOURCE_VERSION_MISSING"
  | "HASH_STATE_INCOMPLETE"
  | "CAPTURE_STATE_INCOMPLETE"
  | "LOCATOR_MISSING"
  | "CLAIM_RELATIONSHIP_MISSING"
  | "ASSERTION_MISSING"
  | "EVIDENCE_TREATMENT_UNRESOLVED"
  | "PROVENANCE_UNRESOLVED"
  | "FRESHNESS_REVIEW_REQUIRED"
  | "CONFLICT_UNRESOLVED"
  | "CORRECTION_REVIEW_REQUIRED"
  | "PUBLISHER_DECISION_REQUIRED";

export interface TraceV1M2ChunkFixture {
  id: string;
  sourceDocumentVersionId: string;
  startLocator: string | null;
  endLocator: string | null;
}

export interface TraceV1M2AssertionFixture {
  id: string;
  sourceDocumentVersionId: string;
  sourceChunkId: string;
  canonicalClaimId: string | null;
}

export interface TraceV1M2EvidenceFixture {
  sourceId: number | null;
  canonicalUrl: string | null;
  connector: string | null;
  ambiguousSourceMapping?: boolean;
  sourceDocumentId: string | null;
  sourceAdmissionState: string | null;
  sourceAdmissionReviewId?: string | null;
  sourceDocumentVersionId: string | null;
  currentVersionId?: string | null;
  contentHash: string | null;
  transportHash: string | null;
  normalizedContentHash: string | null;
  hashSemanticsVersion: string | null;
  retrievalState: string | null;
  captureState: string | null;
  extractionState: string | null;
  storageState: string | null;
  chunks: readonly TraceV1M2ChunkFixture[];
  canonicalClaimId: string | null;
  assertions: readonly TraceV1M2AssertionFixture[];
  relationshipReviewState: string | null;
  provenanceReviewId: string | null;
  provenanceState: string | null;
  freshnessReviewId: string | null;
  freshnessState: string | null;
  conflictState: string | null;
  correctionState: string | null;
  publisherDecision: string | null;
}

export interface TraceV1M2PlannerContext {
  schemaPreflight: CompatibilityPreflightResult | null;
  evidenceByItemId: Readonly<Record<string, TraceV1M2EvidenceFixture | undefined>>;
}

export interface TraceV1M2CanonicalSourceIdentity {
  sourceId: number;
  canonicalUrl: string;
  expectedConnector: string;
  normalizedUrlHashInput: string;
  urlHash: string;
}

export interface TraceV1M2SourceIdentityCheck {
  ok: boolean;
  identity: TraceV1M2CanonicalSourceIdentity | null;
  detail: string;
  detailCode?: "MISSING_EXPECTED_IDENTITY" | "URL_INVALID" | "URL_MISMATCH" | "SOURCE_ID_MISMATCH" | "UNSUPPORTED_CONNECTOR" | "AMBIGUOUS_SOURCE_MAPPING";
}

export interface TraceV1M2ItemPlan {
  manifestItemId: string;
  manifestVersion: string;
  manifestHash: string;
  storyOrKnowledgeId: string | number;
  primaryOrReserve: "primary" | "reserve" | null;
  canonicalSourceIdentity: TraceV1M2CanonicalSourceIdentity | null;
  canonicalUrl: string | null;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  chunkIds: readonly string[];
  assertionIds: readonly string[];
  provenanceReviewIds: readonly string[];
  idempotencyKey: string;
  completedStages: readonly TraceV1M2Stage[];
  pendingStages: readonly TraceV1M2Stage[];
  stopReason: TraceV1M2StopReason | null;
  stopDetail: string | null;
  publisherActionRequired: boolean;
  activationReady: boolean;
}

export interface TraceV1M2Plan {
  manifestVersion: string;
  manifestHash: string;
  manifestIdentity: string;
  sideEffectFree: true;
  items: readonly TraceV1M2ItemPlan[];
}

const SUPPORTED_CONNECTORS = new Set(["rss", "github_api", "arxiv_api", "hackernews_api", "page_diff"]);
const ACCEPTED_HASH_SEMANTICS = new Set([
  LEGACY_SOURCE_HASH_SEMANTICS_VERSION,
  "normalized_content_v1",
  "normalized_content_v2",
  SOURCE_HASH_SEMANTICS_VERSION,
]);

function isSha256(value: string | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function expectedIdentityFromItem(item: TraceV1M2ManifestItem): { canonicalUrl: string | null; sourceId: number | null; connector: string | null } {
  return { canonicalUrl: item.canonicalUrl, sourceId: item.canonicalSourceId, connector: item.expectedConnector };
}

export async function verifyTraceV1M2SourceIdentity(
  expected: { canonicalUrl: string | null; sourceId: number | null; connector: string | null },
  actual: { canonicalUrl: string | null; sourceId: number | null; connector: string | null; ambiguousSourceMapping?: boolean },
): Promise<TraceV1M2SourceIdentityCheck> {
  if (actual.ambiguousSourceMapping) {
    return { ok: false, identity: null, detail: "More than one source mapping claims the item.", detailCode: "AMBIGUOUS_SOURCE_MAPPING" };
  }
  if (expected.canonicalUrl === null || expected.sourceId === null || expected.connector === null) {
    return { ok: false, identity: null, detail: "Canonical source identity is unresolved in the immutable manifest.", detailCode: "MISSING_EXPECTED_IDENTITY" };
  }
  if (!SUPPORTED_CONNECTORS.has(expected.connector)) {
    return { ok: false, identity: null, detail: `Connector ${expected.connector} is not supported by the accepted V1 ingestion registry.`, detailCode: "UNSUPPORTED_CONNECTOR" };
  }
  if (actual.canonicalUrl === null || actual.sourceId === null || actual.connector === null) {
    return { ok: false, identity: null, detail: "Captured source identity is incomplete.", detailCode: "MISSING_EXPECTED_IDENTITY" };
  }
  const expectedUrl = normaliseSourceUrl(expected.canonicalUrl);
  const actualUrl = normaliseSourceUrl(actual.canonicalUrl);
  if (expectedUrl === null || actualUrl === null) {
    return { ok: false, identity: null, detail: "Canonical source URL is invalid under the accepted URL policy.", detailCode: "URL_INVALID" };
  }
  if (expectedUrl !== actualUrl) {
    return { ok: false, identity: null, detail: "Captured URL does not match the canonical source URL after repository normalization.", detailCode: "URL_MISMATCH" };
  }
  if (expected.sourceId !== actual.sourceId) {
    return { ok: false, identity: null, detail: "Captured source ID does not match the canonical source identity.", detailCode: "SOURCE_ID_MISMATCH" };
  }
  if (expected.connector !== actual.connector) {
    return { ok: false, identity: null, detail: "Captured connector does not match the expected source type.", detailCode: "UNSUPPORTED_CONNECTOR" };
  }
  return {
    ok: true,
    identity: {
      sourceId: expected.sourceId,
      canonicalUrl: expectedUrl,
      expectedConnector: expected.connector,
      normalizedUrlHashInput: expectedUrl,
      urlHash: await hashTransportBody(expectedUrl),
    },
    detail: "Canonical source identity matches after normalization.",
  };
}

function basePlan(item: TraceV1M2ManifestItem, manifest: TraceV1M2Manifest): TraceV1M2ItemPlan {
  return {
    manifestItemId: item.itemId,
    manifestVersion: manifest.manifestVersion,
    manifestHash: manifest.manifestHash,
    storyOrKnowledgeId: item.storyId ?? item.knowledgeId ?? item.itemId,
    primaryOrReserve: item.cohort ?? null,
    canonicalSourceIdentity: null,
    canonicalUrl: null,
    sourceDocumentId: null,
    sourceDocumentVersionId: null,
    chunkIds: [],
    assertionIds: [],
    provenanceReviewIds: [],
    idempotencyKey: `trace-v1-m2:${manifest.manifestHash}:${item.itemId}`,
    completedStages: [],
    pendingStages: TRACE_V1_M2_STAGES,
    stopReason: null,
    stopDetail: null,
    publisherActionRequired: false,
    activationReady: false,
  };
}

function stopped(plan: TraceV1M2ItemPlan, reason: TraceV1M2StopReason, detail: string, completedStages = plan.completedStages): TraceV1M2ItemPlan {
  const completed = [...completedStages];
  const firstPendingIndex = completed.length === 0 ? 0 : TRACE_V1_M2_STAGES.indexOf(completed[completed.length - 1]) + 1;
  return {
    ...plan,
    completedStages: completed,
    pendingStages: TRACE_V1_M2_STAGES.slice(firstPendingIndex),
    stopReason: reason,
    stopDetail: detail,
    publisherActionRequired: reason === "PUBLISHER_DECISION_REQUIRED",
    activationReady: false,
  };
}

function completed(plan: TraceV1M2ItemPlan, stage: TraceV1M2Stage): TraceV1M2ItemPlan {
  return { ...plan, completedStages: [...plan.completedStages, stage], pendingStages: TRACE_V1_M2_STAGES.slice(plan.completedStages.length + 1) };
}

async function planItem(item: TraceV1M2ManifestItem, manifest: TraceV1M2Manifest, context: TraceV1M2PlannerContext): Promise<TraceV1M2ItemPlan> {
  let plan = basePlan(item, manifest);
  const preflight = context.schemaPreflight;
  if (!preflight) return stopped(plan, "SCHEMA_IDENTITY_UNRESOLVED", "No schema preflight result was supplied.", []);
  if (preflight.disposition !== "ACTIVATION_ALLOWED") {
    return stopped(plan, "SCHEMA_INCOMPATIBLE", `Schema preflight disposition is ${preflight.disposition}.`, []);
  }

  const fixture = context.evidenceByItemId[item.itemId];
  const identityCheck = await verifyTraceV1M2SourceIdentity(expectedIdentityFromItem(item), {
    canonicalUrl: fixture?.canonicalUrl ?? null,
    sourceId: fixture?.sourceId ?? null,
    connector: fixture?.connector ?? null,
    ambiguousSourceMapping: fixture?.ambiguousSourceMapping,
  });
  if (!identityCheck.ok) return stopped(plan, "SOURCE_IDENTITY_UNRESOLVED", identityCheck.detail);
  plan = { ...completed(plan, "admitted_canonical_source_identity"), canonicalSourceIdentity: identityCheck.identity, canonicalUrl: identityCheck.identity?.canonicalUrl ?? null };

  if (!fixture || fixture.sourceDocumentId === null || fixture.sourceAdmissionState !== "admitted") {
    return stopped(plan, "SOURCE_NOT_ADMITTED", "No admitted source_document is available for the canonical source identity.");
  }
  plan = { ...completed(plan, "source_document"), sourceDocumentId: fixture.sourceDocumentId };
  if (fixture.sourceDocumentVersionId === null || (fixture.currentVersionId !== undefined && fixture.currentVersionId !== fixture.sourceDocumentVersionId)) {
    return stopped(plan, "SOURCE_VERSION_MISSING", "The source_document has no matching current immutable source_document_version.");
  }
  plan = { ...completed(plan, "source_document_version"), sourceDocumentVersionId: fixture.sourceDocumentVersionId };

  const legacy = fixture.hashSemanticsVersion === LEGACY_SOURCE_HASH_SEMANTICS_VERSION;
  const effectiveTransportHash = fixture.transportHash ?? (legacy ? fixture.contentHash : null);
  const normalizedHashRequired = !legacy;
  if (
    !isSha256(fixture.contentHash)
    || !isSha256(effectiveTransportHash)
    || !ACCEPTED_HASH_SEMANTICS.has(fixture.hashSemanticsVersion ?? "")
    || (normalizedHashRequired && !isSha256(fixture.normalizedContentHash))
    || (legacy && fixture.normalizedContentHash !== null)
  ) {
    return stopped(plan, "HASH_STATE_INCOMPLETE", "Transport/content hashes or hash-semantics version do not satisfy the accepted version contract.");
  }
  plan = completed(plan, "transport_and_normalized_hashes");

  if (fixture.retrievalState !== "available" || fixture.captureState !== "captured" || fixture.extractionState !== "extracted" || !["private_stored", "metadata_only"].includes(fixture.storageState ?? "")) {
    return stopped(plan, "CAPTURE_STATE_INCOMPLETE", "Retrieval, capture, extraction, or storage state is not evidence-ready.");
  }
  plan = completed(plan, "retrieval_capture_extraction_storage_state");

  const validChunks = fixture.chunks.filter((chunk) => chunk.sourceDocumentVersionId === fixture.sourceDocumentVersionId && chunk.startLocator !== null && chunk.startLocator !== "" && chunk.endLocator !== null && chunk.endLocator !== "");
  plan = { ...plan, chunkIds: fixture.chunks.map((chunk) => chunk.id) };
  if (validChunks.length === 0 || validChunks.length !== fixture.chunks.length) {
    return stopped(plan, "LOCATOR_MISSING", "At least one source chunk is absent, unlocated, or linked to a different source version.");
  }
  plan = completed(plan, "locator_backed_source_chunks");

  if (fixture.canonicalClaimId === null) return stopped(plan, "CLAIM_RELATIONSHIP_MISSING", "No story/knowledge-to-canonical-claim relationship is present.");
  plan = completed(plan, "canonical_claim_relationship");
  const validAssertions = fixture.assertions.filter((assertion) => assertion.sourceDocumentVersionId === fixture.sourceDocumentVersionId && validChunks.some((chunk) => chunk.id === assertion.sourceChunkId) && assertion.canonicalClaimId === fixture.canonicalClaimId);
  plan = { ...plan, assertionIds: fixture.assertions.map((assertion) => assertion.id) };
  if (validAssertions.length === 0 || validAssertions.length !== fixture.assertions.length) {
    return stopped(plan, "ASSERTION_MISSING", "Claim assertion linkage does not resolve to the captured version and locator-backed chunk.");
  }
  plan = completed(plan, "claim_assertion");
  if (fixture.relationshipReviewState !== "approved") return stopped(plan, "EVIDENCE_TREATMENT_UNRESOLVED", "Relationship, source-role, directness, or evidence-treatment review is unresolved.");
  plan = completed(plan, "relationship_source_role_directness_evidence_treatment");
  if (fixture.provenanceReviewId === null || fixture.provenanceState !== "approved") return stopped(plan, "PROVENANCE_UNRESOLVED", "Provenance proposal/review is not approved.");
  plan = { ...completed(plan, "provenance_proposal_review"), provenanceReviewIds: [fixture.provenanceReviewId] };
  if (fixture.sourceAdmissionReviewId === null || fixture.sourceAdmissionState !== "admitted") return stopped(plan, "SOURCE_NOT_ADMITTED", "Source admission review is not complete.");
  plan = completed(plan, "source_admission");
  if (fixture.freshnessReviewId === null || fixture.freshnessState !== "current") return stopped(plan, "FRESHNESS_REVIEW_REQUIRED", "Freshness request/review is absent or not current.");
  plan = completed(plan, "freshness_request_review");
  if (fixture.conflictState !== "clear") return stopped(plan, "CONFLICT_UNRESOLVED", "Conflict, dispute, or supersession checks are unresolved.");
  if (fixture.correctionState !== "clear") return stopped(plan, "CORRECTION_REVIEW_REQUIRED", "Correction review is unresolved.");
  plan = completed(plan, "conflict_dispute_correction_supersession_checks");
  if (fixture.publisherDecision !== "approved") return stopped(plan, "PUBLISHER_DECISION_REQUIRED", "Publisher decision is still required; the planner never makes it automatically.");
  plan = completed(plan, "publisher_decision");
  return { ...plan, stopReason: null, stopDetail: null, publisherActionRequired: false, activationReady: true };
}

export async function planTraceV1M2Activation(manifest: TraceV1M2Manifest, context: TraceV1M2PlannerContext): Promise<TraceV1M2Plan> {
  const items = [];
  for (const item of manifest.items) items.push(await planItem(item, manifest, context));
  return {
    manifestVersion: manifest.manifestVersion,
    manifestHash: manifest.manifestHash,
    manifestIdentity: manifest.manifestIdentity,
    sideEffectFree: true,
    items,
  };
}
