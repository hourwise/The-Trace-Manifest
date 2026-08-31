/**
 * TRACE V1 Mission 1 deterministic planning primitives.
 *
 * This module is deliberately read-only. It accepts normalized schema/corpus
 * snapshots and produces classifications and bounded, machine-readable plans.
 * It does not contain a database write path, an LLM call, or a publication
 * operation.
 */

export const TRACE_V1_M1_VERSION = "trace-v1-m1-v1" as const;
export const TRACE_V1_M1_MAX_STORIES = 20;
export const TRACE_V1_M1_KNOWLEDGE_TARGET = 6;
export const TRACE_V1_M1_RECENCY_DAYS = 180;

export type SchemaObjectType = "table" | "index" | "trigger";
export type SchemaClassification =
  | "PRESENT_COMPATIBLE"
  | "PRESENT_LEGACY_COMPATIBLE"
  | "MISSING"
  | "INCOMPATIBLE"
  | "NOT_REQUIRED_FOR_V1";

export interface SchemaColumnSnapshot {
  name: string;
  type?: string | null;
  notNull?: number | boolean;
  defaultValue?: string | null;
  primaryKeyPosition?: number;
}

export interface SchemaObjectSnapshot {
  name: string;
  type: SchemaObjectType;
  sql?: string | null;
  tableName?: string | null;
}

export interface SchemaSnapshot {
  objects: SchemaObjectSnapshot[];
  columns: Record<string, SchemaColumnSnapshot[]>;
}

export interface SchemaParityItem {
  key: string;
  objectType: SchemaObjectType | "column";
  objectName: string;
  tableName?: string;
  classification: SchemaClassification;
  requiredForV1: boolean;
  expected?: SchemaObjectSnapshot | SchemaColumnSnapshot;
  actual?: SchemaObjectSnapshot | SchemaColumnSnapshot;
  detail?: string;
}

export interface SchemaParityReport {
  version: typeof TRACE_V1_M1_VERSION;
  items: SchemaParityItem[];
  summary: Record<SchemaClassification, number>;
  missing: SchemaParityItem[];
  incompatible: SchemaParityItem[];
}

/** Current graph/runtime structures required by the accepted application. */
export const TRACE_V1_M1_REQUIRED_TABLES = Object.freeze([
  "sources",
  "feed_items",
  "story_clusters",
  "story_cluster_members",
  "ingestion_jobs",
  "cron_runs",
  "source_documents",
  "source_document_versions",
  "source_chunks",
  "provenance_groups",
  "source_provenance_memberships",
  "canonical_claims",
  "claim_assertions",
  "story_claims",
  "knowledge_documents",
  "knowledge_document_sources",
  "knowledge_document_claims",
  "knowledge_document_claim_assertions",
  "corrections",
  "claim_conflicts",
  "knowledge_claim_conflict_cases",
  "evidence_score_snapshots",
  "canonical_claim_score_snapshots",
  "evidence_score_snapshot_explanations",
  "evidence_change_approvals",
  "admin_request_nonces",
  "admin_audit_log",
  "source_upload_intakes",
  "knowledge_search_records",
  "knowledge_search_fts",
  "knowledge_embedding_runs",
  "knowledge_embedding_index_items",
  "trace_runtime_resource_identity",
  "kc11g_story_claim_score_work",
  "kc11g_deferred_score_work",
  "knowledge_source_backfill_batches",
  "knowledge_source_backfill_items",
  "knowledge_source_backfill_item_events",
  "knowledge_source_backfill_inventory_snapshots",
  "knowledge_source_backfill_inventory_authority",
  "knowledge_source_backfill_attempts",
  "source_document_version_observations",
]);

/** Tables retained for compatibility but not treated as current evidence. */
export const TRACE_V1_M1_LEGACY_TABLES = new Set([
  "claims",
  "claim_evidence",
  "claim_conflicts",
  "knowledge_pages",
  "knowledge_page_claims",
  "guides",
  "guide_sources",
  "guide_revisions",
]);

