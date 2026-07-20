-- The Trace Manifest — Source Connector Repair
-- Fixes existing production source rows to match corrected seed.sql configuration.
-- Run once against production D1: npx wrangler d1 execute trace-manifest-db --file db/migration-0026-source-connector-repair.sql --remote
-- Safe to re-run: all statements use WHERE clauses that target specific source names.

-- page_diff → RSS (sources with discoverable feeds)
UPDATE sources SET ingestion_type = 'rss', feed_url = 'https://developers.googleblog.com/feeds/posts/default/-/ai/', cadence_minutes = 180 WHERE name = 'Google Developers AI';
UPDATE sources SET ingestion_type = 'rss', feed_url = 'https://cloud.google.com/blog/products/ai-machine-learning/rss', cadence_minutes = 360 WHERE name = 'Google Cloud AI Blog';
UPDATE sources SET ingestion_type = 'rss', feed_url = 'https://mistral.ai/news/rss/' WHERE name = 'Mistral News';
UPDATE sources SET ingestion_type = 'rss', feed_url = 'https://cohere.com/blog/feed/' WHERE name = 'Cohere Blog';
UPDATE sources SET ingestion_type = 'rss', feed_url = 'https://huggingface.co/blog/feed.xml' WHERE name = 'Hugging Face Blog';

-- page_diff → manual (sources with no reliable automated feed)
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 360 WHERE name = 'OpenAI API Changelog';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 360 WHERE name = 'Anthropic API Release Notes';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 360 WHERE name = 'Meta AI Blog';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 720 WHERE name = 'Meta AI Research';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 360 WHERE name = 'Stability AI News';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 1440 WHERE name = 'IBM Research AI';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 360 WHERE name = 'xAI Blog';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 360 WHERE name = 'Groq Blog';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 720 WHERE name = 'AI21 Labs Blog';
UPDATE sources SET ingestion_type = 'manual', cadence_minutes = 1440 WHERE name = 'OpenAI Model Documentation';

-- Reset health for repaired sources so the next scheduled run gets a clean attempt
UPDATE sources SET health_status = 'unknown', consecutive_failures = 0, last_error_message = NULL WHERE ingestion_type IN ('rss', 'manual') AND health_status IN ('degraded', 'failing');

-- Verify the changes
SELECT name, ingestion_type, feed_url, cadence_minutes, health_status FROM sources WHERE name IN ('Mistral News','Cohere Blog','Google Developers AI','Google Cloud AI Blog','Hugging Face Blog','OpenAI API Changelog','Anthropic API Release Notes','Meta AI Blog','Meta AI Research','Stability AI News','IBM Research AI','xAI Blog','Groq Blog','AI21 Labs Blog','OpenAI Model Documentation') ORDER BY ingestion_type, name;
