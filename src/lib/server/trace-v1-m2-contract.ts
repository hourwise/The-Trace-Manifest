/**
 * TRACE V1 Mission 2: the bounded evidence-capture compatibility contract.
 *
 * This module is intentionally pure. It describes and inspects a local schema
 * snapshot; it never opens D1, writes SQLite, or applies a migration.
 */

export const TRACE_V1_M2_CONTRACT_VERSION = "trace-v1-m2-compatibility-v1" as const;

export type CompatibilityStatus =
  | "ALREADY_COMPATIBLE"
  | "SUPPORTED_LEGACY_SHAPE"
  | "MISSING_ADDITIVE_FIELD"
  | "INCOMPATIBLE_SHAPE"
  | "AMBIGUOUS";

export type CompatibilityDisposition =
  | "ACTIVATION_ALLOWED"
  | "MIGRATION_REQUIRED"
  | "FAIL_CLOSED";

export interface RequiredFieldContract {
  table: string;
  column: string;
  sqliteType: "TEXT" | "INTEGER" | "BOOLEAN";
  nullable: boolean;
  defaultValue: string | number | null;
  acceptedDefaults?: readonly (string | number | null)[];
  allowedValues?: readonly string[];
  readers: readonly string[];
  writers: readonly string[];
  historicalMigrations: readonly string[];
  compatibilityAssumption: string;
  migrationSafeToAdd: boolean;
}

export interface SchemaColumnSnapshot {
  name: string;
  declaredType: string | null;
  notNull: boolean;
  defaultValue: string | null;
  primaryKeyPosition?: number;
}

export interface SchemaTableSnapshot {
  name: string;
  columns: readonly SchemaColumnSnapshot[];
  createSql?: string | null;
  distinctValues?: Readonly<Record<string, readonly (string | number | null)[]>>;
}

export interface SchemaCatalogSnapshot {
  /** Stable identity supplied by the local schema reader. */
  schemaIdentity: string | null;
  tables: Readonly<Record<string, SchemaTableSnapshot | undefined>>;
}

export interface CompatibilityFieldResult {
  table: string;
  column: string;
  status: CompatibilityStatus;
  contract: RequiredFieldContract;
  actual?: SchemaColumnSnapshot;
  detail: string;
  migrationSafeToAdd: boolean;
}

export interface CompatibilityPreflightResult {
  version: typeof TRACE_V1_M2_CONTRACT_VERSION;
  disposition: CompatibilityDisposition;
  schemaIdentity: string | null;
  fields: readonly CompatibilityFieldResult[];
  missingAdditiveFields: readonly CompatibilityFieldResult[];
  incompatibleFields: readonly CompatibilityFieldResult[];
  ambiguousFields: readonly CompatibilityFieldResult[];
  canApplyAdditiveMigration: boolean;
  activationBlocked: boolean;
  stopReason?: "SCHEMA_INCOMPATIBLE" | "SCHEMA_IDENTITY_UNRESOLVED";
}

const CONNECTOR_VALUES = [
  "rss",
  "github_api",
  "arxiv_api",
  "page_diff",
  "huggingface_api",
  "hackernews_api",
  "manual",
] as const;

const CORRECTION_VALUES = [
  "factual_error",
  "rating_change",
  "licence_correction",
  "pricing_correction",
  "benchmark_correction",
  "supersession",
  "deprecation",
  "methodology_update",
  "other",
] as const;

const HASH_SEMANTICS_VALUES = [
  "legacy_raw_v1",
  "normalized_content_v1",
  "normalized_content_v2",
  "normalized_content_v3",
] as const;

const READ_CAPTURE = ["source-capture.ts", "source-governance-state.ts"] as const;
const WRITE_CAPTURE = ["source-capture.ts", "source-governance-state.ts"] as const;

function field(
  input: Omit<RequiredFieldContract, "migrationSafeToAdd"> & { migrationSafeToAdd?: boolean },
): RequiredFieldContract {
  return { ...input, migrationSafeToAdd: input.migrationSafeToAdd ?? true };
}

