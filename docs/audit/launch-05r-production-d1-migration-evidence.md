# LAUNCH-05R Production D1 Migration Evidence

**Date:** 17 July 2026  
**Scope:** Approved production D1 compatibility, stabilisation, and TRACE Desk schema work only. No Pages or Worker deployment was performed in this activity.

## Approval and recovery point

- The named operator explicitly approved the production backup, read-only inspection, forward repair, and migration sequence in the same maintenance window.
- External export: `trace-manifest-db-before-20260717-221155.sql`, held outside the repository.
- Export size: `2,192,277` bytes.
- SHA-256: `E0E50B40122D237EA6E5716E54A2884C395C228BC11399EF951B2BC139CB4860`.
- Pre-migration D1 Time Travel bookmark: `0000019c-00000000-000050ab-ef36ea41ffed0b7d4786bbf97928adb8`.
- No export URL or secret value is recorded here.

## Live schema decision

The initial stabilisation file failed atomically because production had an older claims/evidence schema. Read-only inspection then established that:

- publication fields were already present;
- the durable-control and TRACE Desk tables were absent;
- `claims.claim_type` and `claim_evidence.evidence_type` remained required legacy fields;
- modern claims/evidence, catalogue, correction, conflict, and pipeline fields were absent; and
- none of the failed stabilisation statements had committed.

The production-shaped local migration test was extended and passed before each new forward migration was applied.

## Applied files

Applied once, in this order, to `trace-manifest-db`:

1. `db/migration-production-legacy-claims-compatibility.sql` — success; 25 statements.
2. `db/migration-production-legacy-catalogue-compatibility.sql` — success; 21 statements.
3. `db/migration-stabilisation-security.sql` — success; 54 statements.
4. `db/migration-0015-editorial-desk.sql` — success; 10 statements.

The forward repairs are additive. Historical claims are retained with `legacy_unclassified`/`unrated` metadata if present; Ask TRACE excludes that class. Legacy corrections default non-public. No full schema, publication, knowledge, or language migration was applied.

## Verification

- All 12 requested durable-control and TRACE Desk tables exist.
- `ingestion_jobs` has `result_status`, `items_rejected`, `items_skipped`, and `outcome_detail`.
- `cron_runs` has `items_failed`, `items_rejected`, `items_skipped`, and `outcome_detail`.
- `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows.
- Baseline content was preserved: `970` feed items and `241` story clusters before and after.
- Sources changed from `64` to `73`, exactly the nine approved discovery sources.
- Seven editorial sections exist; there are zero production editorial candidates.
- `ai_requests` and `admin_audit_log` both contain zero rows; no AI request, audit action, publication, or manual Desk intake was performed.

## Scheduler and deployment boundary

Existing historical cron-run rows were recorded as `running` without completion timestamps, so they cannot prove scheduler completion. No ingestion was triggered by this maintenance activity. The subsequent controlled deployment and anonymous smoke checks are recorded separately in [LAUNCH-05R Production Deployment Evidence](launch-05r-production-deployment-evidence.md).
