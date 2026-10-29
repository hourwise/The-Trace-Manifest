# N4-OPS-01: single-operator identity-maintenance procedure

This procedure prepares for a future campaign. It authorises nothing: no Preview inspection, configuration, request, migration or deployment. Each phase in the N4 runbook ([local-news-p4-n4.md](local-news-p4-n4.md)) still needs its own explicit owner approval. STOP-BURN and both `crons = []` settings stay in force.

## Who does what

TRACE has one human owner and operator, who is the Cloudflare administrator and the only Publisher (and Reader). The procedure does not invent a second approver or require organisational dual control.

| Role | Who | Authority |
|---|---|---|
| Owner | the human owner | final authority: approves each profile, configures Worker variables, sends each request, closes each profile |
| Operator | the same human | performs steps 3–7 below |
| Independent engineering verification | Claude and Codex | review code, tools, packages and reconciliations; no authority to approve or execute |

**Approval is not the same as access.** The owner can change Worker variables. That technical ability is **not** evidence that an approval happened. The tools never treat a deployed variable, a successful request or a readback as approval.

The only approval evidence is the owner's own approval record, which:
- names the exact package SHA-256 and deployable profile SHA-256, the window and the limits;
- carries a statement, written by the owner, that quotes the profile hash;
- has a date before the window opens.

The tools check that record against the package. They never create, complete or infer it.

## The seven events

Every event leaves a file. Keep all evidence in a TRACE-managed folder outside the repository; on the workstation it must be on D:. The tools refuse to write inside the repository. Approval fields stay `null` until the owner writes the approval record in event 3.

| # | Event | Who | Tool | Evidence produced |
|---|---|---|---|---|
| 1 | **Verified Preview D1 and deployment identity (A0)** | owner, under a separate A0 approval | none (provider commands under that approval) | target evidence record, `status: VERIFIED`, listing the SHA-256 of each saved A0 output |
| 2 | **Offline profile preparation** | operator | `profile-builder.mjs prepare` from saved inventory captures | `n4-approval-package-<sha>.json`, with `owner_approval: null` |
| 3 | **Owner approval** of the profile SHA-256, limits and window | owner | `approval-template` prints a template with `decision: null`; the owner fills it in by hand | owner approval record |
| 4 | **Explicit configuration** of the approved Worker variables | owner | `finalize` checks the record and writes the exact profile bytes | `n4-profile-<sha>.json`, the variable value |
| 5 | **Verification of deployed values** against the approval | owner | `verify-deployment --phase open` against an owner-recorded readback | `n4-deployment-open-<sha>.json`: PASS or STOP |
| 6 | **Owner-authorised execution**, one slot at a time, in order | owner | none: requests go through the authenticated Pages route by hand | one request record per submission |
| 7 | **Receipt reconciliation and closure** | owner | `verify-deployment --phase closure`, receipt lookups, then `reconcile.mjs` | `n4-deployment-closure-<sha>.json`, `n4-reconciliation-<sha>.json` and `.md`: PASS, STOP or NOT_VERIFIED |

The approval record preserves:
- the approval reference;
- the exact environment (`preview`) and Preview database UUID;
- the publisher identity (the lowercase email the Worker checks);
- the bounded selections (one per slot, each with its own cursor, limit and digest);
- the finite UTC window (at most one hour, with a 15-second closing margin).

### Event 1: target evidence

The owner writes the target evidence record after the separately approved A0 inspection. It records:
- the database name and UUID;
- the target attestation SHA-256;
- the deployed implementation SHA-256, which must equal the reviewed plan's `implementation_sha256`;
- the migration 0080 SHA-256;
- Worker and Pages deployment references;
- the verification time and verifier;
- the SHA-256 of each saved A0 output.

`status` must be `VERIFIED`. The builder refuses any other status, and any database, implementation or migration that differs from the plan. It also refuses inventory captured before the target was verified.

### Event 2: prepare

1. **Capture inventory.** Under the separately approved, time-boxed A1 inventory authority, run up to ten consecutive inventory calls by hand, following each `next_cursor`. Save each one unchanged as an inventory capture: `captured_at_utc`, `publisher_email`, the exact `request` body, and the `response` status and body.
2. **Run `prepare`:**

```powershell
node scripts/n4-ops/profile-builder.mjs prepare --plan docs/audit/local-news-p4-n4-preview-plan.json --plan-sha256 9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9 --target-evidence <A0 record> --inventory <capture 1> [--inventory <capture 2> ...] --approval-ref <new reference> --from-utc <window start> --until-utc <window end> --out-dir <evidence folder> [--prior-reconciliation <previous reconciliation> [--acknowledge-stop <its SHA-256>]]
```

**`prepare` refuses** any of the following:
- a plan whose SHA-256 is not the reviewed one;
- unverified or mismatched target evidence;
- a capture that is not a successful inspect, or that has a different target, implementation or migration;
- a capture with an empty page, a conflict row, inconsistent estimates or rows out of index order;
- captures that do not chain exactly from `after: ""` (first profile) or from the reconciled resume cursor (later profiles). A missing page is never assumed;
- more than ten captures, or a profile above 4 KiB;
- evidence older than 240 minutes (configurable down, at most 1,440), or dated in the future;
- a window longer than one hour, already open, or starting before the last capture;
- an approval reference or request id reused within the campaign.

