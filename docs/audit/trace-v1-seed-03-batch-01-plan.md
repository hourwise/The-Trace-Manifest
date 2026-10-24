# TRACE V1 — SEED-03: first curated source batch (pilot-01, batch 1)

**Date:** 2026-10-24
**Branch:** `codex/trace-v1-seed-03-batch-01`, kept separate from the SEED-01/02 deploy branch
**Status:** **local preparation only.** Nothing has been registered, captured, fetched or written. There were no remote reads either.
**Machine-readable batch:** [`docs/knowledge-seed-batches/pilot-01-batch-01.json`](../knowledge-seed-batches/pilot-01-batch-01.json) (kept outside `docs/knowledge-seed/`, which the KC-11A inventory reads as seed lists and fails closed on anything else), validated by `tests/seed-batch-01.test.ts`.
**Basis:** [seeding plan](trace-v1-knowledge-10-seeding-plan.md) §2–§6, [`pilot-01.json`](../knowledge-seed/pilot-01.json) (still `proposed`), and the Ask evaluation suite.

**Policies in force:**
- P-1 is unchanged: `supported` needs two independent provenance groups.
- Public Ask stays disabled until V1.2; evaluation runs on `/admin/ask` in deterministic mode.
- 0 paid inference calls; 0 Vectorize operations.
- STOP-BURN is active, with Cron `[]`.

## 1. Batch composition: 25 of the 28 pilot sources

**Batch 1** is S01–S24 plus S28, exactly the 25-record ceiling of one plan (`BACKFILL_CEILINGS.maxRecords`).

**Held for batch 2:** S25, S26 and S27. They are the single-primary-source P-1 tests, so they wait for the owner's P-1 decision.

| # | Source | Role | Registry | Independence group | Questions | Pin at capture | Risk |
|---|---|---|---|---|---|---|---|
| S01 | MCP specification | primary | 115 | mcp-project | G01, G02 | spec revision date | |
| S02 | MCP TypeScript SDK | primary | 35 | mcp-project | G02 | commit SHA | Same group as S01: never a second group |
| S03 | Anthropic MCP announcement | vendor | 4 | anthropic | G01 (context) | dated page | **v3 two-pass stability check** |
| S04 | OpenAI function-calling guide | vendor | 3 | openai | G01, G03 | undated | May capture as `metadata_only` (client-rendered) |
| S05 | Berkeley Function Calling Leaderboard | independent test | **register** | bfcl-maintainers | G03 | leaderboard version | Methodology only, not values |
| S06 | OpenAI structured-outputs guide | vendor | 3 | openai | G04 | undated | As S04 |
| S07 | OWASP Top 10 for LLM Applications | research | **register** | owasp | G05, G07 | edition year | **Stability check** |
| S08 | NCSC: prompt injection is not SQL injection | government | **register** | uk-ncsc | G05 | dated post | **Stability check**; Open Government Licence |
| S09 | OWASP Secrets Management Cheat Sheet | research | **register** | owasp | G07 | living page | Same group as S07 |
| S10 | Anthropic: Building effective agents | vendor | 5 | anthropic | G06, G08 | dated article | Vendor guidance only |
| S11 | RAG (Lewis et al.) | research | 24 | rag-paper-authors | G09 | arXiv vN | Abstract only |
| S12 | Agentic RAG survey | research | 24 | agentic-rag-survey-authors | G19 | arXiv vN | Abstract only |
| S13 | Lost in the Middle | research | 24 | lost-in-the-middle-authors | G10 | arXiv vN | |
| S14 | RULER | independent test | 24 | ruler-authors | G10 | arXiv vN | |
| S15 | τ-bench (pass^k) | independent test | 24 | tau-bench-authors | G20 | arXiv vN | |
| S16 | GPTQ | research | 25 | gptq-authors | G11 | arXiv vN | |
| S17 | AWQ | research | 25 | awq-authors | G11 | arXiv vN | |
| S18 | llama.cpp quantize README | primary | 29 | llama-cpp-project | G11 | commit SHA | |
| S19 | llama.cpp multi-GPU docs | primary | 29 | llama-cpp-project | H06, H11 | commit SHA | |
| S20 | SWE-bench paper | independent test | 27 | swe-bench-maintainers | G15, G16 (context) | arXiv vN | |
| S21 | SWE-bench site | independent test | **register** | swe-bench-maintainers | G16 | observation date | Same group as S20 |
| S22 | OpenAI: no longer evaluating SWE-bench Verified | vendor | 1 | openai | G16 | dated post | Attributed critique |
| S23 | LiveCodeBench | independent test | 24 | livecodebench-authors | G15 | arXiv vN | |
| S24 | Terminal-Bench | independent test | **register** | terminal-bench-maintainers | G15 | version label | Methodology only |
| S28 | OpenAI reasoning guide | vendor | 3 | openai | G21 | undated | As S04 |

