> Real local preflight run (no remote access) on 2026-10-28. For 0080 the file was read from Codex's candidate 2ad59cc and is being revised in P4-R2.

# Migration preflight: PASS

PASS: all 17 mandatory checks passed. 1 optional check(s) were not verified (target.remote_identity); they are outside this run's mandatory scope.

- **Environment:** preview
- **Database:** trace-manifest-db-preview (`f312f662-2252-4005-8103-1a40d546e16b`)
- **Migration:** `db/migration-0078-newsletter-subscriptions.sql` (6 statements), SHA-256 `57f990622190f3463df2f9aacd7cfc5d7867cc095f3dcf5f8d1fedd10d968799`
- **Remote actions performed:** 0
- **Approval on the execution manifest:** none (null); this plan is not approved

## Checks

| Check | Status | Result |
|---|---|---|
| `manifest.valid` | **PASS** | environment preview, database trace-manifest-db-preview, migration db/migration-0078-newsletter-subscriptions.sql |
| `target.identity` | **PASS** | preview binding DB is trace-manifest-db-preview (f312f662-2252-4005-8103-1a40d546e16b) in wrangler.toml |
| `target.remote_identity` | **NOT_VERIFIED** | the live database identity is checked by plan step 1, by a person, before applying |
| `migration.sha256` | **PASS** | exact bytes match 57f990622190f3463df2f9aacd7cfc5d7867cc095f3dcf5f8d1fedd10d968799 |
| `migration.reserved` | **PASS** | 0078 is not a reserved number (0072 stays protected) |
| `migration.allocation` | **PASS** | number 0078 is used only by db/migration-0078-newsletter-subscriptions.sql (6 ref(s), 1 distinct version(s) of the file) |
| `migration.ordering` | **PASS** | 0078 follows the highest migration on refs/remotes/origin/main (0077) |
| `migration.prerequisites` | **PASS** | 1 prerequisite(s) present and earlier |
| `schema.d1_compatibility` | **PASS** | 6 statements; no transaction control, PRAGMA, ATTACH or VACUUM |
| `schema.additive` | **PASS** | all statements are additive |
| `schema.conflicts` | **PASS** | no created object collides with the current schema |
| `schema.apply` | **PASS** | applied all 6 statements to the current schema with representative data |
| `schema.expected_objects` | **PASS** | all 6 declared objects exist; nothing undeclared was created |
| `schema.integrity` | **PASS** | foreign_key_check 0 violation(s); integrity_check ok |
| `schema.data_preservation` | **PASS** | 117 existing tables keep identical rows in their original columns (44 rows) |
| `schema.reapply` | **PASS** | a second application is a no-op (idempotent) |
| `schema.interruption` | **PASS** | a full re-run after any interruption completes the migration |
| `postflight.local` | **PASS** | the not-applied check returns 0 rows before and the objects check 6 after (6 must be absent beforehand); 1 extra postflight queries behave as declared |

## Plan (for a person to run after separate approval)

1. **Verify the target database identity**

```bash
npx wrangler d1 info trace-manifest-db-preview
```

   Expect: database_id equals f312f662-2252-4005-8103-1a40d546e16b; otherwise STOP

2. **Confirm the migration is not already applied**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 'table' AS kind, name FROM sqlite_master WHERE type='table' AND name IN ('email_outbox', 'newsletter_signup_attempts', 'newsletter_subscribers') UNION ALL SELECT 'index' AS kind, name FROM sqlite_master WHERE type='index' AND name IN ('idx_email_outbox_due', 'idx_email_outbox_subscriber', 'idx_newsletter_subscribers_status');"
```

   Expect: no rows; any row means it is (partly) applied: STOP and inspect

3. **Record a Time Travel bookmark**

```bash
npx wrangler d1 time-travel info trace-manifest-db-preview --json
```

   Expect: record the bookmark in the receipt; it is for a separately approved last-resort restore only

4. **Record baseline counts and the release snapshot**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT (SELECT COUNT(*) FROM story_clusters) AS story_clusters, (SELECT COUNT(*) FROM story_cluster_members) AS story_cluster_members, (SELECT COUNT(*) FROM feed_items) AS feed_items, (SELECT COUNT(*) FROM editorial_candidates) AS editorial_candidates, (SELECT COUNT(*) FROM admin_audit_log) AS admin_audit_log;"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --file scripts/ops/release-snapshot.sql
```

   Expect: save both outputs as before-files

5. **Apply the migration (only with the owner's approval of this exact manifest)**

```bash
sha256sum db/migration-0078-newsletter-subscriptions.sql
npx wrangler d1 execute trace-manifest-db-preview --remote --file db/migration-0078-newsletter-subscriptions.sql
```

   Expect: sha256 57f990622190f3463df2f9aacd7cfc5d7867cc095f3dcf5f8d1fedd10d968799 before applying; any error: STOP and use the recovery notes

   Recovery if interrupted:
   - a full re-run completes the migration

6. **Check the resulting schema**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 'table' AS kind, name FROM sqlite_master WHERE type='table' AND name IN ('email_outbox', 'newsletter_signup_attempts', 'newsletter_subscribers') UNION ALL SELECT 'index' AS kind, name FROM sqlite_master WHERE type='index' AND name IN ('idx_email_outbox_due', 'idx_email_outbox_subscriber', 'idx_newsletter_subscribers_status');"
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT 1 FROM newsletter_subscribers UNION ALL SELECT 1 FROM email_outbox UNION ALL SELECT 1 FROM newsletter_signup_attempts LIMIT 1"
```

   Expect: 6 object rows; postflight queries as declared

7. **Verify data preservation**

```bash
npx wrangler d1 execute trace-manifest-db-preview --remote --json --command "SELECT (SELECT COUNT(*) FROM story_clusters) AS story_clusters, (SELECT COUNT(*) FROM story_cluster_members) AS story_cluster_members, (SELECT COUNT(*) FROM feed_items) AS feed_items, (SELECT COUNT(*) FROM editorial_candidates) AS editorial_candidates, (SELECT COUNT(*) FROM admin_audit_log) AS admin_audit_log;"
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
