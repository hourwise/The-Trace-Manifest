-- FUTURE READ-ONLY CHECKS, NOT AUTHORISATION TO CONTACT PREVIEW.
-- First verify the exact target and revised 0080 hash; stop on older/absent 0080.
SELECT name,sql FROM sqlite_master
WHERE name IN ('editorial_candidates','news_import_version_links','idx_editorial_candidate_unindexed_url','news_import_candidate_state_guard','news_import_candidate_no_replace')
ORDER BY name LIMIT 6;

-- At most 26 rows: a lower-bound backlog probe, not an unbounded count.
SELECT id,substr(submitted_url,1,4097) AS submitted_url,length(submitted_url) AS url_length
FROM editorial_candidates INDEXED BY idx_editorial_candidate_unindexed_url
WHERE source_url_hash IS NULL AND submitted_url IS NOT NULL
 AND source_url_identity_issue IS NULL AND id>''
ORDER BY id LIMIT 26;

SELECT id,name,url,feed_url FROM sources WHERE id IN (7,20) ORDER BY id LIMIT 3;

SELECT package_id,bundle_hash,payload_hash,receipt_json,imported_by,request_id
FROM news_import_packages WHERE package_id='TRACE-NEWS-P3-000002'
 AND bundle_hash='eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48';

SELECT v.version_id,v.candidate_id,v.source_key,v.source_hash,v.content_hash,
 p.review_state,p.revision,c.state,e.operator_email,e.operator_role,e.action
FROM news_import_packages k JOIN news_import_deliveries d ON d.package_id=k.package_id
JOIN news_import_versions v ON v.version_id=d.version_id
JOIN news_import_proposals p ON p.version_id=v.version_id
JOIN editorial_candidates c ON c.id=v.candidate_id
JOIN news_import_events e ON e.version_id=v.version_id
WHERE k.package_id='TRACE-NEWS-P3-000002'
 AND k.bundle_hash='eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48'
ORDER BY v.version_id,e.event_id LIMIT 7;

SELECT l.version_id,l.related_version_id,l.relationship
FROM news_import_version_links l
WHERE l.version_id IN ('03ef696e13658f3105f4ba667396185a70156e7961a9b2acd7d29963affa123b','b7ca81567311387d356e109bc3527d1a5900d72605b4eec63d557bd55e65360c','7e075fc69d4741c32809952cc483b330b53b3e26c2d5579b02222137b04696f8')
ORDER BY l.version_id,l.related_version_id LIMIT 61;

-- Compare this scoped snapshot before/after import; no global feed/cluster scan.
WITH approved_hashes(url_hash) AS (VALUES
 ('36a7e1c23fbbe3b1fdc0232b25eb31c8ef9c6f6d877b564ab04d74596d0b22c4'),
 ('8f8c726fbdb30a61c539a826b3f2c20aa1af7074558cd7c31eba67c89b69ee35'),
 ('08cebc8f97d4c11cb0c2601762467e3a67f16f7ef81017a5818f1ffeb9d0ed52'))
SELECT f.id,f.source_id,f.url_hash,m.cluster_id,s.publication_status
FROM approved_hashes h JOIN feed_items f ON f.url_hash=h.url_hash
LEFT JOIN story_cluster_members m ON m.feed_item_id=f.id
LEFT JOIN story_clusters s ON s.id=m.cluster_id
ORDER BY f.id,m.cluster_id LIMIT 16;

SELECT event_id,operator_email,operator_role,action,target_id,outcome,detail_code
FROM admin_audit_log WHERE event_id IN (
 'eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48:03ef696e13658f3105f4ba667396185a70156e7961a9b2acd7d29963affa123b',
 'eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48:b7ca81567311387d356e109bc3527d1a5900d72605b4eec63d557bd55e65360c',
 'eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48:7e075fc69d4741c32809952cc483b330b53b3e26c2d5579b02222137b04696f8') ORDER BY event_id;
