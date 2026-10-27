import assert from "node:assert/strict";
import {
  MockEmailTransport, ResendEmailTransport, confirmationEmail, emailFrom, escapeHtml, processEmailOutbox, transportFromEnv,
} from "../src/lib/server/email-outbox";
import {
  CONFIRMATION_RESEND_MINUTES, MAX_CONFIRMATION_REQUESTS, SIGNUP_ATTEMPTS_PER_DAY, auditNewsletterAction, confirmNewsletterSubscription,
  emailHash, newsletterCounts, newsletterSignupEnabled, normaliseEmail, requestNewsletterSignup, unsubscribeNewsletter,
} from "../src/lib/server/newsletter";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task D: TRACE Weekly signup, confirmation, unsubscribe and
// the email outbox. Synthetic addresses and the mock transport only: no
// network, no provider, no real email.

const SECRET = "n".repeat(40);
const VISITOR = "v".repeat(40);
const SITE = "https://thetracemanifest.com";
const FROM = "TRACE Weekly <weekly@thetracemanifest.com>";
const env = (db: SQLiteD1, overrides: Record<string, string | undefined> = {}) => ({
  DB: db.asD1(), TRACE_ENVIRONMENT: "test", TRACE_NEWSLETTER_SIGNUP_ENABLED: "true", TRACE_NEWSLETTER_SECRET: SECRET, TRACE_VISITOR_HASH_SECRET: VISITOR, ...overrides,
});
const rows = (db: SQLiteD1, sql: string, ...params: Array<string | number>) => db.sqlite.prepare(sql).all(...params) as Array<Record<string, unknown>>;
const one = (db: SQLiteD1, sql: string, ...params: Array<string | number>) => ({ ...(db.sqlite.prepare(sql).get(...params) as Record<string, unknown>) });
const t0 = new Date("2026-10-26T09:00:00Z");
const later = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const run = (db: SQLiteD1, transport: MockEmailTransport, now = t0, extra: Partial<Parameters<typeof processEmailOutbox>[0]> = {}) =>
  processEmailOutbox({ db: db.asD1(), transport, secret: SECRET, from: FROM, siteUrl: SITE, now, ...extra });
const tokenFrom = (text: string, path: string) => decodeURIComponent(new RegExp(`${path}\\?token=([^\\s"&<]+)`).exec(text)![1]);

// Gates and validation.
{
  const db = new SQLiteD1();
  assert.equal(newsletterSignupEnabled(env(db)), true);
  assert.equal(newsletterSignupEnabled(env(db, { TRACE_NEWSLETTER_SIGNUP_ENABLED: undefined })), false, "disabled by default");
  assert.equal(newsletterSignupEnabled(env(db, { TRACE_NEWSLETTER_SECRET: "short" })), false, "fails closed without a strong secret");
  assert.equal(newsletterSignupEnabled(env(db, { TRACE_VISITOR_HASH_SECRET: undefined })), false, "fails closed without abuse controls");
  assert.deepEqual(await requestNewsletterSignup(env(db, { TRACE_NEWSLETTER_SIGNUP_ENABLED: "false" }), { email: "a@example.test", networkIdentity: "198.51.100.1" }, t0), { status: "disabled" });
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM newsletter_subscribers").n), 0, "a closed signup writes nothing");
  assert.equal(normaliseEmail("  Reader@Example.TEST "), "reader@example.test");
  for (const bad of ["", "no-at", "a@b", "a@@example.test", "a b@example.test", "a..b@example.test", `${"x".repeat(65)}@example.test`, 42, null]) {
    assert.equal(normaliseEmail(bad), null, `rejects ${String(bad)}`);
  }
  assert.equal(transportFromEnv({}), null, "no transport without explicit enablement");
  assert.equal(transportFromEnv({ TRACE_EMAIL_DELIVERY_ENABLED: "true", TRACE_EMAIL_PROVIDER: "resend", TRACE_EMAIL_API_KEY: "re_" + "k".repeat(30), TRACE_NEWSLETTER_SECRET: SECRET }), null, "no transport without a sender");
  assert.equal(emailFrom({ TRACE_EMAIL_FROM: "bad\r\nBcc: x@y.z" }), null, "header injection in the sender is refused");
  db.close();
}

