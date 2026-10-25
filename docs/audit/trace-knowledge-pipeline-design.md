# TRACE knowledge pipeline: deterministic-first acquisition, catalogue, story inbox, social automation and knowledge absorption

**Date:** 25 October 2026
**Status:** **Design proposal only.** Nothing here is implemented, migrated, scheduled, deployed or pushed. Each phase in §17 needs its own owner approval.
**Supersedes (as proposals):** the two narrower proposals "social automation" and "story automation and catalogue".
**Proposed decisions:** ADR 0021 to ADR 0024 and ADR 0009 Amendment 2, all with status **Proposed** (§19).
**Builds on:** `docs/audit/trace-v1-knowledge-10-local-acquisition-architecture.md` and `docs/audit/trace-v1-knowledge-10-open-model-execution-plan.md`, both on `codex/trace-capture-preview-01` and `codex/trace-v1-knowledge-10-readiness`, not yet on `main`. The same applies to the KNOWLEDGE-10 final report, the roadmap `docs/roadmap/trace-v1.1-v1.2.md`, the research inventory `docs/research/ai-models-inference-agents-inventory.*`, the evaluation fixture `tests/fixtures/knowledge-10/ask-evaluation-suite.json` and migration `db/migration-0076-evidence-library-governance.sql`. References below cite them by those paths.

**Hard constraints for this design:**
- No Production change.
- Trust is not weakened: every existing gate keeps its meaning. Where automation replaces a human click, the replacement is narrower, auditable and reversible, and §11 makes reversibility a precondition.
- Publication stays human (ADR 0004).
- The two-independent-provenance-groups rule for `supported` is unchanged. The separate, still-open P-1 `primary_attributed` option is neither adopted nor rejected here (§11.10).

---

## 0. Summary

### 0.1 The problem

