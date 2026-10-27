-- TRACE-RESTORE-01 Task E: TRACE Weekly issue drafts with human approval.
--
-- An issue freezes the published-story fields it renders (snapshot_json) and
-- a content_hash over the intro and that snapshot. Approval records the hash it
-- approved; any edit changes the hash, which invalidates the approval (the
-- issue returns to draft). dispatch_key is unique, so one approved issue
-- cannot be queued for sending twice. No row here sends anything: sending
-- goes through email_outbox (migration 0078), behind its own gates.
-- Forward-only and additive. 0072 is reserved; 0077 and 0078 precede this.

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id TEXT PRIMARY KEY,
  issue_date TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','approved','ready_for_dispatch','dispatched','superseded','discarded')),
  intro TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  excluded_story_ids_json TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by TEXT,
  approved_at TEXT,
  approved_content_hash TEXT,
  ready_by TEXT,
  ready_at TEXT,
  dispatch_key TEXT UNIQUE,
  dispatched_by TEXT,
  dispatched_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(issue_date, version),
  CHECK(status NOT IN ('approved','ready_for_dispatch','dispatched') OR (approved_by IS NOT NULL AND approved_content_hash = content_hash)),
  CHECK(status NOT IN ('ready_for_dispatch','dispatched') OR dispatch_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_newsletter_issues_recent ON newsletter_issues(issue_date DESC, version DESC);
