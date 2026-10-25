# TRACE Weekly signup and email outbox (TRACE-RESTORE-01 Task D)

**Branch:** `claude/trace-newsletter-signup`, from `main` at `c41b6b1`. It is independent of PRs #10–#12.
**State:** implemented and tested locally. **Disabled by default and not operational:** no provider account, sending domain or live email exists, and none was created. Signup and sending each have their own gate and fail closed.

## Audit before this change

- **No email capability:** there was no email provider, subscriber table, signup route or sending binding.
- **"Subscribe" was misleading:** the header **Subscribe** buttons (desktop and mobile) linked to `/briefing/daily`, which offers RSS only. The homepage panel said "Get the daily briefing by email", which was not true.
- **The launch plan** (`docs/The Trace Manifest — Revised Launch.md` §14) requires email entry, confirmation, privacy wording, unsubscribe and one weekly preference.

## What exists now

| Piece | Behaviour |
|---|---|
| `db/migration-0078-newsletter-subscriptions.sql` | `newsletter_subscribers`, `newsletter_signup_attempts` and `email_outbox`. Additive; 0072 untouched; 0077 is DEDUPE-R1. |
| `src/lib/server/newsletter.ts` | Normalising, keyed address hash, signup, confirmation, unsubscribe, counts and the audit helper. |
| `src/lib/server/email-outbox.ts` | The `EmailTransport` interface, `MockEmailTransport`, `ResendEmailTransport`, the confirmation template and `processEmailOutbox`. |
| `/newsletter` | Description, frequency and consent text (versioned `trace-weekly-consent-2026-10-v1`); an accessible form with a honeypot; a generic "check your inbox" answer. |
| `/newsletter/confirm` | The link opens a page, and a **button (POST)** confirms, so link scanners can't subscribe anyone. Tokens are single-use and expire after 48 hours; the newest link replaces earlier ones. |
| `/newsletter/unsubscribe` | The link opens a page, and a **button (POST)** unsubscribes. **It works even when signup is closed.** |
| `/admin/newsletter` | **Publisher-only** (readers get 403). It shows **counts only** and the gate status. **Process outbox** sends at most 10 emails and is audited. |
| Header and homepage | **Subscribe** links to `/newsletter` only when signup is open; otherwise the button reads **Daily Briefing**. The homepage panel says email is "in preparation" until then. |

## Privacy and security decisions

- **No enumeration:** every well-formed request gets the same "check your inbox" answer, whether the address is new, pending, confirmed, unsubscribed or suppressed. The confirmation is sent after the response (`waitUntil`), so timing doesn't reveal it either.
- **Minimal storage:**
  - lookups use `email_hash = HMAC(TRACE_NEWSLETTER_SECRET, address)`;
  - the address is stored only while pending or confirmed, and set to `NULL` on unsubscribe or suppression (the hash keeps enforcing suppression);
  - network identities are stored as daily salted hashes;
  - the outbox stores no addresses or tokens.
- **Tokens:**
  - 256-bit random confirmation tokens, stored as SHA-256 hashes and rotated on every send;
  - unsubscribe tokens are `HMAC(secret, id:nonce)`, derived at send time with only the hash stored, and revocable through the nonce.
- **Abuse limits:**
  - 5 signup attempts per network per UTC day, checked first, so a limited request costs **one** statement;
  - at most 3 confirmation emails per address, 10 minutes apart;
  - a honeypot field;
  - Astro 5's built-in origin check on form POSTs (`security.checkOrigin`, on by default for `output: "server"`).
- **No D1 amplification:** every read is a keyed lookup (the unique `email_hash` or token-hash indexes) or a bounded, indexed outbox scan (`LIMIT` at most 25). There is no polling and no Cron.
- **Logs** carry outbox ids and error codes only, never addresses (tested).
- **Retries are bounded and manual:** at most 3 attempts per email, with 15-minute then 2-hour backoff. Retries happen only when a publisher runs the outbox. Unsubscribe and suppression are re-checked at send time, and a stale lease is recovered only within the attempt budget.

