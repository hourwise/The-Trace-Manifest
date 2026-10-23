# TRACE V1 — KNOWLEDGE-10 Production knowledge readiness report

**Date:** 23 October 2026
**Scope:** Workstream 2 (census, eligibility, freshness, knowledge mapping, source capture, source 93 and M2) and Workstream 3 (Ask TRACE runtime, retrieval, inference).
**Release lines:** V1.1 and V1.2. None of this blocks the V1 relaunch.
**Companion documents:**
- legacy absorption (`trace-v1-knowledge-10-legacy-absorption.md`);
- Ask evaluation (`trace-v1-knowledge-10-ask-evaluation.md`);
- seeding plan, open-model plan, local-acquisition plan;
- roadmap (`docs/roadmap/trace-v1.1-v1.2.md`).

## 1. Summary

| Milestone | Verdict |
|---|---|
| **Editorial V1** | Release-ready pending PR #2 merge. Nothing found here blocks it. One owner decision is relevant to the relaunch (§2). |
| **Knowledge acquisition** | `CONTROLLED_SOURCE_CAPTURE_READY_WITH_RESTRICTIONS`. The governed capture → extraction → review chain is implemented and bounded, but it has **never run on Production data**. HTML identity stability under `normalized_content_v3` has not yet been demonstrated live (§7). |
| **Ask TRACE** | `ASK_TRACE_EVIDENCE_POPULATION_REQUIRED`. The architecture is sound and deterministic-first. **Production has 0 answer-eligible assertions**, so every answer is a correct, zero-cost "insufficient evidence" non-answer. |

**Key numbers** (Production, 23 October 2026, 05:56Z snapshot):

| Measure | Value |
|---|---:|
| Canonical claims | 1,199 |
| Assertions | 417 |
| Admitted + accepted | 210 |
| Current | 40, all pending (§5) |
| **Answer-eligible** | **0** |
| Source chunks | 0 |
| Provenance groups | 0 |
| Knowledge mappings | 0 |
| Approved knowledge documents | 30, **all review-due since 19 October** |

## 2. Live-state finding relevant to the relaunch: public Ask TRACE is enabled

`wrangler.toml` `[env.production.vars]` sets `TRACE_AI_PUBLIC_ENABLED = "true"`, and the live `/ask-trace` page renders an **enabled** question box: there is no `disabled` attribute on the input or the submit button (checked by a GET on 23 October).

Usage and behaviour so far:

- **Usage:** 15 `ask_trace` requests in total, all between 19 and 21 July. There have been none since, so there is no organic use.
- **Behaviour with today's data** (inferred from code and data; **no POST was sent**): retrieval returns no eligible evidence. `buildAskTraceDecisionPacket` sets `synthesisMode = "none"`, and the gateway returns `safeNonAnswer` through `completeWithoutModel`.
- **Cost exposure:** zero model calls. Each request still records quota, request and audit rows and runs two `LIKE` scans.
- **Production `TRACE_ASK_MODE`:** not in `wrangler.toml`, so it is unverified (it defaults to `provider`). A `DEEPSEEK_API_KEY` secret would be required for `provider` mode. Its presence was not inspected, and secrets are not read.

**Owner decision for the relaunch (not a defect).** Every question currently receives a governed "insufficient evidence" answer. The options are:

- keep public Ask visible as an honest "evidence-limited preview";
- set `TRACE_AI_PUBLIC_ENABLED = "false"` for the relaunch, which the page already supports with a "currently disabled" message, and re-enable it after the V1.1 evidence pilot.

This programme changes nothing.

## 3. Census and comparison

