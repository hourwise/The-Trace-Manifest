# TRACE V1 — PRODUCTION-SCHEMA-08 reconciliation plan

Status: **planning and local rehearsal only.** No Production mutation was
performed. Every remote step in §7 requires explicit owner approval before it
runs. Observed 2026-10-22. Applies to release candidate `2d70328` (see
`trace-v1-production-readiness-07.md`).

## 1. Decisions

| Question | Decision |
| --- | --- |
| 0059/0063 versus 0070 | **Canonical route: 0059 → 0060 → 0061 → 0062 → 0063 → 0064. Do not apply 0070 to Production.** |
| Legacy table shapes | **Retain** the LAUNCH-05R legacy shapes. No table rebuild and no new migration (no 0076). |
| M2 gate on Production | Stays `FAIL_CLOSED` on `sources.ingestion_type`. Accepted for the editorial release because the M2 executor is not deployed. |
| 0072 | Excluded. The scheduler mission owns it. |

## 2. Evidence base

- **Read-only Production snapshot**, non-blocking:
  - Taken by keyset-paginated `SELECT` plus full `sqlite_master` DDL. A native
    `wrangler d1 export` was deliberately not used, because Cloudflare
    documents that "a running export will block other database requests".
  - File: `D:\Users\fleur\TraceManifestD1Backups\trace-manifest-db-production-readonly-20261022-logical.json`
  - SHA-256: `1dfd0681e76218996f99c0fcb2283990656a0b0179516b572b73943e47bc950b`
  - Contents: 89 tables, 51,583 rows. D1 rows read: 51,992.
- **Production profile at capture:**
  - 27.8 MB; 815 read queries, 119,007 rows read and 0 writes in 24h
    (ingestion paused).
  - 0 virtual tables.
  - Time Travel bookmark at planning time:
    `00003d2e-00000000-0000510c-4d8410e931130e29670517f9de668047`.
  - Production Worker version `20d789f4-1b0e-4b3c-ab9f-f691b8c258f7`
    (2026-07-21).
  - Production Pages deployment `247d3b3a` (`0351df7`).
  - Cron schedules `[]`.

## 3. Why the canonical route, not 0070

1. **0070 is a strict subset of the canonical route.**
   - Its 16 source fields are the columns 0059 and 0063 add.
   - Its `hash_semantics_version` CHECK equals the 0059 → 0061 → 0062 end state.
   - Its two data `UPDATE`s are byte-identical to 0063's.
2. **0070 cannot run on Production.** Its first statements add
   `corrections.correction_type` and `corrections.published`, which Production
   already has. The data rehearsal fails with
   `duplicate column name: correction_type`.
3. **Only the canonical route creates the objects the runtime reads:**
   `source_document_version_observations`, `source_upload_intakes`, the
   backfill hash columns, and the governed-state indexes.
4. **The canonical route rehearsed cleanly on real Production data** (§5).
   Applying 0070 after 0059/0063 would fail on duplicate columns, so the two
   routes are mutually exclusive.

The 2026-08 Mission 1 assessment marked 0059–0064 `UNSAFE_OR_AMBIGUOUS` with
applied state `UNKNOWN`. That was a catalog-only judgement made without a data
rehearsal. This plan supersedes it for these files.

## 4. Legacy shapes retained (runtime-safety evidence)

| Table | Production shape | Canonical | Candidate runtime use | Verdict |
| --- | --- | --- | --- | --- |
| `sources` | CHECK also allows `lmsys_api`; `ingestion_type` default `'manual'` | narrower CHECK, no default | Inserts always supply values from the canonical subset | Safe: Production domain is a superset |
| `ingestion_jobs` | `job_type` CHECK: fetch, classify, dedup, cluster, health_check, briefing | adds extract_claims, conflict_detection, model_data, seed_models | All writers (`createJob` via `processSource`/`ingestTier`) use `"fetch"` only | Safe |
| `claim_conflicts` | narrower `conflict_type`; no `resolved_by`/`resolved_at` | wider | Read-only; reads `claim_a_id`, `claim_b_id`, `resolution`; never mutated | Safe |
| `corrections` | no CHECK on `correction_type`; default `'other'`; missing 3 indexes | CHECK domain plus indexes | M2 classifies as `SUPPORTED_LEGACY_SHAPE`; small table | Safe |
| `claims`, `claim_evidence` | legacy columns; read-only triggers; missing 5 indexes | modern shape | Frozen after the 0043 cutover (1,159 / 377 rows); read via `legacy_claim_evidence_map` | Safe |
| `knowledge_page*` (4 tables) | absent | present | Referenced only by M2 planning modules, scripts and tests; absent from the deployed bundle | Safe |

These are the **29 accepted DDL divergences** that remain after the chain.
They are the expected post-migration fingerprint (§7.4).

**Data-hygiene note for the scheduler mission:** source 93 "LMSYS Chatbot
Arena" (`lmsys_api`) is `active=1`. The M2 contract treats `lmsys_api` as
unsupported, which is the sole reason the M2 gate fails closed. Deactivate it,
or decide otherwise, before any M2 activation or ingestion resumption.

## 5. Data-level rehearsal (restored Production snapshot)

Chain applied in order: 0050, 0051, 0052, 0053, 0054, 0055, 0056, 0057, 0058,
0059, 0060, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069 (no-op),
0071, 0073, 0074, 0075.

- Every file applies. `integrity_check` is `ok` and `foreign_key_check` is
  clean both before and after.
