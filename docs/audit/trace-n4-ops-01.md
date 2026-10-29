# TRACE N4-OPS-01 — single-operator maintenance readiness (M-1, M-2)

- **Implementer:** Claude Code.
- **Date:** 2026-10-29.
- **Base:** N4 Draft PR #22 head `e16bcba00efbac7966d9179b19e7a0cf32e769a3`, plan `9f6ff054…`, frozen importer `70c7522`, migration 0080 `3d6d0927…`.
- **Branch:** local `claude/trace-n4-ops-01`.
- **Authority:** local only. No push, PR, merge, remote D1 access, deployment, migration, live maintenance, ingestion, scheduling or paid inference.
- **Unchanged:** PR #20, #21 and #22. STOP-BURN and both `crons = []` settings.

## Disposition

**GO FOR INDEPENDENT OPS REVIEW.** This prepares the tooling and procedure only. It does not authorise any campaign, profile, configuration or request.

## What was built

| Part | Deliverable |
|---|---|
| A — M-1 | [`docs/runbooks/n4-ops-01-single-operator.md`](../runbooks/n4-ops-01-single-operator.md): one human owner and operator, independent engineering verification by Claude and Codex, and seven separate evidence-producing events. Approval is a record the owner writes; the ability to set Worker variables is explicitly not approval evidence |
| B — M-2 | `scripts/n4-ops/profile-builder.mjs`: `prepare`, `approval-template`, `finalize`, `verify-deployment --phase open\|closure` |
| C | `scripts/n4-ops/reconcile.mjs`: per-slot classification into seven classes; PASS, STOP or NOT_VERIFIED; content-addressed JSON plus a Markdown report |
| D | campaign section of the runbook, plus a synthetic 3,750-candidate campaign in `tests/n4-ops-01.test.ts` |
| E | `tests/n4-ops-01.test.ts`, 9 tests, and the deterministic examples in [`n4-ops-01-examples`](n4-ops-01-examples) |

**Shared module:** `scripts/n4-ops/lib.mjs`.
- It imports only `node:crypto`, `node:fs`, `node:path` and `node:url`, and a test enforces that.
- It holds the N4 constants; a test pins each one to `contract.ts` and the plan.
- Its `canonical()` is byte-compatible with the runtime's; a test checks this.

**Design points:**
- **Contract conformance:**
  - The builder writes the profile in exactly the shape `approvedProfile()` accepts. The deployable bytes are those of the null-approval profile with `owner_approval` set to the approval reference.
  - A test passes the builder's output through the real `approvedProfile()`, and the campaign test runs it through the real Worker.
- **The owner approves the hash of the exact bytes** that would be deployed (`deployable_profile_sha256_if_approved`).
  - The package itself always has `owner_approval: null`, `approved_at_utc: null` and status `AWAITING_OWNER_APPROVAL`.
  - `finalize` writes the bytes only after a matching owner-written record, which must quote that hash and be dated between the last inventory and the window start.
- **Evidence is never manufactured:**
  - every slot comes from a saved capture of a real inventory response;
  - captures must chain exactly by `next_cursor` from `after: ""` or from the reconciled resume cursor, and must be fresh (240 minutes by default, at most 1,440);
  - conflict rows, empty pages and mismatched identities are refused.
- **Determinism and immutability:**
  - Request ids derive from the approval reference, slot, cursor and digest.
  - Outputs are content-addressed and written with `wx`. An existing file is accepted only if byte-identical.
  - Output inside the repository is refused, as is output off D: on Windows.
- **Reconciliation:**
  - **Seal:** recomputes each receipt's seal.
  - **Profile binding:** recomputes `request_hash` from `{input, deployed profile}`, which ties every receipt to the exact approved bytes.
  - **Rows:** compares receipt decisions with the approved inventory rows.
  - **Writes:** checks n+2 logical changes, and storage writes against 5n+8.
  - **Durable lookup required:** a slot counts as completed only with a durable receipt lookup.
  - **Absence:** absence counts only from a lookup taken after the window closed.
  - **Missing evidence is never assumed:** a lost response or an unmeasured storage count is NOT_VERIFIED, never zero.
