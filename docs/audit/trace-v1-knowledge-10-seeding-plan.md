# TRACE V1 — KNOWLEDGE-10 controlled Preview seeding plan

**Date:** 23 October 2026
**Release line:** V1.1 (knowledge foundation).
**Environment:** **Preview only:** `trace-manifest-db-preview` (`f312f662-…`), the Preview Worker and the Preview R2 bucket.
**Status:** plan only. Nothing has been captured, seeded or scheduled.

**Execution requirements:**
- separate owner approval of the source list and of each batch;
- STOP-BURN stays active and Cron stays `[]`;
- no Production write.

## 1. Purpose

Prove the full chain once, on a small, deliberately chosen corpus:

**captured → mapped → provenance established → reviewer-approved → freshness accepted → retrieved → cited answer validated.**

Measure how many of the questions in the Ask evaluation suite become answerable. The pilot also proves the route that the legacy-absorption plan reuses later.

## 2. Seed corpus: 28 sources

**Selection rules:**

- Sources answer questions in the evaluation suite and support the conceptual knowledge documents that are easiest to make Ask-ready (readiness report, §6).
- Prefer primary specifications, papers and independent methodologies.
- Every URL was **resolved on 23 October 2026** (HTTP 200). Titles were confirmed for the arXiv, NCSC and Terminal-Bench pages.
- No source is already captured on Preview or Production as a locator-backed version. Production holds only 33 metadata-only versions, and none of them is on this list.

**Column key:**

- **Role:** P = primary or authoritative for its own subject; I = independent; V = vendor statement (`reported_claim`); M = methodology.
- **Registry:** the existing `sources` ID if one exists; "new" means it must be registered before capture.
- **Format** is the expected capture format.
- **Review** is the likely reviewer effort.

