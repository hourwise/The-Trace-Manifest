-- SOURCE-04: remove stale landing-page probe results after a successful ingest.
-- Ingestion outcome, not a publisher's public landing-page HEAD response, is
-- the authoritative source-health signal. Preserve sources with actual
-- consecutive ingestion failures or no successful ingest.

UPDATE sources
SET
  health_status = 'healthy',
  last_error_at = NULL,
  last_error_message = NULL
WHERE active = 1
  AND health_status = 'degraded'
  AND consecutive_failures = 0
  AND last_success_at IS NOT NULL
  AND last_success_at >= datetime('now', '-26 hours');
