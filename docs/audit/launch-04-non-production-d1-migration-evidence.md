# LAUNCH-04 Non-Production D1 Migration Evidence

Status: schema migration and database verification complete in non-production. Deployment smoke checks remain blocked by LAUNCH-05R because no Pages/Worker preview binding or Access configuration has been evidenced. No production database, secret, AI flag, Pages deployment, or Worker deployment was changed.

Task: LAUNCH-04 - Apply and verify migrations in non-production only after explicit approval.

## Approval and target

- Human approval to begin LAUNCH-04 was received on 15 July 2026.
- Git commit before the remote action: `e97dc94495a1e7e63d764a9490843c4794d1ae14`.
- Node: `v24.12.0`.
- Wrangler: `4.110.0`.
- Target: `trace-manifest-db-preview` (`f312f662-2252-4005-8103-1a40d546e16b`), in WEUR.
- Production comparison target was not queried or changed: `trace-manifest-db`.
- Wrangler confirmed the preview target was initially empty: 0 tables, 0 reads, and 0 writes in the preceding 24 hours.
- Preflight passed: clean working tree; `npm run test:migrations`; `npm run test:security`.

## Backup and recovery capture

- Export completed before SQL was applied.
- Backup location: `C:\Users\USER\TraceManifestD1Backups\trace-manifest-db-preview-before-20260715-224159.sql`.
- Backup size: 32 bytes, appropriate for the confirmed empty database.
- Time Travel bookmark captured before migration: `00000001-00000000-000050a9-eb1c929302605c96e4648015ef239080`.

The export was stored outside the repository. Wrangler displayed a temporary signed download URL during export; it is intentionally not copied into this record.

## Applied SQL, in order

| File | Result |
|---|---|
| `db/schema.sql` | Success: 74 statements; 121 rows read; 114 rows written; reported 28 tables. |
| `db/migration-5e-publication.sql` | Success: 16 statements; 551 rows read; 15 rows written; reported 29 tables. Wrangler reported only a trailing SQL-comment buffer after import. |
| `db/migration-stabilisation-security.sql` | Success: 54 statements; 2,775 rows read; 70 rows written; reported 37 tables. |

No migration file was retried. Each next file ran only after the preceding command reported success.

## Verification results

- `sqlite_master` table count: 39. This is a raw schema count and differs from the migration command's reported application-table count.
- All ADR 0012 durable-control tables are present: `ai_requests`, `ai_budget_reservations`, `ai_usage_ledger`, `ai_quota_usage`, `ai_concurrency_leases`, `ai_circuit_breakers`, `admin_request_nonces`, and `admin_audit_log`.
- `ingestion_jobs` includes `result_status`, `items_rejected`, `items_skipped`, and `outcome_detail`; `cron_runs` includes `items_failed`, `items_rejected`, `items_skipped`, and `outcome_detail`.
- `story_clusters`, `models`, `providers`, `benchmarks`, `benchmark_runs`, and `provider_models` expose the required publication/reviewer columns, with catalogue and story publication defaults set to `draft`.
- Grouped publication-state queries for models, providers, benchmarks, and story clusters returned no rows because this preview database contains no editorial records. No record was silently published.
- `PRAGMA foreign_key_check` succeeded and returned no rows.
- `PRAGMA integrity_check` was rejected by Cloudflare D1 as `SQLITE_AUTH` (code 7500). Cloudflare documents `PRAGMA quick_check` as the supported equivalent; the replacement command succeeded and returned `ok`. The run sheet has been corrected accordingly.

## Deferred smoke checks and next boundary

The following are not complete and must not be inferred from schema success: Access role tests, Pages-to-Worker signed-request tests, audit-row tests, public-route behaviour through a bound preview Pages deployment, and authenticated Ask TRACE evaluation. They depend on LAUNCH-05R configuring and evidencing the preview control plane while keeping all AI flags disabled.

This completes the D1-only portion of LAUNCH-04. It does not schedule or authorise production migration, deployment, secret changes, or public AI enablement.