| Fact | Source |
|---|---|
| The intended volume is about **50 news stories and 20 owner-captured social posts a day**, run by one owner in **20–30 minutes of decisions**. | Owner brief |
| Each news cluster currently needs manual clicks: hours a day at that volume. | Owner brief |
| Publishing a story does **not** create Ask-ready knowledge. **0 of 417** Production assertions are Ask-eligible, because each fact needs admission, reviewer acceptance and freshness. | KNOWLEDGE-10 final report §C, §E |
| SEED-01 (migration 0076, PR #3) added an Evidence Library context for facts no story carries. It is applied on **Preview only**. | `migration-0076-…sql`; memory of the Production state on 2026-10-24 |
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
| Model calls per day | **≤ 90** (about 40 story drafts, ≤ 20 social fallbacks, ≤ 30 release-note fallbacks) | Gateway usage ledger |
| Model spend | **≤ US$0.35 a day** at DeepSeek peak list price (§14.1) | Usage ledger against the provider balance |
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
| B-5 | `src/ai/config.ts` allows only `deepseek-v4-flash` and `deepseek-v4-pro`, priced at 1/5 and 2/10 USD per million tokens. On 2026-10-25 the DeepSeek pricing page shows `deepseek-flash` as the current name, with `deepseek-v4-flash` retired and served by V4.1-Flash-1017 (§10.2, [X-01]). | Roadmap item **G-1** (allow-list and price update) is a precondition of Lane B at volume (§14.1). |
| B-6 | The local-acquisition design proposes: L-1 shrink Cloudflare ingestion; L-2 one KC-11 evidence write path; L-3 the Worker re-fetches and verifies; L-4 no workstation database access. | Lane A runs locally and submits proposals. The Worker remains the authority. These four decisions are reused unchanged. |
| B-7 | The ADR 0019 catalogue structures are almost entirely missing. The current `models` table is regex-extracted and unevidenced (open-model plan §1). | The catalogue in §6 is new schema (OM-1, OM-2), sequenced after the V1.1 evidence route is proven. |
| B-8 | Hardware scenarios H01–H16 currently all resolve to `insufficient_evidence` (evaluation fixture). | §6.6 maps each one to the records and estimator outputs that would change its outcome. |
| B-9 | ADR 0004 lists claim types that always need human review: security, legal, misconduct, major benchmark conclusions, "best" rankings, prominent corrections, sponsored comparisons, claims based mainly on community reports, strong contradictions. | None of these classes can ever be system-admitted (§11.9). Story publication is human for every story anyway. |
| B-10 | ADR 0015 already defines candidate states including `draft_ready`, `held`, `archived` and server-side draft persistence with prompt, policy, model and source-set hash. | The story inbox (§7) is a UI and orchestration layer over ADR 0015, not a new pipeline. |

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
| I-5 | **Extraction is reproducible:** same adapter version + parser version + input bytes ⇒ byte-identical output. | Golden fixtures; rebuild-hash test (the local-acquisition §14 pattern). |
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
- **Release-note facts are self-describing primary facts.** Under the current conclusion policy they cannot reach `supported` in Ask on their own (P-1 is still open, §11.10). They are still fully usable as **catalogue records** (runtime support with evidence class `runtime_developer_stated`), which is what the hardware Ask needs.

### 5.5 Model cards and documentation

- **Card YAML front matter** (via the HF API `cardData`): `license`, `license_name`, `license_link`, `base_model`, `base_model_relation`, `pipeline_tag`, `library_name`, `tags`. These are deterministic and pinned to the revision.
- **Card prose and official docs** (support matrices, runtime install pages) are fetched conditionally, normalised with `normalized_content_v3`, diffed against the last receipt and classified with the local-acquisition §6 classes.
- **Tables in docs** (support matrices) are parsed deterministically when they are HTML or Markdown tables with recognisable headers. Otherwise the change is surfaced as `changed_source_document` for a human.
- **JavaScript-rendered pages are a known limit.** For example, the DeepSeek pricing table is not in the server HTML: a plain fetch on 2026-10-25 returned no prices, and they appeared only after client-side rendering. Such sources are **not** machine-checkable. They stay human-reviewed, and the acquisition adapter records `render_required`.

### 5.6 Reproducibility and the extraction ledger

- Each run writes an extraction-run record in the existing EDITORIAL-03C ledger (`claim_extraction_runs`): adapter id and version, parser id and version, input SHA-256, output SHA-256, and the source version id. Model fallbacks add the model id, prompt version and request id.
- **Rebuild test:** re-running any recorded run from its stored input produces the same output hash (I-5). A mismatch blocks submission.
- **Golden fixtures:** recorded API responses and header byte ranges from §5.2–§5.3 (parsed JSON plus hashes; no tokenizer arrays) become test fixtures.

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

**Reading the CPU rows.** The owner's current CPU-only machine running Qwen 3.5 9B has an unrecorded memory configuration, so its profile stays `unknown` until the owner supplies it. If it is dual-channel DDR4-3200, decoding 800 output tokens takes **at least about 90 s** per item before any prefill. That supports the brief's conclusion: **overnight batch at most** (§10.4).

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
| Drafts per day (K) | **40** | 50 stories/day target. The rest are low-rank and shown as "not drafted; draft on demand". |
| Input cap | 12,000 tokens (fact sheet + bounded source extracts) | Existing `TRACE_AI_MAX_INPUT_TOKENS` default |
| Output cap | 1,500 tokens | Existing `TRACE_AI_MAX_OUTPUT_TOKENS` default |
| Attempts | 1; no retries; no regeneration (ADR 0012) | A failed draft shows "Draft failed; draft on demand" |
| When | **Off-peak** where possible: outside 01:00–04:00 and 06:00–10:00 UTC on weekdays, which halves the price [X-01] | Owner trigger or workstation timer (I-7) |
| Daily cap | US$0.30 for drafts (editorial task budget) | §14.1 |

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

**Model fallback** (`deepseek-flash`, non-thinking, ≤ 20 a day): used only when a post has a speed number but grammar coverage of the required fields is incomplete. The model returns field → **verbatim span**. Spans that do not re-find are dropped. Values the model "normalises" (for example "about 40" → 40) are rejected.

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
- **No AI training on Reddit data** [X-02]. Excerpts may be sent to the drafting model (inference, not training) only if the provider does not train on API inputs. Check this for DeepSeek's API terms (KP-10).
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

## 10. Model tiering and the gateway

### 10.1 Tiers and assignment

| Tier | What | Allowed tasks | Not allowed |
|---|---|---|---|
| **T0 deterministic** | Code | Everything in §3.2 marked D | n/a |
| **T1 low-cost API** | DeepSeek `deepseek-flash` through the existing gateway | `draft_story`, `draft_social_card`, `map_release_bullet`, `map_social_report` (span-verified), optional Ask explanation | Admission, classification of evidence class, independence, freshness, anything with private data |
| **T2 optional free or flat tiers** | For example OpenCode Go | **None in the pipeline** (§10.3). At most owner-interactive help on public material, outside TRACE's gateway. | Pipeline automation |
| **T3 local** | The owner's machines through an OpenAI-compatible local server (ADR 0019 runtime records) | Overnight `map_*` fallbacks and **independent verification passes** (local-acquisition §6 step 6) on public material; later, drafts | Anything requiring a reply in the owner's session on the current CPU machine |

**Assignment is per task type in configuration**, audited and changed only by deployment (ADR 0008 §2.1.5). **There is no runtime fallback chain** (B-4). If T1 is unavailable, the task fails visibly ("draft on demand"). It does not silently move to another tier.

### 10.2 T1: DeepSeek, verified 25 October 2026 [X-01]

| Item | Value (DeepSeek "Models & Pricing" page, read 2026-10-25) |
|---|---|
| Current alias | **`deepseek-flash`**, served by **DeepSeek-V4.1-Flash-1017** |
| Legacy aliases | `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp`: "the corresponding models have been retired", still accepted, served by V4.1-Flash-1017 and billed at the Flash price |
| Flash price (USD per 1M tokens) | Input cache hit 0.006 peak / 0.003 off-peak; input cache miss **0.30 / 0.15**; output **1.20 / 0.60** |
| `deepseek-v4-pro` | Served by DeepSeek-V4-Pro-0813: 0.044 / 0.022; 1.32 / 0.66; 3.96 / 1.98 |
| Off-peak | Half price. Peak is 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays. |
| Context; max output | 1M; 384K |
| Thinking | Supports non-thinking and thinking; **thinking is the default** |
| Concurrency | Flash 2,500; Pro 500 |
| Search and Fetch APIs | $0.75 per 1,000 requests; free through DeepSeek Harness, Claude Code or Codex until 1 November 2026 (Beijing time). **TRACE must not use them** (ADR 0008 §3.1: no model browsing). |

**Consequences:**
- **G-1:** the allow-list should move to `deepseek-flash`, and the pricing variables to 0.30 / 1.20, a **separate config change with approval**.
- With today's configured 1/5 prices, 40 drafts would reserve US$0.78 a day against the editorial cap of US$0.50 (§14.1). The inbox would stop at about 25 drafts.

### 10.3 T2: OpenCode Go, checked 25 October 2026 [X-10]

| Requirement from the brief | Finding | Assessment |
|---|---|---|
| Data retention | Per-model table. Most models 0 days and not used for training. Several closed models 30 days. "Muse Spark … Contributor" models train on prompts. **DeepSeek V4.1 Flash / V4 Pro: 0 days, under a ZDR agreement "renewed monthly … valid through October 31, 2026"**. | Retention varies by model and month; it would need re-verifying every month |
| Permitted automated use | Go is "designed primarily for OpenCode and other coding agents". Clients should "send typical coding agent traffic", identify with their own user agent, and send a stable `x-opencode-session` header per conversation. Traffic is monitored for abuse. Workspaces are single-member. | A batch extraction or drafting pipeline is **not** typical coding-agent traffic. Using Go for it risks breaching the stated intent. |
| Rate limits and availability | Per-model dollar allowances: 5-hour (20 %), weekly (50 %) and monthly (100 %). The page states no per-minute limits. "Usage limits may change"; "the list of models may change". | Not predictable enough for a daily pipeline |
| Public material only | It would be public material only | n/a |

**Recommendation:** **do not use T2 in the TRACE pipeline.** It may be revisited by a separate decision if a provider's terms explicitly permit automated batch use, with retention fixed in a contract rather than a monthly renewal. The third-party reviews found in research [X-11] are not used as facts.

### 10.4 T3: local models

**Current CPU-only machine (Qwen 3.5 9B):**
- the decode ceiling is ≤ 7.6–15.4 tok/s depending on memory (§6.5, the formula with cited inputs; the actual configuration is `unknown`);
- prefill is unmeasured.

It is suitable **only** for overnight, non-urgent T3 tasks:
- re-running `map_*` fallbacks as an **independent second opinion** (it can only add `reviewer_required`, I-2);
- verifying that T1 spans re-find. This is deterministic anyway, so the model adds little here.

**Upcoming PC:** the reference workstation (Arc Pro B70 32 GB + RTX 5060 Ti 16 GB + 128 GB, open-model plan §14 profile 13) would run the same 9B Q4_K_M at a ≤ 90–105 tok/s ceiling on the B70 (§6.5). It becomes eligible for T3 drafting only after an evaluation over recorded fixtures shows validator pass rates at least equal to T1.

**Local inference uses ADR 0019 runtime records** for the runtime and artefact chosen. The local model is an untrusted preparer: L-4 and I-1 to I-3 apply.

### 10.5 Gateway reuse

The provider-neutral gateway is defined in **ADR 0008 §2.2** and implemented in `src/ai/trace-model-gateway.ts`, `provider.ts`, `model-router.ts`, `durable-governance.ts` and `providers/deepseek.ts`. ADR 0019 contributes the local runtime and artefact records and the OpenAI-compatible local-server pattern. The brief cites the gateway as ADR 0019's; this design uses the ADR 0008 gateway, which ADR 0019 relies on.

**Additions proposed:**
- task types `draft_story`, `draft_social_card`, `map_release_bullet` and `map_social_report`, each with token ceilings, a daily budget and a schema validator;
- a `local-openai` adapter for T3, used **only** from the workstation packager, never from the public Worker;
- the existing `TRACE_MODEL_PROVIDER` seam for tests.

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

- **Batch formation** (deterministic): items with the same `rule_id` (or, for human-admitted items, the same source version and claim class), the same entity scope, ≤ 50 items, all checks passing. One failing item leaves the batch and goes to item review.
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
| **Totals** | | **≈ 3,760** | **≤ 90** | **≈ 80** |

**Shares:**
- deterministic ≈ **96 %** of operations;
- model calls ≈ 2.3 %;
- human decisions ≈ 2 %, all one-tap or batch.

**Field-level target:** ≥ 75 % of extracted fields come from T0 extractors. This is measured from the ledger, because social prose and release-note semantics are the model-heavy fields.

---

## 14. Cost and D1 budgets

### 14.1 Model cost (DeepSeek list prices, 2026-10-25 [X-01])

| Task | Calls/day | Tokens per call (in/out, caps) | Peak cost/call | Daily peak | Daily off-peak |
|---|---|---|---|---|---|
| `draft_story` | 40 | 12,000 / 1,500 | $0.0054 | $0.216 | $0.108 |
| `map_social_report` | ≤ 20 | 4,000 / 800 | $0.00216 | $0.043 | $0.022 |
| `map_release_bullet` | ≤ 30 | 3,000 / 500 | $0.0015 | $0.045 | $0.023 |
| **Total** | ≤ 90 | | | **≈ $0.30** | **≈ $0.15** |

**Notes:**
- That is about **US$9 a month at peak**, about US$4.60 off-peak, before cache-hit savings on the repeated system prompt (cache-hit input is 0.006 peak).
- **Caps:**
  - editorial task daily budget **US$0.35** (KP-14);
  - existing per-request cap US$0.02;
  - circuit breaker and prepaid balance as the final boundary (ADR 0008).
- **Pre-G-1 warning:** with the configured 1/5 prices, one draft reserves US$0.0195. 40 drafts would need US$0.78 against today's US$0.50 editorial cap.

### 14.2 D1 budgets (to be measured on Preview before Production ceilings; local-acquisition §11 targets apply)

| Path | Writes/day (estimate) | Reads/day (target) | Notes |
|---|---|---|---|
| Story candidates, clusters, drafts, inbox events | ~1,500 | ≤ 50k | Inbox lists use keyset pagination, ≤ 50 per page; no unbounded `NOT IN` scans (the `model-data.ts` anti-pattern, open-model plan §1) |
| Lane A import (≤ 4 batches, ≤ 25 evidence + ≤ 200 catalogue items each) | ≤ 5k per batch target | ≤ 20k per batch target | Local-acquisition §11 |
| Governance events + recalculation jobs + trigger writes | ~3,000 | ≤ 30k | Chunked ≤ 100 parameters; trigger-aware `meta.changes` (memory: D1 counts trigger rows) |
| Social | ~200 | ≤ 5k | n/a |
| **Total** | **≈ 10k–25k/day** (≈ 0.3–0.75M a month) | **≤ 0.2M/day** | **Included on Workers Paid: 50M rows written and 25 billion rows read a month** [X-12]. The binding constraint is **per-batch safety, not price**. |

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
| Material sent to models | **Public material only** (published articles, release notes, owner-supplied excerpts of public posts). No reviewer notes, submitter identity, Access identities, private Desk notes, receipts or secrets (ADR 0019 security rules). DeepSeek processes data under its own terms. Check the training and retention terms for API inputs (KP-10). |
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
| **0076 on Production** | Separate approved release (memory: "Next Production step = 0076 + SEED-01 PR") | Evidence Library routing on Production |
| **G-1** | Allow-list `deepseek-flash`; prices 0.30 / 1.20 | Inbox at K = 40 |
| **Revocation and restoration** (§11.7) | Implemented, tested, on the target environment | **Any** system admission or system freshness |
| **System-actor migration** (§11.2) | Approved migration | System admission |
| **Policy v1 approved** | Owner hash approval | System admission |
| **Importer role and L-1 to L-4** | Local-acquisition phase E approval | Lane A submissions to Cloudflare |
| **Reddit approval** | Responsible Builder Policy access granted, scope stated truthfully | R-2 only. R-1 needs nothing. |
| **D1 alerts and quiet baseline** | Roadmap items | Any timer-driven path on Production |
| **Evaluation** | Hardware scenarios H01–H16 at their expected outcomes; validator suites | Public hardware Ask (V1.2) |

---

## 17. Phased plan

**Every phase needs its own approval. No phase changes Production unless it says so.**

### V1.1: foundations (local and Preview)

| Phase | Content | Environment | Exit |
|---|---|---|---|
| **K0** | Owner decisions KP-1…KP-15; ADRs 0021–0024 and 0009 Amendment 2 moved from Proposed to Accepted (or revised) | Docs | Decisions recorded |
| **K1** | **OM-3+ estimator library:** `trace-fit-v1` and `trace-decode-bound-v1` as pure functions; header-JSON fixtures (Qwen2.5-0.5B, Qwen3.5-9B); exhaustive tests (no pooling, MoE, hybrid KV, unknown propagation, ceiling never shown as a speed) | Local | Tests green; formula docs |
| **K2** | **Lane A offline:** `hf-model`, `hf-tree`, `gguf-header` (bounded parser), `gh-release` adapters and parsers over recorded fixtures; packager extension of local-acquisition phases A–B; rebuild-hash test | Local | Byte-identical rebuilds; adversarial header fixtures rejected |
| **K3** | **Revocation and restoration** plus the **system-actor and policy-column migration design**; tests on the D1-faithful adapter | Local, then Preview (approval) | §11.7 test list green on Preview |
| **K4** | **G-1** config change; **story inbox** over ADR 0015 candidates and draft persistence; deterministic clustering, ranking, validators; "Prepare inbox" trigger; hold and archive timers | Preview (approval) | One week of Preview use with seeded test candidates (`[QA-…]` labels); measured owner time and D1 reads |
| **K5** | **Social R-1:** Capture text field (owner's Android work) + Desk paste; share-link canonicalisation (S-1/S-3); grammar extractor + `llama-bench` parser; linked-source proposals; community-report records as pending candidates | Preview (approval) | 20 recorded posts: extraction precision measured; spans 100 % re-find |
| **K6** | **Reddit access request** (owner): truthful description of TRACE, the single-post-by-id scope and the removal handling | External | Approval or refusal recorded. Refusal leaves R-1 as the permanent route. |

### V1.2: catalogue, absorption automation and hardware Ask

| Phase | Content | Environment | Exit |
|---|---|---|---|
| **K7** | OM-1 and OM-2 catalogue schema; importer route (local-acquisition phase E); catalogue pilot (open-model plan §12) through Lane A | Preview (approval) | Pilot records reviewed; per-batch D1 measured |
| **K8** | **Policy engine in shadow** for MC-1 to MC-6 on Preview; agreement with owner decisions ≥ 200 items per rule | Preview | ≥ 99.5 % agreement on MC classes, and every disagreement explained |
| **K9** | System admission **live on Preview** with burn-in and sampling; pinned freshness; Evidence Library routing | Preview (approval) | Two clean weeks; one deliberate cohort revocation drill |
| **K10** | Production: 0076 (if not already), the K3 migration, system admission **off**, then **on** per rule | **Production (explicit approval each)** | Same audit metrics on Production |
| **K11** | OM-7 recommender + `/admin/ask` hardware; H01–H16 evaluation; then the public-Ask gate (roadmap) | Preview → Production (approval) | Evaluation passes; Public Ask enabled by separate decision |

### Gated track: discovery automation

Automated news-feed discovery comes from one of:
- **(a)** scheduler 0072 with STOP-BURN closure; or
- **(b)** feed polling on the workstation submitting candidates via the importer (L-1).

Until then, Lane B volume depends on manual and Capture intake plus Lane A triggers. **The 50-a-day target needs (a) or (b).**

---

## 18. Owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| **KP-1** | Adopt the three-lane, one-absorption architecture and the invariants I-1 to I-8 | Adopt |
| **KP-2** | Lane A watch list: start with the open-model plan §12 pilot (14 releases, 8 runtimes); additions by owner approval only | Adopt |
| **KP-3** | Catalogue citation rule (I-4): uncited ⇒ "unknown"; file headers over repository summaries | Adopt |
| **KP-4** | Estimator outputs: the ceiling shown only as "cannot exceed about X"; no prefill estimate; `will_load` cap when overhead is unknown | Adopt |
| **KP-5** | Inbox: K = 40 drafts a day, non-thinking Flash, off-peak preparation, validators V1–V6 | Adopt |
| **KP-6** | Hold and archive timers: 72 h → held; 7 days → archived | Adopt, revisit after K4 |
| **KP-7** | ADR 0009 Amendment 2 (bounded excerpts; one-tap linked candidates; automatic pending community-report records; primary-API lookups of linked primaries) | Adopt |
| **KP-8** | Request Reddit Data API access (R-2), describing TRACE's commercial plans truthfully | Request. R-1 is the default regardless. |
| **KP-9** | Share-link resolution: S-1 (phone) preferred; S-2 (Worker `Location`-only) only after a terms check | S-1 |
| **KP-10** | Confirm DeepSeek API terms on training and retention for inputs before sending any owner-supplied social excerpts | Confirm first |
| **KP-11** | System admission scope: the admission axis only, MC-1 to MC-6 only; reviewer acceptance always human (batched) | Adopt |
| **KP-12** | Sampling: burn-in 3 batches or 150 items at 100 %; steady state max(5, 10 %), weekly ≥ 20; automatic suspension on any MC error | Adopt |
| **KP-13** | Revocation and restoration as a hard precondition of any system admission or system freshness; the system may revoke, never restore | Adopt |
| **KP-14** | Editorial daily budget US$0.35 after G-1; per-request cap unchanged | Adopt |
| **KP-15** | T2 free or flat tiers (OpenCode Go) excluded from the pipeline | Adopt |

---

## 19. Proposed ADRs (all status Proposed)

| File | Decision |
|---|---|
| `docs/adr/0021-deterministic-first-knowledge-acquisition-and-model-tiering.md` | Primary-source lane; deterministic extraction and reproducibility; model roles limited to drafts and span-verified mappings; tier assignment by task, no fallback chain; T2 excluded |
| `docs/adr/0022-model-runtime-hardware-catalogue-and-deterministic-estimators.md` | Catalogue citation rule; file-header authority; `trace-fit-v1` and `trace-decode-bound-v1`; labels and refusals (extends ADR 0019) |
| `docs/adr/0023-story-inbox-pre-run-drafts-and-one-tap-human-publication.md` | Inbox, ranking, caps, validators, timers; publication stays human (ADR 0004); no use of ADR 0010 automatic publication for stories at this stage |
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
| Provider price or alias drift | Weekly check of the DeepSeek pricing page; G-1-style config change; ADR 0008: no silent substitution |
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

### 21.2 Internal

- ADR 0004, 0008 (§2.1, §2.2, §3), 0009, 0010, 0012, 0015, 0016, 0019, ADR-0020 (Proposed).
- `src/ai/config.ts` (allow-list, prices, budgets), `src/ai/trace-model-gateway.ts`, `src/ai/task-policy.ts`.
- On `codex/trace-capture-preview-01`:
  - `db/migration-0076-evidence-library-governance.sql`, `db/migration-0024-social-signals.sql`, `db/migration-0068-v1-freshness-review.sql`;
  - `docs/audit/trace-v1-knowledge-10-{final-report,local-acquisition-architecture,open-model-execution-plan,ask-evaluation,seeding-plan}.md`;
  - `docs/audit/trace-capture-integration-01.md`;
  - `docs/roadmap/trace-v1.1-v1.2.md`;
  - `docs/research/inventory-hardware-benchmarks-agents.md` (`HW-*` records) and `inventory-models-and-quantisation.md`;
  - `tests/fixtures/knowledge-10/ask-evaluation-suite.json`.
- `docs/audit/trace-v1-production-readiness-07.md` (no revoke, restore or amend controls).
