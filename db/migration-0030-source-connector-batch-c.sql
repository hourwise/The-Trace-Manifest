-- Job 2 Batch C: Benchmark source connectors.
-- Practical fixes: GitHub API for repos, RSS for blogs.
-- Apply after migration-0029.

-- SWE-bench → github_api (Princeton NLP repo)
UPDATE sources SET
  url = 'https://github.com/princeton-nlp/SWE-bench',
  ingestion_type = 'github_api',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'SWE-bench';

-- LiveBench → github_api
UPDATE sources SET
  url = 'https://github.com/LiveBench/LiveBench',
  ingestion_type = 'github_api',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'LiveBench';

-- Stanford HELM → github_api
UPDATE sources SET
  url = 'https://github.com/stanford-crfm/helm',
  ingestion_type = 'github_api',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'Stanford HELM';

-- MLCommons → rss (blog feed)
UPDATE sources SET
  feed_url = 'https://mlcommons.org/feed/',
  ingestion_type = 'rss',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'MLCommons';

-- Epoch AI → rss (blog feed)
UPDATE sources SET
  feed_url = 'https://epochai.org/blog/feed',
  ingestion_type = 'rss',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'Epoch AI';

-- LMSYS Chatbot Arena → re-enable as manual for now (needs custom API)
UPDATE sources SET
  active = 1,
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'LMSYS Chatbot Arena';

-- Artificial Analysis → keep manual for now (needs custom API connector)
-- This is the highest-value benchmark source but requires a dedicated connector
-- due to its complex data model (collates pricing, latency, benchmarks).
