// Read-only logical backup with keyset pagination (each row read once).
// Usage: node logical-backup-keyset.mjs <repoDir> <dbName> <envFlag|-> <outFile>
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [repo, dbName, envFlag, outFile] = process.argv.slice(2);
const baseArgs = [`${repo}/node_modules/wrangler/bin/wrangler.js`, "d1", "execute", dbName, "--remote", "--config", "wrangler.worker.toml", "--json"];
if (envFlag !== "-") baseArgs.push("--env", envFlag);
let totalRowsRead = 0;

function query(sql) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let out;
    try {
      out = execFileSync(process.execPath, [...baseArgs, "--command", sql], { cwd: repo, encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch (error) { out = error.stdout; }
    try {
      const parsed = JSON.parse(out.slice(out.search(/^[\[{]/m)));
      if (parsed.error) throw new Error(JSON.stringify(parsed.error.notes));
      totalRowsRead += parsed.reduce((n, r) => n + (r.meta?.rows_read ?? 0), 0);
      return parsed;
    } catch (error) { if (attempt === 3) throw error; }
  }
}

const master = query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE '_cf_%' ORDER BY rowid")[0].results;
const virtual = master.filter((o) => o.type === "table" && /VIRTUAL TABLE/i.test(o.sql ?? "")).map((o) => o.name);
const tables = master.filter((o) => o.type === "table" && !virtual.includes(o.name) && !virtual.some((v) => o.name.startsWith(`${v}_`)) && !o.name.startsWith("sqlite_")).map((o) => o.name);

const data = {};
let totalRows = 0;
for (const table of tables) {
  const rows = [];
  let last = null;
  for (;;) {
    const where = last === null ? "" : `WHERE rowid > ${last}`;
    const page = query(`SELECT rowid AS "__trace_rowid", * FROM "${table}" ${where} ORDER BY rowid LIMIT 2000`)[0].results;
    for (const row of page) { last = row.__trace_rowid; delete row.__trace_rowid; rows.push(row); }
    if (page.length < 2000) break;
  }
  data[table] = rows;
  totalRows += rows.length;
  process.stderr.write(`${table}: ${rows.length}\n`);
}
const body = JSON.stringify({ database: dbName, capturedAt: new Date().toISOString(), master, skippedVirtual: virtual, data });
writeFileSync(outFile, body);
console.log(JSON.stringify({ outFile, tables: tables.length, totalRows, d1RowsRead: totalRowsRead, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }));