| Area | Mission 1 snapshot | Oct schema rehearsal | **23 Oct 2026** | Notes |
|---|---:|---:|---:|---|
| Stories: published | 86 public | n/a | **98** (97 `is_published`; 1 placeholder) | +11 published since Mission 1; the placeholder is in the absorption doc, §5.1 |
| Stories: review / draft | n/a | n/a | 37 / 2,620 | Draft growth stopped on 2026-09-06 with ingestion |
| Published stories with any story claim | n/a | n/a | **10** (one is the placeholder) | 88 published stories carry no structured claims |
| Canonical claims | 1,159 (legacy claims) | 1,199 | **1,199**, all `active` | 1,159 cut over + 40 rule-based; 0 disputed, superseded or retired |
| Assertions | n/a | 417 | **417** | Unchanged since the rehearsal |
| Admitted + accepted | 210 | 210 | **210** | All reviewed 19–21 July |
| Current + eligible | 0 | 0 | **0** | |
| Source documents / versions | n/a | 33 / 33 | **33 / 33**, all `metadata_only`, `legacy_raw_v1`, 0 R2 objects | |
| Source chunks | 0 | 0 | **0** | |
| Provenance groups | n/a | 0 | **0** | |
| Approved knowledge documents | 30 | 30 | **30**, review due | `review_after = 2026-10-19` for all |
| Knowledge claim / assertion mappings | 0 | 0 | **0 / 0** | 30 source links `pending_review` (KC-08E) |
| Extraction ledger runs / effects | n/a | 0 | **0 / 0** | 0072 is not involved; the ledger has simply never run on Production |
| Search records / FTS | n/a | 3,984 | **3,984** | Drafts indexed as `published_story` (absorption doc, §5.2) |
| Vector index items / operations | n/a | 0 | **0 / 0** | Production has no Vectorize or AI binding |
| Question gaps | n/a | n/a | 1 open | "best open model for running on ram not gpu" |

**What changed since earlier snapshots:**

- 11 more published stories;
- 40 rule-based canonical claims and assertions (from the KC-11 rule extraction on the 33 metadata-only sources);
- the V1 schema is now present on Production (22 October reconciliation).

The **evidence position has not changed.** Every governed table that would make evidence eligible is still empty.

## 4. Eligibility funnel

**Authority.** The funnel follows `retrievePublishedEvidence` in `src/lib/server/ask-evidence.ts` (the story-evidence path) and the gates in `ask-trace-decision.ts` and `evidence-freshness-review.ts`. The exact SQL is in `scripts/knowledge-10/census.mjs`.

| Stage | Cumulative | Passing this stage alone | Main exclusion reason |
|---|---:|---:|---|
| 1. Stored assertions | 417 | 417 | |
| 2. Source identity: legacy evidence map **or** captured version | 417 | 417 | Every assertion has one or the other |
| 3. Role and treatment acceptable (`evidence` / `reported_claim`; not discovery or synthesis) | 417 | 417 | |
| 4. Admitted | 210 | 210 | 207 pending |
| 5. Accepted | 210 | 210 | Same 207 |
| 6. **Current** | **0** | 40 | **All 210 accepted are `unknown`.** The 40 `current` rows are pending. |
| 7. Canonical claim live | 0 | 417 | |
| 8. Captured version usable (non-PDF, extracted) | 0 | 377 | The 40 rule-based rows reference metadata-only versions |
| 9. Legacy feed item published | 0 | 227 | 190 of the 377 legacy assertions cite feed items that never reached `published` |
| 10. Linked to an eligible published story | 0 | 223 | **163 of the 223 come through the placeholder cluster** |
| **Eligible for Ask TRACE** | **0** | | |

**Freshness alone:** with every other stage applied but the freshness stage removed, **184** assertions would pass retrieval. Even then they would not produce an answer:

- `independentEvidenceWeightFor` returns 0 until provenance exists;
- `strong` needs `direct` + `supports` + a provenance group;
- `selectKnowledgeConclusion` needs **two independent provenance groups** for `supported`.

**Knowledge path.** `retrieveApprovedKnowledge` returns the 30 documents only as `internal_synthesis` with independent weight 0. Since 19 October they are also `stale` (review due). They have 0 mapped assertions, so `externalEvidenceResolved = false`. TRACE prose is never independent proof, and the code enforces this correctly.

**Conclusion.** The architecture correctly refuses to answer. Evidence population, not code, is the gap.

## 5. Freshness

### 5.1 Breakdown of the 377 `unknown` assertions

| Dimension | Breakdown |
|---|---|
| Source tier / treatment | Tier A primary-technical 235; A vendor-reported 51; A primary-vendor 36; C discovery 25; A primary-research 18; B independent-reporting 10; other B 2 |
| Source publication age (at 23 October) | ≤90 days: 2. 91–365 days: 330 (194 accepted). >365 days: 40 (14 accepted). No date: 5. |
| Claim domain | model_release vendor claims 140; editorial synthesis 131; security vendor 37; product 27; licence/specification 19; capability 10; hardware 5; research 3; pricing 3; regulation 1 |
| Materiality | high 178; low 132; standard 67 |
| Review metadata | 210 have a reviewer and time (19–21 July); 167 have none. **0 freshness reviews exist.** |
| Source data | **All 377 lack a captured version, chunk, locator and provenance group.** Their source is a feed-item URL plus excerpt. |

