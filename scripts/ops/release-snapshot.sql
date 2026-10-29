-- TRACE-OPS-01 release snapshot: read-only, one statement, one (metric, value)
-- row per invariant. Run it yourself before and after a release, for example
--   npx wrangler d1 execute <database> [--env production] --remote --json --file scripts/ops/release-snapshot.sql > before.json
-- and compare with: node scripts/ops/release-verify.mjs --manifest ... --before before.json --after after.json
-- The verification tool never runs this against a remote database.
SELECT 'clusters.total' AS metric, COUNT(*) AS value FROM story_clusters
UNION ALL SELECT 'clusters.status.' || publication_status, COUNT(*) FROM story_clusters GROUP BY publication_status
UNION ALL SELECT 'clusters.max_id', MAX(id) FROM story_clusters
UNION ALL SELECT 'clusters.pending_review.count', COUNT(*) FROM story_clusters WHERE needs_human_review = 1 AND publication_status IN ('draft', 'review')
UNION ALL SELECT 'clusters.pending_review.id_sum', COALESCE(SUM(id), 0) FROM story_clusters WHERE needs_human_review = 1 AND publication_status IN ('draft', 'review')
UNION ALL SELECT 'clusters.publishable', COUNT(*) FROM story_clusters WHERE publication_status IN ('draft', 'review') AND evidence_status NOT IN ('unverified', 'outdated', 'superseded')
UNION ALL SELECT 'clusters.primary_source_keyed', COUNT(*) FROM story_clusters WHERE primary_source_key IS NOT NULL
UNION ALL SELECT 'members.total', COUNT(*) FROM story_cluster_members
UNION ALL SELECT 'feed_items.total', COUNT(*) FROM feed_items
UNION ALL SELECT 'feed_items.max_id', MAX(id) FROM feed_items
UNION ALL SELECT 'candidates.total', COUNT(*) FROM editorial_candidates
UNION ALL SELECT 'candidates.state.' || state, COUNT(*) FROM editorial_candidates GROUP BY state
UNION ALL SELECT 'sources.active', COUNT(*) FROM sources WHERE active = 1
UNION ALL SELECT 'ingestion_jobs.total', COUNT(*) FROM ingestion_jobs
UNION ALL SELECT 'cron_runs.total', COUNT(*) FROM cron_runs
UNION ALL SELECT 'audit.total', COUNT(*) FROM admin_audit_log
UNION ALL SELECT 'audit.max_id', MAX(id) FROM admin_audit_log
UNION ALL SELECT 'schema.object_count', COUNT(*) FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
UNION ALL SELECT 'schema.objects', group_concat(type || ':' || name, ',') FROM (SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name);
