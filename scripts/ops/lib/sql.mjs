// TRACE-OPS-01: split a migration into statements and classify each one.
// Understands quotes, comments, and CREATE TRIGGER ... BEGIN ... END bodies
// (including CASE ... END inside them).

export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  let inTrigger = false;
  let depth = 0;
  let sawBegin = false;
  const flush = () => {
    const text = current.trim();
    if (text && stripComments(text).trim()) statements.push(text);
    current = "";
    inTrigger = false; depth = 0; sawBegin = false;
  };
  while (i < sql.length) {
    const ch = sql[i], next = sql[i + 1];
    if (ch === "-" && next === "-") { const end = sql.indexOf("\n", i); const stop = end === -1 ? sql.length : end; current += sql.slice(i, stop); i = stop; continue; }
    if (ch === "/" && next === "*") { const end = sql.indexOf("*/", i + 2); const stop = end === -1 ? sql.length : end + 2; current += sql.slice(i, stop); i = stop; continue; }
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      while (j < sql.length) { if (sql[j] === close) { if (close !== "]" && sql[j + 1] === close) { j += 2; continue; } break; } j += 1; }
      current += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(ch) && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? "")) {
      let j = i; while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      const word = sql.slice(i, j).toUpperCase();
      if (!current.trim()) inTrigger = false;
      if (word === "TRIGGER" && /^\s*CREATE\s+(TEMP\s+|TEMPORARY\s+)?$/i.test(stripComments(current))) inTrigger = true;
      if (inTrigger) {
        if (word === "BEGIN") { depth += 1; sawBegin = true; }
        else if (word === "CASE" && sawBegin) depth += 1;
        else if (word === "END" && sawBegin) depth -= 1;
      }
      current += sql.slice(i, j); i = j; continue;
    }
    if (ch === ";" && (!inTrigger || (sawBegin && depth === 0))) { current += ch; flush(); i += 1; continue; }
    current += ch; i += 1;
  }
  flush();
  return statements;
}

export function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const ident = String.raw`(?:"[^"]+"|\[[^\]]+\]|\x60[^\x60]+\x60|[A-Za-z_][A-Za-z0-9_]*)`;
const unquote = (name) => name?.replace(/^["[\x60]|["\]\x60]$/g, "");

/** kind, object name and whether D1 accepts it in a migration file. */
export function classify(statement) {
  const s = stripComments(statement).trim().replace(/\s+/g, " ");
  const m = (re) => re.exec(s);
  let r;
  if ((r = m(new RegExp(`^CREATE (?:TEMP |TEMPORARY )?TABLE (IF NOT EXISTS )?(${ident})`, "i")))) return { kind: "create_table", name: unquote(r[2]), ifNotExists: Boolean(r[1]) };
  if ((r = m(new RegExp(`^CREATE (?:UNIQUE )?INDEX (IF NOT EXISTS )?(${ident}) ON (${ident})`, "i")))) return { kind: "create_index", name: unquote(r[2]), table: unquote(r[3]), ifNotExists: Boolean(r[1]) };
  if ((r = m(new RegExp(`^CREATE (?:TEMP |TEMPORARY )?TRIGGER (IF NOT EXISTS )?(${ident})`, "i")))) return { kind: "create_trigger", name: unquote(r[2]), ifNotExists: Boolean(r[1]) };
  if ((r = m(new RegExp(`^CREATE (?:TEMP |TEMPORARY )?VIEW (IF NOT EXISTS )?(${ident})`, "i")))) return { kind: "create_view", name: unquote(r[2]), ifNotExists: Boolean(r[1]) };
  if ((r = m(new RegExp(`^ALTER TABLE (${ident}) ADD (?:COLUMN )?(${ident})`, "i")))) return { kind: "alter_add_column", table: unquote(r[1]), column: unquote(r[2]) };
  if ((r = m(new RegExp(`^ALTER TABLE (${ident}) (RENAME|DROP)`, "i")))) return { kind: `alter_${r[2].toLowerCase()}`, table: unquote(r[1]) };
  if ((r = m(new RegExp(`^(?:INSERT|REPLACE)(?: OR [A-Z]+)? INTO (${ident})`, "i")))) return { kind: /^REPLACE|^INSERT OR REPLACE/i.test(s) ? "replace" : "insert", table: unquote(r[1]) };
  if ((r = m(new RegExp(`^UPDATE(?: OR [A-Z]+)? (${ident})`, "i")))) return { kind: "update", table: unquote(r[1]) };
  if ((r = m(new RegExp(`^DELETE FROM (${ident})`, "i")))) return { kind: "delete", table: unquote(r[1]) };
  if ((r = m(new RegExp(`^DROP (TABLE|INDEX|TRIGGER|VIEW)`, "i")))) return { kind: "drop", object: r[1].toLowerCase() };
  if (/^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(s)) return { kind: "transaction" };
  if (/^(ATTACH|DETACH)\b/i.test(s)) return { kind: "attach" };
  if (/^VACUUM\b/i.test(s)) return { kind: "vacuum" };
  if (/^PRAGMA\b/i.test(s)) return { kind: "pragma" };
  if (/^(SELECT|WITH)\b/i.test(s)) return { kind: "select" };
  return { kind: "other" };
}

export const ADDITIVE = new Set(["create_table", "create_index", "create_trigger", "create_view", "alter_add_column", "select"]);
/** Statements D1 rejects or that must not appear in a reviewed migration file. */
export const D1_REFUSED = new Set(["transaction", "attach", "vacuum", "pragma", "other"]);
