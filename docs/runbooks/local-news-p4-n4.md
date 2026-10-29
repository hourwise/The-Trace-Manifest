# Preview identity readiness: proposed operator procedure

This is a command plan, not permission to run remote commands. Every remote phase requires its own explicit owner approval. No remote inspection, migration, deployment, maintenance or import was performed during N4. STOP-BURN and both `crons = []` settings remain in force. No scheduler, retries, queues or automatic pagination are introduced.

## Release and authority

Use the separately reviewed N4 branch, not frozen PR #21. Keep the original importer commit `70c75229c8f2013552ff4ec74a39c47a8891c365`, migration 0080 SHA-256 `3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be` and old proposal `021a957713cc70dca2dd5e97e93be7b50c5248d38716063501dc982c60af7a3a` unchanged. The latter is historical evidence and cannot authorise this combined code. N1's released-proposal withdrawal policy remains a separate issue.

`docs/audit/local-news-p4-n4-preview-plan.json` is a separately generated plan. All approval and execution-window fields are null. Its implementation identity hashes exact committed Git blobs, including the shared importer, Pages and Worker boundaries, schema, lockfile, runtime generation, portable fixtures and N4 tests. Its `source_commit` identifies the code-bearing snapshot. A later documentation-only report commit does not replace that snapshot. Recompute before any deployment; any bound change requires a new instrument.

Local reproduction (offline; these commands do not access Cloudflare):

```powershell
npm.cmd run test:identity-maintenance
npm.cmd run ci
npm.cmd run test:identity-maintenance:runtime
node scripts/prepare-identity-n4.mjs --source-commit <source_commit_from_plan> --output D:\TRACE\local-acquisition\news-p4-n4\replayed-plan.json
```

The mandatory suite requires only committed fictional fixtures. The optional local workerd test uses locked Miniflare, an isolated fake D1 binding and local temporary files, with Cloudflare connectivity and telemetry disabled. Use the locked dependency installation; do not substitute dependency versions. A complete clean offline installation remains blocked by the missing cached `sax-1.6.0.tgz` archive. Existing tested dependency reuse is not proof of a fresh install.

On this workstation put `TEMP`, `TMP`, `TMPDIR`, npm/cache and Wrangler log paths beneath `D:\TRACE\local-acquisition\news-p4-n4`. Retain logs and receipts there. Configure equivalents on another workstation; no absolute workstation path is embedded in hosted runtime code.

## A0: separately approved provider and schema inspection

Verify the recorded Preview database name `trace-manifest-db-preview` and UUID `f312f662-2252-4005-8103-1a40d546e16b` against provider identity and the actual Worker/Pages bindings. Verify that the operator account is correct. Do not read secrets. SQL cannot discover the provider UUID from a D1 binding. The runtime therefore requires a trusted deployment attestation whose digest is independently prepared from this inspection, deployed artifacts and bindings; the request must match it. Never replace this with a client assertion.

