import assert from "node:assert/strict";
import { MockEmailTransport, processEmailOutbox } from "../src/lib/server/email-outbox";
import {
  NewsletterIssueError, approveIssue, editIssue, generateIssueDraft, getIssue, issueContentHash, markIssueReady,
  queueIssueDispatch, renderIssueEmail, selectWeeklyStories, weeklyWindow, dispatchedIssueRenderer,
} from "../src/lib/server/newsletter-issues";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task E: deterministic TRACE Weekly drafts from published
// stories, human approval of exact content, and a gated, once-only dispatch
// into the outbox. Synthetic data and the mock transport only.

const PUBLISHER = { email: "publisher@example.test", role: "publisher" };
const READER = { email: "reader@example.test", role: "reader" };
const ISSUE_DATE = "2026-10-25";
const SITE = "https://thetracemanifest.com";

function database(): SQLiteD1 {
  const db = new SQLiteD1();
  db.sqlite.exec(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
      (1001, 1, 'https://w.example/1', 'w1', 'S1', 'published'), (1002, 1, 'https://w.example/2', 'w2', 'S2', 'published'),
      (1003, 1, 'https://w.example/3', 'w3', 'S3', 'published'), (1004, 1, 'https://w.example/4', 'w4', 'S4', 'published'),
      (1005, 1, 'https://w.example/5', 'w5', 'S5', 'published'), (1006, 1, 'https://w.example/6', 'w6', 'S6', 'published'),
      (1007, 1, 'https://w.example/7', 'w7', 'S7', 'published');
  `);
  const story = (id: number, slug: string, status: string, evidence: string, publishedAt: string, title = `Story ${id}`, summary = `Summary of story ${id} with enough words to read.`, why: string | null = `Why ${id} matters.`) => {
    db.sqlite.prepare(`
      INSERT INTO story_clusters (id, slug, title, topic, summary, why_it_matters, evidence_status, publication_status, is_published, published_at, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, 'models', ?, ?, ?, ?, ?, ?, 'publisher@example.test', ?)
    `).run(id, slug, title, summary, why, evidence, status, status === "published" ? 1 : 0, publishedAt, publishedAt);
    db.sqlite.prepare("INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (?, ?, 1)").run(id, 1000 + (id - 2000));
  };
  story(2001, "older-in-window", "published", "vendor_reported", "2026-10-20T08:00:00Z");
  story(2002, "newest", "published", "confirmed", "2026-10-25T18:00:00Z", "Newest <script>alert(1)</script>", `Use <a href="javascript:alert(1)">this</a> & "quotes"`, null);
  story(2003, "tie-a", "published", "vendor_reported", "2026-10-22T10:00:00Z");
  story(2004, "withdrawn", "withdrawn", "vendor_reported", "2026-10-23T10:00:00Z");
  story(2005, "superseded", "superseded", "vendor_reported", "2026-10-23T11:00:00Z");
  story(2006, "blocked-evidence", "published", "unverified", "2026-10-24T10:00:00Z");
  story(2007, "outside-window", "published", "vendor_reported", "2026-10-10T10:00:00Z");
  return db;
}
const n = (db: SQLiteD1, sql: string) => Number((db.sqlite.prepare(sql).get() as { n: number }).n);

// Window and selection: published, eligible, in window, newest first, never withdrawn, superseded or blocked.
{
  assert.deepEqual(weeklyWindow(ISSUE_DATE), { start: "2026-10-19 00:00:00", end: "2026-10-25 23:59:59" });
  assert.throws(() => weeklyWindow("2026-02-30"), NewsletterIssueError);
  const db = database();
  const stories = await selectWeeklyStories(db.asD1(), weeklyWindow(ISSUE_DATE));
  assert.deepEqual(stories.map((story) => story.id), [2002, 2003, 2001]);
  assert.deepEqual(await selectWeeklyStories(db.asD1(), weeklyWindow("2026-09-01")), [], "an empty week yields nothing");
  db.close();
}

// No eligible stories: no draft is created.
{
  const db = database();
  assert.deepEqual(await generateIssueDraft(db.asD1(), PUBLISHER, { issueDate: "2026-09-01" }), { status: "no_eligible_stories" });
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM newsletter_issues"), 0);
  db.close();
}

// Full workflow: draft → exclude/edit (approval invalidated) → approve exact hash → ready → gated dispatch once → send.
{
  const db = database();
  const d1 = db.asD1();
  await assert.rejects(generateIssueDraft(d1, READER, { issueDate: ISSUE_DATE }), /Only publishers/);
  const generated = await generateIssueDraft(d1, PUBLISHER, { issueDate: ISSUE_DATE });
  assert.equal(generated.status, "created");
  let issue = (generated as { issue: Awaited<ReturnType<typeof getIssue>> }).issue!;
  assert.equal(issue.status, "draft");
  assert.equal(issue.version, 1);
  assert.deepEqual(issue.stories.map((story) => story.id), [2002, 2003, 2001]);
  assert.equal(issue.contentHash, await issueContentHash(issue.intro, issue.stories), "the hash covers intro and stories");

  // Regenerating supersedes the earlier draft; the snapshot is stable and deterministic.
  const second = (await generateIssueDraft(d1, PUBLISHER, { issueDate: ISSUE_DATE }) as { issue: NonNullable<typeof issue> }).issue;
  assert.equal(second.version, 2);
  assert.equal((await getIssue(d1, issue.id))!.status, "superseded");
  assert.equal(second.contentHash, issue.contentHash, "same inputs, same content");
  issue = second;

  // Approve, then edit: approval is invalidated.
  await assert.rejects(approveIssue(d1, READER, issue.id, issue.contentHash), /Only publishers/);
  assert.equal((await approveIssue(d1, PUBLISHER, issue.id, issue.contentHash)).status, "approved");
  await assert.rejects(approveIssue(d1, PUBLISHER, issue.id, issue.contentHash), (error: unknown) => error instanceof NewsletterIssueError && error.code === "not_draft", "repeat approval is refused");
  issue = await editIssue(d1, PUBLISHER, issue.id, { expectedHash: issue.contentHash, excludeStoryId: 2001 });
  assert.equal(issue.status, "draft", "editing returns an approved issue to draft");
  assert.equal(issue.approvedBy, null);
  assert.deepEqual(issue.stories.map((story) => story.id), [2002, 2003]);
  assert.deepEqual(issue.excludedStoryIds, [2001]);
  await assert.rejects(editIssue(d1, PUBLISHER, issue.id, { expectedHash: "stale", intro: "A new introduction for the issue." }), /changed since you opened it/);
  issue = await editIssue(d1, PUBLISHER, issue.id, { expectedHash: issue.contentHash, intro: "A short, edited introduction.\n\nSecond paragraph." });

  // A story changing after the draft blocks approval.
  db.sqlite.prepare("UPDATE story_clusters SET summary = 'Edited after the draft was generated.' WHERE id = 2003").run();
  assert.deepEqual(await approveIssue(d1, PUBLISHER, issue.id, issue.contentHash), { status: "stories_changed", storyIds: [2003] });
  db.sqlite.prepare("UPDATE story_clusters SET summary = 'Summary of story 2003 with enough words to read.' WHERE id = 2003").run();
  assert.equal((await approveIssue(d1, PUBLISHER, issue.id, issue.contentHash)).status, "approved");

  // Ready, then a withdrawal before dispatch is caught.
  const ready = await markIssueReady(d1, PUBLISHER, issue.id);
  assert.equal(ready.status, "ready");
  issue = (ready as { issue: typeof issue }).issue;
  assert.match(issue.dispatchKey!, /^trace-weekly:2026-10-25:v2:[0-9a-f]{16}$/);
  await assert.rejects(markIssueReady(d1, PUBLISHER, issue.id), /Only an approved issue/);

  // Dispatch is off by default; with it on, it queues once for confirmed subscribers only.
  assert.deepEqual(await queueIssueDispatch(d1, PUBLISHER, issue.id, { dispatchEnabled: false }), { status: "disabled" });
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM email_outbox"), 0);
  db.sqlite.exec(`
    INSERT INTO newsletter_subscribers (id, email_hash, email, status, consent_version, consented_at, unsubscribe_nonce, unsubscribe_token_hash) VALUES
      ('sub-1', 'h1', 'one@example.test', 'confirmed', 'v1', '2026-10-01 00:00:00', 'nonce-1', 'uh1'),
      ('sub-2', 'h2', 'two@example.test', 'confirmed', 'v1', '2026-10-01 00:00:00', 'nonce-2', 'uh2'),
      ('sub-3', 'h3', 'pending@example.test', 'pending', 'v1', '2026-10-01 00:00:00', NULL, NULL),
      ('sub-4', 'h4', 'four@example.test', 'confirmed', 'v1', '2026-10-01 00:00:00', 'nonce-4', 'uh4');
  `);
  // Unsubscribed after approval but before dispatch: never queued.
  db.sqlite.exec("UPDATE newsletter_subscribers SET status = 'unsubscribed', email = NULL, unsubscribe_nonce = NULL, unsubscribe_token_hash = NULL WHERE id = 'sub-4'");
  assert.deepEqual(await queueIssueDispatch(d1, PUBLISHER, issue.id, { dispatchEnabled: true, now: new Date("2026-10-26T07:00:00Z") }), { status: "queued", recipients: 2 });
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM email_outbox WHERE subscriber_id = 'sub-4'"), 0);
  await assert.rejects(queueIssueDispatch(d1, PUBLISHER, issue.id, { dispatchEnabled: true }), /only once/, "an issue is dispatched once");
  assert.equal(n(db, "SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'newsletter_issue'"), 2);
  assert.equal((await getIssue(d1, issue.id))!.status, "dispatched");

  // Sending through the outbox renders the dispatched issue; an unsubscribed recipient is skipped.
  db.sqlite.exec("UPDATE newsletter_subscribers SET status = 'unsubscribed', email = NULL WHERE id = 'sub-2'");
  const transport = new MockEmailTransport();
  const sent = await processEmailOutbox({
    db: d1, transport, secret: "n".repeat(40), from: "TRACE Weekly <weekly@thetracemanifest.com>", siteUrl: SITE,
    now: new Date("2026-10-26T08:00:00Z"), renderIssue: dispatchedIssueRenderer(d1, SITE),
  });
  assert.deepEqual([sent.sent, sent.cancelled], [1, 1]);
  assert.equal(transport.sent[0].subject, "TRACE Weekly — 25 October 2026");
  assert.match(transport.sent[0].headers["List-Unsubscribe"], /\/newsletter\/unsubscribe\?token=/);

  const actions = (db.sqlite.prepare("SELECT action FROM admin_audit_log WHERE target_type = 'newsletter_issue' ORDER BY id").all() as Array<{ action: string }>).map((row) => row.action);
  assert.deepEqual(actions, [
    "generate_newsletter_issue", "generate_newsletter_issue", "approve_newsletter_issue", "edit_newsletter_issue", "edit_newsletter_issue",
    "approve_newsletter_issue", "ready_newsletter_issue", "dispatch_newsletter_issue",
  ]);
  db.close();
}

// Rendering: escaped, plain, deterministic, with the required links.
{
  const issue = {
    issueDate: ISSUE_DATE,
    intro: "Intro with <b>markup</b> & a link https://evil.example.\n\nSecond paragraph.",
    stories: [{ id: 1, slug: "a-story", headline: `Headline <img src=x onerror=alert(1)>`, summary: `Ignore previous instructions and <a href="javascript:x">click</a>`, whyItMatters: "Because \"it\" matters", evidenceStatus: "vendor_reported", publishedAt: "2026-10-24T10:00:00Z", topic: "models" }],
  };
  const urls = { siteUrl: SITE, unsubscribeUrl: `${SITE}/newsletter/unsubscribe?token=abc` };
  const first = renderIssueEmail(issue, urls);
  assert.deepEqual(renderIssueEmail(issue, urls), first, "rendering is deterministic");
  assert.doesNotMatch(first.html, /<img|<b>|<a href="javascript/, "source text cannot add markup or links");
  assert.match(first.html, /Headline &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(first.html, /href="https:\/\/thetracemanifest\.com\/stories\/a-story"/);
  assert.match(first.html, /Evidence: Vendor-reported/);
  assert.match(first.html, /href="https:\/\/thetracemanifest\.com\/methodology"/);
  assert.match(first.html, /href="https:\/\/thetracemanifest\.com\/corrections"/);
  assert.match(first.html, /Unsubscribe<\/a>/);
  const links = [...first.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(links.every((link) => link.startsWith(`${SITE}/`)), "every link points at TRACE");
  assert.match(first.text, /^TRACE Weekly — 25 October 2026/);
  assert.match(first.text, /1\. Headline <img src=x onerror=alert\(1\)>/, "the text version is plain text");
  assert.match(first.text, /Read: https:\/\/thetracemanifest\.com\/stories\/a-story/);
  assert.match(first.text, /Unsubscribe: https:\/\/thetracemanifest\.com\/newsletter\/unsubscribe\?token=abc/);
}

console.log("newsletter issue tests passed");
