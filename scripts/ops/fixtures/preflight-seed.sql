-- TRACE-OPS-01 migration preflight: representative existing data. Loaded into
-- a local in-memory database only, to prove a migration preserves it.
INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
  (901, 'Preflight Lab', 'https://preflight-lab.example', 'A', 'A', 'primary-technical', 'rss');
INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
  (901, 901, 'https://preflight-lab.example/a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Published item', 'clustered'),
  (902, 901, 'https://preflight-lab.example/b', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'Withdrawn item', 'clustered'),
  (903, 901, 'https://preflight-lab.example/c', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'Draft item', 'clustered');
INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, needs_human_review, published_at, reviewed_by, reviewed_at) VALUES
  (901, 'preflight-published', 'Published story', 'models', 'S', 'vendor_reported', 'published', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
  (902, 'preflight-withdrawn', 'Withdrawn story', 'models', 'S', 'vendor_reported', 'withdrawn', 0, '2026-07-01T00:00:00Z', 'p@example.test', '2026-07-01T00:00:00Z'),
  (903, NULL, 'Draft story', 'models', 'S', 'unverified', 'draft', 1, NULL, NULL, NULL);
INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (901, 901, 1), (902, 902, 1), (903, 903, 1);
INSERT INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, created_by) VALUES
  ('preflight-new', 'manual_url', 'https://preflight-lab.example/new', 'New lead', 'h-new', 'new', 'p@example.test'),
  ('preflight-held', 'manual_url', 'https://preflight-lab.example/held', 'Held lead', 'h-held', 'held', 'p@example.test'),
  ('preflight-published', 'lead', NULL, 'Published lead', 'h-pub', 'published', 'p@example.test');
INSERT INTO admin_audit_log (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome) VALUES
  ('preflight-1:allowed', 'p@example.test', 'publisher', '/admin/clusters', 'admin_route', NULL, 'preflight-1', 'allowed');