Future commands, **not executed**, after approval and review of the then-current locked CLI:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 info trace-manifest-db-preview --config wrangler.worker.toml --env preview --json
node node_modules/wrangler/bin/wrangler.js d1 execute trace-manifest-db-preview --config wrangler.worker.toml --env preview --remote --command "SELECT name,type FROM sqlite_master WHERE name IN ('idx_editorial_candidate_unindexed_url','news_import_packages','news_import_proposals') ORDER BY name LIMIT 4"
```

Use the current separately reviewed TRACE-OPS-01 manifest and its bounded preflight before migration. Do not change PR #20 or reuse an older migration identity. If 0080's index is absent, do not query the backlog predicate against the unindexed table. A0 may establish only schema prerequisites, not the backlog. Check the target's account/query limits before selecting a batch size; a 25-row apply uses up to 89 SQL statements including preflight. Choose a smaller explicit selection if the target limit cannot support that bound. No remote provider row-read/write measurements exist yet.

## C then B: disabled code deployment before schema

Correct ordering is A0, C, B, A1, D, E, F. Applying 0080 while running older generic Desk code risks bypassing imported-proposal governance. First separately approve compatible Pages and Worker deployment with `TRACE_NEWS_IMPORT_ENABLED`, `TRACE_IDENTITY_INVENTORY_ENABLED` and `TRACE_IDENTITY_MAINTENANCE_ENABLED` absent or false, and no maintenance profile. No config changes are included in this N4 commit. Existing Production without 0080 continues to refuse N4; ordinary importer regression tests cover the old schema.

Deployment command plan only, requiring separate explicit approval of code, target and any Pages preview side effects:

```powershell
# Worker deployment only after code review and explicit approval:
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.worker.toml --env preview
# Pages deployment must use the separately verified Preview project/branch and
# reviewed build output. Do not infer a project name or push to trigger a build.
```

Then separately approve migration 0080 using TRACE-OPS-01's target checks, bookmarks and interruption/recovery procedure. No new migration is needed. Do not run a bulk `d1 migrations apply` that could include reserved 0072 or unrelated migrations. The explicit single-file command below is only the final command shape after that procedure authorises it:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 execute trace-manifest-db-preview --config wrangler.worker.toml --env preview --remote --file db/migration-0080-local-news-import.sql
```

0080 contains multiple statements; do not assume file-level atomicity. On interruption, stop and reconcile individual schema objects/bookmark under the operations plan before any further execution. Optional newsletter 0078/0079 schemas are covered locally and are not prerequisites. Migration 0072 remains reserved and byte-identical.

## A1: approved read-only inventory

After schema verification and separate approval, configure Preview-only inventory authority and the trusted target/implementation digests. Maintenance remains disabled. Send requests to authenticated Pages `POST /api/admin/identity-maintenance`; Pages Access verifies the publisher and same origin, then signs `POST /admin/identity-maintenance` with the existing internal v1 HMAC. Never provision that internal signing secret in a browser or bypass Pages. A publisher can use an authenticated same-origin browser action or an approved Access client. Every call is explicit; no loop or auto-follow of `next_cursor`.

Request body (replace placeholders only with verified values):

```json
{"operation":"inspect","environment":"preview","database_id":"f312f662-2252-4005-8103-1a40d546e16b","target_attestation_sha256":"<verified attestation digest>","after":"","limit":25}
```

An authenticated browser example, to be run manually only in the approved Preview origin:

```javascript
const result = await fetch('/api/admin/identity-maintenance', {
  method: 'POST', credentials: 'same-origin',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(reviewedRequest)
});
console.log(await result.json()); // redacted IDs/hashes and accounting; no secret
```

Requests are limited to 4 KiB, responses to 32 KiB, pages to 25 candidates plus one lookahead, global pending probe to 51. Pending is exact only below 51; otherwise it is a lower bound. Global processed/deferred counts are intentionally unknown. An indexed existence sample does not establish a complete processed count. No audit or nonce insertion occurs for inspection or receipt reads, including denied calls on the new route. Read-only HMAC replay is possible within the existing 60-second signature validity; consumed mutation nonces are refused.

The unresolved predicate excludes lead-only, indexed and already deferred invalid/oversize rows. Do not assume all 3,750 historical candidates require updates. Invalid/oversize URLs are classified without changing original text. Conflicting indexed peer identities, empty URLs and oversized protected history require investigation; N4 refuses to choose an identity. Duplicate canonical URLs with consistent evidence remain separate candidates. Duplicate samples are capped at two and are not a complete global audit.

## D: separately approved finite maintenance

Review the returned selection digest, cursor, classifications and estimates. Fill a **new** owner-approved profile, never an import approval. The plan includes an invalid-by-default template. Required server settings:

| Setting | Required value |
| --- | --- |
| `TRACE_ENVIRONMENT` | `preview` |
| `TRACE_IDENTITY_DATABASE_ID` | independently verified recorded Preview UUID |
| `TRACE_IDENTITY_TARGET_ATTESTATION_SHA256` | independently prepared deployment/binding attestation |
| `TRACE_IDENTITY_IMPLEMENTATION_SHA256` | exact reviewed N4 plan implementation digest |
| `TRACE_IDENTITY_INVENTORY_ENABLED` | `true` only under inspection authority |
| `TRACE_IDENTITY_MAINTENANCE_ENABLED` | `true` only under maintenance authority |
| `TRACE_IDENTITY_MAINTENANCE_PROFILE` | exact separately approved profile JSON, maximum 4 KiB |

