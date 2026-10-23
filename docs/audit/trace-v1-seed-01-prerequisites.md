# TRACE V1.1 — SEED-01 seeding prerequisites

**Date:** 23 October 2026
**Branch:** `codex/trace-v1-seed-01-prerequisites`, stacked on `codex/trace-v1-knowledge-10-readiness`.
**Status:** local only. Not pushed, nothing deployed, **no remote migration**.

**Owner decision (23 October):** Option A, first-class Evidence Library governance, approved for **local implementation and testing**. No Preview or Production migration is authorised.

## 1. Delivered

| Item | Commits | Notes |
|---|---|---|
| **C2: Ask published-story predicate** | `305b101` | Ask story evidence and KC-09E vector resolution use the shared `publicStoryEligibilitySql`. The memberless placeholder (Production story 358, 539 claims) is no longer published-story evidence. |
| **C1: evidence and seed inventory categories** | `c25a05e` | KC-11A `evidence_url` (285 Production URLs) and `curated_seed` (`docs/knowledge-seed/pilot-01.json`, 28 sources, `proposed`). Fixes the collector failing on Production (`knowledge_pages`). |
| **Freshness review UI** | `49c1443` | `/admin/knowledge/freshness`, with a D1 trigger-count fix for `stale` approvals |
| **Publisher Ask replay key** | `16f51e4`, `e417837` | Replays only while the governed evidence is unchanged |
| **Evidence Library governance** (the fourth prerequisite) | `fa80f52`, `cf4ff79` and review fixes (§8) | Migration 0076, the shared governance core, freshness alignment, the queue UI, and tests |
| Docs correction | `1869386` | KC-11C is Preview-only in code |

## 2. Schema design: migration 0076 (local candidate)

`db/migration-0076-evidence-library-governance.sql`. Number 0076 is unused on every local branch, including the frozen scheduler candidate (0072). It follows 0074's proven rename, copy, drop and recreate pattern, which applied cleanly to Production on 22 October.

**`assertion_governance_events`** (rebuilt):

| Change | Detail |
|---|---|
| New column `governance_context` | `TEXT NOT NULL DEFAULT 'story' CHECK IN ('story','evidence_library')`. The default keeps a pre-0076 Worker's story inserts valid between migration and deploy; the context/cluster CHECK still refuses a story row without a cluster. The new code always states the context. |
| `cluster_id` | Now **nullable**, still `REFERENCES story_clusters(id) ON DELETE RESTRICT` |
| Context rule | `CHECK((governance_context='story' AND cluster_id IS NOT NULL) OR (governance_context='evidence_library' AND cluster_id IS NULL))` |
| New actions | `mark_current` and `mark_stale`, the freshness approvals. Their CHECK branch requires: `evidence_library` context; a non-null `freshness_review_id`; admission, reviewer state and admission revision unchanged; freshness changed; and, for `mark_current`, `admitted` + `accepted`. |
| New column `freshness_review_id` | `REFERENCES evidence_freshness_reviews(id) ON DELETE RESTRICT`. It must be null for every non-freshness action. |
| Admission and reviewer branches | 0074's CHECKs kept verbatim, plus `freshness_review_id IS NULL` |
| `idx_assertion_governance_events_transition` | 0074's per-transition `UNIQUE`, kept as a **partial** unique index for admission and reviewer actions |
| `idx_assertion_governance_events_revision` | **New** unique `(assertion_id, new_governance_revision)`: exactly one event per CAS revision |
| `idx_assertion_governance_events_freshness_review` | **New** partial unique: a freshness review is applied at most once |
| Retained | All three 0073/0074 indexes and the append-only triggers (`prevent_…_update`, `prevent_…_delete`) |

**`assertion_governance_recalculation_jobs`** (rebuilt):

- the same `governance_context` column (with the same default) and context/cluster CHECK, with a nullable `cluster_id`;
- `story_scope_json` keeps its meaning, and `[]` is a valid bounded scope;
- the identity-immutability trigger now also protects `governance_context`.

**Data migration.** Every existing event and job is copied unchanged and marked `governance_context = 'story'`. Freshness review IDs are `NULL`.

**Queue index.** `idx_claim_assertions_governance_queue (admission_state, reviewer_state, created_at, id)` serves the bounded Evidence Library queue.

## 3. Migration rehearsal and integrity

