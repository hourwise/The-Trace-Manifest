// TRACE-OPS-01 migration preflight. Prepares and checks a D1 migration
// LOCALLY and writes a plan of commands for a person to run after separate
// approval. It never runs Wrangler, never contacts Cloudflare and has no mode
// that applies a migration. The only process it starts is `git` with a fixed
// set of read-only subcommands (allocation and ordering checks).
//
//   npx tsx scripts/ops/migration-preflight.ts --manifest <file> [--out-dir <dir>]
//
// Exit: 0 PASS, 1 FAIL, 2 incomplete, 3 usage/manifest error.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { SQLiteD1 } from "../../tests/sqlite-d1";
import { CheckLog, STATUS, exitCode, sha256 } from "./lib/report.mjs";
import { ADDITIVE, D1_REFUSED, classify, splitStatements } from "./lib/sql.mjs";

export const TOOL = { name: "trace-ops-migration-preflight", version: "1.0.0" };
export const RESERVED_MIGRATIONS = new Map([["0072", "scheduler leases (codex/trace-v1-scheduler-lease-0072); reserved, never applied by this tool's plans"]]);
const ENVIRONMENTS = { preview: { header: "d1_databases", flags: [] as string[] }, production: { header: "env.production.d1_databases", flags: ["--env", "production"] } } as const;
type Environment = keyof typeof ENVIRONMENTS;

export interface PreflightManifest {
  schema: "trace-migration-preflight-v1";
  environment: Environment;
  database: { name: string; uuid: string };
  migration: { file: string; sha256: string };
  prerequisites: Array<{ file: string; sha256?: string }>;
  simulation?: { apply_before?: string[] };
  expected: { tables?: string[]; columns?: Record<string, string[]>; indexes?: string[]; triggers?: string[]; may_preexist?: string[] };
  allowed_non_additive?: Array<{ statement: number; reason: string }>;
  baseline_tables?: string[];
  postflight?: Array<{ id: string; sql: string; expect: "no_rows" | "rows" | { row_count: number } }>;
  approval?: null;
  notes?: string;
}

export interface Allocation { ref: string; path: string; blob: string }
export interface PreflightDeps { root?: string; allocations?: Allocation[]; baseNumbers?: string[]; baseRef?: string }

const GIT_READ_ONLY = new Set(["for-each-ref", "ls-tree"]);
function git(root: string, args: string[]): string {
  if (!GIT_READ_ONLY.has(args[0])) throw new Error(`git ${args[0]} is not an allowed read-only subcommand`);
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Every ref (local and remote-tracking) that has a db/migration-<number>-* file. */
export function scanAllocations(root: string, number: string): Allocation[] {
  const refs = git(root, ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"]).split("\n").filter((r) => r && !r.endsWith("/HEAD"));
  const found: Allocation[] = [];
  for (const ref of refs) {
    for (const line of git(root, ["ls-tree", ref, "db/"]).split("\n")) {
      const m = /^\d+ blob ([0-9a-f]+)\t(db\/migration-(\d{4})-[^/]+\.sql)$/.exec(line);
      if (m && m[3] === number) found.push({ ref, path: m[2], blob: m[1] });
    }
  }
  return found;
}

export function baseMigrationNumbers(root: string, ref: string): string[] {
  return git(root, ["ls-tree", "--name-only", ref, "db/"]).split("\n").map((p) => /^db\/migration-(\d{4})-/.exec(p)?.[1]).filter((n): n is string => Boolean(n));
}

/** The D1 binding named DB for an environment, from wrangler.toml. */
export function d1Target(tomlText: string, environment: Environment): { name: string; uuid: string } | null {
  let header = "";
  let current: Record<string, string> | null = null;
  const found: Array<Record<string, string>> = [];
  for (const raw of tomlText.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const h = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (h) { header = h[1].trim(); current = header === ENVIRONMENTS[environment].header ? {} : null; if (current) found.push(current); continue; }
    const kv = /^([A-Za-z_]+)\s*=\s*"([^"]*)"$/.exec(line);
    if (kv && current) current[kv[1]] = kv[2];
  }
  const db = found.find((b) => b.binding === "DB");
  return db?.database_name && db?.database_id ? { name: db.database_name, uuid: db.database_id } : null;
}

function exact(value: any, required: string[], optional: string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const k of required) if (!(k in value)) throw new Error(`${label}.${k} is required`);
  const allowed = new Set([...required, ...optional]);
  for (const k of Object.keys(value)) if (!allowed.has(k)) throw new Error(`${label}.${k} is not a known field`);
}

