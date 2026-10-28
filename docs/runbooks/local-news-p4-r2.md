# P4-R2 operator and release-candidate guide

This is a local, unapproved release candidate. No command here grants push, remote database, migration, deployment, scheduling, provider or import authority. STOP-BURN and Cron `[]` remain in force.

## Verification and evidence separation

Normal CI uses only committed fictional XML, fixed fixture identities and in-memory SQLite. It needs no D: evidence, local acquisition package, credential or network request:

```powershell
npm.cmd run test:news-import:ci
npm.cmd run ci
```

The standard `test` command includes importer service/boundary/migration/governance tests; `ci` also builds and tests the compiled fictional Desk. Generation runs in `--check` mode and rejects drift. Pages build checks reject Node-only imports because Pages has no `nodejs_compat`. Dependency versions remain locked; a clean install is still a deployment gate if the offline cache lacks an archive.

The real acceptance suite is deliberately separate:

```powershell
Set-Location -LiteralPath 'D:\Users\fleur\The Trace Manifest\.worktrees\trace-local-news-p4-r2-remediation'
$env:TRACE_P4_OUTPUT_ROOT='D:\TRACE\local-acquisition\news-p4-r2'
$env:TRACE_P4_EVIDENCE_ROOT='D:\TRACE\local-acquisition\news-p3-r2-final'
$env:TRACE_ACQUISITION_BASELINE='D:\Users\fleur\The Trace Manifest\.worktrees\trace-local-news-p4-r1-release\local\acquisition'
powershell.exe -NoProfile -File scripts/news-p4.ps1 -Action Quality
powershell.exe -NoProfile -File scripts/news-p4.ps1 -Action Test
powershell.exe -NoProfile -File scripts/news-p4.ps1 -Action Plans
```

The launcher validates direct D: storage, sets temporary files/cache/logs on D: and denies external network while allowing build IPC. The optional baseline path contains the unchanged historical acquisition package; only the real-evidence replay/storage helper uses it. That package and its 317 tests stay on their accepted branches. Five pure parser modules now live under `tools/news-import/parser-source`; generated hosted validation has the same extraction algorithm and source identities. No bulk captures or financial tooling are required by hosted-import CI.

For manual builds/tests outside the launcher, explicitly set TEMP/TMP/TMPDIR and npm cache beneath the D: output root, disable Astro telemetry/Wrangler metrics, and set NODE_OPTIONS to require `scripts/news-p4-offline-guard.cjs`. Never use a live provider or re-fetch a feed to repair offline fixtures.

## Editorial decisions

Each immutable source version owns candidate `local-news-p4:<version_id>`. Existing Desk/Capture candidates are immutable contextual references in the hold reason, not owners of the proposal. Import never changes their original identity, lead, hash, state or audit history. Rejecting an imported proposal rejects only its own held candidate.

Versions sharing a canonical URL have immutable `same_canonical_url_order_unverified` links. Discovery order is not publisher update order or approved supersession. Each version retains its own review obligation and prior decisions. The panel links related versions for inspection. Release still requires publisher authority, reason, expected revision, current source/cluster checks and an atomic proposal/owner/event/audit transaction. Promotion remains a later explicit PR #11 action and can reuse one existing cluster instead of duplicating it.

Generic Desk transitions and direct state UPDATE/REPLACE cannot release a held imported proposal or reopen a rejected one. There is no approved reopen operation. An editor cannot use a newer version to overwrite an earlier decision automatically. Ordinary non-imported Desk records and PR #19's filter/navigation remain unchanged. Imported proposal pages use a separate bounded review-state cursor within the same Desk/Review component: unresolved first, with historical decisions accessible by tabs and per-version links. Queue-row governance is fetched by indexed owner IDs, independently of the visible proposal page.

Closing `TRACE_NEWS_IMPORT_ENABLED` stops creation/preflight but leaves existing Preview proposals reviewable by signed-in publishers. Production refuses the import/review route. Defaults do not enable anything.

## Explicit identity maintenance

More than 50 unindexed legacy URL candidates can block import even when their URLs are unrelated. The importer must not silently scan/repair thousands of rows or ignore possible matches. New Desk, Capture and ingestion inserts set the canonical index where revised 0080 exists; pre-0080 deployments use the existing insert shape. Historical `source_hash` is never rewritten.

`docs/runbooks/local-news-p4-r2-checks.sql` contains a bounded read-only backlog probe. It requires the exact revised 0080 schema; inspect schema metadata first and stop if it is absent or different. No Preview probe has been executed. The probe reports a bounded page/lower bound, not a global count.

For an existing **local disposable or separately authorised local database**:

