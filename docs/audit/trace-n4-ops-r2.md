# TRACE-N4-OPS-R2 — evidence integrity and chain continuity

Implementer: Claude Code. Independent reviewer: Codex. Date: 30 October 2026, Europe/London.

## Verdict: GO FOR INDEPENDENT OPS-R2 DELTA REVIEW

R2 closes the four Medium findings of Codex's N4-OPS-R1-DR2 review: DR2-M1, M2, M3 and M5.
- Incomplete, contradictory, stale or history-truncated evidence no longer creates successor maintenance authority.
- Malformed or synthetic-marked accounting no longer certifies provider consumption.
- H-1 stays closed.

This was local-only. No push, Draft PR, merge, deployment, migration, Cloudflare access, remote D1 operation, Worker-variable change, maintenance, ingestion or scheduling took place.
- PRs #20, #21 and #22 are unchanged.
- STOP-BURN and both `crons = []` lines in `wrangler.worker.toml` are unchanged.
- Every approval, response and measurement here is SYNTHETIC.

## A. Starting and final commits

| Item | Identity |
|---|---|
| Reviewed R1 head (start) | `56ab1e34253d175829ac202ff31b1a23f96e2d92` |
| DR2 review | `codex/trace-n4-ops-r1-dr2` at `c0868124448f7afe47c39c21b982971ed41d41ff` (read, not modified) |
| R2 branch | `claude/trace-n4-ops-r2`, worktree `D:\Users\fleur\trace-n4-ops-r2`, local only |
| Final code-bearing commit (manifest source) | `979ff633fdef3cdb9f0d69b03f6257107c42032c` |

Every commit on the R2 branch, in order:

1. `982c438989d65103ea5c110d75fbd15962ecc70c` — the four corrections, their regressions, regenerated examples and the runbook.
2. `96336a235bd10b8373a6501366270789a433c974` — later-cursor exact-count and recorded-boundary regressions.
3. `979ff633fdef3cdb9f0d69b03f6257107c42032c` — apply-response shape regression. **This is the code-bearing commit the manifest names.**
4. The commit that contains this report, the R2 manifest, its LF attribute and the evidence folder. A commit cannot name its own SHA-256, so the handoff message gives it. It changes no OPS-inventoried file.

## B. Changed files

Relative to `56ab1e3`. No N4-bound file, migration, root `package.json`, lockfile, `ci.yml`, root `.gitattributes`, Wrangler file, `src/` or `workers/` path changed. `git diff e16bcba..HEAD` on those paths is empty.

| Path | Change |
|---|---|
| `scripts/n4-ops/chain.mjs` | **new.** `checkReconciliation()` re-derives every label of a reconciliation from its subordinate evidence; `campaignClosure()` |
| `scripts/n4-ops/lib.mjs` | reconciliation schema `.3`; `readAddressed()`; `accountingShape()`; shared `captureTimeline()` |
| `scripts/n4-ops/profile-builder.mjs` | exact inspect-body contract and pagination rules; `validatePrior()` uses `checkReconciliation()`; `campaignHistory()` walk; retained captures; folder-wide reference check; `loadPackage()` re-runs timeline, captures and history on every reload |
| `scripts/n4-ops/reconcile.mjs` | complete apply-response and accounting validation; observation-time boundary (`--now` declared, never certifies); final-inventory count kind and `campaign_closure`; self-check through `checkReconciliation()` before writing |
| `scripts/n4-ops/synthetic-examples.mjs` | declares the observation time for its future-dated fixtures |
| `tests/n4-ops-01.test.ts` | 8 R2 regression tests; R1 tests updated for the observation boundary and a realistic "unmeasured" Worker record |
| `docs/runbooks/n4-ops-01-single-operator.md` | `.2`/`.3` record formats; campaign folder and history; reload checks; storage and final-inventory rules; trust limits |
| `docs/audit/n4-ops-01-examples/example-reconciliation-*.{json,md}` | regenerated as `.3` (the package and template bytes are unchanged) |
| `docs/audit/n4-ops-01-r2-manifest.json`, `docs/audit/.gitattributes` | new OPS manifest, pinned LF |
| `docs/audit/trace-n4-ops-r2-evidence/` | replay and mutation runners, their results, verification record |
| `docs/audit/trace-n4-ops-r2.md` | this report |

`.github/workflows/n4-ops.yml` is unchanged. It already runs `tests/n4-ops-01.test.ts`, which now holds the R2 regressions, with `contents: read` and no deployment step.

## C. DR2 closure matrix

