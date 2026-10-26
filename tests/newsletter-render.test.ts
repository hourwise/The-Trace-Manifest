import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task D, rendered: the BUILT newsletter, homepage and admin
// pages through Astro's container API against local SQLite D1. Run after
// npm run build (npm run ci does). No email is sent: delivery is not enabled.

const page = (path: string) => {
  const file = `dist/_worker.js/pages/${path}`;
  if (!existsSync(file)) throw new Error(`${file} not found: run npm run build first.`);
  return file;
};
const db = new SQLiteD1();
const container = await AstroContainer.create();
const closedEnv = { DB: db.asD1(), TRACE_ENVIRONMENT: "test" };
const openEnv = { ...closedEnv, TRACE_NEWSLETTER_SIGNUP_ENABLED: "true", TRACE_NEWSLETTER_SECRET: "n".repeat(40), TRACE_VISITOR_HASH_SECRET: "v".repeat(40) };
const waited: Promise<unknown>[] = [];
async function render(path: string, url: string, env: Record<string, unknown>, init: RequestInit = {}, role?: "publisher" | "reader") {
  const module = await (await import(pathToFileURL(page(path)).href)).page();
  const response = await container.renderToResponse(module.default, {
    locals: {
      runtime: { env, ctx: { waitUntil: (promise: Promise<unknown>) => waited.push(promise) } },
      ...(role ? { operator: { email: `${role}@example.test`, role, subject: role, expiresAt: Math.floor(Date.now() / 1000) + 600 } } : {}),
    } as unknown as App.Locals,
    request: new Request(`https://thetracemanifest.com${url}`, init),
  });
  // Scoped-style attributes are build noise for these assertions.
  return { status: response.status, html: (await response.text()).replace(/ data-astro-cid-[a-z0-9]+/g, "") };
}
const subscriberCount = () => Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM newsletter_subscribers").get() as { n: number }).n);

// Closed (the default): honest labels everywhere, no form, POST refused.
{
  const signup = await render("newsletter.astro.mjs", "/newsletter", closedEnv);
  assert.equal(signup.status, 200);
  assert.match(signup.html, /data-newsletter-state="closed"/);
  assert.doesNotMatch(signup.html, /<form/, "no form while signup is closed");
  assert.match(signup.html, /<a [^>]*href="\/briefing\/daily"[^>]*data-subscribe-action[^>]*>Daily Briefing<\/a>/, "the header does not advertise a subscription");
  assert.doesNotMatch(signup.html, /data-subscribe-action[^>]*>Subscribe</);
  const home = await render("index.astro.mjs", "/", closedEnv);
  assert.match(home.html, /data-newsletter-panel="rss-only"/);
  assert.doesNotMatch(home.html, /by email or follow via RSS/, "the homepage no longer claims email delivery");
  const post = await render("newsletter.astro.mjs", "/newsletter", closedEnv, { method: "POST", body: new URLSearchParams({ email: "x@example.test" }) });
  assert.equal(post.status, 503);
  assert.equal(subscriberCount(), 0);
}

// Open: an accessible form with consent text, a hidden honeypot, and a generic answer.
{
  const signup = await render("newsletter.astro.mjs", "/newsletter", openEnv);
  assert.match(signup.html, /<label for="newsletter-email">Email address<\/label>/);
  assert.match(signup.html, /<input id="newsletter-email" name="email" type="email" required[^>]*aria-describedby="newsletter-consent"/);
  assert.match(signup.html, /id="newsletter-consent"[^>]*>TRACE Weekly is a free weekly email/);
  assert.match(signup.html, /data-consent-version="trace-weekly-consent-2026-10-v1"/);
  assert.match(signup.html, /class="newsletter-honeypot" aria-hidden="true"/);
  assert.match(signup.html, /data-subscribe-action[^>]*>Subscribe<\/a>/, "the header links to the working signup");
  assert.match(signup.html, /href="\/newsletter"[^>]*data-subscribe-action/);
  const home = await render("index.astro.mjs", "/", openEnv);
  assert.match(home.html, /data-newsletter-panel="open"/);

  const post = await render("newsletter.astro.mjs", "/newsletter", openEnv, {
    method: "POST", body: new URLSearchParams({ email: "render@example.test", website: "" }), headers: { "CF-Connecting-IP": "198.51.100.200" },
  });
  assert.equal(post.status, 200);
  assert.match(post.html, /role="status" data-newsletter-state="accepted"/);
  assert.doesNotMatch(post.html, /render@example\.test/, "the response never echoes the address");
  assert.equal(subscriberCount(), 1);
  await Promise.all(waited);
  assert.equal(waited.length, 0, "no send is scheduled while delivery is off");
  assert.equal(Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE status = 'queued'").get() as { n: number }).n), 1, "the confirmation waits in the outbox");
  const repeat = await render("newsletter.astro.mjs", "/newsletter", openEnv, {
    method: "POST", body: new URLSearchParams({ email: "render@example.test" }), headers: { "CF-Connecting-IP": "198.51.100.201" },
  });
  assert.match(repeat.html, /data-newsletter-state="accepted"/, "a repeat signup gets the same answer");
}

// Confirm and unsubscribe pages: GET never changes state; malformed tokens are rejected.
{
  const before = JSON.stringify(db.sqlite.prepare("SELECT status, confirm_token_hash FROM newsletter_subscribers").all());
  const token = "t".repeat(43);
  const confirm = await render("newsletter/confirm.astro.mjs", `/newsletter/confirm?token=${token}`, openEnv);
  assert.match(confirm.html, /<form method="POST"[^>]*data-newsletter-state="ready"/);
  assert.match(confirm.html, /Confirm subscription<\/button>/);
  const unsubscribe = await render("newsletter/unsubscribe.astro.mjs", `/newsletter/unsubscribe?token=${token}`, closedEnv);
  assert.match(unsubscribe.html, /Unsubscribe<\/button>/, "unsubscribe stays available when signup is closed");
  assert.equal(JSON.stringify(db.sqlite.prepare("SELECT status, confirm_token_hash FROM newsletter_subscribers").all()), before, "GET is side-effect free");
  assert.match((await render("newsletter/confirm.astro.mjs", "/newsletter/confirm?token=<x>", openEnv)).html, /data-newsletter-state="invalid"/);
  const bogus = await render("newsletter/confirm.astro.mjs", "/newsletter/confirm", openEnv, { method: "POST", body: new URLSearchParams({ token }) });
  assert.match(bogus.html, /data-newsletter-state="invalid"/);
}

// Admin page: publisher-only, counts only.
{
  const publisher = await render("admin/newsletter.astro.mjs", "/admin/newsletter", openEnv, {}, "publisher");
  assert.equal(publisher.status, 200);
  assert.match(publisher.html, /pending: 1/);
  assert.match(publisher.html, /Delivery: off/);
  assert.match(publisher.html, /<button type="submit" class="btn btn-primary" disabled>Process outbox<\/button>/);
  assert.doesNotMatch(publisher.html, /render@example\.test/, "no addresses on the admin page");
  assert.equal((await render("admin/newsletter.astro.mjs", "/admin/newsletter", openEnv, {}, "reader")).status, 403);
  const process = await render("admin/newsletter.astro.mjs", "/admin/newsletter", openEnv, { method: "POST", body: new URLSearchParams({ _action: "process" }) }, "publisher");
  assert.match(process.html, /Email delivery is not configured, so nothing was sent\./);
}

db.close();
console.log("newsletter render tests passed");