Rehearsals use `scripts/seed-01/rehearse-0076.mjs` on **local copies**:

| Database copy | Events / jobs before → after | Field-level mismatches | FK check | Integrity | Leftover `_0074` tables | Required objects | Append-only | Result |
|---|---|---|---|---|---|---|---|---|
| Production snapshot (23 Oct, 55,718 rows) | 0 / 0 → 0 / 0 | 0 | 0 violations (whole DB) | ok | none | all 13 present | n/a (no rows) | **ok** |
| Preview snapshot (23 Oct, 1,339 rows; 1,972 D1 rows read, read-only) | 7 / 7 → 7 / 7 | 0 | 0 violations | ok | none | all 13 present | enforced | **ok** |
| Test adapter (`tests/evidence-library-governance.test.ts`), with a real 0074-shaped event | 1 / 1 → 1 / 1 | 0 | 0 | ok | none | all present | enforced | **ok** |

**Replay compatibility on real data.** All **7 of 7** Preview events reproduce their stored `request_fingerprint` exactly from the story-context formula. Their idempotency keys therefore still replay after 0076, and the adapter test proves a pre-0076 key replays through the new service.

**The new uniqueness rule against existing data.** Preview has no duplicate `(assertion_id, new_governance_revision)`; Production has no events. One synthetic test fixture built an impossible history (two transitions out of revision 2) and was corrected.

**D1 notes for the eventual apply:**

- The file has no `BEGIN`/`COMMIT`.
- Renaming `jobs` and then `events` before recreating them mirrors 0074, so SQLite's FK-reference rewriting on `RENAME` stays inside the rebuilt pair.
- Both old tables are dropped child-first.

## 4. Governance, API and UI changes

**One shared core** (`src/lib/server/assertion-governance.ts`). Admission and reviewer decisions run through `governTransition`; freshness approvals reuse `governanceEventStatements` and `settleGovernanceEvent`. There is no second implementation.

`resolveGovernanceScope`:

| Request | Result |
|---|---|
| `clusterId` (context omitted, as from existing callers) | `story` |
| `context: "evidence_library"` with no cluster | `evidence_library` |
| Library context with a cluster | `invalid_scope` |
| Story context without a valid cluster | `invalid_cluster_id` |
| Neither, or an unknown context | `invalid_scope` |

**Story context is unchanged** except for one rule: the selected cluster must be a real story (it has member items), otherwise `cluster_not_story`. This makes exactly one context apply to any assertion, including claims linked only to the memberless placeholder 358. The checks run in the same order (cluster, assertion, association, then membership), with **identical request fingerprints** (`assertion-governance-v1` / `assertion-reviewer-governance-v1`).

**Library context:**

- the assertion must exist;
- its canonical claim must have **no link to a real story**, meaning a cluster with at least one member item; otherwise `assertion_story_linked`. This is checked before the write **and re-checked inside the CAS update**, so a concurrent story link cannot slip through;
- admitting or accepting needs a captured source version whose document is `admitted` (`source_missing` / `source_not_admitted`). Rejection never needs a source.

Transitions, publisher-only authority, reason, request ID, idempotency and CAS are identical in both contexts. Library fingerprints use separate versions that include the context, so **a key cannot be replayed across contexts** (`idempotency_conflict`).

**History.** It carries the context and cluster. Library-scope history is limited to assertions no real story carries; once a claim joins a story, its full history (including the earlier library events) is read through the story. Events are ordered by governance revision. Freshness events are labelled "Freshness review" rather than by context.

**Worker** (`workers/ingestion/index.ts`):

- `/admin/assertion-review` and `/admin/assertion-reviewer-decision` accept an optional `context`. `assertionGovernanceScope` rejects ambiguous bodies with 400 before the service runs.
- `/admin/assertion-governance-history` accepts `scope=evidence_library` (no `clusterId`).
- Freshness approval passes the operator request ID.
- The proxy and role rules are unchanged: readers receive 403 on every mutation.

**UI:**

- **`/admin/knowledge/evidence-library`**, open to readers and publishers. Filters: awaiting admission, awaiting review, accepted, rejected. It is keyset-paginated, 25 per page, with counts capped at 1,000.
- Each row shows: canonical claim and assertion; source URL, version and whether it is current; source admission; chunk excerpt and locators; provenance group; relationship and treatment; all three state axes; reasons it is not yet usable evidence; on-demand history; and publisher-only admit/reject and accept/reject controls built with the existing payload builders.
- The client script is unconditional (the D6 lesson), and the build's role-script verifier passes.
- The Review panel's history now labels freshness events and context through the shared `assertion-governance-history-ui`.