- **Continuation:**
  - A PASS lets the next profile prepare.
  - NOT_VERIFIED never does.
  - A STOP does so only when it is a refused slot with confirmed absence and the owner passes `--acknowledge-stop` with that reconciliation's SHA-256.

## Changed files relative to `e16bcba`

There are 15 files, all new. No existing file was modified.

| Path | Purpose |
|---|---|
| `scripts/n4-ops/lib.mjs` | constants, canonical form, strict argument parsing, content-addressed writes |
| `scripts/n4-ops/profile-builder.mjs` | Part B and events 2–5 |
| `scripts/n4-ops/reconcile.mjs` | Part C and event 7 |
| `scripts/n4-ops/synthetic-examples.mjs` | regenerates the committed examples |
| `tests/n4-ops-01.test.ts` | 9 portable tests |
| `docs/runbooks/n4-ops-01-single-operator.md` | Parts A and D |
| `docs/audit/n4-ops-01-examples/` | `.gitattributes` (LF) and 8 synthetic examples |
| `docs/audit/trace-n4-ops-01.md` | this report |

**N4 is unchanged:**
- All 63 N4-bound files have their plan hashes at this branch's head, and the plan is still `9f6ff054…`.
- The diff against `e16bcba` is empty for `db/`, `src/`, `workers/`, both Wrangler files, `package.json`, `package-lock.json` and `.github/`.

**Not wired into CI:** `package.json` and `.github/workflows/ci.yml` are N4-bound files, so the new tests are not in `npm test` or `npm run ci`. Adding them would change the N4 implementation identity and needs its own instrument. Run them with:

```powershell
node node_modules/tsx/dist/cli.mjs --test tests/n4-ops-01.test.ts
```

## Verification

| Check | Result |
|---|---|
| `tests/n4-ops-01.test.ts` (worktree) | **9 / 9 pass** |
| Same suite on a fresh LF-only clone, at the final head | **9 / 9 pass** |
| Full `npm run ci` on a fresh LF-only clone of `6aa7b93`, including Codex's 28 N4 tests | **exit 0**: typecheck 0 errors, 20 importer tests, 28 N4 tests, migrations, security, build, render suites. The later commits add only these tests and this report |
| `npm run typecheck` (worktree) | 0 errors (304 files) |
| PR #22 hosted checks at `e16bcba`, read-only | `validate` pass (`npm ci` plus full CI, 2 min 56 s), `secret-scan` pass, Cloudflare Pages pass |
| Tool mutations: 20, one at a time, against the suite | **20 / 20 detected**. A first run caught 18: two refusal tests were masked by a second check returning the same error code. Both tests were made specific and the full set rerun |

**What the 9 tests cover:**
1. Constants and canonical form match `contract.ts`, the plan and the runtime.
2. Static check: no network, process or provider path in the tools.
3. Deterministic null-approval package, byte-identical across two folders and accepted by the real `approvedProfile()`.
4. **Fail-closed inputs:**
   - plan hash;
   - unverified, wrong-database, wrong-implementation, wrong-migration or wrong-attestation target;
   - capture database or implementation mismatch;
   - malformed selection hash, inconsistent budget estimate, conflict row, empty page or failed inspect;
   - unechoed request, cursor-chain gap, wrong start, more than ten captures or a duplicate capture;
   - stale or future evidence;
   - window open, too long, zero-length or non-canonical;
   - a malformed reference;
   - ten 200-character cursors exceeding 4 KiB, refused rather than truncated;
   - `validateProfile` with an extra key, self-approval, 11 slots, limit 26, ceilings 28 or 134, a duplicate id or a wrong database.
