-- TRACE V1 Mission 2: bounded activation receipts and freshness compatibility.
--
-- Additive candidate only.  This file is not authorized for remote execution
-- in Mission 2.  The 0070 field compatibility candidate must be classified
-- first; no historical rows are rewritten here.

CREATE TABLE IF NOT EXISTS evidence_freshness_reviews (
  id TEXT PRIMARY KEY,
  claim_assertion_id TEXT NOT NULL REFERENCES claim_assertions(id) ON DELETE RESTRICT,
  prior_state TEXT NOT NULL CHECK(prior_state IN ('unknown','current','stale')),
  proposed_state TEXT NOT NULL CHECK(proposed_state IN ('current','stale')),
  source_document_version_id TEXT REFERENCES source_document_versions(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  CHECK(prior_state <> proposed_state),
  CHECK((state = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
     OR (state IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_evidence_freshness_reviews_queue
  ON evidence_freshness_reviews(state, requested_at ASC);
CREATE INDEX IF NOT EXISTS idx_evidence_freshness_reviews_assertion
  ON evidence_freshness_reviews(claim_assertion_id, requested_at DESC);

CREATE TRIGGER IF NOT EXISTS prevent_evidence_freshness_review_delete
BEFORE DELETE ON evidence_freshness_reviews
BEGIN
  SELECT RAISE(ABORT, 'evidence freshness reviews are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_evidence_freshness_review_core_update
BEFORE UPDATE OF claim_assertion_id, prior_state, proposed_state,
  source_document_version_id, reason, requested_by, requested_at,
  idempotency_key, request_fingerprint
ON evidence_freshness_reviews
BEGIN
  SELECT RAISE(ABORT, 'evidence freshness review core fields are immutable');
END;

CREATE TABLE IF NOT EXISTS trace_v1_activation_receipts (
  operation_key TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('story','knowledge')),
  item_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('LOCAL_TEST','PREVIEW','PRODUCTION')),
  source_id INTEGER,
  source_document_version_id TEXT,
  outcome TEXT NOT NULL CHECK(outcome IN ('completed','replayed','blocked','failed')),
  reason_code TEXT NOT NULL,
  detail TEXT NOT NULL,
  receipt_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trace_v1_activation_receipts_manifest
  ON trace_v1_activation_receipts(manifest_hash, item_id);