## 5. Recalculation and freshness changes

| Change | Before | After |
|---|---|---|
| Library decisions | n/a | Story scope `[]`. The canonical claim is recalculated and **no story is invented** (`storySnapshotCount 0`). |
| Story decisions | Every cluster linked to the claim, including memberless holding clusters | Selected story **plus real (member) stories**. Production story 358 (539 claims) is no longer rescored on every linked decision. The 25-story bound is unchanged. |
| Freshness approval | Updated `freshness_state` only: no event, no revision bump, no recalculation | One atomic batch: a CAS update over **every column the event guard checks** (claim, admission, reviewer, freshness, revision); the `mark_current`/`mark_stale` event linked to the review; a durable recalculation job over genuinely linked stories; and the review closed **only once its event exists**. The recalculation is then settled, and a replay retries a failed one. **Never blocked by the 25-story bound:** the scope is truncated to the first 25 real stories, which is still more than the old behaviour (none). |
| Freshness rules | | **Unchanged.** `assertTransitionAllowed` still re-checks provenance, current version, locator, conflicts, corrections and URL. The database additionally refuses `mark_current` unless the assertion is admitted and accepted. |
| Pre-existing race | Two concurrent reviews could leave one review "approved" without its transition | Closed: the review update is guarded on the CAS result, and the one-event-per-revision index rejects a duplicate transition |

## 6. Publication and Ask boundaries

- Library decisions report `publicationImpact: "unchanged"`. They create no story and no story link, and do not change any public story's evidence (tested).
- Ask TRACE is unchanged:
  - story evidence still requires a public story;
  - knowledge evidence still requires an approved mapping;
  - the two-independent-group conclusion policy (P-1) is untouched.
