# TRACE V1.1 — SEED-01 seeding prerequisites

**Date:** 23 October 2026
**Branch:** `codex/trace-v1-seed-01-prerequisites`, stacked on `codex/trace-v1-knowledge-10-readiness`. Local only: not pushed, nothing deployed, no migration.

## Delivered

| Item | Commit | Notes |
|---|---|---|
| **C2: Ask published-story predicate** | `305b101` | `retrievePublishedEvidence` and KC-09E vector story resolution now use the shared `publicStoryEligibilitySql`. The memberless placeholder (Production story 358, 539 claims) no longer counts as published-story evidence. Regression test added. |
| **C1: evidence and seed inventory categories** | `c25a05e` | KC-11A gains `evidence_url` (285 URLs on Production: 160 legacy-accepted, 125 legacy-proposed) and `curated_seed` (`docs/knowledge-seed/pilot-01.json`, 28 sources, `proposed`). **Also fixes the collector on Production:** it unioned `knowledge_pages`, which Production lacks, so a Production inventory failed outright. |
| **Freshness review UI** | `49c1443` | `/admin/knowledge/freshness`: pending reviews (approve or reject) and candidate assertions, each showing which gate blocks `current`. Bounded and read-only; writes go through the existing signed route, which re-checks every gate. |
| **D1 trigger-count fix in freshness approval** | `49c1443` | Approving a `stale` proposal fires `trg_claim_assertions_expiry_requeue`, so D1 reports 2 changes and the approval was returned as a replay. Proven with the trigger-counting adapter; the test fails without the fix. |
| **Publisher Ask replay key** | `16f51e4`, `e417837` | `/admin/ask` replayed the first answer to a question for 7 days, to every publisher, even after the evidence changed. That would hide each seeding batch's effect. The key now includes a fingerprint of the governed evidence state. |
| Docs correction (from KNOWLEDGE-10) | `1869386` | KC-11C is Preview-only in code (`knowledge-source-backfill.ts:259,343,427,682`). Production absorption needs its own reviewed change. |

**Tests:** `npm test` (all suites, including 4 new test files), `test:security`, `test:diff`, `test:migrations`, `test:evidence-policy`, `test:knowledge-markdown`, `astro check` (0 errors, 0 warnings) and `npm run build` all pass.

## Not delivered: blocked on a design decision

**The assertion governance queue cannot be built without a schema change.**

Admission and reviewer governance are story-scoped **in the database**, not just in the UI:

- `assertion_governance_events.cluster_id INTEGER NOT NULL REFERENCES story_clusters(id)` (migration 0073; 0074 likewise);
- `assertion_governance_recalculation_jobs.cluster_id INTEGER NOT NULL`;
- `governAssertionAdmission` and `governAssertionReviewerDecision` require a positive `clusterId` and a `story_claims` link, and otherwise return `assertion_not_associated`.

KC-11D historical extraction, and therefore every seeded assertion, deliberately creates assertions **without** a story link. Those assertions can never be admitted or accepted, so they can never pass the freshness gate or reach Ask TRACE. **The seeding pilot cannot complete under the current model.**

### Options

| Option | What changes | For | Against |
|---|---|---|---|
| **A. Evidence-library governance context (recommended)** | A migration rebuilds both tables with a `governance_context` column (`story` or `evidence_library`) and a nullable `cluster_id`, enforced by a CHECK (story ⇒ cluster set; library ⇒ cluster null). Server: a library path for assertions whose canonical claim has no story link; recalculation scoped to the canonical claim. UI: the governance queue reuses the existing panels. | The correct model: evidence is governed independently of stories. One audit log. Production's governance tables are **empty**, so the rebuild is trivial there; Preview's QA rows are preserved. | Rebuilding immutable audit tables (triggers re-created). Needs migration approval now and a Production apply later. |
| B. Parallel table | An additive `assertion_library_governance_events` table and jobs table | No rebuild of existing tables | Two governance logs, duplicated history, recalculation and UI. Harder to audit. |
| C. Review-context story | Create a **draft, never-published** "evidence review" cluster per pilot batch and link seeded claims to it | No schema change; works today | Recreates the placeholder anti-pattern. Governance events would claim a story context that is fictional. |

**Recommendation: A.** If approved, the next step is a migration plus server and UI change, local tests on the D1-faithful adapter, then a Preview migration and deploy (each with its own approval).

## Other observations worth changing (not acted on)

1. **Freshness transitions are outside the governance log.** `approveFreshnessReview` changes `claim_assertions.freshness_state` but writes no `assertion_governance_events` row, does not bump `assertion_governance_revision` and creates no recalculation obligation. Admission and review decisions do all three. A `current` promotion changes Ask eligibility with only the `evidence_freshness_reviews` row as audit, and evidence scores are not recalculated. Option A is the natural place to align this.
2. **Public Ask replay** is keyed per visitor per day, so the same visitor gets the same answer for the rest of the day even if the evidence changes. That is acceptable while public Ask is off; revisit before V1.2.
3. **`/admin/ask` secret fallback.** If `TRACE_INTERNAL_SERVICE_SECRET` is missing, the route hashes with the literal `"admin-research"`. It is only used for hashing, but it should fail closed like the public route does.
4. **`workers/ingestion/model-data.ts`** (regex catalogue extraction with a static July model list) is unsuitable as the ADR 0019 catalogue source (open-model plan, §1).