// Signup → confirmation email → confirm → unsubscribe, with a mock transport.
{
  const db = new SQLiteD1();
  const transport = new MockEmailTransport();
  const signup = await requestNewsletterSignup(env(db), { email: "Reader@Example.test", networkIdentity: "198.51.100.10" }, t0);
  assert.equal(signup.status, "accepted");
  const subscriber = one(db, "SELECT * FROM newsletter_subscribers");
  assert.equal(subscriber.status, "pending");
  assert.equal(subscriber.email, "reader@example.test");
  assert.equal(subscriber.email_hash, await emailHash(SECRET, "reader@example.test"), "lookups use the keyed hash");
  assert.equal(subscriber.consent_version, "trace-weekly-consent-2026-10-v1");
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'newsletter_confirmation' AND status = 'queued'").n), 1);
  assert.equal(JSON.stringify(rows(db, "SELECT * FROM email_outbox")).includes("reader@example.test"), false, "the outbox stores no address");

  const sent = await run(db, transport);
  assert.deepEqual(sent, { claimed: 1, sent: 1, retried: 0, failed: 0, cancelled: 0 });
  const [message] = transport.sent;
  assert.equal(message.to, "reader@example.test");
  assert.equal(message.subject, "Confirm your TRACE Weekly subscription");
  assert.equal(message.idempotencyKey, `newsletter-confirmation:${subscriber.id}:1`);
  const confirmToken = tokenFrom(message.text, "/newsletter/confirm");
  assert.equal(JSON.stringify(rows(db, "SELECT * FROM newsletter_subscribers")).includes(confirmToken), false, "only the token hash is stored");
  assert.deepEqual(await run(db, transport), { claimed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0 }, "a sent row is never sent again");

  assert.equal(await confirmNewsletterSubscription(env(db), confirmToken, later(5)), "confirmed");
  assert.equal(await confirmNewsletterSubscription(env(db), confirmToken, later(6)), "invalid", "confirmation tokens are single-use");
  const confirmed = one(db, "SELECT status, confirm_token_hash, unsubscribe_token_hash FROM newsletter_subscribers");
  assert.deepEqual([confirmed.status, confirmed.confirm_token_hash], ["confirmed", null]);
  assert.ok(confirmed.unsubscribe_token_hash);

  // A confirmed address signing up again: same answer, no email.
  const again = await requestNewsletterSignup(env(db), { email: "reader@example.test", networkIdentity: "198.51.100.11" }, later(30));
  assert.deepEqual(again, { status: "accepted" }, "the response does not reveal an existing subscription");
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM email_outbox").n), 1);

  // Issue delivery carries List-Unsubscribe; following it unsubscribes and removes the address.
  db.sqlite.prepare("INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id, issue_id, next_attempt_at) VALUES ('issue-1', 'issue:1', 'newsletter_issue', ?, 'issue-a', '2026-10-26 09:00:00')").run(subscriber.id as string);
  const issueRun = await run(db, transport, later(40), {
    renderIssue: async (_issueId, unsubscribeUrl) => ({ subject: "TRACE Weekly", text: `Body\nUnsubscribe: ${unsubscribeUrl}`, html: `<p>Body</p><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>` }),
  });
  assert.equal(issueRun.sent, 1);
  const issue = transport.sent.at(-1)!;
  const unsubscribeToken = tokenFrom(issue.text, "/newsletter/unsubscribe");
  assert.match(issue.headers["List-Unsubscribe"], /^<https:\/\/thetracemanifest\.com\/newsletter\/unsubscribe\?token=/);
  db.sqlite.prepare("INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id, issue_id, next_attempt_at) VALUES ('issue-2', 'issue:2', 'newsletter_issue', ?, 'issue-b', '2026-10-26 09:00:00')").run(subscriber.id as string);
  assert.equal(await unsubscribeNewsletter(env(db, { TRACE_NEWSLETTER_SIGNUP_ENABLED: "false" }), unsubscribeToken, later(50)), "unsubscribed", "unsubscribe works even when signup is closed");
  const gone = one(db, "SELECT status, email, unsubscribe_token_hash FROM newsletter_subscribers");
  assert.deepEqual([gone.status, gone.email, gone.unsubscribe_token_hash], ["unsubscribed", null, null], "the address is removed");
  assert.equal(one(db, "SELECT status FROM email_outbox WHERE id = 'issue-2'").status, "cancelled", "queued issues are cancelled");
  assert.equal(await unsubscribeNewsletter(env(db), unsubscribeToken, later(51)), "invalid", "a used unsubscribe link is inert");

  // Re-subscribing needs fresh consent and confirmation.
  await requestNewsletterSignup(env(db), { email: "reader@example.test", networkIdentity: "198.51.100.12" }, later(60));
  const back = one(db, "SELECT status, email FROM newsletter_subscribers");
  assert.deepEqual([back.status, back.email], ["pending", "reader@example.test"]);
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM email_outbox WHERE kind = 'newsletter_confirmation' AND status = 'queued'").n), 1);
  db.close();
}

