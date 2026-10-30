# TRACE N4-OPS-01-R1 — remediation of the independent OPS review

- **Implementer:** Claude Code.
- **Reviewer of the original tooling:** Codex, TRACE-N4-OPS-01-DR1 at `fa7171c` on `codex/trace-n4-ops-01-dr1`, verdict REVISE.
- **Date:** 2026-10-30.
- **Branch:** local `claude/trace-n4-ops-01-r1`, from `919230d51ad0f0c2d5d9f1dcf8d3a6ca56e689d0`.
- **Authority:** local only. No push, PR, merge, deployment, remote D1 access, migration, inventory, maintenance, ingestion, scheduling or paid inference.
- **Unchanged:** PRs #20, #21 and #22, STOP-BURN, and both `crons = []` settings.

## Disposition

**GO FOR INDEPENDENT OPS-R1 DELTA REVIEW.**

That is a recommendation for review only. It authorises no OPS Draft PR, A0 inspection, configuration, inventory or maintenance.

## Identities

| Item | Value |
|---|---|
| Code-bearing commits | `0135283875c8076434585296d1dbcb8e7ae71264` (revision) and `7cd2199b96eb53048d9d01d6d0cb1be7aa2f8fbf` (two tests made specific). The manifest's `source_commit` is `7cd2199` |
| Final commit | the documentation commit adding this report and the manifest; given in the handoff |
| OPS revision manifest `docs/audit/n4-ops-01-r1-manifest.json` | SHA-256 `9b5dee7e0e631433c83898881366e48477b5c12c69fc5f2caabe397b1d155ce6` |
| OPS identity, over 17 OPS files | `c85f75f68b080178def1c3490cc548e82077d10d9b89740492685c4d3d005752` |
| Frozen N4 | all 63 bound files unchanged; plan `9f6ff054…`; implementation `8e12fbf9…`; migration 0080 `3d6d0927…` |
| Approval fields in the manifest | `owner_approval`, `execution_window`: `null`; `remote_operations_authorised: false`; `remote_operations_performed: 0` |

- **Generator:** `scripts/n4-ops/ops-manifest.mjs`. It reads exact Git blobs, re-verifies all 63 N4 hashes and the N4 plan hash at the source commit, and refuses if any OPS path overlaps an N4-bound path.
- **Reproducible:** two generations are byte-identical.
- **Scope:** the manifest states `covers_ops_tooling: false` for the N4 identity. The old N4 hash does not cover OPS, and the OPS identity does not cover N4.

## Findings and corrections

