// TRACE Weekly email subscriptions (TRACE-RESTORE-01 Task D).
//
// Disabled unless TRACE_NEWSLETTER_SIGNUP_ENABLED is "true" AND the secrets
// below are configured; every entry point fails closed otherwise. Responses
// never reveal whether an address is subscribed. Addresses are never logged,
// returned or shown in admin pages.

export const NEWSLETTER_CONSENT_VERSION = "trace-weekly-consent-2026-10-v1";
export const NEWSLETTER_CONSENT_TEXT =
  "TRACE Weekly is a free weekly email summarising stories The Trace Manifest has already published, with links to the full stories, their sources and any corrections. "
  + "We use your email address only to send TRACE Weekly and the emails needed to confirm or end your subscription. "
  + "We do not sell it or use it for advertising. Every email has an unsubscribe link, and unsubscribing removes your address from our sending list.";

/** Signup attempts per network per UTC day (checked before any subscriber read). */
export const SIGNUP_ATTEMPTS_PER_DAY = 5;
/** Minimum gap between confirmation emails to one pending address. */
export const CONFIRMATION_RESEND_MINUTES = 10;
/** Confirmation emails per pending address, in total. */
export const MAX_CONFIRMATION_REQUESTS = 3;
export const CONFIRM_TOKEN_HOURS = 48;

export interface NewsletterEnvironment {
  DB: D1Database;
  TRACE_ENVIRONMENT?: string;
  TRACE_NEWSLETTER_SIGNUP_ENABLED?: string;
  TRACE_NEWSLETTER_SECRET?: string;
  TRACE_VISITOR_HASH_SECRET?: string;
}

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** 32 random bytes, base64url. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
export function isWellFormedToken(token: string | null | undefined): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** The secret, or null when the feature must stay closed. */
export function newsletterSecret(env: Pick<NewsletterEnvironment, "TRACE_NEWSLETTER_SECRET">): string | null {
  const secret = env.TRACE_NEWSLETTER_SECRET ?? "";
  return secret.length >= 32 ? secret : null;
}

export function newsletterSignupEnabled(env: NewsletterEnvironment): boolean {
  return env.TRACE_NEWSLETTER_SIGNUP_ENABLED === "true" && newsletterSecret(env) !== null && (env.TRACE_VISITOR_HASH_SECRET ?? "").length >= 32;
}

