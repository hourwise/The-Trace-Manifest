-- SOURCE-06: MarkTechPost's previously recorded feed now returns text/html to
-- the production Worker, so it is not an admissible RSS/Atom source. Retain
-- the source for a future safe page-diff connector without recording RSS jobs.
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
WHERE id = 106
  AND name = 'MarkTechPost';
