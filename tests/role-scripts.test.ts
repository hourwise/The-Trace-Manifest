import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderedScripts, verifyRoleScripts } from "../scripts/verify-role-scripts.mjs";

// D6: Astro bundled the role-conditional run-extraction <script> with the
// audit script's body, so readers never received the extraction audit code.

const page = "/src/pages/admin/extract-claims.astro?astro&type=script";
const id = (index: number) => `${page}&index=${index}&lang.ts`;
const unconditionalCall = (index: number) => `\${renderScript($$result2, "${id(index)}")}`;
const conditionalCall = (index: number) => `\${canExecuteExtraction && renderTemplate\`\${renderScript($$result2, "${id(index)}")}\`}`;

function fixture(pageSource: string, inlined: Array<[string, string]>, entries: Record<string, string> = {}): string {
  const dist = mkdtempSync(join(tmpdir(), "role-scripts-"));
  mkdirSync(join(dist, "_worker.js", "pages", "admin"), { recursive: true });
  mkdirSync(join(dist, "_astro"), { recursive: true });
  writeFileSync(join(dist, "_worker.js", "pages", "admin", "extract-claims.astro.mjs"), `const $$ = renderTemplate\`<main></main>${pageSource}\`;`);
  const entryModules: Record<string, string> = {};
  for (const [scriptId, code] of Object.entries(entries)) {
    const file = `_astro/chunk-${Object.keys(entryModules).length}.js`;
    writeFileSync(join(dist, file), code);
    entryModules[scriptId] = file;
  }
  writeFileSync(join(dist, "_worker.js", "manifest_test.mjs"), `function deserializeManifest(m) { return m; }\nconst manifest = deserializeManifest(${JSON.stringify({ inlinedScripts: inlined, entryModules })});\n`);
  return dist;
}

const auditCode = 'document.getElementById("recent-extraction-runs")';
const runCode = 'document.getElementById("extract-form")';

// Detection of conditional scripts.
assert.deepEqual(renderedScripts(`${unconditionalCall(0)}${conditionalCall(1)}`), { unconditional: [id(0)], conditional: [id(1)] });
assert.deepEqual(renderedScripts(`${unconditionalCall(0)} <p>x</p> ${unconditionalCall(1)}`).conditional, []);

const cases: Array<{ name: string; dist: string; expectOk: boolean; match?: RegExp }> = [];
try {
  // The D6 shape: the conditional script holds the audit body, so readers get only the run code.
  cases.push({ name: "D6 swapped bundle", dist: fixture(`${unconditionalCall(0)}${conditionalCall(1)}`, [[id(0), runCode]], { [id(1)]: auditCode }), expectOk: false, match: /readers do not receive the extraction audit code/ });
  // A conditional script fails even when the bodies happen to land correctly.
  cases.push({ name: "conditional but correctly ordered", dist: fixture(`${unconditionalCall(0)}${conditionalCall(1)}`, [[id(0), auditCode]], { [id(1)]: runCode }), expectOk: false, match: /renders a <script> conditionally/ });
  // The fix: both scripts render for every role, wherever the bundler puts each body.
  cases.push({ name: "both unconditional, swapped bodies", dist: fixture(`${unconditionalCall(0)}${unconditionalCall(1)}`, [[id(0), runCode]], { [id(1)]: auditCode }), expectOk: true });
  cases.push({ name: "both unconditional", dist: fixture(`${unconditionalCall(0)}${unconditionalCall(1)}`, [[id(0), auditCode], [id(1), runCode]]), expectOk: true });

  for (const { name, dist, expectOk, match } of cases) {
    const failures = verifyRoleScripts(dist);
    assert.equal(failures.length === 0, expectOk, `${name}: ${failures.join("; ")}`);
    if (match) assert.ok(failures.some((failure) => match.test(failure)), `${name}: expected ${match}`);
  }
} finally {
  for (const { dist } of cases) rmSync(dist, { recursive: true, force: true });
}

// The real page source no longer gates a <script> on the role.
const source = readFileSync("src/pages/admin/extract-claims.astro", "utf8").replace(/\r\n/g, "\n");
assert.doesNotMatch(source, /&&\s*\(\s*\n\s*<script>/, "no role-conditional <script> on the extraction page");
assert.match(source, /canExecuteExtraction \? \(/, "the run form itself stays publisher-only");

console.log("role-gated script tests passed");
