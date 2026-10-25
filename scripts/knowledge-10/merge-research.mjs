// Merge KNOWLEDGE-10 research record files into one inventory, validating the
// §9.4 record format and rejecting duplicate IDs or unknown evidence states.
// Usage: node scripts/knowledge-10/merge-research.mjs <out.json> <in.json>...
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const FIELDS = ["id", "subject", "claim", "canonicalSource", "supportingSources", "publicationDate", "observationDate",
  "versionOrRevision", "evidence", "reproducibility", "confidence", "relevance", "limitations", "nextAction", "supersession", "state"];
const STATES = new Set(["VERIFIED", "REPRODUCED", "COMMUNITY_REPORTED", "ANNOUNCED", "RUMOURED", "DISPUTED", "SUPERSEDED"]);

const [outFile, ...inputs] = process.argv.slice(2);
const records = [];
const seen = new Set();
const problems = [];
for (const file of inputs) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(parsed) ? parsed : parsed.records;
  for (const record of list) {
    for (const field of FIELDS) if (!(field in record)) problems.push(`${basename(file)} ${record.id ?? "?"}: missing ${field}`);
    if (!STATES.has(record.state)) problems.push(`${record.id}: unknown state ${record.state}`);
    if (seen.has(record.id)) problems.push(`duplicate id ${record.id}`);
    seen.add(record.id);
    records.push({ ...record, inputFile: basename(file) });
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
records.sort((a, b) => a.id.localeCompare(b.id));
const states = Object.fromEntries([...STATES].map((state) => [state, records.filter((r) => r.state === state).length]));
writeFileSync(outFile, `${JSON.stringify({ schemaVersion: "trace-research-inventory-v1", observationDate: "2026-10-23", recordCount: records.length, states, records }, null, 1)}\n`);
console.log(JSON.stringify({ outFile, recordCount: records.length, states }));