- A library assertion that is admitted, accepted and current but not mapped is **not** returned by either retrieval path (tested). The queue shows "no publication path".
- Public Ask stays disabled (`d89850b` on PR #2). Editorial AI stays on.

## 7. Tests

**New:** `tests/evidence-library-governance.test.ts`. Every required case is covered:

- story regression;
- library admission and review;
- invalid context/cluster combinations at the service, Worker and database layers;
- missing source or assertion;
- forged story association;
- stale state;
- concurrent and racing decisions;
- replay;
- conflicting keys, including across contexts;
- append-only history;
- recalculation with zero stories and with genuinely linked stories (holding cluster excluded);
- reader rejection;
- unreviewed and unmapped evidence excluded from Ask;
- the publication boundary;
- migration preservation with FK and integrity checks, plus pre-0076 key replay;
- **largest bound-parameter count observed across the suite: 29 (D1 limit 100).**

**Updated:**

- the editorial-workflow fixture: explicit `story` context, and a corrected impossible revision history;
- the two bound-scope tests: their 25 clusters now have members.

**Results** (final state): `npm test`, typecheck, `astro check`, `test:security`, `test:diff`, `test:migrations`, `test:evidence-policy`, `test:knowledge-markdown` and `npm run build` all pass. See §8 for the post-review rerun.

## 8. Independent review

A separate review agent read `eb642f0..HEAD`. It modified nothing and confirmed one finding with a repro. Outcomes:

| # | Finding (severity) | Outcome |
|---|---|---|
| 1 | A freshness approval could commit **without its governance event** when a concurrent writer changed `reviewer_state` or `canonical_claim_id` without bumping the revision (claim-match review does this). Confirmed by repro. (medium-high) | **Fixed.** The CAS covers every guarded column, and the review closes only once its event exists. A regression test injects the concurrent write before the batch; **it fails on the pre-fix code and passes now.** |
| 2 | `governance_context NOT NULL` with no default caused an outage window between migration and Worker deploy (medium) | **Fixed:** `DEFAULT 'story'`, tested. The reverse order (new Worker on a pre-0076 database) still fails safely with 503, so the certification sequence applies the migration **before** the deploy. |
| 3 | Freshness approvals, including `mark_stale`, could be blocked by the 25-story bound (medium-low) | **Fixed:** truncated, never blocked. Tested with 26 real stories. |
| 4 | Library "no real story" check was time-of-check/time-of-use (low) | **Fixed:** re-checked inside the CAS. Tested with a concurrent link. |
| 5 | Ambiguous dual context for claims linked only to memberless clusters (low) | **Fixed:** story context requires a real story (`cluster_not_story`). Tested. |
| 6 | Freshness events were labelled "Evidence Library" in story history (low) | **Fixed:** labelled "Freshness review" |
| 7 | Library-scope history returned any assertion's history (low) | **Fixed:** library scope only for assertions no real story carries. Tested. |
| 8 | Migration preflight: duplicate revisions; 0068 present (low) | **Verified:** no duplicates on the Preview or Production snapshots; `evidence_freshness_reviews` exists in both. The check is added to §10. |
| 9 | History shows the oldest 50 events when truncated (informational, existing) | **Kept.** Oldest-first truncation is a pinned contract (`editorial-workflow-consolidation` test). Recorded in §12. |

Separately noted, not changed: `claim-match-review.ts` updates `reviewer_state` and `canonical_claim_id` without bumping `assertion_governance_revision`. Finding 1's fix makes governance safe against it, but it should bump the revision in its own change (§12).

**Post-review results:** `npm test`, typecheck, `astro check`, `test:security`, `test:diff`, `test:migrations`, `test:evidence-policy`, `test:knowledge-markdown` and `npm run build` all pass. Both 0076 rehearsals re-ran clean after the default change.

## 9. Remaining blockers and owner decisions

1. **Applying 0076 to Preview** needs separate approval, then the Preview Worker and Pages deploys.
2. **The seed list approval:** `docs/knowledge-seed/pilot-01.json` is `proposed`.
3. **P-1** (single-primary-source facts), owner decision. It is not needed to start the pilot.
4. **Production** 0076 and code, after Preview certification, with separate approval.

## 10. Proposed Preview certification sequence (each step needs approval)

1. Run read-only preflights on Preview: no duplicate `(assertion_id, new_governance_revision)`, and `evidence_freshness_reviews` exists. Take a Time Travel bookmark of Preview D1.
2. Apply **0076 only** to Preview. Verify against the rehearsal: 7 events and 7 jobs preserved, FK check 0, integrity ok, objects present.
3. **Immediately** deploy the Preview Worker and Preview Pages from this branch: migrate first, then deploy; never the reverse. Cron stays `[]`; confirm schedules are `[]`.
4. Publisher QA on Preview, using a **labelled disposable library fixture**: one captured, located source with an assertion that no story carries.
   - Admit, then accept, in the Evidence Library.
   - Confirm the history, the empty story scope, and that no story was created.
   - Request and approve `current` in Freshness review. Confirm the `mark_current` event and the recalculation.
   - Replay each action (expect replays) and try a story-context spoof (expect 400 or 409).
5. Reader QA on Preview: the library page and history are visible, no controls are shown, and direct POSTs return 403.
6. Story-context regression on Preview: admit and accept on a story assertion in `/admin/review`. Confirm unchanged behaviour and the context label in history.
7. Check the D1 rows read and written from the step-4 actions against the pilot budget.
8. Report. Then, separately: the V1.1-B seeding pilot (batch 1) on Preview.

## 11. Recommended next mission

**SEED-02: Preview certification of SEED-01, then pilot batch 1.** Apply 0076 to Preview, deploy and run §10. Then, with the seed list approved, execute seeding-plan batch 1 (≤ 25 sources, including the v3 two-pass identity check) through the Evidence Library and freshness queues, and run the Ask evaluation suite in deterministic mode.

## 12. Other observations (not acted on)

1. **Public Ask replay** is keyed per visitor per day. Revisit before V1.2.
2. **`/admin/ask` secret fallback** (`"admin-research"`) should fail closed.
3. **`model-data.ts`** is unsuitable as the ADR 0019 catalogue source.
4. **The placeholder cluster 358** still links 539 claims. Story context now refuses it (`cluster_not_story`), so those claims are library-governed; consider archiving it under the D-1 triage.
5. **`claim-match-review.ts`** changes `reviewer_state` and `canonical_claim_id` without bumping `assertion_governance_revision`. Governance is safe against this now, but the revision should advance there too.
6. **History truncation** keeps the oldest 50 events (pinned contract). With freshness events in the ledger, a newest-first option may be wanted later.
