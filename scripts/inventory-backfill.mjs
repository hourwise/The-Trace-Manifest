#!/usr/bin/env node
// KC-11A: read-only inventory for the historical backfill.
// This script never writes to D1. Preview is the default database target;
// production requires an explicit --remote --database trace-manifest-db.

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(".");
const CATEGORIES = [
  "published_story", "approved_knowledge_document", "static_knowledge_page",
  "knowledge_authoring_input", "guide", "correction", "model", "provider", "benchmark", "source_url",
  "evidence_url", "curated_seed",
];
// Categories whose items are keyed by URL: one capture per URL, origins merged.
const URL_KEYED_CATEGORIES = new Set(["source_url", "evidence_url"]);
const SEED_LIST_DIRECTORY = "docs/knowledge-seed";

const D1_QUERY = `
SELECT 'published_story' AS category, CAST(id AS TEXT) AS id, title AS label,
       publication_status AS state, NULL AS url, 'story_clusters' AS origin
FROM story_clusters WHERE publication_status = 'published'
UNION ALL
SELECT 'approved_knowledge_document', id, canonical_question, status, NULL, 'knowledge_documents'
FROM knowledge_documents WHERE status = 'approved'
UNION ALL
SELECT 'correction', CAST(id AS TEXT), correction_type, CASE WHEN published = 1 THEN 'published' ELSE 'unpublished' END, evidence_url, 'corrections'
FROM corrections
ORDER BY category, id;
`;

// knowledge_pages exists on some legacy databases only (not Production), so it
// is queried separately and only when present.
const D1_LEGACY_PAGES_QUERY = `
SELECT 'static_legacy_knowledge_page' AS category, CAST(id AS TEXT) AS id, title AS label,
       status AS state, NULL AS url, 'knowledge_pages' AS origin
FROM knowledge_pages WHERE status = 'published'
ORDER BY id;
`;

// KNOWLEDGE-10 C1: the source URLs behind legacy evidence, so the governed
// capture route can re-derive locator-backed assertions for the same canonical
// claims. Editorial-synthesis claims are TRACE prose and never evidence.
const D1_EVIDENCE_QUERY = `
WITH legacy AS (
  SELECT fi.url AS url, fi.title AS title,
         CASE WHEN ca.reviewer_state = 'accepted' THEN 2 ELSE 1 END AS rank
  FROM claim_assertions ca
  JOIN legacy_claim_evidence_map lm ON lm.assertion_id = ca.id
  JOIN claim_evidence ce ON ce.id = lm.legacy_evidence_id
  JOIN feed_items fi ON fi.id = ce.feed_item_id
  UNION ALL
  SELECT fi.url, fi.title, 0
  FROM canonical_claims cc
  JOIN legacy_claim_cutover lc ON lc.canonical_claim_id = cc.id
  JOIN claims c ON c.id = lc.legacy_claim_id
  JOIN feed_items fi ON fi.id = c.feed_item_id
  WHERE cc.claim_class <> 'editorial_synthesis'
)
SELECT 'evidence_url' AS category, 'evidence:' || url AS id, MIN(title) AS label,
       CASE MAX(rank) WHEN 2 THEN 'legacy_accepted' WHEN 1 THEN 'legacy_proposed' ELSE 'legacy_claim_only' END AS state,
       url, 'legacy_claim_evidence' AS origin
FROM legacy
WHERE url IS NOT NULL AND trim(url) <> ''
GROUP BY url
ORDER BY id;
`;

const D1_TABLES_QUERY = "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;";

/** The read-only inventory queries to run, given the tables the database has. */
export function databaseQueries(tableNames) {
  const tables = new Set(tableNames);
  const queries = [D1_QUERY, D1_CATALOGUE_QUERY, D1_SOURCE_QUERY];
  if (tables.has("knowledge_pages")) queries.push(D1_LEGACY_PAGES_QUERY);
  if (["claim_assertions", "legacy_claim_evidence_map", "legacy_claim_cutover"].every((table) => tables.has(table))) queries.push(D1_EVIDENCE_QUERY);
  return queries;
}

const D1_CATALOGUE_QUERY = `
SELECT 'model' AS category, CAST(id AS TEXT) AS id, name AS label,
       publication_status AS state, NULL AS url, 'models' AS origin
FROM models WHERE publication_status = 'published'
UNION ALL
SELECT 'provider', CAST(id AS TEXT), name, publication_status, website, 'providers'
FROM providers WHERE publication_status = 'published'
UNION ALL
SELECT 'benchmark', CAST(id AS TEXT), name, publication_status, code_url, 'benchmarks'
FROM benchmarks WHERE publication_status = 'published'
ORDER BY category, id;
`;

