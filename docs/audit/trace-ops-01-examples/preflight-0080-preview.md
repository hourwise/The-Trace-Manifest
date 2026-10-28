> Real local preflight run (no remote access) on 2026-10-28. For 0080 the file was read from Codex's candidate 2ad59cc and is being revised in P4-R2.

# Migration preflight: PASS

PASS: all 17 mandatory checks passed. 1 optional check(s) were not verified (target.remote_identity); they are outside this run's mandatory scope.

- **Environment:** preview
- **Database:** trace-manifest-db-preview (`f312f662-2252-4005-8103-1a40d546e16b`)
- **Migration:** `db/migration-0080-local-news-import.sql` (31 statements), SHA-256 `7cff2245bb2f59d9792123c58a4ae8429af889a07628f24efd29f58cb4b3c0dc`
- **Remote actions performed:** 0
- **Approval on the execution manifest:** none (null); this plan is not approved

## Checks

| Check | Status | Result |
|---|---|---|
| `manifest.valid` | **PASS** | environment preview, database trace-manifest-db-preview, migration db/migration-0080-local-news-import.sql |
| `target.identity` | **PASS** | preview binding DB is trace-manifest-db-preview (f312f662-2252-4005-8103-1a40d546e16b) in wrangler.toml |
| `target.remote_identity` | **NOT_VERIFIED** | the live database identity is checked by plan step 1, by a person, before applying |
| `migration.sha256` | **PASS** | exact bytes match 7cff2245bb2f59d9792123c58a4ae8429af889a07628f24efd29f58cb4b3c0dc |
| `migration.reserved` | **PASS** | 0080 is not a reserved number (0072 stays protected) |
| `migration.allocation` | **PASS** | number 0080 is used only by db/migration-0080-local-news-import.sql (5 ref(s), 2 distinct version(s) of the file) |
| `migration.ordering` | **PASS** | 0080 follows the highest migration on refs/remotes/origin/main (0077) |
| `migration.prerequisites` | **PASS** | 1 prerequisite(s) present and earlier |
| `schema.d1_compatibility` | **PASS** | 31 statements; no transaction control, PRAGMA, ATTACH or VACUUM |
| `schema.additive` | **PASS** | all statements are additive |
| `schema.conflicts` | **PASS** | no created object collides with the current schema |
| `schema.apply` | **PASS** | applied all 31 statements to the current schema with representative data |
| `schema.expected_objects` | **PASS** | all 31 declared objects exist; nothing undeclared was created |
| `schema.integrity` | **PASS** | foreign_key_check 0 violation(s); integrity_check ok |
| `schema.data_preservation` | **PASS** | 117 existing tables keep identical rows in their original columns (44 rows) |
| `schema.reapply` | **PASS** | a second application stops at #1 (duplicate column name: source_url_hash); plan step 2 must show it is not yet applied |
| `schema.interruption` | **PASS** | if interrupted, a full re-run fails at 30 of 30 points; running only the remaining statements completes it at every point |
| `postflight.local` | **PASS** | the not-applied check returns 0 rows before and the objects check 31 after (31 must be absent beforehand); 3 extra postflight queries behave as declared |

## Plan (for a person to run after separate approval)

1. **Verify the target database identity**

```bash
npx wrangler d1 info trace-manifest-db-preview
```

   Expect: database_id equals f312f662-2252-4005-8103-1a40d546e16b; otherwise STOP

2. **Confirm the migration is not already applied**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 'table' AS kind, name FROM sqlite_master WHERE type='table' AND name IN ('news_import_deliveries', 'news_import_events', 'news_import_packages', 'news_import_proposals', 'news_import_versions') UNION ALL SELECT 'index' AS kind, name FROM sqlite_master WHERE type='index' AND name IN ('idx_editorial_candidate_unindexed_url', 'idx_editorial_candidate_url_hash', 'news_import_events_version', 'news_import_proposals_review', 'news_import_versions_candidate', 'news_import_versions_url') UNION ALL SELECT 'trigger' AS kind, name FROM sqlite_master WHERE type='trigger' AND name IN ('news_import_candidate_state_guard', 'news_import_deliveries_no_delete', 'news_import_deliveries_no_replace', 'news_import_deliveries_no_update', 'news_import_events_no_delete', 'news_import_events_no_replace', 'news_import_events_no_update', 'news_import_package_identity', 'news_import_packages_no_delete', 'news_import_packages_no_replace', 'news_import_packages_no_update', 'news_import_proposal_initial', 'news_import_proposal_transition', 'news_import_proposals_no_delete', 'news_import_proposals_no_replace', 'news_import_resolution_owner', 'news_import_versions_no_delete', 'news_import_versions_no_replace', 'news_import_versions_no_update') UNION ALL SELECT 'column', 'editorial_candidates.' || name FROM pragma_table_info('editorial_candidates') WHERE name IN ('source_url_hash');"
```

   Expect: no rows; any row means it is (partly) applied: STOP and inspect

3. **Record a Time Travel bookmark**

```bash
npx wrangler d1 time-travel info trace-manifest-db-preview --json
```

   Expect: record the bookmark in the receipt; it is for a separately approved last-resort restore only

4. **Record baseline counts and the release snapshot**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT (SELECT COUNT(*) FROM story_clusters) AS story_clusters, (SELECT COUNT(*) FROM story_cluster_members) AS story_cluster_members, (SELECT COUNT(*) FROM feed_items) AS feed_items, (SELECT COUNT(*) FROM editorial_candidates) AS editorial_candidates, (SELECT COUNT(*) FROM admin_audit_log) AS admin_audit_log, (SELECT COUNT(*) FROM sources) AS sources;"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --file scripts/ops/release-snapshot.sql
```

   Expect: save both outputs as before-files

