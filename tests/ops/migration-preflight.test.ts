// TRACE-OPS-01: migration preflight, offline. Each case writes a small
// migration into a temporary root (with copies of wrangler.toml and the seed
// fixture); the current schema comes from the repository's SQLite D1 harness.
import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SQLiteD1 } from "../sqlite-d1";
import { runPreflight, d1Target, objectsSql, scanAllocations, renderPreflightMarkdown, validatePreflightManifest } from "../../scripts/ops/migration-preflight";
import { splitStatements, classify } from "../../scripts/ops/lib/sql.mjs";
import { parseSnapshot } from "../../scripts/ops/lib/snapshot.mjs";

const PREVIEW = { name: "trace-manifest-db-preview", uuid: "f312f662-2252-4005-8103-1a40d546e16b" };
const PRODUCTION = { name: "trace-manifest-db", uuid: "1625036a-ffe2-4103-bf9d-086bae150561" };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const ADDITIVE_SQL = `-- ops test: additive migration
CREATE TABLE ops_test_items (
  id INTEGER PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES editorial_candidates(id),
  note TEXT NOT NULL DEFAULT 'a;b' -- a semicolon inside a string
);
CREATE INDEX idx_ops_test_items_candidate ON ops_test_items(candidate_id);
ALTER TABLE editorial_candidates ADD COLUMN ops_test_flag INTEGER;
CREATE TRIGGER ops_test_items_guard BEFORE UPDATE ON ops_test_items
BEGIN
  SELECT CASE WHEN NEW.note = '' THEN RAISE(ABORT, 'note required; never empty') END;
END;
`;
const EXPECTED = { tables: ["ops_test_items"], indexes: ["idx_ops_test_items_candidate"], triggers: ["ops_test_items_guard"], columns: { editorial_candidates: ["ops_test_flag"] } };