| # | Topic | Source (URL) | Tier / role | Registry | Target questions and docs | Format | Freshness need | Limits | Review |
|---|---|---|---|---|---|---|---|---|---|
| S01 | MCP | MCP specification, `https://modelcontextprotocol.io/specification/latest` | A / P | 115 (docs), 35 (spec repo) | G01, G02; KD 07 | HTML | On spec version change | Version the URL by spec revision at capture | M |
| S02 | MCP | MCP TypeScript SDK, `https://github.com/modelcontextprotocol/typescript-sdk` | A / P | 35-family | G01, G02 | GitHub HTML/Markdown | 90 d | Passed v2 identity stability in KC-11C | L |
| S03 | MCP | Anthropic MCP announcement, `https://www.anthropic.com/news/model-context-protocol` | A / V | 4 | G01 (history) | HTML | 365 d | **The v3 two-pass stability check page** (readiness, §7) | L |
| S04 | Tool calling | OpenAI function-calling guide, `https://platform.openai.com/docs/guides/function-calling` | A / V | 3 | G01, G03 | HTML (may need JS) | 90 d | Capture may be `metadata_only` if the page is client-rendered. That outcome is recorded honestly. | M |
| S05 | Tool calling | Berkeley Function Calling Leaderboard, `https://gorilla.cs.berkeley.edu/leaderboard.html` | B / I+M | new | G03 | HTML | 90 d | Leaderboard values change; capture the methodology section | M |
| S06 | Structured outputs | OpenAI structured outputs guide, `https://platform.openai.com/docs/guides/structured-outputs` | A / V | 3 | G04; KD 26 | HTML | 90 d | As S04 | M |
| S07 | Security | OWASP Top 10 for LLM Applications, `https://genai.owasp.org/llm-top-10/` | B / I | new | G05, G07; KD 15 | HTML | 365 d | | M |
| S08 | Security | UK NCSC, "Prompt injection is not SQL injection", `https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection` | A / I | new | G05; KD 15 | HTML | 365 d | Crown copyright (open licence). Store the private full text with bounded excerpts only. | L |
| S09 | Secrets | OWASP Secrets Management Cheat Sheet, `https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html` | B / I | new | G07; KD 16 | HTML | 365 d | | L |
| S10 | Agents | Anthropic, "Building effective agents", `https://www.anthropic.com/engineering/building-effective-agents` | A / V | 4/5 | G08, G06; KD 19, 20 | HTML | 365 d | Vendor guidance, so not independent | M |
| S11 | RAG | Lewis et al., RAG, `https://arxiv.org/abs/2005.11401` | B / P+I | 24 | G09; KD 09 | arXiv abstract (HTML) | Stable | Abstract page only. The PDF is opaque and never Ask evidence. | L |
| S12 | Agentic RAG | Agentic RAG survey, `https://arxiv.org/abs/2501.09136` | B / I | 24 | G19; KD 22 | arXiv abstract | Stable | Abstract only | L |
| S13 | Long context | Lost in the Middle, `https://arxiv.org/abs/2307.03172` | B / I | 24 | G10; KD 12 | arXiv abstract | Stable | | L |
| S14 | Long context | RULER, `https://arxiv.org/abs/2404.06654` | B / I+M | 24 | G10; KD 12 | arXiv abstract | Stable | | L |
| S15 | Agent evaluation | τ-bench (defines pass^k), `https://arxiv.org/abs/2406.12045` | B / I+M | 24 | G20; KD 24 | arXiv abstract | Stable | | L |
| S16 | Quantisation | GPTQ, `https://arxiv.org/abs/2210.17323` | B / I | 25 | G11; KD 27 | arXiv abstract | Stable | | L |
| S17 | Quantisation | AWQ, `https://arxiv.org/abs/2306.00978` | B / I | 25 | G11; KD 27 | arXiv abstract | Stable | | L |
| S18 | Quantisation / runtime | llama.cpp quantize README, `https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md` | A / P | 29 | G11, H-series; KD 27 | GitHub Markdown | 90 d | Pin the commit SHA at capture | M |
| S19 | Multi-GPU | llama.cpp multi-GPU docs, `https://github.com/ggml-org/llama.cpp/blob/master/docs/multi-gpu.md` | A / P | 29 | H06, H11 | GitHub Markdown | 90 d | Pin the commit SHA | M |
| S20 | Benchmarks | SWE-bench paper, `https://arxiv.org/abs/2310.06770` | B / I+M | 27 | G15, G16; KD 05 | arXiv abstract | Stable | | L |
| S21 | Benchmarks | SWE-bench site, `https://www.swebench.com/` | B / M | new | G15, G16 | HTML | 90 d | Leaderboard values change | M |
| S22 | Benchmarks | OpenAI, "Why we no longer evaluate SWE-bench Verified", `https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/` | A / V | 1 | G16; KD 05 | HTML | 365 d | Already a KD 05 source link (KC-08E pending) | L |
| S23 | Benchmarks | LiveCodeBench, `https://arxiv.org/abs/2403.07974` | B / I+M | 24 | G15 | arXiv abstract | Stable | | L |
| S24 | Benchmarks | Terminal-Bench, `https://www.tbench.ai/` | B / M | new | G15 | HTML | 90 d | | M |
| S25 | Releases (P-1 test) | vLLM v0.25.1 release, `https://github.com/vllm-project/vllm/releases/tag/v0.25.1` | A / P | 31 | G13 (legacy story 237) | GitHub HTML | Release-pinned | Tests the single-primary-source policy (P-1) | L |
| S26 | Licence (P-1 test) | Qwen3.8-27B model card, `https://huggingface.co/Qwen/Qwen3.8-27B` | A / P | new (HF model card) | G14; open-model catalogue | HF HTML | On revision change | Pin the HF revision SHA | L |
| S27 | Pricing (P-1 test) | DeepSeek pricing, `https://api-docs.deepseek.com/quick_start/pricing` | A / V | new | G17; gateway pricing review | HTML | 30 d | The page is undated; observation date only | L |
| S28 | Reasoning | OpenAI reasoning guide, `https://platform.openai.com/docs/guides/reasoning` | A / V | 3 | G21; KD 28 | HTML | 90 d | As S04 | M |