| Finding | Correction | Regression |
|---|---|---|
| **H-1** Approval limits could disagree with the emitted profile | `approvalFacts()` derives slots, ceilings, window, target, publisher and deployable hash from the exact profile. `loadPackage()` refuses (`package_inconsistent`) unless all of these agree with that profile: summaries, window, target, plan, every slot (cursor, limit, digest, budgets, derived request id, rows, reservation, order, chain), evidence times, totals, chain and byte count. Template, finalize, verify-deployment and reconcile all go through it | `OPS-R1 H-1`: the review's exact tamper (1 slot, 3 / 13, 10:15–10:30 over a 2-slot 54 / 266 profile) is refused at template and finalize; 10 single-fact edits are each refused; the template now reports 2 / 54 / 266 |
| **M-1** Incomplete or contradictory derived evidence could PASS | The reconciler takes **raw** readbacks (`--readback-open`, `--readback-closure`) and recomputes each verification; no derived PASS file is accepted. A prior reconciliation's disposition, stop reasons, continuation flag, resume cursor and class totals must re-derive from its own slots (`deriveOutcome`, shared). Contradictory timestamps STOP: response before request, durable receipt before request, closure before the last execution, slot k+1 sent before slot k's response. A completed slot with no saved request record is NOT_VERIFIED | `OPS-R1 M-1` (×2): four relabelled priors refused; bad raw readback recomputed to STOP; each temporal contradiction; swapped timestamps of two successful slots STOP |
| **M-2** Invalid storage shown as MEASURED; synthetic basis lost | Storage is absent, invalid (negative, fractional, metadata incomplete, top-level ≠ accounting) or measured. Invalid is a contradiction (STOP), never measured. Request records carry a required `evidence_source`. Reconciliation `evidence_basis` records the sources, `synthetic`, and `certifies_provider_consumption`, which is true only for a PASS fully measured from `saved_worker_response` records. Synthetic reports carry a banner | `OPS-R1 M-2`: −1, 1.5 and 14-vs-999,999 refused as measured; synthetic PASS does not certify; relabelled saved responses do; an unknown source is refused |
| **M-3** Final inventory not validated | Full capture validation, shared with profile captures but allowing an empty page and conflict rows: `after: ""`, the approved target, implementation, migration and publisher, a successful response echoing its request, coherent pending fields, and capture after the profile's execution and closure. A failure is a campaign STOP, classed as a target mismatch where applicable | `OPS-R1 M-3`: valid final inventory recorded (0 pending); stale, Production, other database, zero implementation, incoherent pending, wrong cursor and other publisher all STOP |
| **M-4** `..name` directory bypassed containment | Path-component test after `realpath`: outside only if the relative path is absolute, `..`, or begins with `..` and a separator | `OPS-R1 M-4`: `..ops-r1-probe-*` inside the repository is refused; a junction from outside into the repository is refused; a genuine outside folder is accepted |
| **M-5** Freshness checked only the newest capture; pre-failure capture reused | Every capture must follow target verification. When continuing, every capture must be strictly newer than the prior's latest execution and closure (`fresh_after_utc`), recorded in the package | `OPS-R1 M-5`: verification between two captures is refused; after a real stale refusal and acknowledged STOP, the page captured before the failure is refused and a re-inspected page is accepted |
| **L-1** No same-chain restart from the first cursor | `--restart-from-start <prior SHA-256>`: only after a PASS profile whose walk reported no further rows; recorded as `prior.restart_from_start`; keeps every earlier reference and id | `OPS-R1 L-1`: refused after an unfinished walk and with a wrong hash; a late row behind the cursor is picked up by a restarted profile whose chain has all three references |
| **L-2** Lone surrogates accepted | Row ids and cursors must be well-formed Unicode | `OPS-R1 L-2`: id and cursor each refused |
| **CI readiness** | New `.github/workflows/n4-ops.yml`. Pull requests and `main`, `contents: read`, Node 24, `npm ci`, then the OPS suite. No secrets or deployment. `ci.yml`, `package.json` and the lockfile are unchanged | Making `n4-ops` a required status check is an owner branch-protection setting and is not changed here |

**Documented limits** (runbook, "What these tools cannot prove"):
- owner-record authenticity, and the synthetic approval fixtures written by tests and the example generator;
- provider and readback provenance;
- selection digests that cannot be recomputed offline;
- aggregate-only nonce evidence;
- synthetic storage;
- out-of-band mutations;
- evidence-folder ACLs, which must be checked before A0.

**Codex's reproduction scripts:** they target the `.1` record formats and their own fixture folder, so they were not rerun unchanged. Each reproduced defect has an equivalent `OPS-R1` regression above, run against the real N4 Worker where it matters.

## Changed files relative to `919230d`

| Path | Change |
|---|---|
| `scripts/n4-ops/lib.mjs` | containment, well-formed ids and cursors, shared `deriveOutcome`, schema versions (`package.2`, `request-record.2`, `deployment-verification.2`, `reconciliation.2`) |
| `scripts/n4-ops/profile-builder.mjs` | H-1, M-1 prior consistency, M-3 shared inventory validation, M-5, L-1, pure `deploymentVerification` |
| `scripts/n4-ops/reconcile.mjs` | M-1 raw readbacks and time checks, M-2, M-3, request-record requirement |
| `scripts/n4-ops/synthetic-examples.mjs` | `evidence_source`; raw readbacks |
| `scripts/n4-ops/ops-manifest.mjs` | new: OPS revision manifest |
| `tests/n4-ops-01.test.ts` | 9 R1 regressions added (18 tests); helpers use the real clock; one expectation now hits the stricter reservation rule |
| `.github/workflows/n4-ops.yml` | new: OPS-only CI |
| `docs/runbooks/n4-ops-01-single-operator.md` | R1 behaviour, limits, evidence storage, CI, restart |
| `docs/audit/n4-ops-01-examples/*` (8) | regenerated for the `.2` formats |
| `docs/audit/trace-n4-ops-01-r1.md` | this report, in the documentation commit |
| `docs/audit/n4-ops-01-r1-manifest.json` | the OPS manifest, in the documentation commit |