```powershell
npm.cmd run news:identities -- status --database 'D:\TRACE\local-acquisition\news-p4-r2\state\maintenance-smoke.sqlite' --operator publisher@example.test --limit 25
npm.cmd run news:identities -- apply --database 'D:\TRACE\local-acquisition\news-p4-r2\state\maintenance-smoke.sqlite' --operator publisher@example.test --limit 25 --approval-id LOCAL-APPROVAL-ID --maximum-writes 26
```

The CLI accepts existing real D: files only and opens `status` read-only. It cannot connect remotely, retrieve credentials, apply migrations or create a missing database. `apply` needs explicit approval metadata and a write cap. Resume with the returned `--after` cursor; inspect the next page until no rows remain. Repeating a completed scan produces zero writes. A local approval string is an audit label, not permission to act on Preview.

Each batch selects at most 26 rows, processes at most 25, uses at most 52 batch statements and writes at most 26 rows including one admin audit. Its audit records bounded original-hash/URL fingerprints and each canonical result or issue. Bad/oversize URLs remain intact with a visible identity issue; no hash, lead or editorial state is fabricated. Editing a legacy URL clears its old index/issue for re-evaluation. Concurrent changes or unknown mutation triggers abort rather than committing a misleading audit.

The representative 3,750 valid-row run needs 150 batches and 3,900 writes. The tested 3,751-row case including one invalid URL used 151 batches and 3,902 writes. These are local measurements, not a Preview count or approval. **Any future Preview maintenance needs separate target verification, row scope, financial/D1 write accounting and owner approval. It is outside the import's 40-write allowance.** Do not turn the file CLI into a remote driver. Export/review exact bounded changes in a separately approved maintenance mission if needed.

## Preview release gates — all remain unapproved

1. Independently re-review the exact R2 commit, changed-file inventory, CI evidence and new implementation-bound proposal.
2. Obtain separate push/Draft-PR approval that explicitly acknowledges the repository's automatic Pages preview deployment on push. A normal push is not merely document sharing. Neither push nor deployment is authorised now.
3. Complete an integrity-checked clean locked install in an approved environment. Do not relax SAX or other versions to bypass missing offline cache entries.
4. Independently verify Preview account, binding, name `trace-manifest-db-preview` and recorded UUID `f312f662-2252-4005-8103-1a40d546e16b`. Production is excluded.
5. Check migration allocation and actual schema. Revised 0080 requires 0077; 0078/0079 are optional. If any older 0080 has already been applied, stop and plan a forward migration; do not rerun ALTER statements or replace historical evidence. Migration 0072 remains reserved.
6. Separately approve/apply the exact revised 0080 on the verified Preview target. This is not part of the import budget.
7. Deploy/configure Pages and Worker only under separate authority, with new imports closed and Production disabled. Preserve Access membership, HMAC, same-origin, nonce/timestamp and STOP-BURN controls.
8. Perform separately authorised read-only target/source/backlog/schema/trigger checks. Verify exact source rows 7 and 20. Source setup and identity maintenance, if required, need their own approved scope and budget before continuing.
9. Freeze the new proposal, implementation/migration/package hashes, statement ceiling, unchanged 40-write ceiling and a finite canonical UTC interval of at most one hour. Owner approval and window are currently null.
10. Separately authorise enabling Preview for that exact interval and pinned package. The handler retains its 15-second closing margin. Unknown triggers, stale state, wrong profile or old financial/time approvals cannot supply authority.
11. Signed read-only preflight must match the approved R2 measurement and source relationships. Any reuse/conflict/history/backlog deviation requires review; do not assume the historical R1 20-write/26-statement profile applies.
12. Execute one bounded signed import, without retries, then run only the reviewed scoped postflight SELECTs. Inspect three attributed held candidates/proposals, source hashes, immutable receipt/events and admin audit; verify no feed/cluster/publication/canonical-admission effect.
13. Perform one fresh-signed identical replay within the approved interval. It must read the immutable receipt and write zero additional nonce/audit/import rows. A consumed nonce is refused. Response loss or ambiguous metadata requires read-only reconciliation before considering replay.
14. Separately authorised configuration action: close creation and verify another import is refused. Existing proposals remain reviewable; release/reject/promotion are separate explicit editorial actions, not part of import approval.

Stop for any target/code/schema/hash drift, stale source or membership state, unknown triggers, lookup overflow, invalid window, missing accounting evidence or unexpected mutation. Preserve committed evidence; use an audited forward fix when required. Do not delete immutable packages, reset a spent ledger, use Time Travel restore as routine cleanup, resume inference, enable Cron or fetch additional feeds.
