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
node scripts/prepare-identity-n4.mjs --source-commit <source_commit_from_plan> --output <TRACE-managed evidence folder>\replayed-plan.json
```

The mandatory suite requires only committed fictional fixtures. It includes a query-plan regression: no candidate statement on the inventory, apply pre-check or in-batch guard path may use a temporary B-tree or an unindexed scan. The optional local workerd test uses locked Miniflare, an isolated fake D1 binding and local temporary files, with Cloudflare connectivity and telemetry disabled. It also measures local provider `rows_read` at backlogs of 50 and 3,750 and fails if reads grow with the backlog. Use the locked dependency installation; do not substitute dependency versions. A complete clean offline installation remains blocked by the missing cached `sax-1.6.0.tgz` archive. Existing tested dependency reuse is not proof of a fresh install.

Put `TEMP`, `TMP`, `TMPDIR`, npm/cache and Wrangler log paths in a TRACE-managed local evidence folder outside the repository, and retain logs and receipts there. No workstation path is embedded in hosted runtime code or in this document.

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

A cursor walk never revisits rows behind it. A candidate inserted or released behind the cursor during a campaign is skipped by the walk but still counted by the global pending probe. After the last approved batch, therefore, always run a **final inventory from `after: ""`**. Repeat bounded inventories and, under fresh approval, further profiles from the start until `known_pending_lower_bound` is reconciled: either zero, or exactly the rows recorded as refused below.

Rows that refuse their page (`unclassifiable_empty_url`, `conflicting_indexed_identity`, `protected_field_exceeds_bound`) are never resolved by N4. Record each refused id with its conflict code and stop. Excluding them by an approved cursor and limit is an owner decision. They remain pending and count toward the importer's 50-row guard until separately corrected.

Verify the pending probe and then perform a separately authorised **specific three-item package preflight**. Fewer than 51 pending identities is not sufficient by itself: the importer's combined indexed-match and unresolved snapshot must still fit its 50-row guard. No N4 endpoint initiates that import or opens its gate.

## STOP conditions

Stop immediately, submit nothing further, retain every request, response and receipt, and report to the owner when any of the following occurs. A STOP is never cleared by retrying, extending a window, raising a ceiling or choosing a new cursor. It needs a reconciliation and a fresh explicit approval.

1. **Missing or mismatched bindings.** A Pages or Worker binding, flag or variable is absent, extra or different from the approved configuration:
   - the D1 binding or database name;
   - `TRACE_ENVIRONMENT`;
   - `TRACE_IDENTITY_DATABASE_ID`;
   - the target attestation;
   - the implementation digest;
   - the inventory or maintenance flag;
   - the profile;
   - the internal service secret (checked for presence only, never by reading it).

   This also covers any 503 response whose code is `identity_verified_preview_target_required`, `identity_maintenance_disabled`, `identity_approval_required` or `identity_schema_0080_required`.
2. **Failed authentication.** Any 401 or 403 on an approved request:
   - Access JWT, origin or publisher membership;
   - internal signature, timestamp or nonce;
   - `identity_target_mismatch`, `identity_request_not_approved` or `identity_approval_mismatch`.

   Do not re-sign, change role or switch operator to get past it.
3. **Unexpected database mutation.** A batch may change exactly the selected rows' `source_url_hash` or `source_url_identity_issue`, plus one `admin_request_nonces` row and one `admin_audit_log` receipt. Stop if any of these differs:
   - the receipt's `writes` is not n+2;
   - `canonical_admissions` or `editorial_state_changes` is not 0;
   - an approved bounded before/after comparison shows a change in any other table or column, or in a non-identity candidate column;
   - an inventory or receipt read reports any write.
4. **Unexpected resource consumption.** Any of the following:
   - provider `rows_written` exceeds the slot's reserved write units;
   - provider `rows_read`, statements or round trips exceed the reviewed local bounds below by a material margin, or grow with the backlog between calls;
   - accounting metadata is missing;
   - D1 reports a limit, timeout or overload.
5. **Unverified target identity.** Any of the following:
   - A0 has not independently verified the provider UUID, database name and both bindings;
   - the target attestation was not prepared from that evidence and the deployed artefact;
   - the deployed code does not match the reviewed plan's `implementation_sha256`;
   - migration 0080's digest differs.
6. **Unapproved or expired profile.** Any of the following:
   - the profile JSON's SHA-256 is not the one recorded with the owner approval;
   - the window has started late, expired or is within 15 seconds of closing (`identity_outside_maintenance_window`, `identity_window_changed`);
   - a slot was not in the approved profile;
   - the profile was still deployed after its window, and was not removed.
7. **Selection or schema drift.** `identity_stale_selection`, `identity_selection_changed`, `identity_unresolved_conflict` or `identity_uncertified_write_indexes`, or an uncertified trigger.
8. **Uncertain outcome.** `identity_batch_aborted_reconcile`, `identity_committed_accounting_unavailable` or `identity_provider_write_bound_exceeded_reconcile`, or a timeout or lost response. Read the receipt first, and never redispatch blindly.
9. **Backlog above the import guard.** `missing_identity_guard_blocked` is true (pending of 51 or more) when an import preflight is being considered.

## Clearing a large backlog

A real backlog of 3,750 unresolved URL candidates needs about 150 batches of 25 rows. Each profile carries at most ten slots, so this means **at least 15 separately approved profiles**, each with its own window of at most one hour. Do not raise the page size, the slot count or the ceilings to shorten the campaign.

Each profile is one cycle:

1. **Inventory (A1 authority).**
   - Run up to ten consecutive bounded inventories, following each `next_cursor` by hand.
   - Save every response unchanged.
   - Stop on any conflict row or STOP condition.
2. **Build the profile offline** from the saved responses.
   - Each slot takes the cursor, limit and `selection_sha256` from one response, with ceilings n+2 and 5n+8 for that page.
   - Check that the encoded profile is at most 4 KiB.
   - Record the profile JSON's SHA-256.
3. **Owner approval** of that exact hash and window.
4. **Separately approved deployment** of the profile and the maintenance flag as Worker variables.
   - Confirm the deployed configuration matches the approved hash before the first slot.
5. **Submit each slot by hand, in order.** After each slot:
   - read and keep the receipt;
   - check `writes` = n+2;
   - check that provider `rows_written` is within the reservation;
   - check that `next_cursor` matches the next slot's cursor.

   A stale selection ends the cycle. Unused slots are abandoned, never edited.
6. **Remove the maintenance flag and profile** after the last slot or at the window's end, whichever comes first.
   - Keep inventory authority only if it was separately approved, and only for its approved period.
7. **Reconcile.** Before the next cycle, reconcile all receipts: audit receipts = nonces = committed slots.
   - The next cycle starts from the last committed cursor with a fresh inventory.

After the final cycle, run the final inventory from `after: ""` described in phase E.

**Tooling prerequisite.** More than one profile should not be attempted by hand-building around 300 signed requests. A deterministic offline profile builder and a receipt reconciler need their own review before cycle two. N4 does not supply them.

**Approval authority.** The profile is self-attested by whoever can set Worker variables (DR1 M-1). The operating procedure must also name:
- who may set and remove the profile and flags;
- who independently checks the deployed artefact and binding against the attestation.

## Resource figures: local measurement, not billing

Every figure in this section was measured locally:
- the isolated SQLite harness counts statements and query plans;
- local workerd/D1 (Miniflare) reports provider-style `rows_read` and `rows_written` metadata for a fictional schema.

They are neither Cloudflare billing nor a measurement of Preview.

| Measure (25-row page) | Local result |
| --- | --- |
| Inventory | 31 statements, 0 writes; about 140 local `rows_read` at backlogs of both 50 and 3,750 |
| Apply | 89 statements, 56 in the atomic batch; 27 logical changes; 58 local `rows_written` against a reservation of 133; about 510 local `rows_read` at both backlogs |
| Campaign of about 150 batches | about 4,050 logical changes; about 20,000 reserved write units; on the order of 0.1 million local `rows_read` across inventories and applies |

Actual provider consumption depends on the real schema, the indexes, D1's accounting and the account's limits, all verified in A0. Treat any material departure from these local figures as STOP condition 4. Do not extrapolate these numbers into a cost.

## F: new combined-code import instrument

Preserve the original three-item package, bundle, source evidence, source IDs and separate 40-change budget. Generate a new proposal bound to the deployed combined implementation, exact bindings and a finite window, with owner approval initially null. Reuse the evidence identities, not the old deployment authority. Actual source rows 7/20, provider identity, current main, clean locked build, migration state, deployed artifact digest, publisher membership, and STOP-BURN must all be verified under separate authority. N1 remains an independent governance decision. No push, merge, deployment or remote import is authorised by this document.