// Resend limits, expired tokens, suppression and honeypot.
{
  const db = new SQLiteD1();
  const transport = new MockEmailTransport();
  await requestNewsletterSignup(env(db), { email: "pending@example.test", networkIdentity: "203.0.113.1" }, t0);
  await requestNewsletterSignup(env(db), { email: "pending@example.test", networkIdentity: "203.0.113.2" }, later(1));
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM email_outbox").n), 1, `no resend within ${CONFIRMATION_RESEND_MINUTES} minutes`);
  for (let step = 1; step <= 5; step++) {
    await requestNewsletterSignup(env(db), { email: "pending@example.test", networkIdentity: `203.0.113.${10 + step}` }, later(step * 20));
  }
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM email_outbox").n), MAX_CONFIRMATION_REQUESTS, "confirmation emails per address are capped");

  await run(db, transport, later(200));
  assert.equal(transport.sent.length, MAX_CONFIRMATION_REQUESTS);
  // Each confirmation email carries a fresh token; the newest link replaces earlier ones.
  assert.equal(await confirmNewsletterSubscription(env(db), tokenFrom(transport.sent[0].text, "/newsletter/confirm"), later(201)), "invalid");
  const token = tokenFrom(transport.sent.at(-1)!.text, "/newsletter/confirm");
  assert.equal(await confirmNewsletterSubscription(env(db), token, later(200 + 49 * 60)), "expired");

  db.sqlite.exec("UPDATE newsletter_subscribers SET status = 'suppressed', email = NULL, suppression_reason = 'bounce', suppressed_at = datetime('now')");
  const suppressedSignup = await requestNewsletterSignup(env(db), { email: "pending@example.test", networkIdentity: "203.0.113.99" }, later(400));
  assert.deepEqual(suppressedSignup, { status: "accepted" }, "a suppressed address gets the same answer");
  assert.equal(one(db, "SELECT status FROM newsletter_subscribers").status, "suppressed", "suppression is never lifted by a signup");

  const before = Number(one(db, "SELECT COUNT(*) AS n FROM newsletter_subscribers").n);
  assert.deepEqual(await requestNewsletterSignup(env(db), { email: "bot@example.test", networkIdentity: "203.0.113.50", honeypot: "http://spam" }, t0), { status: "accepted" });
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM newsletter_subscribers").n), before, "honeypot submissions write nothing");
  db.close();
}

// Rate limit per network per day, before any subscriber read.
{
  const db = new SQLiteD1();
  for (let attempt = 1; attempt <= SIGNUP_ATTEMPTS_PER_DAY; attempt++) {
    assert.equal((await requestNewsletterSignup(env(db), { email: `r${attempt}@example.test`, networkIdentity: "192.0.2.7" }, t0)).status, "accepted");
  }
  const logBefore = db.statementLog.length;
  assert.deepEqual(await requestNewsletterSignup(env(db), { email: "r9@example.test", networkIdentity: "192.0.2.7" }, t0), { status: "rate_limited" });
  assert.equal(db.statementLog.length - logBefore, 1, "a rate-limited request costs one statement");
  assert.equal((await requestNewsletterSignup(env(db), { email: "r9@example.test", networkIdentity: "192.0.2.7" }, new Date("2026-10-27T00:00:01Z"))).status, "accepted", "the limit resets daily");
  assert.equal(JSON.stringify(rows(db, "SELECT * FROM newsletter_signup_attempts")).includes("192.0.2.7"), false, "network identities are stored hashed");
  db.close();
}

