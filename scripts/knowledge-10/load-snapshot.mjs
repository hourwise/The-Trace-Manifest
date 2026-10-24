// Load a logical snapshot JSON into a local SQLite file: tables, rows, then indexes/views/triggers/FTS.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, rmSync, existsSync } from "node:fs";
const [inFile, outDb] = process.argv.slice(2);
const snap = JSON.parse(readFileSync(inFile, "utf8"));
if (existsSync(outDb)) rmSync(outDb);
const db = new DatabaseSync(outDb);
const objs = snap.master.filter((o) => o.sql && !o.name.startsWith("sqlite_"));
const virtual = new Set(snap.skippedVirtual);
const shadow = (n) => [...virtual].some((v) => n.startsWith(`${v}_`));
db.exec("PRAGMA foreign_keys=OFF");
for (const o of objs.filter((o) => o.type === "table" && !virtual.has(o.name) && !shadow(o.name))) db.exec(o.sql);
db.exec("BEGIN");
let rows = 0;
for (const [table, data] of Object.entries(snap.data)) {
  if (!data.length) continue;
  const cols = Object.keys(data[0]);
  const stmt = db.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
  for (const r of data) { stmt.run(...cols.map((c) => r[c] ?? null)); rows++; }
}
db.exec("COMMIT");
for (const t of ["index", "view"]) for (const o of objs.filter((o) => o.type === t)) db.exec(o.sql);
for (const o of objs.filter((o) => o.type === "table" && virtual.has(o.name))) { db.exec(o.sql); try { db.exec(`INSERT INTO "${o.name}"("${o.name}") VALUES('rebuild')`); } catch (e) { console.log("rebuild skipped", o.name, e.message); } }
for (const o of objs.filter((o) => o.type === "trigger")) db.exec(o.sql);
console.log(JSON.stringify({ outDb, capturedAt: snap.capturedAt, tables: Object.keys(snap.data).length, rows }));
