import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  inspectTraceV1M2ActivationPreflight,
  type TraceV1M2ActivationCatalog,
} from "../src/lib/server/trace-v1-m2-activation-preflight";
import type { SchemaForeignKeySnapshot, SchemaTableSnapshot } from "../src/lib/server/trace-v1-m2-contract";

const database = new DatabaseSync(":memory:");
database.exec(readFileSync("db/schema.sql", "utf8"));
for (const file of [
  "db/migration-5e-publication.sql",
  "db/migration-stabilisation-security.sql",
  "db/migration-0015-editorial-desk.sql",
  "db/migration-0016-knowledge-builder-foundation.sql",
  "db/migration-0017-multilingual-source-provenance.sql",
  "db/migration-0032-knowledge-continuity.sql",
  "db/migration-0033-knowledge-reconciliation-state.sql",
  "db/migration-0034-structured-source-extraction.sql",
  "db/migration-0035-extraction-run-metadata.sql",
  "db/migration-0036-extraction-review-history.sql",
  "db/migration-0037-claim-match-candidates.sql",
  "db/migration-0038-claim-match-review.sql",
  "db/migration-0039-claim-provenance-proposals.sql",
  "db/migration-0040-provenance-group-proposals.sql",
  "db/migration-0041-claim-relationship-proposals.sql",
  "db/migration-0042-claim-conflict-cases.sql",
  "db/migration-0043-legacy-claims-cutover.sql",
  "db/migration-0044-story-related-item-reviews.sql",
  "db/migration-0045-claim-score-snapshots.sql",
  "db/migration-0046-score-snapshot-explanations.sql",
  "db/migration-0047-evidence-change-approvals.sql",
  "db/migration-0048-knowledge-source-link-audit.sql",
  "db/migration-0049-knowledge-change-proposal-index.sql",
  "db/migration-0050-knowledge-retrieval-indexes.sql",
  "db/migration-0051-knowledge-embedding-index-state.sql",
  "db/migration-0052-knowledge-impact-proposals.sql",
  "db/migration-0053-knowledge-revision-decisions.sql",
  "db/migration-0054-knowledge-revision-immutability.sql",
  "db/migration-0055-knowledge-embedding-confirmation.sql",
  "db/migration-0056-kc-11c-bounded-source-backfill.sql",
  "db/migration-0057-kc-11c-backfill-integrity.sql",
  "db/migration-0058-kc-11c-final-integrity.sql",
  "db/migration-0059-source-version-hash-semantics.sql",
  "db/migration-0060-source-identity-component-diagnostics.sql",
  "db/migration-0061-normalized-content-v2.sql",
  "db/migration-0062-normalized-content-v3-reference-drift.sql",
  "db/migration-0063-kc-03f-upload-source-states.sql",
  "db/migration-0064-kc-03h-pdf-upload-state.sql",
  "db/migration-0065-public-evidence-graph-indexes.sql",
  "db/migration-0066-kc-11d-bounded-expiry.sql",
  "db/migration-0067-kc-11g-h-remediation.sql",
  "db/migration-0068-v1-freshness-review.sql",
  "db/migration-0071-trace-v1-bounded-activation.sql",
]) database.exec(readFileSync(file, "utf8"));

function readCatalog(): TraceV1M2ActivationCatalog {
  const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>;
  const tables: Record<string, SchemaTableSnapshot> = {};
  for (const { name } of tableNames) {
    const columns = database.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all() as Array<{
      name: string; type: string | null; notnull: number; dflt_value: string | null; pk: number;
    }>;
    const rows: Record<string, readonly (string | number | null)[]> = {};
    if (name === "sources") {
      rows.ingestion_type = (database.prepare("SELECT DISTINCT ingestion_type AS value FROM sources ORDER BY ingestion_type").all() as Array<{ value: string | null }>).map((row) => row.value);
    }
    if (name === "corrections") {
      rows.correction_type = (database.prepare("SELECT DISTINCT correction_type AS value FROM corrections ORDER BY correction_type").all() as Array<{ value: string | null }>).map((row) => row.value);
    }
    tables[name] = {
      name,
      columns: columns.map((column) => ({ name: column.name, declaredType: column.type, notNull: column.notnull === 1, defaultValue: column.dflt_value, primaryKeyPosition: column.pk })),
      createSql: (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as { sql: string | null } | undefined)?.sql,
      distinctValues: rows,
      foreignKeys: (database.prepare(`PRAGMA foreign_key_list(${JSON.stringify(name)})`).all() as Array<{ from: string; table: string; to: string; on_delete: string; on_update: string }>).map((foreignKey): SchemaForeignKeySnapshot => ({
        from: foreignKey.from,
        table: foreignKey.table,
        to: foreignKey.to,
        onDelete: foreignKey.on_delete,
        onUpdate: foreignKey.on_update,
      })),
    };
  }
  const objects = database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY type, name").all() as Array<{ type: "table" | "index" | "trigger"; name: string; tbl_name: string; sql: string | null }>;
  const indexDefinitions = objects.filter((object) => object.type === "index").map((object) => {
    const indexList = database.prepare(`PRAGMA index_list(${JSON.stringify(object.tbl_name)})`).all() as Array<{ name: string; unique: number }>;
    const index = indexList.find((candidate) => candidate.name === object.name);
    const columns = (database.prepare(`PRAGMA index_xinfo(${JSON.stringify(object.name)})`).all() as Array<{ seqno: number; key: number; name: string | null; desc: number }>)
      .filter((column) => column.key === 1 && column.name !== null)
      .sort((left, right) => left.seqno - right.seqno)
      .map((column) => ({ name: column.name as string, descending: column.desc === 1 }));
    return { name: object.name, table: object.tbl_name, unique: index?.unique === 1, columns };
  });
  const triggerDefinitions = objects.filter((object) => object.type === "trigger").map((object) => ({ name: object.name, table: object.tbl_name, sql: object.sql }));
  return {
    schemaIdentity: "db/schema.sql+0068+0071",
    tables,
    objects: {
      tables: objects.filter((object) => object.type === "table").map((object) => object.name),
      indexes: objects.filter((object) => object.type === "index").map((object) => object.name),
      triggers: objects.filter((object) => object.type === "trigger").map((object) => object.name),
      indexDefinitions,
      triggerDefinitions,
    },
  };
}

const result = inspectTraceV1M2ActivationPreflight(readCatalog());
console.log(JSON.stringify(result, null, 2));
if (result.compatibilityDisposition === "FAIL_CLOSED") process.exitCode = 1;
