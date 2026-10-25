# TRACE V1 — SEED-02 follow-up: Preview redeploy and browser-QA checklist

**Status:** prepared, **not executed**. Execution needs one owner decision: *deploy the completed SEED-02 fixes to Preview for final browser testing.*
**Scope:** Preview Worker and Preview Pages only. **No migration. No Production change.** STOP-BURN stays active, with Cron `[]`.
**Source:** branch `codex/trace-v1-seed-01-prerequisites`. Deploy the head commit at execution time; it must contain `9104838` and `1b36ad3`.

## Workstream boundaries

| Workstream | State | This checklist |
|---|---|---|
| Editorial V1, PR #2 (`d89850b`, open, CI green, mergeable) | A separate Production release decision. It keeps Public Ask off (`TRACE_AI_PUBLIC_ENABLED = "false"`) until V1.2; editorial AI stays on. | Not touched |
| SEED-02 fixes (this branch) | Deployed to Preview at `69ef289`. The fixes below are local only. | **This checklist** |
| SEED-03 batch 1 | Local preparation on its own branch. No remote capture or writes. | Not touched |
| Production migration 0076 | **On hold** until §5 and §6 below pass (see §8) | Not touched |

## 1. What changes on Preview

| Commit | Change | Layer |
|---|---|---|
| `9104838` | **Freshness Reject needs a reason and a confirm step.** Reject opens a reason form, and only "Confirm reject" sends. A blank reason is refused (`rejection_reason_required`, 400) by the Worker and the service, and nothing is written. | Pages UI, Worker, service |
| `1b36ad3` | **Retrying a reject is safe.** The review id is the rejection's idempotency key, because a review is decided once. A retry with the recorded reason returns the same result (200, `replay: true`). A different reason gets 409 `rejection_conflict` and the recorded decision is unchanged. | Worker, service |
| `5bffc5c` and this checklist | Documentation | None |

`git diff 69ef289..HEAD -- db/ wrangler.toml wrangler.worker.toml` is empty: **there is no schema or configuration change.**

**Deploy order:** Worker, then Pages, immediately after.
- **Between the two deploys:** the old page can still send a reasonless reject. The new Worker refuses it with a visible 400 and writes nothing. That window is harmless.
- **The reverse order is also safe:** the new page always sends a reason.

## 2. Local preflight (in the branch worktree)

1. Clean tree; record `git rev-parse HEAD` as `<HEAD>` and `git rev-parse --short HEAD` as `<SHORT>`.
2. `git diff --name-only 69ef289..HEAD -- db/ wrangler.toml wrangler.worker.toml` prints nothing.
3. Each of these passes:
   - `npm test` (includes `tests/freshness-reject-reason.test.ts`)
   - `npm run typecheck`
   - `npm run test:security`
   - `npm run test:diff`
   - `npm run test:migrations`
   - `npm run build`
4. A dry run shows the Preview Worker with **no Cron triggers**: `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.worker.toml --env preview --dry-run --outdir <scratch>`. `[env.preview.triggers] crons = []` must be unchanged in `wrangler.worker.toml`.

## 3. Remote preflight (read-only)

Record each value before deploying:

| Check | Expected |
|---|---|
| Schedules API, `trace-manifest-ingestion` and `trace-manifest-ingestion-preview` | `[]` and `[]` |
| Preview Worker active version (the rollback target) | `d260f0fe-75dc-490b-bcb4-beaa2f946ae3` |
| Preview Pages latest on `launch-05r-preview` (the rollback target) | `59f5ad57` |
| Production Pages | `247d3b3a` (`main` at `0351df7`) |
| Production Worker deployment | `43aee63e` (2026-10-22) |
| Preview ledger (one aggregate query) | 12 events, 12 jobs |
| Preview fixture freshness reviews on `qa-seed02-library-assertion` | 1 approved, 1 rejected (with no note, from the SEED-02 misclick) |

No Time Travel bookmark is needed, because no migration runs. Record the current Preview D1 bookmark anyway as a reference point.

## 4. Deploy (Preview only)

```
node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.worker.toml --env preview --strict --tag <SHORT>
```

```
node node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name the-trace-manifest --branch launch-05r-preview --commit-hash <HEAD> --commit-message "SEED-02 follow-up: freshness reject reason and retry safety"
```

**Never** run a plain `wrangler deploy` without `--env preview`; that targets the Production Worker. Never deploy Pages to `main`.

**Post-deploy checks:**
- The schedules API still shows `[]` for both Workers.
- The new Preview Worker version id and Pages deployment id are recorded.
- Unauthenticated `/admin/knowledge/freshness` and `/api/admin/knowledge/freshness` still return 302 or 401.
- Production Pages and the Production Worker are unchanged.

**Rollback** (no database rollback is needed):
- Worker: `wrangler versions deploy d260f0fe-75dc-490b-bcb4-beaa2f946ae3@100% --config wrangler.worker.toml --env preview`.
- Pages: roll `launch-05r-preview` back to `59f5ad57` in the dashboard.

## 5. Browser QA as the publisher (built-in browser pane)

**Rules:**
- Re-read element references before **every** click; the SEED-02 misclick came from a stale reference.
- Never sign the publisher out.
- Use only the labelled `[QA-SEED02 fixture]` data.