**Registration before capture (6 sources):** S05, S07, S08, S09, S21 and S24. The proposed tier, treatment and licence position for each is in the JSON. Each licence is confirmed at registration and never assumed.

## 2. Capture plan: one plan, `private_full_text` (owner decision)

The plan applies **one storage mode to every record** (`BackfillSelection.storageMode`, default `metadata_only`).

**Only `private_full_text` creates evidence.** It stores the body and gives a `captured` version with locator-backed chunks ([`source-capture.ts`](../../src/lib/server/source-capture.ts), lines 171–175). `short_excerpt` and `metadata_only` captures stay `metadata_only`, and those are **never evidence**.

So batch 1 is a **single plan with `storageMode: private_full_text`**:
- full text stays private in Preview R2;
- public surfaces only ever show bounded excerpts.

This is a copyright and retention decision for the owner (§7). A source the owner will not hold privately in full is dropped from the batch rather than captured as `metadata_only`.

**Sequence.** These are seeding-plan §3 steps 1–5, with the gates unchanged:
1. Register the 6 new sources.
2. Build a KC-11A snapshot containing **only** the batch-1 seed URLs.
3. Dry-run the plan and record the plan hash, request count and byte estimate. ⛔ The owner approves that plan hash.
4. Execute at concurrency 1, observing after **every** execute call (`hasMore` continuation). This includes the second pass of the v3 stability check on S03, S07 and S08.
5. Observe the outcomes. ⛔ Continue or stop.

**Execution prerequisite:** the SEED-02 Preview redeploy has passed its publisher QA ([checklist](trace-v1-seed-02-preview-redeploy-checklist.md) §5). Governance step 10 relies on the reason-required freshness reject.

## 3. Expected assertions and review requirements

Each source carries 1–2 **expected assertions**. Each one is a reviewer prompt (`lookFor`) with the fields it should have:
- `claimClass`, `sourceRole`, `relationship`, `directness` and `treatment`;
- every value is validated against the `claim_assertions` CHECK lists in migration 0032.

**These are expectations, not findings.** An assertion is admitted only when the captured, located span supports it.

Rules built into the batch:
- **Vendor sources** (S03, S04, S06, S10, S22, S28) use `source_role = reported_claim` and relationship `reports`.
  - A vendor's description of its **own feature** (S04, S06, S28) is `factual_support`.
  - Vendor **guidance or critique** (S03, S10, S22) is `attributed_opinion`.
- **Background** (S03, and S20 for G15/G16) is `contextualises`, which Ask leaves **unrated**. It never carries a conclusion.
- **Independent and primary evidence** is `evidence` + `direct` + `factual_support` + `supports`. That is the only combination Ask rates **strong** (`ask-evidence.ts`, `canonicalEvidenceQualitySql`).
- **Independence groups** are declared up front. Two sources in one group (S01/S02, S07/S09, S20/S21, S18/S19, and the four OpenAI pages) **never** count as two groups.
- **Never admitted:**
  - `metadata_only` captures;
  - PDF bodies;
  - leaderboard values without a version, harness and date;
  - anything from a `held_for_review` item before its drift is resolved.
- **Freshness** uses the interval listed for each source: 90 days for docs and living pages, 365 days for dated posts, "stable" for arXiv abstracts, and "on revision" for the MCP spec. Every freshness rejection records a reason.

## 4. D1 budgets

| Phase | Target | Hard stop | Control |
|---|---|---|---|
| Capture and extraction (steps 2–6) | ≤ 20,000 reads; ≤ 5,000 writes | **50,000 reads / 10,000 writes per batch** (seeding plan §4) | After the first **3 records**, take the per-record average from the `d1 info` delta and project it to 25. **Stop** if the projection exceeds the hard stop, and rescope before continuing. |
| Governance (steps 7–10) | ≤ 5,000 writes per session | Same batch stop | **≤ 40 assertions per governance session.** The SEED-02 measured rate is about 120 written rows per assertion: admit, accept, freshness request and approve, with events, jobs, audit, nonces and score explanations included. 40 × 120 = 4,800. |
| Mapping, recalculation and evaluation (steps 11–14) | ≤ 20,000 reads | Same | Read-dominated. Measure on the first evaluation run. |

