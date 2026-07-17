# Production Stabilisation Release Plan

**Status:** Production D1 migration completed on 17 July 2026; application deployment and no-write smoke checks remain pending.

**Scope:** The remaining production work in LAUNCH-05R: preserve the existing D1 data, apply only confirmed missing durable-control and TRACE Desk schema changes, deploy the already tested control-plane code from `main`, and perform read-only or fail-closed smoke checks.

**Out of scope:** Public AI, provider calls, automatic publication, ingestion runs, production Desk intake, production story publication, deletion of `ADMIN_API_TOKEN`, destructive rollback, and any secret value handling in chat or Git.

## 1. Why this requires a dedicated plan

The production D1 inspection on 16 July 2026 found publication fields but not the ADR 0012 durable-control tables or the stabilisation outcome columns. A further approved inspection on 17 July found an older `claims`/`claim_evidence` compatibility layer beneath those publication fields. It is therefore an **existing, partially migrated database**. Running `schema.sql`, `migration-5e-publication.sql`, or any full migration bundle blindly is prohibited.

The isolated Preview environment has now proved the following without touching production:

- Cloudflare Access and server-side role mapping;
- Pages binding to Preview D1;
- signed Pages-to-Worker requests, nonce replay rejection, and audit outcomes;
- publisher-only TRACE Desk intake, with no fetch or publication; and
- all AI flags disabled and no Preview cron trigger.

Production still needs its own backup, schema confirmation, migration, deployment, and smoke evidence. Preview evidence does not substitute for those steps.

## 2. Human approvals required before execution

Do not start a production command until one named operator explicitly approves all of the following in the same maintenance window:

1. a production D1 export and Time Travel bookmark capture;
2. read-only schema inspection of `trace-manifest-db`;
3. applying only the migration files selected by the decision gate in section 5;
4. merging the reviewed Preview branch into `main`, allowing the resulting Pages production deployment, and deploying the production Worker from that same `main` commit;
5. the limited production smoke checks in section 8; and
6. the rollback and stop conditions in section 9.

This is deliberately narrower than “launch approval.” It does not enable AI, publication, or scheduled ingestion changes.

## 3. Preconditions and no-go conditions

All conditions must be true before the maintenance window begins:

- The reviewed source commit is merged to `main`; do not deploy a local-only or Preview-only commit to production.
- CI is green on the exact `main` commit: `npm run ci` or the documented equivalent is successful.
- Pages production settings retain `TRACE_ENVIRONMENT=production`, `TRACE_ALLOWED_ORIGINS=https://thetracemanifest.com`, and all `TRACE_AI_*` flags set to `false`.
- Pages production has the `DB` binding declared under `[[env.production.d1_databases]]`, targeting only `trace-manifest-db`.
- Production Worker binding comparison confirms `DB -> trace-manifest-db` and `RAW_STORE -> trace-manifest-raw` before deployment.
- Production Pages has the existing Access team domain, Access AUD allowlist, reader allowlist, publisher allowlist, and internal service secret. Record presence only, never values.
- The production Access applications cover `/admin*` and `/api/admin/*`, retain a narrow Allow policy, and use the intended One-time PIN login method.
- A second, temporary **reader-only** Access identity is available for LAUNCH-06. It must appear in `TRACE_ADMIN_READERS` but not `TRACE_ADMIN_PUBLISHERS`; a publisher identity cannot prove reader denial.
- A maintenance window avoids the production Worker cron schedule, or its triggers are deliberately paused by a separately approved operational action. Do not let ingestion run while the schema is in an unknown intermediate state.

Stop immediately if any prerequisite is missing, contradictory, or cannot be evidenced without exposing a secret.

## 4. Capture before making any D1 change

Run only after the approvals in section 2. Store exports outside the repository and never commit them.

```powershell
$Db = "trace-manifest-db"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $env:USERPROFILE "TraceManifestD1Backups"
New-Item -ItemType Directory -Force $BackupRoot

npx wrangler d1 export $Db --remote --output "$BackupRoot\$Db-before-$Stamp.sql"
npx wrangler d1 time-travel info $Db --json
```

