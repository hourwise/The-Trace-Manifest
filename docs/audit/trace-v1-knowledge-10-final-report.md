# TRACE V1 — KNOWLEDGE-10 final report

**Date:** 23 October 2026
**Mission brief:** `docs/audit/trace-v1-knowledge-10-mission.md`
**Branch:** `codex/trace-v1-knowledge-10-readiness`. Local commits only: **not pushed, not merged, nothing deployed.**

## A. Starting identities

| Item | Value |
|---|---|
| Repository | `D:\Users\fleur\The Trace Manifest` → `hourwise/The-Trace-Manifest` |
| PR #2 | Open, not merged, ready for review. Head `674a1942db20d26f81d6f4acb602000b7dabff5e`. Unchanged at the end of the programme. |
| `origin/main` | `0351df7e64d1faf9456042c468e97efecf934d87`. Unchanged. |
| Scheduler candidate | `a321156a2e085b5d9570e671bc2aa6d54f79d7ec`. The main checkout sits on it, untouched. |
| Release worktree | `D:\Users\fleur\trace-v1-release-09-gates` at `674a194`. Untouched apart from read-only use of its `node_modules/wrangler`. |
| This worktree | `D:\Users\fleur\trace-v1-knowledge-10-readiness`, branched from `674a194` |

## B. Remote inspection

| Item | Value |
|---|---|
| Account | `b7765d4c91a51c079125912afcd840cf` |
| Production D1 | `trace-manifest-db` / `1625036a-ffe2-4103-bf9d-086bae150561` |
| Method | **One** read-only keyset snapshot (2026-10-23 05:52–05:56Z): 113 tables, 55,718 rows. **D1 rows read: 56,338.** All analysis ran locally. |
| Additional live SQL | **0** |
| Other live reads | `d1 info` (twice), Worker deployment status, the schedules API (Production and Preview), Pages deployment list, public GETs (`/ask-trace`, `/stories/ai-evidence-index`, sitemap, RSS, home), and URL status checks for the seed corpus |
| D1 24-hour context | 1,499,397 rows read at 05:52Z and 1,559,302 at 06:18Z. Both windows include the approved 22 October migrations, so they are **not** a quiet baseline. Re-measure after 24 quiet hours. |

## C. Census

Full table: readiness report, §3.

| Measure | Count |
|---|---:|
| Stories published | 98 (one is a placeholder) |
| Stories in review | 37 |
| Draft stories | 2,620 |
| Canonical claims | 1,199 |
| Assertions | 417 |
| Admitted and accepted | 210 |
| Eligible for Ask | **0** |
| Chunks | 0 |
| Provenance groups | 0 |
| Knowledge documents | 30, all review-due since 19 October |
| Knowledge mappings | 0 |
| Extraction-ledger runs | 0 |
| Vector index items | 0 |

The evidence position is unchanged from the Mission 1 snapshot and the October rehearsal, apart from +11 published stories and +40 rule-based claims and assertions.

## D. Legacy absorption

Every Production population is classified A–E (absorption doc, §3). Defects and gaps found:

- placeholder story 358 is marked `published` (not publicly visible; affects the Ask predicate);
- drafts are indexed as `published_story` (no runtime consumer);
- 40 pending assertions are marked `current` without a freshness review;
- vendor knowledge links are mislabelled as independent.

The route is capture → re-extraction → provenance → review → freshness. Legacy assertions cannot be promoted, because all 210 fail five freshness-gate conditions.

**Disposition:** `LEGACY_D1_ABSORBABLE_WITH_NEW_PATHS` (C1–C4; owner decisions D-1 to D-4).

## E. Eligibility funnel

417 → 417 → 417 → 210 admitted → 210 accepted → **0 current** → 0 eligible.

- With freshness removed, 184 would pass retrieval, but none would reach `supported`: there are no provenance groups and no direct evidence.
- 163 of the 223 published-linked assertions come through the placeholder.

## F. Freshness

- 377 are `unknown`: all unreviewed, and all lacking a captured version, chunk, locator and provenance.
- 330 have source ages between 91 and 365 days.
- 162 are on synthesis claims and 25 are Tier C discovery: ineligible regardless.

A triage workflow and per-domain intervals are proposed. The **freshness UI is missing**, though the route exists.

## G. Knowledge documents

All 30 are approved TRACE prose (`internal_synthesis`), with 0 mappings and 0 usable locators, and all review-due. Nine conceptual documents are the cheapest to make Ask-ready: 07, 18, 15, 12, 27, 26, 09, 13 and 21.

## H. Source capture

**Disposition:** `CONTROLLED_SOURCE_CAPTURE_READY_WITH_RESTRICTIONS`.