const D1_SOURCE_QUERY = `
SELECT 'source_url' AS category, 'registry:' || CAST(id AS TEXT) AS id, name AS label,
       CASE WHEN active = 1 THEN 'active' ELSE 'inactive' END AS state, url, 'sources' AS origin
FROM sources WHERE url IS NOT NULL AND trim(url) <> ''
UNION ALL
SELECT 'source_url', 'knowledge:' || id, knowledge_document_id, admission_state, source_reference, 'knowledge_document_sources'
FROM knowledge_document_sources WHERE source_reference IS NOT NULL AND trim(source_reference) <> ''
UNION ALL
SELECT 'source_url', 'benchmark-run:' || CAST(id AS TEXT), CAST(benchmark_id AS TEXT), 'linked', source_url, 'benchmark_runs'
FROM benchmark_runs WHERE source_url IS NOT NULL AND trim(source_url) <> ''
UNION ALL
SELECT 'source_url', 'correction:' || CAST(id AS TEXT), CAST(cluster_id AS TEXT), CASE WHEN published = 1 THEN 'published' ELSE 'unpublished' END, evidence_url, 'corrections'
FROM corrections WHERE evidence_url IS NOT NULL AND trim(evidence_url) <> ''
ORDER BY category, id;
`;

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function relativePath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function addItem(categories, category, item) {
  if (!categories[category]) categories[category] = [];
  categories[category].push({
    id: String(item.id),
    label: String(item.label ?? item.id),
    state: item.state ?? "unknown",
    ...(item.url ? { url: item.url } : {}),
    origin: item.origin,
  });
}

function validUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function collectFiles(directory, predicate) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path, predicate);
    return predicate(path) ? [path] : [];
  });
}

function staticInventory(categories) {
  const staticKnowledge = collectFiles(resolve(ROOT, "src/data/knowledge"), (path) => path.endsWith(".ts"));
  for (const path of staticKnowledge) {
    const body = readFileSync(path, "utf8");
    const slug = body.match(/slug:\s*["']([^"']+)["']/)?.[1] ?? relativePath(path);
    const title = body.match(/title:\s*["']([^"']+)["']/)?.[1] ?? slug;
    const state = body.match(/status:\s*["']([^"']+)["']/)?.[1] ?? "unknown";
    addItem(categories, "static_knowledge_page", { id: slug, label: title, state: `static:${state}`, origin: relativePath(path) });
    collectUrls(body, relativePath(path), categories);
  }

  const markdownInputs = collectFiles(resolve(ROOT, "docs/Knowledge Input"), (path) => path.endsWith(".md"));
  for (const path of markdownInputs) {
    const body = readFileSync(path, "utf8");
    const question = body.match(/^canonical_question:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ?? relativePath(path);
    addItem(categories, "knowledge_authoring_input", {
      id: `markdown:${relativePath(path)}`, label: question, state: "authoring_input", origin: relativePath(path),
    });
    collectUrls(body, relativePath(path), categories);
  }

  const guideFiles = collectFiles(resolve(ROOT, "src/guides"), (path) => path.endsWith(".ts") && !path.endsWith("contract.ts"));
  for (const path of guideFiles) {
    const body = readFileSync(path, "utf8");
    const title = body.match(/title:\s*["']([^"']+)["']/)?.[1] ?? relativePath(path);
    addItem(categories, "guide", { id: `static:${relativePath(path)}`, label: title, state: "static_draft", origin: relativePath(path) });
    collectUrls(body, relativePath(path), categories);
  }

  const guideDocs = collectFiles(resolve(ROOT, "docs/guides"), (path) => path.endsWith(".md"));
  for (const path of guideDocs) {
    addItem(categories, "guide", { id: `document:${relativePath(path)}`, label: relativePath(path), state: "documentation", origin: relativePath(path) });
    collectUrls(readFileSync(path, "utf8"), relativePath(path), categories);
  }

  // KNOWLEDGE-10 C1: owner-curated seed lists. Each list's state is carried
  // through so an unapproved list is visible as such in any plan.
  const seedLists = collectFiles(resolve(ROOT, SEED_LIST_DIRECTORY), (path) => path.endsWith(".json"));
  for (const path of seedLists) {
    const list = JSON.parse(readFileSync(path, "utf8"));
    if (list.schemaVersion !== "trace-seed-list-v1" || !/^[a-z0-9-]+$/.test(String(list.listId)) || !Array.isArray(list.sources)) {
      throw new Error(`${relativePath(path)} is not a trace-seed-list-v1 file.`);
    }
    for (const source of list.sources) {
      if (!/^S\d{2,3}$/.test(String(source.id)) || !validUrl(String(source.url ?? ""))) {
        throw new Error(`${relativePath(path)} has an invalid seed source: ${JSON.stringify(source.id)}.`);
      }
      addItem(categories, "curated_seed", {
        id: `seed:${list.listId}:${source.id}`, label: source.title ?? source.url, state: `seed_${list.approval ?? "proposed"}`,
        url: source.url, origin: relativePath(path),
      });
    }
  }
}

function collectUrls(body, origin, categories) {
  const matches = body.match(/https?:\/\/[^\s)\]}>"']+/g) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (validUrl(url)) addItem(categories, "source_url", { id: `${origin}:${url}`, label: url, state: "static_reference", url, origin });
  }
}

