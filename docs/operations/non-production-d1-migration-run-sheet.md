# Non-Production D1 Migration Run Sheet

Status: prepared for LAUNCH-03. This document is a run sheet only. It does not grant approval to apply a migration to production.

## Scope

Use this run sheet to apply and verify the current repository schema against a non-production Cloudflare D1 database.

The goal is to prove the migration order, backup discipline, verification queries, failure behavior, and evidence capture before any production migration is scheduled.

Do not use this run sheet against the production database unless a later human launch or migration approval explicitly says so.

## Governing rules

- ADR 0012 requires D1-owned durable controls for AI request state, quota, budget reservations, usage settlement, circuit state, admin nonces, audit logs, publication gates, and grounded Ask TRACE.
- ADR 0012 also keeps production AI disabled until migrations, Access, origins, provider checks, abuse controls, CI, evaluations, and deployment tests pass.
- ADR 0006 treats D1 as the MVP data store, while preserving migration discipline and a future PostgreSQL path if D1 becomes a constraint.
- `DEPLOYMENT.md` requires a backup/export before existing-database migration and warns that the stabilisation migration contains one-time `ALTER TABLE` statements.
- Raw ingestion is not publication. Publication rows must remain fail-closed until reviewed/published fields and eligible evidence are present.

## Human approval points

Human approval is required before:

1. Creating or changing any Cloudflare database binding.
2. Applying SQL to a remote non-production D1 database.
3. Running any command against the production database.
4. Restoring from an export or Time Travel point.
5. Enabling `TRACE_AI_PUBLIC_ENABLED`, `TRACE_AI_EDITORIAL_ENABLED`, or `TRACE_AI_SCHEDULED_ENABLED`.

Stop after non-production verification and record the result. Do not schedule production in the same work unit.

## Required inputs

Record these before running any remote command:

```text
Operator:
Date/time:
Git commit:
Wrangler version:
Cloudflare account:
Non-production database name:
Non-production database ID:
Pages environment using this database:
Worker environment using this database:
Production database name and ID, for comparison only:
```

The non-production database name must not equal the production database name in `wrangler.toml`.

## Current preview database packet

Use this packet for the currently confirmed empty non-production D1 database:

```text
Non-production database name: trace-manifest-db-preview
Non-production database ID: f312f662-2252-4005-8103-1a40d546e16b
Initial observed state: 0 tables, 0 queries, 0 rows read, 0 rows written, 12.29 kB storage
Production database name, do not use for this task: trace-manifest-db
Production database ID, do not use for this task: 1625036a-ffe2-4103-bf9d-086bae150561
```

Run these commands from the desktop checkout, where Wrangler is authenticated and the disk is not constrained:

```powershell
$Db = "trace-manifest-db-preview"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force "$env:USERPROFILE\TraceManifestD1Backups"

npx wrangler d1 export $Db --remote --output "$env:USERPROFILE\TraceManifestD1Backups\$Db-before-$Stamp.sql"

npx wrangler d1 execute $Db --remote --file=db/schema.sql
npx wrangler d1 execute $Db --remote --file=db/migration-5e-publication.sql
npx wrangler d1 execute $Db --remote --file=db/migration-stabilisation-security.sql
```

Then run the minimum verification packet:

```powershell
npx wrangler d1 execute $Db --remote --command "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type='table';"
npx wrangler d1 execute $Db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_requests','ai_budget_reservations','ai_usage_ledger','ai_quota_usage','ai_concurrency_leases','ai_circuit_breakers','admin_request_nonces','admin_audit_log') ORDER BY name;"
npx wrangler d1 execute $Db --remote --command "PRAGMA quick_check;"
npx wrangler d1 execute $Db --remote --command "PRAGMA foreign_key_check;"
```

Expected result:

- the export command writes a SQL backup outside the repository;
- the migration commands complete without errors;
- the table-count query returns a non-zero count;
- all eight durable control tables are listed;
- `PRAGMA quick_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no rows.

Copy the command outputs into the LAUNCH-04 evidence note. Stop at the first error and do not retry the full migration file until the schema state is inspected.

## Preflight checks

Run these from a clean desktop checkout, not from a constrained laptop:

```powershell
git status --short --branch
git rev-parse HEAD
node --version
npm.cmd ci
npm.cmd run test:migrations
npm.cmd run test:security
```

Expected preflight result:

- clean working tree;
- Node 24;
- migration validation passes locally;
- security boundary checks pass;
- no production secret is printed or committed.

If any preflight command fails, stop. Do not apply the migration.

## Backup and recovery capture

Before applying SQL to an existing non-production D1 database, capture an export:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\TraceManifestD1Backups"
npx wrangler d1 export NON_PROD_DB_NAME --remote --output "$env:USERPROFILE\TraceManifestD1Backups\NON_PROD_DB_NAME-before-YYYYMMDD-HHMMSS.sql"
```

