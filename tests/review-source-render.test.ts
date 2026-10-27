import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { sourceUrlHash } from "../src/lib/server/source-identity";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task C, rendered: the BUILT review queue and Desk pages,
// through Astro's container API against local SQLite D1, for publisher and
// reader, with no writes on GET. Run after npm run build (npm run ci does).

async function seed(): Promise<SQLiteD1> {
  const db = new SQLiteD1();
  const hashOf = async (url: string) => sourceUrlHash(url);
  db.sqlite.prepare(`INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (701, 'Review Lab', 'https://review-lab.example', 'A', 'A', 'primary-technical', 'rss')`).run();
  const items: Array<[number, string]> = [
    [701, "https://review-lab.example/shared"],
    [702, "https://review-lab.example/published-shared"],
    [703, "https://review-lab.example/withdrawn-shared"],
    [704, "https://review-lab.example/solo"],
    [705, "https://review-lab.example/ambiguous"],
    [706, "https://review-lab.example/retired-only"],
  ];
  for (const [id, url] of items) {
    db.sqlite.prepare("INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (?, 701, ?, ?, ?, 'clustered')").run(id, url, await hashOf(url), `Item ${id}`);
  }
  db.sqlite.exec(`
    INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, needs_human_review, published_at, reviewed_by, reviewed_at) VALUES
      (711, NULL, 'Pending A shares with pending B', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL),
      (712, NULL, 'Pending B', 'models', 'S', 'vendor_reported', 'draft', 1, NULL, NULL, NULL),
      (713, 'published-overlap', 'Published overlap', 'models', 'S', 'vendor_reported', 'published', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
      (714, NULL, 'Pending C shares with published', 'models', 'S', 'unverified', 'review', 1, NULL, NULL, NULL),
      (715, 'withdrawn-history', 'Withdrawn history', 'models', 'S', 'vendor_reported', 'withdrawn', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
      (716, NULL, 'Pending D shares with withdrawn', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL),
      (717, NULL, 'Pending E solo', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL),
      (718, NULL, 'Ambiguous one', 'models', 'S', 'vendor_reported', 'draft', 0, NULL, NULL, NULL),
      (719, NULL, 'Ambiguous two', 'models', 'S', 'vendor_reported', 'draft', 0, NULL, NULL, NULL),
      (720, 'retired-only', 'Retired only', 'models', 'S', 'vendor_reported', 'withdrawn', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
      (721, NULL, 'Pending F shares with two drafts', 'models', 'S', 'vendor_reported', 'review', 1, NULL, NULL, NULL);
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (711, 701, 1), (712, 701, 1),
      (713, 702, 1), (714, 702, 1),
      (715, 703, 1), (716, 703, 1),
      (717, 704, 1),
      (718, 705, 1), (719, 705, 1), (721, 705, 1),
      (720, 706, 1);
  `);
  return db;
}