5. **Apply the migration (only with the owner's approval of this exact manifest)**

```bash
sha256sum db/migration-0080-local-news-import.sql
npx wrangler d1 execute trace-manifest-db-preview --remote --file db/migration-0080-local-news-import.sql
```

   Expect: sha256 7cff2245bb2f59d9792123c58a4ae8429af889a07628f24efd29f58cb4b3c0dc before applying; any error: STOP and use the recovery notes

   Recovery if interrupted:
   - interrupted after #1: run statements #2-#31
   - interrupted after #2: run statements #3-#31
   - interrupted after #3: run statements #4-#31
   - interrupted after #4: run statements #5-#31
   - interrupted after #5: run statements #6-#31
   - interrupted after #6: run statements #7-#31
   - interrupted after #7: run statements #8-#31
   - interrupted after #8: run statements #9-#31
   - interrupted after #9: run statements #10-#31
   - interrupted after #10: run statements #11-#31
   - interrupted after #11: run statements #12-#31
   - interrupted after #12: run statements #13-#31
   - interrupted after #13: run statements #14-#31
   - interrupted after #14: run statements #15-#31
   - interrupted after #15: run statements #16-#31
   - interrupted after #16: run statements #17-#31
   - interrupted after #17: run statements #18-#31
   - interrupted after #18: run statements #19-#31
   - interrupted after #19: run statements #20-#31
   - interrupted after #20: run statements #21-#31
   - interrupted after #21: run statements #22-#31
   - interrupted after #22: run statements #23-#31
   - interrupted after #23: run statements #24-#31
   - interrupted after #24: run statements #25-#31
   - interrupted after #25: run statements #26-#31
   - interrupted after #26: run statements #27-#31
   - interrupted after #27: run statements #28-#31
   - interrupted after #28: run statements #29-#31
   - interrupted after #29: run statements #30-#31
   - interrupted after #30: run statements #31-#31

6. **Check the resulting schema**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 'table' AS kind, name FROM sqlite_master WHERE type='table' AND name IN ('news_import_deliveries', 'news_import_events', 'news_import_packages', 'news_import_proposals', 'news_import_versions') UNION ALL SELECT 'index' AS kind, name FROM sqlite_master WHERE type='index' AND name IN ('idx_editorial_candidate_unindexed_url', 'idx_editorial_candidate_url_hash', 'news_import_events_version', 'news_import_proposals_review', 'news_import_versions_candidate', 'news_import_versions_url') UNION ALL SELECT 'trigger' AS kind, name FROM sqlite_master WHERE type='trigger' AND name IN ('news_import_candidate_state_guard', 'news_import_deliveries_no_delete', 'news_import_deliveries_no_replace', 'news_import_deliveries_no_update', 'news_import_events_no_delete', 'news_import_events_no_replace', 'news_import_events_no_update', 'news_import_package_identity', 'news_import_packages_no_delete', 'news_import_packages_no_replace', 'news_import_packages_no_update', 'news_import_proposal_initial', 'news_import_proposal_transition', 'news_import_proposals_no_delete', 'news_import_proposals_no_replace', 'news_import_resolution_owner', 'news_import_versions_no_delete', 'news_import_versions_no_replace', 'news_import_versions_no_update') UNION ALL SELECT 'column', 'editorial_candidates.' || name FROM pragma_table_info('editorial_candidates') WHERE name IN ('source_url_hash');"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 1 FROM news_import_packages UNION ALL SELECT 1 FROM news_import_versions UNION ALL SELECT 1 FROM news_import_proposals LIMIT 1"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 1 FROM editorial_candidates WHERE source_url_hash IS NOT NULL LIMIT 1"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT COUNT(*) AS unhashed_url_candidates FROM editorial_candidates WHERE source_url_hash IS NULL AND submitted_url IS NOT NULL"
```

   Expect: 31 object rows; postflight queries as declared

7. **Verify data preservation**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT (SELECT COUNT(*) FROM story_clusters) AS story_clusters, (SELECT COUNT(*) FROM story_cluster_members) AS story_cluster_members, (SELECT COUNT(*) FROM feed_items) AS feed_items, (SELECT COUNT(*) FROM editorial_candidates) AS editorial_candidates, (SELECT COUNT(*) FROM admin_audit_log) AS admin_audit_log, (SELECT COUNT(*) FROM sources) AS sources;"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "PRAGMA foreign_key_check;"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --file scripts/ops/release-snapshot.sql
```

   Expect: counts identical to step 4; no foreign-key rows (PRAGMA quick_check fails with SQLITE_NOMEM on D1; do not use it); compare snapshots with release-verify.mjs

8. **Record the postflight receipt**

```bash
node scripts/ops/release-verify.mjs --manifest <release manifest> --offline --before before.json --after after.json
```

   Expect: attach outputs, bookmark and approval to the execution manifest

A whole-database Time Travel restore (wrangler d1 time-travel restore) can erase unrelated writes made after the bookmark. It is never part of this plan and needs its own owner approval.
