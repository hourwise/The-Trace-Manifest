/**
 * Mission 2 activation preflight.  This is a local schema inspection only;
 * it never connects to or mutates a remote D1 database.
 */

import {
  inspectTraceV1M2Compatibility,
  type CompatibilityDisposition,
  type CompatibilityPreflightResult,
  type SchemaCatalogSnapshot,
  type SchemaTableSnapshot,
} from "./trace-v1-m2-contract";
import { extractSqlCheckExpressions, maskSqlCommentsAndStrings, maskSqlNonExecutableTokens, stripSqlComments } from "./trace-v1-m1";

export const TRACE_V1_M2_ACTIVATION_PREFLIGHT_VERSION = "trace-v1-m2-activation-preflight-v2" as const;

export interface TraceV1M2SchemaIndexColumn {
  name: string;
  descending: boolean;
}

export interface TraceV1M2SchemaIndexDefinition {
  name: string;
  table: string;
  unique: boolean;
  columns: readonly TraceV1M2SchemaIndexColumn[];
}

export interface TraceV1M2SchemaTriggerDefinition {
  name: string;
  table: string;
  sql: string | null;
}

export interface TraceV1M2SchemaObjectCatalog {
  tables: readonly string[];
  indexes: readonly string[];
  triggers: readonly string[];
  indexDefinitions: readonly TraceV1M2SchemaIndexDefinition[];
  triggerDefinitions: readonly TraceV1M2SchemaTriggerDefinition[];
}

export interface TraceV1M2ActivationCatalog extends SchemaCatalogSnapshot {
  objects: TraceV1M2SchemaObjectCatalog;
}

export type TraceV1M2ActivationDisposition = "ACTIVATION_ALLOWED" | "ACTIVATION_BLOCKED";