// Rendered pages (built output), publisher and reader, with no writes on GET.
const REVIEW = "dist/_worker.js/pages/admin/review.astro.mjs";
const DESK = "dist/_worker.js/pages/admin/desk.astro.mjs";
if (!existsSync(REVIEW) || !existsSync(DESK)) throw new Error("Run npm run build before this test (npm run ci does).");
{
  const db = await seed();
  // Desk candidates.
  for (const [id, url, state] of [
    ["c-exact", "https://review-lab.example/solo", "needs_review"],
    ["c-ambiguous", "https://review-lab.example/ambiguous", "needs_review"],
    ["c-done", "https://review-lab.example/solo", "published"],
    ["c-retired", "https://review-lab.example/retired-only", "needs_review"],
  ] as const) {
    db.sqlite.prepare("INSERT INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, created_by) VALUES (?, 'manual_url', ?, 'Lead text for the candidate', ?, ?, 'publisher@example.test')")
      .run(id, url, `${id}-hash`, state);
  }
  const container = await AstroContainer.create();
  const writeCounts = () => ["story_clusters", "story_cluster_members", "editorial_candidates", "admin_audit_log", "feed_items"]
    .map((table) => Number((db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n));
  const before = writeCounts();
  const render = async (path: string, role: "publisher" | "reader") => {
    const page = await (await import(pathToFileURL(path).href)).page();
    const response = await container.renderToResponse(page.default, {
      locals: {
        operator: { email: `${role}@example.test`, role, subject: role, expiresAt: Math.floor(Date.now() / 1000) + 600 },
        runtime: { env: { DB: db.asD1(), TRACE_AI_EDITORIAL_ENABLED: "false" } },
      } as unknown as App.Locals,
      request: new Request(`https://thetracemanifest.com${path.includes("desk") ? "/admin/desk" : "/admin/review"}`),
    });
    // Scoped-style attributes are build noise for these assertions.
    return { status: response.status, html: response.status === 200 ? (await response.text()).replace(/ data-astro-cid-[a-z0-9]+/g, "") : "" };
  };

  for (const role of ["publisher", "reader"] as const) {
    const { status, html } = await render(REVIEW, role);
    assert.equal(status, 200, `${role} can open the review queue`);
    const card = (id: number) => html.slice(html.indexOf(`id="pending-${id}"`), html.indexOf("</article>", html.indexOf(`id="pending-${id}"`)));
    assert.match(card(711), /data-category="duplicate-source"[^>]*>\s*Duplicate source\s*</);
    assert.match(card(711), /Shares 1 source item with #712/);
    assert.match(card(711), /href="\/admin\/review\?review=712"/, "a pending duplicate links into the review workflow");
    assert.match(card(714), /data-category="published-overlap"[^>]*>\s*Source already published\s*</);
    assert.match(card(714), /data-category="blocked-evidence"/);
    assert.match(card(714), /href="\/stories\/published-overlap"/);
    assert.match(card(716), /data-category="retired-overlap"[^>]*>\s*Withdrawn or superseded history\s*</);
    assert.match(card(716), /\(withdrawn story\)/);
    assert.doesNotMatch(card(717), /pending-source-conflicts/, "no warning without a shared source");
    assert.match(card(711), /role="note" aria-label="Source conflicts for #711"/);
    assert.match(html, /data-queue-summary[^>]*>[^<]*Duplicate source: 3/, "the queue summary counts each category");
    // Ambiguous: one source item held by several current clusters.
    assert.match(card(721), /Shares a source item with 2 other clusters/);
    assert.match(card(721), /data-conflict-cluster="718"[\s\S]*data-conflict-cluster="719"/);
    assert.match(card(721), /Not in the pending queue\./, "clusters outside the queue are named without a dead link");
    // Keyboard: every new control is a native, focusable link or button.
    assert.match(card(711), /<a href="\/admin\/review\?review=712">Open #712 in review<\/a>/);
    assert.doesNotMatch(card(711) + card(721), /tabindex="-1"|onclick=/);
    assert.match(card(711), /<button type="button" class="btn btn-primary" data-review-open="711"/);
    if (role === "reader") assert.match(card(711), /Inspect evidence and history/, "readers keep the read-only action");
  }

  const desk = await render(DESK, "publisher");
  assert.equal(desk.status, 200);
  assert.match(desk.html, /data-source-relationship="exact"[^>]*>\s*Source already in story cluster #717/);
  assert.match(desk.html, /Link to existing story/);
  assert.match(desk.html, /data-source-relationship="ambiguous"/);
  assert.match(desk.html, /<button[^>]*disabled[^>]*aria-describedby="source-c-ambiguous"/, "an ambiguous source cannot be promoted from the Desk");
  assert.doesNotMatch(desk.html, /id="source-c-done"/, "closed candidates carry no notice");
  // Retired-only source: refused promotion is explained and the button is disabled.
  assert.match(desk.html, /id="source-c-retired" data-source-relationship="retired"[^>]*>\s*Source appears only in withdrawn or superseded stories \(#720 \(withdrawn\)\)/);
  assert.match(desk.html, /<button[^>]*disabled[^>]*aria-describedby="source-c-retired"/);
  assert.equal((await render(DESK, "reader")).status, 403, "readers still cannot open TRACE Desk");

  assert.deepEqual(writeCounts(), before, "rendering the review queue and Desk writes nothing");
  db.close();
}

// Mobile: the new elements wrap instead of overflowing.
{
  const review = readFileSync("src/pages/admin/review.astro", "utf8");
  assert.match(review, /\.pending-review-categories \{ display: flex; flex-wrap: wrap;/);
  assert.match(review, /\.pending-source-conflicts li \{ overflow-wrap: anywhere; \}/);
  assert.match(readFileSync("src/pages/admin/desk.astro", "utf8"), /\.desk-source-notice \{[^}]*overflow-wrap: anywhere;/);
}

console.log("review source render tests passed");