`docs/audit/trace-n4-ops-01.md`, the original report, is kept as historical evidence. Where it differs, this report supersedes it.

## Verification

| Check | Result |
|---|---|
| `tests/n4-ops-01.test.ts` (worktree) | **18 / 18 pass** |
| Same suite on a fresh LF-only clone, at `0135283` and at `7cd2199` | **18 / 18 pass** at both |
| Full `npm run ci` on the LF clone of `0135283`, including 28 N4 and 20 importer tests | **exit 0**: typecheck 0 errors (305 files), application, migration, security, evidence and markdown checks, build, render suites. `7cd2199` changes only the OPS test file |
| Synthetic campaign | 15 profiles, 150 batches, 4,050 logical changes, 19,950 reserved units, final inventory 0 pending, historical fields unchanged |
| Tool mutations, one at a time against the suite | **40 / 40 detected**: the 20 original targets (re-pointed at the R1 code) and 20 new R1 targets covering H-1, M-1 to M-5, L-1 and L-2. In the first run, two (R03 reservation and R19 lone surrogate) were masked by another check returning the same code; both tests were made specific in `7cd2199` and those two rerun there |
| N4 bound files | 63 / 63 unchanged, re-verified by the manifest generator |

The end-to-end tests supply **labelled synthetic** storage metadata, because the SQLite harness has none. Their reconciliations report `synthetic: true` and `certifies_provider_consumption: false`.

## Remaining before any live use

- **An independent OPS-R1 delta review.**
- **The required status check:** the owner makes `n4-ops` required before any OPS merge.
- **A separately approved code-only OPS Draft PR,** including its automatic Pages preview.
- **A0:** a separate approval of its exact read-only scope, the evidence folder and its ACLs.
- **Gates before maintenance:** disabled deployment (C), 0080 under TRACE-OPS-01 (B), time-boxed inventory (A1), then a single-slot pilot.
- **Open from N4:** M22 and M05 coverage, L-5, L-7 and the N1 decision.

## Handoff to the independent delta reviewer

1. `git log --oneline 919230d..claude/trace-n4-ops-01-r1`: four commits: two code-bearing (`0135283`, `7cd2199`), the documentation commit (`e53f822`) and a line-ending pin for the manifest (`53f0d35`).
2. **Diff:** `git diff --stat 919230d 7cd2199`. Confirm nothing under `src/`, `workers/` or `db/` changed, and that `wrangler*.toml`, `package*.json` and `.github/workflows/ci.yml` are unchanged.
3. **Manifest:** run `node scripts/n4-ops/ops-manifest.mjs --source-commit 7cd2199b96eb53048d9d01d6d0cb1be7aa2f8fbf --output <new D: file>`. Expect `9b5dee7e…`, byte-identical to the committed manifest, with 63 N4 files verified.
4. **Tests:** run `node node_modules/tsx/dist/cli.mjs --test tests/n4-ops-01.test.ts` with temporary paths on D:, then rerun your own H-1 and M-1 to M-5 reproductions against the `.2` formats.
5. **Read the code paths:**
   - `loadPackage` and `approvalFacts` (H-1);
   - `deriveOutcome`, `validatePrior` and the reconciler's raw readback recomputation (M-1);
   - `storageEvidence` and `evidence_basis` (M-2);
   - `inventoryBody` (M-3);
   - `outputDirectory` (M-4);
   - the freshness checks in `prepare` (M-5).
6. **Workflow:** confirm `n4-ops.yml` has read-only permissions, no secrets and no deployment steps.