### 5.2 Classification

| Category | Count | Basis |
|---|---:|---|
| Genuinely stale | not determinable | Needs the source recaptured and compared. Nothing has been re-observed since July–September. |
| Unknown because never reviewed | 377 | No `evidence_freshness_reviews` rows exist |
| Unknown because the source data is incomplete | 377, the same rows | No captured version, chunk or locator. The freshness gate cannot pass. |
| Old but possibly still valid | ~40 (>365 days) plus the specification/licence claims (19) | Licences, specifications and research findings age slowly. Model-release claims age fast. |
| Ineligible whatever their freshness | 131 (plus 31 of the 40 rule-based) | Assertions on `editorial_synthesis` canonical claims. TRACE prose cannot be evidence. Also 25 Tier C discovery-sourced assertions, which are discovery context only. |

**The 40 `current` rule-based assertions** were never freshness-reviewed (absorption doc, §5.3). Treat them as `unknown`.

### 5.3 Proposed triage workflow (all three axes)

1. **Exclude by rule:** synthesis-claim assertions (162) and Tier C discovery assertions (25). They are recorded and never promoted.
2. **Recapture** the remaining legacy evidence URLs through KC-11C (absorption doc, C1). Compare the content with the original excerpt.
3. **Re-extract** (KC-11D) into locator-backed assertions on the same canonical claim.
4. **Provenance review** (existing `/admin/knowledge/provenance-groups`).
5. **Admission and reviewer review** (existing assertion governance in the Review panel). The legacy acceptance is shown as a prior.
6. **Freshness review** (`/admin/knowledge/freshness`, `requestFreshnessReview` → `approveFreshnessReview`). The interval depends on materiality and domain:

| Claim domain | Proposed review interval |
|---|---|
| Model release, pricing, product, capability | 90 days |
| Security | 30 days, or until the advisory status changes |
| Licence, specification | 365 days, or on source-version change |
| Research finding | 365 days |
| Hardware specification | 365 days |

7. **Stale on change:** when a new captured version differs, the assertion moves to review rather than staying current.

### 5.4 What exists and what is missing

| Capability | State |
|---|---|
| Freshness request, approve, reject (`evidence-freshness-review.ts`) | Implemented and tested; Worker route `/admin/knowledge/freshness` |
| Gate re-check at approval (claim state, corrections, conflicts, provenance, current version, chunk, locator, URL) | Implemented |
| **Freshness review UI** | **Missing.** No admin page calls the route. **V1.1, required before seeding review.** |
| Freshness work queue (due / unknown / changed-version) | **Missing.** V1.1. |
| Expiry recalculation (`recalculateExpiredEvidence`, limits 25/100) | Implemented. Depends on a schedule, so in practice a manual trigger while STOP-BURN is active. |
| Per-domain review intervals | **Missing as policy.** The table above is a proposal. |

## 6. Knowledge documents

| Measure | Count |
|---|---:|
| Approved documents | 30 (11 comparison, 10 how-to, 8 definition, 1 security advisory) |
| Corresponding repository inputs (`docs/Knowledge Input`) | 30 Markdown files, 146 URL references |
| Contain material factual claims | **Most.** 19 are "best model / comparison / value" questions that depend on fast-moving vendor and benchmark facts. The 11 definition and how-to documents ("what is MCP", "context window", "quantization", "prompt injection" and so on) are largely conceptual. |
| Mapped to canonical claims | **0** |
| Mappings resolving to eligible current assertions | **0** |
| Usable external locators | **0**. Their 30 source links are `metadata`-level references awaiting KC-08E review. |
| Primarily TRACE-authored prose | **All 30.** They are `internal_synthesis` by design. |
| Need source refresh or new research | **All 30** (review due 19 October). The comparison documents cite versioned model names, for example `gpt-5-6`, `glm-5.2` and `gpt-5.6-sol`, which a successor release may already have superseded. |

**Highest-value, lowest-effort Ask-ready candidates.** These are conceptual documents whose claims can be supported by stable primary specifications and documentation:

- `07` what is MCP;
- `18` reliable tool calling;
- `15` prompt injection;
- `12` context window;
- `27` model quantization;
- `26` structured outputs vs JSON mode;
- `09` RAG vs fine-tuning;
- `13` model routing;
- `21` what is an AI agent.

Each needs 2–4 captured primary or independent sources with locators, and two independent provenance groups for the core definition. The comparison documents (`01`–`04`, `10`, `11`) need current benchmark and vendor evidence, and they will age quickly.

## 7. Source capture and backfill readiness

| Component | State | Evidence |
|---|---|---|
| Retrieval (`source-retrieval.ts`): SSRF guard, redirects ≤ 3, byte caps | Implemented, tested | KC-03A |
| HTML / Markdown / plain extraction; private PDF capture (opaque) | Implemented, tested | KC-03B, KC-03H |
| Document and version identity, `normalized_content_v3` (reference drift separated: migration 0062, `c843a67`) | Implemented, tested locally; **0062 applied to Production on 22 October** | `tests/source-identity-v2.test.ts` |
| R2 storage (`RAW_STORE`), content-addressed keys | Implemented; Production bucket bound | |
| Chunks and locators; deterministic extraction; match candidates; provenance proposals (KC-11D) | Implemented, tested locally | KC-11D evidence: no Preview or Production historical run recorded |
| Admission and review gates | Implemented, with UI | |
| Bounded backfill (`BACKFILL_CEILINGS`) | **25 records, concurrency 1, ≤ 3 redirects, 512 KiB per record, 5 MiB per run, 2 retries, 30 s, 200 blocks, 100 candidates per record, 10 provenance groups per record, 120 s stale lease.** Unchanged from KC-11C. | `knowledge-source-backfill.ts:13-18` |
| Backfill routes on the Production Worker | Present, operator-authenticated, **not environment-gated**. Manual only; nothing scheduled them while Cron is `[]`. | `workers/ingestion/index.ts:1130-1142` |
| Backfill UI | **Missing.** API only. | |

**The KC-11C identity question.** The last recorded live run (August, `normalized_content_v2`, on Preview) had the GitHub source stable and the Anthropic HTML page **unstable**. The cause was isolated to normalised links. `normalized_content_v3` (August, `c843a67`) separates reference drift from content identity and has local fixture tests. **No live two-pass v3 retrieval has been recorded**, so the stability of HTML vendor pages is unproven. It is not a known current defect.

**Disposition: `CONTROLLED_SOURCE_CAPTURE_READY_WITH_RESTRICTIONS`.**

1. The first Preview pilot batch must include a **two-pass v3 stability check** on at least three HTML vendor pages, including the original Anthropic URL. A pass is recorded only when the normalised hash is unchanged.
2. Until that passes, prefer GitHub, Markdown and plain-text documentation sources, and arXiv abstracts.
3. Production capture needs separate approval and Preview proof first.
4. PDFs are captured opaquely and are never Ask evidence (`media_kind <> 'pdf'`).

## 8. Source 93 and the M2 gate

**Source 93** (bounded read from the snapshot):

| Field | Value |
|---|---|
| Name | LMSYS Chatbot Arena |
| `ingestion_type` | `lmsys_api` |
| `active` | 1 |
| Tier / treatment | B / `primary-research` |
| `health_status` | `degraded` |
| `last_fetched_at` | 2026-09-06 06:00:34 |
| `last_success_at` | **null** (never succeeded) |
| `last_error_at` | 2026-09-06 06:00:34 |

It remains active. No connector supports `lmsys_api`.

**M2 gate** (22 October Production preflight, unchanged since): `FAIL_CLOSED` / `ACTIVATION_BLOCKED`, `SCHEMA_INCOMPATIBLE`.

- The only incompatible field is `sources.ingestion_type`.
- The legacy default is `'manual'`. The accepted contract allows no default, and its value domain excludes `lmsys_api`.
- `migrationSafeToAdd = false`.

**Decisions required before any scheduler resumption** (gated track, not this programme):

1. **Source 93:** deactivate it, convert it to a supported connector (for example `page_diff` against the public leaderboard, subject to its terms), or implement an `lmsys_api` connector.
2. **M2 contract:** either amend the contract to accept the legacy default as a recorded divergence, or carry out a reviewed table rebuild.

Neither decision affects the curated seeding pilot, which uses manual, bounded capture.

## 9. Ask TRACE runtime

