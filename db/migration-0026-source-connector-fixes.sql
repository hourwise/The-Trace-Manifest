-- Fix broken/deprecated source connectors.
-- Apply to production: npx wrangler d1 execute trace-manifest-db --remote --file=db/migration-0026-source-connector-fixes.sql

-- Fix broken RSS URLs (404s)
UPDATE sources SET feed_url = 'https://cohere.com/blog/rss', updated_at = datetime('now') WHERE id = 15 AND name = 'Cohere Blog';
UPDATE sources SET feed_url = 'https://blog.google/technology/ai/rss/', updated_at = datetime('now') WHERE id = 9 AND name = 'Google Developers AI';
UPDATE sources SET feed_url = 'https://mistral.ai/news/feed/', updated_at = datetime('now') WHERE id = 14 AND name = 'Mistral News';

-- Fix Google Cloud AI Blog content type (add direct RSS feed URL)
UPDATE sources SET feed_url = 'https://cloud.google.com/blog/feeds/ai-machine-learning.xml', ingestion_type = 'rss', updated_at = datetime('now') WHERE id = 10 AND name = 'Google Cloud AI Blog';

-- Add RSS feeds for manual sources that have them (Tier A)
UPDATE sources SET feed_url = 'https://aws.amazon.com/blogs/machine-learning/feed/', ingestion_type = 'rss', updated_at = datetime('now') WHERE id IN (SELECT id FROM sources WHERE name = 'AWS Machine Learning Blog' AND ingestion_type = 'manual');
UPDATE sources SET feed_url = 'https://ai.meta.com/blog/feed/', ingestion_type = 'rss', updated_at = datetime('now') WHERE id IN (SELECT id FROM sources WHERE name = 'Meta AI Blog' AND ingestion_type = 'manual');
UPDATE sources SET feed_url = 'https://stability.ai/news/rss', ingestion_type = 'rss', updated_at = datetime('now') WHERE id IN (SELECT id FROM sources WHERE name = 'Stability AI News' AND ingestion_type = 'manual');
UPDATE sources SET feed_url = 'https://x.ai/blog/rss', ingestion_type = 'rss', updated_at = datetime('now') WHERE id IN (SELECT id FROM sources WHERE name = 'xAI Blog' AND ingestion_type = 'manual');

-- Anthropic Newsroom + Research already have page_diff selector config from SOURCE-07
-- but report as unsupported. Check if selectors are still valid.
UPDATE sources SET health_status = 'unknown', last_error_message = NULL, consecutive_failures = 0, updated_at = datetime('now') WHERE id IN (SELECT id FROM sources WHERE name IN ('Anthropic Newsroom', 'Anthropic Research') AND ingestion_type = 'page_diff');

-- Re-enable Import AI (Substack)
UPDATE sources SET active = 1, health_status = 'unknown', updated_at = datetime('now') WHERE name = 'Import AI';