- **All 51,583 pre-existing rows and every original column are identical**
  after the chain, including the tables rebuilt by 0061, 0062, 0064 and 0074.
- 0063 mapping: all 33 versions become `metadata_only` / `metadata_only`,
  hash `legacy_raw_v1`; all 33 documents become `capture_state=metadata_only`.
- All 417 assertions keep their axes and get governance revision 0. The
  breakdown is 210 admitted/accepted, 40 pending/proposed/current and 167
  pending/proposed/unknown.
- Logical row changes total about 20,525:
  - 0050: 20,327 (`knowledge_search_records` backfill of 3,984 rows plus FTS
    index rows);
  - 0061, 0062 and 0063: 66 each;
  - all other files: 0.
  D1 billed `rows_written` will be higher because of index maintenance.
- After 0050, `wrangler d1 export` no longer works on Production (FTS5).

## 6. Runtime smoke on the rehearsed data

The candidate's real server modules ran against a copy of the rehearsed
database, through a D1-faithful adapter (trigger rows counted in
`meta.changes`):

- public stories: 20;
- Review Queue publishable 200 and pending-review 50 (both at their caps);
- cluster evidence;
- admit → exact replay (same event) → reviewer accept;
- history: 2 events; both recalculation jobs `completed`;
- governed extraction run `completed` (0 selected because ingestion is
  paused), ledger reconciled;
- integrity `ok`, 0 FK violations.

## 7. Execution runbook (each step needs owner approval)

### 7.0 Preconditions

- CI is green on the release PR, including an encoded Astro-5 exception
  (readiness-07 §14.2). Not yet done.
- Cron-safe Worker release is settled (§7.5). Not yet done.
- STOP-BURN remains active: no ingestion, no Cron, no scheduler jobs.
- Maintenance note: public reads continue throughout. Each migration is a
  short D1 write batch.

### 7.1 Recovery points (immediately before 7.2)

1. `wrangler d1 time-travel info trace-manifest-db --config wrangler.worker.toml --json`.
   Record the bookmark.
2. Take a fresh keyset logical snapshot (non-blocking, as in §2) and record
   its SHA-256.
3. Optional, owner's choice: a native `wrangler d1 export` in a brief
   announced window. It blocks D1 requests while it runs, and this is the last
   chance before 0050 adds FTS.

### 7.2 Apply migrations, one file at a time, stopping on the first error

```
wrangler d1 execute trace-manifest-db --remote --config wrangler.worker.toml --yes --file db/<file>
```

Apply in order: 0050, 0051, 0052, 0053, 0054, 0055, 0056, 0057, 0058, 0059,
0060, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0071, 0073, 0074, 0075.

- 0069 is already present; skip it.
- **Never apply 0070 or 0072.**
- Never pass `--env preview`, and verify the printed database ID is
  `1625036a-ffe2-4103-bf9d-086bae150561` on the first command.
- Record `success` and `finalBookmark` for every file.

### 7.3 On failure

Stop. Do not retry blindly. Inspect the catalog and compare with the
rehearsal. Restore only with an explicit decision:

```
wrangler d1 time-travel restore trace-manifest-db --bookmark=<7.1 bookmark>
```

Restore is whole-database. With ingestion paused there are no competing
writes, but any governance or admin writes made after the bookmark would be
lost.

### 7.4 Post-migration verification (read-only)

- Re-read the full catalog. A DDL comparison against the canonical chain must
  show **exactly the 29 divergences in §4** and nothing else.
- `PRAGMA foreign_key_check` must be empty.
- Row counts of all 89 pre-existing tables must equal the 7.1 snapshot.
- `knowledge_search_records` must have about 3,984 rows.
- No `cron_scheduler_leases`; `cron_runs` must still have 11 columns (no 0072).
- M2 gate: `FAIL_CLOSED` on `sources.ingestion_type` only (expected, §1).

### 7.5 Production Worker release (Cron-safe), after 7.4

- **Primary (needs a reviewed config change on the candidate):** set top-level
  `[triggers] crons = []` in `wrangler.worker.toml` for the STOP-BURN period,
  so that even a plain `wrangler deploy` cannot restore Cron. The scheduler
  mission later restores the schedule together with 0072.
- **Secondary:** `wrangler versions upload --config wrangler.worker.toml`
  followed by `wrangler versions deploy <id>@100%`. The docs imply that
  triggers are applied only by `wrangler deploy` or `wrangler triggers deploy`,
  but do not state it outright.
- In both cases, read `GET …/workers/scripts/trace-manifest-ingestion/schedules`
  immediately and require `[]`. Rollback target is version `20d789f4`.

### 7.6 Pages (Production), last

Merge the release PR to `main`. Pages Git integration deploys Production.
Rollback target is deployment `247d3b3a`. Do not merge before 7.4 and 7.5
pass: Pages auto-deploys on merge.

### 7.7 Production smoke and authenticated QA

Public home and RSS; Access on `/admin/*` and `/api/admin/*`; Review Queue
request counts; one governed decision on a disposable assertion if the owner
designates one; extraction diagnostic only (no durable run unless approved);
Worker rejects unsigned requests; schedules still `[]`; D1 rows read observed
for 24h.

## 8. Approvals requested

1. Execute §7.1–§7.4 against Production D1.
2. Approve the `wrangler.worker.toml` Cron-empty config change (§7.5 primary)
   on the release candidate.
3. Approve the CI audit-exception mechanism (readiness-07 §14.2).
4. Decide on source 93 (`lmsys_api`) — scheduler mission.
5. D4 Pending Review product decision — not a blocker for §7.