function scenario(sql: string, overrides: Record<string, unknown> = {}, file = "db/migration-0099-ops-test.sql") {
  const root = mkdtempSync(join(tmpdir(), "trace-ops-preflight-"));
  mkdirSync(join(root, "db"));
  mkdirSync(join(root, "scripts/ops/fixtures"), { recursive: true });
  copyFileSync("wrangler.toml", join(root, "wrangler.toml"));
  copyFileSync("scripts/ops/fixtures/preflight-seed.sql", join(root, "scripts/ops/fixtures/preflight-seed.sql"));
  copyFileSync("db/migration-0077-editorial-source-identity.sql", join(root, "db/migration-0077-editorial-source-identity.sql"));
  writeFileSync(join(root, file), sql);
  const manifest = {
    schema: "trace-migration-preflight-v1", environment: "preview", database: PREVIEW,
    migration: { file, sha256: hash(sql) },
    prerequisites: [{ file: "db/migration-0077-editorial-source-identity.sql" }],
    expected: EXPECTED, postflight: [{ id: "trigger-compiles", sql: "SELECT name FROM sqlite_master WHERE type='trigger' AND name='ops_test_items_guard'", expect: { row_count: 1 } }],
    approval: null, ...overrides,
  };
  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
  return { root, manifestPath: join(root, "manifest.json"), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
async function preflight(sql: string, overrides: Record<string, unknown> = {}, deps: Record<string, unknown> = {}, file?: string) {
  const s = scenario(sql, overrides, file);
  try { return await runPreflight(s.manifestPath, { root: s.root, allocations: [], baseNumbers: ["0076", "0077"], ...deps }); } finally { s.cleanup(); }
}
const check = (r: any, id: string) => r.receipt.checks.find((c: any) => c.id === id);

test("an additive migration passes every check and yields an unapproved eight-step plan", async () => {
  const r = await preflight(ADDITIVE_SQL);
  assert.equal(r.receipt.verdict.status, "PASS", JSON.stringify(r.receipt.checks.filter((c: any) => c.status !== "PASS" && c.mandatory), null, 1));
  assert.equal(r.receipt.remote_actions_performed, 0);
  assert.equal(r.execution.approval, null);
  assert.equal(r.execution.execution_window_utc, null);
  assert.equal(r.execution.plan.length, 8);
  assert.match(r.execution.plan[0].commands[0], /^npx wrangler d1 info trace-manifest-db-preview$/);
  assert.match(r.execution.plan[2].commands[0], /^npx wrangler d1 time-travel info trace-manifest-db-preview --json$/);
  assert.match(r.execution.plan[4].commands[1], /^npx wrangler d1 execute trace-manifest-db-preview --remote --file db\/migration-0099-ops-test\.sql$/);
  assert.ok(!r.execution.plan.flatMap((s: any) => s.commands).some((c: string) => /time-travel restore/.test(c)), "restore is never a plan step");
  assert.match(check(r, "schema.reapply").summary, /second application stops at #1/);
  assert.match(check(r, "schema.interruption").summary, /running only the remaining statements completes it/);
  assert.match(check(r, "schema.data_preservation").summary, /keep identical rows/);
  assert.match(renderPreflightMarkdown(r.receipt, r.execution), /approval.*none \(null\)/i);
});

test("target identity: wrong UUID, crossed environments and an implicit environment are refused", async () => {
  const wrongUuid = await preflight(ADDITIVE_SQL, { database: { ...PREVIEW, uuid: "00000000-0000-0000-0000-000000000000" } });
  assert.equal(check(wrongUuid, "target.identity").status, "FAIL");
  assert.ok(wrongUuid.receipt.stop_conditions.includes("TARGET_IDENTITY_MISMATCH"));
  assert.deepEqual(wrongUuid.execution.plan, [], "no plan without a pass");
  const crossed = await preflight(ADDITIVE_SQL, { environment: "production", database: PREVIEW });
  assert.equal(check(crossed, "target.identity").status, "FAIL");
  const prod = await preflight(ADDITIVE_SQL, { environment: "production", database: PRODUCTION });
  assert.equal(check(prod, "target.identity").status, "PASS");
  assert.match(prod.execution.plan[0].commands[0], /trace-manifest-db --env production$/);
  for (const env of ["prod", undefined, ""]) assert.throws(() => validatePreflightManifest({ ...JSON.parse(JSON.stringify({ schema: "trace-migration-preflight-v1", database: PREVIEW, migration: { file: "db/migration-0099-x.sql", sha256: "a".repeat(64) }, prerequisites: [], expected: {} })), environment: env }), /environment/);
  assert.throws(() => validatePreflightManifest({ schema: "trace-migration-preflight-v1", environment: "preview", database: PREVIEW, migration: { file: "db/migration-0099-x.sql", sha256: "a".repeat(64) }, prerequisites: [], expected: {}, approval: "yes" }), /approval must be null/);
  assert.deepEqual(d1Target(readFileSync("wrangler.toml", "utf8"), "preview"), PREVIEW);
  assert.deepEqual(d1Target(readFileSync("wrangler.toml", "utf8"), "production"), PRODUCTION);
});

test("migration identity mismatch, reserved 0072, duplicate numbers and bad ordering fail", async () => {
  const sha = await preflight(ADDITIVE_SQL, { migration: { file: "db/migration-0099-ops-test.sql", sha256: "b".repeat(64) } });
  assert.equal(check(sha, "migration.sha256").status, "FAIL");
  const crlf = ADDITIVE_SQL.replace(/\n/g, "\r\n");
  const eol = await preflight(crlf, { migration: { file: "db/migration-0099-ops-test.sql", sha256: hash(ADDITIVE_SQL) } });
  assert.equal(check(eol, "migration.sha256").status, "PASS");
  assert.match(check(eol, "migration.sha256").summary, /CRLF to LF normalisation/);
  const reserved = await preflight(ADDITIVE_SQL, { migration: { file: "db/migration-0072-ops-test.sql", sha256: hash(ADDITIVE_SQL) } }, { baseNumbers: ["0071"] }, "db/migration-0072-ops-test.sql");
  assert.equal(check(reserved, "migration.reserved").status, "FAIL");
  assert.ok(reserved.receipt.stop_conditions.includes("RESERVED_MIGRATION"));
  const duplicate = await preflight(ADDITIVE_SQL, {}, { allocations: [{ ref: "refs/heads/other", path: "db/migration-0099-something-else.sql", blob: "c".repeat(40) }, { ref: "refs/heads/mine", path: "db/migration-0099-ops-test.sql", blob: "d".repeat(40) }] });
  assert.equal(check(duplicate, "migration.allocation").status, "FAIL");
  assert.ok(duplicate.receipt.stop_conditions.includes("DUPLICATE_MIGRATION_NUMBER"));
  const variants = await preflight(ADDITIVE_SQL, {}, { allocations: [{ ref: "refs/heads/a", path: "db/migration-0099-ops-test.sql", blob: "1".repeat(40) }, { ref: "refs/heads/b", path: "db/migration-0099-ops-test.sql", blob: "2".repeat(40) }] });
  assert.equal(check(variants, "migration.allocation").status, "PASS");
  assert.match(check(variants, "migration.allocation").summary, /2 distinct version/);
  const ordering = await preflight(ADDITIVE_SQL, {}, { baseNumbers: ["0099", "0100"] });
  assert.equal(check(ordering, "migration.ordering").status, "FAIL");
});

test("non-additive and D1-incompatible statements fail; an approved exception is honoured", async () => {
  const drop = await preflight(ADDITIVE_SQL + "DROP TABLE story_cluster_members;\n", {});
  assert.equal(check(drop, "schema.additive").status, "FAIL");
  const update = await preflight(ADDITIVE_SQL + "UPDATE editorial_candidates SET lead_text = 'changed';\n");
  assert.equal(check(update, "schema.additive").status, "FAIL");
  assert.equal(check(update, "schema.data_preservation").status, "FAIL", "the rewrite of existing rows is detected by data comparison too");
  const approved = await preflight(ADDITIVE_SQL + "UPDATE editorial_candidates SET ops_test_flag = 0;\n", { allowed_non_additive: [{ statement: 5, reason: "initialise the new column" }] });
  assert.equal(check(approved, "schema.additive").status, "PASS");
  for (const bad of ["BEGIN TRANSACTION;\n", "PRAGMA foreign_keys = OFF;\n", "VACUUM;\n"]) {
    const r = await preflight(bad + ADDITIVE_SQL);
    assert.equal(check(r, "schema.d1_compatibility").status, "FAIL", bad);
  }
});

test("conflicting and undeclared objects fail", async () => {
  const conflict = await preflight(ADDITIVE_SQL + "CREATE INDEX idx_editorial_candidates_state_created ON editorial_candidates(state);\n");
  assert.equal(check(conflict, "schema.conflicts").status, "FAIL");
  const silent = await preflight(ADDITIVE_SQL + "CREATE INDEX IF NOT EXISTS idx_editorial_candidates_state_created ON editorial_candidates(created_at);\n");
  assert.equal(check(silent, "schema.conflicts").status, "FAIL", "IF NOT EXISTS must not silently skip a different definition");
  const undeclared = await preflight(ADDITIVE_SQL + "CREATE TABLE ops_test_extra (id INTEGER PRIMARY KEY);\n");
  assert.equal(check(undeclared, "schema.expected_objects").status, "FAIL");
  assert.match(check(undeclared, "schema.expected_objects").summary, /not declared: table ops_test_extra/);
  const missing = await preflight(ADDITIVE_SQL, { expected: { ...EXPECTED, triggers: ["ops_test_items_guard", "never_created"] } });
  assert.equal(check(missing, "schema.expected_objects").status, "FAIL");
});

test("interruption analysis: a non-idempotent ALTER makes a full re-run unsafe; the remainder is the recovery", async () => {
  const sql = "ALTER TABLE editorial_candidates ADD COLUMN ops_test_flag INTEGER;\nCREATE INDEX IF NOT EXISTS idx_ops_flag ON editorial_candidates(ops_test_flag);\n";
  const r = await preflight(sql, { expected: { indexes: ["idx_ops_flag"], columns: { editorial_candidates: ["ops_test_flag"] } }, postflight: [] });
  assert.equal(r.receipt.verdict.status, "PASS");
  assert.deepEqual(check(r, "schema.interruption").evidence.recovery, [{ after: 1, full_rerun: "fails at #1", remainder: "run statements #2-#2" }]);
  assert.deepEqual(r.execution.plan[4].recovery, ["interrupted after #1: run statements #2-#2"]);
});

test("statement splitting handles strings, comments and trigger bodies with CASE ... END", () => {
  const parts = splitStatements(ADDITIVE_SQL);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts.map((p) => classify(p).kind), ["create_table", "create_index", "alter_add_column", "create_trigger"]);
  assert.match(parts[3], /END;$/);
  const m0077 = splitStatements(readFileSync("db/migration-0077-editorial-source-identity.sql", "utf8"));
  assert.ok(m0077.length >= 3);
  assert.ok(m0077.every((p) => ["alter_add_column", "create_index"].includes(classify(p).kind)));
});

test("objectsSql lists exactly the declared objects and runs on SQLite", () => {
  const db = new SQLiteD1();
  db.sqlite.exec("CREATE TABLE ops_test_items (id INTEGER PRIMARY KEY)");
  const rows = db.sqlite.prepare(objectsSql({ tables: ["ops_test_items", "absent_table"], columns: { story_clusters: ["primary_source_key", "absent"] } })).all();
  assert.deepEqual(rows.map((r: any) => `${r.kind}:${r.name}`).sort(), ["column:story_clusters.primary_source_key", "table:ops_test_items"]);
  db.close();
});

test("the release snapshot SQL runs on the current schema and parses as a snapshot", () => {
  const db = new SQLiteD1();
  db.sqlite.exec(readFileSync("scripts/ops/fixtures/preflight-seed.sql", "utf8"));
  const rows = db.sqlite.prepare(readFileSync("scripts/ops/release-snapshot.sql", "utf8").replace(/^--.*$/gm, "")).all();
  const metrics = parseSnapshot(JSON.stringify([{ success: true, results: rows }]), "local");
  for (const name of ["clusters.total", "clusters.status.published", "clusters.status.withdrawn", "candidates.state.held", "members.total", "feed_items.total", "audit.total", "audit.max_id", "schema.objects", "ingestion_jobs.total", "cron_runs.total"]) assert.ok(name in metrics, name);
  assert.equal(metrics["candidates.state.held"], 1);
  db.close();
});

test("git inspection is read-only and finds the real allocation of an existing migration", () => {
  const src = readFileSync("scripts/ops/migration-preflight.ts", "utf8");
  assert.deepEqual([...src.matchAll(/execFileSync\(\s*"([^"]+)"/g)].map((m) => m[1]), ["git"], "git is the only process started");
  assert.match(src, /GIT_READ_ONLY = new Set\(\["for-each-ref", "ls-tree"\]\)/);
  assert.deepEqual([...src.matchAll(/from "node:child_process"/g)].length, 1);
  assert.match(src, /import \{ execFileSync \} from "node:child_process";/);
  assert.doesNotMatch(src, /\bspawn(Sync)?\b|\bexecSync\b|\bfork\(/);
  const found = scanAllocations(process.cwd(), "0077");
  assert.ok(found.length >= 1 && found.every((a) => a.path === "db/migration-0077-editorial-source-identity.sql"));
});