| Finding | Correction | R1 on Codex's evidence | R2 on the same evidence | Positive control | Regression | Mutations |
|---|---|---|---|---|---|---|
| **DR2-M1** prior/history | `checkReconciliation()` re-derives slot classes, storage, deployment verdicts and time checks, campaign findings, not-verified reasons, outcome, totals, sources, evidence basis, final inventory, closure and chain. `campaignHistory()` walks the retained campaign folder to the first profile. Every package in the folder reserves its reference | accepts all 6 contradicted priors; prepares all 6 successors, including reuse of `N4-EXAMPLE-P01` | refuses all 6 (`prior_inconsistent`); shortened chain and missing predecessors refused (`history_inconsistent` / `history_incomplete`); folder reuse of `N4-EXAMPLE-P01` refused (`approval_ref_reused`) | unaltered prior prepares a successor; a complete 3-profile history continues | 2 tests | C01–C10 detected |
| **DR2-M2** accounting | `storageEvidence()` validates the whole apply response and accounting object. Absent everywhere is `NOT_MEASURED`; claimed anywhere must be claimed consistently everywhere; a marker under `saved_worker_response` is `INVALID` and stays synthetic. Certification needs PASS, no synthetic record and a clock observation | missing / null / string accounting → PASS; with `saved_worker_response` → **certifies**; synthetic masquerade → **certifies** | all → STOP, `certifies_provider_consumption: false`, masquerade `synthetic: true` | complete saved response observed on the clock → PASS, certifies | 2 tests | C20–C25 detected |
| **DR2-M3** final inventory | the inspect body must be exactly the N4 response. From `after:""` an exact count fixes the row count and `has_more`, and 51 needs a full page with more. From a later cursor an exact count covers the page plus one. `campaign_closure` is separate from the disposition. Evidence after the observation time is refused | Case A, Case B and the 2099 capture → PASS | all → STOP `final_inventory_invalid`, closure `NOT_ESTABLISHED_FINAL_INVENTORY_INVALID` | empty exact-0 page → PASS, `NO_PENDING_ROWS_AT_CAPTURE`; exact 1 and lower bound 51 → PASS, `PENDING_ROWS_REMAIN` | 2 tests | C30–C36 detected |
| **DR2-M5** reload freshness | `captureTimeline()` is the one capture-time contract for `prepare` and every `loadPackage()` (`approval-template`, `finalize`, `verify-deployment`, `reconcile`). Reload also checks each slot against its retained capture and the prior summary against the retained prior | template and finalize accept the 09:01 re-dated package | both refuse `stale_or_future_evidence`, also with an approval quoting the altered hash; reconcile refuses it too | unaltered successor templates and finalizes | 1 test | C11, C40–C45 detected |
| H-1 (preserve) | unchanged | — | 1 / 3 / 13 / 10:15–10:30 against the 2 / 10 / 46 / 10:00–10:45 profile: tampered package `package_inconsistent`; narrow approval of the real package `approval_mismatch` | exact approval still finalizes | 1 test | C50 detected |
| Low: obsolete schemas | runbook record table corrected to `.2`/`.3`; report lists every commit | — | — | — | — | — |

## D. Original reproductions and R2 outcomes

`replay.mjs` rebuilds R1 from Git blobs at `56ab1e3`. It reads Codex's DR2 files from `D:\Users\fleur\trace-n4-ops-r1-dr2-evidence\probes` without writing to them. Full rows are in `trace-n4-ops-r2-evidence/replay-results.json`.

| Group | Cases | R1 accepts / PASS | R2 accepts / PASS |
|---|---|---|---|
| DR2-M1 priors and successors | 14 | 13 (all but the already-closed STOP relabel) | 1 (the positive control) |
| DR2-M2 Codex request folders | 16 | 7 PASS, 3 of them certifying | 1 (baseline) |
| DR2-M3 Codex final inventories | 13 | 4 PASS (valid, Case A, Case B, 2099) | 1 (valid) |
| DR2-M5 Codex stale package and approval | 2 (+1 control) | 2 | 0 (+ control accepted) |

Codex's `prior-*.json` files are `.2` reconciliations, which R2 refuses on schema alone. The meaningful refusal is the same edit applied to R2's `.3` example prior; that is the "prepare successor" rows and the in-suite tests. Codex's request, lookup, readback, final-inventory and stale-package files are fed to R2 unchanged. R2's example package, approval and profile are byte-identical to R1's (`0da0a3a8…`, `7dcdc4a3…`).