Ceilings are exactly n+2 logical changes and 5n+8 storage write units for each page's n rows: at most 27 and 133. Request ids derive deterministically from the approval reference, slot, cursor and digest, so the same inputs give a byte-identical package.

### Event 3: approve

1. Run `approval-template --package <package>`. It prints every factual field and leaves `decision`, `owner_email`, `approved_at_utc` and `statement` as `null`.
2. The owner reviews the package:
   - every slot's cursor, row count and digest;
   - the window;
   - the total ceilings;
   - the deployable profile SHA-256.
3. If satisfied, the owner fills in the four null fields by hand. `decision` is `APPROVED`, and `statement` must contain the deployable profile SHA-256.

No tool option can do this: `--approve`, `--execute` and every other unknown option are refused.

### Event 4: configure

1. Run `finalize --package <package> --approval-record <record> --out-dir <folder>`. It refuses if:
   - the record differs from the package in any field;
   - the record is dated before the inventory, after the window opens, or in the future;
   - the window has closed.
2. `finalize` writes the exact profile bytes and lists the expected Worker variables.
3. The owner then sets exactly these variables on the Preview Worker, with nothing else changed:
   - `TRACE_IDENTITY_MAINTENANCE_PROFILE` (the file bytes);
   - `TRACE_IDENTITY_MAINTENANCE_ENABLED=true`;
   - the target, attestation and implementation variables.

### Event 5: verify the deployment

1. The owner records what is actually deployed in a readback. A readback holds:
   - each identity variable, or `null` if absent;
   - the SHA-256 of the deployed profile value;
   - whether the internal secret is present (never its value);
   - the import gate value;
   - the cron list.
2. Run `verify-deployment --phase open`. **Any STOP means no slot may be sent.**

The readback is owner-recorded, not an independent provider attestation. Its role is to catch transcription and configuration errors before execution.

### Event 6: execute

Submit each approved slot by hand, in order, through the authenticated Pages route, as the N4 runbook describes. Save one request record per submission:
- `sent_at_utc`;
- the exact `request`;
- the `response` (`null` if lost);
- `received_at_utc`.

Stop at the first non-200 response. Nothing retries automatically. Slot k+1 is never sent before slot k's receipt is in hand.

### Event 7: reconcile and close

1. **Remove the flag and profile.** Remove `TRACE_IDENTITY_MAINTENANCE_ENABLED` and `TRACE_IDENTITY_MAINTENANCE_PROFILE` after the last slot or at the window's end, whichever comes first. Record a closure readback and run `verify-deployment --phase closure`.
2. **Look up every slot's receipt.** Take one receipt lookup per slot, using `operation: "receipt"`. Take at least one lookup per unused or failed slot **after the window has closed**, because only a post-window lookup proves absence.
3. **Optionally add audit evidence.** If a separately approved, bounded read-only audit query is available, supply its event ids and nonce count.
4. **Run the reconciler:**

```powershell
node scripts/n4-ops/reconcile.mjs --package <package> --approval-record <record> --profile <profile> --deployment-open <verification> --deployment-closure <verification> --request <record> ... --receipt-lookup <lookup> ... [--audit-evidence <file>] [--final-inventory <capture>] --out-dir <folder>
```

The reconciler never sends, retries or replays anything. It classifies each slot:

| Class | Meaning |
|---|---|
| `COMPLETED_MATCHED` | Durable receipt lookup present, with: a valid seal; the receipt `request_hash` recomputed from the deployed profile; rows equal to the approved inventory; n+2 logical changes; storage writes within the reservation |
| `EXPLICITLY_REFUSED` | A pre-commit refusal code, or an uncertain response later shown absent by a post-window lookup |
| `UNUSED_AUTHORISED_SLOT` | Never sent, and a post-window lookup shows no receipt |
| `MISSING_OR_UNCERTAIN` | Lost or unrecognised response, or a receipt seen only in an apply response, with no conclusive lookup. Writes are unknown, **never zero** |
| `CONFLICTING_OR_DUPLICATE` | Distinct receipts, duplicate executions, a receipt from another profile, rows differing from the approved inventory, or a broken seal |
| `UNEXPECTED_WRITE_CONSUMPTION` | Logical changes ≠ n+2, provider `rows_written` above the reservation, other mutation counters non-zero, or the Worker's post-commit write-bound error |
| `STALE_OR_MISMATCHED_TARGET` | The target, attestation, implementation or migration differs anywhere, or a deployment verification failed |

**Campaign-level checks:**
- requests for unapproved slots;
- requests outside the window or before the open verification;
- out-of-order execution;
- audit receipts or nonce counts that differ from the completed slots.

**Disposition:**

