// Email delivery for TRACE Weekly (TRACE-RESTORE-01 Task D).
//
// Pages enqueue rows in email_outbox; only processEmailOutbox sends, through a
// pluggable EmailTransport. Nothing sends unless TRACE_EMAIL_DELIVERY_ENABLED is
// "true" and a provider is fully configured (transportFromEnv returns null
// otherwise). There is no background loop: the queue is processed only when a
// publisher runs it, or right after a signup for that one confirmation, and each
// row is tried at most max_attempts times.

import {
  CONFIRM_TOKEN_HOURS,
  newsletterSecret,
  randomToken,
  sha256Hex,
  unsubscribeToken,
} from "./newsletter";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  /** Stable per outbox row, so a provider can de-duplicate a retried send. */
  idempotencyKey: string;
}

export type SendResult = { ok: true; messageId: string } | { ok: false; retryable: boolean; code: string };

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

/** Records messages in memory. Used by tests and local development; never sends. */
export class MockEmailTransport implements EmailTransport {
  readonly name = "mock";
  readonly sent: EmailMessage[] = [];
  /** Results to return for the next sends, in order; defaults to success. */
  readonly queuedResults: SendResult[] = [];
  async send(message: EmailMessage): Promise<SendResult> {
    const next = this.queuedResults.shift();
    if (next && !next.ok) return next;
    this.sent.push(message);
    return next ?? { ok: true, messageId: `mock-${this.sent.length}` };
  }
}

/**
 * Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Constructed only from configuration; tests inject fetch, so no network.
 */
export class ResendEmailTransport implements EmailTransport {
  readonly name = "resend";
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async send(message: EmailMessage): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: message.from, to: [message.to], subject: message.subject,
          text: message.text, html: message.html, headers: message.headers,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, retryable: true, code: "network_error" };
    }
    if (response.ok) {
      const body = await response.json().catch(() => null) as { id?: string } | null;
      return body?.id ? { ok: true, messageId: body.id } : { ok: false, retryable: false, code: "invalid_provider_response" };
    }
    // 429 and 5xx may succeed later; other 4xx will not.
    return { ok: false, retryable: response.status === 429 || response.status >= 500, code: `http_${response.status}` };
  }
}

export interface EmailDeliveryEnvironment {
  TRACE_EMAIL_DELIVERY_ENABLED?: string;
  TRACE_EMAIL_PROVIDER?: string;
  TRACE_EMAIL_API_KEY?: string;
  TRACE_EMAIL_FROM?: string;
  TRACE_NEWSLETTER_SECRET?: string;
}

/** The configured transport, or null: delivery stays off unless every prerequisite is present. */
export function transportFromEnv(env: EmailDeliveryEnvironment, fetchImpl?: typeof fetch): EmailTransport | null {
  if (env.TRACE_EMAIL_DELIVERY_ENABLED !== "true" || !newsletterSecret(env) || !emailFrom(env)) return null;
  if (env.TRACE_EMAIL_PROVIDER === "resend" && (env.TRACE_EMAIL_API_KEY ?? "").length >= 20) {
    return new ResendEmailTransport(env.TRACE_EMAIL_API_KEY!, fetchImpl);
  }
  return null;
}

