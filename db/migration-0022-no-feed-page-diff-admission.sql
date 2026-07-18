-- SOURCE-06: these first-party pages remain in the source registry, but no
-- RSS/Atom endpoint passed parser verification. Make the missing connector
-- explicit instead of retrying them as RSS and recording recurring failures.

UPDATE sources
SET
  ingestion_type = 'page_diff',
  feed_url = NULL,
  last_fetched_at = NULL,
  last_success_at = NULL,
  last_error_at = NULL,
  last_error_message = NULL,
  consecutive_failures = 0,
  health_status = 'unknown'
WHERE id IN (4, 5, 9, 10, 11, 12, 14, 15, 19, 21, 85, 87, 90);