| Disposition | When |
|---|---|
| **STOP** | any refused, conflicting, unexpected or mismatched class, or any campaign finding |
| **NOT_VERIFIED** | otherwise, if anything is uncertain, storage writes are unmeasured, or a deployment verification was not supplied |
| **PASS** | only when every slot is completed or confirmed unused, both deployment verifications passed, and every completed slot's storage writes were measured |

## Preparing the next profile

`prepare --prior-reconciliation <file>`:
- accepts a PASS reconciliation;
- **refuses NOT_VERIFIED.** Obtain the missing lookups or readbacks and reconcile again;
- **refuses a STOP**, unless both of the following hold:
  - the STOP is only a refused slot with confirmed absence, followed by confirmed-unused slots (`stop_continuable: true`);
  - the owner passes `--acknowledge-stop` with that reconciliation's exact SHA-256.

  The acknowledgement is recorded in the new package, so the owner approves it with the next profile.
- requires fresh captures beginning exactly at the reconciled `resume_after` cursor;
- carries forward every earlier approval reference and request id, so none can be reused.

Earlier inventory is never reused: later pages are re-inspected just before each profile.

## Campaign procedure: a hypothetical 3,750-candidate backlog

**Arithmetic:** 3,750 unresolved URL candidates at 25 rows per batch is **150 batches**. Ten slots per profile means **at least 15 separately approved profiles**, and more if any of the following happen:
- a refusal or drift ends a profile early;
- a refused row needs an owner decision;
- long cursors make ten slots exceed 4 KiB;
- the first profile is a single-slot pilot, which is recommended. With a pilot, the minimum is 16 profiles.

**Each profile is one full cycle of events 2–7:**
- its own approval reference, record and window of at most one hour;
- its own configuration, opening verification, manual in-order execution, removal of the flag and profile, closure verification and reconciliation.

A profile expires at `until_utc`. The Worker refuses it within 15 seconds of that time, and the owner removes it in event 7 even if slots remain unused.

**Uncertain outcomes:**
1. Never resend.
2. Look up the receipt.
3. If it is still absent while the window is open, wait until the window closes, then look up again.
4. Reconcile.

A receipt found later counts as the committed execution. A post-window absence counts as not committed. Anything else stays NOT_VERIFIED and blocks the next profile.

**STOP conditions:** all nine in the N4 runbook apply. In addition, any STOP or NOT_VERIFIED reconciliation blocks preparation of the next profile, except the acknowledged refused-slot case above.

**Rows that cannot be updated safely.** Not every historical record is assumed safe to update. A page containing a conflicting peer, an empty URL or oversized protected history is refused by the builder (`conflicting_row`), as it is by the Worker. Record the row id and conflict code and stop. Correcting or excluding such rows is a separate owner decision that this tooling does not make. Invalid and oversized URLs are deferred with their original text kept, never rewritten.

**Final inventory:**
1. After the last profile reports no further rows, run a final inventory from `after: ""` and supply it with `--final-inventory`. The reconciler refuses any other cursor.
2. Rows inserted or released behind the cursor during the campaign show up here.
3. Repeat profiles from the start until pending is zero, or until only recorded refused rows remain.

**Synthetic demonstration.** `tests/n4-ops-01.test.ts` runs exactly this cycle against the real N4 Worker on the local SQLite harness:
- 3,750 candidates, including one invalid URL, plus a lead-only row;
- 15 profiles of 10 slots, each prepared from fresh captures, approved by a labelled synthetic record, deployed-verified, executed in order, closed and reconciled to PASS, then chained to the next;
- 150 batches and 4,050 logical changes;
- a final inventory from the start showing zero pending.

It configures no real Worker and approves nothing real.

## Record formats

| Record | `schema` | Written by |
|---|---|---|
| Target evidence | `trace-n4-ops-target-evidence.1` | owner, after A0 |
| Inventory capture | `trace-n4-ops-inventory-capture.1` | operator, one per inventory call |
| Approval package | `trace-n4-ops-approval-package.1` | `prepare` (content-addressed) |
| Owner approval | `trace-n4-ops-owner-approval.1` | owner only, from `approval-template` |
| Deployment readback | `trace-n4-ops-deployment-readback.1` | owner, after configuring and after removing |
| Deployment verification | `trace-n4-ops-deployment-verification.1` | `verify-deployment` (content-addressed) |
| Request record | `trace-n4-ops-request-record.1` | operator, one per submission |
| Receipt lookup | `trace-n4-ops-receipt-lookup.1` | operator, one per lookup |
| Audit evidence (optional) | `trace-n4-ops-audit-evidence.1` | owner, from a separately approved read-only query |
| Reconciliation | `trace-n4-ops-reconciliation.1` | `reconcile.mjs` (content-addressed JSON plus Markdown) |

Synthetic examples are in [`docs/audit/n4-ops-01-examples`](../audit/n4-ops-01-examples):
- the null-approval package;
- the approval template;
- completed (PASS), failed (STOP) and uncertain (NOT_VERIFIED) reconciliations.

All their values are fictional.
