# TRACE-LOCAL-NEWS-P4-N4-R1 — remediation of the DR1 findings

- **Implementation engineer:** Claude Code. Codex authored N4 and will review this delta independently.
- **Date:** 2026-10-29.
- **Authority:** a narrow local correction of the TRACE-LOCAL-NEWS-P4-N4-DR1 findings (DR1 report commit `415ff78`, branch `claude/trace-p4-n4-dr1`).
- **Nothing remote:** nothing was pushed, opened, merged or deployed. No Preview or Production access, remote D1 operation, migration, maintenance, publisher request, paid inference or scheduling took place.
- **Untouched:** PR #20, PR #21, Codex's branch `codex/trace-local-news-p4-n4` (still `d7cbb23`) and its worktree. STOP-BURN and both `crons = []` settings are unchanged.

## Disposition

**GO FOR INDEPENDENT N4-R1 DELTA REVIEW.**

That is a recommendation for review only. It authorises no remote operation, deployment or approval.

## Identities

| Item | Value |
|---|---|
| Branch | `claude/trace-local-news-p4-n4-r1` (local only) |
| Parent | `d7cbb231575e4b39f95b7492978762c6f79878c8` (Codex's frozen N4) |
| Code-bearing commit (plan `source_commit`) | `a447c2fd3c18b3cd39dbc5472e3c4d3ee9a28253` |
| Final commit | the documentation commit that adds this report and the regenerated plan; its id is given in the handoff |
| Plan file `docs/audit/local-news-p4-n4-preview-plan.json` | SHA-256 **`9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9`** (was `31e2b670…`) |
| Implementation identity | **`8e12fbf90c0e745f257a0acdf22599d1cffc98c611dc7451aab2b8dc97dbc7de`** (was `a28ac65e…`) |
| Bound files | 63, the same path set as N4. Exactly 6 hashes changed, listed below |
| Migration 0080 | `3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be`, unchanged |
| Approval fields | all 17 are `null`: `owner_approval`, `execution_window`, the 8 template approval, window, target and selection fields, and all 7 phase approvals. `remote_operations_authorised` is `false` and `remote_operations_performed` is 0 |

- **Reproducibility:** two generations of the plan, from the R1 worktree script and from a fresh LF-only clone, are byte-identical.
- **Protected files:** the generator's checks passed. `wrangler.toml`, `wrangler.worker.toml`, `package-lock.json` and 0072 are byte-identical to `70c7522`, and 0080 is frozen.

### Changed files relative to `d7cbb23`

| Path | Git-blob SHA-256 at `a447c2f` | Change |
|---|---|---|
| `src/lib/server/identity-maintenance/service.ts` | `0ea35181c1dac2a6ff021f5d11e09172ea751eb0cea5bb6afe0d761a275fbd42` | three `ORDER BY` clauses now use table columns (H-1); comment |
| `tests/identity-maintenance.test.ts` | `f4d235d8f8ee1a06f4b95bd5abfca496bc53ff9dbdf08c1ebaa08f02028ffaf1` | three mandatory CI regressions |
| `tests/identity-maintenance-runtime.test.ts` | `00f311ebf123a70d6ded3fbf22ddda09fcc42616780a935c5487f30df11ea0eb` | workerd/D1 bounded-read measurement |
| `scripts/prepare-identity-n4.mjs` | `ed782610757623bfe1c874451e1390b9f06093cfd5278dbfd82a722a83caeaa5` | 7 new plan STOP conditions, a `campaign` block, and the final-inventory requirement in phase E |
| `docs/runbooks/local-news-p4-n4.md` | `20038d5c6103d63f33a842ea9e0981b870a4432bab7f2c8562e4597bfeb19860` | STOP conditions, final inventory, refused-row disposition, large-backlog cycle, local-versus-billing figures; workstation path removed |
| `docs/adr/TRACE-N4-INVENTORY-CONTRACT.md` | `6c2cf28fe238fa533d51fc822181ac6c5715f6f65d3eb6ea0193e977e7944ea2` | the query-ordering rule |
| `docs/audit/local-news-p4-n4-preview-plan.json` | `9f6ff054…` | regenerated (documentation commit) |
| `docs/audit/trace-local-news-p4-n4-r1.md` | — | this report (documentation commit, new) |

Relative to the frozen base `70c7522`, the inventory is 18 paths: N4's 17 plus this report.

Codex's N4 report `docs/audit/trace-local-news-p4-n4.md` is kept as historical evidence. Its sentence "Candidate-row work is bounded independently of backlog growth" was not true at `d7cbb23`; this report supersedes it.

## H-1 — unbounded reads (High): corrected

**Cause.** In SQLite an unqualified `ORDER BY id` binds to an output alias before a table column, so the index cannot supply the order. SQLite then reads every matching row and sorts them in a temporary B-tree before `LIMIT`. DR1 identified the selection snapshot.

**Two more instances found by the new regression.** The new plan regression, which checks every candidate statement rather than only the snapshot, found two further statements of the same kind that DR1 had missed. All three now order by table columns:

| Statement | Alias that captured `ORDER BY` | Rows it sorted before `LIMIT` | Now |
|---|---|---|---|
| Selection snapshot (inventory, apply pre-check and, through `snapshotGuard`, the in-batch guard) | `substr(id,1,201) AS id` | the whole unresolved backlog after the cursor | `ORDER BY editorial_candidates.id` |
| Indexed peer probe (once per selected row) | `substr(id,1,201) AS id` | every indexed row sharing that canonical hash | `ORDER BY editorial_candidates.source_url_hash,editorial_candidates.id` |
| Indexed existence sample | `'present' AS id` | the first indexed hash group | `ORDER BY editorial_candidates.source_url_hash,editorial_candidates.id` |

**Semantics are preserved:**
- Row ids are at most 200 characters (longer ids are refused), so `substr(id,1,201)` equals `id`, and the order, snapshot bytes and digests are identical.
- A mandatory test compares the alias form and the column form over five cursors, including deferred and indexed rows and an empty tail. They return identical snapshot JSON, and the selection digest recomputes from the alias-ordered snapshot.
- A peer id over 200 characters was already a conflict.
- The existence sample returns the constant `'present'`.
- Codex's 3,750-row simulation passes unchanged: 150 batches, 4,050 logical changes and a largest batch of 56 statements.

**New mandatory CI regressions** (`tests/identity-maintenance.test.ts`, run by `npm run test:identity-maintenance` inside `npm test` and `npm run ci`):

1. **`N4-R1 inventory, apply pre-check and in-batch guard never sort the backlog in a temporary B-tree`.**
   - For backlogs of 50 and 3,750, it runs a real inventory and apply through the Worker entry point.
   - It takes every executed statement that reads or updates `editorial_candidates` (83 per run), including the importer backfill statements the apply composes.
   - It runs `EXPLAIN QUERY PLAN` on each and fails on any `TEMP B-TREE` or unindexed `SCAN editorial_candidates`.
   - It also asserts that both snapshots and the in-batch guard were among the statements checked, and that the snapshot is a `SEARCH … USING INDEX idx_editorial_candidate_unindexed_url (id>?)`.
2. **`N4-R1 indexed snapshot order returns the same rows and selection digests as the original alias order`.** This is the semantic-preservation check described above.

**Workerd/D1 measurement** (`tests/identity-maintenance-runtime.test.ts`, the optional `npm run test:identity-maintenance:runtime`).
- **Method:**
  - local Miniflare, with no account or remote binding;
  - the real compiled identity handler;
  - backlogs of 50 and 3,750;
  - an indexed duplicate group for the first selected row that grows with the backlog (10, then 750);
  - one inventory and one 25-row apply per backlog.
- **Assertions:** reads may grow by at most 8 rows between backlogs, the 51-row pending probe being the only expected difference.

| Local `rows_read` | Backlog 50 | Backlog 3,750 |
|---|---|---|
| Inventory, `d7cbb23` (before) | 272 | **10,633** |
| Inventory, `a447c2f` (after) | 137 | **138** |
| 25-row apply, `d7cbb23` (before) | 697 | **16,977** |
| 25-row apply, `a447c2f` (after) | 507 | **507** |

The table measures the same test file against both commits. The "before" row comes from running the R1 tests in a disposable checkout of `d7cbb23`, which failed as expected; that checkout was then reset.

- **Unchanged by the fix:**
  - statements: 31 per inventory, 89 per apply;
  - 27 logical changes;
  - 58 local `rows_written` against a reservation of 133.
- **DR1's independent test agrees:** DR1-RT1, written by the reviewer against `d7cbb23`, now passes. It measures 135 and 136 inventory rows read, against DR1's 235 and 7,636 and DR1's disposable-fix figures of 161 and 162. Its 25-row apply reads 505.
- **Not billing:** all figures are local workerd/D1 metadata on a fictional schema. They are not Cloudflare billing and not a Preview measurement.

## M21 — migration identity (CI gap): closed

**`N4-R1 a profile approving any migration other than the frozen 0080 bytes refuses maintenance with zero writes`** (mandatory CI). It tests the real enforcement boundary, `worker.fetch` → `approvedProfile`, with no mock. It runs:

- **A file-to-constant check:** the SHA-256 of `db/migration-0080-local-news-import.sql`, with line endings normalised to LF, must equal `IDENTITY_MIGRATION_SHA256`. The constant therefore cannot drift from the frozen file.
- **Four changed migration digests:** one hex digit changed, all zeros, uppercase and empty. Each is refused with 403 `identity_approval_mismatch`. Every candidate column, every counted table, the nonce table and the audit log stay unchanged.
- **A positive control:** the same profile with the correct digest commits 5 logical changes, and its receipt records the frozen migration digest.

## Operator safety and release plan (L-2, L-3, L-6, L-8; M-2 documented)

**Runbook `docs/runbooks/local-news-p4-n4.md`:**
- **STOP conditions,** each with the error codes that trigger it:
  1. missing or mismatched bindings;
  2. failed authentication;
  3. unexpected database mutation, including a before/after comparison of non-identity tables;
  4. unexpected resource consumption;
  5. unverified target identity;
  6. an unapproved or expired profile, including a profile left deployed;
  7. selection or schema drift;
  8. uncertain outcome;
  9. a backlog above the import guard.

  A STOP is never cleared by a retry, a window extension, a ceiling increase or a new cursor.
- **A final inventory from `after: ""`** after the last batch (L-2).
- **A disposition for refused rows** (L-8): record them, owner decision, and they keep counting toward the 50-row guard.
- **The large-backlog operating cycle** (M-2):
  - about 150 batches and at least 15 profiles;
  - each profile is a seven-step cycle: inventory, offline profile build and hash, owner approval of the hash, an approved variable deployment checked against that hash, manual slot submission with per-slot receipt checks, removal of the flag and profile, then reconciliation;
  - there is no increase in batch size, slot count or ceilings;
  - an offline profile builder and receipt reconciler need their own review before the second profile.
- **A resource table** labelled as local SQLite and workerd measurement, explicitly not billing. Any material departure on Preview is STOP condition 4.
- **The workstation path is removed** (L-6).

**Plan:**
- `stop_conditions` grows from 5 to 12.
- A `campaign` block records the batch, profile and final-inventory requirements and the measurement basis.
- Phase E now requires the final inventory from the start.

**Still open** (outside this mission, as DR1 stated):
- **M-1:** the self-attested Worker-variable approval needs a named operator procedure. The runbook states what the procedure must name.
- **M-2 tooling:** the profile builder and receipt reconciler.
- **L-1:** the inventory flag has no time window.
- **L-4 remainder:** M22, M11, M05, M06, see below.
- **L-5:** the variant-path denial audit row.
- **L-7:** the receipt error code for another publisher's receipt.

## Verification

All runs are local, with temporary, npm cache and log paths on D:.

| Check | Result |
|---|---|
| Full `npm run ci` on a fresh LF-only clone of `a447c2f` (offline npm, locked `node_modules`) | **exit 0**: diff check, typecheck (0 errors), all application tests, 20 portable importer tests, 28 N4 tests (25 + 3 R1), migrations, security, evidence, markdown, build and three render suites. The R1 plan regression reported 83 candidate statements per backlog, with 0 temporary B-trees |
| Codex's 25 original N4 tests (in `tests/identity-maintenance.test.ts`) | 25 / 25 pass |
| New mandatory R1 tests | 3 / 3 pass |
| Workerd suite (Codex's smoke test and the R1 bounded-read test) | 2 / 2 pass |
| DR1 independent suite `tests/review-n4-dr1.test.ts`, run on R1 then removed | 17 / 17 pass |
| DR1 workerd suite `tests/review-n4-dr1-runtime.test.ts` (RT1 bounded reads, RT2 rollback/stale) | 2 / 2 pass; RT1 failed at `d7cbb23` |
| 3,750-candidate simulation | passes unchanged: 150 batches, 4,050 logical changes, largest batch 56, at most 89 statements, 3,748 hashed, 2 deferred, all historical fields unchanged, `integrity_check` ok |
| R1 tests against unfixed `d7cbb23` | plan regression and workerd test fail (as required) |
| Mutation rerun | Codex's CI suite catches **19 of 25** DR1 mutations (DR1: 18; M21 is now caught) and **4 of 4** new R1 mutations |

Each mutation was applied alone in the disposable checkout of `a447c2f`, and the mandatory suite `tests/identity-maintenance.test.ts` was run:

| Mutation | Caught by the CI suite | Failing test(s) |
|---|---|---|
| R1-Q1 snapshot `ORDER BY` reverted to the alias | **yes** | R1 plan regression; R1 order-equivalence |
| R1-Q2 peer probe `ORDER BY` reverted to the alias | **yes** | R1 plan regression |
| R1-Q3 existence sample `ORDER BY` reverted to the alias | **yes** | R1 plan regression |
| M21 / R1-M21 migration identity not bound | **yes** (missed at `d7cbb23`) | R1 migration test |
| M01, M02b, M03, M04, M07–M10, M12–M16, M18–M20, M23, M24 | yes, as in DR1 | unchanged |
| M02a, M05, M06, M11, M17, M22 | no, as in DR1 | each is still refused by a second layer (see DR1 section H); out of the authorised R1 scope (L-4 remainder) |

## Handoff to the independent reviewer

You need no prior context. Read DR1 (`docs/audit/trace-local-news-p4-n4-dr1-review.md` at commit `415ff78`) first, then this report.

1. **Provenance.**
   - `git log --oneline d7cbb23..<final>` should show exactly two commits: `a447c2f` (code and documents) and the documentation commit.
   - Codex's branch should still be at `d7cbb23`.
   - Run `git diff --stat d7cbb23 a447c2f`.
2. **Identity.**
   - Run `node scripts/prepare-identity-n4.mjs --source-commit a447c2fd3c18b3cd39dbc5472e3c4d3ee9a28253 --output <new D: file>`.
   - Expect implementation `8e12fbf9…` and a file byte-identical to the committed plan (`9f6ff054…`).
   - All approval and window fields should be null.
3. **H-1.**
   - Read the three `ORDER BY` changes in `service.ts`.
   - Confirm no other N4 statement orders by an alias.
   - Run `npm run test:identity-maintenance`.
   - Revert any one of the three clauses: the plan regression should fail.
   - Run `npm run test:identity-maintenance:runtime` with temporary paths on D: and compare its `N4_R1_LOCAL_D1_READS` line with the table above.
4. **M21.** Delete `||p.migration_sha256!==IDENTITY_MIGRATION_SHA256` in `contract.ts`: the R1 migration test should fail.
5. **Documents.** Check that the runbook's STOP conditions, final inventory and large-backlog cycle meet the mission, and that nothing implies remote authority or a billing figure.
6. **Scope.** Confirm there is no change to:
   - 0080 or any migration;
   - the importer (`src/lib/server/news-import/**`);
   - the editorial lifecycle;
   - the Wrangler files or the lockfile;
   - the authentication, audit, atomicity, nonce, approval or budget controls.

   The only source change is the `ORDER BY` text and one comment.

## Artefacts

- **Branch:** local branch `claude/trace-local-news-p4-n4-r1`, in its own worktree, unpushed.
- **Logs and tools** (local, not committed): in the TRACE-managed evidence folder for N4-R1, including:
  - `logs/lf-full-ci.log`, `logs/n4-suite.log`, `logs/n4-runtime.log`;
  - `logs/prefix-n4-suite.log` and `logs/prefix-runtime.log` (the R1 tests on `d7cbb23`);
  - `logs/dr1-*-on-r1.log`, `logs/mutations.jsonl`;
  - `tools/mutate-r1.mjs`;
  - `plan-1.json` and `plan-2.json`.
- **Disposable mutation checkout:** a separate worktree detached at `a447c2f` and reset after each mutation.

No workstation path is recorded in this report.
