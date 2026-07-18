-- SOURCE-03 batch 2: replace failed landing-page fetches with verified,
-- topic-specific first-party feeds and correct NVIDIA's retired category URL.
-- Reset status so the next ingestion run represents these new endpoints only.
UPDATE sources
SET
  name = CASE id
    WHEN 82 THEN 'NVIDIA Deep Learning Blog'
    ELSE name
  END,
  url = CASE id
    WHEN 82 THEN 'https://blogs.nvidia.com/blog/category/enterprise/deep-learning/'
    ELSE url
  END,
  feed_url = CASE id
    WHEN 1 THEN 'https://openai.com/news/rss.xml'
    WHEN 13 THEN 'https://news.microsoft.com/source/topics/ai/feed/'
    WHEN 82 THEN 'https://blogs.nvidia.com/blog/category/deep-learning/feed/'
  END,
  last_fetched_at = NULL,
  last_success_at = NULL,
  last_error_at = NULL,
  last_error_message = NULL,
  consecutive_failures = 0,
  health_status = 'unknown'
WHERE id IN (1, 13, 82);