/** The three accepted runtime blocker contracts. */
export const TRACE_V1_RUNTIME_BLOCKERS = Object.freeze([
  field({
    table: "sources",
    column: "ingestion_type",
    sqliteType: "TEXT",
    nullable: false,
    defaultValue: null,
    allowedValues: CONNECTOR_VALUES,
    readers: ["workers/ingestion/index.ts", "workers/ingestion/source-registry.ts"],
    writers: ["workers/ingestion/index.ts", "workers/ingestion/source-registry.ts"],
    historicalMigrations: ["db/schema.sql"],
    compatibilityAssumption: "The existing value domain must be the accepted connector domain; lmsys_api remains unsupported.",
    migrationSafeToAdd: false,
  }),
  field({
    table: "corrections",
    column: "correction_type",
    sqliteType: "TEXT",
    nullable: false,
    defaultValue: null,
    acceptedDefaults: [null, "other"],
    allowedValues: CORRECTION_VALUES,
    readers: ["src/lib/server/d1.ts", "src/lib/server/evidence-freshness-review.ts"],
    writers: ["workers/ingestion/corrections.ts"],
    historicalMigrations: ["db/schema.sql", "db/migration-production-legacy-claims-compatibility.sql"],
    compatibilityAssumption: "Current schema requires an explicit correction type; legacy Production default other is accepted because the writer supplies the enum explicitly and existing rows are not rewritten.",
  }),
  field({
    table: "corrections",
    column: "published",
    sqliteType: "BOOLEAN",
    nullable: false,
    defaultValue: 1,
    acceptedDefaults: [1, 0],
    readers: ["src/lib/server/d1.ts", "src/lib/server/evidence-freshness-review.ts"],
    writers: ["workers/ingestion/corrections.ts"],
    historicalMigrations: ["db/schema.sql", "db/migration-production-legacy-claims-compatibility.sql"],
    compatibilityAssumption: "Default 1 is current; legacy Production default 0 is supported as closed-by-default and is not rewritten.",
  }),
] as const);

/** The exact eight source_documents capture/retrieval fields. */
export const TRACE_V1_SOURCE_DOCUMENT_FIELDS = Object.freeze([
  field({
    table: "source_documents", column: "retrieval_state", sqliteType: "TEXT", nullable: false, defaultValue: "available",
    allowedValues: ["available", "unavailable", "paywalled", "policy_restricted"], readers: READ_CAPTURE, writers: WRITE_CAPTURE,
    historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Retrieval availability is explicit; the accepted initial default is available.",
  }),
  field({
    table: "source_documents", column: "retrieval_reason", sqliteType: "TEXT", nullable: true, defaultValue: null,
    readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Null means no retrieval reason was recorded.",
  }),
  field({
    table: "source_documents", column: "retrieval_diagnostics_json", sqliteType: "TEXT", nullable: false, defaultValue: "{}",
    readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Diagnostics remain opaque JSON text with an empty-object default.",
  }),
  field({
    table: "source_documents", column: "retrieval_retryable", sqliteType: "INTEGER", nullable: false, defaultValue: 0,
    allowedValues: ["0", "1"], readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "D1 boolean convention is integer-backed and constrained to 0/1.",
  }),
  field({
    table: "source_documents", column: "capture_state", sqliteType: "TEXT", nullable: false, defaultValue: "not_attempted",
    allowedValues: ["not_attempted", "captured", "metadata_only", "unsupported", "extraction_failed"], readers: READ_CAPTURE, writers: WRITE_CAPTURE,
    historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Capture is not claimed until a governed capture path records it.",
  }),
  field({
    table: "source_documents", column: "capture_reason", sqliteType: "TEXT", nullable: true, defaultValue: null,
    readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Null means no capture reason was recorded.",
  }),
  field({
    table: "source_documents", column: "capture_diagnostics_json", sqliteType: "TEXT", nullable: false, defaultValue: "{}",
    readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Diagnostics remain opaque JSON text with an empty-object default.",
  }),
  field({
    table: "source_documents", column: "capture_retryable", sqliteType: "INTEGER", nullable: false, defaultValue: 0,
    allowedValues: ["0", "1"], readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "D1 boolean convention is integer-backed and constrained to 0/1.",
  }),
] as const);