export function validatePreflightManifest(m: any): PreflightManifest {
  exact(m, ["schema", "environment", "database", "migration", "prerequisites", "expected"], ["simulation", "allowed_non_additive", "baseline_tables", "postflight", "approval", "notes"], "manifest");
  if (m.schema !== "trace-migration-preflight-v1") throw new Error("manifest.schema must be trace-migration-preflight-v1");
  if (!(m.environment in ENVIRONMENTS)) throw new Error("manifest.environment must be exactly \"preview\" or \"production\"; there is no default");
  exact(m.database, ["name", "uuid"], [], "manifest.database");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(m.database.uuid)) throw new Error("manifest.database.uuid must be a D1 database UUID");
  exact(m.migration, ["file", "sha256"], [], "manifest.migration");
  if (!/^db\/migration-\d{4}-[a-z0-9-]+\.sql$/.test(m.migration.file)) throw new Error("manifest.migration.file must be db/migration-NNNN-name.sql");
  if (!/^[0-9a-f]{64}$/.test(m.migration.sha256)) throw new Error("manifest.migration.sha256 must be a SHA-256");
  if (!Array.isArray(m.prerequisites)) throw new Error("manifest.prerequisites must be an array");
  for (const p of m.prerequisites) exact(p, ["file"], ["sha256"], "manifest.prerequisites[]");
  exact(m.expected, [], ["tables", "columns", "indexes", "triggers", "may_preexist"], "manifest.expected");
  if ("approval" in m && m.approval !== null) throw new Error("manifest.approval must be null: approval is recorded on the execution manifest by the owner, never by preflight");
  for (const p of m.postflight ?? []) exact(p, ["id", "sql", "expect"], [], "manifest.postflight[]");
  return m as PreflightManifest;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** One query listing which expected objects exist (used before and after applying). */
export function objectsSql(expected: PreflightManifest["expected"], exclude: string[] = []): string {
  const parts: string[] = [];
  const keep = (names?: string[]) => (names ?? []).filter((n) => !exclude.includes(n));
  for (const [type, names] of [["table", keep(expected.tables)], ["index", keep(expected.indexes)], ["trigger", keep(expected.triggers)]] as const) {
    if (names.length) parts.push(`SELECT '${type}' AS kind, name FROM sqlite_master WHERE type='${type}' AND name IN (${names.map(q).join(", ")})`);
  }
  for (const [table, columns] of Object.entries(expected.columns ?? {})) {
    const cols = columns.filter((c) => !exclude.includes(`${table}.${c}`));
    if (cols.length) parts.push(`SELECT 'column', ${q(table + ".")} || name FROM pragma_table_info(${q(table)}) WHERE name IN (${cols.map(q).join(", ")})`);
  }
  return parts.length ? parts.join(" UNION ALL ") + ";" : "SELECT 'none' AS kind, 'no expected objects declared' AS name WHERE 0;";
}

const expectedCount = (e: PreflightManifest["expected"], exclude: string[] = []) =>
  (e.tables ?? []).filter((n) => !exclude.includes(n)).length + (e.indexes ?? []).filter((n) => !exclude.includes(n)).length + (e.triggers ?? []).filter((n) => !exclude.includes(n)).length
  + Object.entries(e.columns ?? {}).reduce((n, [t, cols]) => n + cols.filter((c) => !exclude.includes(`${t}.${c}`)).length, 0);

const DEFAULT_BASELINE = ["story_clusters", "story_cluster_members", "feed_items", "editorial_candidates", "admin_audit_log"];
export function baselineSql(tables: string[]): string {
  return `SELECT ${tables.map((t) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(", ")};`;
}

function userObjects(db: DatabaseSync) {
  return db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
}

function tableFingerprints(db: DatabaseSync, columnsByTable?: Map<string, string[]>) {
  const out = new Map<string, { columns: string[]; rows: number; sha256: string }>();
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>) {
    const columns = columnsByTable?.get(name) ?? (db.prepare(`SELECT name FROM pragma_table_info(${q(name)}) ORDER BY cid`).all() as Array<{ name: string }>).map((c) => c.name);
    if (!columns.length) continue;
    const list = columns.map((c) => `"${c}"`).join(", ");
    let rows: unknown[];
    try { rows = db.prepare(`SELECT ${list} FROM "${name}" ORDER BY rowid`).all(); } catch { rows = db.prepare(`SELECT ${list} FROM "${name}" ORDER BY ${list}`).all(); }
    out.set(name, { columns, rows: rows.length, sha256: sha256(JSON.stringify(rows)) });
  }
  return out;
}

