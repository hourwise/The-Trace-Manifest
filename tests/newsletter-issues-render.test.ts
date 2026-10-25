import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { generateIssueDraft } from "../src/lib/server/newsletter-issues";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task E, rendered: the BUILT issue admin pages. Run after
// npm run build (npm run ci does).

const pagePath = (path: string) => {
  const file = `dist/_worker.js/pages/admin/newsletter/${path}`;
  if (!existsSync(file)) throw new Error(`${file} not found: run npm run build first.`);
  return file;
};
const db = new SQLiteD1();
db.sqlite.exec(`
  INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (3001, 1, 'https://r.example/1', 'r1', 'R1', 'published');
  INSERT INTO story_clusters (id, slug, title, topic, summary, why_it_matters, evidence_status, publication_status, is_published, published_at, reviewed_by, reviewed_at)
    VALUES (3001, 'render-story', 'Render <story>', 'models', 'A published summary for the render test.', NULL, 'confirmed', 'published', 1, '2026-10-24T10:00:00Z', 'p@example.test', '2026-10-24T10:00:00Z');
  INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (3001, 3001, 1);
`);
const created = await generateIssueDraft(db.asD1(), { email: "publisher@example.test", role: "publisher" }, { issueDate: "2026-10-25" });
assert.equal(created.status, "created");
const issueId = (created as { issue: { id: string } }).issue.id;
const container = await AstroContainer.create();
async function render(path: string, url: string, role: "publisher" | "reader", params: Record<string, string> = {}) {
  const module = await (await import(pathToFileURL(pagePath(path)).href)).page();
  const response = await container.renderToResponse(module.default, {
    params,
    locals: {
      operator: { email: `${role}@example.test`, role, subject: role, expiresAt: Math.floor(Date.now() / 1000) + 600 },
      runtime: { env: { DB: db.asD1() } },
    } as unknown as App.Locals,
    request: new Request(`https://thetracemanifest.com${url}`),
  });
  return { status: response.status, html: (await response.text()).replace(/ data-astro-cid-[a-z0-9]+/g, "") };
}

const list = await render("issues.astro.mjs", "/admin/newsletter/issues", "publisher");
assert.equal(list.status, 200);
assert.match(list.html, /2026-10-25 · v1/);
assert.match(list.html, /data-issue-status="draft"/);
assert.equal((await render("issues.astro.mjs", "/admin/newsletter/issues", "reader")).status, 403);

const detail = await render("issues/_id_.astro.mjs", `/admin/newsletter/issues/${issueId}`, "publisher", { id: issueId });
assert.equal(detail.status, 200);
assert.match(detail.html, /<iframe title="TRACE Weekly email preview" sandbox="" srcdoc="/, "the preview is sandboxed");
assert.doesNotMatch(detail.html, /<story>/, "story text is escaped on the page");
assert.match(detail.html, /Approve this exact content/);
assert.match(detail.html, /Dispatch is disabled \(TRACE_NEWSLETTER_DISPATCH_ENABLED\)/);
assert.equal((await render("issues/_id_.astro.mjs", `/admin/newsletter/issues/${issueId}`, "reader", { id: issueId })).status, 403);
assert.equal((await render("issues/_id_.astro.mjs", "/admin/newsletter/issues/missing", "publisher", { id: "missing" })).status, 404);

db.close();
console.log("newsletter issue render tests passed");
