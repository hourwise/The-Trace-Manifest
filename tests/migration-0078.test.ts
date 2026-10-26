import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Migration 0078 (TRACE Weekly subscriptions and outbox), checked locally after
// the preceding chain. Local verification only: it does not authorise applying
// 0078 to Preview or Production.

const MIGRATION = readFileSync("db/migration-0078-newsletter-subscriptions.sql", "utf8");
const PREFLIGHT = "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('newsletter_subscribers','newsletter_signup_attempts','email_outbox')";

function base(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync("db/schema.sql", "utf8"));
  db.exec(readFileSync("db/migration-5e-publication.sql", "utf8"));
  db.exec(readFileSync("db/migration-stabilisation-security.sql", "utf8"));
  return db;
}
const fails = (db: DatabaseSync, sql: string, pattern: RegExp, message?: string) => assert.throws(() => db.exec(sql), pattern, message);

// Applies cleanly, is a no-op on re-run, and rolls back fully inside a failed transaction.
{
  const db = base();
  assert.equal(db.prepare(PREFLIGHT).all().length, 0, "preflight: none of the tables exist yet");
  db.exec(MIGRATION);
  assert.equal(db.prepare(PREFLIGHT).all().length, 3);
  db.exec(MIGRATION);
  assert.equal(db.prepare(PREFLIGHT).all().length, 3, "IF NOT EXISTS makes a re-run harmless");
  const rolled = base();
  rolled.exec("BEGIN");
  rolled.exec(MIGRATION);
  rolled.exec("ROLLBACK");
  assert.equal(rolled.prepare(PREFLIGHT).all().length, 0, "a failed transaction leaves nothing behind");
}

// Constraints encode the privacy and delivery rules.
{
  const db = base();
  db.exec(MIGRATION);
  const subscriber = (id: string, status: string, email: string | null, extra = "") =>
    `INSERT INTO newsletter_subscribers (id, email_hash, email, status, consent_version, consented_at${extra ? ", " + extra.split("=")[0] : ""}) VALUES ('${id}', 'hash-${id}', ${email === null ? "NULL" : `'${email}'`}, '${status}', 'v1', '2026-10-26 00:00:00'${extra ? ", " + extra.split("=")[1] : ""})`;
  db.exec(subscriber("p", "pending", "p@example.test"));
  db.exec(subscriber("c", "confirmed", "c@example.test"));
  db.exec(subscriber("u", "unsubscribed", null));
  db.exec(subscriber("s", "suppressed", null, "suppression_reason='bounce'"));
  fails(db, subscriber("x1", "unsubscribed", "kept@example.test"), /CHECK constraint failed/, "an unsubscribed row cannot keep its address");
  fails(db, subscriber("x2", "confirmed", null), /CHECK constraint failed/, "a confirmed row must have an address");
  fails(db, subscriber("x3", "subscribed", "x@example.test"), /CHECK constraint failed/, "unknown statuses are refused");
  fails(db, subscriber("x4", "suppressed", null, "suppression_reason='marketing'"), /CHECK constraint failed/);
  fails(db, "INSERT INTO newsletter_subscribers (id, email_hash, email, status, consent_version, consented_at) VALUES ('dup', 'hash-p', 'p2@example.test', 'pending', 'v1', '2026-10-26')", /UNIQUE constraint failed: newsletter_subscribers\.email_hash/, "one row per address");
  fails(db, "INSERT INTO newsletter_subscribers (id, email_hash, email, status, consent_version) VALUES ('nc', 'hash-nc', 'nc@example.test', 'pending', 'v1')", /NOT NULL constraint failed: newsletter_subscribers\.consented_at/, "consent time is required");
  db.exec("UPDATE newsletter_subscribers SET confirm_token_hash = 't1' WHERE id = 'p'");
  fails(db, "UPDATE newsletter_subscribers SET confirm_token_hash = 't1' WHERE id = 'c'", /UNIQUE constraint failed/, "token hashes are unique");

  db.exec("INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id) VALUES ('o1', 'k1', 'newsletter_confirmation', 'p')");
  fails(db, "INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id) VALUES ('o2', 'k1', 'newsletter_confirmation', 'p')", /UNIQUE constraint failed: email_outbox\.idempotency_key/, "outbox rows are idempotent");
  fails(db, "INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id) VALUES ('o3', 'k3', 'newsletter_issue', 'c')", /CHECK constraint failed/, "an issue row needs its issue id");
  fails(db, "INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id, max_attempts) VALUES ('o4', 'k4', 'newsletter_confirmation', 'p', 50)", /CHECK constraint failed/, "retries are bounded");
  fails(db, "INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id) VALUES ('o5', 'k5', 'newsletter_confirmation', 'nobody')", /FOREIGN KEY constraint failed/, "outbox rows belong to a subscriber");
  fails(db, "INSERT INTO email_outbox (id, idempotency_key, kind, subscriber_id, status) VALUES ('o6', 'k6', 'newsletter_confirmation', 'p', 'delivered')", /CHECK constraint failed/);

  const plan = (sql: string) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>).map((row) => row.detail).join(" | ");
  assert.match(plan("SELECT id FROM newsletter_subscribers WHERE email_hash = 'x'"), /sqlite_autoindex_newsletter_subscribers/, "signup lookups use the unique hash index");
  assert.match(plan("SELECT id FROM email_outbox WHERE status = 'queued' AND next_attempt_at <= '2026'"), /idx_email_outbox_due/, "the outbox scan is indexed");
  assert.match(plan("SELECT attempts FROM newsletter_signup_attempts WHERE day_key = 'd' AND visitor_hash = 'v'"), /sqlite_autoindex_newsletter_signup_attempts/);
}

console.log("migration 0078 tests passed");
