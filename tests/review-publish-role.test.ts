import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorisedRoute } from "../src/pages/api/admin/[...path]";

// SEED-02 reader QA: /admin/review rendered "Publish Story" and "Archive (not
// news)" to readers. The server refused both, but readers should not be offered
// controls they cannot use. The markup is role-gated; the script is not (D6).

const source = readFileSync("src/pages/admin/review.astro", "utf8").replace(/\r\n/g, "\n");
const markup = source.slice(0, source.indexOf("<script>"));
const script = source.slice(source.indexOf("<script>"));

// One role decision, taken from the authenticated operator.
assert.match(source, /const isPublisher = Astro\.locals\.operator\?\.role === "publisher";/);
assert.match(markup, /data-assertion-governance-role=\{isPublisher \? "publisher" : "reader"\}/, "assertion controls share the same role decision");

// Publish and archive render only inside the publisher branch.
const gate = markup.indexOf("{isPublisher && (");
const gateEnd = markup.indexOf(")}", gate);
assert.ok(gate > 0 && gateEnd > gate, "the publish controls sit in an isPublisher block");
for (const id of ["publish-btn", "archive-btn"]) {
  const at = markup.indexOf(`id="${id}"`);
  assert.equal(markup.split(`id="${id}"`).length - 1, 1, `${id} is rendered exactly once`);
  assert.ok(at > gate && at < gateEnd, `${id} is publisher-only`);
}
assert.ok(markup.indexOf('id="publish-status"') > gateEnd, "the status line still renders for everyone");

// Readers see why the controls are missing.
assert.match(markup, /\{!isPublisher && <p class="card meta" role="note" data-review-read-only[^>]*>You have read-only access\. Publishing and archiving are done by publishers\.<\/p>\}/);

// D6: no role-conditional <script>; the one page script tolerates absent buttons.
assert.equal(source.split("<script>").length - 1, 1, "a single, unconditional page script");
assert.doesNotMatch(source, /&&\s*\(\s*\n?\s*<script>/, "no conditional <script>");
assert.match(script, /\$<HTMLButtonElement>\("publish-btn"\)\?\.addEventListener/);
assert.match(script, /\$<HTMLButtonElement>\("archive-btn"\)\?\.addEventListener/);
assert.match(script, /if \(btn && select && summary\)/, "checkPublishReady skips a missing publish button");
assert.match(script, /if \(archBtn && select\)/, "checkPublishReady skips a missing archive button");

// The server boundary is unchanged: readers can never publish or archive.
for (const route of ["publish-story", "archive-cluster"]) {
  assert.equal(authorisedRoute(route, "POST", "reader"), false, `${route}: reader POST refused`);
  assert.equal(authorisedRoute(route, "POST", "publisher"), true, `${route}: publisher POST allowed`);
}

console.log("review publish role tests passed");