// Outbox: retries are bounded, claims are exclusive, suppression is enforced at send time.
{
  const db = new SQLiteD1();
  await requestNewsletterSignup(env(db), { email: "retry@example.test", networkIdentity: "198.51.100.40" }, t0);
  const transport = new MockEmailTransport();
  transport.queuedResults.push({ ok: false, retryable: true, code: "http_503" }, { ok: false, retryable: true, code: "http_503" }, { ok: false, retryable: true, code: "http_503" });
  assert.equal((await run(db, transport, t0)).retried, 1);
  assert.equal((await run(db, transport, later(5))).claimed, 0, "a retry waits for its backoff");
  assert.equal((await run(db, transport, later(16))).retried, 1);
  assert.equal((await run(db, transport, later(16 + 121))).failed, 1, "the third failure is final");
  assert.deepEqual(one(db, "SELECT status, attempts, last_error_code FROM email_outbox"), { status: "failed", attempts: 3, last_error_code: "http_503" });
  assert.equal((await run(db, transport, later(1000))).claimed, 0, "failed rows are never retried automatically");
  assert.equal(transport.sent.length, 0);

  // Two processors racing for one row: exactly one sends.
  await requestNewsletterSignup(env(db), { email: "race@example.test", networkIdentity: "198.51.100.41" }, later(2000));
  const first = new MockEmailTransport();
  const second = new MockEmailTransport();
  await Promise.all([run(db, first, later(2001)), run(db, second, later(2001))]);
  assert.equal(first.sent.length + second.sent.length, 1);

  // A row for a subscriber who unsubscribed (or was suppressed) before sending is cancelled.
  await requestNewsletterSignup(env(db), { email: "late@example.test", networkIdentity: "198.51.100.42" }, later(3000));
  db.sqlite.exec("UPDATE newsletter_subscribers SET status = 'suppressed', email = NULL, suppression_reason = 'complaint' WHERE email_hash IS NOT NULL AND id IN (SELECT subscriber_id FROM email_outbox WHERE status = 'queued')");
  const blocked = new MockEmailTransport();
  assert.equal((await run(db, blocked, later(3001))).cancelled, 1);
  assert.equal(blocked.sent.length, 0);
  db.close();
}

// The Resend adapter's request shape, with an injected fetch (no network).
{
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "msg_123" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const resend = new ResendEmailTransport("re_test_" + "k".repeat(24), fakeFetch);
  const result = await resend.send({ to: "x@example.test", from: FROM, subject: "S", text: "T", html: "<p>H</p>", headers: {}, idempotencyKey: "k-1" });
  assert.deepEqual(result, { ok: true, messageId: "msg_123" });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], "k-1");
  assert.match(headers.Authorization, /^Bearer re_test_/);
  const failing = new ResendEmailTransport("re_test_" + "k".repeat(24), (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch);
  assert.deepEqual(await failing.send({ to: "x@example.test", from: FROM, subject: "S", text: "T", html: "H", headers: {}, idempotencyKey: "k-2" }), { ok: false, retryable: false, code: "http_422" });
  const configured = transportFromEnv({ TRACE_EMAIL_DELIVERY_ENABLED: "true", TRACE_EMAIL_PROVIDER: "resend", TRACE_EMAIL_API_KEY: "re_" + "k".repeat(30), TRACE_EMAIL_FROM: FROM, TRACE_NEWSLETTER_SECRET: SECRET }, fakeFetch);
  assert.equal(configured?.name, "resend");
}