export interface TraceV1M2ActivationPreflightResult extends CompatibilityPreflightResult {
  activationPreflightVersion: typeof TRACE_V1_M2_ACTIVATION_PREFLIGHT_VERSION;
  activationDisposition: TraceV1M2ActivationDisposition;
  compatibilityDisposition: CompatibilityDisposition;
  requiredTables: readonly string[];
  requiredIndexes: readonly string[];
  requiredTriggers: readonly string[];
  missingObjects: readonly string[];
  ambiguousObjects: readonly string[];
  invalidObjects: readonly string[];
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

interface RequiredActivationColumn {
  name: string;
  declaredType: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number;
}

interface RequiredActivationTable {
  name: string;
  columns: readonly RequiredActivationColumn[];
  foreignKeys: readonly { from: string; table: string; to: string; onDelete: string; onUpdate: string }[];
  requiredChecks?: readonly { column: string; values: readonly string[] }[];
  requiredUniqueIndexes?: readonly { columns: readonly string[] }[];
}

const REQUIRED_ACTIVATION_TABLES: readonly RequiredActivationTable[] = [
  {
    name: "evidence_freshness_reviews",
    columns: [
      { name: "id", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 1 },
      { name: "claim_assertion_id", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "prior_state", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "proposed_state", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "source_document_version_id", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "reason", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "state", declaredType: "TEXT", notNull: true, defaultValue: "pending", primaryKeyPosition: 0 },
      { name: "requested_by", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "requested_at", declaredType: "TEXT", notNull: true, defaultValue: "datetime('now')", primaryKeyPosition: 0 },
      { name: "reviewed_by", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "reviewed_at", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "review_note", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "idempotency_key", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "request_fingerprint", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
    ],
    foreignKeys: [
      { from: "claim_assertion_id", table: "claim_assertions", to: "id", onDelete: "RESTRICT", onUpdate: "NO ACTION" },
      { from: "source_document_version_id", table: "source_document_versions", to: "id", onDelete: "RESTRICT", onUpdate: "NO ACTION" },
    ],
    requiredUniqueIndexes: [{ columns: ["idempotency_key"] }],
  },
  {
    name: "trace_v1_activation_receipts",
    columns: [
      { name: "operation_key", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 1 },
      { name: "manifest_id", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "manifest_hash", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "item_type", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "item_id", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "stage", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "environment", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "source_id", declaredType: "INTEGER", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "canonical_source_url", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "canonical_source_url_hash", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "connector", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "source_document_id", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "source_document_version_id", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "content_hash", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "transport_hash", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "normalized_content_hash", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "hash_semantics_version", declaredType: "TEXT", notNull: false, defaultValue: null, primaryKeyPosition: 0 },
      { name: "outcome", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "reason_code", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "detail", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "receipt_fingerprint", declaredType: "TEXT", notNull: true, defaultValue: null, primaryKeyPosition: 0 },
      { name: "created_at", declaredType: "TEXT", notNull: true, defaultValue: "datetime('now')", primaryKeyPosition: 0 },
    ],
    foreignKeys: [],
    requiredChecks: [
      { column: "item_type", values: ["story", "knowledge"] },
      { column: "environment", values: ["LOCAL_TEST", "PREVIEW", "PRODUCTION"] },
      { column: "outcome", values: ["completed", "replayed", "blocked", "failed"] },
    ],
  },
] as const;

interface RequiredActivationIndex {
  name: string;
  table: string;
  unique: boolean;
  columns: readonly TraceV1M2SchemaIndexColumn[];
}

const REQUIRED_ACTIVATION_INDEXES: readonly RequiredActivationIndex[] = [
  { name: "idx_evidence_freshness_reviews_queue", table: "evidence_freshness_reviews", unique: false, columns: [{ name: "state", descending: false }, { name: "requested_at", descending: false }] },
  { name: "idx_evidence_freshness_reviews_assertion", table: "evidence_freshness_reviews", unique: false, columns: [{ name: "claim_assertion_id", descending: false }, { name: "requested_at", descending: true }] },
  { name: "idx_trace_v1_activation_receipts_manifest", table: "trace_v1_activation_receipts", unique: false, columns: [{ name: "manifest_hash", descending: false }, { name: "item_id", descending: false }] },
] as const;

const SQL_IDENTIFIER = String.raw`(?:[A-Za-z_][A-Za-z0-9_$]*|"(?:[^"]|"")*"|\`(?:[^\`]|\`\`)*\`|\[[^\]]+\])`;

function unquoteIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replaceAll('""', '"');
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) return trimmed.slice(1, -1).replaceAll("``", "`");
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed.slice(1, -1);
  return trimmed;
}

function normalizedIdentifier(value: string): string {
  return unquoteIdentifier(value).trim().toLowerCase();
}

function splitSqlList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index++;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function parseInCheckExpression(expression: string): { column: string; values: string[] } | null {
  const cleaned = stripSqlComments(expression).trim();
  const match = cleaned.match(new RegExp(`^(${SQL_IDENTIFIER})\\s+IN\\s*\\((.*)\\)$`, "i"));
  if (!match) return null;
  const values = splitSqlList(match[2]).map((value) => {
    const trimmed = value.trim();
    return trimmed.startsWith("'") && trimmed.endsWith("'")
      ? trimmed.slice(1, -1).replaceAll("''", "'")
      : trimmed;
  });
  return { column: normalizedIdentifier(match[1]), values };
}

function normalizedDefault(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const unquoted = normalized.startsWith("'") && normalized.endsWith("'")
    ? normalized.slice(1, -1).replaceAll("''", "'")
    : normalized;
  return unquoted.replace(/^\((.*)\)$/, "$1").replace(/\s+/g, " ");
}

