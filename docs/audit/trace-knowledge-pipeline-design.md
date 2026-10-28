# TRACE knowledge pipeline: deterministic-first acquisition, catalogue, story inbox, social automation and knowledge absorption

**Date:** 25 October 2026
**Status:** **Design proposal only.** Nothing here is implemented, migrated, scheduled, deployed or pushed. Each stage in §17 needs its own owner approval.
**Revision 2 (25 October 2026, owner-approved, relayed by the production-readiness session):**
- DeepSeek Flash (non-thinking) is the primary language engine for the initial local acquisition system (§10). Qwen3.5-9B on the owner's CPU-only machine (32 GB DDR3-1600, no GPU) is optional only (§10.4).
- Spending limits are a combined US$6.25 (about £5) a week, with UTC off-peak scheduling and checkpoints (§10.6, §14.1).
- The design is reconciled with the frozen ingestion Worker and scheduler 0072 (§16.1).
- New: a staged plan and the smallest safe prototype (§17).
- References are based on `main` at `5cb64af` (PR #5: the V1.1 release of SEED-01, migration 0076 and TRACE Capture). Migration 0076 status: (merged into `main` at `5cb64af` by PR #5. The production-readiness session reported Production application of 0076 on 2026-10-25, but no Production 0076 record is on `main`; the SEED-02 records there predate it. **Confirm it before P2.**)

**Supersedes (as proposals):** the two narrower proposals "social automation" and "story automation and catalogue".
**Proposed decisions:** ADR 0021 to ADR 0024 and ADR 0009 Amendment 2, all with status **Proposed** (§19).
**Builds on:** `docs/audit/trace-v1-knowledge-10-local-acquisition-architecture.md` and `docs/audit/trace-v1-knowledge-10-open-model-execution-plan.md`, now on **`main` at `5cb64af`** (PR #5, adding migration 0076 and the Evidence Library; Production status per the header note); first read from `origin/codex/trace-v1-seed-01-prerequisites`. `main` also carries the KNOWLEDGE-10 final report, readiness, legacy-absorption and seeding documents, `docs/audit/trace-v1-seed-01-prerequisites.md`, the roadmap `docs/roadmap/trace-v1.1-v1.2.md`, the research inventory `docs/research/ai-models-inference-agents-inventory.*`, the evaluation fixture `tests/fixtures/knowledge-10/ask-evaluation-suite.json` and migration `db/migration-0076-evidence-library-governance.sql`. On 2026-10-25 every one of these was verified byte-identical to the copies first read from the local branch `codex/trace-capture-preview-01`. The SEED-03 batch plan is on `origin/codex/trace-v1-seed-03-batch-01` (`docs/audit/trace-v1-seed-03-batch-01-plan.md`). References below cite them by path.

**Hard constraints for this design:**
- No Production change.
- Trust is not weakened: every existing gate keeps its meaning. Where automation replaces a human click, the replacement is narrower, auditable and reversible, and §11 makes reversibility a precondition.
- Publication stays human (ADR 0004).
- The two-independent-provenance-groups rule for `supported` is unchanged. In the SEED-03 plan's words, "P-1 is unchanged". The roadmap's P-1 decision, whether to add a `primary_attributed` mode for single-authoritative-source facts, is still open, and this design neither adopts nor rejects it (§11.10).

---

## 0. Summary

### 0.1 The problem

| Fact | Source |
|---|---|
| The intended volume is about **50 news stories and 20 owner-captured social posts a day**, run by one owner in **20–30 minutes of decisions**. | Owner brief |
| Each news cluster currently needs manual clicks: hours a day at that volume. | Owner brief |
| Publishing a story does **not** create Ask-ready knowledge. **0 of 417** Production assertions are Ask-eligible, because each fact needs admission, reviewer acceptance and freshness. | KNOWLEDGE-10 final report §C, §E |
| SEED-01 (migration 0076, PR #3) added an Evidence Library context for facts no story carries. It is on `main` (`5cb64af`) and on Preview. Its Production application was **reported** on 2026-10-25 but is not recorded on `main`; confirm it before P2. | `migration-0076-…sql`; production-readiness session, 2026-10-25 |
| The Production source registry has ingested nothing since about 2026-09-06. It has GitHub release notes as text, but **no** Hugging Face model or file metadata, model-card ingestion or GGUF reading (§1.1). | Production source registry, read-only, 2026-10-25 |
| TRACE Capture (Android) delivers social posts to private `social_signals` and Desk intake, **proven on Preview on 2026-10-25**. | `docs/audit/trace-capture-integration-01.md` §8.8 |
| ADR 0009 §10 forbids persisting fetched social pages and creating signals, candidates or cards automatically. | ADR 0009 §10 |
| Production scheduled ingestion is paused (STOP-BURN, Cron `[]`). Public Ask is off until V1.2. | Memory, 2026-10-24; commit `d89850b` |

### 0.2 The design in one paragraph

Knowledge comes in through **three lanes** and is absorbed through **one governance layer**:

- **Lane A, primary-source acquisition (main path):** Hugging Face model and file metadata, GGUF headers read with HTTP range requests, GitHub releases, and official model cards and docs. Parsing is deterministic and reproducible, and its outputs feed a structured **model, runtime and hardware catalogue** with a deterministic **fit and throughput estimator**.
- **Lane B, story inbox:** news is a discovery trigger and context. Candidates are clustered and ranked deterministically. A capped number get a pre-run draft from a low-cost model, and the owner approves, edits or skips each in one tap. Unreviewed items are held, then archived.
- **Lane C, social automation (Reddit first):** owner-captured posts become **attributed community reports**. Facts are extracted with quoted spans, mostly by grammar, and linked sources become separate candidates.
- **Absorption:**
  - rule-based **system admission** for a closed list of machine-checkable fact classes, under an owner-approved, versioned policy;
  - **batched** reviewer acceptance;
  - **automatic freshness for version-pinned facts**;
  - routing of keep-worthy, non-story facts to the **Evidence Library**;
  - a **sampling audit**.

  Automatic admission may not start until **evidence revocation and restoration** exist.

Models do only what needs language understanding: drafting prose for human approval, and mapping free text to a schema where **every value must re-find verbatim** in the source. RAG and LLMs never decide admission, independence, evidence class or freshness, and never act as a source.

### 0.3 Targets

| Measure | Target | Where measured |
|---|---|---|
| Share of pipeline operations that are deterministic | **≥ 90 %** of operations per day; **≥ 75 %** of extracted catalogue and claim fields | §13 accounting; run ledger |
| Model calls per day | **≤ 70** at 50 drafts a day (50 drafts, about 6 release mappings, ≤ 10 reconciliations; social mapping disabled until KP-24) | Usage ledgers |
| Model spend | **Hard cap US$6.25 a week combined** (about £5; §14.1). Expected about US$0.11–0.41 a week at 10–50 drafts a day, off-peak. | Local and Worker usage ledgers; DeepSeek balance reconciliation |
| Owner decision time | **20–30 minutes a day** (§12) | Inbox timing telemetry (local, private) |
| Trust regressions | **0**: no published claim, catalogue value or Ask answer without its existing gate | Sampling audit (§11.8); evaluation suite |

---

## 1. Baseline facts this design must respect

| # | Fact | Consequence for the design |
|---|---|---|
| B-1 | Assertion governance events allow only `actor_role = 'publisher'` and the actions `admit`, `reject`, `accept_review`, `reject_review`, `mark_current`, `mark_stale` (`migration-0076`, `CHECK(actor_role = 'publisher')`, `action IN (…)`). | A **system actor** and **revoke/restore** actions need a successor migration (§11.2, §11.7). Nothing here can be done by configuration alone. |
| B-2 | 0076 keeps the 0074 rule that each `(assertion, action, previous state, new state)` transition happens at most once (`idx_assertion_governance_events_transition`). | An assertion cannot cycle admitted → rejected → admitted → rejected. Repeated correction therefore needs dedicated revoke/restore actions rather than reusing `admit`/`reject` (§11.7). |
| B-3 | 0076 permits `mark_current` / `mark_stale` events only in `evidence_library` context, and `mark_current` only when the assertion is admitted and accepted. | Pinned freshness (§11.5) fits the Evidence Library naturally. Story-context freshness keeps today's route. |
| B-4 | ADR 0012 #3: one provider attempt, zero automatic retries. ADR 0008 §2.1.5: no automatic model substitution or fallback provider. | The model tiers in §10 are **chosen per task by configuration**, never as a runtime fallback chain. |
| B-5 | `src/ai/config.ts` (main `5cb64af`) allows only `deepseek-v4-flash` and `deepseek-v4-pro`. **Its editorial default is `deepseek-v4-pro`.** Flash is configured at 1/5 and Pro at 2/10 USD per million tokens, and the editorial daily budget is US$0.50. The adapter sends `thinking: {type: "disabled"}`. On 2026-10-25 DeepSeek lists `deepseek-flash` as current, with `deepseek-v4-flash` retired but accepted (§10.2, [X-01]). | The Worker configuration is unchanged by this design. G-1 is a separate change. The workstation uses `deepseek-flash` under its own budgets (§10.5, §14.1). |
| B-6 | The local-acquisition design proposes: L-1 shrink Cloudflare ingestion; L-2 one KC-11 evidence write path; L-3 the Worker re-fetches and verifies; L-4 no workstation database access. | Lane A runs locally and submits proposals. The Worker remains the authority. These four decisions are reused unchanged. |
| B-7 | The ADR 0019 catalogue structures are almost entirely missing. The current `models` table is regex-extracted and unevidenced (open-model plan §1). | The catalogue in §6 is new schema (OM-1, OM-2), sequenced after the V1.1 evidence route is proven. |
| B-8 | Hardware scenarios H01–H16 currently all resolve to `insufficient_evidence` (evaluation fixture). | §6.6 maps each one to the records and estimator outputs that would change its outcome. |
| B-9 | ADR 0004 lists claim types that always need human review: security, legal, misconduct, major benchmark conclusions, "best" rankings, prominent corrections, sponsored comparisons, claims based mainly on community reports, strong contradictions. | None of these classes can ever be system-admitted (§11.9). Story publication is human for every story anyway. |
| B-10 | ADR 0015 already defines candidate states including `draft_ready`, `held`, `archived` and server-side draft persistence with prompt, policy, model and source-set hash. | The story inbox (§7) is a UI and orchestration layer over ADR 0015, not a new pipeline. |
| B-12 | `wrangler.worker.toml` declares `crons = []` (main `5cb64af`). The Production and Preview Workers have Cron `[]` (2026-10-25). The legacy daily pipeline in `scheduled()` and its publisher-triggered routes still exist in code. | §16.1: the pipeline stays paused; the workstation can never reach legacy routes |
| B-11 | SEED-02 measured about **120 written D1 rows per assertion** for the full governance lifecycle (admit, accept, freshness request and approve, including events, jobs, audit, nonces and score explanations). SEED-03 caps a governance session at **≤ 40 assertions (≤ 5,000 writes)** (`docs/audit/trace-v1-seed-03-batch-01-plan.md` §4). | Batches in §11.4 are capped at 40. D1 estimates in §14.2 use 120 rows per assertion. |

### 1.1 Existing ingestion baseline (Production source registry)

The production-readiness session read the Production source registry read-only on 2026-10-25 and relayed these findings. **The owner believed the nightly RSS intake already covered Hugging Face, GitHub releases and model cards. It covers only part of that, and none of it is running:**

| Source class | State on Production | Consequence for this design |
|---|---|---|
| All scheduled ingestion | **Stopped since about 2026-09-06** (STOP-BURN). No source has produced items since. | Nothing is currently acquired automatically. |
| `github_api` release notes | Stored as `feed_items` **text**. Item counts: llama.cpp (source 29) 501; Qwen Code (89) 142; Cline (100) 105; LiteLLM (38) 65; LangChain (32) 59; Ollama (30) 50; Transformers (98) 16; vLLM (31) 15; OpenAI Agents SDK (116) 15; MCP servers (36) 12; PyTorch (99) 11; LlamaIndex (33) 11; LM Eval Harness (37) 11. That is **1,013 items** in total. | **Reusable as an index and a grammar corpus:** the release-bullet grammar (§5.4) can be developed and measured against this text offline. Feed text is **not** evidence. Each fact is re-acquired from the GitHub API, pinned to tag and commit, through the KC-11 route (L-2, L-3). |
| `huggingface_api` "Hugging Face Trending Models" (84) | 0 items; no `last_success_at`. It has **never worked**. | No HF model or file metadata exists (parameters, context length, licence, quant file sizes). Lane A's `hf-model`, `hf-tree` and `gguf-header` adapters are **new builds**. Source 84 should be deactivated or superseded rather than repaired (KP-16). |
| Model cards; GGUF headers | Not ingested at all | New (§5.3, §5.5) |
| Hugging Face Blog RSS (17) | 870 article items | Lane B discovery and context only |
| `arxiv_api` (23–28) | **0 items stored despite `last_success_at` timestamps** | An anomaly outside this design's scope, to be investigated separately before any arXiv-dependent automation. SEED-03 captures arXiv sources manually through KC-11. |
| Reddit r/LocalLLaMA (102, `manual`); Stanford HELM, SWE-bench and LiveBench (`github_api`) | 0 items | Lane C replaces the Reddit "source" with owner capture (§8). Benchmark sources come into scope with the catalogue's performance records later. |

The ingestion types in the schema are `rss`, `github_api`, `arxiv_api`, `page_diff`, `huggingface_api`, `hackernews_api` and `manual`. Lane A's adapters are proposed as **local-acquisition adapters submitting through the importer**, not as new Cloudflare ingestion types (L-1). They therefore need no Cron.

---

## 2. Principles and derived invariants

### 2.1 Owner principles

| # | Principle | How this design applies it |
|---|---|---|
| OP-1 | **Primary-source acquisition is the main knowledge path.** | Lane A (§5) is the only lane that can feed **system** admission (§11.3). The catalogue is filled from primary sources. Stories and posts point Lane A at what to fetch. |
| OP-2 | **News and social posts are discovery triggers, context and occasionally independent evidence. Shared-origin items do not count as independent corroboration.** | Deterministic shared-origin signals (§7.7, §8.7) **group** derivative items with their origin and can never split groups. Splitting a group needs a reviewer. Community reports keep `community_report` class (ADR 0019) and never auto-admit. |
| OP-3 | **RAG and LLMs answer only, over governed facts, and never ingest.** | Ingestion has no retrieval-augmented generation. Model output in ingestion is limited to (a) prose drafts a human approves and (b) schema mappings whose values must re-find verbatim (§3.2). Ask stays deterministic-first. |
| OP-4 | **Model tiering:** deterministic code, then a low-cost API, then optional free tiers, then local models. | §10. Each task type is assigned one tier by configuration through the existing gateway. |

### 2.2 Derived invariants (testable)

| ID | Invariant | Test idea |
|---|---|---|
| I-1 | **No model output sets or advances any governance axis** (admission, reviewer, freshness, provenance group, evidence class). | Schema tests: no model-output field maps to these columns; system events carry `policy_rule_id`, never a model id. |
| I-2 | A model may **add** `reviewer_required`, never remove it (local-acquisition §7). | Property test over the pipeline. |
| I-3 | Every extracted value carries a **source locator** that re-finds byte-exactly in the stored normalised text, or the value is dropped. | A re-find validator runs before persistence. Adversarial fixtures use paraphrased values. |
| I-4 | Every catalogue number carries `{value, unit, evidence_class, citation}`, where the citation is an external immutable identifier and/or an assertion id. **A number without a citation is `unknown`.** | DB `CHECK` plus a renderer test: an uncited number cannot render. |
| I-5 | **Reproducibility contract (§5.6):** same pinned inputs + same adapter, parser, grammar and normalisation versions ⇒ **byte-identical deterministic extraction output**. Model outputs are stored and replayed, never regenerated. Run ids, timestamps, package numbers, usage and receipts may differ. **Unchanged sources produce no new actionable items.** | Golden fixtures; tests (a)–(e) in §5.6 |
| I-6 | **Automation is reversible:** every system-written state has a revocation path that restores the previous eligibility, and it is exercised in tests before the automation can be enabled. | Gate test in §11.7. |
| I-7 | **No Cloudflare Cron** while STOP-BURN is active. Pre-run work is triggered by the owner or by a workstation timer calling request-driven routes. | Config test: Worker schedules remain `[]`. This already exists as commit `4979823`. |
| I-8 | **Publication requires a human tap** on the final text (ADR 0004, ADR 0012 #8). | The existing publication-eligibility tests still pass. Inbox approval goes through the existing publish route. |

---

## 3. What must be deterministic and what may use a model

### 3.1 Decision rule

A step is **deterministic** when its output is a pure function of versioned code plus input bytes (and, for the Worker, the D1 state it reads). A step **may use a model** only if **all** of these hold:

1. the task needs natural-language understanding (summarising prose, mapping free-text prose to a schema);
2. a deterministic grammar for it has been tried and its coverage is measured as insufficient on recorded fixtures;
3. the output is either (a) a human-approved draft, or (b) a structured proposal that passes the I-3 re-find check and schema validation;
4. the call goes through the TRACE gateway with a task type, budget, idempotency key and audit (ADR 0008, ADR 0012).

### 3.2 Step classification

**D** = deterministic, **M** = model (bounded), **H** = human.

| Step | Lane | Tier | Notes |
|---|---|---|---|
| Source change detection (ETag, revision SHA, normalised hash) | A, B | D | Local-acquisition §5 |
| URL canonicalisation and deduplication (incl. Reddit `/s/` links) | A, B, C | D | §8.2 |
| HF metadata, file listing and hashes | A | D | §5.2 |
| GGUF header parse | A | D | §5.3 |
| GitHub release metadata (tag, commit, dates, assets) | A | D | §5.4 |
| Model card YAML front matter; `config.json` fields | A | D | §5.5 |
| Release-note bullet → structured change (`adds_support`, `fixes`, `breaking`, `deprecates`) | A | D first; M fallback for unmatched bullets | Grammar over conventional prefixes and PR titles. Fallback output must quote the bullet. |
| Story clustering (canonical origin link, title shingles, entity overlap) | B | D | §7.3 |
| Capability or narrative classification (ADR-0020) | B | D first (rules over entities and verbs); M only to *suggest* | A suggestion is shown, never stored as the classification without a tap |
| Story ranking | B | D | Versioned weights; no learned model (§7.4) |
| Story draft prose | B | **M** | Capped; validated; human-approved (§7.5) |
| Social post text acquisition | C | H (owner-supplied) or D (approved API) | §8.3 |
| Social benchmark extraction (hardware, quant, runtime, speeds) | C | D (grammar plus `llama-bench` table parser); M fallback | §8.4 |
| Linked-URL extraction from post text | C | D | §8.6 |
| Shared-origin grouping proposals | A, B, C | D | May only *merge* toward the origin (§7.7) |
| Admission for machine-checkable classes MC-1…MC-6 | Abs. | D (system policy) | §11.3, after the §11.7 precondition |
| Admission for everything else | Abs. | H | Unchanged |
| Reviewer acceptance | Abs. | H (batched) | §11.4 |
| Freshness for version-pinned facts | Abs. | D (system) | §11.5 |
| Freshness for unpinned facts | Abs. | H (existing UI) | Unchanged |
| Evidence Library or story routing | Abs. | D | §11.6 |
| Sampling-audit selection | Abs. | D (seeded) | §11.8 |
| Fit and throughput estimate | Cat. | D | §6.3, §6.4 |
| Ask answer | Ask | D first; M for optional explanation | Unchanged (deterministic-first audit) |

---

## 4. Architecture

```text
 OWNER (20–30 min/day)                    LOCAL WORKSTATION (untrusted preparer; L-4: no D1 access)
 ┌─────────────────────┐                 ┌──────────────────────────────────────────────────────────┐
 │ TRACE Capture (phone)│──social/URL──┐  │ timer or manual run (never Cloudflare Cron)              │
 │ Desk / Inbox / Queue │               │  │  Lane A adapters: HF API · HF tree · GGUF range ·        │
 └──────────┬──────────┘               │  │                   GitHub releases · cards/docs (cond. GET)│
            │ one-tap decisions        │  │  deterministic parsers → change classes → proposals      │
            │                          │  │  optional local model: fallback mapping only (§10.4)     │
            ▼                          │  │  packager → trace-know-batch-v1 (+ catalogue records)    │
 ┌─────────────────────────────────────┴──┴───────────────────────┬──────────────────────────────────┘
 │ CLOUDFLARE (authority)                                           │ HTTPS · Access service token · HMAC
 │                                                                  ▼ (importer role; local-acq §9)
 │  Pages admin (Access, publisher)        Worker (signed routes, request-driven only)
 │   • Story inbox  (§7)                    • import route: validate → KC-11A/C plan → re-fetch + hash
 │   • Social cards (§8)                    • Lane A re-verification: re-read HF/GGUF/GitHub fields (L-3)
 │   • Knowledge batches + audit (§11)      • extraction (KC-11D) · grammar extractors
 │   • Catalogue review (§6)                • gateway → DeepSeek (task-typed, capped, 1 attempt)
 │                                          • policy engine: system admission / pinned freshness
 │                                          • revocation + restoration jobs (§11.7)
 │  D1: identities · states · governance events · catalogue · drafts · receipts
 │  R2: permitted bodies · normalised text · parsed-metadata JSON · staged batches
 │  Ask (Public off until V1.2): deterministic-first over eligible assertions + catalogue + estimator
 └──────────────────────────────────────────────────────────────────────────────────────────────────
```

**Placement rules:**
- Acquisition of public primary sources can start on the owner's current CPU-only machine, because it is I/O work (§5.7).
- Model fallbacks run either through the DeepSeek tier (Worker, gateway) or, overnight, on a local model (§10.4).
- Nothing in this design requires Cloudflare Cron, scheduler 0072 or `ingestion_jobs`. Automated *news-feed* discovery is the one input that remains gated by them (or by the importer, §16).

---

## 5. Lane A: primary-source acquisition and deterministic extraction

### 5.1 Source adapters

| Adapter | Endpoint (public) | Change signal | Output | Rate limit and budget |
|---|---|---|---|---|
| `hf-model` | `GET https://huggingface.co/api/models/{repo}?expand[]=sha&expand[]=lastModified&expand[]=cardData&expand[]=gguf` | `sha` (repository commit) | Revision SHA, last-modified time, card YAML, repo-level GGUF summary | HF Hub API: 500 per 5 min anonymous, 1,000 with a free token [X-05] |
| `hf-tree` | `GET /api/models/{repo}/tree/{revision}` | Revision SHA | Per file: path, size, `lfs.oid` (SHA-256), `lfs.size` | Same bucket [X-05] |
| `gguf-header` | `GET /{repo}/resolve/{revision}/{file}` with `Range: bytes=0-N` | File SHA-256 from `hf-tree` | Header KV pairs and tensor-info table (§5.3) | Resolver bucket: 3,000 per 5 min anonymous, 5,000 with a free token [X-05]. **One header read per new file SHA-256, never repeated.** |
| `gh-release` | `GET https://api.github.com/repos/{o}/{r}/releases` with `If-None-Match` | ETag | Tag, target commit, published time, body, assets | 5,000 per hour with a token. **A 304 does not count** when authorised [X-06][X-07]. |
| `gh-path` | Commits API filtered by path (docs, support matrices) | Last commit SHA per path | Changed doc path → `docs-page` fetch | Same |
| `docs-page` | Official card or docs page, conditional GET | ETag, `Last-Modified`, `normalized_content_v3` hash | Normalised text plus diff | Per-source politeness interval; `robots.txt` and terms (local-acquisition §5) |

**Watch list.** Lane A does **not** crawl Hugging Face. It follows:
- (a) the curated catalogue watch list: the open-model plan §12 pilot of 14 releases and 8 runtimes, extended only by owner approval;
- (b) **triggers** from Lanes B and C: a story or post that names an HF repo, a GitHub release or a model in the catalogue's alias table enqueues that identifier for the next run;
- (c) quantiser repositories that **declare** a watched base model in `cardData.base_model`, found by searching that base model id.

### 5.2 Hugging Face metadata: what is read and how

Observed on 2026-10-25 against public repositories [X-04]:
- `expand[]=sha` returns the repository commit SHA. Example: `unsloth/Qwen3.5-9B-GGUF` gives `3885219b6810b007914f3a7950a8d1b469d598a5`, last modified `2026-03-02T14:08:36Z`.
- The tree endpoint returns `lfs.oid` (SHA-256) and `lfs.size` per file. Example: `Qwen3.5-9B-Q4_K_M.gguf` is **5,680,522,464 bytes** at that revision.
- `resolve` answers with a redirect carrying `X-Repo-Commit`, `X-Linked-Size`, `X-Linked-ETag` and `Accept-Ranges: bytes`.

**The repository-level `gguf` summary is not file-specific.** For `Qwen/Qwen2.5-0.5B-Instruct-GGUF`, the `expand[]=gguf` summary reported `context_length: 8192`, while the header of that repository's `q4_k_m` file states `qwen2.context_length = 32768` (§5.3). **Catalogue fields therefore come from file headers, never from the repository summary.** The summary may be used only as a change hint.

**Pinning.** Every HF-derived fact is recorded against `(repo, revision SHA, path, file SHA-256)`. A branch name such as `main` is never a citation.

### 5.3 GGUF headers via range requests (no full downloads)

**Format.** Per the GGUF specification [X-08]:
- `uint32 magic` (`GGUF`), `uint32 version`, `uint64 tensor_count`, `uint64 metadata_kv_count`;
- the KV pairs;
- the tensor-info table;
- alignment padding (`general.alignment`, default 32);
- then the tensor data.

**Measured on 2026-10-25.** The metadata section is **not small**, because the tokenizer vocabulary and merges are KV arrays:

| File (pinned) | Version | Tensors | KV pairs | KV section ends at byte |
|---|---|---|---|---|
| `Qwen/Qwen2.5-0.5B-Instruct-GGUF` `qwen2.5-0.5b-instruct-q4_k_m.gguf` | 3 | 291 | 26 | **5,931,189** |
| `unsloth/Qwen3.5-9B-GGUF@3885219b…` `Qwen3.5-9B-Q4_K_M.gguf` | 3 | 427 | 46 | **10,943,081** |

Both were range reads (HTTP 206) of the first 8 MiB and 12 MiB respectively, parsed by a 40-line scratch parser that skips fixed-width arrays by length.

**Adapter rules:**

1. **Incremental range reads:**
   - read 1 MiB;
   - parse;
   - if the KV section or tensor table is incomplete, double the window;
   - **hard cap 16 MiB** per file, after which the result is `header_incomplete` with no partial facts.
2. **Bounded parser for an untrusted binary:**
   - string length ≤ 1 MiB;
   - array count ≤ 2²⁴;
   - `tensor_count` ≤ 100,000;
   - unknown value type ⇒ reject the file;
   - no allocation sized from an unchecked length;
   - no execution of anything (including chat templates, which are **stored as a hash and length only**).
3. **Fields extracted** (all standard keys [X-08]):
   - `general.architecture`, `general.file_type`, `general.quantization_version`, `general.size_label`, `general.license`, `general.base_model.*`, `general.quantized_by`;
   - `[arch].context_length`, `.block_count`, `.embedding_length`, `.feed_forward_length`, `.attention.head_count`, `.attention.head_count_kv`, `.attention.key_length`, `.attention.value_length`;
   - architecture-specific keys, for example `qwen35.full_attention_interval` and `qwen35.ssm.*`;
   - expert keys (`[arch].expert_count`, `.expert_used_count`) where present;
   - the **tensor-info table:** name, shape, ggml type and offset, from which per-tensor byte sizes and the mixed-precision map are computed.
4. **What is stored:** the parsed metadata as canonical JSON in R2, its SHA-256, the byte range read, and the file SHA-256. The tokenizer arrays are **not** stored; only their counts and hashes are. The header bytes are not retained, since they are reproducible from the pinned file.
5. **Worked observation**, `Qwen3.5-9B-Q4_K_M` header: `qwen35`, 32 blocks, context length 262,144, embedding 4,096, 16 heads, 4 KV heads, key and value length 256, `full_attention_interval = 4`, SSM state size 128, `general.license = apache-2.0`, quantised by Unsloth with an imatrix. §6.5 uses these values.

**Why not just use `config.json`?** For the original BF16 or safetensors repository, `config.json` is the primary for architecture fields (MC-6, §11.3). For a GGUF artefact, the header is what the runtime actually loads. Both are recorded. A disagreement between them is a **finding** routed to review, never silently resolved.

### 5.4 GitHub releases

- **Objective fields:** tag, `target_commitish` resolved to a commit SHA, `published_at`, prerelease flag, and asset names, sizes and download counts. Asset digests are recorded where the API returns them.
- **Release body:** the body text is stored under the source's `copyright_storage_mode` and normalised. Bullets are split deterministically: Markdown list items, then GitHub's generated "What's Changed" lines `* <title> by @<user> in <PR URL>`.
- **Bullet grammar** (versioned), producing structured `release_change` proposals:
  - conventional prefixes: `fix:`, `feat:`, `[SYCL]`, `vulkan:`, `CUDA:`, `ggml-cpu:`, `docs:`, `breaking`, `deprecat*`, `remove*`;
  - backend and model names from the catalogue alias table;
  - verbs: add, support, fix, regress, revert, remove.
- **Unmatched bullets** go to the M fallback (§10) **only** for watched runtimes, ≤ 30 calls a day. The fallback must return the bullet verbatim plus a label from a closed enum.
- **Existing corpus:** the 1,013 GitHub release-note `feed_items` already on Production (§1.1) are the development and measurement corpus for this grammar: offline, read from a keyset snapshot, never treated as evidence. Coverage (the share of bullets matched by T0) is measured on them before the M fallback is enabled.
- **Release-note facts are self-describing primary facts.** Under the current conclusion policy they cannot reach `supported` in Ask on their own (P-1 is still open, §11.10). They are still fully usable as **catalogue records** (runtime support with evidence class `runtime_developer_stated`), which is what the hardware Ask needs.

### 5.5 Model cards and documentation

- **Card YAML front matter** (via the HF API `cardData`): `license`, `license_name`, `license_link`, `base_model`, `base_model_relation`, `pipeline_tag`, `library_name`, `tags`. These are deterministic and pinned to the revision.
- **Card prose and official docs** (support matrices, runtime install pages) are fetched conditionally, normalised with `normalized_content_v3`, diffed against the last receipt and classified with the local-acquisition §6 classes.
- **Tables in docs** (support matrices) are parsed deterministically when they are HTML or Markdown tables with recognisable headers. Otherwise the change is surfaced as `changed_source_document` for a human.
- **JavaScript-rendered pages are a known limit.** For example, the DeepSeek pricing table is not in the server HTML: a plain fetch on 2026-10-25 returned no prices, and they appeared only after client-side rendering. Such sources are **not** machine-checkable. They stay human-reviewed, and the acquisition adapter records `render_required`.

### 5.6 Reproducibility contract and the extraction ledger (Revision 3)

**Ledger.**
- **Locally**, each run records in the workstation ledger: adapter id and version, parser and grammar versions, normalisation version, input SHA-256, deterministic-output SHA-256 and the source identity. Model calls add the model id, prompt version, request id and the stored response hash.
- **On import (proposed, P2+)**, the Worker records the same fields in the existing EDITORIAL-03C ledger (`claim_extraction_runs`).
- The workstation never writes D1 (L-4).

**The contract has three layers.**

| Layer | Requirement |
|---|---|
| **1. Deterministic extraction output: byte-identical** | Same pinned inputs + same versions ⇒ **byte-identical** canonical output. "Pinned inputs" means the source bytes identified by SHA-256: an API response body, a release body, header bytes `[0, n)` of a file with a known SHA-256. "Versions" means adapter, parser, grammar and normalisation versions. Canonical output is UTF-8 JSON with sorted keys and no run ids, timestamps or sequence numbers. This covers change classification, parsed fields, entity matches, locators and validation results. |
| **2. Model-assisted output: replayable, not regenerable** | DeepSeek output is not deterministic, so a new call need not reproduce an old one. The **stored response** is part of the run record. Re-validating the stored response (schema, enum, span re-find, alias match) **is** deterministic and must reproduce byte-identically. Replays use the stored response and never make a new call. |
| **3. Envelope and receipts: may differ** | Run id, timestamps (`createdAt`, `retrievedAt`), package number and `batchId`, `usage.json` (actual API usage and cost), provider request ids, deferral counters, morning-summary content, and any later execution receipts. |

**No duplicate actionable records from unchanged sources:**

1. **Unchanged source ⇒ no item.** If the source identity and normalised content hash match the last processed version, the change class is `no_material_change` and **no import item is produced** (local-acquisition §6).
2. **Stable idempotency key** (independent of run, batch and time):

   ```text
   SHA-256(recordType, canonical source identity, normalised content hash, proposedAction, extractor id and version)
   ```

   - **Canonical source identity:** a URL, repo + revision, or file SHA-256.
   - **Extractor id and version:** the parser or grammar version for deterministic items; the task type and prompt version for model items.

   For model items, the key deliberately **excludes the model response**, so re-asking the model cannot mint a new key.
3. **Local suppression.** An item whose key was already placed in an earlier package that is `prepared`, `submitted`, `accepted` or `committed` is not packaged again as actionable.
   - A package that was built but never submitted may be **superseded** by a rebuild. It is then marked `superseded` and must never be submitted.
   - A **rejected** key is not resubmitted (local-acquisition §12).
4. **Version changes do not silently re-emit.** A parser, grammar or prompt version change does not regenerate items for unchanged sources. Re-extraction of existing sources is an explicit owner-triggered run. It emits `supersede_proposal` items that reference the prior keys.
5. **Receiver-side backstop (P2+, proposed).** The importer rejects a key it has seen as `duplicate`, returning the original receipt (local-acquisition §9).

**Tests:**
- **(a)** Byte-identical layer-1 output across two runs over recorded inputs.
- **(b)** Two packages built from the same inputs differ **only** in layer-3 fields. A content digest over `items.jsonl` with layer-3 fields removed must match.
- **(c)** A second live run against unchanged sources emits **zero actionable items**.
- **(d)** Replaying stored model responses yields byte-identical validated output.
- **(e)** A version bump without an owner re-extraction emits nothing for unchanged sources.

**Golden fixtures:** recorded API responses and header byte ranges from §5.2–§5.3 (parsed JSON plus hashes; no tokenizer arrays).

### 5.7 Where Lane A runs and its budgets

- **Phase A–B (V1.1):** offline packager and parsers over fixtures, on any machine (local-acquisition §15).
- **Phase C+:** live acquisition, run manually or by a workstation timer. The owner's current CPU-only machine is sufficient for this I/O-bound work. No local model is needed for Lane A's deterministic path.
- **Per night (proposed; local-acquisition §11 ceilings apply):**
  - ≤ 2,000 conditional requests;
  - ≤ 300 full fetches;
  - ≤ 200 GGUF header reads, ≤ 16 MiB each, ≤ 3.2 GB in total. In practice about 20–60, since a header is read once per new file hash.
- **Worker re-verification (L-3):** for every MC-class item (§11.3), the Worker independently re-reads the field from the primary API at the pinned revision before any system admission. The local value is a proposal only.

---

## 6. Model, runtime and hardware catalogue, with a deterministic estimator

### 6.1 Record types

These follow the ADR 0019 hierarchy and the open-model plan §4–§5. Every record has `review_state` and evidence links.

| Record | Key | Principal fields (source → parser) | Default evidence class |
|---|---|---|---|
| `model_family` | slug | Publisher, family name | `publisher_stated` |
| `model_release` | family + version | Release date (card / GitHub), licence (card YAML, MC-4), architecture (`config.json`, MC-6), total and active parameters (card or `config.json`; never inferred from the name) | `publisher_stated` |
| `checkpoint` | repo + revision SHA | Revision, last modified (`hf-model`) | `publisher_stated` |
| `variant` | release + kind | Base, instruct, reasoning, coding, multimodal (card `tags` / name grammar; reviewer confirms) | `publisher_stated` |
| `artefact` | repo + revision + format | Quantiser, declared base model (card YAML, MC-5), format | `publisher_stated` |
| `artefact_file` | artefact + path + SHA-256 | Size, SHA-256 (`hf-tree`, MC-1); parsed header id (`gguf-header`, MC-2) | `publisher_stated` |
| `quantisation` | artefact | `general.file_type`, per-tensor type map, nominal and effective bits per weight (computed: file bytes × 8 / parameter count, from the tensor table) | `trace_deterministic_estimate` for computed fields |
| `runtime_version` | runtime + tag + commit | Release date, assets (`gh-release`, MC-3) | `runtime_developer_stated` |
| `runtime_support` | runtime_version × (arch \| format \| backend \| OS) | Status (`supported`, `experimental`, `removed`, `unverified`); release-note bullet or docs-table locator | `runtime_developer_stated` |
| `hardware_device` | vendor + model + memory variant | Memory bytes, memory type, bus width, **bandwidth**, host link, power, software support. Every number cited. | Vendor spec = `publisher_stated`; review = secondary |
| `hardware_profile` | composition of devices + RAM + OS | The open-model plan §3 schema (`unknown` explicit) | n/a (input) |
| `performance_observation` | artefact × runtime_version × hardware × config | pp and tg speeds, context, batch, flags, method, date | `community_report` \| `independently_reproduced` \| `trace_tested` |
| `compatibility_record` | artefact × runtime × parser × harness | ADR 0019 statuses | Per test |
| `estimate_snapshot` | inputs hash + formula version | Fit levels, memory breakdown, decode ceiling | `trace_deterministic_estimate` |

### 6.2 The citation rule (I-4)

Every numeric or enumerated catalogue field is stored as:

```json
{ "value": 5680522464, "unit": "byte",
  "evidenceClass": "publisher_stated",
  "citation": { "kind": "hf_file", "repo": "unsloth/Qwen3.5-9B-GGUF",
                "revision": "3885219b6810b007914f3a7950a8d1b469d598a5",
                "path": "Qwen3.5-9B-Q4_K_M.gguf",
                "sha256": "<lfs.oid>" },
  "assertionId": "<claim_assertions.id once admitted>",
  "observedAt": "2026-10-25T11:49:00Z" }
```

**Citation kinds:** `hf_file`, `hf_card`, `gguf_header` (with the parsed-metadata hash), `gh_release`, `source_version_locator` (KC chunk + start and end locators), `computed` (a formula version plus the ids of its cited inputs).

**Rules:**
- A `computed` value is cited only if all its inputs are cited.
- An uncited value renders as **"unknown"**.
- Public surfaces use only fields whose assertions are eligible (admitted, accepted and current). Admin surfaces may show provisional values, labelled "unreviewed".

### 6.3 Fit estimator `trace-fit-v1`

This extends the open-model plan §7 with the inputs Lane A makes available. It is a pure function, versioned, with exhaustive tests.

```text
inputs: artefact files (cited sizes), parsed GGUF header + tensor table, runtime_version record,
        hardware_profile, workload {context c, concurrency n, kv_dtype}, placement mode

weights_bytes_d      = Σ bytes of tensors placed on device d            (tensor table; split per runtime rule)
                       no tensor table → whole-file size on a single device; split modes → "unknown"
kv_bytes_per_token   = Σ_over_layers_with_KV ( 2 × head_count_kv × head_dim × kv_dtype_bytes )
   layers_with_KV    = block_count, unless the architecture record says otherwise:
                       hybrid (e.g. qwen35 full_attention_interval = k) → block_count / k
                       sliding-window layers → window-capped term
                       MLA / latent attention → latent-dimension term
                       unknown architecture rule → kv = "unknown" (never guessed)
   head_dim          = attention.key_length if present, else embedding_length / head_count  (GGUF spec)
recurrent_state      = per-sequence constant for SSM / linear-attention layers: runtime-record formula, else "unknown"
kv_bytes             = c × kv_bytes_per_token × n
overhead_d           = runtime_version record (compute buffers, context) or observed; else "unknown"
reserved_d           = hardware_profile reservation (display, OS); default from the device record
need_d               = weights_bytes_d + kv_share_d + recurrent_share_d + overhead_d + reserved_d
```

**Levels** (unchanged from ADR 0019 and the open-model plan §7):

| Level | Condition |
|---|---|
| `will_load` | Fits at the minimum context |
| `minimum_usable` | Fits at the workload minimum context, n = 1 |
| `recommended` | Fits at the requested c and n with **≥ 10 % headroom per device** |
| `production_or_agent_use` | `recommended` plus a `works` or `works_with_configuration` compatibility record |

**Rules:**
- If `overhead_d` or `recurrent_state` is `unknown`, the estimator **may report `will_load` at most**, labelled "weights and KV fit; runtime overhead not on record". It never reports `recommended`.
- Devices are never pooled; split modes follow the open-model plan §8.
- Device memory uses the device record's exact byte figure. Where the vendor states only "16 GB", the record says so, and the estimator uses 16 × 10⁹ bytes, which is conservative against GiB.

### 6.4 Throughput ceiling `trace-decode-bound-v1`

**Basis.** Token-by-token decoding is memory-bandwidth-bound. Per generated token, the runtime reads the weights in use plus the KV cache. Databricks defines the achieved bandwidth as *(model parameter size + KV cache size) / time per output token* [X-09].

```text
bytes_per_token_d = weights_read_per_token_d + kv_bytes_at_context_d
   dense: weights_read_per_token = Σ tensors on d, excluding token_embd (one row is read per token)
   MoE:   shared tensors + expert_used_count / expert_count × expert tensors   (needs the tensor table and
          expert keys; else "unknown")
time_per_token  ≥ Σ_d bytes_per_token_d / bandwidth_d        (layer split: devices take turns, open-model plan §8)
decode_ceiling  = 1 / time_per_token                          (tokens per second, upper bound)
```

**Output rules:**
- Stored and rendered as **"ceiling (memory-bandwidth bound), not an expected speed"**, with evidence class `trace_deterministic_estimate`.
- **Never** shown as a speed for H13 or H16. It is shown only as "cannot exceed about X".
- **Prefill (prompt processing) is not estimated:** it is compute-bound and runtime-specific.
- The ceiling never ranks models above observed records (open-model plan §9, "Fastest usable").
- **Bandwidth must be cited** from the device record. If it is missing, the ceiling is `unknown`.

### 6.5 Worked examples (all inputs cited)

**Qwen3.5-9B Q4_K_M.** Inputs:
- weights 5,680,522,464 B [X-04];
- header fields from §5.3 [X-04][X-08]: 32 blocks, `full_attention_interval = 4`, so 8 layers with KV (assuming llama.cpp's reading of the key, to be confirmed in the OM-3 tests);
- 4 KV heads, `key_length` 256;
- f16 KV (2 bytes), assumed as llama.cpp's default cache type, to be captured as a `runtime_version` field.

| Quantity | Value |
|---|---|
| KV per token | 8 × 2 × 4 × 256 × 2 = **32,768 B** |
| KV at 4,096 / 32,768 / 131,072 / 262,144 tokens | 0.134 / 1.074 / 4.295 / 8.590 GB |
| Weights + KV at 32,768 tokens | 6.754 GB |
| Largest context with weights + KV ≤ 90 % of 16 × 10⁹ B | 266,097 tokens, which exceeds the native 262,144. **The level is still `will_load`** until runtime overhead and SSM state are on record (§6.3). |

Decode ceiling, using whole-file bytes (the approximate form, since the tensor table would subtract `token_embd`):

| Device (bandwidth, citation) | Ceiling at 4K context | Ceiling at 32K context |
|---|---|---|
| RTX 5060 Ti 16 GB (448 GB/s, inventory `HW-rtx5060ti-*`, CR) | ≤ 77.0 tok/s | ≤ 66.3 tok/s |
| RTX 4060 Ti 16 GB (288 GB/s, `HW-rtx4060ti-*`, CR) | ≤ 49.5 | ≤ 42.6 |
| Arc Pro B70 32 GB (608 GB/s, `HW-arc-b70-*`) | ≤ 104.6 | ≤ 90.0 |
| Arc Pro B50 16 GB (224 GB/s, `HW-arc-b50-001`) | ≤ 38.5 | ≤ 33.2 |
| RX 7900 XTX (960 GB/s, `HW-7900xtx-*`) | ≤ 165.1 | ≤ 142.1 |
| CPU-only, dual-channel DDR5-5600: 2 × 8 B × 5,600 MT/s = 89.6 GB/s theoretical | ≤ 15.4 | ≤ 13.3 |
| CPU-only, dual-channel DDR4-3200: 51.2 GB/s theoretical | ≤ 8.8 | ≤ 7.6 |
| **Owner's machine: CPU-only, 32 GB DDR3-1600, dual channel: 25.6 GB/s theoretical** | **≤ 4.4** | **≤ 3.8** |

**Reading the CPU rows.** The owner's machine is 32 GB of DDR3-1600 with no GPU (owner-stated, Revision 2). Decoding 800 output tokens takes **at least about 180 s** per item before any prefill. That confirms Qwen there is an optional benchmark or verifier at most (§10.4). An **actual CPU benchmark** replaces this estimate for that profile.

**Qwen2.5-0.5B Q4_K_M** (header [X-04]): 24 blocks × 2 × 2 KV heads × 64 (= 896 / 14) × 2 B = **12,288 B per token**, so 32,768 tokens = 0.403 GB of KV. This is the unit-test fixture for a plain GQA architecture.

### 6.6 Relation to the hardware scenarios H01–H16

| ID | Scenario | Catalogue records needed | What the estimator contributes | Still needs |
|---|---|---|---|---|
| H01 | 24 GB NVIDIA, coding, 32K | Artefact files + header for ~27–35B releases; `hardware_device` for the 24 GB card (**bandwidth not yet in the inventory for the RTX 3090: capture it**) | Memory breakdown; fit level; decode ceiling | `runtime_support` (llama.cpp CUDA) for the arch and format; compatibility record for `works` |
| H02 | 16 GB, 128K context | Header KV fields | Excludes 128K by KV term; shows the max context; alternatives with KV quantisation only where `runtime_support` lists the KV dtype | Runtime KV-dtype record |
| H03 | Arc 32 GB, runtime incompatible | `runtime_support` per backend (SYCL, Vulkan) from release notes and docs | None (compatibility join, not memory) | Lane A release-note grammar for `[SYCL]` / `vulkan:` |
| H04 | Chat works, tools unreliable | n/a | None | `compatibility_record` (TRACE-tested, OM-5) |
| H05 | Dense versus MoE, 24 GB + 128 GB | Tensor table with expert tensors | Stored-weight fit; MoE ceiling uses the active share (§6.4) | Runtime record documenting expert offload |
| H06 | 2 × 16 GB split | Tensor table | Per-device placement under layer split; never 32 GB pooled | Runtime split rule |
| H07 | 8 GB + 64 GB RAM offload | Tensor table; RAM bandwidth (cited) | Two-device time sum: ceiling for the offloaded case; `minimum_usable` at most | Observed speed for any ranking |
| H08 | AMD Windows | `hardware_device` ROCm support list (`HW-7900xtx-*` etc.); runtime docs | None | ROCm and Vulkan support records per OS |
| H09 | Apple 64 GB unified | `hardware_device` with a usable-fraction field (cited) | Fit against the usable fraction | Apple device records (**not in the inventory yet**) |
| H10 | Creative versus coding | n/a | Same memory facts; ranking differs (open-model plan §9) | Quality evidence |
| H11 | 32 GB + 16 GB, supervisor + 2 workers | Two artefacts | Separate per-device fits, each with its own KV | Batching support record |
| H12 | IQ2/IQ3 on 16 GB | `quantisation.file_type` / effective bits per weight | Flags ≤ 3 bpw as experimental | Evaluation evidence |
| H13 | Missing benchmark | n/a | **Must not** present the ceiling as a speed (test) | n/a |
| H14 | Misleading community claim | `performance_observation` (`community_report`, Lane C) | Shows the ceiling next to the claim. A claim above the ceiling is flagged **"exceeds memory-bandwidth bound: configuration likely misreported"**. This is deterministic. | Reviewer |
| H15 | Licence | MC-4 licence record | n/a | Licence-condition record |
| H16 | Exact speed on the reference workstation | B70 + 5060 Ti records (cited) | Refuses an exact figure; may state "cannot exceed about X" with the formula version | Observed records |

**The estimator changes 9 of the 16 scenarios** (H01, H02, H05, H06, H07, H09, H11, H12, H14) from "no basis" to "deterministic partial answer". None reaches `production_or_agent_use` without compatibility records, by design.

---

## 7. Lane B: story inbox

### 7.1 Flow

```text
discovery (Desk URL · Capture · Lane A trigger · feeds once ungated)
  → candidate (ADR 0015 `new`)                                          D
  → canonicalise, dedupe, cluster (§7.3)                                D
  → classify capability / narrative (rules; model may only suggest)     D (+M suggestion)
  → rank (§7.4) → top-K selected under the daily draft cap              D
  → capture the evidence-bearing sources (KC-11, permitted storage mode)  D (Worker)
  → fact sheet: entities, versions, numbers, dates with locators         D
  → pre-run draft (§7.5) → validators (§7.6)                           M + D
  → `draft_ready` in the inbox
  → owner: Approve (publish) · Edit then Approve · Skip (archive) · Hold   H
  → timers: unreviewed → `held` → `archived` (§7.8)                     D
  → knowledge candidates from the story's sources → absorption (§11)    D
```

### 7.2 Inbox card (one per cluster)

| Section | Content |
|---|---|
| Header | Draft headline; capability or narrative badge; rank score with its top three contributing features; age |
| Draft | Summary and "why it matters"; key facts, each with its quoted span and source link |
| Checks | Validator results (§7.6) as pass or fail chips; ADR 0004 risk flags; provenance groups (n, and whether they are shared-origin) |
| Cost | Tokens and US$ for this draft (from the gateway ledger) |
| Knowledge | "N facts proposed": catalogue updates, Evidence Library candidates, with a link to the absorption queue |
| Actions | **Approve**, **Edit**, **Skip**, **Hold**. Approve is disabled while any blocking validator fails. |

**Approve calls the existing publication route** with the owner's Access identity, the reviewer time and the final text (ADR 0012 #8). It is the human review. Nothing else publishes.

### 7.3 Clustering (deterministic)

**Signals, in order:**
1. same canonical URL (exact);
2. same **origin link**: the article cites or links the same primary URL (release, card, paper, advisory);
3. normalised-title MinHash Jaccard ≥ 0.6 within 72 h;
4. entity overlap: same catalogue entity ids and same event class (release, pricing change, benchmark) within 72 h.

**Merge and split.** Signals 1–2 merge automatically. Signals 3–4 propose a merge shown on the card ("possible duplicate of…"). The owner's Skip on a duplicate is one tap. Splitting is always human.

### 7.4 Ranking (deterministic, versioned weights `trace-rank-v1`)

```text
score = 3.0·capability (ADR-0020 class = capability)  + 2.0·primary_source_present
      + 1.5·watched_entity (catalogue watch list)     + 1.0·independent_groups(≥2)
      + 1.0·novelty (no story on the entity in 14 d)   − 2.0·duplicate_suspect
      − 3.0·muted_topic (owner list)                   + 0.5·recency_decay(24 h half-life)
```

The weights are configuration, changed only by owner decision and recorded with each card. Learned ranking is out of scope.

### 7.5 Pre-run drafts and caps

| Parameter | Proposed default | Basis |
|---|---|---|
| Model | `deepseek-flash`, **non-thinking mode** | The current alias [X-01]. Thinking is the default mode, and reasoning tokens bill as output, so drafts must set non-thinking explicitly or cap reasoning. |
| Drafts per day (K) | **10 in P1**, then 25, 40 or 50 by weekly owner decision (§14.1) | 50 stories/day target. The rest are low-rank and shown as "not drafted; draft on demand". |
| Input cap | 12,000 tokens (fact sheet + bounded source extracts) | Existing `TRACE_AI_MAX_INPUT_TOKENS` default |
| Output cap | 1,500 tokens | Existing `TRACE_AI_MAX_OUTPUT_TOKENS` default |
| Attempts | 1; no retries; no regeneration (ADR 0012) | A failed draft shows "Draft failed; draft on demand" |
| When | **Workstation model window W1, 22:00–00:45 UTC** (off-peak; §10.6). Worker on-demand drafts remain possible under the unchanged editorial budget. | Workstation timer (I-7) |
| Daily cap | Workstation `draft_story` US$0.30 a day, within the workstation's US$2.75 a week (§14.1) | §14.1 |

**Input.** The model receives:
- the deterministic fact sheet;
- bounded, permitted source extracts;
- the output schema;
- the TRACE constitution (`task-policy.ts`).

It receives no URLs to fetch and no tools (ADR 0008 §3.1).

### 7.6 Draft validators (deterministic; blocking unless noted)

| # | Check | On fail |
|---|---|---|
| V1 | Every number, version, date and model name in the draft appears in the fact sheet or a quoted span | Block; highlight the token |
| V2 | Every quoted span re-finds in its source version (I-3) | Block |
| V3 | No citation to a source outside the cluster's source set | Block |
| V4 | ADR 0004 risk lexicon (security, legal, misconduct, "best", benchmark superiority, sponsored) | **Non-blocking flag:** "careful review" |
| V5 | Single-provenance-group cluster | Non-blocking flag: "one origin: phrase as attributed" |
| V6 | Length and schema | Block |

### 7.7 Independence for news (OP-2)

Deterministic signals can only **merge** provenance groups toward an origin, never split them:
- an article whose key facts all re-find in a linked primary source is grouped with that primary (`derived_from_origin`);
- syndicated copies (same canonical origin, or body MinHash ≥ 0.9) are grouped together;
- an article and the vendor's own announcement are grouped under the vendor when the article cites the announcement.

**The two-independent-groups rule is unchanged.** These proposals feed the existing KC-05D shared-origin review. Splitting requires a reviewer.

### 7.8 Hold and archive timers

| Timer | Default (owner decision KP-6) | Effect |
|---|---|---|
| `draft_ready` not acted on | **72 h** | → `held` (still visible, collapsed) |
| `held` not acted on | **7 days** | → `archived`, with reason `unreviewed_timeout`. Restorable from the archive. |
| Draft source changed (new source version) | Immediate | Draft marked **stale** (ADR 0015). Approve is disabled until it is re-drafted or the owner overrides. |

The timers are evaluated when the inbox is opened or prepared (request-driven), so no Cron is needed.

### 7.9 Story → knowledge

**Approving a story never admits a fact.** The card lists the knowledge candidates found in its sources:
- catalogue updates go to Lane A (triggered acquisition of the primary);
- self-describing facts go to the MC classes if a primary exists;
- everything else goes to batch or item review.

Facts worth keeping but not worth a story go to the **Evidence Library** (§11.6). This addresses "publishing ≠ knowledge" structurally: every fact goes through absorption on its own merits.

---

## 8. Lane C: social automation (Reddit first)

### 8.1 Current state and external constraints

**Proven:** TRACE Capture → `/api/admin/capture-submit` → `social_signals` (`pending` / `unreviewed`) or Desk candidates, on Preview, 2026-10-25. The Android follow-up list includes "Reddit /s/ share-link canonicalisation".

**Reddit Responsible Builder Policy** (support article, updated about 19 days before 2026-10-25) [X-02]:
- **"Approval is required":** explicit approval is needed before accessing *any* Reddit data through the API.
- Commercial use needs **explicit written approval**.
- No circumventing or exceeding access limits.
- No **use of the data to train ML or AI models**.
- No inferring sensitive characteristics of users.
- Researchers must re-run queries to honour removals.

TRACE plans advertising and affiliate revenue (ADR 0011), so the owner must state the use **truthfully**. "Be transparent" is a policy requirement, and whether TRACE counts as commercial is for Reddit to decide on the request.

**Third-party reports (unverified):** about 100 queries per minute per OAuth client for approved free-tier clients; approval queues of uncertain length; small personal projects frequently refused [X-03]. Treat these as planning risks, not facts.

### 8.2 Share-link resolution and canonicalisation

**Deterministic canonical form:** `https://www.reddit.com/r/{subreddit}/comments/{post_id}/` (lower-cased host; tracking parameters `utm_*`, `share_id`, `context` stripped). For comments, add `{comment_id}/`. Then:
- `external_post_id` = `t3_{post_id}` (or `t1_{comment_id}`);
- `canonical_url_hash` per ADR 0009 §13.

**`/s/` share links** (`https://www.reddit.com/r/{sub}/s/{token}`) do not contain the post id. Resolution options, in order of preference:

| Option | How | Assessment |
|---|---|---|
| **S-1 (preferred)** | **On the phone:** TRACE Capture resolves the share link as the owner's own client, then sends both the original share URL and the canonical URL | The owner's device opening a link they were sent is ordinary user behaviour. No server touches Reddit. This needs an Android change in the owner's app work. |
| S-2 | **Worker:** one `HEAD`/`GET` with `redirect: "manual"` to the share URL; read only the `Location` header; host allow-list `reddit.com` and `www.reddit.com`; no body read; no cookies | Inside ADR 0009 §13's SSRF rules. It is still an automated request to Reddit, so check it against the Responsible Builder Policy (KP-9). Use only if S-1 is unavailable. |
| S-3 | Owner pastes the canonical URL | Always available fallback |

The share URL is retained as `submitted_url`, the canonical URL as `canonical_url`. **Deduplication uses the canonical hash only.**

### 8.3 Obtaining post text: permitted routes

| Route | Mechanism | Status | Storage |
|---|---|---|---|
| **R-1 Owner-supplied text (default from V1.1)** | The owner selects or copies the post text (or the relevant part) in the Reddit app and shares it with TRACE Capture with the URL, or pastes it in the Desk card | Available without any Reddit API. The owner reads a public post as a user and supplies the words. | **Bounded excerpt only:** ≤ 2,000 characters per post, quoted spans for facts. Original link kept (ADR 0009 §8). |
| **R-2 Reddit Data API (after approval)** | OAuth under an app the owner registers once approved; fetch **only** the submitted post or comment by id; no threads, listings or user histories | **Requires approved access** [X-02]; KP-8 | Same bounds. Removal re-check at publication and at 30 days (§8.9). |
| R-3 ADR 0009 §10 single bounded HTML fetch | The existing editor-requested triage fetch (transient) | Already permitted by ADR 0009; **not relied on**: Reddit may serve a login or interstitial to server fetches (unverified) | Transient, as today |
| ~~R-4 Local scraping of Reddit pages~~ | n/a | **Rejected:** the Responsible Builder Policy requires approval for access to Reddit data; ADR 0009 §7 | n/a |

**Why R-1 is the default.** The owner already captures posts by hand through the share sheet: that is how they arrive in Lane C. Adding the text the owner already sees costs seconds, needs no third-party permission, and keeps a human as the acquirer. R-2 is an efficiency upgrade when and if Reddit approves it.

### 8.4 Extraction with quoted spans

**Input:** the stored excerpt, normalised. **Deterministic extractors** (`trace-social-grammar-v1`):

| Field | Grammar |
|---|---|
| Hardware | Dictionary from `hardware_device` aliases (for example "5060ti", "RTX 5060 Ti 16GB", "B70", "3090", "M4 Max 128GB") plus a memory-size pattern |
| Model and artefact | Catalogue alias table; HF repo pattern `[\w.-]+/[\w.-]+`; quant labels `(I?Q[1-8]_[0-9A-Z_]+\|Q[2-8]_K(_[SMLX]+)?\|F16\|BF16\|MXFP4\|NVFP4\|EXL3 [\d.]+bpw\|AWQ\|GPTQ)` |
| Runtime and version | `llama.cpp` + `b\d{3,5}` or a commit; `vLLM \d+\.\d+(\.\d+)?`; `Ollama \d+\.\d+…`; backend tokens CUDA, ROCm, Vulkan, SYCL, Metal |
| Speeds | `(\d+(\.\d+)?)\s*(t/s\|tok/s\|tokens/s\|tps)` with role cues (`pp`, `prompt`, `prefill` → pp; `tg`, `gen`, `decode` → tg) |
| `llama-bench` tables | Markdown table with header `model \| size \| params \| backend \| ngl \| … \| test \| t/s`; rows `pp512`, `tg128` etc. Parsed exactly; these are the highest-quality community reports. |
| Settings | `-ngl \d+`, `-c \d+`, `--ctx-size`, `-fa`, `--n-cpu-moe \d+`, `-ts`, `-sm (layer\|row\|tensor)`, `--cache-type-k \w+`, batch size |
| Context and batch | Numbers with `k` / `K` context cues |

**Each extracted value stores** `{value, startOffset, endOffset, sha256(span)}` against the stored excerpt (I-3).

**Model fallback** (`deepseek-flash`, non-thinking, ≤ 10 a day; **disabled until KP-24**, so deterministic extraction only in the pilot): used only when a post has a speed number but grammar coverage of the required fields is incomplete. The model returns field → **verbatim span**. Spans that do not re-find are dropped. Values the model "normalises" (for example "about 40" → 40) are rejected.

**Configuration completeness** (deterministic score, 0–7): hardware, artefact or quant, runtime and version, context, batch or settings, pp speed, tg speed. Below 4 ⇒ stored as `configuration_incomplete` and never used in rankings or comparisons, only listed.

### 8.5 Records produced

- **`performance_observation`** with `evidence_class = community_report` (ADR 0019): attributed to the platform and post, with author **minimised** (§8.9), the extracted configuration and the completeness score.
- **H14 guard:** if `tg` > the `trace-decode-bound-v1` ceiling for the stated configuration, flag "exceeds memory-bandwidth bound". The report is kept, but flagged for reviewer attention.
- **Social card draft** (ADR 0009 §8 shape), using the same validators as §7.6. It is published only on the owner's tap. The card is labelled **COMMUNITY REPORT**.

### 8.6 Linked sources become separate candidates (ADR 0009 §3.2)

- URLs in the excerpt are extracted deterministically and canonicalised.
- **Primary-source URLs** (HF repo or file, GitHub release or tag or PR, official docs on the source registry) become **Lane A triggers**: their facts come from the primary API, never from the post's description of them.
- **Other URLs** (articles, papers) become **separate candidates** (`new`, `discovery_method = social-signal`, `socialSignalId` set), proposed on the card as "N linked sources found: create candidates?" with a single tap to accept all, or deselect some.
- The post's interpretation never sets the linked source's classification (ADR 0009 §14). Rejecting the post keeps the linked sources.

### 8.7 Independence for social (OP-2)

| Situation | Deterministic grouping |
|---|---|
| A post links or quotes a release, card or article | Same provenance group as that origin |
| Two posts by the same author (hashed handle) | Same group |
| A cross-post of the same text (MinHash ≥ 0.9) | Same group |
| Posts reporting different hardware or configurations | **Not** merged automatically; each is its own `community` group |

**Community groups never satisfy `supported` for non-community claim classes**, and community reports are "claims based mainly on community reports" under ADR 0004: human review always. Two community reports agreeing does **not** make a publisher-class fact.

### 8.8 Volume and owner time

At 20 posts a day:
- grammar extraction: 20 × 0 calls;
- fallback: ≤ 20 calls;
- linked-source detection: deterministic.

Owner time is about 15 s per card (approve card / keep internal / reject), so about 5 minutes a day (§12).

### 8.9 Privacy and rights (social-specific)

- **Usernames:**
  - store `author_handle_hash` (HMAC with a TRACE secret) for grouping;
  - store a display handle only if the owner ticks "attribute by name" (ADR 0009 §16 "minimise username storage");
  - never store profile data;
  - never infer sensitive characteristics (Responsible Builder Policy [X-02]).
- **Removals:**
  - on publication, re-check availability via the route used (R-2: API; R-1: the owner taps "still available?" on open);
  - under R-2, re-check at 30 days;
  - if a post is removed or deleted, the card is withdrawn, the excerpt deleted and the observation **revoked for rights** (§11.7). The linked sources and Lane A facts are unaffected.
- **No AI training on Reddit data** [X-02]. DeepSeek's privacy policy permits training on inputs, with an email opt-out [X-16], and its API terms do not exclude it [X-15]. **Owner-supplied excerpts are therefore not sent to DeepSeek** until the opt-out is confirmed in writing and the owner accepts PRC processing (KP-24).
- **No mirroring or media:** ADR 0009 §9.3 unchanged.

---

## 9. Exactly which ADR 0009 rules change, and why

The full text is in `docs/adr/0009-amendment-02-social-post-text-extraction-and-community-reports.md` (Proposed). Summary:

| ADR 0009 rule (accepted text) | Proposed change | Why |
|---|---|---|
| §10: the server must not "**persist the fetched page**" | **Unchanged for fetched pages.** New: TRACE may persist a **bounded excerpt** (≤ 2,000 characters) of a social post's text when it was (a) supplied by the owner (R-1) or (b) obtained through an **approved** platform API (R-2), plus quoted spans for extracted facts | Extraction with re-findable quoted spans needs stored text. A full page is still never persisted. |
| §10: must not "**create a signal, candidate or public card automatically**" | **Signals and public cards:** unchanged. A signal is created only by an owner action (Capture or Desk); a card is published only by an owner tap. **Candidates:** the system may *propose* linked-source candidates. They are created **only on the owner's one-tap accept** on the signal card, and every candidate starts as `new`. **Community-report records** (`performance_observation`, `community_report`) may be created automatically **as pending, private records** from an owner-created signal. | Removes the per-link manual entry while keeping a human decision per signal. Nothing becomes public or evidence automatically. |
| §10: must not "**follow links embedded in the post**" | Linked **primary-source** URLs on the source registry's primary-API allow-list (HF, GitHub) may be **looked up through those platforms' own APIs** by Lane A. Other linked URLs are not fetched until they are accepted as candidates and enter the normal capture route. | Primary facts come from primaries (OP-1); the post is only the trigger. |
| §2 item 4 and §12: "limited reviewer-supplied metadata"; `limitedExcerpt` optional | The excerpt may be owner-supplied **or** API-obtained (R-2). Extracted fields are stored with spans. | Same |
| §20 Phase S5: "possible official integrations … create a separate decision; pilot one narrow integration" | **This amendment is that decision for Reddit:** R-2, a narrow single-post-by-id integration, only after Reddit approval, rate-limited and removal-aware | Responsible Builder Policy [X-02] |
| §21: "no arbitrary, automatic or linked-URL fetch occurs in the initial phase" | Replaced by: no arbitrary or crawling fetch. Permitted automated requests are (a) the S-2 `Location`-only resolution if adopted, (b) R-2 single-object API reads, and (c) Lane A primary-API lookups. All are logged. | Matches the new routes exactly |
| §3.1 (signals, not proof), §3.2 (linked material independent), §7 (public boundary), §9 (quotation and media), §16 (Reddit rules), §19 (social posts always admin-approved) | **Unchanged** | These are the trust core |
| §11 evidence states | Unchanged. `community-report` and `first-hand-claim` are used for extracted reports. | n/a |

**Also unchanged:** the model still never fetches URLs. Public submissions still never trigger fetches (the §25 amendment). Popularity still never sets confidence.

---

## 10. Model tiering, DeepSeek-first local processing and the gateway

**Revision 2 (owner-approved, 25 October 2026):**
- DeepSeek Flash is the **primary language engine** of the initial local acquisition system.
- Qwen3.5-9B on the owner's CPU-only machine is **optional only**.
- Deterministic-first (ADR 0021) is unchanged: acquisition, metadata extraction, GGUF parsing, hashing, deduplication, validation and packaging stay deterministic.

### 10.1 Tiers and assignment

| Tier | What | Role |
|---|---|---|
| **T0 deterministic** | Code | Everything in §3.2 marked D |
| **T1 DeepSeek `deepseek-flash`, non-thinking** | DeepSeek API through the shared ADR 0008 contracts (§10.5). Called from the workstation for nightly local work, and from the Worker for owner-triggered editorial tasks, as today. | **Primary language engine:** approved drafting and free-text mapping |
| **T2 free or flat tiers** | For example OpenCode Go | **Excluded** from the pipeline (§10.3) |
| **T3 local Qwen3.5-9B** | The owner's CPU-only machine (§10.4) | **Optional only:** a local benchmark; an independent verification worker (it can only add `reviewer_required`, I-2); a future substitute after evaluation |

**When a model may be used.** Model-assisted extraction and knowledge reconciliation are allowed **only where deterministic methods are demonstrably inadequate**, which means:
- **(a) per task:** the T0 grammar's coverage on the recorded corpus is below the task threshold (proposed 80 % of items fully mapped), measured and recorded in the run ledger before the model task is enabled;
- **(b) per item:** only items the grammar could not map are sent.

Every model-generated factual candidate must pass schema validation and carry a **re-findable citation**: a verbatim span with offsets in the stored source text (I-3).

| Task type | Tier | Where | Input (public material only) | Output | Validator |
|---|---|---|---|---|---|
| `map_release_change` | T1 | Workstation | Template-stripped release text of a watched runtime | List of `{label ∈ closed enum, verbatim bullet span, entity strings}` | Span re-find; enum; entity alias match |
| `reconcile_entity` | T1 | Workstation | One unmatched entity string, plus up to 10 candidate catalogue ids with their aliases (from the local catalogue) | One of the supplied ids, or `none` | The answer must be one of the supplied ids. **It never creates an entity.** |
| `draft_story` | T1 | Workstation (nightly pre-run) or Worker (on demand) | Fact sheet plus bounded public extracts | Draft | V1–V6 (§7.6), re-run by the Worker on import |
| `map_social_report` | T1 | Workstation | Owner-supplied excerpt | Field → verbatim span | **Disabled** until KP-24 (§10.2, §8.9) |
| `verify_independent` | T3 (optional) | Workstation | Same inputs as a `map_*` task | Agree or disagree | Can add `reviewer_required` only |

**Assignment rules:**
- Assignment is per task type in configuration.
- **There is no runtime fallback between tiers or providers** (ADR 0008 §2.1.5; ADR 0012 #3). A failed or unavailable T1 call defers the item (§10.6). It never moves to T3.
- **DeepSeek never** admits assertions, sets freshness, decides provenance independence, approves evidence or publishes stories (I-1, I-8).

### 10.2 DeepSeek facts, verified 25 October 2026

| Item | Value | Source |
|---|---|---|
| Current Flash id | **`deepseek-flash`**, served by DeepSeek-V4.1-Flash-1017 | [X-01] |
| Legacy ids | `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp`: "the corresponding models have been retired", still accepted, served by V4.1-Flash-1017 and billed at the Flash price | [X-01] |
| Pro | `deepseek-v4-pro`, served by DeepSeek-V4-Pro-0813 | [X-01] |
| Flash price (USD per 1M tokens), peak / off-peak | Input cache hit 0.006 / 0.003; input cache miss **0.30 / 0.15**; output **1.20 / 0.60** | [X-01] |
| Pro price, peak / off-peak | 0.044 / 0.022; 1.32 / 0.66; 3.96 / 1.98 | [X-01] |
| Off-peak | Half price. **Peak is 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays.** All other hours are off-peak, including weekends and those holidays in full. | [X-01] |
| Non-thinking parameter | OpenAI format: `{"thinking": {"type": "disabled"}}`. Thinking is **enabled by default** (effort high). With the OpenAI SDK it is passed in `extra_body`. | [X-13] |
| Token ratio | About 0.3 tokens per English character (API `usage` is authoritative) | [X-14] |
| Balance | `GET https://api.deepseek.com/user/balance` returns `is_available` and balances | [X-17] |
| Context; max output | 1M; 384K | [X-01] |
| Data terms | The Open Platform Terms (effective 29 April 2026) do not say whether API inputs are used for training or how long they are kept. The Privacy Policy (updated 10 February 2026) lists training on user input, an opt-out by email to `privacy@deepseek.com`, retention "for as long as you have an account", and storage in the People's Republic of China. | [X-15], [X-16] |

**Repository facts** (`main` at `5cb64af`):
- `src/ai/config.ts` allows `deepseek-v4-flash` and `deepseek-v4-pro`; the **editorial default is `deepseek-v4-pro`**.
- Configured Flash prices are USD 1 input / 5 output per million, via `TRACE_AI_FLASH_*_USD_PER_MILLION`.
- The editorial daily budget is **USD 0.50**.
- `src/ai/providers/deepseek.ts` already sends `thinking: { type: "disabled" }`.

**This design does not change the Worker configuration.** G-1 remains a separate, approved change. Pending G-1, the Worker keeps its conservative configured prices, which over-reserve by 3.3× on input and 4.2× on output.

**Consequences for data sent to DeepSeek:**
- **Public primary-source material is the first pilot dataset:** release notes, model cards, public docs and published articles.
- **Owner-supplied social excerpts are not sent** until the owner has requested the training opt-out and has it confirmed in writing (KP-24). Reddit's policy forbids using Reddit data to train models [X-02], and DeepSeek's policy permits training on inputs by default.
- Private reviewer notes, personal information, credentials, Access identities and private Desk content are **never** sent.

### 10.3 T2: OpenCode Go, checked 25 October 2026 [X-10]

| Requirement from the brief | Finding | Assessment |
|---|---|---|
| Data retention | Per-model table. Most models 0 days and not used for training. Several closed models 30 days. "Muse Spark … Contributor" models train on prompts. **DeepSeek V4.1 Flash / V4 Pro: 0 days, under a ZDR agreement "renewed monthly … valid through October 31, 2026"**. | Retention varies by model and month; it would need re-verifying every month |
| Permitted automated use | Go is "designed primarily for OpenCode and other coding agents". Clients should "send typical coding agent traffic", identify with their own user agent, and send a stable `x-opencode-session` header per conversation. Traffic is monitored for abuse. Workspaces are single-member. | A batch extraction or drafting pipeline is **not** typical coding-agent traffic |
| Rate limits and availability | Per-model dollar allowances: 5-hour (20 %), weekly (50 %) and monthly (100 %). The page states no per-minute limits. "Usage limits may change"; "the list of models may change". | Not predictable enough for a nightly pipeline |
| Public material only | It would be public material only | n/a |

**Recommendation:** do not use T2 in the TRACE pipeline. Third-party reviews [X-11] are not used as facts.

### 10.4 T3: Qwen3.5-9B on the owner's machine (corrected hardware)

**Hardware (owner-stated, 25 October 2026):** 32 GB DDR3-1600 RAM, CPU only, **no GPU**.

| Quantity | Value | Basis |
|---|---|---|
| Theoretical memory bandwidth (dual channel) | 2 × 8 B × 1,600 MT/s = **25.6 GB/s**, about half a dual-channel DDR4-3200 desktop (51.2 GB/s) | Arithmetic from the stated configuration. The channel count must be confirmed by the benchmark machine's inventory. |
| Qwen3.5-9B Q4_K_M weights | 5,680,522,464 B | [X-04] |
| Decode ceiling (§6.4) | **≤ 4.4 tok/s at 4K context; ≤ 3.8 tok/s at 32K** | `trace-decode-bound-v1`, whole-file approximation |
| Minimum time for 800 output tokens | **≥ ~180 s per item, before any prefill** | 800 / 4.4 |

**Conclusion.** This machine is not a production engine for TRACE. Its roles are:
1. **Benchmark:** produce the first real `trace_tested` performance record for a CPU-only DDR3 profile, which is itself a useful catalogue datum.
2. **Optional independent verifier:** for a small nightly subset of `map_*` outputs. It can only add `reviewer_required`.
3. **Future substitute:** evaluated on the upcoming PC, never assumed.

**CPU benchmark plan** (an actual measurement, not an estimate):

| Element | Specification |
|---|---|
| Build | llama.cpp at a pinned release tag (for example the latest `bNNNNN` at run time), CPU backend; the build flags and the CPU's instruction-set flags recorded |
| Artefact | `unsloth/Qwen3.5-9B-GGUF@3885219b…` `Qwen3.5-9B-Q4_K_M.gguf`; SHA-256 verified after download. **A one-off, owner-approved full download for benchmarking only; Lane A itself never downloads weights.** |
| Runs | `llama-bench` with `-p 512 -n 128` at thread counts 4, 8 and the physical-core count; 5 repetitions; context 4K and 16K; KV f16 |
| Recorded | pp and tg tokens per second (mean and standard deviation), peak RSS, CPU model, RAM configuration (channels, speed as reported by the OS), OS, date |
| Output | A `performance_observation` with evidence class `trace_tested` for this exact profile, and a comparison with the ceiling (tg should be below it; if it is above, the inputs are wrong) |
| Use | Decides whether role 2 is worth its time. Expected: only for a handful of items a night. |

**The upcoming PC** (the open-model plan §14 reference workstation, if purchased) is evaluated the same way before any T3 drafting.

### 10.5 Gateway reuse: the workstation runner shares the ADR 0008 contracts

**Options:**
- **(A) Workstation calls DeepSeek directly**, using code shared with the Worker gateway.
- **(B) Workstation calls a new Worker model route.**

**Recommendation: (A).** With (B), every model call would cost Worker and D1 writes (the `ai_requests` ledger) and would add a new externally reachable model route. (B) can be revisited if central accounting becomes necessary.

| Concern | How (A) stays faithful to ADR 0008 and ADR 0012 |
|---|---|
| Task policy | `src/ai/task-policy.ts` (constitution, `TRACE_POLICY_VERSION`) is **imported, not copied**. The runner lives in this repository (`local/acquisition/`, proposed), so it uses the same source files at the same commit. |
| Request contract | `src/ai/providers/deepseek.ts` request shape: model allow-list, `thinking: {type: "disabled"}`, `max_tokens`, timeout, **one attempt**, no retries, no tools, no URLs. The model-router deprecated-alias guard is reused. |
| Output validation | `src/ai/schemas.ts` and `src/ai/validation.ts` plus the span re-find validator |
| Usage accounting | `DurableAIGovernance` is bound to D1 (its constructor takes a `D1Database`). The runner implements **the same lifecycle** (`begin` → `reserve` → `startProvider` → `settleSuccess` / `settleFailure`; circuit breaker; idempotency) as `LocalAIGovernance` on `node:sqlite`. **One contract-test suite runs against both implementations.** |
| Cost arithmetic | Shared pure function: tokens × price for the request's start time (peak or off-peak by the UTC rule) |
| No fallback | Unchanged: one provider, one attempt, deferral on failure |
| Credentials | A **dedicated DeepSeek API key** for the workstation, kept in Windows Credential Manager, never in the repository or packages, and revocable independently of the Worker's key. If DeepSeek offers per-key spending limits, use them. Otherwise the local ledger is the primary cap, and the account's prepaid balance is the final boundary (ADR 0008). |
| Network | The runner's fetch wrapper allows only `api.deepseek.com`, `huggingface.co` and its CDN redirect hosts (for range reads), `api.github.com` and approved RSS hosts. Everything else is refused. |
| Reporting | Each import package carries `usage.json`: request ids, model, tokens (hit, miss, output), settled cost, policy version. Cloudflare stores it as audit data in the receipt. **It is never an input to admission.** |
| Authority | Cloudflare remains the authority for import validation and evidence admission (L-3). The workstation produces proposals only. |

### 10.6 UTC off-peak scheduling, checkpoints and deferral

**Verified rule** [X-01]: peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday. Therefore, **on weekdays, off-peak is 10:00–01:00 (next day) and 04:00–06:00 UTC.** Not all overnight hours are off-peak: 01:00–04:00 UTC is peak.

| Rule | Specification |
|---|---|
| Model window W1 | **22:00–00:45 UTC** every night: the owner's preferred start, with a 15-minute margin before the 01:00 weekday peak. Weekends are entirely off-peak, but the same window is used for predictability. |
| Request start guard | A request starts only if `now + request timeout (25 s) + 60 s` is before 00:45 UTC |
| Deterministic stages | Acquisition, parsing, change detection and verification preparation run **before** W1 (from about 21:30 UTC), so W1 is spent on model calls. They have no model cost and may run at any time. |
| Checkpoints | A per-item local ledger state machine: `acquired → parsed → model_pending → model_done → verified → packaged`. Each transition is an atomic SQLite transaction. A restart resumes from the last committed state. |
| In-flight crash | DeepSeek has no idempotency key. A request in flight at a crash is **billing-uncertain**: it is settled at its reservation (the ADR 0012 pattern), never resent in the same window, and the item is retried in the next window. |
| Deferral | Items not started by 00:45 UTC are deferred to the next W1, in priority order (rank, then age). After 3 deferrals an item is listed in the morning summary. **Model requests are never run in peak hours automatically.** An optional second window W2 (04:00–05:45 UTC) is enabled only by an owner flag. |
| Clock | The runner refuses to start model calls if the system clock differs from the HTTP `Date` header of `api.deepseek.com` by more than 60 s |
| Holidays | Chinese public holidays are off-peak, so ignoring them is conservative |
| Morning summary | A local HTML report: items acquired, changed, mapped, deferred; spans failed; settled cost; budget remaining; alerts |

---

## 11. Knowledge absorption

### 11.1 Today

Eligibility for Ask requires:
- admission `admitted`;
- reviewer `accepted`;
- freshness `current`;
- a locator-backed chunk;
- for `supported`, at least two independent provenance groups.

Each axis is a publisher action today (B-1). At the brief's volume, that would be hundreds of clicks a day.

### 11.2 The policy engine and the system actor

- **Policy as data:** `trace-admission-policy-v1` is a JSON document in the repository. It lists rules, each with:
  - `rule_id`;
  - claim class;
  - source adapter;
  - evidence class;
  - the required deterministic checks;
  - the outcome (`system_admit`, `batch_review`, `item_review`, `reject`);
  - a batch size limit;
  - a burn-in count.
- **Owner approval:** the owner approves a policy version once, recorded as an audited governance-policy event that hashes the document. Changes create a new version. The Worker refuses to act under an unapproved hash.
- **System actor:** events are written with `actor_role = 'system_policy'`, `actor_email = 'system:admission-policy'`, `policy_version`, `policy_hash`, `rule_id`, `check_results_sha256`, and the request and idempotency ids. The idempotency key is the SHA-256 of `(policy_hash, rule_id, assertion_id, check_results_sha256)`.
- **Schema:** this needs a **0076 successor migration** (number assigned at implementation; the scheduler track holds 0072) that:
  - (a) widens `actor_role` to `('publisher','system_policy')` **only** for `admit`, `mark_current`, `mark_stale` and the new `revoke` action. The new `restore` action stays publisher-only (§11.7);
  - (b) adds the policy columns, `NULL` for publisher events;
  - (c) adds a `CHECK` that a `system_policy` event carries a policy hash and rule id;
  - (d) **never** allows `system_policy` to perform `accept_review` (reviewer acceptance stays human, §11.4).
- **Shadow mode first:** the engine computes and records decisions in a side table without writing governance events. Agreement with the owner's own decisions is measured over at least 200 items per rule before the rule can go live (§17).

### 11.3 Machine-checkable classes (closed list)

These are self-describing primary facts pinned to immutable identifiers, with the value re-read by the Worker:

| Class | Fact | Source | Worker check before admission |
|---|---|---|---|
| **MC-1** | File identity: `(repo, revision, path)` has size S and SHA-256 H | `hf-tree` | Re-read the tree at the same revision; S and H equal |
| **MC-2** | GGUF header field F of the file with SHA-256 H has value V | `gguf-header` | Worker range-reads the header (≤ 16 MiB) and parses it with the same parser version; V equal; the parsed-metadata hash equal |
| **MC-3** | Release identity: tag T of repo R points to commit C, published at P, with asset list A | `gh-release` | Re-read via the API; equal |
| **MC-4** | The card at revision X **declares** licence identifier L | `hf-model` `cardData.license` | Re-read at the revision; equal. The fact is "declares", not a legal interpretation. |
| **MC-5** | The card at revision X **declares** base model B (and relation) | `cardData.base_model` | Re-read; equal. It becomes an `artefact → release` relationship labelled "declared". |
| **MC-6** | `config.json` at revision X has field K = V | `hf-tree` + raw file | Re-read at the revision; equal |

**Not machine-checkable** (always human, batch or item):
- release-note meaning;
- support-matrix tables;
- JavaScript-rendered pages (pricing);
- anything model-mapped;
- anything comparative;
- all community reports;
- all ADR 0004 classes;
- any fact whose two "sources" are files of the **same** repository. That is one provenance group, not corroboration.

**What system admission grants:** the **admission axis only** (`pending → admitted`). The assertion then still needs reviewer acceptance (§11.4) and freshness (§11.5) to become eligible.

### 11.4 Batched reviewer acceptance

- **Batch formation** (deterministic): items with the same `rule_id` (or, for human-admitted items, the same source version and claim class), the same entity scope, **≤ 40 items** (B-11: about 120 written rows per assertion lifecycle, so 40 × 120 = 4,800, within SEED-03's 5,000-write session cap), all checks passing. One failing item leaves the batch and goes to item review.
- **Batch view:**
  - a header with the rule, source, policy version and counts;
  - **k = max(3, ⌈5 %⌉)** items shown in full, chosen by the seeded sampler (§11.8);
  - a diff summary for the rest (field → old → new);
  - a "show all" option.
- **One tap: "Accept batch".** This writes one `accept_review` event **per assertion** with the owner's identity and a shared `batch_id`, so the per-assertion audit is preserved and B-2 uniqueness still holds. "Reject batch" or per-item exclusion is available.
- **Limit:** ≤ 10 batch accepts a day by default. A large backlog is a signal to slow acquisition, not to accept faster.

### 11.5 Automatic freshness for version-pinned facts

A fact about an immutable object, such as a file by SHA-256, a commit, a tag at a recorded commit or a card at a revision, does not go stale. It may only be **superseded** (a newer revision exists) or **withdrawn** (the object disappears or a tag is re-pointed).

| Event | Automatic action (system actor, Evidence Library context, B-3) |
|---|---|
| Assertion admitted and accepted, and its claim class is pinned (MC-1 to MC-6) | `mark_current`, basis `version_pinned`, no expiry |
| Newer revision or release observed | No change to the pinned fact. A separate derived fact ("latest revision of repo R is X, observed at T") is updated; it is unpinned and has a short freshness interval. Recommendations prefer the latest **reviewed** artefact. |
| A tag is re-pointed to a different commit, or a file SHA-256 changes under the same path and revision (should be impossible; it indicates an upstream anomaly) | `mark_stale` plus a **revocation proposal** (§11.7) |
| The repository is deleted or made private or gated | The availability fact changes; the artefact is excluded from recommendations; the pinned facts remain historical, not eligible for "how to run" answers |

**Unpinned facts** (docs pages, pricing, support tables) keep today's human freshness review and intervals (open-model plan §15).

### 11.6 Routing to the Evidence Library (0076)

Deterministic router `trace-route-v1`:

| Condition | Context |
|---|---|
| The fact is cited by an approved story's key facts | `story` (cluster id), as today |
| The fact attaches to a catalogue entity (model, artefact, runtime, hardware) or to an open question gap | **`evidence_library`** |
| Neither, but it is an MC class from a watched source | `evidence_library` (catalogue-ready) |
| Neither, and it comes from news or social | Stays a candidate; it expires with the candidate (§7.8) |

**Lane A output therefore lands mainly in the Evidence Library.** This is exactly the "facts no story carries" gap 0076 was built for.

### 11.7 Precondition: evidence revocation and restoration

**Automatic admission must not be enabled on any environment until revocation and restoration exist and are tested.** Today there are no revoke, restore or amend controls (`docs/audit/trace-v1-production-readiness-07.md`, "No revoke / restore / amend controls"). B-2 also prevents reusing `admit`/`reject` for repeated correction.

**Required capability:**

| Element | Specification |
|---|---|
| Actions | `revoke` (admitted → `revoked`, a new admission state, ineligible) and `restore` (`revoked` → the prior state). Both are append-only events with reason codes: `error`, `rights_withdrawal`, `source_removed`, `upstream_anomaly`, `audit_failure`. |
| Actors | Publisher (any reason). `system_policy` **only** for `source_removed`, `upstream_anomaly` and `audit_failure` cohort actions. **The system may revoke but never restore**; restoration is always human. |
| Cohort revocation | One request revokes every assertion admitted under `(policy_hash, rule_id)` in a time window, or every assertion in a batch. Each assertion still gets its own event (bounded, chunked to ≤ 100 parameters per statement). |
| Recalculation | Reuses the governance recalculation jobs: claim status, story snapshots (story context), catalogue field eligibility, estimator snapshots that cited the fact (marked `inputs_revoked`), and Ask eligibility. |
| Visibility | Public story pages that cited a revoked fact get the existing correction or update workflow, which is human. Catalogue fields fall back to "unknown". |
| Tests | Revoke → ineligible everywhere within one recalculation; restore → eligible again; repeated cycles; cohort of 500; idempotency; system cannot restore; D1-faithful adapter (100-parameter limit, trigger-counted changes). |

### 11.8 Sampling audit

| Rule | Value (owner decision KP-12) |
|---|---|
| Burn-in | The first **3 batches** (or 150 items) under a new rule or policy version: **100 % item review**. System admission writes nothing during burn-in; it runs in shadow. |
| Steady state | Random sample of **max(5, 10 %)** of each system-admitted batch, with a weekly minimum of **20 items** across rules, stratified by adapter |
| Sampler | Seeded by a Worker CSPRNG value recorded in the audit event. Reproducible for audit, not predictable by the preparer. |
| Audit action | The owner sees the item, its primary link and the Worker's re-read value, then marks "correct", "incorrect" or "unclear" (30 s per item) |
| Failure response | **Any** "incorrect" in MC-1 to MC-6 means a parser or adapter defect. The rule is **automatically suspended**, a cohort revocation is **proposed** (the owner confirms) and the rule returns to burn-in after a fix. "Unclear" ×3 in a week ⇒ rule review. |
| Report | A weekly one-screen summary: items admitted per rule, sampled, errors, suspensions, revocations |

### 11.9 What never system-admits

- Interpretive evidence (local-acquisition §10).
- Anything extracted by a model.
- Community reports.
- Vendor comparative claims.
- ADR 0004 classes.
- Estimates (stored as `trace_deterministic_estimate`, never as facts).
- Any fact from a news article (it is a trigger; the primary is fetched instead).

### 11.10 Conclusion-policy interaction (P-1 unchanged)

- System admission and pinned freshness make Lane A facts **eligible**. They do not change how many groups `supported` needs.
- For the hardware Ask, catalogue records are consumed by the deterministic recommender with their **evidence class shown** (ADR 0019). That path does not go through KC-09G's `supported` threshold.
- For prose Ask questions about single-primary facts (G02, G12, G13, G14, G17), the outcome remains `insufficient_evidence` **unless** the owner separately adopts P-1 `primary_attributed`. This design neither adopts nor depends on P-1, but it would make P-1 cheap to use if adopted.

---

## 12. The owner's day (target 20–30 minutes)

| Activity | Volume | Unit time | Minutes |
|---|---|---|---|
| Story inbox: approve, edit, skip or hold drafted cards | 40 cards (about 30 approved, about 10 skipped) | ~20 s (approve) to ~60 s (light edit, ~1 in 5) | **~14–17** |
| Undrafted low-rank items: bulk skip or "draft this" | ~10 | ~3 s | ~1 |
| Social cards (approve, internal, reject; accept linked candidates) | 20 | ~15 s | **~5** |
| Knowledge batches (accept or reject batch; review the k shown items) | 3–5 batches | ~60 s | **~3–5** |
| Sampling audit items | ~5 | ~30 s | ~2.5 |
| Exceptions (failed drafts, validator blocks, revocation proposals) | 0–3 | ~60 s | ~0–3 |
| **Total** | | | **≈ 25–33** |

**Weekly (about 30 minutes):** the audit summary, rule suspensions, policy changes, watch-list additions and the Reddit removal re-checks under R-2.

**Levers if the day runs long:**
1. lower K (drafts per day);
2. raise the archive threshold;
3. mute topics;
4. reduce batch count.

**Never lower:** sample rates or blocking validators.

---

## 13. Deterministic-share accounting (per day, at target volume)

| Operation | Count/day | D | M | H |
|---|---|---|---|---|
| Lane A conditional checks and fetches | ~2,000 | 2,000 | | |
| Lane A parses (HF, GGUF, GitHub, cards) | ~150 | 150 | | |
| Release-bullet classification | ~200 bullets | ~170 | ≤ 30 | |
| Worker re-verifications | ~100 | 100 | | |
| Story candidates canonicalised, deduped, clustered, ranked | ~80 | 80 × 4 = 320 | | |
| Fact sheets and validators | 40 | 40 × 2 = 80 | | |
| Story drafts | 40 | | 40 | |
| Story decisions | 50 | | | 50 |
| Social canonicalisation and extraction | 20 | 40 | ≤ 20 | |
| Social decisions | 20 | | | 20 |
| Absorption: routing, batch formation, system admission, pinned freshness | ~300 | ~900 | | |
| Batch accepts and audits | ~10 | | | ~10 |
| **Totals** | | **≈ 3,760** | **≤ 90** (≤ 70 under Revision 2, while social mapping is disabled) | **≈ 80** |

**Shares:**
- deterministic ≈ **96 %** of operations;
- model calls ≈ 2.3 %;
- human decisions ≈ 2 %, all one-tap or batch.

**Field-level target:** ≥ 75 % of extracted fields come from T0 extractors. This is measured from the ledger, because social prose and release-note semantics are the model-heavy fields.

---

## 14. Cost and D1 budgets

### 14.1 Model cost and spending limits (Revision 2)

**Prices:** DeepSeek list prices, verified 2026-10-25 [X-01]. All nightly work is scheduled off-peak (§10.6), so expected costs use the **off-peak** price. **Reservations always use the peak price** (fail-safe).

**Token distributions:**

| Task | Basis | Distribution used |
|---|---|---|
| `map_release_change` | **Measured** on 2026-10-25 from the 30 latest releases of 5 watched runtimes [X-18]. Tokens are estimated at 0.3 per character [X-14]. llama.cpp bodies are stripped of their download-link template first. | See the table below. Fallback rate: llama.cpp 30 % (conventional prefixes such as `opencl: add …` are expected to match the grammar; to be measured on the 1,013-item corpus); prose-heavy runtimes 100 %. Prompt 800 tokens; output ≈ 25 % of input, minimum 150, maximum 2,000. |
| `draft_story` | **Assumption** (no TRACE draft distribution has been measured yet) | Variable input lognormal: median 4,000, p90 8,000, cap 11,000; plus a 1,000-token system prompt (cache hit after the first call). Output: median 600, p90 1,000, cap 1,500. **Replaced by measured distributions after stage P1's first week.** |
| `reconcile_entity` | Assumption | 10 calls a day × (800 in, 100 out) |
| `map_social_report` | Assumption; **disabled until KP-24** | If enabled: 10 fallbacks a day × (1,200 in, 250 out) |

Measured release sizes (body tokens):

| Runtime | Releases per day (observed) | Median | p90 | Mean |
|---|---|---|---|---|
| llama.cpp (template stripped) | 10.0 | 126 | 256 | 132 |
| LiteLLM | 2.14 | 526 | 5,745 | 3,090 |
| Ollama | 0.41 | 194 | 435 | 243 |
| Transformers | 0.16 | 909 | 8,575 | 2,845 |
| vLLM | 0.10 | 4,684 | 10,606 | 4,780 |

Release extraction therefore costs about **5.8 calls, 12.7k input tokens and 2.4k output tokens a day ≈ US$0.0033 a day off-peak**.

**Scenarios** (400 simulated days each; off-peak; US$):

| Story drafts per day | Drafts per day: mean (p95) | Drafts per week | **All tasks per week** (drafts + release + reconciliation) | Worst case per week: every request at its token cap **and** peak price (drafts + release) |
|---|---|---|---|---|
| 10 | 0.0107 (0.0128) | 0.075 | **0.111** | 0.38 + 0.59 = 0.97 |
| 25 | 0.0268 (0.0298) | 0.188 | **0.224** | 0.95 + 0.59 = 1.54 |
| 40 | 0.0429 (0.0470) | 0.300 | **0.336** | 1.51 + 0.59 = 2.10 |
| 50 | 0.0537 (0.0588) | 0.376 | **0.412** | 1.89 + 0.59 = 2.48 |

- Social extraction, if enabled after KP-24, would add about US$0.023 a week.
- At 50 drafts a day the realistic spend is about **US$0.41 a week (≈ £0.30)**. Even the theoretical worst case stays below the cap.
- **The cap exists to stop runaways:** loops, accidental thinking mode, price changes. It is not a forecast.

**Currency.** DeepSeek bills in USD from a prepaid balance. The owner's limit is **£5 a week**. The design's weekly figure is **US$6.25**:
- that is £5 at 1.25 USD/GBP;
- September 2026 quotes were about 1.35 [X-19], at which US$6.25 ≈ £4.63.

#### 14.1.1 What is enforced, and by whom (Revision 3)

**There is no software-enforced global ceiling across the Worker and the workstation.** They keep **separate ledgers** (D1 for the Worker, SQLite for the workstation) and neither can see the other's spend. The US$6.25 a week is therefore:
- **(a)** the **sum of two separately enforced allocations**, which holds by construction as long as neither allocation is raised without an owner decision; plus
- **(b)** whatever **account-level ceiling** the owner chooses for the DeepSeek prepaid balance (KP-25).

Only (b) is a true global hard stop, because DeepSeek refuses calls when the balance is exhausted.

| Layer | Ledger and period | What it enforces | Status |
|---|---|---|---|
| **Worker allocation** | D1 `ai_budget_reservations`; **UTC calendar day** and **UTC calendar month** keys | Per request US$0.02; all tasks US$1/day (`TRACE_AI_DAILY_PUBLIC_BUDGET_USD` default); US$10/month (`TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD` default); editorial task US$0.50/day (`TRACE_AI_EDITORIAL_DAILY_BUDGET_USD`). Reserved at the **configured** prices (Flash 1/5), which overstate today's list prices. Public Ask is disabled on Production, so its allocation is 0 until V1.2. **Weekly editorial ceiling = 7 × 0.50 = US$3.50.** | **Existing, implemented.** Unchanged by this design (no Production billing change). |
| **Workstation allocation** | Local SQLite `LocalAIGovernance`; **UTC ISO week** (Monday 00:00 UTC to Sunday 24:00 UTC) and **UTC day** | US$2.75/week; US$0.40/day; per-task daily caps (§14.1, limits table); per request ≤ US$0.02 | **Proposed** (P0 implements a subset, §17.2) |
| **P0 prototype cap** | Same local ledger, separate counter | **US$0.25 lifetime cap for P0** (from the first model call until the owner raises it) and US$0.05/day. It is checked **before** the weekly allocation and does not depend on the Worker or on balance reconciliation. A run with the cap exhausted continues in **deterministic-only mode**. | **Proposed** for P0 (KP-21) |
| **Account ceiling** | DeepSeek prepaid balance (shared by every key on the account) | A hard global stop at zero balance. Making it a weekly stop requires a top-up policy, for example topping up at most US$6.25 a week. | **Owner decision KP-25** |
| **Combined weekly check** | Owner-assisted: a weekly report compares Worker ledger total + workstation ledger total with the DeepSeek balance change | Detection, not prevention | **Proposed** |

**Ledger rules for the workstation** (stricter than the Worker where noted):

| Situation | Rule |
|---|---|
| **Outstanding reservations** | A reservation counts against its day, its week and the P0 cap from the moment it is made until it is settled. A new request is refused if `settled + outstanding + new reservation > cap` at any layer. |
| **Uncertain billing** (timeout, connection loss after send, crash in flight, unparseable response) | Settled at the **full reservation** and flagged `billing_uncertain`. **Never released automatically.** The Worker instead releases unsettled reservations when they expire after 2 minutes (`state = 'expired'`). The workstation deliberately does not, because a crash there can leave a call in flight. Downward correction happens only by owner annotation after balance reconciliation. |
| **Failed requests** | Non-2xx responses before generation (400 validation, 401, 402 insufficient balance, 429): settled at **0**, counted toward the task circuit breaker. 5xx and timeouts are billing-uncertain (above). 402 also stops all model tasks until the owner checks the balance. |
| **Successful requests** | Settled from the response `usage` (cache-hit, cache-miss and output tokens) × the pinned price for the request's start time |
| **Accounting periods** | All periods are UTC. A request belongs to the period in which its reservation was made. Week rollover never releases outstanding reservations. |
| **Balance reconciliation** | Preflight and postflight `GET /user/balance` around each window. **Shared account:** the Worker may also spend during the window, so the check flags `delta − local_settled > Worker editorial allowance for the window (≤ US$0.50) + max(US$0.05, 20 %)`. This is weaker. **Separate account** (if DeepSeek's terms permit it): the check flags `delta − local_settled > max(US$0.05, 20 %)`. This is exact. A flag stops all model tasks (fail-closed) until the owner reviews it. |
| **Pricing-change guard** | As in the limits table: `GET /models` must list `deepseek-flash`; a price table older than 30 days pauses model tasks; thinking output opens the circuit |

The allocation-limits table below lists the allocations. Its "Combined weekly cap" row means **combined by allocation** (US$3.50 + US$2.75) **plus the optional account ceiling**. It is not a single software-enforced counter.

**Allocation limits** (each hard and fail-closed within its own ledger; the owner's conservative editorial budget is unchanged):

| Limit | Value | Enforcement |
|---|---|---|
| **Combined weekly cap** (by allocation, not a single counter) | **US$6.25** = Worker editorial allocation (unchanged US$0.50/day × 7 = US$3.50, reserved at its conservative configured prices) + **workstation allocation US$2.75** | Each ledger enforces its own allocation. The sum holds while neither allocation is raised. A true global stop exists only through the DeepSeek prepaid balance (KP-25). Public Ask (disabled until V1.2) must be added to this sum before it is enabled. |
| Workstation weekly | US$2.75 | `LocalAIGovernance` reservation refused when `settled + reserved + new reservation > cap` |
| Workstation daily | US$0.40 | Same |
| Task daily | `draft_story` US$0.30; `map_release_change` US$0.05; `reconcile_entity` US$0.02; `map_social_report` US$0 (disabled) | Same, per task |
| Per request | Reservation = cap tokens × **peak** price: draft 12k / 1.5k → US$0.0054; release 12k / 2k → US$0.0060. Both are within the existing US$0.02 per-request cap. | Reserve before the call; settle from `usage` after |
| Settlement | Actual `usage` (cache-hit, cache-miss and output tokens where returned) × the pinned price for the request's start time. The difference from the reservation is released. | Ledger |
| Thinking guard | Any response containing `reasoning_content` or non-zero reasoning tokens: settle it, **open the circuit for that task**, alert | Non-thinking is required on every request |
| Pricing-change guard | The pinned price table carries `verified_at`. Preflight before W1: `GET /models` must list `deepseek-flash`, and `GET /user/balance` must show `is_available`. After W1: if the drop in balance minus the settled ledger cost exceeds max(US$0.05, 20 %), **stop all model tasks (fail closed)** and alert "pricing or usage mismatch". A price table older than 30 days pauses model tasks until the owner re-verifies; the pricing page is client-rendered, so this is a human check. | Runner preflight and postflight |
| Alerts | 50 % and 80 % of the weekly cap; any circuit opening; any failed preflight or postflight | Morning summary |

**Measure before increasing volume.** Stage P1 runs at **10 drafts a day for one week**. Measured token distributions, validator pass rates and cost replace the assumptions above. Volume rises to 25, then 40 or 50, **only by owner decision** after each weekly report.

### 14.2 D1 budgets (to be measured on Preview before Production ceilings; local-acquisition §11 targets apply)

| Path | Writes/day (estimate) | Reads/day (target) | Notes |
|---|---|---|---|
| Story candidates, clusters, drafts, inbox events | ~1,500 | ≤ 50k | Inbox lists use keyset pagination, ≤ 50 per page; no unbounded `NOT IN` scans (the `model-data.ts` anti-pattern, open-model plan §1) |
| Lane A import (≤ 4 batches, ≤ 25 evidence + ≤ 200 catalogue items each) | ≤ 5k per batch target | ≤ 20k per batch target | Local-acquisition §11 |
| Governance (full lifecycle: admit, accept, freshness, with events, jobs, audit, nonces, score explanations) | **≤ 200 assertions/day × ~120 rows ≈ 24,000** (B-11) | ≤ 30k | ≤ 40 assertions (≤ 5,000 writes) per batch or session; chunked ≤ 100 parameters; trigger-aware `meta.changes` (D1 counts trigger rows) |
| Social | ~200 | ≤ 5k | n/a |
| **Total** | **≈ 30k–45k/day** (≈ 0.9–1.4M a month) | **≤ 0.2M/day** | **Included on Workers Paid: 50M rows written and 25 billion rows read a month** [X-12]. The binding constraint is **per-batch safety, not price**. |

**Context.** KNOWLEDGE-10 observed about 1.5M rows read in a 24-hour window that included migrations (final report §B). A quiet baseline must be re-measured before enabling any automated path (roadmap item "Quiet D1 baseline").

**Stop conditions** (from local-acquisition §11, extended):
- any per-batch D1 budget exceeded;
- more than 20 % of items held;
- 2 consecutive batch rejections;
- inbox preparation exceeding 2× its read target.

Each automatically suspends the relevant path.

### 14.3 Other costs

- **R2:** parsed metadata JSON (~10–100 KB per file) plus permitted bodies, within KC-11C bounds.
- **HF and GitHub:** free tiers within the documented limits ([X-05], [X-06]).
- **Electricity:** local-acquisition §16 estimate.

---

## 15. Privacy and security

| Topic | Rule |
|---|---|
| Material sent to models | **Public primary-source material first** (release notes, model cards, public docs, published articles). Owner-supplied social excerpts only after KP-24. **Never:** reviewer notes, submitter identity, Access identities, private Desk notes, receipts, personal information or secrets. DeepSeek stores data in the PRC, retains it while the account exists, and may train on inputs unless the owner has opted out [X-15][X-16]. |
| Social authors | Hashed handle by default; display handle only by owner choice; no profiles; no sensitive inference [X-02]; removal honoured (§8.9) |
| Hardware profiles (Ask) | Not retained; never sent to a provider (open-model plan §3) |
| Prompt injection | Sources are untrusted data. Model output is accepted only through schema validation and verbatim span re-find. Adversarial fixtures (local-acquisition §14; evaluation N07) run on every extractor and drafter. |
| Untrusted binaries | The GGUF parser is bounded (§5.3). Weights are never downloaded. Chat templates are never executed or rendered. |
| SSRF | Lane A fetches only allow-listed API hosts. S-2 is a manual-redirect, header-only request. Candidate capture uses the existing `eligibleRemoteUrl` and KC-11C rules. |
| Machine identity | The importer role (local-acquisition §9) cannot call publish, reviewer or batch-accept routes. `system_policy` exists only inside the Worker and has no external credential. |
| Kill switches | `TRACE_IMPORT_ENABLED`; `TRACE_SYSTEM_ADMISSION_ENABLED` (new, default false); per-rule suspension; editorial AI kill switch (existing); inbox preparation switch |

---

## 16. Preconditions and gates

| Gate | Requirement | Blocks |
|---|---|---|
| **STOP-BURN** | Production and Preview Cron stay `[]`. Scheduler 0072 track (overlap prevention, stale-running cleanup of 2,667 `ingestion_jobs` and 951 `cron_runs`, source 93 / M2, two clean opportunities) **unchanged** | Automated news-feed discovery on Cloudflare. **Does not block** Lanes A and C, or the inbox with owner or workstation triggers (I-7). |
| **Public Ask off until V1.2** | `TRACE_AI_PUBLIC_ENABLED=false` (commit `d89850b`) | Public use of catalogue and estimator answers. Admin `/admin/ask` evaluation is allowed. |
| **0076 on Production** | Reported applied on 2026-10-25 (production-readiness session); no record on `main`. Confirm it with the release record or a read-only schema check before P2. | Evidence Library routing on Production |
| **G-1** | Allow-list `deepseek-flash`; prices 0.30 / 1.20 | Worker-side on-demand drafting at volume only. Workstation drafts use their own ledger (§10.5), so P1–P3 do not need G-1. |
| **Revocation and restoration** (§11.7) | Implemented, tested, on the target environment | **Any** system admission or system freshness |
| **System-actor migration** (§11.2) | Approved migration | System admission |
| **Policy v1 approved** | Owner hash approval | System admission |
| **Importer role and L-1 to L-4** | Local-acquisition phase E approval | Lane A submissions to Cloudflare |
| **Reddit approval** | Responsible Builder Policy access granted, scope stated truthfully | R-2 only. R-1 needs nothing. |
| **D1 alerts and quiet baseline** | Roadmap items | Any timer-driven path on Production |
| **Evaluation** | Hardware scenarios H01–H16 at their expected outcomes; validator suites | Public hardware Ask (V1.2) |
| **Importer isolation tests** (§16.1) | All six tests green | Any importer deployment (P2) |
| **DeepSeek data terms** (KP-24) | Opt-out confirmed; PRC processing accepted | Sending social excerpts to DeepSeek |
| **Spending guards** (§14.1) | Ledger, caps, thinking guard, pricing-change guard implemented and tested | Any unattended nightly model run |

### 16.1 Reconciliation with the frozen ingestion Worker and scheduler 0072

#### State (verified 2026-10-25)

- `wrangler.worker.toml` on `main` (`5cb64af`) declares `crons = []`, both at the top level and in the environment section.
- The production-readiness session confirmed that the Production and Preview Workers have Cron `[]`.
- STOP-BURN is active. **Scheduler 0072 is unmerged and inactive.**

The old daily pipeline stays **paused**. It is the `scheduled()` handler's `"0 9 * * *"` case in `workers/ingestion/index.ts` (around line 211), which runs classification → cross-source matching → clustering → evidence upgrade → claim extraction → conflict detection → expiry → reconciliation → model data. The tier fetches `*/30`, `0 6` and `0 12` are paused with it. **Nothing in this design re-enables Cron, merges 0072 or calls these pipelines.**

#### Which ingestion functions can be reused locally (`main` at `5cb64af`)

| Module | Function | Pure? | Touches | Local reuse |
|---|---|---|---|---|
| `dedup.ts` | `hashURL` | Yes (Web Crypto; `globalThis.crypto` exists in Node 22) | Nothing | **Reuse.** `normalizeURL` is module-private; export it (a one-line refactor with a behaviour test). |
| `dedup.ts` | `deduplicateURL`, `deduplicateTitle` | No | D1 `feed_items` | Not reused; a local SQLite equivalent |
| `classify.ts` | `classifyFeedItem` (`lexical-topic-v1`) | Yes | Nothing | **Reuse** for topic and entity tags |
| `classify.ts` | `runClassification` | No | D1 | Not reused |
| `cross-source-match.ts` | `tokenize`, `jaccardSimilarity`, `contentOverlapScore`, `normalizeTitleForComparison` (`lexical-jaccard-v2`) | Yes, but module-private | Nothing | **Export and reuse** |
| `cross-source-match.ts` | `findCrossSourceMatches`, `runCrossSourceMatching` | No | D1 reads and writes | Not reused |
| `cluster.ts` | `tokenizeTitle`, `titleKeywordOverlap`, `generateClusterTitle` | Yes, but module-private | Nothing | **Export and reuse** |
| `cluster.ts` | The grouping loop (topic, entity overlap, title overlap ≥ 0.35 or 0.3) | Pure logic **embedded inside** `runClustering`, which reads three days of `feed_items` and writes clusters | D1 | **Extract a pure `groupItems(items)`** with an identical-behaviour test against recorded inputs, then reuse it. `runClustering` stays as is. |
| `cluster.ts` | `initialEvidenceStatus`, `needsHumanReview` | Yes, but private | Nothing | **Not reused for evidence.** They derive evidence labels from source tiers, which conflicts with the governance in §11. At most they are UI hints. |
| `extract-claims.ts` | `extractClaimsFromItem` (`rule-extraction-v1`) | Pure function, but its module imports D1-writing modules (`canonical-claim-write`, `claim-relationship-proposals`) | Nothing directly | **Not reused for evidence.** Its catch-all regexes produced the low-quality rule-based claims KNOWLEDGE-10 found. If used as a hint generator at all, the pure function moves to a D1-free module first. |
| `extract-claims.ts` | `runClaimExtraction`, `detectClaimConflicts` | No | D1 | Not reused |

**None of these modules calls a model or the `AI` binding.** The only `env.AI` use in the Worker is the Preview-only KC-09 embedding path (`knowledge-embedding-index.ts`, `kc-11g-h.ts`). The legacy cost hazard is **D1 reads and writes**, not model calls.

#### The nightly process must not be able to reach the legacy paths

**Today:**
- One shared secret, `TRACE_INTERNAL_SERVICE_SECRET`, signs every internal admin request (`authenticateInternalRequest`). The only roles are `reader` and `publisher`.
- `routeAllowed` lets a publisher POST to any path in `WRITE_ADMIN_ROUTES`. That includes `/admin/ingest`, `/admin/classify`, `/admin/dedup`, `/admin/cluster`, `/admin/extract-claims`, `/admin/detect-conflicts`, `/admin/seed-models` and `/admin/extract-model-data` (dispatcher around lines 1086–1114).

**Any holder of that secret can therefore trigger the expensive legacy pipeline.**

| Rule | Specification |
|---|---|
| R-L1 | **The workstation never holds** `TRACE_INTERNAL_SERVICE_SECRET`, Access user sessions, a publisher identity, D1 or R2 credentials, or Cloudflare API tokens (L-4) |
| R-L2 | A new role **`importer`** with its **own secret** (`TRACE_IMPORTER_SECRET`, ≥ 32 bytes, generated independently) and a Cloudflare Access service token. It is verified by a separate `authenticateImporterRequest`. The internal-service secret never validates an importer request, and the importer secret never validates a reader or publisher request. |
| R-L3 | **`IMPORTER_ROUTES` allow-list (exact paths):**<br>• `POST /admin/knowledge/import/batches` (manifest ≤ 64 KiB)<br>• `POST /admin/knowledge/import/batches/{batchId}/items` (staged upload, size-limited)<br>• `GET /admin/knowledge/import/batches/{batchId}/receipts`<br>**Nothing else.** `importerRouteAllowed(path, method)` is a separate function. `routeAllowed` never accepts role `importer`. |
| R-L4 | Import handlers write only staging rows, receipts, and KC-11A inventory and draft-plan rows that need **operator approval**. Their module must not import `ingest`, `classify`, `cluster`, `dedup`, `cross-source-match`, `extract-claims`, `model-data` or the pipeline runners. This is enforced by a static import-graph test. |
| R-L5 | `TRACE_IMPORT_ENABLED=false` by default. The Access service-token policy is scoped to the import path prefix where the Access layout allows it (an open question in the local-acquisition design §16). |
| R-L6 | Draft proposals arriving by import are untrusted. The Worker re-runs validators V1–V3 against **its own** captured source versions before Approve is enabled in the inbox. |

**Tests (required before any importer deployment):**

1. For **every** path in `READ_ADMIN_ROUTES ∪ WRITE_ADMIN_ROUTES ∪ BACKFILL_READ_ADMIN_ROUTES` and every method, an importer-signed request is refused (401 or 403), with **zero D1 writes** and **zero calls** to pipeline functions (spies on `ingestTier`, `runClassificationPipeline`, `runClusteringPipeline`, `runClaimExtractionPipeline`, `runModelDataPipeline`, …).
2. An importer-path request signed with `TRACE_INTERNAL_SERVICE_SECRET` → 401. A reader or publisher request signed with `TRACE_IMPORTER_SECRET` → 401.
3. `IMPORTER_ROUTES` equals a frozen snapshot. Adding a route fails the test until the snapshot is updated in review.
4. The import-graph test (R-L4).
5. The Cron config test stays: `crons = []` (exists since commit `4979823`).
6. Replay, oversize and unknown-schema rejection, as in local-acquisition §14.

#### Replacement workflow (prioritised)

```text
approved source acquisition (workstation; watch list + approved feeds)
  → deduplication (hashURL + local SQLite)
  → deterministic clustering (extracted groupItems + lexical-jaccard helpers + origin-link rule, §7.3)
  → DeepSeek draft preparation (W1 off-peak window; budgets §14.1)
  → local validation (V1–V6, span re-find, schema)
  → bounded Cloudflare import (importer role only; ≤ 25 evidence + ≤ 200 catalogue + ≤ 40 draft proposals per batch; ≤ 4 batches per day)
  → human editorial approval (inbox → existing publish route, publisher identity)
```

**Activation order:**
1. Build and test locally first.
2. Measure Preview D1 rows read and written per import batch.
3. Only then, a separate approval for Production activation.

Workstation timers replace Cloudflare Cron for this workflow. STOP-BURN, `ingestion_jobs` and scheduler 0072 are untouched.

---

## 17. Staged implementation plan (Revision 2)

**Every stage needs its own approval. No stage changes Production unless it says so. Cloudflare Cron stays `[]` throughout.**

| Stage | Content | Environment | Exit criteria | Earlier phase |
|---|---|---|---|---|
| **P0** | **Smallest safe prototype** (§17.1) | Local only: no D1, no remote mutation, no Cron, no GPU | §17.1 exit criteria | Local-acquisition A–B; K2 |
| **P0b** (parallel) | Estimator library `trace-fit-v1` and `trace-decode-bound-v1` with header fixtures | Local | Tests green | K1 |
| **P0c** (optional, parallel) | Qwen3.5-9B CPU benchmark (§10.4) | Owner's machine | One `trace_tested` record; decision on the verifier role | n/a |
| **P1** | **Local nightly pilot.** Approved news feeds polled locally (from an owner-supplied export of the approved source registry; no remote reads by the runner); deduplication and clustering with the reused pure functions (§16.1); `draft_story` at **10 a day**, then 25 by owner decision; validators; a local HTML review of drafts (**not published**) | Local; DeepSeek only | One week at 10 a day: measured token distributions, cost against §14.1, deferrals, validator pass rate, owner usefulness rating | New |
| **P2** | **Importer on Preview:** role, secret, `IMPORTER_ROUTES`, staging tables, receipts, all §16.1 tests | Preview (code + migration approval) | Tests green. Two labelled batches imported, with D1 rows read and written measured per batch. | Local-acquisition E; K7 (part) |
| **P3** | **Story inbox on Preview** over imported draft proposals (ADR 0023), with Worker-side re-validation (R-L6); G-1 as a separate configuration change if wanted | Preview | One week of inbox use; owner time measured (§12) | K4 |
| **P4** | Revocation and restoration; system-actor migration (§11.7, §11.2) | Local → Preview | §11.7 tests green on Preview | K3 |
| **P5** | Catalogue OM-1 and OM-2, populated from P0's Lane A packages | Preview | Pilot catalogue reviewed | K7 |
| **P6** | Social R-1 with deterministic extraction only (no DeepSeek until KP-24) | Preview | 20 posts; spans 100 % re-find | K5 |
| **P7** | Policy engine in shadow, then live on Preview | Preview | §11.8 burn-in and agreement | K8–K9 |
| **P8** | **Production:** importer activation, then the inbox, then system admission, each per rule | **Production, explicit approval each** | Same metrics as Preview | K10 |
| **P9** | Hardware Ask (`/admin/ask`), then public (V1.2 gate) | Preview → Production | H01–H16 at their expected outcomes | K11 |

**V1.1** covers P0–P3. **V1.2** covers P4–P9. Automated discovery on Cloudflare (scheduler 0072) remains a separate, gated track and is **not** needed for P1–P3, because the workstation polls the approved feeds.

### 17.1 The smallest safe first prototype (P0)

**Goal:** prove the chain *approved sources → deterministic change detection → bounded DeepSeek extraction → local verification → numbered import package* with no Cloudflare involvement.

| Element | Specification |
|---|---|
| Location | `local/acquisition/` in this repository (proposed), so it imports `src/ai/*` contracts and `workers/ingestion` pure helpers directly. Node 22, TypeScript, `node:sqlite`. |
| Sources (owner-approved list in `local/acquisition/sources.json`) | GitHub releases: `ggml-org/llama.cpp`, `vllm-project/vllm`, `ollama/ollama`, `BerriAI/litellm`, `huggingface/transformers`. Hugging Face: `unsloth/Qwen3.5-9B-GGUF` and `Qwen/Qwen3.5-9B` (model and tree API, GGUF header range reads ≤ 16 MiB per file). |
| Stage 1: acquire | Conditional GET with ETag and revision cursors in SQLite. GitHub optional read-only token; HF anonymous. Budgets per §5.7 and [X-05]–[X-07]. |
| Stage 2: change detection | `normalized_content_v3`-style hashing (the vendored identity module); change classes from local-acquisition §6; `no_material_change` produces nothing |
| Stage 3: deterministic parse | Release template stripping; bullet grammar; HF tree (sizes, SHA-256); bounded GGUF header parser (§5.3) |
| Stage 4: bounded DeepSeek | `map_release_change` **only** for bullets or releases the grammar could not map; `deepseek-flash`, non-thinking, one attempt; W1 window. **P0 cap: US$0.25 lifetime and US$0.05 a day**, enforced by the local ledger independently of every other limit (§14.1.1). The stored response is the record (§5.6 layer 2). |
| Stage 5: local verification | Schema; enum; **verbatim span re-find with offsets**; entity alias match; any failure → `reviewer_required` or the value is dropped |
| Stage 6: package | `out/TRACE-KNOW-YYYYMMDD-NNNN/` containing `manifest.json` (`trace-know-batch-v1`), `items.jsonl`, `usage.json` and a checksum; sequential numbering from the local ledger. **Written to disk only; never uploaded.** |
| Out of scope | D1, any Cloudflare call, import, story drafts, social, Cron, GPU, Qwen |
| Run | Manual command first; later a Windows Task Scheduler entry (deterministic stages from 21:30 UTC, model window 22:00–00:45 UTC) |
| Tests | Offline fixture mode (no network); the §5.6 reproducibility tests (a)–(e); adversarial spans (a paraphrase must fail re-find); bounded-parser fuzz cases; budget fail-closed (reservation refused at each cap, including the P0 cap); window enforcement with an injected clock; thinking-guard; network allow-list refusal |
| Exit criteria | (1) Two runs over the same pinned inputs produce **byte-identical deterministic extraction output**, and packages that differ only in envelope and receipt fields (§5.6 layer 3). (2) A second run against unchanged live sources emits **zero actionable items**. (3) At least one real release per watched runtime is processed, with 100 % span re-find on every model-mapped value. (4) Measured grammar coverage is reported. (5) Total spend ≤ US$0.25 (P0 cap). (6) No model request outside W1. (7) The owner reviews one package and the morning summary. |

---

## 18. Owner decisions

**Already decided by the owner (Revision 2, 25 October 2026, relayed by the production-readiness session):**

| ID | Decision |
|---|---|
| D-R2-1 | Deterministic-first stays (ADR 0021) |
| D-R2-2 | **DeepSeek Flash is the primary language engine** for the initial local acquisition system, in non-thinking mode. Model-assisted extraction and reconciliation are used only where deterministic methods are demonstrably inadequate, with exact span validation. |
| D-R2-3 | Nightly off-peak runs, preferring a 22:00 UTC start and finishing before 01:00 UTC |
| D-R2-4 | Keep the conservative editorial budget. Combined weekly maximum of about **£5** for the initial experiment. |
| D-R2-5 | Trust rules unchanged: DeepSeek never admits, freshens, decides independence, approves evidence or publishes |
| D-R2-6 | Qwen3.5-9B is optional only. The hardware is 32 GB DDR3-1600, CPU only, no GPU. Benchmark it rather than estimate. |
| D-R2-7 | Public primary-source material is the first pilot dataset. Confirm DeepSeek data terms before sending social excerpts. |

**Open decisions:**

| ID | Decision | Recommendation |
|---|---|---|
| **KP-1** | Adopt the three-lane, one-absorption architecture and the invariants I-1 to I-8 | Adopt |
| **KP-2** | Lane A watch list: start with the open-model plan §12 pilot; additions by owner approval only | Adopt |
| **KP-3** | Catalogue citation rule (I-4): uncited ⇒ "unknown"; file headers over repository summaries | Adopt |
| **KP-4** | Estimator outputs: the ceiling shown only as "cannot exceed about X"; no prefill estimate; `will_load` cap when overhead is unknown | Adopt |
| **KP-5** | Inbox drafts prepared on the workstation in W1: **10 a day** in P1, then 25, 40 or 50 by weekly decision; validators V1–V6, re-run by the Worker on import | Adopt |
| **KP-6** | Hold and archive timers: 72 h → held; 7 days → archived | Adopt, revisit after P3 |
| **KP-7** | ADR 0009 Amendment 2 | Adopt |
| **KP-8** | Request Reddit Data API access (R-2), describing TRACE's commercial plans truthfully | Request. R-1 is the default regardless. |
| **KP-9** | Share-link resolution: S-1 (phone) preferred | S-1 |
| **KP-10** | *Superseded by KP-24* | n/a |
| **KP-11** | System admission: the admission axis only, MC-1 to MC-6 only; reviewer acceptance always human (batched) | Adopt |
| **KP-12** | Sampling: burn-in 3 batches or 150 items at 100 %; steady state max(5, 10 %), weekly ≥ 20; automatic suspension on any MC error | Adopt |
| **KP-13** | Revocation and restoration as a hard precondition; the system may revoke, never restore | Adopt |
| **KP-14** | Spending limits (§14.1): combined **US$6.25/week** (≈ £5 at 1.25 USD/GBP) = Worker editorial US$0.50/day (unchanged) + workstation US$2.75/week; workstation US$0.40/day; task caps; peak-price reservations; thinking and pricing-change guards | Adopt |
| **KP-15** | T2 free or flat tiers (OpenCode Go) excluded | Adopt |
| **KP-16** | Source 84 (HF Trending, never succeeded): deactivate or supersede; `github_api` release sources kept as a discovery index only | Deactivate or supersede (registry change, separate approval) |
| **KP-17** | Workstation runner option (A): direct DeepSeek calls through the shared ADR 0008 contracts and a `LocalAIGovernance` ledger (§10.5) | Adopt |
| **KP-18** | A **dedicated DeepSeek API key** for the workstation, kept in Windows Credential Manager; per-key limits if DeepSeek offers them | Adopt |
| **KP-19** | Model window W1 22:00–00:45 UTC; deferral rules; W2 (04:00–05:45 UTC) only by flag (§10.6) | Adopt |
| **KP-20** | Importer isolation: separate role and secret, the `IMPORTER_ROUTES` allow-list, the import-graph rule and the §16.1 tests as preconditions of any importer deployment | Adopt |
| **KP-21** | Prototype P0 scope and source list (§17.1), with caps of US$0.05/day and US$0.25 for week 1 | Approve to start |
| **KP-22** | Small refactors for reuse: export `normalizeURL`, the lexical helpers and title helpers; extract a pure `groupItems` from `runClustering`, with identical-behaviour tests. **No change to Worker behaviour.** | Approve with P1 |
| **KP-23** | Qwen3.5-9B CPU benchmark (a one-off, owner-approved artefact download) | Optional; recommended once |
| **KP-25** | DeepSeek account ceiling: a top-up policy (for example ≤ US$6.25 a week), and whether the workstation uses a separate account (exact balance reconciliation, if DeepSeek's terms permit it) or the shared one (weaker check) (§14.1.1) | Top-up policy ≤ US$6.25/week. A separate account only if the terms permit it. |
| **KP-24** | **DeepSeek data terms:** the terms do not exclude training; the privacy policy permits training with an email opt-out and stores data in the PRC (§10.2). Before any owner-supplied social excerpt is sent: (a) request the opt-out at `privacy@deepseek.com` and keep the confirmation; (b) the owner accepts PRC processing of public material. Until then, social extraction is deterministic only. | Keep social deterministic-only until (a) and (b) are done |

---

## 19. Proposed ADRs (all status Proposed)

| File | Decision |
|---|---|
| `docs/adr/0021-deterministic-first-knowledge-acquisition-and-model-tiering.md` | Primary-source lane; deterministic extraction and reproducibility; model roles limited to drafts and span-verified mappings; **DeepSeek Flash as the primary engine**, with the workstation runner sharing the ADR 0008 contracts; spending limits; off-peak window; importer isolation; Qwen optional; T2 excluded |
| `docs/adr/0022-model-runtime-hardware-catalogue-and-deterministic-estimators.md` | Catalogue citation rule; file-header authority; `trace-fit-v1` and `trace-decode-bound-v1`; labels and refusals (extends ADR 0019) |
| `docs/adr/0023-story-inbox-pre-run-drafts-and-one-tap-human-publication.md` | Inbox, ranking, workstation-prepared drafts imported as untrusted proposals, Worker re-validation, caps, timers; publication stays human (ADR 0004); no use of ADR 0010 automatic publication |
| `docs/adr/0024-policy-based-system-admission-pinned-freshness-revocation-and-sampling-audit.md` | System actor; MC classes; batched acceptance; pinned freshness; Evidence Library routing; revocation and restoration precondition; sampling audit |
| `docs/adr/0009-amendment-02-social-post-text-extraction-and-community-reports.md` | The exact ADR 0009 changes in §9 |

---

## 20. Risks and open questions

| Risk | Mitigation |
|---|---|
| Reddit refuses API access or changes terms | R-1 remains; Lane C does not depend on R-2 |
| A parser defect is system-admitted at scale | Worker re-read (L-3), burn-in, sampling, automatic suspension, cohort revocation (§11.7–§11.8) |
| GGUF architectures evolve (new KV schemes) | Unknown architecture rules ⇒ `kv = unknown`; architecture records are versioned; Lane A flags unrecognised keys |
| Inbox becomes a rubber stamp | Blocking validators; draft provenance chips; ADR 0004 flags; weekly sample of approved stories re-read (part of the audit summary) |
| Discovery volume stays low while STOP-BURN is active | The gated track (§17); manual and Capture intake; Lane A triggers |
| Provider price or alias drift | Pinned price table with `verified_at` (30-day expiry); `GET /models` preflight; balance reconciliation stops all model tasks on mismatch (§14.1); ADR 0008: no silent substitution |
| The nightly runner reaches a legacy Worker route | No internal-service secret on the workstation; separate importer secret; `IMPORTER_ROUTES` allow-list; tests (§16.1) |
| A run strays into peak hours | Start guard at 00:45 UTC; deferral; clock-skew check (§10.6) |
| DeepSeek trains on sent material | Public material only in the pilot; social excerpts gated by KP-24 |
| D1 read spikes from inbox lists | Keyset pagination; measured on Preview; stop conditions |
| `full_attention_interval` interpretation wrong | OM-3 tests against llama.cpp source for `qwen35`; unknown ⇒ `will_load` cap |

**Open questions** (for owner or implementation):
- Should the B70 / 5060 Ti workstation's own `llama-bench` runs become `trace_tested` observations (OM-5)?
- Does the Capture app gain a text field (Android change) or rely on Desk paste?
- Is a weekly approved-story re-read sample worth its owner time?

---

## 21. Sources

### 21.1 External (retrieved 25 October 2026 unless stated)

| ID | Source | Used for |
|---|---|---|
| X-01 | DeepSeek API docs, "Models & Pricing", `https://api-docs.deepseek.com/quick_start/pricing` (client-rendered; read in a browser) | Alias `deepseek-flash` → V4.1-Flash-1017; legacy alias retirement; prices; off-peak window; thinking default; Search and Fetch billing |
| X-02 | Reddit Help, "Responsible Builder Policy", `https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy` (shown as updated about 19 days earlier) | Approval required for any Data API access; commercial approval; no AI training; limits; privacy |
| X-03 | Third-party summaries of Reddit API limits and approvals (e.g. `prowlo.com/blog/reddit-data-api`, `socialcrawl.dev/blog/reddit-data-api-2026`) | **Unverified** planning risks only (100 QPM figure; approval delays) |
| X-04 | Hugging Face Hub API responses and range reads: `api/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF`, `api/models/unsloth/Qwen3.5-9B-GGUF` (revision `3885219b6810b007914f3a7950a8d1b469d598a5`), `/tree/main`, `resolve` headers; GGUF header bytes 0–8 MiB and 0–12 MiB | File sizes, SHA-256 fields, header fields, KV-section sizes, repo-summary discrepancy |
| X-05 | Hugging Face, "Hub Rate limits", `https://huggingface.co/docs/hub/rate-limits` (tiers "in September '25") | API, Resolver and Pages limits per 5 minutes |
| X-06 | GitHub Docs, "Rate limits for the REST API" | 60 per hour unauthenticated; 5,000 per hour with a personal token; secondary limits |
| X-07 | GitHub Docs, "Best practices for using the REST API" | A 304 conditional request does not count against the primary limit when authorised |
| X-08 | ggml, `docs/gguf.md`, `https://github.com/ggml-org/ggml/blob/master/docs/gguf.md` | Header layout; standard keys; `key_length` and `head_count_kv` semantics; alignment default |
| X-09 | Databricks, "LLM Inference Performance Engineering: Best Practices", 12 October 2023 | Decode is memory-bound; achieved bandwidth = (parameters + KV) / TPOT |
| X-10 | OpenCode docs, "Go", `https://opencode.ai/docs/go/` (no date shown) | Pricing, limits, per-model retention, DeepSeek ZDR through 31 October 2026, intended traffic, client rules |
| X-11 | Third-party OpenCode Go reviews (e.g. `tonyreviewsthings.com/opencode-go-review/`, `bitdoze.com/opencode-go-plan/`) | Not used as facts |
| X-12 | Cloudflare D1 pricing, `https://developers.cloudflare.com/d1/platform/pricing/` | Workers Paid included rows read and written; storage |
| X-13 | DeepSeek API docs, "Thinking Mode", `https://api-docs.deepseek.com/guides/thinking_mode` | `{"thinking": {"type": "enabled/disabled"}}`; thinking enabled by default (effort high) |
| X-14 | DeepSeek API docs, "Token & Token Usage" | About 0.3 tokens per English character; API `usage` is authoritative |
| X-15 | DeepSeek Open Platform Terms of Service (released 22 April 2026, effective 29 April 2026), `https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html` | Silent on training on and retention of API inputs |
| X-16 | DeepSeek Privacy Policy (updated 10 February 2026), `https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html` | Training on user input with an email opt-out; retention while the account exists; storage in the PRC |
| X-17 | DeepSeek API docs, "Get User Balance", `GET https://api.deepseek.com/user/balance` | Balance reconciliation |
| X-18 | GitHub REST `GET /repos/{owner}/{repo}/releases?per_page=30` for `ggml-org/llama.cpp`, `vllm-project/vllm`, `ollama/ollama`, `BerriAI/litellm`, `huggingface/transformers` (unauthenticated, 5 requests) | Release-size and frequency measurements (§14.1) |
| X-19 | Exchange-rate quotes: `30rates.com` (GBP/USD 1.3524 on 2026-09-10), `poundf.co.uk` (1.3559 on 2026-09-09); no 25 October quote found | Conservative 1.25 USD/GBP used for the weekly cap |

### 21.2 Internal

- ADR 0004, 0008 (§2.1, §2.2, §3), 0009, 0010, 0012, 0015, 0016, 0019, ADR-0020 (Proposed).
- On `main` at `5cb64af`: `workers/ingestion/{index,cluster,dedup,classify,cross-source-match,extract-claims}.ts` (route sets, `routeAllowed`, `authenticateInternalRequest`, the `scheduled()` cases, the pure-function inventory in §16.1); `src/ai/{durable-governance,providers/deepseek}.ts`; `wrangler.worker.toml` (`crons = []`).
- `src/ai/config.ts` (allow-list, prices, budgets), `src/ai/trace-model-gateway.ts`, `src/ai/task-policy.ts`.
- On `origin/codex/trace-v1-seed-01-prerequisites` (being released to Production on 2026-10-25; contents verified identical to the local copies first read):
  - `db/migration-0076-evidence-library-governance.sql`, `db/migration-0024-social-signals.sql`, `db/migration-0068-v1-freshness-review.sql`;
  - `docs/audit/trace-v1-knowledge-10-{final-report,readiness,legacy-absorption,local-acquisition-architecture,open-model-execution-plan,ask-evaluation,seeding-plan}.md`;
  - `docs/audit/trace-v1-seed-01-prerequisites.md`;
  - `docs/roadmap/trace-v1.1-v1.2.md`;
  - `docs/research/inventory-hardware-benchmarks-agents.md` (`HW-*` records) and `inventory-models-and-quantisation.md`;
  - `tests/fixtures/knowledge-10/ask-evaluation-suite.json`.
- On local branch `codex/trace-capture-preview-01`: `docs/audit/trace-capture-integration-01.md`.
- On `origin/codex/trace-v1-seed-03-batch-01`: `docs/audit/trace-v1-seed-03-batch-01-plan.md` (governance write rate; session cap; independence groups declared up front).
- Production source-registry findings, read-only, 2026-10-25, relayed by the production-readiness session (§1.1).
- `docs/audit/trace-v1-production-readiness-07.md` (no revoke, restore or amend controls).