5. **No automatic approval or execution:**
   - `--approve`, `--owner-approval`, `--execute`, `--send`, `--apply` and `--auto` are refused;
   - the approval template is all-null and refused as-is;
   - the owner statement must quote the hash;
   - wrong hash, ceilings or window are refused, as are approvals after the window opens, before the inventory or dated in the future, and an expired window;
   - a tampered or self-approved package is refused;
   - CLI `apply` and `approve` commands and `--retry` exit 2;
   - output inside the repository is refused.
6. **PASS against real Worker receipts:**
   - with audit evidence (54 logical changes, nonces matched);
   - independent of input order;
   - the next profile must resume from the reconciled cursor, and a reused reference is refused.
7. **Never PASS:**
   - a real stale-selection refusal gives STOP, continuable, with completed / refused / unused slots;
   - without post-window lookups the unused slot is MISSING_OR_UNCERTAIN;
   - a lost response is uncertain, with logical changes `null`, not 0;
   - a receipt seen only in the apply response is not verified;
   - missing deployment verification;
   - receipts that are re-sealed with 28 writes, carry a foreign `request_hash`, a wrong database, changed rows or a broken seal;
   - duplicate executions, provider writes of 134, unmeasured storage, a lookup with the wrong target, or the post-commit write-bound error;
   - out-of-order execution, audit mismatch, or a request for an unapproved slot;
   - STOP without acknowledgement, and NOT_VERIFIED, both refused as a prior.
8. **Synthetic campaign:**
   - 3,750 candidates (one invalid URL) plus a lead-only row;
   - **15 profiles, 150 batches, 4,050 logical changes**, 19,950 reserved write units;
   - each profile reconciled to PASS and chained;
   - final inventory from `after: ""` shows 0 pending;
   - 3,749 hashed, 1 deferred, the lead-only row untouched, all historical fields unchanged, and 150 audit receipts.
9. The committed examples regenerate byte-identically.

**Provider metadata in the tests.** The local SQLite harness reports no provider `rows_read` or `rows_written`. On that harness the reconciler correctly returns NOT_VERIFIED ("storage writes not measured") rather than assuming zero. To exercise the PASS path, the end-to-end tests wrap the harness with **labelled synthetic** metadata: two storage writes per logical change. This is not a D1 measurement or a billing figure.

## Examples

Every value in these examples is fictional: the attestation is a hash of a fixed string, and the ids are `cand-000N`. They are not Preview data.

**The example offline profile, with approval null** (`profile_without_approval` in `example-approval-package-approval-null.json`):

```json
{"schema":"trace-preview-identity-n4.1","approval_ref":"N4-EXAMPLE-P01","owner_approval":null,"environment":"preview","database_id":"f312f662-2252-4005-8103-1a40d546e16b","target_attestation_sha256":"ee3cab28cfd96c18709864d2aab6a24f6a4d34f5340c17746c71eccff0af91bb","implementation_sha256":"8e12fbf90c0e745f257a0acdf22599d1cffc98c611dc7451aab2b8dc97dbc7de","migration_sha256":"3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be","publisher_email":"publisher@example.test","from_utc":"2026-11-02T10:00:00.000Z","until_utc":"2026-11-02T10:45:00.000Z","requests":[{"request_id":"fc7afe59-7bab-f43b-78d7-83ffb93203fc","after":"","limit":3,"selection_sha256":"3ab6d61f5ab5136334ae1ad342240cd15099130d1bb80aa08de38a183c4801dd","maximum_row_changes":5,"maximum_write_units":23},{"request_id":"8c81dac8-191a-36e0-a616-59bd985c95d0","after":"cand-0003-bad","limit":3,"selection_sha256":"b584972242230bc1159386c2a51fbc3dc62ac717f01288c918d72fbf915f1cfa","maximum_row_changes":5,"maximum_write_units":23}]}
```