/**
 * Lower-cased, trimmed address, or null if it is not a plausible single
 * mailbox. Deliberately conservative: delivery, not syntax, proves an address.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return null;
  if (email.includes("..")) return null;
  return email;
}

export async function emailHash(secret: string, email: string): Promise<string> {
  return hmacHex(secret, `newsletter-email:${email}`);
}

/** The unsubscribe token for a subscriber's current nonce (never stored raw). */
export async function unsubscribeToken(secret: string, subscriberId: string, nonce: string): Promise<string> {
  const digest = await hmacHex(secret, `newsletter-unsubscribe:${subscriberId}:${nonce}`);
  return btoa(digest.match(/../g)!.map((pair) => String.fromCharCode(parseInt(pair, 16))).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function iso(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

async function visitorHash(env: NewsletterEnvironment, networkIdentity: string, dayKey: string): Promise<string | null> {
  const secret = env.TRACE_VISITOR_HASH_SECRET ?? "";
  if (secret.length < 32 || !networkIdentity) return null;
  return sha256Hex(`${secret}:newsletter:${dayKey}:${networkIdentity}`);
}

export type SignupOutcome =
  /** Always the public answer for a well-formed request, whatever the address's state. */
  | { status: "accepted"; /** Internal: the confirmation queued by this request, if any. Never shown to the requester. */ queuedKey?: string }
  | { status: "invalid_email" }
  | { status: "rate_limited" }
  | { status: "disabled" }
  | { status: "unavailable" };

interface SubscriberRow {
  id: string;
  status: "pending" | "confirmed" | "unsubscribed" | "suppressed";
  confirmation_requests: number;
  last_confirmation_requested_at: string | null;
}

const confirmationOutbox = (db: D1Database, subscriberId: string, sequence: number) => db.prepare(`
  INSERT OR IGNORE INTO email_outbox (id, idempotency_key, kind, subscriber_id)
  VALUES (?, ?, 'newsletter_confirmation', ?)
`).bind(crypto.randomUUID(), `newsletter-confirmation:${subscriberId}:${sequence}`, subscriberId);

/**
 * Records a signup request. The answer is "accepted" for every well-formed,
 * non-rate-limited request (new, pending, confirmed, unsubscribed or
 * suppressed), so it reveals nothing about any address. Only a new or
 * re-consenting address, or a pending one outside the resend limits, queues a
 * confirmation email.
 */
export async function requestNewsletterSignup(
  env: NewsletterEnvironment,
  input: { email: unknown; networkIdentity: string; honeypot?: string | null },
  now = new Date(),
): Promise<SignupOutcome> {
  if (!newsletterSignupEnabled(env)) return { status: "disabled" };
  const secret = newsletterSecret(env)!;
  if (input.honeypot) return { status: "accepted" };
  const email = normaliseEmail(input.email);
  if (!email) return { status: "invalid_email" };

  const dayKey = now.toISOString().slice(0, 10);
  const visitor = await visitorHash(env, input.networkIdentity, dayKey);
  if (!visitor) return { status: "unavailable" };
  const attempt = await env.DB.prepare(`
    INSERT INTO newsletter_signup_attempts (day_key, visitor_hash, attempts) VALUES (?, ?, 1)
    ON CONFLICT(day_key, visitor_hash) DO UPDATE SET attempts = attempts + 1
    RETURNING attempts
  `).bind(dayKey, visitor).first<{ attempts: number }>();
  if (Number(attempt?.attempts ?? 0) > SIGNUP_ATTEMPTS_PER_DAY) return { status: "rate_limited" };

  const hash = await emailHash(secret, email);
  const existing = await env.DB.prepare(`
    SELECT id, status, confirmation_requests, last_confirmation_requested_at
    FROM newsletter_subscribers WHERE email_hash = ?
  `).bind(hash).first<SubscriberRow>();
  const stamp = iso(now);

  if (!existing) {
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT OR IGNORE INTO newsletter_subscribers
          (id, email_hash, email, status, consent_version, consented_at, confirmation_requests, last_confirmation_requested_at)
        VALUES (?, ?, ?, 'pending', ?, ?, 1, ?)
      `).bind(id, hash, email, NEWSLETTER_CONSENT_VERSION, stamp, stamp),
      // Queued only if this request created the row (a concurrent duplicate did not).
      env.DB.prepare(`
        INSERT OR IGNORE INTO email_outbox (id, idempotency_key, kind, subscriber_id)
        SELECT ?, ?, 'newsletter_confirmation', ? WHERE EXISTS (SELECT 1 FROM newsletter_subscribers WHERE id = ?)
      `).bind(crypto.randomUUID(), `newsletter-confirmation:${id}:1`, id, id),
    ]);
    return { status: "accepted", queuedKey: `newsletter-confirmation:${id}:1` };
  }

  if (existing.status === "pending") {
    const last = existing.last_confirmation_requested_at ? Date.parse(`${existing.last_confirmation_requested_at}Z`) : 0;
    const cooledDown = now.getTime() - last >= CONFIRMATION_RESEND_MINUTES * 60_000;
    if (cooledDown && existing.confirmation_requests < MAX_CONFIRMATION_REQUESTS) {
      const sequence = existing.confirmation_requests + 1;
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE newsletter_subscribers SET confirmation_requests = ?, last_confirmation_requested_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending' AND confirmation_requests = ?
        `).bind(sequence, stamp, stamp, existing.id, existing.confirmation_requests),
        confirmationOutbox(env.DB, existing.id, sequence),
      ]);
      return { status: "accepted", queuedKey: `newsletter-confirmation:${existing.id}:${sequence}` };
    }
    return { status: "accepted" };
  }

  if (existing.status === "unsubscribed") {
    // A new, explicit consent: back to pending with a fresh confirmation.
    const sequence = existing.confirmation_requests + 1;
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE newsletter_subscribers
        SET status = 'pending', email = ?, consent_version = ?, consented_at = ?, unsubscribed_at = NULL,
            confirmed_at = NULL, unsubscribe_nonce = NULL, unsubscribe_token_hash = NULL,
            confirmation_requests = ?, last_confirmation_requested_at = ?, updated_at = ?
        WHERE id = ? AND status = 'unsubscribed'
      `).bind(email, NEWSLETTER_CONSENT_VERSION, stamp, sequence, stamp, stamp, existing.id),
      confirmationOutbox(env.DB, existing.id, sequence),
    ]);
    return { status: "accepted", queuedKey: `newsletter-confirmation:${existing.id}:${sequence}` };
  }
  // confirmed or suppressed: nothing to do, same answer.
  return { status: "accepted" };
}

export type ConfirmOutcome = "confirmed" | "invalid" | "expired" | "disabled";

/** Single use: the confirmation token is cleared when it is accepted. */
export async function confirmNewsletterSubscription(env: NewsletterEnvironment, token: string | null, now = new Date()): Promise<ConfirmOutcome> {
  if (!newsletterSignupEnabled(env)) return "disabled";
  if (!isWellFormedToken(token)) return "invalid";
  const secret = newsletterSecret(env)!;
  const row = await env.DB.prepare(`
    SELECT id, status, confirm_token_expires_at FROM newsletter_subscribers WHERE confirm_token_hash = ?
  `).bind(await sha256Hex(token)).first<{ id: string; status: string; confirm_token_expires_at: string | null }>();
  if (!row || row.status !== "pending") return "invalid";
  if (!row.confirm_token_expires_at || Date.parse(`${row.confirm_token_expires_at}Z`) <= now.getTime()) return "expired";
  const nonce = randomToken();
  const tokenHash = await sha256Hex(await unsubscribeToken(secret, row.id, nonce));
  const stamp = iso(now);
  const update = await env.DB.prepare(`
    UPDATE newsletter_subscribers
    SET status = 'confirmed', confirmed_at = ?, confirm_token_hash = NULL, confirm_token_expires_at = NULL,
        unsubscribe_nonce = ?, unsubscribe_token_hash = ?, updated_at = ?
    WHERE id = ? AND status = 'pending' AND confirm_token_hash = ?
  `).bind(stamp, nonce, tokenHash, stamp, row.id, await sha256Hex(token)).run();
  return Number(update.meta.changes ?? 0) > 0 ? "confirmed" : "invalid";
}

export type UnsubscribeOutcome = "unsubscribed" | "invalid" | "unavailable";

/**
 * Unsubscribes and removes the address. Works even when signups are closed,
 * so existing subscribers can always leave. Queued emails are cancelled.
 */
export async function unsubscribeNewsletter(env: NewsletterEnvironment, token: string | null, now = new Date()): Promise<UnsubscribeOutcome> {
  if (!newsletterSecret(env)) return "unavailable";
  if (!isWellFormedToken(token)) return "invalid";
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT id FROM newsletter_subscribers WHERE unsubscribe_token_hash = ? AND status IN ('pending','confirmed')
  `).bind(tokenHash).first<{ id: string }>();
  if (!row) return "invalid";
  const stamp = iso(now);
  const [update] = await env.DB.batch([
    env.DB.prepare(`
      UPDATE newsletter_subscribers
      SET status = 'unsubscribed', email = NULL, unsubscribed_at = ?, unsubscribe_nonce = NULL,
          unsubscribe_token_hash = NULL, confirm_token_hash = NULL, confirm_token_expires_at = NULL, updated_at = ?
      WHERE id = ? AND unsubscribe_token_hash = ? AND status IN ('pending','confirmed')
    `).bind(stamp, stamp, row.id, tokenHash),
    env.DB.prepare(`
      UPDATE email_outbox SET status = 'cancelled', last_error_code = 'unsubscribed', updated_at = ?
      WHERE subscriber_id = ? AND status IN ('queued','sending') AND changes() > 0
    `).bind(stamp, row.id),
  ]);
  return Number(update?.meta?.changes ?? 0) > 0 ? "unsubscribed" : "invalid";
}

