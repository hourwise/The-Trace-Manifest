-- TRACE V1 Mission 1: publisher-governed assertion freshness review.
-- Additive only. This migration is intentionally NOT applied by Mission 1.

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
  source_document_version_id, reason, requested_by, requested_at, idempotency_key
ON evidence_freshness_reviews
BEGIN
  SELECT RAISE(ABORT, 'evidence freshness review core fields are immutable');
END;