/** The exact eight source_document_versions hash/extraction/storage fields. */
export const TRACE_V1_SOURCE_DOCUMENT_VERSION_FIELDS = Object.freeze([
  field({
    table: "source_document_versions", column: "transport_hash", sqliteType: "TEXT", nullable: true, defaultValue: null,
    readers: ["src/lib/server/source-version-identity.ts", "src/lib/server/source-capture.ts"], writers: ["src/lib/server/source-capture.ts"],
    historicalMigrations: ["db/migration-0059-source-version-hash-semantics.sql"], compatibilityAssumption: "Null remains incomplete transport evidence; content_hash is not silently substituted for current versions.",
  }),
  field({
    table: "source_document_versions", column: "normalized_content_hash", sqliteType: "TEXT", nullable: true, defaultValue: null,
    readers: ["src/lib/server/source-version-identity.ts", "src/lib/server/source-capture.ts"], writers: ["src/lib/server/source-capture.ts"],
    historicalMigrations: ["db/migration-0059-source-version-hash-semantics.sql", "db/migration-0061-normalized-content-v2.sql", "db/migration-0062-normalized-content-v3-reference-drift.sql"], compatibilityAssumption: "Normalized identity uses the accepted versioned semantics, never a new URL-only equivalence.",
  }),
  field({
    table: "source_document_versions", column: "hash_semantics_version", sqliteType: "TEXT", nullable: false, defaultValue: "legacy_raw_v1",
    allowedValues: HASH_SEMANTICS_VALUES, readers: ["src/lib/server/source-version-identity.ts", "src/lib/server/source-capture.ts"], writers: ["src/lib/server/source-capture.ts"],
    historicalMigrations: ["db/migration-0059-source-version-hash-semantics.sql", "db/migration-0061-normalized-content-v2.sql", "db/migration-0062-normalized-content-v3-reference-drift.sql"], compatibilityAssumption: "Legacy rows retain legacy_raw_v1; new governed capture uses normalized_content_v3.",
  }),
  field({
    table: "source_document_versions", column: "extraction_state", sqliteType: "TEXT", nullable: false, defaultValue: "pending",
    allowedValues: ["pending", "extracted", "metadata_only", "unsupported", "extraction_failed"], readers: READ_CAPTURE, writers: WRITE_CAPTURE,
    historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Extraction state is explicit and fail-closed.",
  }),
  field({
    table: "source_document_versions", column: "storage_state", sqliteType: "TEXT", nullable: false, defaultValue: "not_stored",
    allowedValues: ["not_stored", "private_pending", "private_stored", "metadata_only", "reconciliation_required"], readers: READ_CAPTURE, writers: WRITE_CAPTURE,
    historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "No private storage is inferred by the planner.",
  }),
  field({
    table: "source_document_versions", column: "state_reason", sqliteType: "TEXT", nullable: true, defaultValue: null,
    readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Null means no processing-state reason was recorded.",
  }),
  field({
    table: "source_document_versions", column: "state_diagnostics_json", sqliteType: "TEXT", nullable: false, defaultValue: "{}",
    readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "Diagnostics remain opaque JSON text with an empty-object default.",
  }),
  field({
    table: "source_document_versions", column: "processing_retryable", sqliteType: "INTEGER", nullable: false, defaultValue: 0,
    allowedValues: ["0", "1"], readers: READ_CAPTURE, writers: WRITE_CAPTURE, historicalMigrations: ["db/migration-0063-kc-03f-upload-source-states.sql"], compatibilityAssumption: "D1 boolean convention is integer-backed and constrained to 0/1.",
  }),
] as const);

export const TRACE_V1_REQUIRED_FIELDS = Object.freeze([
  ...TRACE_V1_RUNTIME_BLOCKERS,
  ...TRACE_V1_SOURCE_DOCUMENT_FIELDS,
  ...TRACE_V1_SOURCE_DOCUMENT_VERSION_FIELDS,
]);

const BOOLEAN_TYPES = new Set(["BOOLEAN", "INTEGER"]);
const INTEGER_BOOLEAN_FIELDS = new Set(["retrieval_retryable", "capture_retryable", "processing_retryable"]);

function normalizedType(value: string | null): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizedDefault(value: string | number | null): string | number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (/^null$/i.test(trimmed)) return null;
  if (/^[-+]?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
}