function validateTableDefinition(
  table: SchemaTableSnapshot | undefined,
  expected: RequiredActivationTable,
  indexDefinitions: readonly TraceV1M2SchemaIndexDefinition[],
): string[] {
  if (!table) return [`table:${expected.name}:definition_missing`];
  const issues: string[] = [];
  for (const required of expected.columns) {
    const actual = table.columns.find((column) => column.name === required.name);
    if (!actual) {
      issues.push(`table:${expected.name}:column:${required.name}:missing`);
      continue;
    }
    if ((actual.declaredType ?? "").trim().toUpperCase() !== required.declaredType) issues.push(`table:${expected.name}:column:${required.name}:type`);
    if (actual.notNull !== required.notNull) issues.push(`table:${expected.name}:column:${required.name}:nullability`);
    if (normalizedDefault(actual.defaultValue) !== normalizedDefault(required.defaultValue)) issues.push(`table:${expected.name}:column:${required.name}:default`);
    if ((actual.primaryKeyPosition ?? 0) !== required.primaryKeyPosition) issues.push(`table:${expected.name}:column:${required.name}:primary_key`);
  }
  const foreignKeys = table.foreignKeys ?? [];
  for (const required of expected.foreignKeys) {
    const actual = foreignKeys.find((foreignKey) => foreignKey.from === required.from);
    if (!actual || actual.table !== required.table || actual.to !== required.to || actual.onDelete.toUpperCase() !== required.onDelete || actual.onUpdate.toUpperCase() !== required.onUpdate) {
      issues.push(`table:${expected.name}:foreign_key:${required.from}`);
    }
  }
  const checks = extractSqlCheckExpressions(table.createSql)
    .map(parseInCheckExpression)
    .filter((check): check is { column: string; values: string[] } => check !== null);
  for (const required of expected.requiredChecks ?? []) {
    const present = checks.some((check) => check.column === required.column.toLowerCase()
      && JSON.stringify(check.values.map((value) => value.toLowerCase())) === JSON.stringify(required.values.map((value) => value.toLowerCase())));
    if (!present) issues.push(`table:${expected.name}:check:${required.column}`);
  }
  for (const required of expected.requiredUniqueIndexes ?? []) {
    const present = indexDefinitions.some((definition) => definition.table === expected.name
      && definition.unique
      && JSON.stringify(definition.columns.map((column) => column.name.toLowerCase())) === JSON.stringify(required.columns.map((column) => column.toLowerCase())));
    if (!present) issues.push(`table:${expected.name}:unique:${required.columns.join(",")}`);
  }
  return issues;
}

function validateIndexDefinition(definition: TraceV1M2SchemaIndexDefinition | undefined, expected: RequiredActivationIndex): string[] {
  if (!definition) return [`index:${expected.name}:definition_missing`];
  const actualColumns = definition.columns.map((column) => `${column.name}:${column.descending ? "desc" : "asc"}`);
  const expectedColumns = expected.columns.map((column) => `${column.name}:${column.descending ? "desc" : "asc"}`);
  return definition.table !== expected.table || definition.unique !== expected.unique || JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)
    ? [`index:${expected.name}:definition`]
    : [];
}

function parseTriggerSql(sql: string | null): {
  name: string;
  timing: string;
  event: string;
  updateColumns: string[];
  table: string;
  body: string;
} | null {
  if (!sql) return null;
  const masked = maskSqlCommentsAndStrings(sql);
  const match = masked.match(new RegExp(`^\\s*CREATE\\s+TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${SQL_IDENTIFIER})\\s+([\\s\\S]+?)\\s+BEGIN\\b`, "i"));
  if (!match) return null;
  const header = match[2].trim();
  const simple = header.match(new RegExp(`^(BEFORE|AFTER|INSTEAD\\s+OF)\\s+(INSERT|DELETE)\\s+ON\\s+(${SQL_IDENTIFIER})$`, "i"));
  if (simple) {
    return { name: normalizedIdentifier(match[1]), timing: simple[1].toLowerCase(), event: simple[2].toLowerCase(), updateColumns: [], table: normalizedIdentifier(simple[3]), body: maskSqlNonExecutableTokens(sql).slice(match[0].length) };
  }
  const update = header.match(new RegExp(`^(BEFORE|AFTER|INSTEAD\\s+OF)\\s+UPDATE\\s+OF\\s+([\\s\\S]+?)\\s+ON\\s+(${SQL_IDENTIFIER})$`, "i"));
  if (!update) return null;
  return {
    name: normalizedIdentifier(match[1]),
    timing: update[1].toLowerCase(),
    event: "update",
    updateColumns: splitSqlList(update[2]).map(normalizedIdentifier),
    table: normalizedIdentifier(update[3]),
    body: maskSqlNonExecutableTokens(sql).slice(match[0].length),
  };
}

