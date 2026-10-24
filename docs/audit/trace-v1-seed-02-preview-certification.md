# TRACE V1 — SEED-02: Preview certification of SEED-01 (Evidence Library governance)

**Date:** 2026-10-23 to 2026-10-24
**Branch deployed to Preview:** `codex/trace-v1-seed-01-prerequisites` at `69ef289`
**Scope:** Preview only. Runs the sequence in [SEED-01 §10](trace-v1-seed-01-prerequisites.md#10-proposed-preview-certification-sequence-each-step-needs-approval). No Production change. STOP-BURN stays active, with Cron `[]`.

**Outcome: certified on Preview, with one deferral.** Migration 0076, the Worker and Pages are live on Preview. Publisher QA, the API probes and the story-context regression all passed. **Live reader QA is deferred**, because no reader-only Access identity exists (§5). Its automated test evidence is recorded below.

## 1. Preflights and recovery points

| Check | Result |
|---|---|
| Duplicate `(assertion_id, new_governance_revision)` | 0 |
| `evidence_freshness_reviews` present | yes |
| Governance ledger before | 7 events, 7 jobs |
| Time Travel bookmark (before 0076) | `000000bf-00000000-0000510d-8e29893f15b61e6152c5fb45a26e32b9` |
| Logical backup before | `trace-manifest-db-preview-before-seed02-0076-20261023-logical.json` (sha256 `f519dac6…`) |
| Logical backup after | `trace-manifest-db-preview-after-seed02-0076-20261023-logical.json` (sha256 `1abfda9d…`) |
| Rollback targets | Preview Worker version `ea8ac39d`; Preview Pages deployment `c09445df` |

The backups are local, under `D:/Users/fleur/TraceManifestD1Backups/`. They are keyset logical snapshots; `wrangler d1 export` was not used.

## 2. Migration 0076 on Preview

- Applied **0076 only**: 18,050 rows read and 542 written.
- **Preservation:** all 7 events and 7 jobs match the pre-apply backup field for field, and every one has `governance_context = 'story'`.
- **Integrity:** remote `PRAGMA foreign_key_check` returned 0 violations. Explicit orphan queries returned 0 for every foreign key on the rebuilt tables. No `_0074` tables are left over.
- **Objects:** all 13 required triggers and indexes are present. `governance_context` defaults to `'story'` and is NOT NULL; `cluster_id` and `freshness_review_id` are nullable.
- **Local integrity:** `PRAGMA quick_check` and `integrity_check` do not run on remote D1, so integrity was checked on a local copy loaded from the post-apply snapshot. Result: `ok`.
- **Append-only:** updating or deleting events is refused by the triggers.

## 3. Deploy (immediately after the migration)

| Item | Result |
|---|---|
| Preview Worker | version `d260f0fe-75dc-490b-bcb4-beaa2f946ae3`, `--env preview --strict` |
| Preview Pages | deployment `59f5ad57`, branch `launch-05r-preview`, commit `69ef289` |
| Cron schedules | `[]` on both Workers, read through the schedules API before and after QA |
| Access | unauthenticated requests to admin pages and APIs return 302 or 401 |

## 4. Publisher QA (labelled disposable fixtures)

### Fixtures

All fixtures are on Preview and labelled `[QA-SEED02 fixture]` / `qa-seed02-*`. **No placeholder or fictional story carries knowledge evidence.**

- **Library fixture:** one admitted, captured source, with a version, a chunk, a provenance group, a claim, and `qa-seed02-library-assertion`. No story carries that claim.
- **Story-regression fixture:** story `90201` with one member item and a linked claim carrying `qa-seed02-story-assertion`.
  - The story was moved to `draft` so the Review panel lists it.
  - It has `needs_human_review = 0` and `evidence_status = vendor_reported`.
  - It was never published.

### Evidence Library flow (UI)

| Step | Event | Context, cluster | Revision | Recalculation |
|---|---|---|---|---|
| Admit | `admit` | `evidence_library`, null | 0→1 | completed; scope `[]`; claim snapshot 1, story snapshot 0 |
| Accept | `accept_review` | `evidence_library`, null | 1→2 | completed; scope `[]`; claim snapshot 1, story snapshot 0 |
| Freshness: request `current`, then approve | `mark_current`, linked to `freshness-review-1f1229…` | `evidence_library`, null | 2→3 | completed; scope `[]`; claim snapshot 1, story snapshot 0 |

- The final state is admitted, accepted and current, at revision 3.
- The library history API returned all three events in order. In the UI, both decisions were seen labelled "Evidence Library", checked before the freshness step. The "Freshness review" label for the third event comes from the label function and its unit test; it was not separately checked by eye.
- No story or story link was created: the library claim has 0 story links, and the published count stayed at 1.
- After the decisions, the library assertion appears under the "accepted" filter only, and the story assertion appears under no Evidence Library filter.

### API probes (browser `fetch` as the publisher)

| Probe | Expected | Result |
|---|---|---|
| Replay the admit and the accept with the same body and key | 200 replay, same event | ✔ |
| Same key with a different body | 409 `idempotency_conflict` | ✔ |
| Replay the freshness approval | 200 replay | ✔ |
| Library body that also names a `clusterId` | 400 | ✔ |
| Story context for the library assertion | 409 `assertion_not_associated` | ✔ |
| Library context for the story assertion | 409 `assertion_story_linked` | ✔ |
| No scope at all | 400 | ✔ |
| Library history for the library assertion | 200, 3 events | ✔ |
| Library history for the story assertion | 409 | ✔ |
| History with `scope=evidence_library` plus `clusterId` | 400 | ✔ |

### Story-context regression (`/admin/review`, story 90201)

| Step | Event | Context, cluster | Revision | Recalculation | UI after |
|---|---|---|---|---|---|
| Admit | `admit` | `story`, 90201 | 0→1 | completed; scope `[90201]`; claim snapshot 1, story snapshot 1, status changes 1 | "Unverified", score 10 |
| Accept | `accept_review` | `story`, 90201 | 1→2 | completed; scope `[90201]`; claim snapshot 1, story snapshot 1, status changes 1 | "Provisionally supported", score 63.5 |

- History labels both events "Story 90201".
- Story 90201 is still `draft` (`evidence_status provisionally_supported`) and was not published. The published count is still 1.
- **Story behaviour is unchanged:** the same panel, controls, recalculation scope and score path as before 0076.

### Ledger totals after QA

12 events and 12 jobs: the 7 that were already there, 3 from the library fixture and 2 from the story fixture. Every job completed.

### QA incident, disclosed

**A stale-reference misclick rejected one freshness review** (`freshness-review-6723f146…`, `current`, on the library fixture), and a second click opened the Feed link.

- **Effect:**
  - The rejection only closed that review, as designed: no event, no revision change, no recalculation.
  - It affected the labelled fixture only.
- **Recovery:** a new request was filed and approved (the `mark_current` row above). From then on, element references were re-read before every click.
- **Contributing factor:** a page design issue, recorded in §7.

## 5. Reader QA: deferred (no reader-only identity)

Live reader QA needs an Access identity that is in Preview `TRACE_ADMIN_READERS` but **not** in `TRACE_ADMIN_PUBLISHERS`. A publisher identity cannot prove that readers are denied.

No such identity exists, the same position recorded for LAUNCH-06 and readiness-07. It was not created here, because that means changing Access policy and role secrets, which is the owner's action.

### Automated evidence, re-run for this report (all pass)

| Behaviour | Test |
|---|---|
| The proxy never forwards any reader POST: all admin POSTs, including `assertion-review`, `assertion-reviewer-decision` and `knowledge/freshness`, need the publisher role | `authorisedRoute` in `src/pages/api/admin/[...path].ts`; asserted in `tests/evidence-library-governance.test.ts` (workerRoutes), `tests/assertion-governance.test.ts`, `tests/assertion-reviewer-governance.test.ts` and `tests/stabilisation.test.ts` (`knowledge/freshness` reader POST refused) |
| The Worker refuses a signed reader mutation with 403 and **writes no event**, even with an Evidence Library body | `tests/evidence-library-governance.test.ts` (workerRoutes: reader 403, then event count 0), `tests/assertion-governance.test.ts`, `tests/assertion-reviewer-governance.test.ts` |
| Readers may read governance history | `tests/evidence-library-governance.test.ts`, `tests/editorial-workflow-consolidation.test.ts` |
| Reader requests to extraction execute are refused | `tests/editorial-workflow-consolidation.test.ts` |

**Not covered by automated tests (code inspection only):**
- **Evidence Library page:** it renders decision controls only when `identity.role === "publisher"`, and shows a read-only notice otherwise (`src/pages/admin/knowledge/evidence-library.astro`, lines 19, 35 and 68). Its script is rendered for every role, per the D6 rule.
- **Freshness page:** it returns 403 to any identity that is not a publisher (`src/pages/admin/knowledge/freshness.astro`, line 12).

**Still open:** live reader QA on Preview, which needs a temporary reader-only identity. It must run before 0076 goes to Production.

## 6. D1 usage

From `wrangler d1 insights` on Preview for the 24 hours ending 2026-10-24 09:40 UTC: 783 queries, **20,196 rows read and 887 rows written** in total. The 0076 apply itself is reported in §2 and does not appear in insights. By source:

| Source | Rows read | Rows written | Queries |
|---|---|---|---|
| App traffic during QA: page loads, 5 governance decisions, the freshness request and reviews, probes, audit log and nonces | 8,796 | 881 | 409 |
| Migration verification: FK check, schema objects | 7,486 | 0 | 13 |
| Logical backups (before and after) | 3,240 | 0 | 345 |
| Fixture setup and verification queries | 674 | 6 | 16 |

**Against the pilot budget** (target per batch: ≤ 20k rows read and ≤ 5k rows written; local-acquisition architecture §11):
- **The whole QA session's app traffic fits inside one batch's budget:** 8,796 reads and 881 writes.
- Reads are dominated by page-load list queries over `story_clusters`. The largest, a ranked-source-name cluster listing, took about 3.7k reads across 2 loads.
- The governance writes are small: 160 rows over 16 event-insert attempts, and 50 over 10 job inserts, trigger and index writes included.
- **Audit logging is the largest writer:** 75 audit rows produced 375 written rows.
- Certification overhead (backups and the FK check) is a one-off and is not part of the per-batch budget.

## 7. Observations and recommended changes (not acted on)

1. **Freshness "Reject" was one click with no confirmation, and its note was optional.** Assertion governance always asks for a reason and a confirm step. **Fixed locally after this report; not yet deployed.**
   - **Page:** Reject now opens a reason form, and only "Confirm reject" sends the rejection.
   - **Server:** the Worker and the service both refuse a rejection without a non-blank reason (`rejection_reason_required`, 400) and write nothing.
   - **Tests:** `tests/freshness-reject-reason.test.ts`.
   - **Preview** still runs `69ef289` until the next approved redeploy.
2. **Reader identity.** Create a temporary reader-only Access identity for Preview: in the Access policy and in `TRACE_ADMIN_READERS`, not in `TRACE_ADMIN_PUBLISHERS`. That lets the deferred reader QA, and the LAUNCH-06 reader checks, finally run.
3. **Page-level reader tests.** Add render tests for the Evidence Library page (no controls for readers) and the freshness page (403 for readers), so the role gating is not proved by inspection alone.
4. **Cluster list read cost.** The cluster-listing queries are the biggest readers (about 1.9k rows per load for the largest). They need watching as stories grow, but they are not a pilot blocker.
5. **Fixtures stay on Preview.** Governance events are append-only, so the `qa-seed02-*` rows cannot be removed. They are labelled; story 90201 is a draft and was never published. Archiving 90201 is optional.

## 8. Production and STOP-BURN state (verified after QA)

| Item | State |
|---|---|
| Production Worker `trace-manifest-ingestion` | deployment `43aee63e` from 2026-10-22, unchanged by SEED-02; schedules `[]` |
| Preview Worker | schedules `[]` |
| Production Pages | still `247d3b3a` (`main` at `0351df7`) |
| Production D1 | **0076 not applied**: no 0076 indexes, and no `governance_context` column |
| Public Ask | disabled for Production through PR #2 (`TRACE_AI_PUBLIC_ENABLED = "false"`), which is **not yet merged**; editorial AI is still enabled |

## 9. Next

**Owner decisions:**
- ~~the reader identity (§7.2), then live reader QA~~ done on 2026-10-24 (§10.5);
- ~~a Preview redeploy carrying the freshness reject fix (§7.1)~~ done on 2026-10-24 (§10);
- approval of the seed list (`docs/knowledge-seed/pilot-01.json`, currently "proposed");
- the P-1 decision.

**Each step below needs its own separate approval:**
- V1.1-B seeding pilot batch 1 on Preview;
- 0076 on Production with its own bookmark and preflights;
- the pushes and merges.

## 10. Preview redeploy of the SEED-02 fixes (2026-10-24)

Approved by the owner and run from the [redeploy checklist](trace-v1-seed-02-preview-redeploy-checklist.md), sections 2–5. **Preview only. No migration. Cron stayed `[]`. Production was not touched.**

### 10.1 Preflight and deploy

| Item | Result |
|---|---|
| Source | `codex/trace-v1-seed-01-prerequisites` at `efcec4a`, which contains `9104838` (reject needs a reason) and `1b36ad3` (reject retry safety) |
| Database and configuration diff since `69ef289` | none |
| Local checks | `npm test`, typecheck, `test:security`, `test:diff`, `test:migrations` and `npm run build` all pass. The dry run shows no Cron trigger. |
| Remote preflight | schedules `[]` / `[]`; rollback targets: Worker `d260f0fe`, Pages `59f5ad57`; ledger 12 events / 12 jobs; reference bookmark `000000c5-00000000-0000510e-eafccdd2993639ad4cd06074bc9da63d` |
| Preview Worker | version `c4976ccd-5654-440e-bf3d-ef2949f0a36c` (deployment `48a3cb1b`), tag `efcec4a` |
| Preview Pages | deployment `7d7c81e9` on `launch-05r-preview`, commit `efcec4a` |
| Post-deploy | schedules `[]` / `[]`. Production Worker `43aee63e` and Production Pages `247d3b3a` are unchanged. Unauthenticated `GET` and `POST` on the freshness page and API, and the Evidence Library page, return 302. |

### 10.2 Publisher browser QA (labelled fixtures, built-in browser)

Element references were re-read before every click. A `fetch` counter on the page confirmed when requests were and were not sent.

**Reject flow (`qa-seed02-story-assertion`):**
1. Requested `current` with no blockers. Review `freshness-review-9cfc1c9f…` became pending.
2. **Reject** opened the reason form. Approve and the note were hidden, the reason box had focus, and **0 requests were sent**.
3. **Cancel** closed the form and Approve came back. 0 requests.
4. **Confirm reject** with an empty reason showed "A rejection reason is required." 0 requests; the buttons stayed enabled.
5. **Confirm reject** with a reason sent 1 request. The page showed "Saving…", reloaded, and the review left the pending list.
6. **D1:**
   - the review is `rejected` with the exact note;
   - the ledger is still 12 / 12;
   - the assertion is unchanged (`unknown`, revision 2).

**Retry safety (`fetch` as the publisher):**

| Probe | Result |
|---|---|
| Reject again with the same reason | 200, `replay: true`, same review, `rejected` / `current` |
| Same reason with surrounding spaces | 200 replay |
| A different reason | 409 `rejection_conflict` |
| No note, or a blank note | 400 `rejection_reason_required` (both) |
| Approve the rejected review | 409 `review_rejected` |
| Any reason against the SEED-02 misclick review (rejected with no note) | 409 `rejection_conflict` |

Afterwards D1 shows both reviews with their recorded notes unchanged. No event was added.

**Approve regression:**
- Requested `current` again (`freshness-review-d8770b9d…`) and approved it in the UI.
- **D1:**
  - one new `mark_current` event (`a6444c0c…`) at revision 2→3, linked to the review;
  - its recalculation job completed with `story_scope_json = [90201]`;
  - the assertion is now `current`, and the claim score moved from 63.5 to 68.5;
  - the ledger is **13 events / 13 jobs**;
  - story 90201 is still `draft`, and the published count is still 1.
- Replaying the approval returned 200, `replay: true`, the same `governanceEventId`, and recalculation `replayed`.

**Repeat checks:**
- **Evidence Library:** the library fixture appears only under "accepted"; the story assertion appears under no library filter. Library history: `admit`, `accept_review`, `mark_current`.
- **Review panel, story 90201:** history reads "Admission: pending → admitted · Story 90201", "Editorial review: proposed → accepted · Story 90201", and **"Freshness: unknown → current · Freshness review"**. That last label is review finding #6, seen live for the first time.
- Freshness events are stored with context `evidence_library` and no cluster, by design: the 0076 freshness branch is library-context only. The story recalculation scope still came out as `[90201]`.

### 10.3 D1 usage

`wrangler d1 insights` for the last hour, read about 10 minutes after QA, shows about **593 rows read and 276 written** by the app across 131 queries:
- 35 audit rows produced 175 written rows;
- 24 nonce inserts produced 72;
- review inserts produced 20.

Insights had **not yet** caught up with the approve batch (event, job, snapshots) or the Review-panel load, so these totals are partial. On the SEED-02 per-action rates, the full window stays under 1,000 written rows, far inside the pilot budget.

### 10.4 Outcome

- **Section 5 (publisher QA) passes.** The reject reason form, server-side reason enforcement, retry safety and the approval path all behave as designed on Preview.
- **Section 6 (live reader QA) passes:** see §10.5.
- **Production 0076:** the Preview hold criteria (checklist §8, items 1–2) are now met. It still needs the owner's separate approval of the Production sequence.

### 10.5 Live reader QA (checklist section 6)

**Identity.** The owner created a reader-only Access identity and signed in with it in the built-in browser pane.
- The publisher session had already expired: the Access logout URL returned "No Access cookie found".
- Claude did not sign anyone out and did not change Access or role settings.
- The read-only notice confirmed the reader role before any probe ran.

**Safe probes.** Every write probe used a body that would also be refused for a publisher: a stale expected state, or a nonexistent assertion, review or cluster id. A wrong role could therefore not have written anything.

| Check | Result |
|---|---|
| `/admin/knowledge/evidence-library` (default and `?filter=accepted`) | 200; "You have read-only access. Decisions are recorded by publishers."; **0 decision buttons, 0 forms**; the library fixture is visible under "accepted" |
| Governance history in the page (reader) | Opens and loads all 3 events with the correct labels: "Evidence Library" ×2, then "Freshness review" |
| Evidence Library history API for the library fixture | 200; `admit`, `accept_review`, `mark_current` |
| Story history API (story 90201) | 200; 3 events |
| `/admin/knowledge/freshness` | **403 Forbidden** |
| `POST /api/admin/assertion-review`, Evidence Library body | **403** |
| `POST /api/admin/assertion-review`, story body (cluster 90201) | **403** |
| `POST /api/admin/assertion-reviewer-decision` | **403** |
| `POST /api/admin/knowledge/freshness`: `request`, `approve`, `reject` (with a reason) | **403** each |
| `POST /api/admin/publish-story` and `/api/admin/archive-cluster` (nonexistent cluster) | **403** each |
| D1 afterwards | 13 events, 13 jobs, 4 freshness reviews; 0 rows with the probe keys or ids; both fixture assertions unchanged; 1 published story |
| Schedules and Production | `[]` / `[]`; Production Worker `41f31744` and Pages `247d3b3a` unchanged |

**Observations (not acted on):**

1. **`/admin/review` shows readers "Publish Story" and "Archive (not news)",** with no read-only notice. The server refuses both (403, above), so nothing can be written. But the page offers controls a reader cannot use. The assertion governance controls on the same page *are* role-gated (`data-assertion-governance-role`). This predates SEED-01. *Recommend:* role-gate those controls, or show the read-only notice, in a small follow-up.
2. While the reader opened the history panel, the browser pane reported that the **page wrote to the OS clipboard** during a synthetic click. Claude copied nothing. Check the clipboard before pasting. The likely cause is a copy handler on the page; worth a look in the same follow-up.
3. The reader-only identity stays configured. The owner decides whether to remove it or keep it for later QA.