export function emailFrom(env: EmailDeliveryEnvironment): string | null {
  const from = (env.TRACE_EMAIL_FROM ?? "").trim();
  return /^[^<>\r\n]{0,80}<?[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}>?$/i.test(from) ? from : null;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function confirmationEmail(siteUrl: string, token: string): { subject: string; text: string; html: string } {
  const link = `${siteUrl}/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const subject = "Confirm your TRACE Weekly subscription";
  const text = [
    "Please confirm that you want to receive TRACE Weekly from The Trace Manifest.",
    "",
    `Confirm: ${link}`,
    "",
    `This link expires in ${CONFIRM_TOKEN_HOURS} hours. If you did not ask for this, ignore this email: you will not be subscribed.`,
  ].join("\n");
  const html = `<!doctype html><html lang="en"><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:16px;">`
    + `<p>Please confirm that you want to receive <strong>TRACE Weekly</strong> from The Trace Manifest.</p>`
    + `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Confirm subscription</a></p>`
    + `<p style="font-size:13px;color:#555;">This link expires in ${CONFIRM_TOKEN_HOURS} hours. If you did not ask for this, ignore this email: you will not be subscribed.</p>`
    + `</body></html>`;
  return { subject, text, html };
}

/** Renders an approved issue for one subscriber (TRACE-RESTORE-01 Task E). */
export type IssueRenderer = (issueId: string, unsubscribeUrl: string) => Promise<{ subject: string; text: string; html: string } | null>;

export interface OutboxRunOptions {
  db: D1Database;
  transport: EmailTransport;
  secret: string;
  from: string;
  siteUrl: string;
  limit?: number;
  now?: Date;
  /** Only the row with this idempotency key (used right after a signup). */
  onlyKey?: string;
  /** Without a renderer, issue rows are left queued. */
  renderIssue?: IssueRenderer;
}

export interface OutboxRunResult { claimed: number; sent: number; retried: number; failed: number; cancelled: number }

const LEASE_MINUTES = 5;
const BACKOFF_MINUTES = [15, 120];

function iso(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

interface OutboxRow { id: string; idempotency_key: string; kind: "newsletter_confirmation" | "newsletter_issue"; subscriber_id: string; issue_id: string | null; attempts: number; max_attempts: number }

/**
 * Sends due outbox rows. Each row is claimed with a guarded update (a second
 * processor skips it), checked against the subscriber's current status
 * (suppression and unsubscribes are enforced at send time), sent once, and
 * settled. Retryable failures wait 15 minutes, then 2 hours; after
 * max_attempts a row is failed. Logs carry outbox ids and codes only.
 */
export async function processEmailOutbox(options: OutboxRunOptions): Promise<OutboxRunResult> {
  const { db, transport, secret, from, siteUrl } = options;
  const now = options.now ?? new Date();
  const stamp = iso(now);
  const limit = Math.max(1, Math.min(options.limit ?? 10, 25));
  const kinds = options.renderIssue ? ["newsletter_confirmation", "newsletter_issue"] : ["newsletter_confirmation"];
  const due = await db.prepare(`
    SELECT id, idempotency_key, kind, subscriber_id, issue_id, attempts, max_attempts FROM email_outbox
    WHERE ((status = 'queued' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_expires_at <= ?))
      AND kind IN (${kinds.map(() => "?").join(", ")})
      ${options.onlyKey ? "AND idempotency_key = ?" : ""}
    ORDER BY next_attempt_at, id
    LIMIT ?
  `).bind(stamp, stamp, ...kinds, ...(options.onlyKey ? [options.onlyKey] : []), limit).all<OutboxRow>();

  const result: OutboxRunResult = { claimed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0 };
  for (const row of due.results ?? []) {
    const claim = await db.prepare(`
      UPDATE email_outbox SET status = 'sending', attempts = attempts + 1, lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND attempts < max_attempts
        AND ((status = 'queued' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_expires_at <= ?))
    `).bind(iso(new Date(now.getTime() + LEASE_MINUTES * 60_000)), stamp, row.id, stamp, stamp).run();
    if (Number(claim.meta.changes ?? 0) === 0) continue;
    result.claimed++;
    const attempt = row.attempts + 1;

    const settle = (status: "sent" | "queued" | "failed" | "cancelled", extra: { code?: string; messageId?: string; next?: string } = {}) => db.prepare(`
      UPDATE email_outbox SET status = ?, lease_expires_at = NULL, provider = ?, provider_message_id = COALESCE(?, provider_message_id),
        last_error_code = ?, next_attempt_at = COALESCE(?, next_attempt_at), sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END, updated_at = ?
      WHERE id = ? AND status = 'sending'
    `).bind(status, transport.name, extra.messageId ?? null, extra.code ?? null, extra.next ?? null, status, stamp, stamp, row.id).run();

    const subscriber = await db.prepare(`
      SELECT id, email, status, unsubscribe_nonce FROM newsletter_subscribers WHERE id = ?
    `).bind(row.subscriber_id).first<{ id: string; email: string | null; status: string; unsubscribe_nonce: string | null }>();
    const eligible = row.kind === "newsletter_confirmation" ? subscriber?.status === "pending" : subscriber?.status === "confirmed";
    if (!subscriber?.email || !eligible) {
      await settle("cancelled", { code: "recipient_not_eligible" });
      result.cancelled++;
      continue;
    }

    let content: { subject: string; text: string; html: string } | null;
    const headers: Record<string, string> = {};
    if (row.kind === "newsletter_confirmation") {
      // A fresh single-use token per email; only its hash is stored.
      const token = randomToken();
      const expires = iso(new Date(now.getTime() + CONFIRM_TOKEN_HOURS * 3_600_000));
      const rotated = await db.prepare(`
        UPDATE newsletter_subscribers SET confirm_token_hash = ?, confirm_token_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).bind(await sha256Hex(token), expires, stamp, subscriber.id).run();
      if (Number(rotated.meta.changes ?? 0) === 0) {
        await settle("cancelled", { code: "recipient_not_eligible" });
        result.cancelled++;
        continue;
      }
      content = confirmationEmail(siteUrl, token);
    } else {
      const unsubscribeUrl = subscriber.unsubscribe_nonce
        ? `${siteUrl}/newsletter/unsubscribe?token=${encodeURIComponent(await unsubscribeToken(secret, subscriber.id, subscriber.unsubscribe_nonce))}`
        : null;
      content = unsubscribeUrl && options.renderIssue ? await options.renderIssue(row.issue_id!, unsubscribeUrl) : null;
      if (unsubscribeUrl) headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
      if (!content) {
        await settle("cancelled", { code: "issue_unavailable" });
        result.cancelled++;
        continue;
      }
    }

    const sent = await transport.send({ to: subscriber.email, from, ...content, headers, idempotencyKey: row.idempotency_key });
    if (sent.ok) {
      await settle("sent", { messageId: sent.messageId });
      result.sent++;
    } else if (sent.retryable && attempt < row.max_attempts) {
      await settle("queued", { code: sent.code, next: iso(new Date(now.getTime() + BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)] * 60_000)) });
      result.retried++;
      console.warn(JSON.stringify({ message: "Email send will be retried", outboxId: row.id, code: sent.code, attempt }));
    } else {
      await settle("failed", { code: sent.code });
      result.failed++;
      console.warn(JSON.stringify({ message: "Email send failed", outboxId: row.id, code: sent.code, attempt }));
    }
  }
  return result;
}
