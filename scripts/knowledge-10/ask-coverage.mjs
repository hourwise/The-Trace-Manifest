// For each KNOWLEDGE-10 general question, count what Production currently stores
// that the Ask retrieval terms would match, with and without the eligibility gates.
// Tokenisation mirrors terms() in src/lib/server/ask-evidence.ts.
// Usage: node scripts/knowledge-10/ask-coverage.mjs <snapshot.sqlite> [suite.json]
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const [dbFile, suiteFile = "tests/fixtures/knowledge-10/ask-evaluation-suite.json"] = process.argv.slice(2);
const db = new DatabaseSync(dbFile, { readOnly: true });
const suite = JSON.parse(readFileSync(suiteFile, "utf8"));

const STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "best", "can", "could", "does",
  "for", "from", "has", "have", "how", "into", "its", "most", "not", "that", "the",
  "their", "this", "was", "what", "when", "where", "which", "with", "would", "your",
]);
const terms = (question) => [...new Set(question.toLowerCase().match(/[a-z0-9][a-z0-9.+_-]{2,}/g) ?? [])]
  .filter((term) => !STOP_WORDS.has(term)).sort((a, b) => b.length - a.length).slice(0, 8);
const like = (term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const storySearchable = "LOWER(cc.canonical_text || ' ' || COALESCE(fi.title, '') || ' ' || COALESCE(fi.content_excerpt, '') || ' ' || COALESCE(sd.canonical_url, ''))";
const storyFrom = `FROM claim_assertions ca JOIN canonical_claims cc ON cc.id = ca.canonical_claim_id
  LEFT JOIN source_document_versions sv ON sv.id = ca.source_document_version_id
  LEFT JOIN source_documents sd ON sd.id = sv.source_document_id
  LEFT JOIN legacy_claim_evidence_map lm ON lm.assertion_id = ca.id
  LEFT JOIN claim_evidence ce ON ce.id = lm.legacy_evidence_id
  LEFT JOIN feed_items fi ON fi.id = ce.feed_item_id`;
const gates = `ca.admission_state = 'admitted' AND ca.reviewer_state = 'accepted' AND ca.freshness_state = 'current'`;
const knowledgeSearchable = "LOWER(kd.canonical_question || ' ' || COALESCE(kd.direct_answer, '') || ' ' || COALESCE(kd.detailed_explanation, ''))";

const rows = [];
for (const item of suite.general) {
  const t = terms(item.question);
  if (!t.length) { rows.push({ id: item.id, terms: [], stored: 0, accepted: 0, eligible: 0, knowledge: 0 }); continue; }
  const sp = t.map(() => `${storySearchable} LIKE ? ESCAPE '\\'`).join(" OR ");
  const kp = t.map(() => `${knowledgeSearchable} LIKE ? ESCAPE '\\'`).join(" OR ");
  const args = t.map(like);
  const count = (extra) => db.prepare(`SELECT COUNT(DISTINCT ca.id) n ${storyFrom} WHERE (${sp}) ${extra}`).get(...args).n;
  rows.push({
    id: item.id,
    terms: t,
    stored: count(""),
    accepted: count("AND ca.admission_state = 'admitted' AND ca.reviewer_state = 'accepted'"),
    eligible: count(`AND ${gates}`),
    knowledge: db.prepare(`SELECT COUNT(*) n FROM knowledge_documents kd WHERE kd.status = 'approved' AND (${kp})`).get(...args).n,
  });
}
console.log(JSON.stringify(rows, null, 1));
