-- TRACE-RESTORE-01 Task D: TRACE Weekly email subscriptions and a durable outbox.
--
-- Disabled by default: nothing reads or writes these tables unless
-- TRACE_NEWSLETTER_SIGNUP_ENABLED (signup) and TRACE_EMAIL_DELIVERY_ENABLED
-- (sending) are set to "true".
--
-- Privacy and data minimisation:
-- - email_hash = HMAC-SHA256(TRACE_NEWSLETTER_SECRET, normalised address) is
--   the lookup key, so signup never scans plaintext addresses;
-- - email is kept only while it is needed to send (pending or confirmed). It is
--   set to NULL on unsubscribe or suppression; email_hash stays, so suppression
--   is enforced without keeping the address;
-- - tokens are stored only as SHA-256 hashes; raw tokens exist only in the
--   email being sent and are generated at send time, never stored in the outbox.
-- Forward-only and additive. Do not renumber: 0072 is reserved; 0077 is
-- TRACE-EDITORIAL-DEDUPE-R1.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  email TEXT,
  newsletter TEXT NOT NULL DEFAULT 'trace_weekly' CHECK(newsletter IN ('trace_weekly')),
  status TEXT NOT NULL CHECK(status IN ('pending','confirmed','unsubscribed','suppressed')),
  consent_version TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  suppressed_at TEXT,
  suppression_reason TEXT CHECK(suppression_reason IS NULL OR suppression_reason IN ('bounce','complaint','administrative')),
  confirm_token_hash TEXT UNIQUE,
  confirm_token_expires_at TEXT,
  -- The unsubscribe token is HMAC(secret, id:nonce): links are re-derived at
  -- send time, only the token hash is stored, and a new nonce revokes old links.
  unsubscribe_nonce TEXT,
  unsubscribe_token_hash TEXT UNIQUE,
  confirmation_requests INTEGER NOT NULL DEFAULT 0 CHECK(confirmation_requests >= 0),
  last_confirmation_requested_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((status IN ('pending','confirmed') AND email IS NOT NULL) OR (status IN ('unsubscribed','suppressed') AND email IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers(status, created_at);

-- Per-network signup attempts per UTC day (keyed by the same daily visitor hash
-- public Ask uses), checked before any subscriber read.
CREATE TABLE IF NOT EXISTS newsletter_signup_attempts (
  day_key TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  PRIMARY KEY (day_key, visitor_hash)
);

-- One row per email to send. The idempotency key prevents duplicate rows for
-- the same message; the guarded claim prevents two processors sending it;
-- max_attempts bounds retries, which only happen when a publisher runs the queue.
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('newsletter_confirmation','newsletter_issue')),
  subscriber_id TEXT NOT NULL REFERENCES newsletter_subscribers(id),
  issue_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts BETWEEN 1 AND 5),
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  lease_expires_at TEXT,
  provider TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  CHECK((kind = 'newsletter_issue') = (issue_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_due ON email_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_subscriber ON email_outbox(subscriber_id, status);