**Other limits:**
- **Requests:** ≤ 28, which is 25 fetches plus 3 stability second passes. The pilot cap is 64.
- **Bytes:** ≤ 512 KiB per record and ≤ 5 MiB per batch.
- **R2:** private full text stores the original and the extraction JSON, so the worst case is about 2 × fetched bytes, roughly 10 MiB. That is at the pilot limit; watch it after step 4.
- **Retries:** ≤ 2 per item. A `failed_terminal` item needs a new plan, and no retry or reset is added.

**Why the projection rule matters:** the capture ceilings alone do not keep writes under the stop. At the ceilings, 25 × 200 blocks is already 5,000 chunk rows before indexes, FTS and candidates. Expected volumes are much lower: 11 arXiv abstracts and mostly mid-sized pages. But the measured projection after 3 records is the control, not this estimate.

## 5. Forecast for batch 1 alone (P-1 unchanged)

Groups below are the distinct independence groups that can provide each strength of evidence, computed from the batch file.

| Question | Expected after seeding | Strong groups | Vendor (moderate) | Batch-1 forecast |
|---|---|---|---|---|
| G05 prompt injection | supported | owasp, uk-ncsc | – | **Likely** |
| G10 long context | qualified_lean | lost-in-the-middle, ruler | – | **Likely** |
| G11 4-bit quantisation | multiple_positions | gptq, awq, llama-cpp | – | **Likely** |
| G15 coding benchmarks | qualified_lean | livecodebench, terminal-bench | – | **Likely** |
| G02 MCP transports | insufficient (single primary) | mcp-project | – | **Likely** (correctly insufficient) |
| H06, H11 multi-GPU | insufficient | llama-cpp | – | **Likely** (correctly insufficient) |
| G03 reliable tool calling | qualified_lean | bfcl | openai | Plausible |
| G16 SWE-bench Verified | multiple_positions | swe-bench | openai | Plausible |
| G09 RAG versus fine-tuning | qualified_lean | rag-paper | – | Uncertain: no comparative study |
| G01 MCP versus function calling | supported | mcp-project | openai | **Gap:** no independent explainer |
| G04 structured outputs versus JSON mode | supported | – | openai | **Gap:** one provider only |
| G06 approval for shell commands | qualified_lean | – | anthropic | **Gap:** no independent security guidance |
| G07 secrets for agents | supported | owasp only (S07 and S09 are one group) | – | **Gap:** needs non-OWASP guidance |
| G08 multi-agent | multiple_positions | – | anthropic | **Gap:** no independent research |
| G19 agentic RAG | supported | agentic-rag-survey | – | **Gap:** no independent explainer |
| G20 pass^k | supported | tau-bench | – | **Gap:** no independent evaluation guidance |
| G21 reasoning effort | supported | – | openai | **Gap:** one provider only |

**Result:** 7 of 18 targeted questions are likely, 2 more are plausible and 1 is uncertain, so at most 10/18 ≈ **56%**. That is **below the 60% pilot pass target** even before any capture loss (S04, S06 and S28 may come back `metadata_only`).

**Recommendation:** keep batch 1 as composed. It is the full plan ceiling and establishes the chain. Fill the gaps in **batch 2**:
- the 3 P-1 test sources;
- up to 8 **second-group sources**, chosen and URL-verified at approval time.

The seeding plan already names one resolved candidate: Anthropic's extended-thinking documentation, a second provider for G21.

The gap questions need:
- an independent explainer for each of G01, G19 and G20;
- a second provider for G04;
- independent agent-security guidance for G06;
- non-OWASP secrets guidance for G07;
- independent multi-agent research for G08.

With those sources, the forecast rises to about 14–16 of 18. The forecast is never reported as a result.

## 6. Stop conditions (unchanged from the seeding plan)

Any one of these halts the batch:
- more than 30% of items `failed_*` or `held_for_review`;
- any budget in §4 exceeded, or projected to be;
- the v3 stability check fails on more than one of S03, S07 and S08;
- any write outside Preview;
- any Cron or queue activity.

## 7. Owner decisions before execution

1. **Approve the seed list and this batch:** `pilot-01` and `batch-01` move from `proposed` to `approved`.
2. **Private full-text retention** for all 25 sources in Preview R2, or name the sources to drop.
3. **Registration** of S05, S07, S08, S09, S21 and S24 with confirmed licence terms.
4. **Batch 2 composition:** the second-group sources for G01, G04, G06, G07, G08, G19, G20 and G21.
5. **P-1:** whether S25–S27 run as P-1 tests. This doesn't block batch 1.

Execution itself stays gated as in §2. The plan-hash approval at step 3 is separate.

## 8. What was not done

- No registry rows were created.
- No snapshot, plan or capture was run.
- No URL was fetched.
- No D1, R2 or Vectorize read or write was made, and nothing changed on Production.
- PR #2 and the SEED-02 deploy branch are untouched.