function tryExec(db: DatabaseSync, statements: string[], from = 0): { ok: true } | { ok: false; at: number; error: string } {
  for (let i = from; i < statements.length; i += 1) {
    try { db.exec(statements[i]); } catch (e: any) { return { ok: false, at: i + 1, error: String(e?.message ?? e).slice(0, 160) }; }
  }
  return { ok: true };
}

export async function runPreflight(manifestPath: string, deps: PreflightDeps = {}) {
  const root = deps.root ?? process.cwd();
  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = validatePreflightManifest(JSON.parse(manifestText));
  const log = new CheckLog();
  const evidence: Array<{ path: string; sha256: string }> = [{ path: manifestPath, sha256: sha256(manifestText) }];
  log.record({ id: "manifest.valid", mandatory: true, status: STATUS.PASS, summary: `environment ${manifest.environment}, database ${manifest.database.name}, migration ${manifest.migration.file}`, evidence: {} });
  const number = /migration-(\d{4})-/.exec(manifest.migration.file)![1];

  // Target identity: the manifest must match the configured binding exactly.
  const toml = readFileSync(join(root, "wrangler.toml"), "utf8");
  const configured = d1Target(toml, manifest.environment);
  const otherEnv = manifest.environment === "preview" ? "production" : "preview";
  const other = d1Target(toml, otherEnv);
  const identityOk = Boolean(configured && configured.name === manifest.database.name && configured.uuid === manifest.database.uuid);
  const crossed = Boolean(other && (other.name === manifest.database.name || other.uuid === manifest.database.uuid));
  log.record({
    id: "target.identity", mandatory: true, status: identityOk && !crossed ? STATUS.PASS : STATUS.FAIL,
    summary: identityOk && !crossed ? `${manifest.environment} binding DB is ${configured!.name} (${configured!.uuid}) in wrangler.toml` : crossed ? `the manifest names the ${otherEnv} database while targeting ${manifest.environment}` : `wrangler.toml ${manifest.environment} binding is ${configured ? `${configured.name} (${configured.uuid})` : "missing"}, manifest says ${manifest.database.name} (${manifest.database.uuid})`,
    evidence: { configured, environment: manifest.environment }, stop: identityOk && !crossed ? null : "TARGET_IDENTITY_MISMATCH",
  });
  log.record({ id: "target.remote_identity", mandatory: false, status: STATUS.NOT_VERIFIED, summary: "the live database identity is checked by plan step 1, by a person, before applying", evidence: {} });

  // Migration identity.
  const migrationPath = join(root, manifest.migration.file);
  if (!existsSync(migrationPath)) {
    log.record({ id: "migration.sha256", mandatory: true, status: STATUS.FAIL, summary: `${manifest.migration.file} does not exist`, evidence: {}, stop: "MIGRATION_IDENTITY_MISMATCH" });
    return finish(manifest, log, evidence, null, number);
  }
  const bytes = readFileSync(migrationPath);
  const actual = sha256(bytes);
  const lf = sha256(bytes.toString("utf8").replace(/\r\n/g, "\n"));
  evidence.push({ path: manifest.migration.file, sha256: actual });
  // The manifest pins the Git blob bytes (LF). A Windows checkout may hold the
  // same file with CRLF line endings; that alone is accepted and reported.
  const exactMatch = actual === manifest.migration.sha256;
  const eolOnly = !exactMatch && lf === manifest.migration.sha256;
  const hashOk = exactMatch || eolOnly;
  log.record({ id: "migration.sha256", mandatory: true, status: hashOk ? STATUS.PASS : STATUS.FAIL, summary: exactMatch ? `exact bytes match ${actual}` : eolOnly ? `matches ${lf} after CRLF to LF normalisation (this checkout uses CRLF; apply the LF file from Git)` : `file is ${actual} (LF-normalised ${lf}), manifest says ${manifest.migration.sha256}`, evidence: { sha256: actual, lf_normalised_sha256: lf }, stop: hashOk ? null : "MIGRATION_IDENTITY_MISMATCH" });

  const reserved = RESERVED_MIGRATIONS.get(number);
  log.record({ id: "migration.reserved", mandatory: true, status: reserved ? STATUS.FAIL : STATUS.PASS, summary: reserved ? `migration ${number} is reserved: ${reserved}` : `${number} is not a reserved number (0072 stays protected)`, evidence: {}, stop: reserved ? "RESERVED_MIGRATION" : null });

  // Allocation across known branches and ordering against the base ref.
  try {
    const allocations = deps.allocations ?? scanAllocations(root, number);
    const otherNames = [...new Set(allocations.map((a) => a.path))].filter((p) => p !== manifest.migration.file);
    const variants = [...new Set(allocations.filter((a) => a.path === manifest.migration.file).map((a) => a.blob))];
    log.record({
      id: "migration.allocation", mandatory: true, status: otherNames.length ? STATUS.FAIL : STATUS.PASS,
      summary: otherNames.length ? `number ${number} is also used by ${otherNames.join(", ")} (${allocations.filter((a) => a.path !== manifest.migration.file).map((a) => a.ref).join(", ")})` : `number ${number} is used only by ${manifest.migration.file} (${allocations.length} ref(s), ${variants.length} distinct version(s) of the file)`,
      evidence: { refs: allocations.map((a) => `${a.ref}:${a.path}@${a.blob.slice(0, 12)}`) }, stop: otherNames.length ? "DUPLICATE_MIGRATION_NUMBER" : null,
    });
    const baseRef = deps.baseRef ?? "refs/remotes/origin/main";
    const baseNumbers = deps.baseNumbers ?? baseMigrationNumbers(root, baseRef);
    const highest = baseNumbers.filter((n) => !RESERVED_MIGRATIONS.has(n)).sort().at(-1) ?? "0000";
    const ordered = number > highest && !baseNumbers.includes(number);
    log.record({ id: "migration.ordering", mandatory: true, status: ordered ? STATUS.PASS : STATUS.FAIL, summary: ordered ? `${number} follows the highest migration on ${baseRef} (${highest})` : `${number} is not after the highest migration on ${baseRef} (${highest}) or is already there`, evidence: { highest_on_base: highest }, stop: ordered ? null : "MIGRATION_ORDERING" });
  } catch (e: any) {
    log.record({ id: "migration.allocation", mandatory: true, status: STATUS.NOT_VERIFIED, summary: `git inspection failed: ${String(e?.message ?? e).slice(0, 120)}`, evidence: {} });
  }

  // Prerequisites: present, earlier and (when given) exact.
  const prereqProblems: string[] = [];
  for (const p of manifest.prerequisites) {
    const path = join(root, p.file);
    const n = /migration-(\d{4})-/.exec(p.file)?.[1];
    if (!existsSync(path)) prereqProblems.push(`${p.file} missing`);
    else {
      const h = sha256(readFileSync(path));
      evidence.push({ path: p.file, sha256: h });
      if (p.sha256 && p.sha256 !== h) prereqProblems.push(`${p.file} is ${h}, expected ${p.sha256}`);
    }
    if (n && n >= number) prereqProblems.push(`${p.file} is not before ${number}`);
  }
  log.record({ id: "migration.prerequisites", mandatory: true, status: prereqProblems.length ? STATUS.FAIL : STATUS.PASS, summary: prereqProblems.length ? prereqProblems.join("; ") : `${manifest.prerequisites.length} prerequisite(s) present and earlier`, evidence: {}, stop: prereqProblems.length ? "PREREQUISITE_MISSING" : null });

  // Statement analysis.
  const sql = bytes.toString("utf8");
  const statements = splitStatements(sql);
  const kinds = statements.map((s, i) => ({ index: i + 1, ...classify(s) }));
  const createdTables = new Set(kinds.filter((k: any) => k.kind === "create_table").map((k: any) => k.name));
  const refused = kinds.filter((k) => D1_REFUSED.has(k.kind));
  log.record({ id: "schema.d1_compatibility", mandatory: true, status: refused.length ? STATUS.FAIL : STATUS.PASS, summary: refused.length ? `statements D1 refuses or a migration must not contain: ${refused.map((k) => `#${k.index} ${k.kind}`).join(", ")}` : `${statements.length} statements; no transaction control, PRAGMA, ATTACH or VACUUM`, evidence: { kinds: kinds.map((k: any) => `${k.index}:${k.kind}${k.name ? `:${k.name}` : ""}${k.table ? `:${k.table}` : ""}`) }, stop: refused.length ? "D1_INCOMPATIBLE_STATEMENT" : null });
  const allowed = new Map((manifest.allowed_non_additive ?? []).map((a) => [a.statement, a.reason]));
  const nonAdditive = kinds.filter((k: any) => !ADDITIVE.has(k.kind) && !D1_REFUSED.has(k.kind) && !(k.kind === "insert" && createdTables.has(k.table)) && !allowed.has(k.index));
  log.record({ id: "schema.additive", mandatory: true, status: nonAdditive.length ? STATUS.FAIL : STATUS.PASS, summary: nonAdditive.length ? `non-additive statements without approval: ${nonAdditive.map((k: any) => `#${k.index} ${k.kind} ${k.table ?? ""}`.trim()).join(", ")}` : `all statements are additive${allowed.size ? ` (${allowed.size} approved exception(s))` : ""}`, evidence: { approved_exceptions: [...allowed.entries()] }, stop: nonAdditive.length ? "NON_ADDITIVE_CHANGE" : null });

  // Local simulation on the current schema (the repository's SQLite D1 harness),
  // built once with the seed data and then copied for every scenario.
  const scratch = mkdtempSync(join(tmpdir(), "trace-ops-preflight-db-"));
  const template = join(scratch, "base.sqlite");
  {
    const harness = new SQLiteD1();
    harness.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const f of manifest.simulation?.apply_before ?? []) harness.sqlite.exec(readFileSync(join(root, f), "utf8"));
    harness.sqlite.exec(readFileSync(join(root, "scripts/ops/fixtures/preflight-seed.sql"), "utf8"));
    harness.sqlite.exec(`VACUUM INTO ${q(template)}`);
    harness.close();
  }
  const opened: DatabaseSync[] = [];
  let copies = 0;
  const fresh = () => {
    const path = join(scratch, `copy-${copies += 1}.sqlite`);
    copyFileSync(template, path);
    const copy = new DatabaseSync(path);
    copy.exec("PRAGMA foreign_keys = ON");
    opened.push(copy);
    return copy;
  };
  try {
    const db = fresh();
    const baseObjects = userObjects(db);
    const conflicts: string[] = [];
    for (const k of kinds as any[]) {
      if (!k.kind.startsWith("create_")) continue;
      const existing = baseObjects.find((o) => o.name === k.name);
      if (!existing) continue;
      const same = (existing.sql ?? "").replace(/\s+/g, " ").replace(/ IF NOT EXISTS/i, "") === statements[k.index - 1].replace(/\s+/g, " ").replace(/;$/, "").replace(/ IF NOT EXISTS/i, "");
      if (!k.ifNotExists) conflicts.push(`#${k.index} ${k.name} already exists (would fail)`);
      else if (!(manifest.expected.may_preexist ?? []).includes(k.name) && !same) conflicts.push(`#${k.index} ${k.name} exists with a different definition and IF NOT EXISTS would skip it silently`);
    }
    log.record({ id: "schema.conflicts", mandatory: true, status: conflicts.length ? STATUS.FAIL : STATUS.PASS, summary: conflicts.length ? conflicts.join("; ") : "no created object collides with the current schema", evidence: {}, stop: conflicts.length ? "SCHEMA_OBJECT_CONFLICT" : null });

    const beforeColumns = new Map<string, string[]>();
    const before = tableFingerprints(db);
    for (const [t, f] of before) beforeColumns.set(t, f.columns);
    const applied = tryExec(db, statements);
    log.record({ id: "schema.apply", mandatory: true, status: applied.ok ? STATUS.PASS : STATUS.FAIL, summary: applied.ok ? `applied all ${statements.length} statements to the current schema with representative data` : `statement #${applied.at} failed: ${applied.error}`, evidence: {}, stop: applied.ok ? null : "LOCAL_APPLY_FAILED" });
    if (!applied.ok) return finish(manifest, log, evidence, statements, number);

    const afterObjects = userObjects(db);
    const created = afterObjects.filter((o) => !baseObjects.some((b) => b.type === o.type && b.name === o.name));
    const declared = new Set([...(manifest.expected.tables ?? []), ...(manifest.expected.indexes ?? []), ...(manifest.expected.triggers ?? [])]);
    const missing: string[] = [];
    for (const t of manifest.expected.tables ?? []) if (!afterObjects.some((o) => o.type === "table" && o.name === t)) missing.push(`table ${t}`);
    for (const t of manifest.expected.indexes ?? []) if (!afterObjects.some((o) => o.type === "index" && o.name === t)) missing.push(`index ${t}`);
    for (const t of manifest.expected.triggers ?? []) if (!afterObjects.some((o) => o.type === "trigger" && o.name === t)) missing.push(`trigger ${t}`);
    for (const [table, cols] of Object.entries(manifest.expected.columns ?? {})) {
      const have = (db.prepare(`SELECT name FROM pragma_table_info(${q(table)})`).all() as Array<{ name: string }>).map((c) => c.name);
      for (const c of cols) if (!have.includes(c)) missing.push(`column ${table}.${c}`);
    }
    const undeclared = created.filter((o) => !declared.has(o.name) && !o.name.startsWith("sqlite_autoindex_")).map((o) => `${o.type} ${o.name}`);
    log.record({ id: "schema.expected_objects", mandatory: true, status: missing.length || undeclared.length ? STATUS.FAIL : STATUS.PASS, summary: missing.length || undeclared.length ? `${missing.length ? `missing: ${missing.join(", ")}` : ""}${missing.length && undeclared.length ? "; " : ""}${undeclared.length ? `created but not declared: ${undeclared.join(", ")}` : ""}` : `all ${expectedCount(manifest.expected)} declared objects exist; nothing undeclared was created`, evidence: { created: created.map((o) => `${o.type}:${o.name}`) }, stop: missing.length || undeclared.length ? "SCHEMA_MISMATCH" : null });

    const fk = db.prepare("PRAGMA foreign_key_check").all();
    const integrity = (db.prepare("PRAGMA integrity_check").get() as any)?.integrity_check;
    log.record({ id: "schema.integrity", mandatory: true, status: fk.length === 0 && integrity === "ok" ? STATUS.PASS : STATUS.FAIL, summary: `foreign_key_check ${fk.length} violation(s); integrity_check ${integrity}`, evidence: {}, stop: fk.length || integrity !== "ok" ? "INTEGRITY_FAILURE" : null });

    const after = tableFingerprints(db, beforeColumns);
    const changed = [...before].filter(([t, f]) => { const a = after.get(t); return !a || a.rows !== f.rows || a.sha256 !== f.sha256; }).map(([t]) => t);
    const approvedTables = new Set((manifest.allowed_non_additive ?? []).map((a) => (kinds[a.statement - 1] as any)?.table).filter(Boolean));
    const unexpectedChange = changed.filter((t) => !approvedTables.has(t));
    log.record({ id: "schema.data_preservation", mandatory: true, status: unexpectedChange.length ? STATUS.FAIL : STATUS.PASS, summary: unexpectedChange.length ? `existing data changed in: ${unexpectedChange.join(", ")}` : `${before.size} existing tables keep identical rows in their original columns (${[...before.values()].reduce((n, f) => n + f.rows, 0)} rows)`, evidence: { changed }, stop: unexpectedChange.length ? "DATA_NOT_PRESERVED" : null });

    // Re-application: run the whole file again on the migrated database.
    const fingerprintBeforeReapply = JSON.stringify([...tableFingerprints(db)]);
    const reapply = tryExec(db, statements);
    const reapplyChanged = JSON.stringify([...tableFingerprints(db)]) !== fingerprintBeforeReapply;
    log.record({
      id: "schema.reapply", mandatory: true,
      status: reapply.ok && reapplyChanged ? STATUS.FAIL : STATUS.PASS,
      summary: reapply.ok ? (reapplyChanged ? "a second application succeeded AND changed data" : "a second application is a no-op (idempotent)") : `a second application stops at #${reapply.at} (${reapply.error}); plan step 2 must show it is not yet applied`,
      evidence: {}, stop: reapply.ok && reapplyChanged ? "UNSAFE_REAPPLY" : null,
    });

    // Interruption: stop after each statement; can the rest still be applied?
    const finalSchema = JSON.stringify(userObjects(db).map((o) => [o.type, o.name, (o.sql ?? "").replace(/\s+/g, " ")]));
    const recovery: Array<{ after: number; full_rerun: string; remainder: string }> = [];
    let remainderFailures = 0;
    for (let k = 1; k < statements.length; k += 1) {
      const partial = fresh();
      tryExec(partial, statements.slice(0, k));
      const rerun = tryExec(partial, statements);
      const viaRemainder = fresh();
      tryExec(viaRemainder, statements.slice(0, k));
      const rest = tryExec(viaRemainder, statements, k);
      const same = rest.ok && JSON.stringify(userObjects(viaRemainder).map((o) => [o.type, o.name, (o.sql ?? "").replace(/\s+/g, " ")])) === finalSchema;
      if (!same) remainderFailures += 1;
      if (!rerun.ok || !same) recovery.push({ after: k, full_rerun: rerun.ok ? "ok" : `fails at #${rerun.at}`, remainder: same ? `run statements #${k + 1}-#${statements.length}` : `remainder fails${rest.ok ? " (schema differs)" : ` at #${rest.at}`}` });
    }
    log.record({
      id: "schema.interruption", mandatory: true, status: remainderFailures ? STATUS.FAIL : STATUS.PASS,
      summary: remainderFailures ? `${remainderFailures} interruption point(s) cannot be completed by running the remaining statements` : recovery.length ? `if interrupted, a full re-run fails at ${recovery.length} of ${statements.length - 1} points; running only the remaining statements completes it at every point` : "a full re-run after any interruption completes the migration",
      evidence: { recovery }, stop: remainderFailures ? "UNRECOVERABLE_INTERRUPTION" : null,
    });

    // Postflight queries the plan will use, executed locally.
    const pre = expectedCount(manifest.expected, manifest.expected.may_preexist);
    const objectsAfter = db.prepare(objectsSql(manifest.expected)).all();
    const postProblems: string[] = [];
    if (objectsAfter.length !== expectedCount(manifest.expected)) postProblems.push(`objects query returns ${objectsAfter.length} rows, expected ${expectedCount(manifest.expected)}`);
    for (const p of manifest.postflight ?? []) {
      try {
        const rows = db.prepare(p.sql).all();
        const ok = p.expect === "no_rows" ? rows.length === 0 : p.expect === "rows" ? rows.length > 0 : rows.length === p.expect.row_count;
        if (!ok) postProblems.push(`${p.id} returned ${rows.length} row(s)`);
      } catch (e: any) { postProblems.push(`${p.id} failed: ${String(e?.message ?? e).slice(0, 100)}`); }
    }
    const notAppliedRows = fresh().prepare(objectsSql(manifest.expected, manifest.expected.may_preexist)).all();
    if (notAppliedRows.length) postProblems.push(`the not-yet-applied check already finds ${notAppliedRows.length} object(s) on the current schema`);
    log.record({ id: "postflight.local", mandatory: true, status: postProblems.length ? STATUS.FAIL : STATUS.PASS, summary: postProblems.length ? postProblems.join("; ") : `the not-applied check returns 0 rows before and the objects check ${objectsAfter.length} after (${pre} must be absent beforehand); ${(manifest.postflight ?? []).length} extra postflight queries behave as declared`, evidence: {}, stop: postProblems.length ? "POSTFLIGHT_INVALID" : null });

    return finish(manifest, log, evidence, statements, number, recovery);
  } finally {
    for (const handle of opened) { try { handle.close(); } catch { /* already closed */ } }
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** A Wrangler command for this manifest's database: `npx wrangler <sub> <db> [--env production] <extra>`. */
function wr(manifest: PreflightManifest, sub: string, extra: string[] = []) {
  return ["npx wrangler", sub, manifest.database.name, ...ENVIRONMENTS[manifest.environment].flags, ...extra].join(" ");
}

export function buildPlan(manifest: PreflightManifest, recovery: Array<{ after: number; remainder: string }> = []) {
  const baseline = baselineSql(manifest.baseline_tables ?? DEFAULT_BASELINE);
  const notApplied = objectsSql(manifest.expected, manifest.expected.may_preexist);
  const objects = objectsSql(manifest.expected);
  const cmd = (sqlText: string) => `${wr(manifest, "d1 execute", ["--remote", "--json"])} --command "${sqlText.replace(/"/g, '\\"')}"`;
  return [
    { step: 1, title: "Verify the target database identity", commands: [wr(manifest, "d1 info")], expect: `database_id equals ${manifest.database.uuid}; otherwise STOP` },
    { step: 2, title: "Confirm the migration is not already applied", commands: [cmd(notApplied)], expect: "no rows; any row means it is (partly) applied: STOP and inspect" },
    { step: 3, title: "Record a Time Travel bookmark", commands: [wr(manifest, "d1 time-travel info", ["--json"])], expect: "record the bookmark in the receipt; it is for a separately approved last-resort restore only" },
    { step: 4, title: "Record baseline counts and the release snapshot", commands: [cmd(baseline), wr(manifest, "d1 execute", ["--remote", "--json", "--file", "scripts/ops/release-snapshot.sql"])], expect: "save both outputs as before-files" },
    { step: 5, title: "Apply the migration (only with the owner's approval of this exact manifest)", commands: [`sha256sum ${manifest.migration.file}`, wr(manifest, "d1 execute", ["--remote", "--file", manifest.migration.file])], expect: `sha256 ${manifest.migration.sha256} before applying; any error: STOP and use the recovery notes` },
    { step: 6, title: "Check the resulting schema", commands: [cmd(objects), ...(manifest.postflight ?? []).map((p) => cmd(p.sql))], expect: `${expectedCount(manifest.expected)} object rows; postflight queries as declared` },
    { step: 7, title: "Verify data preservation", commands: [cmd(baseline), cmd("PRAGMA foreign_key_check;"), wr(manifest, "d1 execute", ["--remote", "--json", "--file", "scripts/ops/release-snapshot.sql"])], expect: "counts identical to step 4; no foreign-key rows (PRAGMA quick_check fails with SQLITE_NOMEM on D1; do not use it); compare snapshots with release-verify.mjs" },
    { step: 8, title: "Record the postflight receipt", commands: ["node scripts/ops/release-verify.mjs --manifest <release manifest> --offline --before before.json --after after.json"], expect: "attach outputs, bookmark and approval to the execution manifest" },
  ].map((s) => ({ ...s, recovery: s.step === 5 ? (recovery.length ? recovery.map((r) => `interrupted after #${r.after}: ${r.remainder}`) : ["a full re-run completes the migration"]) : undefined }));
}

function finish(manifest: PreflightManifest, log: CheckLog, evidence: Array<{ path: string; sha256: string }>, statements: string[] | null, number: string, recovery: any[] = []) {
  const verdict = log.verdict();
  const receipt = {
    schema: "trace-migration-preflight-receipt-v1",
    tool: TOOL,
    generated_at: new Date().toISOString(),
    environment: manifest.environment,
    database: manifest.database,
    migration: { ...manifest.migration, number, statements: statements?.length ?? null },
    checks: log.checks,
    stop_conditions: log.stopConditions,
    evidence_files: evidence,
    verdict,
    remote_actions_performed: 0,
  };
  const execution = {
    schema: "trace-migration-execution-manifest-v1",
    approval: null,
    approved_by: null,
    approved_at: null,
    execution_window_utc: null,
    environment: manifest.environment,
    database: manifest.database,
    migration: { file: manifest.migration.file, sha256: manifest.migration.sha256, number },
    preflight_verdict: verdict.status,
    preflight_receipt_sha256: sha256(JSON.stringify(receipt)),
    plan: verdict.status === STATUS.PASS ? buildPlan(manifest, recovery) : [],
    last_resort: "A whole-database Time Travel restore (wrangler d1 time-travel restore) can erase unrelated writes made after the bookmark. It is never part of this plan and needs its own owner approval.",
    note: "This file is a plan. Nothing in TRACE-OPS-01 executes it.",
  };
  return { receipt, execution };
}

export function renderPreflightMarkdown(receipt: any, execution: any): string {
  const lines = [`# Migration preflight: ${receipt.verdict.status}`, "", receipt.verdict.text, "",
    `- **Environment:** ${receipt.environment}`, `- **Database:** ${receipt.database.name} (\`${receipt.database.uuid}\`)`,
    `- **Migration:** \`${receipt.migration.file}\` (${receipt.migration.statements ?? "?"} statements), SHA-256 \`${receipt.migration.sha256}\``,
    `- **Remote actions performed:** ${receipt.remote_actions_performed}`, `- **Approval on the execution manifest:** ${execution.approval === null ? "none (null); this plan is not approved" : execution.approval}`, ""];
  if (receipt.stop_conditions.length) lines.push("## Stop conditions raised", "", ...receipt.stop_conditions.map((s: string) => `- **${s}**`), "");
  lines.push("## Checks", "", "| Check | Status | Result |", "|---|---|---|", ...receipt.checks.map((c: any) => `| \`${c.id}\` | **${c.status}** | ${String(c.summary).replace(/\|/g, "\\|")} |`), "");
  if (execution.plan.length) {
    lines.push("## Plan (for a person to run after separate approval)", "");
    for (const s of execution.plan) {
      lines.push(`${s.step}. **${s.title}**`, "", "```bash", ...s.commands, "```", "", `   Expect: ${s.expect}`, "");
      if (s.recovery) lines.push("   Recovery if interrupted:", ...s.recovery.map((r: string) => `   - ${r}`), "");
    }
    lines.push(execution.last_resort, "");
  } else lines.push("No plan was generated because preflight did not pass.", "");
  return lines.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const known = new Set(["--manifest", "--out-dir"]);
  for (let i = 0; i < argv.length; i += 2) if (!known.has(argv[i]) || argv[i + 1] === undefined) { console.error(`usage: migration-preflight.ts --manifest <file> [--out-dir <dir>] (bad argument ${argv[i]})`); return 3; }
  const manifestPath = get("--manifest");
  if (!manifestPath) { console.error("--manifest is required"); return 3; }
  let result;
  try { result = await runPreflight(manifestPath); } catch (e: any) { console.error(`refused: ${e?.message ?? e}`); return 3; }
  const outDir = get("--out-dir") ?? "ops-receipts";
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `preflight-${result.receipt.environment}-${result.receipt.migration.number}-${result.receipt.generated_at.replace(/[:.]/g, "-")}`);
  writeFileSync(`${base}.json`, JSON.stringify(result.receipt, null, 2) + "\n", { flag: "wx" });
  writeFileSync(`${base}.execution-manifest.json`, JSON.stringify(result.execution, null, 2) + "\n", { flag: "wx" });
  writeFileSync(`${base}.md`, renderPreflightMarkdown(result.receipt, result.execution), { flag: "wx" });
  console.log(`${result.receipt.verdict.text}\nreceipt: ${base}.json\nplan:    ${base}.execution-manifest.json (approval: null)\nreport:  ${base}.md`);
  return exitCode(result.receipt.verdict);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
