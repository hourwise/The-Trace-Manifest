import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseKnowledgeMarkdown } from "../src/lib/server/knowledge-markdown";

const inputDirectory = resolve("docs/Knowledge Input");
const files = readdirSync(inputDirectory)
  .filter((file) => file.endsWith(".md"))
  .sort();

const failures: string[] = [];
let claimCount = 0;
let evidenceCount = 0;

for (const file of files) {
  const parsed = parseKnowledgeMarkdown(readFileSync(resolve(inputDirectory, file), "utf8"));
  if ("error" in parsed) {
    failures.push(`${file}: ${parsed.error}`);
    continue;
  }
  if (parsed.materialClaims.length === 0) failures.push(`${file}: no material claims found`);
  if (parsed.evidenceUrls.length === 0) failures.push(`${file}: no evidence URLs found`);
  claimCount += parsed.materialClaims.length;
  evidenceCount += parsed.evidenceUrls.length;
}

console.log(JSON.stringify({
  inputDirectory,
  documentCount: files.length,
  materialClaimCount: claimCount,
  evidenceUrlCount: evidenceCount,
  failures,
  pass: failures.length === 0,
}, null, 2));

if (failures.length > 0) process.exit(1);