function normalizeSql(sql: string | null | undefined): string {
  return (sql ?? "")
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/["`]/g, "")
    .trim()
    .toLowerCase();
}

function tableNameForIndex(object: SchemaObjectSnapshot): string | null {
  if (object.tableName) return object.tableName;
  const match = (object.sql ?? "").match(/\bon\s+([\w-]+)/i);
  return match?.[1] ?? null;
}

function primaryKey(columns: SchemaColumnSnapshot[]): string {
  return columns
    .filter((column) => Number(column.primaryKeyPosition ?? 0) > 0)
    .sort((a, b) => Number(a.primaryKeyPosition) - Number(b.primaryKeyPosition))
    .map((column) => column.name)
    .join(",");
}

function columnShapeDiffers(expected: SchemaColumnSnapshot, actual: SchemaColumnSnapshot): boolean {
  return Number(actual.primaryKeyPosition ?? 0) !== Number(expected.primaryKeyPosition ?? 0)
    || String(actual.type ?? "").toLowerCase() !== String(expected.type ?? "").toLowerCase()
    || Number(actual.notNull ?? 0) !== Number(expected.notNull ?? 0)
    || String(actual.defaultValue ?? "").trim() !== String(expected.defaultValue ?? "").trim();
}

function expectedObject(
  expected: SchemaSnapshot,
  type: SchemaObjectType,
  name: string,
): SchemaObjectSnapshot | undefined {
  return expected.objects.find((object) => object.type === type && object.name === name);
}

function actualObject(
  actual: SchemaSnapshot,
  type: SchemaObjectType,
  name: string,
): SchemaObjectSnapshot | undefined {
  return actual.objects.find((object) => object.type === type && object.name === name);
}

function pushItem(items: SchemaParityItem[], item: SchemaParityItem): void {
  items.push(item);
}

/**
 * Compare the accepted local schema snapshot with a target snapshot.
 *
 * The comparison is structural rather than a raw CREATE SQL comparison:
 * migration composition and SQLite formatting may differ while the required
 * columns, nullability, defaults, and primary keys remain compatible. Indexes and triggers are
 * compared by their normalized SQL because their expression/order is part of
 * the current application's query or safety contract.
 */
export function inspectSchemaParity(expected: SchemaSnapshot, actual: SchemaSnapshot): SchemaParityReport {
  const items: SchemaParityItem[] = [];
  const requiredTables = new Set(TRACE_V1_M1_REQUIRED_TABLES);

  for (const tableName of TRACE_V1_M1_REQUIRED_TABLES) {
    const expectedTable = expectedObject(expected, "table", tableName);
    const actualTable = actualObject(actual, "table", tableName);
    if (!expectedTable) {
      pushItem(items, {
        key: `table:${tableName}`,
        objectType: "table",
        objectName: tableName,
        classification: "INCOMPATIBLE",
        requiredForV1: true,
        detail: "Accepted schema snapshot did not contain this required table.",
      });
      continue;
    }
    if (!actualTable) {
      pushItem(items, {
        key: `table:${tableName}`,
        objectType: "table",
        objectName: tableName,
        classification: "MISSING",
        requiredForV1: true,
        expected: expectedTable,
        detail: "Required table is absent from the target schema.",
      });
      for (const column of expected.columns[tableName] ?? []) {
        pushItem(items, {
          key: `column:${tableName}.${column.name}`,
          objectType: "column",
          objectName: column.name,
          tableName,
          classification: "MISSING",
          requiredForV1: true,
          expected: column,
          detail: "Column cannot be present while its required table is absent.",
        });
      }
      continue;
    }

    const expectedColumns = expected.columns[tableName] ?? [];
    const actualColumns = actual.columns[tableName] ?? [];
    const actualByName = new Map(actualColumns.map((column) => [column.name, column]));
    const missingColumns: string[] = [];
    for (const column of expectedColumns) {
      const actualColumn = actualByName.get(column.name);
      if (!actualColumn) {
        missingColumns.push(column.name);
        pushItem(items, {
          key: `column:${tableName}.${column.name}`,
          objectType: "column",
          objectName: column.name,
          tableName,
          classification: "MISSING",
          requiredForV1: true,
          expected: column,
          detail: "Required column is absent from the target table.",
        });
        continue;
      }
      if (columnShapeDiffers(column, actualColumn)) {
        pushItem(items, {
          key: `column:${tableName}.${column.name}`,
          objectType: "column",
          objectName: column.name,
          tableName,
          classification: "INCOMPATIBLE",
          requiredForV1: true,
          expected: column,
          actual: actualColumn,
          detail: "Column type, nullability, default, or primary-key position differs from the accepted schema.",
        });
      } else {
        pushItem(items, {
          key: `column:${tableName}.${column.name}`,
          objectType: "column",
          objectName: column.name,
          tableName,
          classification: TRACE_V1_M1_LEGACY_TABLES.has(tableName)
            ? "PRESENT_LEGACY_COMPATIBLE" : "PRESENT_COMPATIBLE",
          requiredForV1: true,
          expected: column,
          actual: actualColumn,
        });
      }
    }

    const expectedPk = primaryKey(expectedColumns);
    const actualPk = primaryKey(actualColumns);
    const tableClassification = missingColumns.length > 0 || expectedPk !== actualPk
      ? "INCOMPATIBLE"
      : TRACE_V1_M1_LEGACY_TABLES.has(tableName)
        ? "PRESENT_LEGACY_COMPATIBLE" : "PRESENT_COMPATIBLE";
    pushItem(items, {
      key: `table:${tableName}`,
      objectType: "table",
      objectName: tableName,
      classification: tableClassification,
      requiredForV1: true,
      expected: expectedTable,
      actual: actualTable,
      detail: missingColumns.length > 0
        ? `Missing columns: ${missingColumns.join(", ")}`
        : expectedPk !== actualPk ? `Primary key differs: expected ${expectedPk || "none"}, got ${actualPk || "none"}.` : undefined,
    });
  }

  const expectedIndexes = expected.objects.filter((object) => {
    if (object.type !== "index") return false;
    return requiredTables.has(tableNameForIndex(object) ?? "");
  });
  for (const expectedIndex of expectedIndexes) {
    const actualIndex = actualObject(actual, "index", expectedIndex.name);
    const indexTable = tableNameForIndex(expectedIndex) ?? undefined;
    const classification: SchemaClassification = !actualIndex
      ? "MISSING"
      : normalizeSql(expectedIndex.sql) === normalizeSql(actualIndex.sql)
        ? (TRACE_V1_M1_LEGACY_TABLES.has(indexTable ?? "") ? "PRESENT_LEGACY_COMPATIBLE" : "PRESENT_COMPATIBLE")
        : "INCOMPATIBLE";
    pushItem(items, {
      key: `index:${expectedIndex.name}`,
      objectType: "index",
      objectName: expectedIndex.name,
      tableName: indexTable,
      classification,
      requiredForV1: true,
      expected: expectedIndex,
      actual: actualIndex,
      detail: !actualIndex ? "Required query-path index is absent." : classification === "INCOMPATIBLE" ? "Index definition differs from the accepted schema." : undefined,
    });
  }

  const expectedTriggers = expected.objects.filter((object) => {
    if (object.type !== "trigger") return false;
    return requiredTables.has(tableNameForIndex(object) ?? "") || /on\s+(?:update|delete|insert)\s+on\s+(\w+)/i.test(object.sql ?? "");
  });
  for (const expectedTrigger of expectedTriggers) {
    const actualTrigger = actualObject(actual, "trigger", expectedTrigger.name);
    const classification: SchemaClassification = !actualTrigger
      ? "MISSING"
      : normalizeSql(expectedTrigger.sql) === normalizeSql(actualTrigger.sql)
        ? "PRESENT_COMPATIBLE" : "INCOMPATIBLE";
    pushItem(items, {
      key: `trigger:${expectedTrigger.name}`,
      objectType: "trigger",
      objectName: expectedTrigger.name,
      classification,
      requiredForV1: true,
      expected: expectedTrigger,
      actual: actualTrigger,
      detail: !actualTrigger ? "Required immutability or lifecycle trigger is absent." : classification === "INCOMPATIBLE" ? "Trigger definition differs from the accepted schema." : undefined,
    });
  }

  // Make the compatibility-only legacy structures explicit in the report.
  for (const tableName of TRACE_V1_M1_LEGACY_TABLES) {
    if (requiredTables.has(tableName)) continue;
    const actualTable = actualObject(actual, "table", tableName);
    pushItem(items, {
      key: `table:${tableName}`,
      objectType: "table",
      objectName: tableName,
      classification: actualTable ? "PRESENT_LEGACY_COMPATIBLE" : "NOT_REQUIRED_FOR_V1",
      requiredForV1: false,
      actual: actualTable,
      detail: "Retained for historical compatibility; not a current v1 evidence source.",
    });
  }

  const summary = Object.fromEntries(
    (["PRESENT_COMPATIBLE", "PRESENT_LEGACY_COMPATIBLE", "MISSING", "INCOMPATIBLE", "NOT_REQUIRED_FOR_V1"] as SchemaClassification[])
      .map((classification) => [classification, items.filter((item) => item.classification === classification).length]),
  ) as Record<SchemaClassification, number>;
  return {
    version: TRACE_V1_M1_VERSION,
    items,
    summary,
    missing: items.filter((item) => item.classification === "MISSING"),
    incompatible: items.filter((item) => item.classification === "INCOMPATIBLE"),
  };
}

export interface StoryAssertionSnapshot {
  id: string;
  canonicalClaimId: string;
  sourceDocumentVersionId?: string | null;
  sourceChunkId?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentAdmissionState?: string | null;
  sourceDocumentCurrentVersionId?: string | null;
  sourceUrl?: string | null;
  sourceVersionRetrievedUrl?: string | null;
  sourceVersionExtractionState?: string | null;
  sourceChunkStartLocator?: string | null;
  sourceChunkEndLocator?: string | null;
  startLocator?: string | null;
  endLocator?: string | null;
  provenanceGroupId?: string | null;
  admissionState?: string | null;
  freshnessState?: string | null;
  reviewerState?: string | null;
  sourceRole?: string | null;
  evidenceTreatment?: string | null;
  relationship?: string | null;
  directness?: string | null;
  isDisputed?: boolean | number;
  legacyClaimId?: number | null;
}

export interface StoryClaimSnapshot {
  canonicalClaimId: string;
  role?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  claimExists: boolean;
  claimState?: string | null;
  assertions: StoryAssertionSnapshot[];
}

export interface StoryCandidateSnapshot {
  id: number;
  title: string;
  slug?: string | null;
  topic?: string | null;
  publicationStatus?: string | null;
  evidenceStatus?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  summaryPresent?: boolean;
  hasPublishedFeedMember?: boolean;
  publishedCorrection?: boolean;
  unresolvedConflict?: boolean;
  claims: StoryClaimSnapshot[];
}

export interface RemediationAction {
  action: string;
  targetType: string;
  targetId: string;
  reasonCode: string;
  requiredReview: "publisher" | "operator";
  fields: string[];
}

export interface CandidateAssessment {
  classification: "LAUNCH_READY" | "REMEDIATION_REQUIRED" | "EXCLUDE_FROM_V1";
  id: string;
  title: string;
  topic: string | null;
  reasons: Array<{ code: string; detail: string }>;
  remediation: RemediationAction[];
  claimCount: number;
  currentEligibleAssertionCount: number;
  evidenceCompleteness: number;
  recencyDays: number | null;
}

export interface StoryLaunchPlan {
  version: typeof TRACE_V1_M1_VERSION;
  asOf: string;
  recencyDays: number;
  targetMaximum: number;
  counts: Record<"LAUNCH_READY" | "REMEDIATION_REQUIRED" | "EXCLUDE_FROM_V1", number>;
  candidates: CandidateAssessment[];
  bestCandidates: CandidateAssessment[];
  planFingerprint: string;
}

function present(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function httpUrl(value: string | null | undefined): boolean {
  if (!present(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function dateDaysAgo(value: string | null | undefined, asOfMs: number): number | null {
  if (!present(value)) return null;
  const parsed = Date.parse(value!);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((asOfMs - parsed) / 86_400_000));
}

function addReason(
  reasons: Array<{ code: string; detail: string }>,
  code: string,
  detail: string,
): void {
  if (!reasons.some((reason) => reason.code === code)) reasons.push({ code, detail });
}

function addAction(actions: RemediationAction[], action: RemediationAction): void {
  const key = `${action.action}:${action.targetType}:${action.targetId}:${action.reasonCode}`;
  if (!actions.some((item) => `${item.action}:${item.targetType}:${item.targetId}:${item.reasonCode}` === key)) actions.push(action);
}

function currentAssertion(assertion: StoryAssertionSnapshot): boolean {
  return assertion.admissionState === "admitted"
    && assertion.reviewerState === "accepted"
    && assertion.freshnessState === "current"
    && assertion.sourceRole === "evidence"
    && assertion.evidenceTreatment === "factual_support"
    && ["extracted", "captured"].includes(assertion.sourceVersionExtractionState ?? "")
    && ["supports", "partially_supports", "qualifies", "reproduces"].includes(assertion.relationship ?? "");
}

function hasLocator(assertion: StoryAssertionSnapshot): boolean {
  return (present(assertion.startLocator) && present(assertion.endLocator))
    || (present(assertion.sourceChunkStartLocator) && present(assertion.sourceChunkEndLocator));
}

function assessmentForStory(story: StoryCandidateSnapshot, asOf: string): CandidateAssessment {
  const asOfMs = Date.parse(asOf);
  const recencyDays = dateDaysAgo(story.publishedAt, asOfMs);
  const reasons: Array<{ code: string; detail: string }> = [];
  const remediation: RemediationAction[] = [];
  let hardExclude = false;
  const storyId = String(story.id);

  if (story.publicationStatus !== "published") {
    addReason(reasons, "not_published", "The story is not in the accepted public publication state.");
    hardExclude = true;
  }
  if (recencyDays === null || recencyDays > TRACE_V1_M1_RECENCY_DAYS) {
    addReason(reasons, "not_recent", `Published date is missing, invalid, or older than ${TRACE_V1_M1_RECENCY_DAYS} days.`);
    hardExclude = true;
  }
  if (story.evidenceStatus && ["disputed", "corrected", "superseded", "outdated"].includes(story.evidenceStatus)) {
    addReason(reasons, "story_evidence_status_excluded", `Story evidence status is ${story.evidenceStatus}; it cannot be promoted by this planner.`);
    hardExclude = true;
  }
  if (story.publishedCorrection) {
    addReason(reasons, "published_correction", "A published correction is attached to the story or one of its claims.");
    hardExclude = true;
  }
  if (story.unresolvedConflict) {
    addReason(reasons, "unresolved_conflict", "An unresolved contradiction or dispute is attached to the story evidence graph.");
    hardExclude = true;
  }
  if (!present(story.slug)) {
    addReason(reasons, "missing_slug", "The public story route requires a stable slug.");
    addAction(remediation, { action: "review_story_publication_metadata", targetType: "story_cluster", targetId: storyId, reasonCode: "missing_slug", requiredReview: "publisher", fields: ["slug"] });
  }
  if (!story.summaryPresent) {
    addReason(reasons, "missing_summary", "The public story predicate requires a non-empty reviewed summary.");
    addAction(remediation, { action: "review_story_publication_metadata", targetType: "story_cluster", targetId: storyId, reasonCode: "missing_summary", requiredReview: "publisher", fields: ["summary", "reviewed_by", "reviewed_at"] });
  }
  if (!story.hasPublishedFeedMember) {
    addReason(reasons, "missing_published_feed_member", "The accepted public-story predicate requires at least one published feed member.");
    addAction(remediation, { action: "review_story_feed_membership", targetType: "story_cluster", targetId: storyId, reasonCode: "missing_published_feed_member", requiredReview: "publisher", fields: ["story_cluster_members", "feed_items.ingestion_status"] });
  }
  if (!story.reviewedBy || !story.reviewedAt) {
    addReason(reasons, "story_review_missing", "The story lacks the accepted publisher review markers.");
    addAction(remediation, { action: "review_story_publication_metadata", targetType: "story_cluster", targetId: storyId, reasonCode: "story_review_missing", requiredReview: "publisher", fields: ["reviewed_by", "reviewed_at"] });
  }

  let currentEligibleAssertionCount = 0;
  let completeClaims = 0;
  if (story.claims.length === 0) {
    addReason(reasons, "missing_canonical_claim_links", "No story-to-canonical-claim links are present.");
    addAction(remediation, { action: "review_story_claim_linkage", targetType: "story_cluster", targetId: storyId, reasonCode: "missing_canonical_claim_links", requiredReview: "publisher", fields: ["canonical_claim_id", "role", "materiality", "reviewed_by", "reviewed_at"] });
  }

  for (const claim of story.claims) {
    const claimId = claim.canonicalClaimId;
    if (!claim.claimExists) {
      addReason(reasons, "canonical_claim_missing", `Linked canonical claim ${claimId} does not exist.`);
      addAction(remediation, { action: "review_story_claim_linkage", targetType: "canonical_claim", targetId: claimId, reasonCode: "canonical_claim_missing", requiredReview: "publisher", fields: ["canonical_claim_id", "claim_text", "claim_state"] });
      continue;
    }
    if (!claim.reviewedBy || !claim.reviewedAt) {
      addReason(reasons, "story_claim_link_unreviewed", `Story claim link ${claimId} lacks publisher review markers.`);
      addAction(remediation, { action: "review_story_claim_linkage", targetType: "story_claim", targetId: `${storyId}:${claimId}`, reasonCode: "story_claim_link_unreviewed", requiredReview: "publisher", fields: ["reviewed_by", "reviewed_at"] });
    }
    if (["corrected", "superseded", "retired", "disputed"].includes(claim.claimState ?? "")) {
      addReason(reasons, "canonical_claim_state_excluded", `Canonical claim ${claimId} is ${claim.claimState} and cannot support a v1 launch story.`);
      hardExclude = true;
    }
    const eligible = claim.assertions.filter(currentAssertion);
    currentEligibleAssertionCount += eligible.length;
    if (eligible.length === 0) {
      const states = [...new Set(claim.assertions.map((assertion) => assertion.freshnessState ?? "missing"))].sort().join(", ") || "none";
      addReason(reasons, "no_current_reviewed_evidence", `Canonical claim ${claimId} has no admitted, accepted, current external evidence (observed states: ${states}).`);
      addAction(remediation, { action: "review_claim_assertion", targetType: "canonical_claim", targetId: claimId, reasonCode: "no_current_reviewed_evidence", requiredReview: "publisher", fields: ["assertion_id", "admission_state", "reviewer_state", "freshness_state", "evidence_treatment", "relationship"] });
    } else {
      let claimComplete = true;
      for (const assertion of eligible) {
        const assertionId = assertion.id;
        if (!present(assertion.sourceDocumentId) || assertion.sourceDocumentAdmissionState !== "admitted") {
          claimComplete = false;
          addReason(reasons, "missing_admitted_source_document", `Assertion ${assertionId} has no admitted source document.`);
          addAction(remediation, { action: "register_source_document", targetType: "claim_assertion", targetId: assertionId, reasonCode: "missing_admitted_source_document", requiredReview: "operator", fields: ["canonical_url", "source_id", "admission_state"] });
        }
        if (!present(assertion.sourceDocumentVersionId) || assertion.sourceDocumentCurrentVersionId !== assertion.sourceDocumentVersionId) {
          claimComplete = false;
          addReason(reasons, "missing_current_source_version", `Assertion ${assertionId} is not attached to the source document's current captured version.`);
          addAction(remediation, { action: "capture_source_document_version", targetType: "claim_assertion", targetId: assertionId, reasonCode: "missing_current_source_version", requiredReview: "operator", fields: ["source_document_version_id", "content_hash", "retrieved_url", "retrieved_at", "extraction_status"] });
        }
        if (!present(assertion.sourceChunkId) || !hasLocator(assertion)) {
          claimComplete = false;
          addReason(reasons, "missing_locator", `Assertion ${assertionId} lacks a source chunk and resolvable start/end locator.`);
          addAction(remediation, { action: "capture_source_chunk_locator", targetType: "claim_assertion", targetId: assertionId, reasonCode: "missing_locator", requiredReview: "publisher", fields: ["source_chunk_id", "start_locator", "end_locator", "text_hash"] });
        }
        if (!present(assertion.provenanceGroupId)) {
          claimComplete = false;
          addReason(reasons, "missing_provenance_group", `Assertion ${assertionId} has no provenance-group assignment.`);
          addAction(remediation, { action: "review_provenance_group", targetType: "claim_assertion", targetId: assertionId, reasonCode: "missing_provenance_group", requiredReview: "publisher", fields: ["provenance_group_id", "relationship", "determination_method"] });
        }
        if (!httpUrl(assertion.sourceUrl ?? assertion.sourceVersionRetrievedUrl)) {
          claimComplete = false;
          addReason(reasons, "missing_source_url", `Assertion ${assertionId} has no valid source URL.`);
          addAction(remediation, { action: "review_source_url", targetType: "claim_assertion", targetId: assertionId, reasonCode: "missing_source_url", requiredReview: "publisher", fields: ["canonical_url", "retrieved_url"] });
        }
        if (assertion.relationship === "contradicts" || assertion.isDisputed) {
          claimComplete = false;
          addReason(reasons, "disputed_assertion", `Assertion ${assertionId} is contradictory or explicitly disputed.`);
          hardExclude = true;
        }
      }
      if (claimComplete) completeClaims += 1;
    }
    if (claim.assertions.some((assertion) => ["unknown", "stale"].includes(assertion.freshnessState ?? ""))) {
      addReason(reasons, "freshness_review_required", `Canonical claim ${claimId} includes evidence that is not current.`);
      addAction(remediation, { action: "request_freshness_review", targetType: "canonical_claim", targetId: claimId, reasonCode: "freshness_review_required", requiredReview: "publisher", fields: ["claim_assertion_id", "source_document_version_id", "proposed_freshness_state", "review_reason"] });
    }
  }

  const evidenceCompleteness = story.claims.length === 0 ? 0 : Math.round((completeClaims / story.claims.length) * 100);
  const classification = hardExclude ? "EXCLUDE_FROM_V1" : reasons.length > 0 ? "REMEDIATION_REQUIRED" : "LAUNCH_READY";
  return {
    classification,
    id: storyId,
    title: story.title,
    topic: story.topic ?? null,
    reasons,
    remediation,
    claimCount: story.claims.length,
    currentEligibleAssertionCount,
    evidenceCompleteness,
    recencyDays,
  };
}

function storyOrder(a: CandidateAssessment, b: CandidateAssessment): number {
  const classificationRank = { LAUNCH_READY: 0, REMEDIATION_REQUIRED: 1, EXCLUDE_FROM_V1: 2 } as const;
  return classificationRank[a.classification] - classificationRank[b.classification]
    || (b.recencyDays ?? Number.MAX_SAFE_INTEGER) - (a.recencyDays ?? Number.MAX_SAFE_INTEGER)
    || b.evidenceCompleteness - a.evidenceCompleteness
    || b.currentEligibleAssertionCount - a.currentEligibleAssertionCount
    || (a.topic ?? "").localeCompare(b.topic ?? "")
    || a.id.localeCompare(b.id);
}

export async function buildStoryLaunchPlan(
  stories: StoryCandidateSnapshot[],
  options: { asOf?: string; maxCandidates?: number } = {},
): Promise<StoryLaunchPlan> {
  const asOf = options.asOf ?? new Date().toISOString();
  const candidates = stories.map((story) => assessmentForStory(story, asOf));
  const ordered = [...candidates].sort(storyOrder);
  const counts = {
    LAUNCH_READY: candidates.filter((candidate) => candidate.classification === "LAUNCH_READY").length,
    REMEDIATION_REQUIRED: candidates.filter((candidate) => candidate.classification === "REMEDIATION_REQUIRED").length,
    EXCLUDE_FROM_V1: candidates.filter((candidate) => candidate.classification === "EXCLUDE_FROM_V1").length,
  } as const;
  const bestCandidates = ordered.slice(0, Math.min(options.maxCandidates ?? TRACE_V1_M1_MAX_STORIES, TRACE_V1_M1_MAX_STORIES));
  const unsigned = { version: TRACE_V1_M1_VERSION, asOf, recencyDays: TRACE_V1_M1_RECENCY_DAYS, targetMaximum: TRACE_V1_M1_MAX_STORIES, counts, candidates, bestCandidates };
  return { ...unsigned, planFingerprint: await fingerprint(unsigned) };
}

export interface KnowledgeAssertionSnapshot {
  assertionId: string;
  canonicalClaimId: string;
  admissionState?: string | null;
  reviewerState?: string | null;
  freshnessState?: string | null;
  relationship?: string | null;
  sourceRole?: string | null;
  evidenceTreatment?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentAdmissionState?: string | null;
  sourceDocumentVersionId?: string | null;
  sourceDocumentCurrentVersionId?: string | null;
  sourceVersionExtractionState?: string | null;
  sourceChunkId?: string | null;
  locatorPresent?: boolean;
  sourceUrl?: string | null;
}

export interface KnowledgeCandidateSnapshot {
  id: string;
  canonicalQuestion: string;
  status?: string | null;
  visibility?: string | null;
  evidenceStatus?: string | null;
  contentPresent: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  reviewAfter?: string | null;
  hardExpiry?: string | null;
  claimLinks: Array<{ canonicalClaimId: string; claimState?: string | null; reviewedBy?: string | null; reviewedAt?: string | null }>;
  assertions: KnowledgeAssertionSnapshot[];
  publishedCorrection?: boolean;
  unresolvedConflict?: boolean;
}

export interface KnowledgeAssessment {
  classification: "LAUNCH_READY" | "REMEDIATION_REQUIRED" | "EXCLUDE_FROM_V1";
  id: string;
  canonicalQuestion: string;
  reasons: Array<{ code: string; detail: string }>;
  remediation: RemediationAction[];
  linkedClaimCount: number;
  currentEligibleAssertionCount: number;
}

export interface KnowledgeLaunchPlan {
  version: typeof TRACE_V1_M1_VERSION;
  target: number;
  counts: Record<"LAUNCH_READY" | "REMEDIATION_REQUIRED" | "EXCLUDE_FROM_V1", number>;
  candidates: KnowledgeAssessment[];
  bestCandidates: KnowledgeAssessment[];
  planFingerprint: string;
}

function currentKnowledgeAssertion(assertion: KnowledgeAssertionSnapshot): boolean {
  return assertion.admissionState === "admitted"
    && assertion.reviewerState === "accepted"
    && assertion.freshnessState === "current"
    && assertion.sourceRole === "evidence"
    && assertion.evidenceTreatment === "factual_support"
    && ["supports", "qualifies", "partially_supports", "reports"].includes(assertion.relationship ?? "")
    && present(assertion.sourceDocumentId)
    && assertion.sourceDocumentAdmissionState === "admitted"
    && present(assertion.sourceDocumentVersionId)
    && assertion.sourceDocumentCurrentVersionId === assertion.sourceDocumentVersionId
    && ["extracted", "captured"].includes(assertion.sourceVersionExtractionState ?? "")
    && present(assertion.sourceChunkId)
    && assertion.locatorPresent === true
    && httpUrl(assertion.sourceUrl);
}

function assessKnowledge(document: KnowledgeCandidateSnapshot): KnowledgeAssessment {
  const reasons: Array<{ code: string; detail: string }> = [];
  const remediation: RemediationAction[] = [];
  let hardExclude = false;
  const id = document.id;
  if (document.status !== "approved") {
    addReason(reasons, "not_approved", "The knowledge document is not approved by a publisher.");
    hardExclude = true;
  }
  if (document.visibility === "retired" || document.status === "superseded" || document.status === "expired" || document.status === "rejected") {
    addReason(reasons, "knowledge_state_excluded", "The knowledge document is retired, expired, rejected, or superseded.");
    hardExclude = true;
  }
  if (!document.contentPresent) {
    addReason(reasons, "missing_content", "The candidate has no actual reviewed knowledge content.");
    addAction(remediation, { action: "author_knowledge_content", targetType: "knowledge_document", targetId: id, reasonCode: "missing_content", requiredReview: "publisher", fields: ["direct_answer", "detailed_explanation", "document_json"] });
  }
  if (!document.approvedBy || !document.approvedAt) {
    addReason(reasons, "approval_markers_missing", "The document lacks the accepted approval identity and timestamp.");
    addAction(remediation, { action: "review_knowledge_approval", targetType: "knowledge_document", targetId: id, reasonCode: "approval_markers_missing", requiredReview: "publisher", fields: ["approved_by", "approved_at", "visibility"] });
  }
  if (document.visibility !== "public_knowledge") {
    addReason(reasons, "not_public_knowledge", "The candidate is not in the public knowledge visibility state.");
    addAction(remediation, { action: "review_knowledge_publication", targetType: "knowledge_document", targetId: id, reasonCode: "not_public_knowledge", requiredReview: "publisher", fields: ["visibility", "status"] });
  }
  if (document.publishedCorrection) {
    addReason(reasons, "published_correction", "A published correction is attached to the knowledge evidence graph.");
    hardExclude = true;
  }
  if (document.unresolvedConflict) {
    addReason(reasons, "unresolved_conflict", "An unresolved contradiction is attached to the knowledge evidence graph.");
    hardExclude = true;
  }
  if (document.claimLinks.length === 0) {
    addReason(reasons, "missing_knowledge_claim_links", "No reviewed knowledge-to-canonical-claim mappings are present.");
    addAction(remediation, { action: "review_knowledge_claim_mapping", targetType: "knowledge_document", targetId: id, reasonCode: "missing_knowledge_claim_links", requiredReview: "publisher", fields: ["canonical_claim_id", "section_key", "relationship", "reviewed_by", "reviewed_at"] });
  }
  const currentAssertions = document.assertions.filter(currentKnowledgeAssertion);
  if (currentAssertions.length === 0) {
    addReason(reasons, "missing_current_knowledge_evidence", "No mapped assertion has admitted, accepted, current, locator-backed external evidence.");
    addAction(remediation, { action: "review_knowledge_evidence_mapping", targetType: "knowledge_document", targetId: id, reasonCode: "missing_current_knowledge_evidence", requiredReview: "publisher", fields: ["claim_assertion_id", "relationship", "source_document_id", "source_chunk_id", "locator"] });
  }
  if (document.assertions.some((assertion) => ["unknown", "stale"].includes(assertion.freshnessState ?? ""))) {
    addReason(reasons, "freshness_review_required", "At least one mapped knowledge assertion is not current.");
    addAction(remediation, { action: "request_freshness_review", targetType: "knowledge_document", targetId: id, reasonCode: "freshness_review_required", requiredReview: "publisher", fields: ["claim_assertion_id", "source_document_version_id", "proposed_freshness_state", "review_reason"] });
  }
  for (const link of document.claimLinks) {
    if (!link.reviewedBy || !link.reviewedAt) {
      addReason(reasons, "knowledge_claim_link_unreviewed", `Knowledge claim mapping ${link.canonicalClaimId} lacks publisher review markers.`);
      addAction(remediation, { action: "review_knowledge_claim_mapping", targetType: "canonical_claim", targetId: link.canonicalClaimId, reasonCode: "knowledge_claim_link_unreviewed", requiredReview: "publisher", fields: ["knowledge_document_id", "section_key", "reviewed_by", "reviewed_at"] });
    }
    if (["corrected", "superseded", "retired", "disputed"].includes(link.claimState ?? "")) {
      addReason(reasons, "canonical_claim_state_excluded", `Mapped canonical claim ${link.canonicalClaimId} is ${link.claimState}.`);
      hardExclude = true;
    }
  }
  return {
    classification: hardExclude ? "EXCLUDE_FROM_V1" : reasons.length > 0 ? "REMEDIATION_REQUIRED" : "LAUNCH_READY",
    id,
    canonicalQuestion: document.canonicalQuestion,
    reasons,
    remediation,
    linkedClaimCount: document.claimLinks.length,
    currentEligibleAssertionCount: currentAssertions.length,
  };
}

export async function buildKnowledgeLaunchPlan(
  documents: KnowledgeCandidateSnapshot[],
  options: { maxCandidates?: number } = {},
): Promise<KnowledgeLaunchPlan> {
  const candidates = documents.map(assessKnowledge);
  const ordered = [...candidates].sort((a, b) => b.currentEligibleAssertionCount - a.currentEligibleAssertionCount || b.linkedClaimCount - a.linkedClaimCount || a.id.localeCompare(b.id));
  const counts = {
    LAUNCH_READY: candidates.filter((candidate) => candidate.classification === "LAUNCH_READY").length,
    REMEDIATION_REQUIRED: candidates.filter((candidate) => candidate.classification === "REMEDIATION_REQUIRED").length,
    EXCLUDE_FROM_V1: candidates.filter((candidate) => candidate.classification === "EXCLUDE_FROM_V1").length,
  } as const;
  const unsigned = { version: TRACE_V1_M1_VERSION, target: TRACE_V1_M1_KNOWLEDGE_TARGET, counts, candidates, bestCandidates: ordered.slice(0, options.maxCandidates ?? TRACE_V1_M1_KNOWLEDGE_TARGET) };
  return { ...unsigned, planFingerprint: await fingerprint(unsigned) };
}

export interface SourceCohortSnapshot {
  id: number;
  name: string;
  connector: string;
  active: boolean;
  healthStatus: string;
  consecutiveFailures: number;
  lastSuccessAt?: string | null;
  recentSuccessfulFetches: number;
  section?: string | null;
  treatment?: string | null;
  tier?: string | null;
}

export interface SourceCohortAssessment {
  id: string;
  name: string;
  classification: "CORE_V1" | "OPTIONAL_V1" | "DEFER" | "DISABLE_CANDIDATE" | "UNSUPPORTED_CONNECTOR";
  reasons: string[];
  recommended: boolean;
}

export interface SourceCohortPlan {
  version: typeof TRACE_V1_M1_VERSION;
  supportedConnectors: string[];
  assessments: SourceCohortAssessment[];
  recommendedCore: SourceCohortAssessment[];
  repairOrDisableCandidates: SourceCohortAssessment[];
  planFingerprint: string;
}

const SUPPORTED_SOURCE_CONNECTORS = ["rss", "github_api", "arxiv_api", "hackernews_api", "page_diff"] as const;
const AI_AGENT_TERMS = ["ai", "agent", "model", "llm", "mcp", "openai", "anthropic", "hugging", "github", "arxiv", "research", "developer", "coding"];

export async function buildSourceCohortPlan(sources: SourceCohortSnapshot[]): Promise<SourceCohortPlan> {
  const assessments = sources.map((source): SourceCohortAssessment => {
    const reasons: string[] = [];
    const lower = `${source.name} ${source.section ?? ""} ${source.treatment ?? ""}`.toLowerCase();
    const relevant = AI_AGENT_TERMS.some((term) => lower.includes(term));
    if (!SUPPORTED_SOURCE_CONNECTORS.includes(source.connector as typeof SUPPORTED_SOURCE_CONNECTORS[number])) {
      reasons.push(`connector ${source.connector} is not admitted by the current scheduled connector allowlist`);
      return { id: String(source.id), name: source.name, classification: "UNSUPPORTED_CONNECTOR", reasons, recommended: false };
    }
    if (source.healthStatus === "failing" || source.consecutiveFailures >= 3) {
      reasons.push("source is failing or has at least three consecutive failures");
      return { id: String(source.id), name: source.name, classification: "DISABLE_CANDIDATE", reasons, recommended: false };
    }
    if (source.healthStatus !== "healthy" || source.recentSuccessfulFetches === 0) {
      reasons.push("source lacks a current healthy state and recent successful fetch evidence");
      return { id: String(source.id), name: source.name, classification: "DEFER", reasons, recommended: false };
    }
    if (!relevant) {
      reasons.push("source is healthy but its registry metadata does not demonstrate AI/Agents v1 relevance");
      return { id: String(source.id), name: source.name, classification: "OPTIONAL_V1", reasons, recommended: false };
    }
    if (source.connector === "page_diff" || source.tier === "C" || source.treatment?.toLowerCase().includes("discovery")) {
      reasons.push("source is useful for discovery or change detection but is not a primary v1 backbone");
      return { id: String(source.id), name: source.name, classification: "OPTIONAL_V1", reasons, recommended: false };
    }
    reasons.push("supported connector, healthy state, recent successful fetch, and AI/Agents relevance");
    return { id: String(source.id), name: source.name, classification: "CORE_V1", reasons, recommended: true };
  }).sort((a, b) => a.classification.localeCompare(b.classification) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const unsigned = {
    version: TRACE_V1_M1_VERSION,
    supportedConnectors: [...SUPPORTED_SOURCE_CONNECTORS],
    assessments,
    recommendedCore: assessments.filter((source) => source.classification === "CORE_V1"),
    repairOrDisableCandidates: assessments.filter((source) => ["DISABLE_CANDIDATE", "UNSUPPORTED_CONNECTOR"].includes(source.classification)),
  };
  return { ...unsigned, planFingerprint: await fingerprint(unsigned) };
}

export interface AskReadinessProjection {
  currentEligibleAssertions: number;
  launchReadyStories: number;
  launchReadyKnowledgePages: number;
  resolvableCitations: number;
  deterministicInsufficiencyCandidates: number;
  projectedAfterApprovedRemediation: {
    storiesWithEvidencePlan: number;
    knowledgePagesWithEvidencePlan: number;
  };
}

export function projectAskReadiness(
  stories: StoryLaunchPlan,
  knowledge: KnowledgeLaunchPlan,
  currentEligibleAssertions: number,
  resolvableCitations: number,
): AskReadinessProjection {
  return {
    currentEligibleAssertions,
    launchReadyStories: stories.counts.LAUNCH_READY,
    launchReadyKnowledgePages: knowledge.counts.LAUNCH_READY,
    resolvableCitations,
    deterministicInsufficiencyCandidates: stories.candidates.filter((candidate) => candidate.currentEligibleAssertionCount === 0).length
      + knowledge.candidates.filter((candidate) => candidate.currentEligibleAssertionCount === 0).length,
    projectedAfterApprovedRemediation: {
      storiesWithEvidencePlan: stories.candidates.filter((candidate) => candidate.classification === "REMEDIATION_REQUIRED" && candidate.remediation.length > 0).length,
      knowledgePagesWithEvidencePlan: knowledge.candidates.filter((candidate) => candidate.classification === "REMEDIATION_REQUIRED" && candidate.remediation.length > 0).length,
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonicalize(value))));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
