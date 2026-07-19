// Batch guide ingestion script.
// Reads .md files from docs/guides/, parses YAML frontmatter,
// validates, and generates SQL INSERT statements for D1.
// Run: node scripts/batch-ingest-guides.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const INPUT_DIR = resolve("docs/guides");

// ── Minimal frontmatter parser ───────────────────────────────────

const VALID_CATEGORIES = [
  "local-ai","mcp-agents","git-github","servers-self-hosting",
  "cloud-deployment","security","development-tools","troubleshooting",
  "mobile-development","databases","automation",
];

const VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced"];

const VALID_VERIFICATION = [
  "documentation-reviewed","partially-tested","fully-tested",
  "long-term-tested","needs-review","outdated","withdrawn",
];

const VALID_SOURCE_RELATIONSHIPS = [
  "instruction-source","security-source","compatibility-source",
  "pricing-source","background","contradicting-source",
];

function parseFrontmatter(raw) {
  if (!raw.trimStart().startsWith("---")) {
    return { error: "Document must start with YAML frontmatter delimited by ---" };
  }
  const trimmed = raw.trimStart();
  const endOfFirstDelim = trimmed.indexOf("\n", 3);
  if (endOfFirstDelim === -1) return { error: "Missing closing ---" };

  const rest = trimmed.slice(endOfFirstDelim + 1);
  const closingIdx = rest.indexOf("\n---");
  if (closingIdx === -1) return { error: "Missing closing ---" };

  const yamlBlock = rest.slice(0, closingIdx);
  const body = rest.slice(closingIdx + 4).trim();

  const frontmatter = {};
  const lines = yamlBlock.split("\n");
  let currentListKey = null;
  let currentList = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    // Nested list item under a key (sources)
    if (trimmedLine.startsWith("- name:") && currentListKey === "sources") {
      if (currentList.length > 0) {
        if (!frontmatter["sources"]) frontmatter["sources"] = [];
        frontmatter["sources"].push({ ...currentList[0] });
        currentList = [];
      }
      currentList.push({ name: trimmedLine.slice(7).trim().replace(/^["']|["']$/g, "") });
      continue;
    }
    if (trimmedLine.startsWith("  url:") && currentListKey === "sources" && currentList.length > 0) {
      currentList[0].url = trimmedLine.slice(6).trim().replace(/^["']|["']$/g, "");
      continue;
    }
    if (trimmedLine.startsWith("  relationship:") && currentListKey === "sources" && currentList.length > 0) {
      currentList[0].relationship = trimmedLine.slice(15).trim().replace(/^["']|["']$/g, "");
      continue;
    }

    // List item
    if (trimmedLine.startsWith("- ") && currentListKey && currentListKey !== "sources") {
      const value = trimmedLine.slice(2).trim().replace(/^["']|["']$/g, "");
      if (!frontmatter[currentListKey]) frontmatter[currentListKey] = [];
      frontmatter[currentListKey].push(value);
      continue;
    }

    // Key: value
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmedLine.slice(0, colonIdx).trim();
    let value = trimmedLine.slice(colonIdx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");

    if (key === "sources") {
      currentListKey = "sources";
      currentList = [];
      continue;
    }

    if (key === "tested_os" || key === "topics") {
      currentListKey = key;
      if (value && value !== "[]") {
        frontmatter[key] = [value];
      }
      continue;
    }

    currentListKey = null;
    frontmatter[key] = value;
  }

  // Flush any remaining source
  if (currentList.length > 0 && currentListKey === "sources") {
    if (!frontmatter["sources"]) frontmatter["sources"] = [];
    frontmatter["sources"].push({ ...currentList[0] });
  }

  return { frontmatter, body };
}

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// ── Process files ────────────────────────────────────────────────

const files = readdirSync(INPUT_DIR)
  .filter(f => f.endsWith(".md") && f !== "GUIDE-TEMPLATE.md")
  .sort();

console.log(`Found ${files.length} guide file(s) in ${INPUT_DIR}\n`);

const statements = [];
const results = [];

for (const file of files) {
  const filePath = resolve(INPUT_DIR, file);
  const raw = readFileSync(filePath, "utf8");
  const parsed = parseFrontmatter(raw);

  if (parsed.error) {
    console.log(`❌ ${file}: ${parsed.error}`);
    continue;
  }

  const { frontmatter, body } = parsed;
  const errors = [];

  if (!frontmatter.title || frontmatter.title.trim().length < 5) {
    errors.push("title missing or too short");
  }
  if (!frontmatter.category || !VALID_CATEGORIES.includes(frontmatter.category)) {
    errors.push(`category invalid: ${frontmatter.category}`);
  }
  if (!frontmatter.difficulty || !VALID_DIFFICULTIES.includes(frontmatter.difficulty)) {
    errors.push(`difficulty invalid: ${frontmatter.difficulty}`);
  }
  if (!frontmatter.verification_status || !VALID_VERIFICATION.includes(frontmatter.verification_status)) {
    errors.push(`verification_status invalid: ${frontmatter.verification_status}`);
  }
  if (!frontmatter.author_name || frontmatter.author_name.trim().length < 2) {
    errors.push("author_name missing");
  }

  if (errors.length > 0) {
    console.log(`❌ ${file}: ${errors.join("; ")}`);
    continue;
  }

  const slug = slugify(frontmatter.title);
  const guideId = `guide-${slug}-${createHash("sha256").update(slug + (frontmatter.author_name ?? "")).digest("hex").slice(0, 8)}`;

  const testedOs = frontmatter.tested_os ? JSON.stringify(
    Array.isArray(frontmatter.tested_os) ? frontmatter.tested_os : [frontmatter.tested_os]
  ) : null;
  const testedVersions = frontmatter.tested_versions ? JSON.stringify(frontmatter.tested_versions) : null;

  const documentJson = JSON.stringify({ frontmatter, body });

  const sources = frontmatter.sources || [];
  const boolVal = (v) => v === true || v === "true" || v === 1 ? 1 : 0;

  // Check for duplicate slug
  const existingSlug = statements.find(s => s.slug === slug);
  if (existingSlug) {
    console.log(`⚠️  ${file}: slug "${slug}" already used by "${existingSlug.file}". Skipping.`);
    continue;
  }

  const sql = `INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      ${escapeSql(guideId)},
      ${escapeSql(slug)},
      ${escapeSql(frontmatter.title.trim())},
      ${escapeSql(frontmatter.category)},
      ${escapeSql(frontmatter.difficulty)},
      ${escapeSql(frontmatter.verification_status)},
      'draft', 'internal',
      ${escapeSql(frontmatter.author_name.trim())},
      ${escapeSql(testedOs)},
      ${escapeSql(testedVersions)},
      ${escapeSql(frontmatter.estimated_cost || null)},
      ${boolVal(frontmatter.destructive_steps)},
      ${boolVal(frontmatter.network_exposure)},
      ${boolVal(frontmatter.credentials_required)},
      ${boolVal(frontmatter.root_required)},
      ${boolVal(frontmatter.downloads_executable)},
      ${escapeSql(body)},
      ${escapeSql(documentJson)},
      ${escapeSql(frontmatter.last_verified || null)},
      ${escapeSql(frontmatter.review_due || null)}
    );`;

  // Source inserts
  const sourceSqls = sources.map(src => {
    const rel = VALID_SOURCE_RELATIONSHIPS.includes(src.relationship) ? src.relationship : "instruction-source";
    return `INSERT OR IGNORE INTO guide_sources
      (id, guide_id, source_name, source_url, relationship, last_checked_at)
      VALUES (${escapeSql(crypto.randomUUID())}, ${escapeSql(guideId)}, ${escapeSql(src.name)}, ${escapeSql(src.url || null)}, '${rel}', ${escapeSql(frontmatter.last_verified || null)});`;
  });

  statements.push({ file, guideId, slug, sql, sourceSqls });
  results.push({ file, guideId, title: frontmatter.title.trim(), category: frontmatter.category, sources: sources.length });
}

// Write SQL
const sqlPath = resolve("scripts/batch-ingest-guides.sql");
const header = "-- Batch guide ingestion\n-- Generated from docs/guides/\n-- Run: npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-guides.sql\n\n";
const allSql = header + statements.map(s =>
  `-- ${s.file} → ${s.guideId}\n${s.sql}\n${s.sourceSqls.join("\n")}`
).join("\n\n");
writeFileSync(sqlPath, allSql, "utf8");

// Summary
console.log("═".repeat(60));
for (const r of results) {
  console.log(`✅ ${r.file} → ${r.guideId}`);
  console.log(`   "${r.title}" [${r.category}] · ${r.sources} source(s)`);
}
console.log("═".repeat(60));
console.log(`\n${results.length} valid guide(s). SQL written to: ${sqlPath}`);
console.log(`\nTo ingest into production:`);
console.log(`  npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-guides.sql`);
if (statements.length !== files.length) {
  console.log(`\n⚠️  ${files.length - statements.length} file(s) skipped.`);
}