**Second-provider and second-group candidates.** These are **research candidates**, not verified for this plan. They are needed to reach two independent provenance groups for some questions:

- Anthropic extended-thinking documentation (`https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking`, resolved) for G21;
- one independent explainer each for G01, G04 and G21. These are to be chosen and verified at approval time.

**Excluded on purpose:**

- social and community posts (discovery only);
- the newest feed items;
- marketplace pages;
- PDFs as evidence;
- the rumoured or unconfirmed items in the research inventory.

## 3. Execution sequence and approval gates

Each step uses existing governed routes. Each ⛔ is an owner approval gate.

| Step | Action | Route or tool | Gate |
|---|---|---|---|
| 0 | Prerequisites: C1 inventory category for a curated seed list (legacy-absorption doc, §6); an **assertion governance queue outside story context** (roadmap, §3: admission and reviewer controls exist only inside the cluster Review panel, and seeded assertions belong to no story); freshness review UI (readiness report, §5.4); a quiet D1 baseline on Preview; the QA-fixture exclusion list (Preview clusters 90001–90110 and the governance fixtures) | Code PR and docs | ⛔ Approve the source list (this table) |
| 1 | Register missing sources (S05, S07–S09, S21, S24, S26, S27) with tier, treatment, licence terms and `copyright_storage_mode` | `/admin/sources` (registry) | Included in the gate above |
| 2 | Build a KC-11A inventory snapshot containing **only** the approved seed URLs | `/admin/knowledge/backfill/snapshot` | |
| 3 | Dry-run plan (plan hash, estimated requests and bytes) | `/admin/knowledge/backfill/plan` | ⛔ Approve the plan hash for batch 1 |
| 4 | Execute batch 1 (≤ 25 items, concurrency 1). Includes the **two-pass v3 stability check** on S03, S07 and S08. | `/admin/knowledge/backfill/execute` | |
| 5 | Observe: per-item outcomes, D1 rows read and written, R2 bytes, Worker CPU, `held_for_review` | `/admin/knowledge/backfill/status`, `d1 info` delta | ⛔ Continue or stop |
| 6 | KC-11D extraction: locator-backed chunks, proposed assertions, match candidates, provenance proposals | Runs within execute (KC-11D) | |
| 7 | Provenance review: accept or reject provenance groups; record independence | `/admin/knowledge/provenance-groups` | Reviewer |
| 8 | Admission review | Assertion governance queue (step 0 prerequisite), reusing the existing admission panel | Reviewer |
| 9 | Editorial acceptance | Assertion governance queue, reusing the existing reviewer panel | Reviewer |
| 10 | Freshness review: `current` with a domain interval (readiness report, §5.3) | `/admin/knowledge/freshness` (UI from step 0) | Publisher |
| 11 | Knowledge mapping: link KD 05, 07, 09, 12, 15, 16, 19, 22, 24, 26 and 27 sections to accepted assertions. Renew their revisions (they are review-due). | `/api/admin/knowledge/map`, revisions | Publisher |
| 12 | Recalculate eligibility and scores (bounded) | `recalculateEvidenceScores` (manual trigger) | |
| 13 | Indexes: FTS rows update by trigger. **No Vectorize writes** unless separately approved (Preview Vectorize exists). | n/a | ⛔ Only if a hybrid test is approved |
| 14 | Run the evaluation suite on `/admin/ask` in **deterministic mode** | Ask evaluation doc, §5 | |
| 15 | Record per-case packets, citations and usefulness scores. Write the pilot report. | Docs | ⛔ Decide on batch 2 / Production |

Batch 2 holds the remaining sources, with the same steps 3–15. There are never more than 2 batches in this pilot.

## 4. Resource limits