- The full chain is implemented and bounded (25 records, concurrency 1, 5 MiB). It has never run on Production data.
- The `normalized_content_v3` HTML identity fix exists but is not yet proven live. The first pilot batch must run a two-pass stability check.

## I. Source 93 and M2

- Source 93 (`lmsys_api`) is active, `degraded`, and has never succeeded. Its last attempt was 2026-09-06.
- M2 is `FAIL_CLOSED` on the `sources.ingestion_type` legacy default and domain.
- Decisions S-93 and M2 are required before any Cron. They are separate from the pilot.

## J. Ask TRACE architecture

- **Public Ask is enabled on Production** (`TRACE_AI_PUBLIC_ENABLED=true`). With today's data every answer is a zero-cost governed non-answer.
- Usage: 15 requests in total, all 19–21 July.
- **Owner decision R-1:** keep public Ask visible or disable it for the relaunch.

Component-by-component status is in the readiness report, §9.1.

## K. Retrieval

**Current:** `LIKE` any-term matching. It has poor precision: the out-of-scope "lasagne" question matches 5 assertions and 3 knowledge documents. FTS5 is built but unused. Vectorize is Preview only and not wired into Ask.

**Recommendation:** a phased approach.

1. FTS5 `MATCH`, bm25, a relevance floor, synonyms and a scope gate (V1.1/V1.2).
2. Add Vectorize only if the evaluation suite shows lexical recall failures.

## L. Inference

| Path | Model calls |
|---|---|
| Insufficient evidence, refusal, out of scope | 0 |
| Deterministic mode | 0 |
| Provider mode | Exactly 1 (0 retries) |

**Ceilings:** US$0.02 per request, US$1 per day, US$10 per month. **No paid calls were made.**

The DeepSeek alias and prices have changed (G-1).

## M. Question evaluation

The suite has 30 general cases (22 positive, 8 negative) and 16 hardware scenarios (`tests/fixtures/knowledge-10/ask-evaluation-suite.json`). **Positive questions answerable today: 0 of 22.**

After seeding, the expected modes are:

- 7 `supported`;
- 6 `qualified_lean`;
- 5 `multiple_positions`;
- 5 that stay insufficient because of policy P-1 (single authoritative primary sources).

## N. Seed corpus

28 sources were verified on 23 October: URLs resolved, and titles confirmed for the papers and the NCSC page. They cover MCP, tool calling, security, agents, RAG, long context, evaluation, quantisation, multi-GPU, benchmarks, and three P-1 test cases (seeding plan, §2).

## O. Seeding plan

A 15-step, gated sequence over the existing KC-11A, KC-11C and KC-11D routes and the review routes. At most 2 batches of at most 25 records each, on Preview only (seeding plan, §3).

## P. Resource budget

| Resource | Limit |
|---|---|
| D1 rows read | Stop above 50k per batch |
| D1 rows written | Stop above 10k per batch |
| R2 | ≤ 10 MiB |
| Requests | ≤ 64 |
| Vectorize | 0 |
| Paid inference | 0 |
| Failures | Stop if more than 30% fail or are held |

Local-acquisition budgets are in that document's §11.

## Q. Open-model execution

**Disposition:** `OPEN_MODEL_EXECUTION_DATA_FOUNDATION_REQUIRED`.

- The ADR 0019 structures are almost entirely missing. The current catalogue is regex-extracted and unevidenced.
- Comparator gaps: KV cache, split modes, MoE tiering, compatibility and evidence.
- Strata and NInfer are specialists.
- A pilot of 14 models and 8 runtimes is proposed.
- **First slice:** OM-3, a pure memory-fit library.

## R. Research intake

354 validated records (266 VERIFIED) plus an executive summary. Key results:

- most P0 models are real and open-weight;
- Qwen 4 tiers and Kimi K3.1 are rumoured;
- several intake names resolve to re-quantisations or fine-tunes;
- benchmark-version traps;
- no per-quantisation agentic coding evidence exists anywhere reviewed.

## R2. Local acquisition

**Disposition:** `LOCAL_TRACE_ACQUISITION_CONTRACT_PREREQUISITE_REQUIRED`.

- **L-1:** shrink Cloudflare-scheduled ingestion; research discovery moves local.
- **L-2:** one evidence write path (KC-11).
- **L-3:** Cloudflare re-fetches and verifies.
- **L-4:** no database access from the workstation.
- **Earliest safe slice:** phases A–B (contract and offline packager). No workstation is needed.

## S. Required features

Full table: roadmap, §3. **New seeding prerequisite:** an assertion governance queue outside story context.

| Gate | Features |
|---|---|
| Before seeding | Governance queue, freshness UI, C1 inventory, D1 baseline |
| Before public Ask | C2, FTS `MATCH` and scope gate, knowledge renewal, evaluation harness |
| Before automated ingestion | D1 alerts, source 93 and M2, capture-failure UI, change detection |

