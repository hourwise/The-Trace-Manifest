-- KC-11D: bounded stale-evidence recalculation state and lookup support.
-- Additive only. A stale assertion is marked after its claim has been
-- recalculated; a later transition into stale clears that marker.

ALTER TABLE claim_assertions ADD COLUMN expiry_recalculated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_claim_assertions_stale_batch
  ON claim_assertions(freshness_state, expiry_recalculated_at, canonical_claim_id, id);

CREATE TRIGGER IF NOT EXISTS trg_claim_assertions_expiry_requeue
AFTER UPDATE OF freshness_state ON claim_assertions
WHEN NEW.freshness_state = 'stale' AND OLD.freshness_state <> 'stale'
BEGIN
  UPDATE claim_assertions
  SET expiry_recalculated_at = NULL
  WHERE id = NEW.id;
END;