**Fixture:** `qa-seed02-story-assertion` is admitted, accepted and has freshness `unknown`, so it is a "never reviewed" freshness candidate.

### 5.1 Reject flow (UI)

1. Open `/admin/knowledge/freshness`. Find the candidate `qa-seed02-story-assertion`.
   - **If it shows blockers**, record them and use "Request stale" instead of "Request current" below.
   - Enter the reason `[QA-SEED02] Reject-flow request 1` and click "Request current". The page reloads with one pending review.
2. On the pending review, click **Reject**. Expected:
   - the reason form opens;
   - Approve and the optional note are hidden;
   - nothing is sent (no request in the network log).
3. Click **Cancel**. The form closes and Approve returns. Nothing is sent.
4. Click **Reject**, leave the reason empty, then click **Confirm reject**. Expected: "A rejection reason is required.", with no network request.
5. Enter `[QA-SEED02] Reject-flow: reason recorded.` and click **Confirm reject**. Expected: "Saved. Reloading…", and the review leaves the pending list.
6. **D1 (read-only):**
   - the review is `rejected` with exactly that note;
   - no new governance event;
   - the assertion's `assertion_governance_revision` and `freshness_state` are unchanged;
   - still 12 events.

### 5.2 Retry safety (browser `fetch` as the publisher, against the review from 5.1)

| Probe | Expected |
|---|---|
| `reject` with the same reason | 200, `replay: true`, the same `reviewId`, `state` and `proposedState` |
| `reject` with the same reason plus surrounding spaces | 200 replay (the reason is trimmed) |
| `reject` with a different reason | 409 `rejection_conflict` |
| `reject` with no `reviewNote`, or a blank one | 400 `rejection_reason_required` |
| `approve` on the rejected review | 409 `review_rejected` |
| `reject` on the **SEED-02 misclick review** (`freshness-review-6723f146…`, rejected with no note) with any reason | 409 `rejection_conflict` |

Afterwards, D1 still shows the 5.1 note unchanged and no new events.

### 5.3 Approve regression (freshness on a story-linked assertion)

1. Request `current` again on `qa-seed02-story-assertion` with a new reason (`[QA-SEED02] Approve regression`), then click **Approve**, without opening the reject form. If 5.1 had to use "Request stale" because of blockers, use stale here too and expect `mark_stale` below.
2. **Expected D1:**
   - one new `mark_current` event at revision 2→3, linked to that review;
   - a recalculation job with `story_scope_json = [90201]` that completed;
   - the assertion is `current`;
   - story 90201 is still `draft`, and the published count is still 1;
   - the ledger has 13 events and 13 jobs.
3. Replay the approval with `fetch`: 200, `replay: true`, the same `governanceEventId`.

### 5.4 Earlier SEED-02 checks to repeat briefly

- **Evidence Library page:** the library fixture shows under "accepted" only, and its history still lists its 3 events.
- **Review panel, story 90201:** the history labels still read "Story 90201"; the new freshness event appears labelled "Freshness review".

## 6. Live reader QA (needs a reader-only identity)

**Prerequisite, owner action:** a temporary Access identity that is:
- allowed by the Preview Access policy;
- listed in Preview `TRACE_ADMIN_READERS`;
- **not** in `TRACE_ADMIN_PUBLISHERS`.

The owner ends the publisher session with the Access logout URL and signs in as the reader. Claude never signs anyone out and never edits Access.

| Check | Expected |
|---|---|
| `/admin/knowledge/evidence-library` | 200; the read-only notice is shown; **no** Admit, Reject, Accept or Reject-review controls; the fixture rows are visible |
| Evidence Library history (`scope=evidence_library`) for the library fixture | 200 with 3 events |
| `/admin/review`, story 90201, governance history | Visible; no admission or reviewer controls are usable |
| `/admin/knowledge/freshness` | **403** |
| `POST /api/admin/assertion-review` with an Evidence Library body | 403; D1 event count unchanged |
| `POST /api/admin/assertion-reviewer-decision` | 403; nothing written |
| `POST /api/admin/knowledge/freshness` with `request`, `approve` and `reject` (with a reason) | 403 each; no review rows change |

Afterwards the owner removes the temporary reader identity, or keeps it for later QA, and records which.

## 7. Report

Add a "Preview redeploy" section to `trace-v1-seed-02-preview-certification.md` with:
- the deploy ids;
- the §5 and §6 results;
- D1 rows read and written (`wrangler d1 insights` for the QA window);
- confirmation that schedules are `[]` and Production is unchanged.

Commit locally.

## 8. Production 0076: hold criteria

Production migration 0076 stays **on hold** until **all** of these hold:

1. §5 passes on Preview with the deployed fixes.
2. §6 (live reader QA) passes.
3. The owner separately approves the Production sequence:
   - read-only preflights on Production;
   - a Time Travel bookmark and logical backup;
   - apply 0076, then **immediately** deploy the Worker and Pages through the editorial release path. Production Pages deploys only from `main`, so this follows the release order set for PR #2.
4. STOP-BURN is unaffected: Cron stays `[]`, and nothing in 0076 changes scheduled ingestion.