function defaultMatches(contract: RequiredFieldContract, actual: SchemaColumnSnapshot): boolean {
  const expected = contract.acceptedDefaults ?? [contract.defaultValue];
  const actualDefault = normalizedDefault(actual.defaultValue);
  return expected.some((candidate) => normalizedDefault(candidate) === actualDefault);
}

function typeMatches(contract: RequiredFieldContract, actual: SchemaColumnSnapshot): boolean {
  const actualType = normalizedType(actual.declaredType);
  if (contract.sqliteType === "BOOLEAN") return BOOLEAN_TYPES.has(actualType);
  if (contract.sqliteType === "INTEGER" && INTEGER_BOOLEAN_FIELDS.has(contract.column)) return actualType === "INTEGER";
  return actualType === contract.sqliteType;
}

function valuesAreKnown(contract: RequiredFieldContract, table: SchemaTableSnapshot): boolean {
  if (!contract.allowedValues) return true;
  const values = table.distinctValues?.[contract.column];
  if (!values) return true;
  const accepted = new Set(contract.allowedValues.map((value) => String(value)));
  return values.every((value) => value === null || accepted.has(String(value)));
}

function declaredCheckValues(contract: RequiredFieldContract, table: SchemaTableSnapshot): readonly string[] | null {
  if (!contract.allowedValues || !table.createSql) return null;
  const escapedColumn = contract.column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedColumn}\\s+[^,]*?CHECK\\s*\\(\\s*${escapedColumn}\\s+IN\\s*\\(([^)]*)\\)`, "i");
  const match = table.createSql.match(pattern);
  if (!match) return null;
  return match[1].split(",").map((value) => {
    const trimmed = value.trim();
    return trimmed.startsWith("'") && trimmed.endsWith("'") ? trimmed.slice(1, -1).replaceAll("''", "'") : trimmed;
  });
}

function checkConstraintIssue(contract: RequiredFieldContract, table: SchemaTableSnapshot): "INCOMPATIBLE_SHAPE" | "AMBIGUOUS" | null {
  if (!contract.allowedValues || !table.createSql) return null;
  const declared = declaredCheckValues(contract, table);
  // The accepted legacy corrections migration added the enum column without a
  // CHECK; runtime correction validation remains the authoritative guard.
  if (!declared && contract.table === "corrections" && contract.column === "correction_type") return null;
  if (!declared && table.distinctValues?.[contract.column]?.every((value) => value === null || contract.allowedValues!.includes(String(value)))) return null;
  if (!declared) return "AMBIGUOUS";
  const accepted = [...contract.allowedValues].map(String).sort();
  const actual = [...declared].sort();
  return JSON.stringify(actual) === JSON.stringify(accepted) ? null : "INCOMPATIBLE_SHAPE";
}

function fieldResult(
  contract: RequiredFieldContract,
  table: SchemaTableSnapshot | undefined,
): CompatibilityFieldResult {
  if (!table) {
    return {
      table: contract.table, column: contract.column, status: "INCOMPATIBLE_SHAPE", contract,
      detail: `Required table ${contract.table} is absent; an additive column migration cannot establish its identity.`,
      migrationSafeToAdd: false,
    };
  }
  const actual = table.columns.find((candidate) => candidate.name === contract.column);
  if (!actual) {
    if (!contract.migrationSafeToAdd) {
      return {
        table: contract.table, column: contract.column, status: "INCOMPATIBLE_SHAPE", contract,
        detail: "Required non-null runtime blocker is absent and cannot be added safely without a table/data repair decision.",
        migrationSafeToAdd: false,
      };
    }
    return {
      table: contract.table, column: contract.column, status: "MISSING_ADDITIVE_FIELD", contract,
      detail: "Required additive column is absent.", migrationSafeToAdd: true,
    };
  }
  if (!normalizedType(actual.declaredType)) {
    return {
      table: contract.table, column: contract.column, status: "AMBIGUOUS", contract, actual,
      detail: "Existing column has no declared SQLite type; semantics cannot be established.", migrationSafeToAdd: false,
    };
  }
  if (!typeMatches(contract, actual)) {
    return {
      table: contract.table, column: contract.column, status: "INCOMPATIBLE_SHAPE", contract, actual,
      detail: `Declared type ${actual.declaredType} does not satisfy required ${contract.sqliteType}.`, migrationSafeToAdd: false,
    };
  }
  if (actual.notNull !== !contract.nullable) {
    return {
      table: contract.table, column: contract.column, status: "INCOMPATIBLE_SHAPE", contract, actual,
      detail: `Nullability is ${actual.notNull ? "NOT NULL" : "nullable"}; required ${contract.nullable ? "nullable" : "NOT NULL"}.`, migrationSafeToAdd: false,
    };
  }
  if (!defaultMatches(contract, actual)) {
    return {
      table: contract.table, column: contract.column, status: "INCOMPATIBLE_SHAPE", contract, actual,
      detail: `Default ${String(actual.defaultValue)} is not one of the accepted defaults.`, migrationSafeToAdd: false,
    };
  }
  const constraintIssue = checkConstraintIssue(contract, table);
  if (constraintIssue) {
    return {
      table: contract.table, column: contract.column, status: constraintIssue, contract, actual,
      detail: constraintIssue === "AMBIGUOUS" ? "The accepted value domain cannot be established from the table definition." : "The existing CHECK value domain does not match the accepted contract.",
      migrationSafeToAdd: false,
    };
  }
  if (!valuesAreKnown(contract, table)) {
    return {
      table: contract.table, column: contract.column, status: "AMBIGUOUS", contract, actual,
      detail: "Existing rows contain a value outside the accepted contract domain.", migrationSafeToAdd: false,
    };
  }
  const legacy = contract.table === "corrections" && (
    (contract.column === "published" && normalizedDefault(actual.defaultValue) === 0)
    || (contract.column === "correction_type" && normalizedDefault(actual.defaultValue) === "other")
  );
  return {
    table: contract.table, column: contract.column,
    status: legacy ? "SUPPORTED_LEGACY_SHAPE" : "ALREADY_COMPATIBLE",
    contract, actual,
    detail: legacy ? "Accepted legacy Production closed-by-default shape." : "Existing column satisfies the accepted contract.",
    migrationSafeToAdd: contract.migrationSafeToAdd,
  };
}

export function inspectTraceV1M2Compatibility(catalog: SchemaCatalogSnapshot): CompatibilityPreflightResult {
  if (!catalog.schemaIdentity) {
    const fields = TRACE_V1_REQUIRED_FIELDS.map((contract) => ({
      table: contract.table, column: contract.column, status: "AMBIGUOUS" as const, contract,
      detail: "Schema identity is absent; compatibility cannot be established.", migrationSafeToAdd: false,
    }));
    return {
      version: TRACE_V1_M2_CONTRACT_VERSION, disposition: "FAIL_CLOSED", schemaIdentity: null, fields,
      missingAdditiveFields: [], incompatibleFields: [], ambiguousFields: fields,
      canApplyAdditiveMigration: false, activationBlocked: true, stopReason: "SCHEMA_IDENTITY_UNRESOLVED",
    };
  }
  const fields = TRACE_V1_REQUIRED_FIELDS.map((contract) => fieldResult(contract, catalog.tables[contract.table]));
  const missingAdditiveFields = fields.filter((result) => result.status === "MISSING_ADDITIVE_FIELD");
  const incompatibleFields = fields.filter((result) => result.status === "INCOMPATIBLE_SHAPE");
  const ambiguousFields = fields.filter((result) => result.status === "AMBIGUOUS");
  const failClosed = incompatibleFields.length > 0 || ambiguousFields.length > 0;
  const activationBlocked = failClosed || missingAdditiveFields.length > 0;
  return {
    version: TRACE_V1_M2_CONTRACT_VERSION,
    disposition: failClosed ? "FAIL_CLOSED" : missingAdditiveFields.length > 0 ? "MIGRATION_REQUIRED" : "ACTIVATION_ALLOWED",
    schemaIdentity: catalog.schemaIdentity,
    fields,
    missingAdditiveFields,
    incompatibleFields,
    ambiguousFields,
    canApplyAdditiveMigration: !failClosed && missingAdditiveFields.every((result) => result.migrationSafeToAdd),
    activationBlocked,
    ...(failClosed ? { stopReason: "SCHEMA_INCOMPATIBLE" as const } : {}),
  };
}