- If approved, the deployable bytes would be 1,021 bytes with SHA-256 `7dcdc4a3…`.
- The package (`cb36bc7a…`) has status `AWAITING_OWNER_APPROVAL`, `owner_approval: null` and `approved_at_utc: null`.
- `example-owner-approval-template.json` has `decision`, `owner_email`, `approved_at_utc` and `statement` all `null`.

**Example reconciliations:**

| File | Disposition | Slots | Reason |
|---|---|---|---|
| `example-reconciliation-completed.*` | **PASS** | completed, completed | durable receipts, measured storage of 14 against 23 units per slot, open and closure verified |
| `example-reconciliation-failed.*` | **STOP** (continuable) | completed, explicitly refused | `identity_stale_selection`; a post-window lookup confirms no receipt; resume at `cand-0003-bad` only after an owner acknowledgement |
| `example-reconciliation-uncertain.*` | **NOT_VERIFIED** | completed, missing or uncertain | slot 1's response was lost and no post-window lookup was taken; its writes are reported as unknown |

## Remaining prerequisites

**Before the first Preview inspection (A0):**
1. **A separate owner approval of A0's exact read-only scope**, giving:
   - provider identity of `trace-manifest-db-preview` and its UUID;
   - Worker and Pages D1 bindings;
   - the exact index and trigger catalogue for the three certified tables;
   - account and query limits;
   - source rows 7 and 20;
   - the review of the locked Wrangler CLI that will run it.

   N4-OPS-01 adds the record format for A0's output (target evidence) but does not perform or authorise A0.
2. **A decision on where A0 and campaign evidence is kept:** a TRACE-managed folder on D:, outside the repository.

**Before the first maintenance batch, all as separate approvals:**
- disabled code deployment (C);
- 0080 under TRACE-OPS-01 (B; PR #20 is still Draft);
- time-boxed inventory authority (A1, DR1 L-1);
- an independent review of these tools;
- a single-slot pilot profile.

**Still open from earlier reviews:**
- M22 and M05 mandatory test coverage;
- L-5 (variant-path denial audit);
- L-7 (receipt error code);
- the N1 decision;
- the new combined-code import instrument.

The clean-install gap is now closed by PR #22's hosted `validate` check.

**Limitations of these tools:**
- They check consistency and completeness of owner-recorded evidence. They cannot detect:
  - an owner record that misstates what was approved;
  - a readback that misreports deployed variables;
  - fabricated request or lookup files.

  The seal and `request_hash` checks catch accidental and cross-profile errors, not a deliberate forger with the Worker's receipt format.
- Nonce reconciliation needs separately approved audit evidence. Without it, nonces are reported as not supplied.

## Handoff to the independent ops reviewer

No prior context is needed.

1. **Provenance:** `git log --oneline e16bcba..claude/trace-n4-ops-01` and `git diff --stat e16bcba claude/trace-n4-ops-01`. Expect only new files.
2. **N4 unchanged:** check all 63 plan-bound files against `docs/audit/local-news-p4-n4-preview-plan.json`, and the plan SHA-256 `9f6ff054…`.
3. **Run the suite and reproduce the examples:** run `node node_modules/tsx/dist/cli.mjs --test tests/n4-ops-01.test.ts` with temporary paths on D:, then reproduce the examples with `node scripts/n4-ops/synthetic-examples.mjs --out-dir <D: folder>`.
4. **Read the tools against the contract:**
   - `approvedProfile()`, `applyIdentityBatch()`'s receipt and `request_hash`, and the Worker's response shapes;
   - confirm the reconciler cannot reach PASS on missing, uncertain or unmeasured evidence;
   - confirm nothing can produce a non-null `owner_approval` except an owner record that quotes the exact hash.
5. **Read the procedure:**
   - the seven events are separate;
   - approval and access are distinguished;
   - all STOP and uncertain-outcome rules are present;
   - the final inventory restarts from `after: ""`;
   - nothing implies remote authority or a billing figure.