Cloudflare's D1 Wrangler command reference documents `d1 export` for exporting a database as a SQL file and `d1 execute` for running SQL files:

```text
https://developers.cloudflare.com/d1/wrangler-commands/
```

Also capture Time Travel information if available for the database:

```powershell
npx wrangler d1 time-travel info NON_PROD_DB_NAME
```

Store the export path, size, timestamp, and command output in the migration evidence note. Do not commit backup files or place them inside the repository.

If the export fails, stop. Do not apply SQL.

## Existing database inspection

For an existing non-production database, inspect current schema state before choosing which SQL files to run.

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(story_clusters);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(ingestion_jobs);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(models);"
```

Stop if the schema is partly migrated in a way not covered by the repository SQL files. Do not rerun a full migration file merely to see what happens.

## Migration order

For a new empty non-production D1 database, apply in this order:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --file=db/schema.sql
npx wrangler d1 execute NON_PROD_DB_NAME --remote --file=db/migration-5e-publication.sql
npx wrangler d1 execute NON_PROD_DB_NAME --remote --file=db/migration-stabilisation-security.sql
```

For an existing non-production D1 database:

1. Confirm whether `story_clusters.slug`, `story_clusters.publication_status`, and `published_briefings` already exist before considering `db/migration-5e-publication.sql`.
2. Confirm whether `ingestion_jobs.result_status`, `cron_runs.items_failed`, `ai_requests`, `admin_request_nonces`, `admin_audit_log`, and catalogue `publication_status` columns already exist before considering `db/migration-stabilisation-security.sql`.
3. Apply only the missing migration step once.
4. If a migration statement fails, stop and inspect the schema. Do not replay the full file until the failure mode is understood.

## Required verification queries

After applying SQL to non-production, run these checks.

Required control tables:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_requests','ai_budget_reservations','ai_usage_ledger','ai_quota_usage','ai_concurrency_leases','ai_circuit_breakers','admin_request_nonces','admin_audit_log') ORDER BY name;"
```

Required ingestion outcome columns:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(ingestion_jobs);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(cron_runs);"
```

Required publication columns:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(story_clusters);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(models);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(providers);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(benchmarks);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(benchmark_runs);"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA table_info(provider_models);"
```

Draft-default proof for catalogue rows:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "SELECT publication_status, COUNT(*) AS count FROM models GROUP BY publication_status;"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "SELECT publication_status, COUNT(*) AS count FROM providers GROUP BY publication_status;"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "SELECT publication_status, COUNT(*) AS count FROM benchmarks GROUP BY publication_status;"
```

Public-story fail-closed proof:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "SELECT publication_status, evidence_status, COUNT(*) AS count FROM story_clusters GROUP BY publication_status, evidence_status ORDER BY publication_status, evidence_status;"
```

Integrity checks:

```powershell
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA quick_check;"
npx wrangler d1 execute NON_PROD_DB_NAME --remote --command "PRAGMA foreign_key_check;"
```

Expected verification result:

- all ADR 0012 durable control tables exist;
- ingestion and cron outcome columns exist;
- publication status and reviewer columns exist on catalogue tables;
- existing catalogue rows are `draft` unless deliberately reviewed later;
- story/publication rows are not silently made public;
- `PRAGMA quick_check` returns `ok`;
- `PRAGMA foreign_key_check` returns no rows.

## Deployment smoke checks against non-production

After the database schema is verified and a non-production Pages/Worker environment is bound to it, run smoke checks without enabling public AI:

- anonymous users cannot access `/admin` or `/api/admin/*`;
- reader role can read admin data but receives `403` for mutations;
- publisher role can perform one bounded reviewed mutation in non-production;
- both allowed and outcome audit rows exist for the publisher action;
- replaying the same signed internal request is rejected;
- public routes show only reviewed/published rows or truthful empty states;
- unsupported connectors produce `unsupported` or skipped outcomes, not success;
- Ask TRACE remains disabled and makes no provider call.

## Rollback limits

Rollback is limited.

- Do not attempt ad-hoc column removal in D1.
- Do not delete audit, usage, quota, nonce, correction, or publication-history rows to make a state appear clean.
- Prefer a forward repair migration for schema problems.
- Restore from the pre-migration export only after accepting the recovery point and data-loss implications.
- If partial migration is suspected, stop scheduled jobs and admin mutations before further writes.
- Production rollback remains a separate approval and must start by keeping public AI disabled.

## Evidence to capture

Attach or paste the following into the migration evidence note:

```text
Git commit:
Wrangler version:
Database name and ID:
Backup/export path:
Backup/export timestamp:
Schema inspection summary:
Applied SQL files:
Verification query results:
Smoke-check results:
Failures or skipped checks:
Human approval decision:
```

## Completion condition

LAUNCH-03 is complete when this run sheet exists and is reviewed.

LAUNCH-04 may begin only after explicit human approval to apply migrations in non-production.