function parseWranglerJson(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("Wrangler did not return JSON results.");
  const parsed = JSON.parse(output.slice(start, end + 1));
  return parsed.flatMap((entry) => entry.results ?? []);
}

function collectDatabaseRows() {
  const database = argValue("--database", "trace-manifest-db-preview");
  if (!/^[A-Za-z0-9_-]+$/.test(database)) throw new Error("Database name contains unsupported characters.");
  const remote = hasArg("--remote");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "trace-kc11a-"));
  const run = (query, name) => {
    const queryFile = join(temporaryDirectory, `${name}.sql`);
    writeFileSync(queryFile, query, "utf8");
    const command = `npx.cmd wrangler d1 execute ${database} --config wrangler.toml ${remote ? "--remote" : "--local"} --json --file "${queryFile}"`;
    const output = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return parseWranglerJson(output);
  };
  try {
    const tableNames = run(D1_TABLES_QUERY, "tables").map((row) => String(row.name));
    return databaseQueries(tableNames).flatMap((query, index) => run(query, `inventory-${index}`));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function buildInventory({ databaseRows = [], root = ROOT, generatedAt = new Date().toISOString() } = {}) {
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, []]));
  for (const row of databaseRows) {
    const category = row.category === "static_legacy_knowledge_page" ? "static_knowledge_page" : row.category;
    if (!categories[category]) continue;
    if (URL_KEYED_CATEGORIES.has(category) && !validUrl(String(row.url ?? ""))) continue;
    addItem(categories, category, { ...row, origin: row.origin ?? "d1" });
  }
  const previousRoot = process.cwd();
  process.chdir(root);
  try { staticInventory(categories); } finally { process.chdir(previousRoot); }
  for (const category of Object.keys(categories)) {
    const unique = new Map();
    for (const item of categories[category]) {
      const key = URL_KEYED_CATEGORIES.has(category) ? item.url : `${item.id}:${item.url ?? ""}`;
      const previous = unique.get(key);
      if (previous && URL_KEYED_CATEGORIES.has(category)) {
        const origins = new Set([...(Array.isArray(previous.origin) ? previous.origin : [previous.origin]), item.origin]);
        previous.origin = [...origins].filter(Boolean).sort();
      } else if (!previous) {
        unique.set(key, item);
      }
    }
    categories[category] = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  return {
    schemaVersion: "kc-11a-v1",
    generatedAt,
    database: { mode: hasArg("--remote") ? "remote-explicit" : "preview-local-default" },
    categories,
    counts: Object.fromEntries(Object.entries(categories).map(([key, values]) => [key, values.length])),
    totalItems: Object.values(categories).reduce((total, values) => total + values.length, 0),
    notes: [
      "Inventory is read-only and does not enqueue, capture, extract, map, score, revise, or publish records.",
      "Static legacy pages and authoring inputs are inventoried separately from canonical approved D1 knowledge.",
      "A production inventory requires explicit --remote and a reviewed database target.",
    ],
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/inventory-backfill.mjs")) {
  try {
    const inventory = buildInventory({ databaseRows: hasArg("--static-only") ? [] : collectDatabaseRows() });
    const output = JSON.stringify(inventory, null, 2);
    const outputPath = argValue("--output");
    if (outputPath) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(resolve(outputPath), `${output}\n`, "utf8");
      console.log(`KC-11A inventory written to ${outputPath}`);
    } else if (hasArg("--summary")) {
      console.log(JSON.stringify({ schemaVersion: inventory.schemaVersion, counts: inventory.counts, totalItems: inventory.totalItems }, null, 2));
    } else {
      console.log(output);
    }
  } catch (error) {
    const detail = error instanceof Error && ("stderr" in error || "stdout" in error)
      ? `${String(error.stderr || "")} ${String(error.stdout || "")}`.trim() || error.message
      : error instanceof Error ? error.message : String(error);
    console.error(`KC-11A inventory failed: ${detail}`);
    process.exitCode = 1;
  }
}