/** An admin_audit_log row for a publisher action on the newsletter (no addresses). */
export async function auditNewsletterAction(
  db: D1Database,
  operator: { email: string; role: string } | undefined,
  action: string,
  outcome: "succeeded" | "failed",
  detailCode: string,
): Promise<void> {
  if (operator?.role !== "publisher") throw new Error("Publisher access is required.");
  const requestId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO admin_audit_log (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', ?, 'email_outbox', NULL, ?, ?, ?)
  `).bind(`${requestId}:${outcome}`, operator.email, action, requestId, outcome, detailCode.slice(0, 240)).run();
}

/** Aggregate counts for the publisher admin page: never addresses. */
export async function newsletterCounts(db: D1Database): Promise<{ subscribers: Record<string, number>; outbox: Record<string, number> }> {
  const subscribers = await db.prepare("SELECT status, COUNT(*) AS n FROM newsletter_subscribers GROUP BY status").all<{ status: string; n: number }>();
  const outbox = await db.prepare("SELECT status, COUNT(*) AS n FROM email_outbox GROUP BY status").all<{ status: string; n: number }>();
  const toRecord = (result: D1Result<{ status: string; n: number }>) => Object.fromEntries((result.results ?? []).map((row) => [row.status, Number(row.n)]));
  return { subscribers: toRecord(subscribers), outbox: toRecord(outbox) };
}
