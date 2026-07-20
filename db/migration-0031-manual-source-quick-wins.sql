-- Quick wins: convert 4 remaining manual sources to active connectors.
-- Apply after migration-0030.

-- MCP Docs → github_api (tracks the spec repo)
UPDATE sources SET
  url = 'https://github.com/modelcontextprotocol/specification',
  ingestion_type = 'github_api',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'Model Context Protocol Docs';

-- OpenAI Agents SDK Docs → github_api (tracks the SDK repo)
UPDATE sources SET
  url = 'https://github.com/openai/openai-agents-python',
  ingestion_type = 'github_api',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'OpenAI Agents SDK Docs';

-- IBM Research AI → rss
UPDATE sources SET
  feed_url = 'https://research.ibm.com/blog/feed/',
  ingestion_type = 'rss',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'IBM Research AI';

-- Meta AI Research → rss
UPDATE sources SET
  feed_url = 'https://ai.meta.com/research/feed/',
  ingestion_type = 'rss',
  health_status = 'unknown',
  last_error_message = NULL,
  consecutive_failures = 0,
  updated_at = datetime('now')
WHERE name = 'Meta AI Research';