| Resource | Limit (pilot) | Source of limit |
|---|---|---|
| Records per batch | ≤ 25 | `BACKFILL_CEILINGS.maxRecords`, unchanged |
| Concurrency | 1 | `maxConcurrency` |
| Bytes | ≤ 512 KiB per record; ≤ 5 MiB per batch | `maxBytesPerRecord`, `maxTotalBytes` |
| Retries | ≤ 2 per item | `maxRetries` |
| Execution time | 30 s per execute call (continuation via `hasMore`) | `maxDurationMs` |
| Extraction | ≤ 200 blocks and ≤ 100 candidates per record; ≤ 10 provenance groups per record | KC-11D ceilings |
| D1 rows read | **Stop if > 50,000 per batch** (measured as the `d1 info` delta against the quiet baseline) | Pilot budget |
| D1 rows written | **Stop if > 10,000 per batch** | Pilot budget |
| R2 | ≤ 10 MiB in total for the pilot | Pilot budget |
| Requests | ≤ 2 × 28 source fetches plus the stability-check passes (≤ 64) | Pilot budget |
| Workers CPU | Stop on any CPU-limit error | Platform |
| Indexing | FTS triggers only; **0 Vectorize operations** | Pilot policy |
| Inference | **0 paid calls.** Deterministic mode only. | Pilot policy |

**Stop conditions (any one halts the pilot):**

- more than 30% of items `failed_*` or `held_for_review` in a batch;
- any budget above exceeded;
- the v3 stability check fails on more than one of the three pages;
- any write outside Preview;
- any unexpected Cron or queue activity.

## 5. Idempotency and recovery cases

| Case | Expected handling (existing behaviour) |
|---|---|
| Already captured source | A content-addressed version identity yields `unchanged`, with no new version |
| Identical version on re-run | `normalized_content_hash_unchanged`, recorded as an observation only |
| Changed content | A new version. Old assertions stay on the old version, and freshness review is required. |
| Failed capture | `failed_retryable` (≤ 2 retries) or `failed_terminal`. Visible in status. |
| Metadata-only source (client-rendered docs) | `metadata_only`. **Not evidence.** Recorded as a pilot finding, not worked around. |
| Source needing manual review (redirect, drift, short body) | `held_for_review` (`historical_source_drift_unresolved`) |
| Duplicate canonical assertion | Deterministic match candidates against existing canonical claims, merged at review |
| Incomplete locator | The assertion cannot pass the freshness gate (`locator_blocks_current`) |
| Partially completed extraction | Execution lease plus item idempotency key; `recoverStaleBackfill` after the 120 s stale lease |
| Stale index entry | FTS triggers update on change. Vectorize is unused. |

**Known retry limitation:** a `failed_terminal` item cannot be retried within the same batch. It needs a new plan. This is an existing, accepted behaviour. **Do not implement retry or reset in this programme.**

## 6. Topic acceptance

A topic (a question with its knowledge-document section) **passes** only when **all** of these hold:

1. at least two sources captured with locator-backed chunks (one is enough only under policy P-1, if the owner adopts it);
2. assertions mapped to the canonical claims the question needs;
3. provenance groups reviewed, with at least two **independent** groups for `supported`;
4. admission and reviewer acceptance recorded;
5. freshness `current` through the freshness review;
6. `/admin/ask` retrieves the assertions for the question wording;
7. the answer meets every criterion A1–A10 in the Ask evaluation doc (§4.1), and every citation resolves.

**A topic does not pass merely because a page was downloaded or indexed.**

### Expected yield (forecast, not a result)

| Group | Questions | Expectation |
|---|---|---|
| Conceptual | G01, G04, G05, G07, G09, G10, G19, G20, G21 | Likely to reach their expected mode |
| Comparative and benchmark | G03, G08, G15, G16 | Need more independent sources; may stay at `multiple_positions` or insufficient |
| Single-primary-source facts | G02, G12, G13, G14, G17 | Remain `insufficient_evidence` unless the owner adopts policy P-1 |

The **pilot pass target** is ≥ 60% of the targeted questions reaching their expected mode (Ask evaluation doc, §4.2). Legitimate insufficient-evidence results are reported, never hidden.