Record the export path, size, SHA-256 checksum, timestamp, and the returned Time Travel bookmark in a production evidence note. If the export or bookmark command fails, stop; do not apply SQL.

Capture read-only baseline counts before migration:

```powershell
npx wrangler d1 execute $Db --remote --command "SELECT 'sources' AS name, COUNT(*) AS count FROM sources UNION ALL SELECT 'feed_items', COUNT(*) FROM feed_items UNION ALL SELECT 'story_clusters', COUNT(*) FROM story_clusters"
npx wrangler d1 execute $Db --remote --command "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
npx wrangler d1 execute $Db --remote --command "PRAGMA table_info('ingestion_jobs'); PRAGMA table_info('cron_runs');"
```

## 5. Schema decision gate

Use the output from section 4 before choosing a migration. Do not choose from assumptions or from the Preview schema.

| Observed production state | Permitted action | Stop condition |
|---|---|---|
| Publication schema is present; all ADR 0012 durable-control tables and stabilisation outcome columns are absent; `editorial_candidates` is absent. | Apply `db/migration-stabilisation-security.sql` once, then `db/migration-0015-editorial-desk.sql` once. | Any statement error or a column/table already partially present in an unexpected combination. |
| The specific legacy production shape found on 17 July 2026: `claims.claim_type` and `claim_evidence.evidence_type` remain required legacy columns; modern claims/evidence, correction, conflict, pipeline and catalogue tables are absent; publication fields are present. | Apply the reviewed `db/migration-production-legacy-claims-compatibility.sql` once, then `db/migration-production-legacy-catalogue-compatibility.sql` once, then `db/migration-stabilisation-security.sql` once, then `db/migration-0015-editorial-desk.sql` once. | Any column differs from this observed shape, any statement fails, or a migration targets an unapproved database. |
| Every durable-control table and stabilisation column is present, but `editorial_candidates` is absent. | Do not replay stabilisation; apply only `db/migration-0015-editorial-desk.sql` once. | The Desk migration reports an existing object or constraint conflict. |
| Durable controls and TRACE Desk schema are already complete. | Do not apply SQL; move to verification and deployment review. | Any expected table or column differs materially from the reviewed schema. |
| Any other mix, including unknown tables, partially applied `ALTER TABLE` results, or a missing base table. | Stop and produce a schema-diff note. A forward repair migration must be reviewed before any production write. | Always stop. |

`migration-5e-publication.sql` is not part of the expected production path because the earlier read-only inspection found its publication fields. `migration-0016-knowledge-builder-foundation.sql` and `migration-0017-multilingual-source-provenance.sql` are deferred: their remote application needs separate scope approval because their current tasks were foundation-only and they are not required to make the admin control plane safe.

## 6. Controlled migration sequence

After the decision gate selects a path, execute one file at a time and stop after each command if its result is not successful:

```powershell
$Db = "trace-manifest-db"

# Run only if selected by the section 5 decision gate.
npx wrangler d1 execute $Db --remote --file=db/migration-production-legacy-claims-compatibility.sql
npx wrangler d1 execute $Db --remote --file=db/migration-production-legacy-catalogue-compatibility.sql
npx wrangler d1 execute $Db --remote --file=db/migration-stabilisation-security.sql
npx wrangler d1 execute $Db --remote --file=db/migration-0015-editorial-desk.sql
```

Never rerun an entire file to “see whether it works.” Do not apply `schema.sql` to this existing database. Do not apply the deferred knowledge or language migrations in this work item.

The legacy forward repair preserves historical claim/evidence rows, assigns them `legacy_unclassified`/`unrated` metadata, and keeps corrections non-public. Ask TRACE excludes those legacy-unclassified claims. The Worker retains a narrow write fallback only for the two remaining legacy NOT NULL columns, so modern and Preview schemas continue to use their normal query shapes.

## 7. Database verification gate

Before application deployment, run read-only checks:

```powershell
$Db = "trace-manifest-db"

npx wrangler d1 execute $Db --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('ai_requests','ai_budget_reservations','ai_usage_ledger','ai_quota_usage','ai_concurrency_leases','ai_circuit_breakers','admin_request_nonces','admin_audit_log','editorial_sections','editorial_topics','editorial_candidates','editorial_candidate_evidence') ORDER BY name"
npx wrangler d1 execute $Db --remote --command "PRAGMA table_info('ingestion_jobs'); PRAGMA table_info('cron_runs');"
npx wrangler d1 execute $Db --remote --command "PRAGMA quick_check; PRAGMA foreign_key_check;"
npx wrangler d1 execute $Db --remote --command "SELECT 'sources' AS name, COUNT(*) AS count FROM sources UNION ALL SELECT 'feed_items', COUNT(*) FROM feed_items UNION ALL SELECT 'story_clusters', COUNT(*) FROM story_clusters"
```

Required result: all twelve named tables exist; expected outcome columns exist; `quick_check` returns `ok`; `foreign_key_check` returns no rows; and baseline content counts are explainable. A changed count is not automatically bad, but it must be explained before continuing.

## 8. Deployment and production smoke checks

Only after the database verification gate passes:

1. Confirm the source is the reviewed `main` commit and that its Pages production configuration selects `env.production` bindings and values.
2. In Cloudflare Pages, confirm production secrets/allowlists by **presence only**. Do not rotate or remove `ADMIN_API_TOKEN` in this work item.
3. Let the Git-connected Pages production deployment for `main` complete successfully. Confirm the deployed commit and production environment before testing.
4. From the same `main` checkout, validate then deploy the production Worker:

   ```powershell
   npx wrangler deploy --config wrangler.worker.toml --dry-run
   npx wrangler deploy --config wrangler.worker.toml
   ```

   Compare the dry-run bindings and cron schedule to the approved production configuration before the second command. Stop if it targets Preview resources or proposes an unexpected binding change.

5. Run no-write smoke checks:
   - anonymous private-browser requests to `/admin` and `/api/admin/*` are intercepted by Cloudflare Access or fail closed;
   - an approved publisher can load `/admin`, `/admin/sources`, `/admin/jobs`, and `/admin/review` without error;
   - direct unsigned requests to the production Worker `/admin/*` return `401`;
   - public routes remain reachable and no AI feature becomes available.

6. Stop before a production Desk submission, ingest, publish, archive, correction, or any other business mutation. Reader-denial and audited mutation checks belong to LAUNCH-06 and need the separate reader-only identity.

## 9. Stop and rollback rules

- **Before migration:** if the backup or schema decision gate fails, make no D1 change.
- **During migration:** stop at the first SQL error. Preserve command output and export; do not replay the file or run ad-hoc DDL.
- **After migration but before deployment:** use a reviewed forward repair migration. Do not remove columns or delete audit, nonce, quota, correction, or publication records.
- **After application deployment:** roll Pages and Worker code back to the last known good version only if needed. Keep AI disabled and do not delete database evidence.
- **Database restore:** use the captured export or D1 Time Travel only after a separate incident decision accepts the recovery point and possible data loss. It is never an automatic rollback step.

## 10. Evidence packet and completion boundary

Record only redacted facts in `docs/audit/`:

```text
Approval timestamp and operator:
Maintenance window:
Exact main commit:
Backup path, size, checksum, and Time Travel bookmark:
Schema decision selected:
Applied SQL files (or none):
Verification query summaries:
Pages production deployment ID and commit:
Worker production version ID:
Access policy/login-method confirmation (no values):
Anonymous and publisher smoke-check results:
AI flags remain false, yes/no:
Failures, skipped steps, and rollback decision:
```

LAUNCH-05R is not fully complete until the production D1 and deployment evidence is accepted. LAUNCH-06 may begin only after that acceptance. Public launch approval remains a later, separate decision.

## 11. References checked

- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Existing control-plane repair run sheet](cloudflare-control-plane-repair-run-sheet.md)
- [Deployment requirements](../../DEPLOYMENT.md)