function triggerMatches(definition: TraceV1M2SchemaTriggerDefinition | undefined, expectedName: string): boolean {
  if (!definition) return false;
  const parsed = parseTriggerSql(definition.sql);
  if (!parsed || parsed.name !== expectedName.toLowerCase() || parsed.table !== "evidence_freshness_reviews" || definition.table.toLowerCase() !== parsed.table) return false;
  const aborts = /\bSELECT\s+RAISE\s*\(\s*ABORT\s*,/i.test(parsed.body);
  if (expectedName === "prevent_evidence_freshness_review_delete") {
    return parsed.timing === "before" && parsed.event === "delete" && parsed.updateColumns.length === 0 && aborts;
  }
  return parsed.timing === "before"
    && parsed.event === "update"
    && JSON.stringify(parsed.updateColumns) === JSON.stringify(["claim_assertion_id", "prior_state", "proposed_state", "source_document_version_id", "reason", "requested_by", "requested_at", "idempotency_key", "request_fingerprint"])
    && aborts;
}

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
  const invalidObjects = catalog.objects
    ? [
        ...REQUIRED_ACTIVATION_TABLES.flatMap((expected) => tables.has(expected.name) ? validateTableDefinition(catalog.tables[expected.name], expected, catalog.objects.indexDefinitions ?? []) : []),
        ...REQUIRED_ACTIVATION_INDEXES.flatMap((expected) => indexes.has(expected.name) ? validateIndexDefinition((catalog.objects.indexDefinitions ?? []).find((definition) => definition.name === expected.name), expected) : []),
        ...TRACE_V1_M2_REQUIRED_TRIGGERS.filter((name) => triggers.has(name) && !triggerMatches((catalog.objects.triggerDefinitions ?? []).find((definition) => definition.name === name), name)).map((name) => `trigger:${name}:definition`),
      ]
    : ["schema_objects:definitions_missing"];
  const failClosed = compatibility.disposition === "FAIL_CLOSED" || ambiguousObjects.length > 0 || invalidObjects.length > 0;
  const needsMigration = !failClosed && (compatibility.disposition === "MIGRATION_REQUIRED" || missingObjects.length > 0);
  const compatibilityDisposition: CompatibilityDisposition = failClosed
    ? "FAIL_CLOSED"
    : needsMigration ? "MIGRATION_REQUIRED" : "ACTIVATION_ALLOWED";
  const activationDisposition: TraceV1M2ActivationDisposition = compatibilityDisposition === "ACTIVATION_ALLOWED" && missingObjects.length === 0
    ? "ACTIVATION_ALLOWED"
    : "ACTIVATION_BLOCKED";
  return {
    ...compatibility,
    activationPreflightVersion: TRACE_V1_M2_ACTIVATION_PREFLIGHT_VERSION,
    activationDisposition,
    compatibilityDisposition,
    disposition: compatibilityDisposition,
    requiredTables: TRACE_V1_M2_REQUIRED_TABLES,
    requiredIndexes: TRACE_V1_M2_REQUIRED_INDEXES,
    requiredTriggers: TRACE_V1_M2_REQUIRED_TRIGGERS,
    missingObjects,
    ambiguousObjects,
    invalidObjects,
    activationBlocked: activationDisposition !== "ACTIVATION_ALLOWED",
    canApplyAdditiveMigration: compatibility.canApplyAdditiveMigration && !failClosed,
    ...(failClosed && !compatibility.stopReason ? { stopReason: "SCHEMA_INCOMPATIBLE" as const } : {}),
  };
}
