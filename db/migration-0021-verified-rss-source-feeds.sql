-- SOURCE-05: admit only verified first-party RSS feeds. Two source names are
-- corrected where the supported feed is broader (Azure) or is official release
-- documentation rather than the retired blog category (Databricks).

UPDATE sources
SET
  name = CASE id
    WHEN 80 THEN 'Azure Blog'
    WHEN 22 THEN 'Databricks Release Notes'
    ELSE name
  END,
  url = CASE id
    WHEN 80 THEN 'https://azure.microsoft.com/en-us/blog/'
    WHEN 22 THEN 'https://docs.databricks.com/aws/en/release-notes'
    ELSE url
  END,
  feed_url = CASE id
    WHEN 7 THEN 'https://deepmind.google/blog/rss.xml'
    WHEN 8 THEN 'https://research.google/blog/rss/'
    WHEN 20 THEN 'https://machinelearning.apple.com/rss.xml'
    WHEN 22 THEN 'https://docs.databricks.com/aws/en/feed.xml'
    WHEN 80 THEN 'https://azure.microsoft.com/en-us/blog/feed/'
    WHEN 86 THEN 'https://www.together.ai/blog/rss.xml'
  END,
  treatment = CASE id
    WHEN 22 THEN 'primary-technical'
    ELSE treatment
  END,
  last_fetched_at = NULL,
  last_success_at = NULL,
  last_error_at = NULL,
  last_error_message = NULL,
  consecutive_failures = 0,
  health_status = 'unknown'
WHERE id IN (7, 8, 20, 22, 80, 86);