Two R1 outcomes become **stricter** in R2, by design:
- `storage_missing` and `storage_null` move from NOT_VERIFIED to STOP. Each asserts `provider_accounting_available: true` while its count is absent or null, which is contradictory rather than missing.
- R1's own "unmeasured" fixture kept a complete accounting object beside `available: false`. The real Worker cannot produce that, because `providerRows` is null only when the meter is incomplete. The R1 test now uses the Worker's real shape and still expects NOT_MEASURED. The old shape is an R2 STOP case.

## E. Independent positive controls

Each regression asserts a passing control alongside its refusals:
- unaltered retained prior → successor package (`owner_approval: null`);
- a 3-profile real-Worker history continues with chain `[P01, P02, P03]`;
- baseline example reconciliation → PASS, synthetic, not certifying;
- a real-Worker saved response observed on the system clock → PASS, `certifies_provider_consumption: true`;
- empty exact final inventory → PASS, `NO_PENDING_ROWS_AT_CAPTURE`;
- exact-1 and lower-bound-51 final inventories → PASS, `PENDING_ROWS_REMAIN`;
- unaltered successor → template and finalize;
- exact H-1 approval → finalize.

The 3,750-candidate campaign is itself a 15-profile positive control of the history walk.

## F. History continuity and its trust limits

**Mechanism.** The campaign folder (`--out-dir`) is the retained history. `prepare` keeps an unchanged, content-addressed copy of each capture (`n4-inventory-<sha>.json`) beside its package; `reconcile` writes `n4-reconciliation-<sha>.json`.

When a later profile is prepared, and every time its package is reloaded:
1. The prior reconciliation must be retained in the folder under its own SHA-256.
2. The tools walk back from it to the first profile. At each step, the reconciliation must re-derive cleanly and match the package it names: reference, target, window, slots, chain, resume and more-rows facts.
3. That package's slots must reproduce from its retained captures, and its capture times must pass the shared timeline.
4. Its recorded prior summary must equal the one re-derived from the reconciliation before it.
5. The walk must end at a profile with no prior that starts at `after:""`.
6. Every profile in the walk must have the same target and publisher.

The successor's chain is then the walked chain plus its own reference. A shortened chain inside the newest record contradicts its package's chain and is refused. Separately, a reference used by **any** package in the folder cannot be reused, even by a new first profile.

**Smallest mechanism.** No new record type, approver or step. It reuses files the tools already write content-addressed, and adds unchanged copies of captures the operator already has. The operator's only rule is one campaign folder for tool outputs.

**Trust limits, stated plainly:**
- Hash links detect lost, mixed-up, partially edited and shortened history. They do **not** stop a privileged person who rewrites every file in the folder and recomputes every hash; such a person can build a shorter history that checks.
- Starting in a fresh, empty folder is a new history as far as the tools know.
- The defences against both are outside the tools: owner-only access controls on the folder, backups, and the owner's separate record of each approval act. That record quotes the package SHA-256, and each package names the reconciliation before it.
- Evidence-source labels and the synthetic marker are operator statements. Structural validation does not establish provenance.
- The Worker counts pending rows in a separate query from the page. A row inserted between the two can make a genuine page look contradictory. That is refused, which is the safe direction; inspect again.

## G. OPS tests and mutations

- **OPS suite at the final code commit:** **26/26 pass**. That is 18 R1 tests plus 8 R2 tests. The 8 R2 tests cover: DR2-M1 ×2 (prior re-derivation; history), DR2-M2 ×2 (accounting cases; positive control), DR2-M3 ×2 (final inventory; profile captures), DR2-M5 ×1 and H-1 ×1.
- **Mutations:** `trace-n4-ops-r2-evidence/mutations.mjs`, now committed, ran in a disposable LF clone at `979ff63`. Each mutation was applied with exact edits, syntax-checked and tested, then the clone was restored with `git checkout -- .`.
  - **R2:** 31 mutations. Each runs only the regression it names, which must fail. **31/31 detected.**
  - **R1:** R1's 40 protections, re-expressed where R2 moved the code, against the full suite: **36/40 detected**. In each of the 4 survivors, the R1 check is now duplicated by an R2 layer that refuses the same input:

    | Survivor | R1 check removed | R2 layer that still refuses |
    |---|---|---|
    | R03 | slot rows vs reservation | the retained-capture comparison |
    | R10 | negative or fractional top-level count | the accounting-object count check |
    | R12 | `!synthetic` in certification | the requirement that every completed slot be `saved_worker_response` |
    | R14 | pending-count coherence | the new lower-bound pagination rule |

    Re-run with that layer also removed (X03, X10, X12, X14), **4/4 are detected**. All 75 runs applied exactly, were syntax-valid, and left the snapshot unchanged.
  - **C04:** detection needed the outcome re-derivation removed too. The not-verified check is deliberately layered with the outcome check.
  - **C25** gained its own regression (an extra or missing apply-response field).
  - **C50** targets the approval-fact comparison that H-1 depends on.

  Full rows: `trace-n4-ops-r2-evidence/mutations.json`.

