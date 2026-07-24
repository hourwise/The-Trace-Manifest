-- TRACE Knowledge Continuity KC-07E.
-- A score recalculation can propose a material status change, but only an
-- authenticated publisher may approve it. Corrections are recorded with an
-- explicit human approval note in the same durable ledger.

CREATE TABLE IF NOT EXISTS evidence_change_approvals (
  id TEXT PRIMARY KEY,
  change_kind TEXT NOT NULL CHECK(change_kind IN ('status_change','correction')),
  target_type TEXT NOT NULL CHECK(target_type IN ('story_cluster','canonical_claim')),
  target_id TEXT NOT NULL,
  previous_status TEXT,
  proposed_status TEXT NOT NULL,
  snapshot_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),
  requested_by TEXT NOT NULL,
  reviewed_by TEXT,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  review_note TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  CHECK((state = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
     OR (state IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_change_approvals_pending_target
  ON evidence_change_approvals(change_kind, target_type, target_id, proposed_status, state)
  WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS idx_evidence_change_approvals_queue
  ON evidence_change_approvals(state, requested_at ASC);
CREATE INDEX IF NOT EXISTS idx_evidence_change_approvals_target
  ON evidence_change_approvals(target_type, target_id, requested_at DESC);
