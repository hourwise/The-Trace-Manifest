// Batch knowledge document ingestion script.
// Reads .md files from docs/Knowledge Input/, parses YAML frontmatter,
// validates, and generates SQL INSERT statements for D1.
// Run: node scripts/batch-ingest-knowledge.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";

const INPUT_DIR = resolve("docs/Knowledge Input");

// ── Minimal frontmatter parser (mirrors src/pages/api/admin/knowledge/ingest.ts) ──

const VALID_KNOWLEDGE_TYPES = [
  "definition", "explainer", "comparison", "recommendation", "how_to",
  "current_status", "timeline", "product_profile", "model_profile",
  "policy_summary", "security_advisory", "frequently_asked_question",
];

const VALID_EVIDENCE_STATUSES = [
  "confirmed", "strongly_supported", "provisionally_supported",
  "vendor_reported", "community_reported", "disputed", "unverified",
  "insufficient", "stale",
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

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    if (trimmedLine.startsWith("- ") && currentListKey) {
      const value = trimmedLine.slice(2).trim().replace(/^["']|["']$/g, "");
      if (!frontmatter[currentListKey]) frontmatter[currentListKey] = [];
      frontmatter[currentListKey].push(value);
      continue;
    }
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmedLine.slice(0, colonIdx).trim();
    let value = trimmedLine.slice(colonIdx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (!value || value === "..." || value === "YYYY-MM-DD" || value === '""') {
      if (["valid_from", "review_after", "hard_expiry", "source_set_hash"].includes(key)) {
        value = "";
      } else continue;
    }
    if (key === "topics") {
      currentListKey = "topics";
      if (value && value !== "[]") frontmatter.topics = [value];
      continue;
    }
    currentListKey = null;
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function parseBodySections(body) {
  const sections = {};
  const headingRegex = /^## (.+)$/gm;
  const matches = [];
  let match;
  while ((match = headingRegex.exec(body)) !== null) {
    matches.push({ title: match[1].trim(), start: match.index, end: match.index + match[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : body.length;
    const content = body.slice(current.end, nextStart).trim();
    const slug = current.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    sections[slug] = content;
  }
  return sections;
}

function canonicalHash(question) {
  return createHash("sha256").update(question.toLowerCase().trim()).digest("hex");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).replace(/'/g, "''").replace(/\n/g, "\\n").replace(/\r/g, "") + "'";
}

// ── Read and process all .md files ──

const files = readdirSync(INPUT_DIR).filter(f => f.endsWith(".md")).sort();
console.log(`Found ${files.length} .md files in ${INPUT_DIR}\n`);

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

  // Validate
  if (!frontmatter.canonical_question || frontmatter.canonical_question.trim().length < 5) {
    errors.push("canonical_question missing or too short");
  }
  if (!frontmatter.section) {
    errors.push("section missing");
  }
  if (!frontmatter.knowledge_type || !VALID_KNOWLEDGE_TYPES.includes(frontmatter.knowledge_type)) {
    errors.push(`knowledge_type invalid: ${frontmatter.knowledge_type}`);
  }

  if (errors.length > 0) {
    console.log(`❌ ${file}: ${errors.join("; ")}`);
    continue;
  }

  const hash = canonicalHash(frontmatter.canonical_question);
  const docId = `knowledge-${slugify(frontmatter.canonical_question)}-${hash.slice(0, 8)}`;
  const evidenceStatus = VALID_EVIDENCE_STATUSES.includes(frontmatter.evidence_status)
    ? frontmatter.evidence_status : "unverified";

  const bodySections = parseBodySections(body);
  const directAnswer = bodySections["direct_answer"] ?? null;
  const detailedExplanation = bodySections["detailed_explanation"] ?? null;

  const documentJson = JSON.stringify({ frontmatter, body, sections: bodySections });
  const topicSlug = frontmatter.topics && frontmatter.topics.length > 0 ? frontmatter.topics[0] : null;

  // Build INSERT
  const sql = `INSERT OR IGNORE INTO knowledge_documents
    (id, canonical_question, canonical_hash, section_slug, topic_slug,
     knowledge_type, status, visibility, evidence_status,
     direct_answer, detailed_explanation, document_json,
     source_set_hash, policy_version,
     valid_from, review_after, hard_expiry,
     created_by)
    VALUES (
      ${escapeSql(docId)},
      ${escapeSql(frontmatter.canonical_question.trim())},
      ${escapeSql(hash)},
      ${escapeSql(frontmatter.section)},
      ${escapeSql(topicSlug)},
      ${escapeSql(frontmatter.knowledge_type)},
      'draft', 'internal',
      ${escapeSql(evidenceStatus)},
      ${escapeSql(directAnswer)},
      ${escapeSql(detailedExplanation)},
      ${escapeSql(documentJson)},
      ${escapeSql(frontmatter.source_set_hash || null)},
      'trace-knowledge-v1',
      ${escapeSql(frontmatter.valid_from || null)},
      ${escapeSql(frontmatter.review_after || null)},
      ${escapeSql(frontmatter.hard_expiry || null)},
      'batch-ingest'
    );`;

  statements.push({ file, docId, question: frontmatter.canonical_question.trim(), sql });
  results.push({ file, docId, question: frontmatter.canonical_question.trim(), status: "valid" });
}

// Write SQL file
const sqlPath = resolve("scripts/batch-ingest-knowledge.sql");
const header = "-- Batch knowledge document ingestion\n-- Generated from docs/Knowledge Input/\n-- Run: npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-knowledge.sql\n\n";
const allSql = header + statements.map(s => `-- ${s.file} → ${s.docId}\n${s.sql}`).join("\n\n");
writeFileSync(sqlPath, allSql, "utf8");

// Print summary
console.log("═".repeat(60));
for (const r of results) {
  console.log(`✅ ${r.file} → ${r.docId}`);
  console.log(`   "${r.question}"`);
}
console.log("═".repeat(60));
console.log(`\n${results.length} valid documents. SQL written to: ${sqlPath}`);
console.log(`\nTo ingest into production:`);
console.log(`  npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-knowledge.sql`);
if (statements.length !== files.length) {
  console.log(`\n⚠️  ${files.length - statements.length} file(s) skipped due to validation errors.`);
}