## H. Full CI

`npm run ci` passed (exit 0) at the final code commit `979ff63`, in an LF clone (`core.autocrlf=false`), Node 24. That covers:
- the diff check;
- typecheck: `astro check` 0 errors over 306 files, plus the Worker `tsc`;
- the full application test chain;
- the **20 importer** regressions (20/20);
- the **28 N4** identity-maintenance tests (28/28);
- migration, security, evidence-policy and knowledge-markdown checks;
- the build;
- story, review and news-import render tests.

It also passed at `982c438`. Raw log SHA-256 values are in `trace-n4-ops-r2-evidence/verification.json`. The OPS workflow command (`tsx --test tests/n4-ops-01.test.ts`) passed **26/26** in the same clone.

## I. Synthetic campaign preservation

`OPS-01 synthetic 3,750-candidate campaign` passes against the real N4 Worker on the local SQLite harness, now through the full retained-history walk on every reload. The established invariants hold:
- 15 profiles, 150 batches, 4,050 logical changes and 19,950 reserved write units;
- 3,749 indexed, 1 invalid URL deferred, lead-only row untouched;
- protected candidate columns unchanged and 150 audit rows;
- final inventory from `after:""` showing 0 pending.

Storage figures come from the test's labelled synthetic metadata wrapper; they are not Cloudflare provider accounting.

As a cross-check, Codex's own `tests/review-n4-ops-r1-dr2-runtime.test.ts`, copied unchanged from `c086812` into a scratch clone of `979ff63`, passes 2/2 against R2:
- its unwrapped-harness test: NOT_VERIFIED, no certification;
- its exhaustive campaign test: 15 / 150 / 4,050, every non-identity candidate column preserved, 120 unrelated tables unchanged, 150 nonces and receipts.

That file is not added to this branch.

## J. OPS manifest

`docs/audit/n4-ops-01-r2-manifest.json`, generated twice from `979ff633fdef3cdb9f0d69b03f6257107c42032c`; both outputs are byte-identical.

| Item | Value |
|---|---|
| Manifest SHA-256 | `63830a557339b0ded8d5c82a1f75e18d7cc06f100bf367ea8800a04efba52cd7` |
| OPS identity (18 exact Git-blob records) | `40c557decba0a1f57b9fb83732c66becf61485c2718f58162608cb7f73c458d8` |
| `owner_approval`, `execution_window` | `null`, `null` |
| `remote_operations_authorised`, `remote_operations_performed` | `false`, `0` |

All 18 file hashes were recomputed independently with `git cat-file blob | sha256sum`, and the canonical identity with a separate script; all match. The OPS-R1 manifest (`9b5dee7e…`, identity `c85f75f6…`) is retained for history only. It is **not** authority for R2.

## K. Frozen N4 identity

At `979ff63`:
- all **63/63** N4-bound file hashes match the plan, recomputed with `sha256sum` over Git blobs;
- the plan is byte-identical, SHA-256 `9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9`;
- implementation `8e12fbf9…`, migration 0080 `3d6d0927…`;
- no N4-bound or protected path differs from `e16bcba`.

## L. Remaining findings and recommended next approval

No open Critical, High or Medium finding is known to the implementer. Qualifications for the reviewer:
1. Two storage cases are stricter than R1 (section D).
2. One test fixture was corrected to the real Worker shape (section D).
3. History integrity is bounded by the privileged-rewrite limit (section F).
4. Dependencies in the LF clone and mutation snapshot are a junction to the R1 worktree's installed `node_modules`; the lockfile is unchanged since `56ab1e3`. Codex's clean `npm ci` was not repeated.
5. The `n4-ops` GitHub workflow has not run remotely.
6. Codex's DR2 runtime reviewer test passes against R2 (section I) but is not part of this branch. His validator test needs his external probe fixtures and was not rerun.
7. The audit-timing not-verified reason cannot be recomputed, because the reconciliation does not store the audit capture time. It is accepted only when an audit record is present.

**Recommended next approval:** an independent, local-only **OPS-R2 delta review** by Codex of `claude/trace-n4-ops-r2` at the final commit, against DR2's four Medium findings and the H-1 preservation. It authorises no push, Draft PR, Pages preview, remote inspection, configuration, execution or scheduling. Only after that review closes should the owner consider a separate code-only OPS Draft PR and establishing the `n4-ops` required check.