// Templates escape untrusted text; logs never contain addresses; admin actions are publisher-only.
{
  const email = confirmationEmail(SITE, "tok\"<en>");
  assert.doesNotMatch(email.html, /tok"<en>/);
  assert.equal(escapeHtml(`<script>"x"&'y'</script>`), "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
  const db = new SQLiteD1();
  const logs: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    await requestNewsletterSignup(env(db), { email: "private@example.test", networkIdentity: "198.51.100.77" }, t0);
    const failing = new MockEmailTransport();
    failing.queuedResults.push({ ok: false, retryable: false, code: "http_400" });
    await run(db, failing, t0);
  } finally {
    Object.assign(console, original);
  }
  assert.ok(logs.length > 0);
  assert.equal(logs.join("\n").includes("private@example.test"), false, "logs carry outbox ids and codes only");
  await assert.rejects(auditNewsletterAction(db.asD1(), { email: "reader@example.test", role: "reader" }, "process_email_outbox", "succeeded", "x"));
  await auditNewsletterAction(db.asD1(), { email: "publisher@example.test", role: "publisher" }, "process_email_outbox", "succeeded", "claimed:0");
  assert.equal(Number(one(db, "SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'process_email_outbox'").n), 1);
  const counts = await newsletterCounts(db.asD1());
  assert.equal(counts.subscribers.pending, 1);
  assert.equal(JSON.stringify(counts).includes("@"), false, "admin counts contain no addresses");
  db.close();
}

// Hardening (TRACE-RESTORE-02): tampered tokens, bounded cost per request, exact provider request.
{
  const db = new SQLiteD1();
  const transport = new MockEmailTransport();
  await requestNewsletterSignup(env(db), { email: "tamper@example.test", networkIdentity: "198.51.100.150" }, t0);
  await run(db, transport, t0);
  const token = tokenFrom(transport.sent[0].text, "/newsletter/confirm");
  const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  assert.equal(await confirmNewsletterSubscription(env(db), flipped, later(1)), "invalid", "a modified token fails");
  assert.equal(await confirmNewsletterSubscription(env(db), `${token}x`, later(1)), "invalid", "an extended token fails");
  assert.equal(await confirmNewsletterSubscription(env(db), token.slice(0, 20), later(1)), "invalid", "a truncated token fails");
  assert.equal(one(db, "SELECT status FROM newsletter_subscribers").status, "pending", "failed attempts change nothing");
  assert.equal(await unsubscribeNewsletter(env(db), flipped, later(1)), "invalid");

  // D1 cost per public request is bounded: disabled, invalid and honeypot requests cost nothing;
  // a valid one at most rate-limit upsert + lookup + one batch of two writes.
  const cost = async (input: Parameters<typeof requestNewsletterSignup>[1], overrides: Record<string, string | undefined> = {}) => {
    const before = db.statementLog.length;
    await requestNewsletterSignup(env(db, overrides), input, later(500));
    return db.statementLog.length - before;
  };
  assert.equal(await cost({ email: "x@example.test", networkIdentity: "198.51.100.151" }, { TRACE_NEWSLETTER_SIGNUP_ENABLED: "false" }), 0);
  assert.equal(await cost({ email: "not-an-address", networkIdentity: "198.51.100.152" }), 0);
  assert.equal(await cost({ email: "bot@example.test", networkIdentity: "198.51.100.153", honeypot: "spam" }), 0);
  assert.ok(await cost({ email: "fresh@example.test", networkIdentity: "198.51.100.154" }) <= 4, "a new signup costs at most 4 statements");
  assert.ok(await cost({ email: "fresh@example.test", networkIdentity: "198.51.100.155" }) <= 4, "a repeat signup costs at most 4 statements");
  db.close();
}
{
  // The Resend request carries exactly the message fields; the key is only in the header.
  let body: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    headers = init.headers as Record<string, string>;
    return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
  }) as unknown as typeof fetch;
  const apiKey = "re_test_" + "z".repeat(24);
  await new ResendEmailTransport(apiKey, fakeFetch).send({ to: "x@example.test", from: FROM, subject: "S", text: "T", html: "<p>H</p>", headers: { "List-Unsubscribe": "<https://thetracemanifest.com/u>" }, idempotencyKey: "idem-1" });
  assert.deepEqual(Object.keys(body).sort(), ["from", "headers", "html", "subject", "text", "to"]);
  assert.deepEqual(body.to, ["x@example.test"]);
  assert.deepEqual(body.headers, { "List-Unsubscribe": "<https://thetracemanifest.com/u>" });
  assert.equal(JSON.stringify(body).includes(apiKey), false, "the API key never appears in the body");
  assert.deepEqual(Object.keys(headers).sort(), ["Authorization", "Content-Type", "Idempotency-Key"]);
  assert.equal(headers["Content-Type"], "application/json");
}

console.log("newsletter tests passed");