### 9.1 Component status

| Component | Implementation | Status |
|---|---|---|
| Public gate | `TRACE_AI_PUBLIC_ENABLED` plus `TRACE_AI_GLOBAL_KILL_SWITCH` (`config.ts`, `api/trace/ask.ts`) | **Enabled on Production** (§2) |
| Abuse controls | Origin allow-list; 16 KiB body; 1,000-character question; HMAC visitor hash (fails closed without a 32+ character secret or `CF-Connecting-IP`); 3 questions per visitor per day; concurrency 1; idempotency keys | Implemented and tested; demonstrated on Production in July |
| Published-evidence retrieval | `retrievePublishedEvidence`: `LIKE` over up to 8 terms, joins assertions, claims, stories, sources and legacy evidence; limit 8–12 | Implemented and tested. Demonstrated on Production in July, before the V1 gates. |
| Knowledge retrieval | `retrieveApprovedKnowledge`: `LIKE` over approved public knowledge; mapped-assertion resolution with locator checks | Implemented and tested; 0 mappings on Production |
| Lexical FTS (`knowledge_search_fts`) | Index built, 3,984 rows | **Not consumed** by any runtime path |
| Vectorize semantic recall | Preview Worker binding (`trace-manifest-knowledge-preview-bge-m3-v1`), indexing and resolution (KC-09B–E) | Preview only. **Not wired into Ask retrieval.** No Production binding. |
| Eligibility | `isAnswerEligibleEvidence` (admitted, current, evidence or reported claim) plus the SQL gates | Implemented and tested |
| Provenance grouping | `groupKnowledgePositions`; independence weight is 0 until KC-05 groups exist | Implemented; 0 groups on Production |
| Conflict detection | Accepted relationship proposals plus unresolved conflict cases. Fails closed to `insufficient` on any error. | Implemented and tested; 0 conflicts on Production |
| Conclusion selection | `selectKnowledgeConclusion`: `supported` needs score ≥ 60, ≥ 2 independent provenance groups and direct evidence. `qualified_lean` needs a margin of at least 20. Otherwise `multiple_positions` or `insufficient_evidence`. | Implemented and tested |
| Inference gateway | DeepSeek (`deepseek-v4-flash` public, `-pro` editorial). Allow-listed; one call per request; 0 retries; 0 regenerations; 25 s timeout | Implemented. Production calls recorded in July (10 Ask, 106 editorial). |
| Citation validation | Output schema validation plus `resolveAndValidateCitationReferences` (assertion → version → chunk → locator) | Implemented and tested; never exercised with D1-backed citations on Production (none exist) |
| Deterministic answer mode | `TRACE_ASK_MODE=deterministic` renders an answer with no model call | Implemented and tested; Production mode unverified |
| Refusal | `safeNonAnswer` for no eligible evidence, competing positions, failed validation or failed citation resolution | Implemented and tested; the effective Production behaviour today |
| Budgets | Per request US$0.02; public daily US$1; monthly US$10; editorial daily US$0.50; durable reservations; circuit breakers | Implemented. Production pricing variables are set (flash 1/5, pro 2/10 USD per million tokens) and **above the list prices the research inventory reports** (0.30/1.20 USD per million for `deepseek-flash`; `MOD-deepseek-api-*`), which is conservative. The `deepseek-v4-flash` name is reported retired (roadmap, G-1). |
| Cache | Idempotent replay of a completed request per visitor, day and question (`begin` → `duplicate_completed`). No cross-visitor answer cache. | Implemented |
| `/admin/ask` (publisher only) | Same retrieval and decision path, `adminOverride`; requires `TRACE_AI_EDITORIAL_ENABLED` and a provider key | Implemented and tested; not exercised in this programme |

### 9.2 Retrieval

**Today's retrieval is lexical `LIKE` matching.** The question is tokenised into at most 8 terms of 3 or more characters, longest first, with stop-words removed. Rows are matched if **any** term occurs in the claim text, feed title, excerpt or URL. Implications for the question suite:

| Outcome | Example |
|---|---|
| **Succeeds** | Exact entity and version names: "llama.cpp SYCL", "vLLM 0.25.1", "MCP" |
| **Misses** | Paraphrases and concepts: "tool use" versus "function calling"; "quantised" versus "GGUF Q4_K_M"; "run on RAM" versus "CPU offload". The open question gap is exactly this kind. |
| **Irrelevant candidates** | Any-term OR matching on short generic terms ("model", "agent", "open") recalls broadly. The 8–12 row limit then truncates arbitrarily, by tier and recency rather than relevance. |
| **Stale or ineligible candidates** | Filtered correctly by SQL before ranking |
| **D1 cost** | Each request scans the joined assertion set with leading-wildcard `LIKE`, which cannot use an index. Cost grows linearly with the assertion count. Cheap at 417 rows, but it needs measuring at pilot scale. |

**Recommendation: phased.**

1. **V1.1 pilot: lexical only, upgraded to FTS5 `MATCH`.** Query `knowledge_search_fts` with publication-aware filtering (absorption doc, C2), using bm25 ranking and explicit synonym expansion for a curated AI and agents vocabulary (deterministic, versioned). This is cheaper and more relevant than `LIKE`, and it adds no new service.
2. **V1.2: decide on hybrid using the evaluation suite.** Add Vectorize recall only if the suite shows lexical recall failures that synonyms cannot fix. Vectorize stays a candidate generator; D1 eligibility stays the authority.
3. **No Production Vectorize or embeddings** without a separate approval and a cost measurement.

### 9.3 Inference cost and routing

| Outcome | Model calls |
|---|---|
| No eligible evidence, `insufficient_evidence`, out of scope, refused | **0** (`completeWithoutModel`) |
| Supported, lean or multiple positions, with `TRACE_ASK_MODE=deterministic` | **0** (deterministic template answer with D1-resolved citations) |
| Supported, lean or multiple positions, with `provider` mode | **Exactly 1** (no retries, no regeneration) |
| Provider unavailable or circuit open | 0. Returns "temporarily unavailable" and settles the reservation. |
| Failed validation or citation | 1 call is spent; `safeNonAnswer` is returned |

**Ceilings and observed cost.**

| Item | Value |
|---|---|
| Per-request ceiling | US$0.02 (`TRACE_AI_MAX_COST_PER_REQUEST_USD` default) |
| Daily public ceiling | US$1 |
| Monthly public ceiling | US$10 |
| Visitor limit | 3 questions per day |
| July average for an Ask provider call | ≈ US$0.004 (10 calls, US$0.041 settled) |

**Recommendation.** Keep `deterministic` as the default mode for the V1.1 pilot. Only measure the incremental usefulness of provider synthesis once the evidence suite passes. **No paid calls are made in this programme.**

## 10. Resource observations

- **Inspection cost:** 56,338 D1 rows read for the snapshot. 0 additional SQL.
- **24-hour figures from `d1 info` at inspection:** 1,499,397 rows read, 32,921 written, 1,381 read queries, 221 write queries. These include the approved 22 October migrations and their backups.
  - **Action (V1.1):** record a quiet 24-hour baseline before the pilot, so that any pilot-induced D1 cost can be measured against it.
  - A D1 consumption alert is **required before automated ingestion** (roadmap).

## 11. Feature gaps found here (full classification in the roadmap)

| Gap | Required before |
|---|---|
| Assertion governance queue outside story context (admission and reviewer panels are only reachable inside story clusters) | Seeding review |
| Freshness review UI and work queue | Seeding review |
| Backfill / capture UI with failure visibility | Seeding at scale (the API suffices for the first pilot batches) |
| D4: Pending Review → governance panel | Absorption review throughput (not pilot correctness) |
| Ask placeholder predicate and FTS publication filter | Public Ask with current evidence |
| FTS `MATCH` retrieval with synonyms | Public Ask (usefulness) |
| Knowledge revision renewal (all 30 review-due) | Public Ask |
| D1 consumption monitoring | Automated ingestion |

## 12. Query appendix

All numbers in this report come from these scripts:

- `scripts/knowledge-10/logical-backup-keyset.mjs`: the read pass;
- `scripts/knowledge-10/load-snapshot.mjs`;
- `scripts/knowledge-10/census.mjs`: census, funnel and gate preconditions; the SQL text is embedded in its JSON output;
- `scripts/knowledge-10/absorption.mjs`.

**Snapshot:**

| Item | Value |
|---|---|
| Captured | `2026-10-23T05:56:41Z` |
| SHA-256 | `5e6a414d…63ee` |
| Tables / rows | 113 / 55,718 |
| D1 rows read | 56,338 |
