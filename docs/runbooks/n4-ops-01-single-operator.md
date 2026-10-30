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

**One campaign folder.** Pass the same folder as `--out-dir` to every command of a campaign, and always give the tools the package from that folder. The tools keep the campaign's history there: packages, reconciliations and an unchanged copy of every inventory capture (`n4-inventory-<sha>.json`). See [Campaign history](#campaign-history-and-its-limits).

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
node scripts/n4-ops/profile-builder.mjs prepare --plan docs/audit/local-news-p4-n4-preview-plan.json --plan-sha256 9f6ff054b7537408e06634d853f7ed049476d1bdfcc0d065769846ed568a3ec9 --target-evidence <A0 record> --inventory <capture 1> [--inventory <capture 2> ...] --approval-ref <new reference> --from-utc <window start> --until-utc <window end> --out-dir <evidence folder> [--prior-reconciliation <previous reconciliation> [--acknowledge-stop <its SHA-256> | --restart-from-start <its SHA-256>]]
```

**`prepare` refuses** any of the following:
- a plan whose SHA-256 is not the reviewed one;
- unverified or mismatched target evidence;
- a capture that is not a successful inspect, or that has a different target, implementation or migration;
- a capture whose response body is not exactly the N4 inspect response: every field present, no extra field, the N4 constants, and a well-formed `accounting` object reporting no writes;
- a capture with an empty page, a conflict row, inconsistent estimates or rows out of index order;
- a capture whose pending count contradicts its page. From `after: ""`, an exact count (below 51) fixes the number of rows shown and `has_more`; a count of 51 is only a lower bound and needs a full page with `has_more: true`. From a later cursor, an exact count must cover the rows shown plus the one `has_more` promises;
- captures that do not chain exactly from `after: ""` (first profile) or from the reconciled resume cursor (later profiles). A missing page is never assumed;
- more than ten captures, or a profile above 4 KiB;
- evidence older than 240 minutes (configurable down, at most 1,440), dated after `--now` (or the clock), or a page dated before the page it follows;
- **any** capture taken before the target evidence was verified;
- for a later profile, any capture not taken strictly after the previous profile's last recorded execution and closure. Pages inspected before a failure are never reused;
- for a later profile, a previous reconciliation or any part of the campaign history that is missing from the campaign folder or does not check (see [Campaign history](#campaign-history-and-its-limits));
- a row id or cursor that is not well-formed Unicode, such as a lone UTF-16 surrogate;
- a window longer than one hour, already open, or starting before the last capture;
- an approval reference or request id reused within the campaign, or an approval reference already used by any other package in the campaign folder.

Ceilings are exactly n+2 logical changes and 5n+8 storage write units for each page's n rows: at most 27 and 133. Request ids derive deterministically from the approval reference, slot, cursor and digest, so the same inputs give a byte-identical package.

### Event 3: approve

1. Run `approval-template --package <package>`. It prints every factual field and leaves `decision`, `owner_email`, `approved_at_utc` and `statement` as `null`.
2. The owner reviews the package:
   - every slot's cursor, row count and digest;
   - the window;
   - the total ceilings;
   - the deployable profile SHA-256.
The slot count, ceilings, window, target and publisher in the template are derived from the exact profile that would be deployed, not from the package's summaries. Every package is reloaded and refused (`package_inconsistent`) if any of the following disagrees with that profile:
- a summary (totals, window, target, plan, evidence times, chain);
- a slot's rows, budget, cursor or derived request id;
- the byte count.

Every reload — by `approval-template`, `finalize`, `verify-deployment` and `reconcile` — also repeats the preparation checks, so a later edit to the package cannot revive stale evidence:
- **each slot's capture time** must follow the target verification and, for a later profile, the previous profile's last execution and closure; captures must be in page order and fresh at window start (`stale_or_future_evidence`);
- each slot must reproduce from its retained capture copy in the campaign folder (`package_inconsistent`);
- for a later profile, the recorded prior summary must be exactly the one re-derived from the retained previous reconciliation, and the whole campaign history must check (`history_inconsistent` or `history_incomplete`).

A changed package has a new SHA-256, and an approval of that new hash does not repair stale or inconsistent evidence.

3. If satisfied, the owner fills in the four null fields by hand. `decision` is `APPROVED`, and `statement` must contain the deployable profile SHA-256.

No tool option can do this: `--approve`, `--execute` and every other unknown option are refused.

### Event 4: configure

1. Run `finalize --package <package> --approval-record <record> --out-dir <campaign folder>`. It refuses if:
   - the package fails any reload check above;
   - the record differs from the package in any field;
   - the record or any capture is dated before the inventory, after the window opens, or after `--now` (or the clock);
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
- `evidence_source`: `saved_worker_response` for a real saved response, or `synthetic_fixture` for tests and examples;
- `sent_at_utc`;
- the exact `request`;
- the `response` (`null` if lost), saved whole and unchanged, including its `accounting` object;
- `received_at_utc`.

Never add, remove or retype fields in a saved response. A test record may carry `measurement_source: "SYNTHETIC_NOT_PROVIDER"`; that marker is only accepted on a `synthetic_fixture` record.

Stop at the first non-200 response. Nothing retries automatically. Slot k+1 is never sent before slot k's receipt is in hand.

### Event 7: reconcile and close

1. **Remove the flag and profile.** Remove `TRACE_IDENTITY_MAINTENANCE_ENABLED` and `TRACE_IDENTITY_MAINTENANCE_PROFILE` after the last slot or at the window's end, whichever comes first. Record a closure readback, after the last request, and run `verify-deployment --phase closure`.
2. **Look up every slot's receipt.** Take one receipt lookup per slot, using `operation: "receipt"`. Take at least one lookup per unused or failed slot **after the window has closed**, because only a post-window lookup proves absence.
3. **Optionally add audit evidence.** If a separately approved, bounded read-only audit query is available, supply its event ids and nonce count.
4. **Run the reconciler:**

```powershell
node scripts/n4-ops/reconcile.mjs --package <package> --approval-record <record> --profile <profile> --readback-open <open readback> --readback-closure <closure readback> --request <record> ... --receipt-lookup <lookup> ... [--audit-evidence <file>] [--final-inventory <capture>] --out-dir <campaign folder>
```

The reconciler never sends, retries or replays anything. It recomputes both deployment verifications from the raw readbacks; it does not accept a derived PASS file.

**Observation time.** The trusted observation time is the workstation clock when the reconciler runs. Any request, response, lookup, readback or audit record dated after it is refused (`stale_or_future_evidence`), and a final inventory dated after it is invalid. `--now <UTC>` declares a different observation time; it exists only for the deliberately future-dated synthetic examples. The output records `observation_time_source: operator_declared`, and such a reconciliation never certifies provider consumption. Do not pass `--now` for live evidence.

**Storage evidence.** Each fresh apply response must be the complete N4 response. Storage is:
- `MEASURED` only when the availability flag is `true`, the top-level `provider_rows_written` is a non-negative integer, and the `accounting` object is complete, says its metadata is complete and reports the same count;
- `NOT_MEASURED` (so NOT_VERIFIED, never zero) when no field claims a measurement at all;
- `INVALID` (a STOP) when the response or its accounting is malformed (missing, `null`, a string, number, boolean or array, missing fields), any count is negative or fractional, the fields disagree with each other, or a synthetic marker appears under `saved_worker_response`.

It classifies each slot:

| Class | Meaning |
|---|---|
| `COMPLETED_MATCHED` | Durable receipt lookup present, with: a valid seal; the receipt `request_hash` recomputed from the deployed profile; rows equal to the approved inventory; n+2 logical changes; storage writes within the reservation |
| `EXPLICITLY_REFUSED` | A pre-commit refusal code, or an uncertain response later shown absent by a post-window lookup |
| `UNUSED_AUTHORISED_SLOT` | Never sent, and a post-window lookup shows no receipt |
| `MISSING_OR_UNCERTAIN` | Lost or unrecognised response, or a receipt seen only in an apply response, with no conclusive lookup. Writes are unknown, **never zero** |
| `CONFLICTING_OR_DUPLICATE` | Distinct receipts, duplicate executions, a receipt from another profile, rows differing from the approved inventory, a broken seal, a response recorded before its request, a receipt seen before its request, or `INVALID` storage evidence (above) |
| `UNEXPECTED_WRITE_CONSUMPTION` | Logical changes ≠ n+2, provider `rows_written` above the reservation, other mutation counters non-zero, or the Worker's post-commit write-bound error |
| `STALE_OR_MISMATCHED_TARGET` | The target, attestation, implementation or migration differs anywhere, or a deployment verification failed |

**Campaign-level checks:**
- requests for unapproved slots;
- requests outside the window or before the open verification;
- a closure readback recorded before the last request or response;
- out-of-order execution, by outcome or by recorded time (slot k+1 sent before slot k's response);
- a final inventory that is stale, dated after the observation time, from another target, implementation or publisher, not from `after: ""`, not exactly the N4 inspect response, or whose pending count contradicts its page or `has_more`;
- audit receipts or nonce counts that differ from the completed slots.

**Disposition:**

| Disposition | When |
|---|---|
| **STOP** | any refused, conflicting, unexpected or mismatched class, or any campaign finding |
| **NOT_VERIFIED** | otherwise, if anything is uncertain, storage writes are unmeasured, a completed slot has no saved request record, or a deployment readback was not supplied |
| **PASS** | only when every slot is completed or confirmed unused, both recomputed deployment verifications passed, and every completed slot's storage writes were measured |

Every reconciliation records `evidence_basis`:
- the request-record sources, and how many records carry an explicit synthetic marker;
- whether any record is synthetic (a `synthetic_fixture` source or a marker);
- the observation time and whether it came from the clock or was declared;
- `certifies_provider_consumption`, which is true only for a PASS, observed on the clock, with no synthetic record, whose every completed slot was `MEASURED` from a `saved_worker_response`.

A synthetic reconciliation carries a banner in its Markdown report and never certifies provider consumption. The `saved_worker_response` label is the operator's attestation: it makes the structural checks apply, but it cannot prove where a response came from.

**Final inventory and campaign closure are separate from the profile disposition.** The reconciliation reports the final inventory's pending count as `EXACT` (below 51) or `LOWER_BOUND` (51 means "at least 51"), and a separate `campaign_closure`:

| `campaign_closure.status` | Meaning |
|---|---|
| `NO_PENDING_ROWS_AT_CAPTURE` | a valid inventory from `after: ""` showed an exact count of zero when it was captured |
| `PENDING_ROWS_REMAIN` | a valid inventory showed pending rows; one page never proves the rest of the backlog was inspected |
| `NOT_ESTABLISHED_NO_FINAL_INVENTORY` | none supplied |
| `NOT_ESTABLISHED_FINAL_INVENTORY_INVALID` | the supplied inventory was refused, which also makes the profile a STOP |

A profile PASS never means the campaign is closed.

## Preparing the next profile

`prepare --prior-reconciliation <file>`:
- accepts a PASS reconciliation;
- **refuses NOT_VERIFIED.** Obtain the missing lookups or readbacks and reconcile again;
- **refuses a STOP**, unless both of the following hold:
  - the STOP is only a refused slot with confirmed absence, followed by confirmed-unused slots (`stop_continuable: true`);
  - the owner passes `--acknowledge-stop` with that reconciliation's exact SHA-256.

  The acknowledgement is recorded in the new package, so the owner approves it with the next profile.
- re-derives every label in the prior from its own subordinate evidence and refuses anything that does not follow (`prior_inconsistent`). A reported PASS never overrides a contradicting detail:
  - each slot's class must follow from its findings, basis, attempts, lookups, logical changes, cursor and storage state;
  - storage must be well-formed: a measured count is a non-negative integer with a valid basis, and an invalid one has its finding;
  - each deployment verdict must follow from its failed checks and recorded times, and a STOP verdict needs its campaign finding;
  - the not-verified reasons, STOP reasons, disposition, resume cursor, totals, sources, evidence basis, final inventory and campaign closure must all be re-derivable;
  - the target must be the recorded Preview database with the frozen migration;
  - the chain must be unique and end with that profile's own reference and request ids;
- walks the retained history in the campaign folder (next section);
- requires fresh captures beginning exactly at the reconciled `resume_after` cursor, each taken after the prior's last execution and closure;
- carries forward every earlier approval reference and request id, so none can be reused.

Earlier inventory is never reused: later pages are re-inspected just before each profile.

**Restarting from the first cursor in the same campaign.** When the previous profile reconciled to PASS and reported no further rows, but the final inventory still shows pending rows, prepare the next profile with:
- `--restart-from-start <prior reconciliation SHA-256>`;
- fresh captures from `after: ""`.

The restart is recorded in the package (`prior.restart_from_start: true`) for the owner to approve. Every earlier approval reference and request id stays in the chain. A restart is refused after any other outcome.

## Campaign history and its limits

**What you do.** Use one campaign folder for the whole campaign and pass it as `--out-dir` to every command. Never delete, rename or edit the tool-written files in it:
- `n4-approval-package-<sha>.json`;
- `n4-inventory-<sha>.json`, the unchanged copies `prepare` makes of your captures;
- `n4-reconciliation-<sha>.json`.

Your own records (captures, approvals, readbacks, requests, lookups) may live in subfolders. No extra file or approval step is needed.

**What the tools check.** A later profile's evidence of its history is the set of earlier files, not the newest record's own claims:
1. `prepare --prior-reconciliation <file>` needs that exact file, by its SHA-256, in the campaign folder.
2. From it, the tools walk back to the first profile. Each step needs:
   - the package the reconciliation names;
   - that package's retained captures;
   - the reconciliation before it.
3. At every step:
   - the reconciliation must re-derive cleanly and match its package: reference, target, window, slots, chain and resume facts;
   - the package's prior summary must equal the one re-derived from the reconciliation before it;
   - every earlier profile must have this campaign's target and publisher.
4. The walk must end at a first profile that starts at `after: ""`.

Each reload of a later package repeats this walk.

**Refusals and what to do:**
- `history_incomplete`: a file is missing or altered. Restore it from your backup. Do not recreate it.
- `history_inconsistent`: records disagree, for example a chain that omits an earlier profile. Treat it as a STOP and investigate.

Deleting history cannot revive a spent approval reference: `prepare` also refuses any reference that another package in the campaign folder already uses.

**What this cannot prove.** Hash links detect lost, mixed-up, partially edited and shortened history. They do **not** detect someone who can rewrite every file in the campaign folder and recompute every hash: such a person can build a shorter history that checks. The protection against that is outside the tools:
- the folder's owner-only access controls;
- your backups;
- your separate record of each approval act, which quotes the package SHA-256. Each package names the reconciliation before it.

A history in a fresh, empty folder is also new as far as the tools know.

## What these tools cannot prove

- **Approval authenticity.** The owner approval record is a plain file, not a signature or an observed human act. The tools check its structure and its consistency with the exact profile; they cannot prove who wrote it. Keep a separate record of the approval act; the owner's access to Cloudflare never substitutes for it.

  The synthetic example generator and the tests write labelled synthetic approval records. These are fixtures, not consent, and are the only places where code writes an approval record.
- **Provider authenticity.** The following are owner attestations:
  - the A0 target evidence;
  - deployment readbacks;
  - saved responses;
  - the evidence-source label.

  Offline SHA-256 seals detect accidental damage and cross-profile mix-ups, not a deliberate forger. Selection digests cannot be recomputed from redacted inventory; the Worker re-checks them live before writing.
- **Nonces.** Request records do not contain the signed transport nonce, and neither do N4 receipts. Audit evidence can confirm only an aggregate nonce count, never which nonce belongs to which request.
- **Storage figures.** These figures exist only in Worker responses. A lost response, or one that measures nothing, leaves storage unmeasured (NOT_VERIFIED). The tools check that a saved response is complete and self-consistent. They cannot check that it is genuine: the evidence-source label and any marker are the operator's statements. Synthetic figures in tests and examples are labelled and certify nothing.
- **Campaign history.** The history walk proves only that the retained files agree with each other. A person who can rewrite every file and hash in the campaign folder can forge a consistent shorter history. See [Campaign history](#campaign-history-and-its-limits).
- **Out-of-band changes.** A reconciliation does not prove the absence of unrelated mutations. The N4 runbook's separately approved before/after checks still apply.

## Evidence storage

Keep one owner-controlled campaign folder on D:, outside the repository. The tools write their content-addressed outputs and history into it (`--out-dir`). Your own raw records may sit in `target/` and per-profile subfolders. Preserve original bytes; the tools hash them and never edit them.
- **Derive hashes from originals.** Compute the readback's profile hash from the profile value actually copied from the deployed variable.
- **Don't copy labels.** Never hand-copy a PASS or VERIFIED label from one record to another.
- **Set access controls before A0.** The tools do not set file modes or Windows ACLs; files inherit the folder's. Before A0, choose the folder and verify that only the owner can modify it.

## Continuous integration

`.github/workflows/n4-ops.yml` runs this suite on every pull request and on `main`:
- read-only permissions, Node 24, `npm ci`, no Cloudflare credentials;
- it is separate from `ci.yml`, which is part of the frozen N4 implementation.

Before any OPS merge, the owner makes its `n4-ops` job a required status check in branch protection. That GitHub setting is not part of this change.

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
- 15 profiles of 10 slots, each prepared from fresh captures, approved by a labelled synthetic record, deployed-verified, executed in order, closed and reconciled to PASS, then chained to the next through the full retained-history walk;
- 150 batches and 4,050 logical changes;
- a final inventory from the start showing zero pending.

It configures no real Worker and approves nothing real.

## Record formats

| Record | `schema` | Written by |
|---|---|---|
| Target evidence | `trace-n4-ops-target-evidence.1` | owner, after A0 |
| Inventory capture | `trace-n4-ops-inventory-capture.1` | operator, one per inventory call; `prepare` keeps an unchanged copy as `n4-inventory-<sha>.json` |
| Approval package | `trace-n4-ops-approval-package.2` | `prepare` (content-addressed) |
| Owner approval | `trace-n4-ops-owner-approval.1` | owner only, from `approval-template` |
| Deployment readback | `trace-n4-ops-deployment-readback.1` | owner, after configuring and after removing |
| Deployment verification | `trace-n4-ops-deployment-verification.2` | `verify-deployment` (content-addressed) |
| Request record | `trace-n4-ops-request-record.2` | operator, one per submission; includes `evidence_source` |
| Receipt lookup | `trace-n4-ops-receipt-lookup.1` | operator, one per lookup |
| Audit evidence (optional) | `trace-n4-ops-audit-evidence.1` | owner, from a separately approved read-only query |
| Reconciliation | `trace-n4-ops-reconciliation.3` | `reconcile.mjs` (content-addressed JSON plus Markdown) |

The tools refuse any other schema value. `.3` reconciliations add the observation time, synthetic-marker count, final-inventory count kind and campaign closure. A `.2` reconciliation from OPS-R1 cannot start or continue an R2 campaign.

Synthetic examples are in [`docs/audit/n4-ops-01-examples`](../audit/n4-ops-01-examples):
- the null-approval package;
- the approval template;
- completed (PASS), failed (STOP) and uncertain (NOT_VERIFIED) reconciliations.

All their values are fictional.
