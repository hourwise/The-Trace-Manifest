-- SOURCE-03 batch 1: use verified first-party syndication feeds while retaining
-- each source's human-facing landing page as its canonical URL.
-- Reset status so a subsequent ingestion run reports the new endpoint accurately.
UPDATE sources
SET
  feed_url = CASE id
    WHEN 16 THEN 'https://developer.nvidia.com/blog/category/generative-ai/feed/'
    WHEN 18 THEN 'https://aws.amazon.com/blogs/machine-learning/feed/'
    WHEN 81 THEN 'https://github.blog/ai-and-ml/feed/'
  END,
  last_fetched_at = NULL,
  last_success_at = NULL,
  last_error_at = NULL,
  last_error_message = NULL,
  consecutive_failures = 0,
  health_status = 'unknown'
WHERE id IN (16, 18, 81);
