/**
 * Mission 2 activation preflight.  This is a local schema inspection only;
 * it never connects to or mutates a remote D1 database.
 */

import {
  inspectTraceV1M2Compatibility,
  type CompatibilityPreflightResult,
  type SchemaCatalogSnapshot,
} from "./trace-v1-m2-contract";

export const TRACE_V1_M2_ACTIVATION_PREFLIGHT_VERSION = "trace-v1-m2-activation-preflight-v1" as const;

export interface TraceV1M2SchemaObjectCatalog {
  tables: readonly string[];
  indexes: readonly string[];
  triggers: readonly string[];
}

export interface TraceV1M2ActivationCatalog extends SchemaCatalogSnapshot {
  objects: TraceV1M2SchemaObjectCatalog;
}

export type TraceV1M2ActivationDisposition = "ACTIVATION_ALLOWED" | "MIGRATION_REQUIRED" | "FAIL_CLOSED";

export interface TraceV1M2ActivationPreflightResult extends CompatibilityPreflightResult {
  activationPreflightVersion: typeof TRACE_V1_M2_ACTIVATION_PREFLIGHT_VERSION;
  activationDisposition: TraceV1M2ActivationDisposition;
  requiredTables: readonly string[];
  requiredIndexes: readonly string[];
  requiredTriggers: readonly string[];
  missingObjects: readonly string[];
  ambiguousObjects: readonly string[];
  activationBlocked: boolean;
}

export const TRACE_V1_M2_REQUIRED_TABLES = Object.freeze([
  "evidence_freshness_reviews",
  "trace_v1_activation_receipts",
] as const);
export const TRACE_V1_M2_REQUIRED_INDEXES = Object.freeze([
  "idx_evidence_freshness_reviews_queue",
  "idx_evidence_freshness_reviews_assertion",
  "idx_trace_v1_activation_receipts_manifest",
] as const);
export const TRACE_V1_M2_REQUIRED_TRIGGERS = Object.freeze([
  "prevent_evidence_freshness_review_delete",
  "prevent_evidence_freshness_review_core_update",
] as const);

export function inspectTraceV1M2ActivationPreflight(
  catalog: TraceV1M2ActivationCatalog,
): TraceV1M2ActivationPreflightResult {
  const compatibility = inspectTraceV1M2Compatibility(catalog);
  const tables = new Set(catalog.objects?.tables ?? []);
  const indexes = new Set(catalog.objects?.indexes ?? []);
  const triggers = new Set(catalog.objects?.triggers ?? []);
  const missingObjects = [
    ...TRACE_V1_M2_REQUIRED_TABLES.filter((name) => !tables.has(name)).map((name) => `table:${name}`),
    ...TRACE_V1_M2_REQUIRED_INDEXES.filter((name) => !indexes.has(name)).map((name) => `index:${name}`),
    ...TRACE_V1_M2_REQUIRED_TRIGGERS.filter((name) => !triggers.has(name)).map((name) => `trigger:${name}`),
  ];
  const ambiguousObjects = catalog.objects ? [] : ["schema_objects"];
  const failClosed = compatibility.disposition === "FAIL_CLOSED" || ambiguousObjects.length > 0;
  const needsMigration = !failClosed && (compatibility.disposition === "MIGRATION_REQUIRED" || missingObjects.length > 0);
  const activationDisposition: TraceV1M2ActivationDisposition = failClosed
    ? "FAIL_CLOSED"
    : needsMigration ? "MIGRATION_REQUIRED" : "ACTIVATION_ALLOWED";
  return {
    ...compatibility,
    activationPreflightVersion: TRACE_V1_M2_ACTIVATION_PREFLIGHT_VERSION,
    activationDisposition,
    requiredTables: TRACE_V1_M2_REQUIRED_TABLES,
    requiredIndexes: TRACE_V1_M2_REQUIRED_INDEXES,
    requiredTriggers: TRACE_V1_M2_REQUIRED_TRIGGERS,
    missingObjects,
    ambiguousObjects,
    activationBlocked: activationDisposition !== "ACTIVATION_ALLOWED",
    disposition: activationDisposition,
    canApplyAdditiveMigration: compatibility.canApplyAdditiveMigration && !failClosed,
    ...(failClosed && !compatibility.stopReason ? { stopReason: "SCHEMA_INCOMPATIBLE" as const } : {}),
  };
}