D4 is a throughput item and does not block the pilot.

## T. Acceptance targets

Criteria A1–A11, pilot and public-Ask thresholds, and the usefulness rubric (Ask evaluation doc, §4). Topic acceptance is in the seeding plan, §6.

## U. Tests

Run in this worktree after `npm ci`:

| Suite | Result |
|---|---|
| `npm test` | **Pass.** All suites, including the 119-test Worker harness, the D1 parameter-limit tests, KC-11D/G/H, Ask deterministic-first and the new `knowledge-10-ask-suite` fixture test. |
| `npm run test:evidence-policy` | **Pass** (public numeric scores remain disabled) |
| `npm run test:knowledge-markdown` | **Pass** |
| `npm run typecheck` | **Pass** (0 errors, 0 warnings, 5 hints) |
| `npm run test:migrations` | **Pass** |
| `npm run test:security`, `npm run test:diff` | **Pass** |

`npm run build` was not run: no source under `src/` changed.

## V. Changed files

**Documents:**

- `docs/audit/trace-v1-knowledge-10-{mission,legacy-absorption,readiness,ask-evaluation,seeding-plan,local-acquisition-architecture,open-model-execution-plan,final-report}.md`
- `docs/roadmap/trace-v1.1-v1.2.md`
- `docs/research/ai-models-inference-agents-inventory.{md,json}` plus three `inventory-*.md` files

**Scripts (read-only inspection):** `scripts/knowledge-10/{logical-backup-keyset,load-snapshot,census,absorption,ask-coverage,merge-research}.mjs` and a README.

**Tests:** `tests/fixtures/knowledge-10/ask-evaluation-suite.json`, `tests/knowledge-10-ask-suite.test.ts`, plus one `package.json` test-chain entry.

**No application source, migration, configuration or Worker code changed.**

## W. Protection proof (checked 23 October, about 06:20Z)

| Check | Result |
|---|---|
| Production Worker | `41f31744-886a-4b9b-b3e0-05613573a216` at 100%. Unchanged. |
| Production schedules | `[]`; Preview schedules `[]` (schedules API) |
| Production Pages | Latest Production deployment still `247d3b3a` (`0351df7`) |
| PR #2 | Open, head `674a194`, `mergedAt` null |
| Remote branches | `origin/main` `0351df7` and the release branch `674a194` unchanged. This branch is not on the remote. |
| D1 writes | **None:** no Production or Preview D1, R2, KV or Vectorize write; no migration; no secret, Access, Cron or scheduler change; no deployment; no paid inference; no POST to Ask; no backfill or capture executed |

## X. Candidate identity

`codex/trace-v1-knowledge-10-readiness`, parent `674a194`. The final commit hash and tree are in the session's closing report; they cannot be recorded inside the commit that creates them.

## Y. Dispositions

| Area | Disposition |
|---|---|
| Overall | **`KNOWLEDGE_SEEDING_PREREQUISITES_REQUIRED`** |
| Legacy D1 | `LEGACY_D1_ABSORBABLE_WITH_NEW_PATHS` |
| Source capture | `CONTROLLED_SOURCE_CAPTURE_READY_WITH_RESTRICTIONS` |
| Ask TRACE | `ASK_TRACE_EVIDENCE_POPULATION_REQUIRED` |
| Open-model execution | `OPEN_MODEL_EXECUTION_DATA_FOUNDATION_REQUIRED` |
| Local acquisition | `LOCAL_TRACE_ACQUISITION_CONTRACT_PREREQUISITE_REQUIRED` |
| Automated ingestion | `STOP_BURN_STILL_ACTIVE` |
| Relaunch impact | **`NO_RELAUNCH_BLOCKERS_FOUND`**, with one owner decision for the relaunch: R-1, the public Ask posture |

## Z. Recommended next mission (not started)

**TRACE V1.1 — SEED-01: seeding prerequisites.** A single, bounded code mission on a new branch, local and Preview-test only:

1. **C1:** add `evidence_url` and `curated_seed` categories to the KC-11A inventory collector (read-only).
2. **Assertion governance queue:** a publisher page listing pending and proposed assertions outside story context, reusing the existing admission and reviewer panels and routes.
3. **Freshness review UI** over the existing `/admin/knowledge/freshness` route.
4. **C2:** add `sc.is_published = 1` to the Ask published-story predicate, with a regression test for the placeholder case.

All four have tests on the D1-faithful adapter. No migration, no data change and no deployment without separate approval.

**Exit:** the prerequisites are merged and ready for the Preview seeding pilot (V1.1-B).