## Enabling it later (needs owner approval at each step)

1. **Privacy:** approve the consent text, or a fuller privacy policy, and keep the version string in step.
2. **Provider:** choose one.
   - Resend is implemented (HTTP API with an `Idempotency-Key`); check its current free-tier limits before relying on it.
   - Cloudflare's own email sending could replace it later behind the same `EmailTransport` interface.
   - Create the account and API key yourself; nothing was registered here.
3. **Sending domain:** for example `weekly.thetracemanifest.com`. Add the provider's DNS records exactly as its dashboard shows them:
   - an SPF `TXT` record (`v=spf1 include:<provider> ~all`, merged with any existing SPF);
   - the DKIM `TXT` or `CNAME` records;
   - a DMARC `TXT` at `_dmarc` (start with `v=DMARC1; p=none; rua=mailto:<report address>`, tighten later);
   - and the provider's return-path / MX record if it asks for one.
4. **Migration:** apply **0078** to Preview D1, then to Production D1 (after a Time Travel bookmark).
5. **Pages secrets** (per environment, `wrangler pages secret put`): `TRACE_NEWSLETTER_SECRET` (32+ random characters) and `TRACE_EMAIL_API_KEY`. `TRACE_VISITOR_HASH_SECRET` already exists.
6. **Pages variables:**
   - `TRACE_EMAIL_PROVIDER=resend`;
   - `TRACE_EMAIL_FROM="TRACE Weekly <weekly@…>"`, a verified sender;
   - then `TRACE_EMAIL_DELIVERY_ENABLED=true`;
   - then `TRACE_NEWSLETTER_SIGNUP_ENABLED=true`.
7. **Preview test:** sign up a test address you own, then confirm, unsubscribe and re-subscribe. Process the outbox from `/admin/newsletter` and check bounce handling in the provider. Signup must not be called operational until a real confirmation email has been delivered and confirmed.
8. **Production:** same order, with your own address first.

**To turn it off:** set `TRACE_NEWSLETTER_SIGNUP_ENABLED=false` (closes signup; unsubscribe keeps working) and/or `TRACE_EMAIL_DELIVERY_ENABLED=false` (stops all sending; rows stay queued).

**Not built (later work):**
- importing bounces and complaints from provider webhooks (suppression exists, but is set by an administrator);
- purging pending addresses that never confirmed (they hold no consent beyond the request, so purge them after 30 days in a later task);
- RFC 8058 one-click `List-Unsubscribe-Post` (the `List-Unsubscribe` link header is set);
- a newsletter archive.

## Tests

| Test | Covers |
|---|---|
| `tests/newsletter.test.ts` (in `npm test`) | Gates fail closed. Validation. Signup, outbox, mock send, confirm, single-use token, issue with `List-Unsubscribe`, unsubscribe (with signup closed), address removal, queued issues cancelled, re-consent. No enumeration (confirmed and suppressed addresses get the same answer). Resend limits, expiry and newest-link-wins. Honeypot. Daily per-network rate limit at one statement. Bounded retries and permanent failure. Exclusive claims under a race. Suppression at send time. The Resend request shape via an injected fetch. HTML escaping. Header injection in the sender. No addresses in logs or counts. Publisher-only audit. |
| `tests/newsletter-render.test.ts` (`npm run test:newsletter-render`, run by `npm run ci` after the build) | The **built pages**: closed state (no form, honest header and homepage, POST returns 503 and writes nothing); open state (accessible form, consent text, honeypot, header link, generic answer, no echoed address, no send while delivery is off). Confirm and unsubscribe GETs have no side effects. Admin: counts only, publisher-only, and no sending without delivery configured. |

**Full checks:** `npm test`, typecheck (Astro and Worker), `test:security`, `test:migrations`, `test:diff`, `test:evidence-policy`, `test:knowledge-markdown`, `npm run build` and `test:newsletter-render` all pass. No network or provider was contacted.