The profile binds schema `trace-preview-identity-n4.1`, approval reference and matching owner approval, Preview target/attestation, implementation and migration digests, publisher email, canonical UTC start/end (at most one hour), and at most ten explicit request slots. Each slot binds a unique UUID, cursor, limit, selection digest and both budgets. The 4 KiB profile cap may permit fewer than ten slots depending on field lengths; preflight the actual encoded size. A request stops 15 seconds before closing. Do not change the system clock or extend a window automatically.

For n selected candidates reserve **n+2 logical changes** and **5n+8 conservative storage write units**. At most 25 candidates, 27 changes, 133 units and 56 atomic statements per batch. Ten maximum slots bound the whole profile to at most 270 logical changes and 1,330 reserved units. The importer retains its separate 40-change ceiling. These units account conservatively for certified index/sequence effects; they are not a provider-side spending guarantee. Unknown mutation triggers or indexes refuse before writes. D1 `meta.changes` and provider `rows_written` are distinct; return both when available. Missing accounting is a reconciliation stop, never permission to release reservations or retry automatically.

Submit exactly one approved request manually:

```json
{"operation":"apply","environment":"preview","database_id":"f312f662-2252-4005-8103-1a40d546e16b","target_attestation_sha256":"<verified attestation digest>","approval_ref":"<new owner reference>","request_id":"<approved UUID>","after":"<approved cursor>","selection_sha256":"<approved inventory digest>"}
```

Only `source_url_hash` and `source_url_identity_issue` can change on candidates. The atomic batch also consumes one unique transport nonce and inserts one attributed audit receipt. ID, intake hash, submitted URL, lead, editorial state, creation and review history remain unchanged. No news version, proposal, feed item, membership, cluster or publication is created. Request UUID receipts are durable via existing audit event uniqueness; this endpoint inserts receipts and never updates/deletes them. The SHA seal detects accidental corruption, not a privileged out-of-band database writer; N4 adds no new global audit immutability trigger.

## E: reconciliation and safe resume

On any timeout, failure, missing accounting, unexpected mutation count, stale selection, changed schema/target, conflict or provider limit: stop. Retain the request, response and all reservations. Never auto-retry or silently choose a new cursor. Receipt lookup uses `operation: "receipt"` plus the target fields and `request_id`, under inventory authority even when maintenance is closed. It is read-only. A fresh transport nonce with an identical apply request returns the durable receipt with zero writes while the same approved profile remains active; an already consumed nonce is refused. A failed atomic batch rolls back the nonce, candidate updates and receipt together. Concurrent requests cannot spend the same selection twice.

To continue, reconcile receipts and obtain explicit authority for the next fixed request or a revised profile. Do not approve many pages in advance unless their actual snapshots are frozen. A later edit invalidates a digest and requires a fresh inspection/review. Do not delete audit/nonces to gain attempts. Disable maintenance after the approved slots/window; retain read authority only as separately approved.

Verify the pending probe and then perform a separately authorised **specific three-item package preflight**. Fewer than 51 pending identities is not sufficient by itself: the importer's combined indexed-match and unresolved snapshot must still fit its 50-row guard. No N4 endpoint initiates that import or opens its gate.

## F: new combined-code import instrument

Preserve the original three-item package, bundle, source evidence, source IDs and separate 40-change budget. Generate a new proposal bound to the deployed combined implementation, exact bindings and a finite window, with owner approval initially null. Reuse the evidence identities, not the old deployment authority. Actual source rows 7/20, provider identity, current main, clean locked build, migration state, deployed artifact digest, publisher membership, and STOP-BURN must all be verified under separate authority. N1 remains an independent governance decision. No push, merge, deployment or remote import is authorised by this document.
