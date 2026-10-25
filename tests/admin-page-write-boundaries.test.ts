import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorisedRoute } from "../src/pages/api/admin/[...path]";

// D4 follow-up: /admin/desk and /admin/social read and write D1 directly in
// their frontmatter instead of going through the signed admin proxy. They must
// enforce the same role boundary as the proxy before any query or write.

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const frontmatter = (source: string) => source.slice(0, source.indexOf("\n---", 4));

// The proxy's matrix is the authority these pages must mirror.
assert.equal(authorisedRoute("candidates", "GET", "reader"), false, "readers cannot read TRACE Desk candidates");
assert.equal(authorisedRoute("candidates", "POST", "reader"), false);
assert.equal(authorisedRoute("social-signals", "GET", "reader"), true, "readers may list social signals");
assert.equal(authorisedRoute("social-signals", "POST", "reader"), false, "readers cannot write social signals");

// TRACE Desk: publisher-only before any D1 access or POST handling.
{
  const fm = frontmatter(read("src/pages/admin/desk.astro"));
  const guard = fm.indexOf('if (Astro.locals.operator?.role !== "publisher") return new Response("Forbidden", { status: 403');
  assert.ok(guard > 0, "Desk refuses non-publishers");
  assert.ok(guard < fm.indexOf("db.prepare"), "the Desk guard runs before any D1 statement");
  assert.ok(guard < fm.indexOf('Astro.request.method === "POST"'), "the Desk guard runs before POST handling");
}

// Social signals: readers list, publishers write.
{
  const source = read("src/pages/admin/social.astro");
  const fm = frontmatter(source);
  const guard = fm.indexOf('if (Astro.request.method === "POST" && !isPublisher) {');
  assert.ok(guard > 0, "Social refuses non-publisher POSTs");
  assert.ok(guard < fm.indexOf("db.prepare"), "the Social POST guard runs before any D1 write");
  assert.match(fm, /const isPublisher = Astro\.locals\.operator\?\.role === "publisher";/);

  const markup = source.slice(fm.length, source.indexOf("<script"));
  assert.match(markup, /\{isPublisher && <form method="POST" class="card"/, "the submission form is publisher-only markup");
  assert.match(markup, /\{s\.review_status === "pending" && isPublisher \? \(/, "approve, reject and AI Summarise are publisher-only markup");
  assert.match(markup, /\{!isPublisher && <p class="card meta" role="note" data-social-read-only>/, "readers see why the controls are absent");
  assert.equal((markup.match(/<form method="POST"/g) ?? []).length, 3, "no other write form exists on the page");

  // D6: the script is rendered for every role and tolerates missing controls.
  assert.equal(source.split("<script").length - 1, 1);
  assert.match(source, /document\.getElementById\("sig-ai-import-btn"\)\?\.addEventListener/);
}

console.log("admin page write-boundary tests passed");
