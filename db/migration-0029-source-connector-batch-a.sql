-- Job 2: Source connector repairs — Batch A.
-- Reset health for already-fixed sources, fix remaining broken RSS URLs,
-- and add RSS feeds for manual sources that have them.

-- Reset health for fixed sources (allow clean retry on next fetch)
UPDATE sources SET health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name IN ('Meta AI Blog','Stability AI News','xAI Blog','Google Developers AI','Import AI');

-- Fix Mistral News RSS (try alternative URL)
UPDATE sources SET feed_url='https://mistral.ai/en/news/feed/', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Mistral News';

-- Fix Cohere Blog RSS (try /rss.xml)
UPDATE sources SET feed_url='https://cohere.com/blog/feed.xml', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Cohere Blog';

-- Fix Google Cloud AI Blog (try the HTML blog page — already has RSS content-type validation issue)
UPDATE sources SET feed_url='https://cloud.google.com/blog/products/ai-machine-learning/rss', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Google Cloud AI Blog';

-- Anthropic API Release Notes: switch from manual to page_diff (has existing selector config from SOURCE-07)
UPDATE sources SET ingestion_type='page_diff', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Anthropic API Release Notes';

-- Anthropic Newsroom: selector may need updating — reset for retry
UPDATE sources SET health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Anthropic Newsroom';

-- Add RSS for manual sources that have feeds (Batch A priority)
UPDATE sources SET feed_url='https://z.ai/blog/feed', ingestion_type='rss', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Z.AI Blog (GLM)' AND ingestion_type='manual';

-- OpenAI has an RSS feed at /news/rss.xml
UPDATE sources SET feed_url='https://openai.com/news/rss.xml', ingestion_type='rss', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='OpenAI Model Documentation' AND ingestion_type='manual';

-- Groq Blog RSS
UPDATE sources SET feed_url='https://groq.com/feed/', ingestion_type='rss', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Groq Blog' AND ingestion_type='manual';

-- Together AI Blog RSS
UPDATE sources SET feed_url='https://www.together.ai/blog/rss', ingestion_type='rss', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='Together AI Blog' AND ingestion_type='manual';

-- AI21 Labs Blog RSS
UPDATE sources SET feed_url='https://www.ai21.com/blog/rss', ingestion_type='rss', health_status='unknown', last_error_message=NULL, last_error_at=NULL, consecutive_failures=0, updated_at=datetime('now')
  WHERE name='AI21 Labs Blog' AND ingestion_type='manual';
