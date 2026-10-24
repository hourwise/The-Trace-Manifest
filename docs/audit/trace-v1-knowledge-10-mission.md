# TRACE V1.1 / V1.2 — KNOWLEDGE-10 Research Programme

## Legacy absorption, evidence readiness, Ask TRACE, open-model execution and the AI models research intake

**Assigned to:** Claude Code / Opus
**Repository:** `D:\Users\fleur\The Trace Manifest` — https://github.com/hourwise/The-Trace-Manifest
**Working branch:** `codex/trace-v1-knowledge-10-readiness` (worktree `D:\Users\fleur\trace-v1-knowledge-10-readiness`, created from PR #2 head `674a194`)
**Prepared:** 22 October 2026

This brief combines four earlier instructions into one research job, and adds one requirement:

1. **KNOWLEDGE-10:** Production evidence readiness and a controlled seeding plan.
2. **KNOWLEDGE-10 addendum (Part F):** open-model execution intelligence and hardware-aware Ask TRACE.
3. **AI models, inference and agent systems research intake.**
4. **KNOWLEDGE-10 addendum (Part G):** local knowledge acquisition, a local RAG, and nightly ingestion on the planned local AI workstation, feeding Cloudflare through a governed import boundary.
5. **New:** legacy Production D1 absorption. Every record already in Production must have a defined path through the V1 governed pipeline, or a recorded reason why it does not. Otherwise it is dead wood.

---

## 0. Framing: planned additions, not blockers

This programme **does not block the V1 editorial relaunch.** Production has been live for some time. The relaunch is the PR #2 editorial release, and it continues on its own track:

- merge with owner approval;
- Production Pages auto-deploy;
- §7.7 smoke test and authenticated QA.

Nothing here may delay, modify or depend on that release.

Everything this programme identifies becomes a **planned addition** in one of these release lines:

| Release line | Scope |
|---|---|
| **V1.0.1** | D4: Pending Review clusters open the governance panel. Already recorded. |
| **V1.1: knowledge foundation** | Legacy D1 absorption, evidence census and eligibility funnel, freshness triage, knowledge-document mapping, a controlled source-capture and seeding pilot on Preview, and a publisher-only (`/admin/ask`) Ask TRACE evaluation. |
| **V1.2: Ask TRACE and open-model execution** | The public Ask enablement decision, the retrieval strategy (lexical or hybrid), the open-model execution data foundation, a first catalogue pilot, and hardware-aware Ask. |
| **Local acquisition track (V1.1 → V1.2+)** | Local acquisition and the governed import boundary (Workstream 8). The contract and the offline prototype (phases A–B) need no workstation and can start in V1.1. The local RAG, workers and the Preview importer (phases C–E) are V1.2. The Production pilot and nightly operation (phases F–G) each need separate approval. |
| **Separate gated track** | Scheduler 0072, STOP-BURN closure, source 93 and the M2 compatibility gate. Each needs its own approval. The pilot does not need this track. Sustained automated freshness does. |
| **Deadline track** | The Astro 7 / Workers migration, before the audit exception expires on 2027-01-31. |

The programme's job is to **assign each finding to a release line and justify it.** It must not raise anything to a relaunch blocker unless it finds a defect in what is already live, such as a public data leak. Report any such defect immediately and separately.

This job is **research and planning only.** It produces documents and, optionally, local characterisation tests. It does not populate, seed, backfill, deploy or activate anything.

---

## 1. Starting state: verify, don't assume

These are checkpoints from 22 October 2026. Re-establish each one before relying on it.

| Item | Last verified state |
|---|---|
| PR #2 | Ready for review, not merged. Head `674a1942db20d26f81d6f4acb602000b7dabff5e`. Checks green. |
| Historical `main` | `0351df7e64d1faf9456042c468e97efecf934d87` |
| Production D1 | Reconciled through 0050–0075. 0069 was already present. 0070 and 0072 have **not** been applied. 29 legacy divergences were accepted. |
| Production Worker | `41f31744-886a-4b9b-b3e0-05613573a216` (code `916861c`). Schedules `[]`. Rollback target `20d789f4`. |
| Production Pages | `247d3b3a` (`0351df7`). This changes when PR #2 merges. |
| Preview | Worker `ea8ac39d`, Pages `c09445df` (both `674a194`). Holds the QA fixtures: `[QA-D5 fixture]` clusters 90001–90110 and the governance fixtures. These are not real evidence. |
| Scheduler candidate | `a321156a2e085b5d9570e671bc2aa6d54f79d7ec`. Frozen. The main checkout `D:\Users\fleur\The Trace Manifest` is on this branch. **Do not commit there.** |
| Ingestion | Paused. The latest `feed_items.fetched_at` and `cron_runs.started_at` are both 2026-09-06. |

**Protected identities.**

- Do not change PR #2, the release worktree `D:\Users\fleur\trace-v1-release-09-gates`, the scheduler branch, or any deployed version.
- If PR #2 merges while this job runs, **merge** `main` into this branch. Never rebase.

---

## 2. Guardrails

These apply to the whole programme and take precedence over anything a later section seems to allow.

**STOP-BURN stays in force.** Do not:

- activate scheduler 0072;
- enable or change Cron;
- call scheduler endpoints;
- resume scheduled or daily ingestion;
- enqueue source-fetch, extraction or backfill jobs;
- start a Production or Preview backfill;
- add polling or recurring execution of any kind;
- run broad repeated D1 scans.

The extraction-run ledger records attribution. It does not prevent overlapping runs, so do not treat it as a fix for scheduler overlap.

**No data mutation.** Do not:

- write to Production or Preview D1, R2, Vectorize or KV;
- deploy anything;
- change Pages or Worker secrets, Access policies or role lists;
- apply migrations;
- write new migrations (proposals in documents are fine).

**Do not implement any of the following.** Identify the need instead.

- Public Ask activation.
- A new inference, search or research provider.
- Paid inference calls.
- Automatic source admission or reviewer acceptance.
- Bulk freshness promotion.
- Relaxed evidence scoring.
- Extraction retry or reset.
- Evidence revocation or restoration.
- Assertion amendment or successor logic.
- D4.
- Any recommendation engine.
- Any part of the local acquisition system: scheduler, RAG, workers or import Worker.
- Any parallel knowledge database.

**Keep the architecture: TRACE decides; inference explains.** The application decides:

- eligibility, admission and freshness;
- provenance independence and source treatment;
- corroboration and contradictions;
- the conclusion mode, confidence and selected lean;
- citation eligibility.

The same applies to hardware compatibility exclusions. The model only puts that decision into prose.

**Web research.**

- Read-only discovery and metadata only.
- Do not download model weights.
- Do not run untrusted installers or scripts.
- Do not clone and build third-party repositories.
- Do not sign in to sites.
- Do not scrape marketplaces.
- Do not copy third-party proprietary datasets or scoring systems.
- Quote no more than short attributed excerpts.

**Session safety.**

- Never sign out or replace the user's Cloudflare Access session in the browser pane.
- Never enter credentials.
- Never change Access policies or role secrets. The owner does that.

**Honesty.**

- Do not fabricate counts, QA, sources, URLs, benchmark numbers or answer quality.
- If a URL, model, release, organisation or repository cannot be verified from a primary source, label it a research candidate with an evidence state (§9.4). Never invent one.
- Do not raise rumours to the status of releases.

---

## 3. Production inspection method (bounded and read-only)

1. Verify the Cloudflare account and the exact Production D1 identity (name, UUID and environment flag). Record them.
2. **Use one bounded read pass, then work locally.**
   - Take one fresh logical snapshot of Production with the existing keyset-paginated approach: per-table pages ordered by rowid, with FTS shadow tables skipped.
   - Record rows read. Production holds about 60,000 rows, so one pass should read roughly that many.
   - Run every census, funnel, freshness and absorption query against the local SQLite copy.
   - Run extra live queries only for facts that cannot come from the snapshot, such as `_cf_KV` or Time Travel state. They must be indexed and aggregate. Budget: **at most 20 live queries and 250,000 rows read in total, excluding the snapshot.**
   - If a query family reads unexpectedly many rows, stop that family and report it.
3. **Known D1 hazards.**
   - Never use `wrangler d1 export`. It blocks the database and fails on FTS5.
   - A statement may bind at most 100 parameters.
   - Compound SELECTs have a term limit.
   - On Windows, Wrangler can abort at exit after printing valid JSON. Parse stdout from the first `[` or `{`.
4. **Privacy.**
   - The snapshot stays in the session scratchpad. Never commit it, publish it or upload it anywhere.
   - Reports give counts and identifiers, never private source text or credentials.
5. Record the snapshot timestamp, the environment and the exact SQL for every reported number in an appendix.

---

## 4. Workstream 1: legacy Production D1 absorption (new; V1.1 core)

**Goal:** prove that the information already in Production can flow into the V1 governed model.

### 4.1 Definition of "absorbed"

Classify every Production table, and each material population within it, into exactly one of:

| Class | Meaning |
|---|---|
| **A: native** | Already in its final V1 governed shape. Needs nothing. |
| **B: absorbable** | Has a defined, idempotent path through an *existing* governed route. Name the route, its inputs, its review gates and its batch limits. |
| **C: needs a new path** | Valuable, but no governed route exists yet. Specify the minimum missing capability and assign it to a release line. |
| **D: history only** | Kept for audit, provenance or telemetry, and never evidence. The reason must be recorded. Examples: `cron_runs`, `admin_audit_log`. |
| **E: retirement candidate** | Proposed for archival or deletion, with a reason and owner approval. **Nothing is deleted in this programme.** |

The target is **zero unexplained rows.** A population with no class and no reason is dead wood. Report each one by name.

### 4.2 Starting inventory

This comes from the local post-migration Production snapshot of 22 October 2026: 114 tables, 39 of them non-empty, about 59,551 rows including the derived FTS rows. **Re-verify it against the fresh snapshot.**

| Population | Rows | Observed shape | Absorption question |
|---|---|---|---|
| `feed_items` | 6,765 | raw 2,302; classified 563; clustered 3,651; published 249 | Which unprocessed items are in scope and worth a bounded manual pipeline run? Which are duplicates or out of scope (class D or E)? |
| `story_clusters` | 2,755 | published 98; review 37; draft 2,620 | Are the drafts an editorial backlog or noise? What triage rule applies, and in which release? |
| `editorial_candidates` | 3,768 | new 3,751; published 15 | Is there a triage path, and is it a bulk queue need (§13)? |
| `claims` (legacy) and `legacy_claim_cutover` | 1,159 / 1,159 | 712 in published clusters, 444 in draft, 3 in review | Is the cutover complete and lossless, compared field by field? |
| `canonical_claims` and `story_claims` | 1,199 / 1,199 | **782 canonical claims have no assertion** | Can a claim become an assertion without captured source text? Which governed route? What is the reviewer cost? |
| `claim_assertions` | 417 | admitted/accepted/unknown 210; pending/proposed/unknown 167; pending/proposed/current 40 | Funnel and freshness, Workstream 2 |
| `claim_evidence` and `legacy_claim_evidence_map` | 377 / 377 | | Is the mapping to assertions complete? |
| `source_documents` and `source_document_versions` | 33 / 33 | all admitted, `metadata_only`, retrieval available; **0 chunks, 0 extractions, 0 provenance groups** | Is recapture through the bounded KC-11C backfill the only path to citation locators? |
| `knowledge_documents` and `knowledge_document_sources` | 30 / 30 | all approved; **0 claim mappings, 0 assertion mappings, 0 revisions** | Workstream 4 |
| `knowledge_search_records` and FTS | 3,984 | published_story 2,755; canonical_claim 1,199; knowledge_document 30 | **Check this first.** 2,755 `published_story` records equals the total cluster count, and only 98 clusters are published. Confirm query-time filtering keeps drafts out of every public route. If it does not, report it immediately as a live defect. |
| TRACE Models | | models 27 (26 active); providers 20; provider_models 19; benchmarks 13; benchmark_runs 14; model_versions 0; pricing_history 0 | Foundation for Workstream 8 |
| `guides` | 21 | all draft; 0 guide sources; 0 revisions | Guides Lab ownership under ADR 0019 |
| `sources` | 79 | rss 36; github_api 21; manual 9; arxiv_api 6; page_diff 4; lmsys_api 1; huggingface_api 1; hackernews_api 1 | Source 93 (§5.6) |
| Operational | | `ingestion_jobs` 17,048 (completed 10,479; failed 3,902; **running 2,667, stale**); `pipeline_stages` 5,131; `cron_runs` 2,918; `admin_audit_log` 2,761; `ai_requests` 121; `ai_usage_ledger` 116; `question_gaps` 1 | Mostly class D. Stale running jobs belong to the scheduler track, not absorption. |
| Empty V1 governed tables | 75 tables | provenance, chunks, freshness reviews, governance events, knowledge mappings, embeddings, backfill, extraction ledger | The governed machinery exists but has **never processed Production data**. That is the absorption gap in one line. |

### 4.3 Absorption plan requirements

- **Order by Ask value, not volume.** Process published-story claims and the 210 admitted/accepted assertions before draft clusters and raw feed items.
- **Rehearse locally first.**
  - Run each proposed absorption route against the local snapshot copy using the repository's own helpers and the D1-faithful test adapter (`tests/sqlite-d1.ts`, which enforces the 100-parameter limit).
  - Measure rows written, idempotency on a second run, and what is left for review.
  - Copy Production data into Preview only with separate explicit approval.
- **Estimate reviewer workload.** Human review is the real bottleneck. Estimate reviewer-hours per class B population. Name where bulk or work-queue tooling would change the estimate (§13).
- **Reuse existing routes and gates:**
  - canonical claim writes;
  - assertion governance and reviewer governance;
  - evidence freshness review;
  - bounded KC-11C backfill;
  - KC-08 knowledge mapping and approval;
  - KC-10 impact proposals.
  Do not propose a parallel import path that bypasses idempotency keys, CAS or governance events.
- **Respect the accepted schema state.** Take account of the 29 legacy divergences, the fact that 0070 is a subset of 0059/0063 and must not run on Production, and the fail-closed M2 gate. Say which absorption routes each one affects.
- Return one disposition:
  - `LEGACY_D1_FULLY_ABSORBABLE`;
  - `LEGACY_D1_ABSORBABLE_WITH_NEW_PATHS` (list the class C capabilities);
  - `LEGACY_D1_ABSORPTION_BLOCKED` (name the blocker).

---

## 5. Workstream 2: evidence census, eligibility, freshness, capture (V1.1)

### 5.1 Fresh census

Report total and state counts for:

- stories (published, reviewed, evidence-linked);
- canonical claims (current, disputed, superseded, retired);
- assertions (each admission × reviewer × freshness combination);
- source documents and versions (captured, extracted, failed, stale, metadata-only);
- chunks and citation-locator eligibility;
- provenance groups;
- approved knowledge (documents, sections, revisions);
- knowledge claim and assertion mappings;
- extraction runs, effects and failures;
- search and FTS records;
- Vectorize: Preview capability and Production availability.

Use the live schema. Compare with the historical snapshots, and say which changes can actually be established. The Mission 1 snapshot had 86 public stories, 1,159 claims, 210 accepted/admitted, 0 current eligible, 0 chunks, 30 documents and 0 mappings. The October rehearsal had 417 assertions. Do not treat snapshots taken at different times as interchangeable.

### 5.2 Eligibility funnel

The authority is `src/lib/server/ask-evidence.ts` and the policy contracts it uses. Do not invent another definition.

Count each stage:

1. stored;
2. valid admitted source;
3. acceptable source role and treatment;
4. admitted;
5. accepted;
6. current;
7. linked to a canonical claim;
8. valid source identity and citation locators;
9. passes publication constraints;
10. eligible for Ask TRACE.

Give the main exclusion reasons at each stage. Say where stages overlap or cannot be measured separately.

### 5.3 Freshness

For the assertions with `unknown` freshness, report:

- which source categories dominate;
- missing dates or review metadata;
- incomplete versions;
- which recalculation mechanisms are available.

Sort them into:

- genuinely stale;
- unknown because never reviewed;
- unknown because the source data is incomplete;
- old but possibly still valid;
- ineligible whatever their freshness.

**Do not bulk-set `current`.** Propose a triage workflow across the three axes (admission, editorial review, freshness) that covers:

- rules for source age, materiality, publication date, review interval and version validity;
- where `evidence-freshness-review.ts` and the existing UI already support it;
- where a real capability is missing.

### 5.4 Knowledge-document mapping

For the approved documents, report:

- how many make material factual claims;
- how many are mapped, and how many mappings resolve to eligible current assertions;
- how many have usable external locators;
- how many are mainly TRACE-authored prose (which is **never independent corroboration**);
- how many need a source refresh or new research.

Separate the `docs/Knowledge Input` repository material from approved runtime knowledge. Name the highest-value documents that could become Ask-ready with the least additional capture and mapping.

### 5.5 Source capture and backfill readiness

Review KC-03, KC-08, KC-09 and KC-11, together with their `docs/audit/kc-*` evidence. Cover:

- retrieval;
- HTML, Markdown and PDF extraction;
- document and version identity;
- normalisation and hashing;
- R2;
- chunks and locators;
- duplicates;
- provenance grouping;
- admission and review gates;
- bounded backfill.

Verify the current ceilings: KC-11C previously allowed 25 records per batch, concurrency 1, bounded bytes, retries and time. Establish whether the KC-11C normalised-content identity instability was resolved, or still blocks particular source classes. Do not reopen accepted work without proof of a current defect.

Return `CONTROLLED_SOURCE_CAPTURE_READY`, `…_READY_WITH_RESTRICTIONS` or `SOURCE_CAPTURE_REMEDIATION_REQUIRED`, with the evidence.

### 5.6 Source 93 and the M2 gate

Use bounded reads to confirm the state of source 93 (LMSYS, `lmsys_api`) and the fail-closed M2 compatibility gate. **Do not deactivate source 93 or change its type.** Document the decisions needed before any scheduler resumption, and keep them separate from the seeding pilot.

---

## 6. Workstream 3: Ask TRACE readiness (V1.1 private evaluation; V1.2 public)

### 6.1 Runtime trace

Trace the runtime flow of both public `/ask-trace` and publisher-only `/admin/ask` through:

- the public gate (`TRACE_AI_PUBLIC_ENABLED`);
- knowledge and published-evidence retrieval;
- lexical and FTS candidate discovery;
- Vectorize;
- eligibility and provenance grouping;
- conflict detection;
- deterministic conclusion selection;
- the inference gateway;
- citation validation;
- refusal;
- rate limits, caching and budgets.

Classify each part as one of:

- implemented and locally tested;
- demonstrated on Preview;
- demonstrated on Production;
- present but disabled;
- unverified;
- incomplete.

The existence of code does not prove that it is active.

### 6.2 Inference cost and routing

From the configured contract, establish:

- which outcomes need zero model calls;
- which need exactly one synthesis call;
- whether exact or template answers can render deterministically;
- the per-request and daily ceilings;
- cache and idempotency behaviour;
- the provider-down response.

Do not assume earlier provider prices still apply. No paid calls. Do not optimise before evidence coverage exists.

### 6.3 Retrieval strategy

Assess whether D1 FTS5 plus structured entity matching covers the question suite. Mark where lexical retrieval:

- succeeds;
- misses semantically related evidence;
- returns irrelevant candidates;
- surfaces stale or ineligible evidence.

Recommend lexical-only, hybrid with Vectorize, or a phased approach. D1 remains the source of truth in every option. Do not enable Production Vectorize or embeddings.

### 6.4 Question suite: 20–30 general and 12–20 hardware

Write the questions in `docs/audit/trace-v1-knowledge-10-ask-evaluation.md`.

**General AI and agents.** Cover:

- MCP versus function calling;
- coding agents;
- multi-agent orchestration;
- local versus hosted models;
- benchmarks;
- pricing changes;
- security and guardrails;
- RAG versus fine-tuning;
- inference infrastructure;
- conflicting research;
- recent releases;
- historical concepts.

Include negatives:

- unsupported claims;
- outdated information;
- vendor-only evidence;
- contradictory independent sources;
- out-of-scope questions;
- missing knowledge;
- prompt injection embedded in source text.

**Hardware and open-model questions (Workstream 8, §9.3).** Cover:

- a fitting model and quantisation;
- weights fit but the context does not;
- an artefact that fits on a runtime that is incompatible;
- chat that works but agent tools that are unreliable;
- dense versus MoE;
- a single-GPU versus a multi-GPU split;
- CPU offload;
- AMD and Intel backend gaps;
- Apple unified memory;
- creative versus coding work;
- two concurrent coding workers;
- experimental low-bit quantisation;
- missing benchmarks;
- misleading community claims;
- licence restrictions;
- a request for a precise speed that cannot be supported.

**For each question, record:**

- the evidence required;
- whether TRACE has it;
- whether it is eligible;
- the expected deterministic outcome;
- the expected citation quality;
- whether inference is needed;
- what capture or research would close the gap.

Machine-readable expectation fixtures are welcome. **Do not invent source or assertion records.**

### 6.5 Acceptance criteria

Define measurable pilot thresholds for:

- citations on every material fact;
- citations that are eligible and resolve;
- freshness on current answers;
- acknowledgement of competing evidence;
- independence (vendor claims are never independent corroboration);
- confidence that matches deterministic policy;
- no unsupported additions;
- a non-answer when evidence is insufficient;
- a clear line between established facts and uncertainty.

Also score **usefulness**: an answer that is technically correct but vague or overly cautious fails. Never weaken evidence standards to raise completion rates.

---

## 7. Workstream 4: controlled seeding design (V1.1, Preview only; not executed here)

### 7.1 Seed corpus

Choose 20–30 high-value external sources in the AI and agents area. **Draw them from the research intake priorities (§9)** wherever that also serves the general question suite. Prefer:

- official model cards and documentation;
- original papers;
- independent benchmark methodologies;
- security advisories;
- specifications;
- independent evaluations.

Favour topics where TRACE already has authored knowledge but no external evidence mapping. Do not just take the newest feed items. Community and social material is for discovery only.

**For each source, record:**

- topic;
- the URL or existing source ID (verified, or labelled a research candidate);
- tier;
- primary or independent role;
- the target document or claim;
- the capture format;
- freshness needs;
- copyright and availability limits;
- whether it is already captured;
- the review work it needs;
- the rationale.

### 7.2 Execution design

Plan this sequence:

1. approve the selection;
2. capture;
3. preserve version and hash identity;
4. extract content and locators;
5. reconcile canonical assertions;
6. establish independent provenance;
7. admission review;
8. editorial acceptance;
9. freshness;
10. link to knowledge documents;
11. recalculate eligibility;
12. update indexes where authorised;
13. run the Ask cases;
14. record the results.

Use existing governed routes only. Name the approval gate between steps.

### 7.3 Limits and recovery

- Use the repository's current ceilings and **do not expand them.** Specify:
  - records per batch;
  - D1 rows read and written;
  - R2 bytes;
  - requests;
  - Workers CPU;
  - indexing and inference budgets;
  - stop thresholds.
- Run small independent batches with observation in between. Nothing recurring.
- Cover each of these cases:
  - already captured;
  - an identical version;
  - changed content;
  - failed capture;
  - metadata-only;
  - a source needing manual review;
  - a duplicate assertion;
  - an incomplete locator;
  - a partial extraction;
  - a stale index entry.
- A genuine retry limitation becomes a separate prerequisite. Do not implement it.

### 7.4 Topic acceptance

A topic passes only when this whole chain holds: **captured → mapped → provenance established → reviewer-approved → freshness accepted → retrieved → cited answer validated.** Report how many suite questions become answerable, without hiding legitimate insufficient-evidence results.

---

## 8. Workstream 5: open-model execution intelligence (V1.2)

**ADR 0019 is the authority:** `docs/adr/ADR 0019 TRACE Open Model Execution.md` (accepted 22 July 2026). Do not create a competing database or recommendation architecture.

Write the results in `docs/audit/trace-v1-knowledge-10-open-model-execution-plan.md`, covering the sixteen sections below.

1. **ADR 0019 gap analysis.** Say which components exist; which have a schema but no records; which have code but no UI; which exist only as documentation; which can reuse the TRACE Models records (27 models, 19 provider models, 13 benchmarks, 14 runs, 0 model versions, 0 pricing history); which can reuse KC-08, KC-09 and KC-11; and which need a later mission.
2. **Comparable products.** Start with canirun.ai, canitrun.net and canrunai.com, plus other active tools. Compare:
   - hardware detection;
   - GPU and VRAM databases;
   - quantisation choice;
   - context estimation;
   - runtime suggestions;
   - fit grades;
   - workload ranking;
   - benchmarks;
   - install guides;
   - multi-GPU support;
   - offload;
   - memory breakdowns;
   - known incompatibilities.
   Learn feature patterns only. Do not copy data or scoring. TRACE's differentiator is recommendations that are evidence-backed, versioned, workload-aware, explainable and linked to real compatibility records.
3. **Hardware and workload input schema.**
   - **Hardware:** CPU, RAM, the exact GPU models, VRAM per GPU, GPU count, unified versus dedicated memory, OS, disk, PCIe constraints, drivers and backends, and power or noise limits.
   - **Workloads:** chat, coding assistance, autonomous agents, research, creative writing, roleplay, long documents, RAG, tool calling, MCP agents, vision, image or video, and concurrent workers.
   - **Preferences:** speed, quality, balance, long context, minimum memory, privacy, power use, easy install and maximum workers.
   - Unknown values stay unknown and are never guessed.
   - Browser detection is a convenience only and is never authoritative.
   - Nothing is retained without a user-facing privacy policy.
4. **Catalogue fields.** Keep these levels distinct:
   - publisher → family → release → checkpoint → variant (base, instruct, reasoning, coding or multimodal);
   - dense or MoE, with total and active parameters;
   - native context, modalities, tool calling and licence;
   - **downloadable artefact** → format → quantisation → file sizes and hashes → who quantised it → when it was verified.
   The formats include BF16/FP16, FP8, NVFP4 and MXFP4, the GGUF Q8–Q2 and IQ families, AWQ, GPTQ, EXL2/EXL3 and mixed-precision formats. **They are not interchangeable.**
5. **Runtime and backend requirements.** Cover llama.cpp, Ollama, LM Studio, vLLM, SGLang, ExLlama, MLX, KTransformers and the specialist engines (§9.2). For each, record:
   - architectures and quantisations;
   - operating systems;
   - GPU vendors and generations;
   - CUDA, ROCm, Vulkan, SYCL, Metal or CPU backends;
   - multi-GPU support and splitting modes;
   - offload;
   - KV-cache strategy;
   - context limits;
   - batching;
   - API compatibility;
   - tool-call parsers;
   - structured output;
   - install complexity;
   - regressions;
   - maintenance status;
   - licence and version.
   Do not conflate an engine, a format, a quantisation method and a fine-tune.
6. **Strata and NInfer.**
   - Strata: https://github.com/Niko1221/Strata. NInfer: https://github.com/Neroued/ninfer.
   - Assess both as specialists. Do not assume either supports every model.
   - Compare their memory-management and performance techniques with general-purpose runtimes.
   - Verify that both repositories exist before analysing them.
7. **Memory and fit calculation.**
   - Total = weights + KV cache + compute buffers + runtime overhead + modality memory + reserved memory.
   - It also depends on context length, concurrency, batch size, display reservation, system RAM, offload, splitting, backend limits, MoE total versus active parameters, and topology and transfer overhead.
   - Two 16 GB GPUs do not equal one 32 GB GPU. The stored weights of a MoE model are not sized by its active parameters.
   - Use the ADR 0019 levels: `will_load`, `minimum_usable`, `recommended` and `production_or_agent_use`.
   - Keep memory fit separate from runtime compatibility, quality and speed.
8. **Multi-GPU and offload rules.** Distinguish:
   - one model split across GPUs;
   - separate models on separate GPUs;
   - GPU plus CPU or RAM offload;
   - tensor parallelism;
   - pipeline or layer parallelism;
   - engine-specific hybrid schemes.
   Undocumented means unverified or unsupported. Assess whether a small verifier model plus a larger coder beats one very large model.
9. **Workload policy.**
   - **Coding agents:** code quality, tool reliability, structured output, long context, multi-step reliability and harness fit, then speed and memory.
   - **Creative work:** prose, instruction following, coherence and style.
   - **General assistant:** reliability, responsiveness, reasoning and ease.
   - **Multi-agent:** worker count, residency, throughput and role split.
   - Never default to the largest model. Quantisation choice depends on the workload. Aggressive low-bit quantisation for coding or tools needs evaluation evidence.
   - Produce separate picks for: best overall, best coding or agent, best creative, fastest usable, highest quality that fits, best low-memory, best experimental and best upgrade path.
10. **Agent and harness compatibility.**
    - **Targets:** OpenCode, Claude Code-compatible gateways, Codex-compatible tooling, MCP hosts and clients, OpenAI-compatible and Anthropic-compatible APIs, structured JSON, function calling, multi-step tools and concurrent requests.
    - **Test cases:** invalid arguments, format errors, reasoning leakage, loops, context exhaustion, stop tokens, schema validation, tool-result interpretation and completion quality.
    - **Statuses:** `works`, `works_with_configuration`, `partial`, `experimental`, `known_broken`, `unsupported`, `unverified`.
    - Never infer agent reliability from a model card.
11. **Evidence classes.** Publisher-stated, runtime-developer-stated, TRACE deterministic estimate, community benchmark, independently reproduced, and TRACE-tested.
    - A performance record carries: the artefact, quantisation, engine and version, GPUs, CPU and RAM, OS, backend and driver, context, batch size, prompt-processing and generation speed, concurrency, offload, methodology, date, source and verification status.
    - A community benchmark is never a promised tokens-per-second figure. Without comparable evidence, speed is unknown or labelled as an estimate.
12. **Source acquisition and governance.**
    - **Primary:** model cards, Hugging Face metadata, engine repositories and release notes, vendor specifications.
    - **Independent:** reproducible benchmarks and tests.
    - **Community:** Reddit, GitHub issues and user configurations. These enter normal TRACE review and are never promoted automatically.
    - Plan updates for: a model change, a new quantisation, new runtime support, a driver break, a corrected benchmark, a withdrawn artefact and a fixed bug.
    - Record timestamps, reviewed versions and review intervals.
    - The work stays manual while STOP-BURN is active.
13. **Initial catalogue.** 12–20 model releases with their important verified artefacts, 6–10 runtimes, and NVIDIA, AMD, Intel and Apple profiles. Include GGUF and specialist runtimes, coding, reasoning and creative relevance, and the verified current versions. Newest is not best by default. For each entry, assign ownership under ADR 0019:
    - TRACE Models structured records;
    - Knowledge Continuity evidence;
    - Guides Lab setup;
    - diagnostic issue and remediation records.
14. **Evaluation matrix.** At least 12–20 scenarios with **expected deterministic outcomes only.** Never invent observed results. Hardware profiles:
    - CPU-only with 16–32 GB;
    - single NVIDIA 8, 16, 24 and 32 GB;
    - 2×16 GB, 2×24 GB, and 32 GB + 16 GB;
    - mixed-generation NVIDIA;
    - AMD 24–32 GB;
    - Intel Arc 16–32 GB;
    - Apple Silicon;
    - two concurrent coding workers;
    - the reference workstation (§9.1).
15. **User interaction concept.** Worked example: "RTX 3090 24 GB, 64 GB RAM, Linux, autonomous coding."
    - First establish context needs, workload size, concurrency, the speed/quality preference and willingness to offload.
    - Then answer with the recommended model and exact variant, the artefact (source, format and quantisation), the runtime, backend and version, the memory breakdown and headroom, performance (observed or labelled estimate), agent compatibility, alternatives, a reviewed guide link, and confidence and provenance.
    - With insufficient evidence, give no fabricated configuration.
    - The pipeline is deterministic: hardware and workload → candidates → memory eligibility → runtime compatibility → workload suitability → evidence-backed ranking → alternatives and uncertainty → an optional LLM explanation. The model never overrides an exclusion.
16. **Implementation slices.** List them in dependency order. The smallest sequence after this programme comes first.

Return `OPEN_MODEL_EXECUTION_PILOT_READY`, `OPEN_MODEL_EXECUTION_DATA_FOUNDATION_REQUIRED` or `OPEN_MODEL_EXECUTION_ARCHITECTURAL_GAP`.

---

## 9. Workstream 6: AI models, inference and agent systems research intake (feeds V1.1 and V1.2)

**Status of every item below: research candidate, not a verified finding.** Many names are recent, and some may be wrong, renamed or rumours. Verify each one against its publisher's official site or repository. Resolve uncertain organisation identities before trusting any download page. **Metadata only:** no weight downloads, no installs.

This intake does two jobs:

- it supplies the **seed corpus** (§7.1) and the **open-model catalogue** (§8.13);
- it is a continuing research backlog.

### 9.1 Reference system and priority objectives

The planned agent system:

- a primary coding worker running a 27–40B model;
- a secondary independent reviewer model;
- Claude Code or Codex supervising bounded assignments;
- a deterministic verification runner;
- hybrid GPU and RAM inference for large MoE models;
- persistent, evidence-linked agent memory;
- possible open-source engine contributions.

**Reference workstation (provisional, not purchased):** Intel Arc Pro B70 32 GB, NVIDIA RTX 5060 Ti 16 GB, and about 128 GB RAM, expandable to 256 GB. It doubles as one of the §8.14 evaluation profiles.

### 9.2 Research catalogue

| Area | Candidates |
|---|---|
| **P0 coding and agent models** | Qwen 3.8 27B; Qwen 3.8 Flash Next; DeepSeek V4.1 Flash; GLM-5.3 Flash; Recursive Flint 40B-A2.5B; Sage-A1.5 35B-A3B |
| **P1 models** | Ornith-1.5 35B; Qwen 3.6 35B-A3B |
| **Launches to verify** | Qwen 4 (27B, Flash, Plus, Max); Kimi K3 and K3.1 (including the Arena sightings); LFM 2.5 24B-A2B; Tiel Coder 35B; the StepFun family; Gemma 4; Swift 1.5 Qwen variants; a Korean 30B MoE (gaming studio, claimed Apache 2.0, NVFP4); Muse Spark |
| **Quantisation** | BaseQuant V1; GSQ-RCO and Strata formats; ByteShape; Unsloth GGUF and imatrix; EXL3; NVFP4, MXFP4 and FP8; BitNest, QSpec and SubSpec; two-bit GPU base with CPU residual verification |
| **Engines** | Strata; Project Maya; DSX; DwarfStar/ds4; llama.cpp; Slipstream; KTransformers; vLLM; ExLlama/EXL3; BaseRT; Ollama; LM Studio; llama-swap; Berth; LiteLLM; OpenCode; OpenHands |
| **Intel GPUs** | Arc Pro B70 32 GB; B65 32 GB; B60 24 GB; MAXSUN B60 Dual 48 GB; B50 16 GB |
| **NVIDIA GPUs** | RTX 5060 Ti 16 GB; 4060 Ti 16 GB; 3090 24 GB; Titan RTX; Quadro RTX 5000; V100 32 GB; P100 16 GB; RTX 8000 / A6000 48 GB |
| **AMD GPUs** | Radeon AI Pro R9700 32 GB; RX 9060 XT 16 GB; 7600 XT 16 GB; Pro W6800 32 GB; MI50 and MI60; 7900 XTX 24 GB |
| **Workstation bases** | HP Z6/Z8 G4; Dell 7820/7920; Lenovo P920/P620; Supermicro; EPYC, Threadripper and Xeon bundles. Requirements: 128→256 GB, memory channels and bandwidth, x16+x8 electrical slots (as opposed to physical slot size), spare lanes, Above 4G, bifurcation, cooling, PSU and Linux. Also research PCIe layer splitting versus tensor parallelism and mixed-vendor Vulkan. |
| **Agent orchestration** | Acceptance contracts before coding; independent test execution with JSON or JUnit capture; preventing skipped or edited tests; reviewing whether tests prove the requirements; mutation testing (Stryker) and regression tests run against pre-fix code; file and tool permission limits; progress detection, timeouts and bounded correction cycles; state between tasks; stable model and GPU interfaces; separating verified facts from model opinion. Moirae Accord and Prefixity are internal context. |
| **Agent memory** | SKILL.state-style continuity; Mnemosyne-like memory; SQLite retrieval; Markdown/JSON state; provenance; Git-referenced versioned facts; expiry and revalidation; contradictions; shared versus per-worker memory; controlled promotion into skills; **memory contamination**. The preferred principle mirrors TRACE: workers submit observations, and only evidenced facts are promoted. References: DocBrain, KnowledgeDrift. |
| **Benchmarks and testing** | Luke's Dev Lab (YouTube, site, published configurations); SWE-bench Verified and Pro; Terminal-Bench; LiveCodeBench; Aider-style tests; issue-reproduction sets; Arena; Hugging Face; OpenReview; arXiv; ACL Anthology. Always record the benchmark version, harness, prompting, hardware, revision, quantisation and date. Never compare scores across versions or harnesses. |

**Evaluation methodology for coding workers.** Measure:

- first-pass acceptance;
- `pass@k` and `pass^k`;
- tests actually run, failed or skipped;
- defects the reviewer catches;
- wrong tool calls and fabricated success claims;
- tokens and wall-clock time per accepted task;
- how often the supervisor intervenes;
- behaviour after compaction;
- repeatability.

Success means correct, verifiable changes, not fast code. For quantisation, compare **coding quality at equal file size**, not only perplexity or KL divergence.

**Potential contribution.** Assess the feasibility of reusing Strata's Intel SYCL work for an Intel backend in Project Maya: GLM-5.3 Flash on the B70 first, DeepSeek V4.1 Flash later. Identify:

- reusable abstractions;
- device-memory operations;
- quantisation and attention kernels;
- expert caching;
- upstream contribution requirements.

Do not assume CUDA kernels translate directly. **Feasibility only:** no forks, code or upstream contact.

**Hardware prices.** eBay UK and Bargain Hardware prices are at most indicative, time-stamped observations. They are never trusted facts, and nothing is scraped automatically.

### 9.3 Discovery targets

**Primary sources.** Treat these as starting points to verify, not as trusted URLs:

- Hugging Face Hub, GitHub (releases, changelogs, issues, PRs), arXiv, OpenReview, ACL Anthology, ModelScope, the Ollama library;
- Intel oneAPI/SYCL, NVIDIA CUDA and AMD ROCm documentation;
- GitHub organisations: ggml-org, QwenLM, vllm-project, kvcache-ai, huggingface, Niko1221, mw00, lxe, T-Crypt, bradrlaw;
- Hugging Face publishers: Qwen, unsloth, InternScience, basecompute, plus the *verified* official accounts of Recursive Superintelligence, Moonshot AI, DeepSeek, Z.ai/GLM and Liquid AI.

**URLs supplied in the intake.** Verify each one:

- BaseQuant Qwen 3.8 27B; BitNest (arXiv 2610.02800); SubSpec (arXiv 2509.18344); QSpec (EMNLP 2025); the two-bit residual repository;
- Project Maya (and issue #37); DSX; DwarfStar; KTransformers; Berth; llama.cpp multi-GPU documentation;
- the P100/V100 forks and server examples.

**Community sources (leads only):** r/LocalLLaMA, r/LocalLLM, r/Qwen_AI, r/IntelArc, r/v100, r/HighVRAMHardwareWatch and r/AI_Agents.

### 9.4 Record format and evidence states

Each finding records:

- ID;
- subject;
- the exact claim;
- canonical source;
- supporting sources;
- publication and observation dates;
- version or revision;
- the evidence type;
- reproducibility;
- confidence;
- relevance;
- limitations;
- next action;
- supersession.

**States:** `VERIFIED`, `REPRODUCED`, `COMMUNITY_REPORTED`, `ANNOUNCED`, `RUMOURED`, `DISPUTED`, `SUPERSEDED`.

**Mapping to TRACE.**

- Only `VERIFIED` or `REPRODUCED` findings with a primary source are candidates for the seeding pilot. They still go through capture, admission, review and freshness.
- `COMMUNITY_REPORTED`, `ANNOUNCED` and `RUMOURED` findings stay in the research inventory and never become TRACE evidence directly.
- Report the mapping between these states and TRACE's admission and reviewer states.

### 9.5 Prioritisation and outputs

**P0:**

- B70 with Strata and Qwen Flash Next;
- Project Maya Intel feasibility;
- DSX architecture and Intel compatibility;
- Qwen 27B quantisation quality and coding reliability;
- Flint, Sage and the 35–40B alternatives;
- hybrid RAM/VRAM performance and bandwidth;
- verification of independent workers, and memory provenance.

**P1:**

- Qwen 4 and Kimi verification;
- BitNest and speculative decoding;
- BaseQuant, GSQ-RCO and ByteShape;
- Berth's progress;
- V100/P100 configurations;
- workstation expansion and cooling.

**P2:**

- SSD streaming of large MoE models;
- Intel compatibility libraries;
- dynamic multi-model scheduling;
- quantisation-aware speculative verification;
- AI-assisted engine optimisation.

**Outputs** go under `docs/research/`:

- a searchable inventory (`ai-models-inference-agents-inventory.md`, plus a `.json` file in the §9.4 format);
- short technical notes for the P0 findings;
- a comparison of model and runtime combinations;
- an Intel/NVIDIA/AMD compatibility matrix;
- a register of unconfirmed and disputed claims;
- a register of contribution opportunities;
- an executive summary of the findings that change the workstation or agent plan.

**Do as much P0 as the budget allows. P1 and P2 may stay as scoped backlog entries.**

---

## 9A. Workstream 8: local knowledge acquisition, local RAG and the governed import boundary (V1.1 contract → V1.2+)

**Strategic objective.** A dedicated local AI workstation (§9.1) runs a local-first TRACE Knowledge Acquisition System. It will:

1. monitor approved sources nightly;
2. capture releases, model updates, quantisations, benchmarks, engine developments and documentation changes;
3. maintain a local TRACE retrieval index;
4. compare new material with earlier captured versions;
5. use deterministic processing plus bounded local SLM/LLM assistance to prepare structured evidence;
6. validate and package updates into numbered, versioned import batches;
7. transfer validated batches into Cloudflare through a governed import boundary;
8. make the records available for editorial review and then Ask TRACE retrieval.

Expensive background research and processing move off Cloudflare. **D1 stays the canonical source of truth.**

**Architectural principle.** Local hardware acquires, understands, compares and prepares. TRACE's governed Cloudflare infrastructure validates, records, serves and audits canonical knowledge. The local RAG is a preparation tool, **never an alternative source of factual authority.**

**Do not implement or activate any part of this during KNOWLEDGE-10.**

Write the design in `docs/audit/trace-v1-knowledge-10-local-acquisition-architecture.md`, covering the sections below.

### 9A.1 Compatibility with existing architecture

Review:

- ADR 0019 (open-model execution);
- ADR 0016 (governed Ask TRACE research);
- the Knowledge Continuity and source-versioning contracts;
- KC-03 capture;
- KC-08 mapping and governance;
- KC-09 retrieval, decisions and citations;
- KC-11 bounded backfill;
- the EDITORIAL-03C extraction-run ledger and attribution;
- the existing D1 and R2 bindings;
- the current Worker authentication, HMAC signing and idempotency patterns.

The local system **reuses these canonical concepts**: source and version identities, content hashes, canonical claims and assertions, the three governance axes, and ledger attribution. It must not create a second evidence authority or produce assertions nobody can verify.

**Assess and decide one question explicitly:** does this system **replace**, **complement** or **shrink** Cloudflare-scheduled ingestion (scheduler 0072 and the Cron path)? That answer changes the scope of the STOP-BURN track, and the roadmap (§10.5) must record it. Also assess whether the import contract should be the **shared route** for:

- the V1.1 seeding pilot (§7);
- legacy absorption class C paths (§4);
- open-model catalogue records (§8);

rather than building three separate write paths.

### 9A.2 Local acquisition and scheduling

Plan a nightly schedule over approved sources:

- GitHub releases and selected repository changes;
- Hugging Face model cards and artefact metadata;
- official publisher announcements;
- engine release notes;
- papers and benchmarks;
- GPU and accelerator compatibility documentation;
- quantisation releases;
- security advisories;
- changes to already-approved source documents.

**Rules:**

- Fetch incrementally. Never re-download the whole library.
- Keep a durable cursor or checkpoint for each source.
- After the machine has been offline, **record the missed interval** rather than launching an unrestricted catch-up scan.
- The local scheduler is **completely independent of Cloudflare Cron.**

### 9A.3 Local TRACE RAG

The local store holds:

- permitted raw snapshots;
- extracted and normalised text;
- stable source and version identities and content hashes;
- release chronology;
- model and runtime entities;
- hardware compatibility claims;
- quantisation records;
- benchmark observations;
- known issues and corrections;
- **prior import batches and their D1 receipts.**

Use a local relational catalogue, plus lexical or vector retrieval where justified.

It must answer questions like:

- What changed since yesterday?
- Is this model or quantisation already recorded?
- Does this runtime now support this architecture?
- Is this benchmark newer than the stored one?
- Does this contradict an existing compatibility claim?
- Which knowledge entry or assertion needs review?

**Similarity never establishes factual authority.**

### 9A.4 Local workers

Define bounded roles:

| Worker | Job |
|---|---|
| Acquisition | Fetches material and records transport and source identity |
| Extraction | Pulls out release metadata, compatibility facts, benchmark observations and candidate claims |
| Reconciliation | Matches new material against existing model, runtime, artefact and knowledge records |
| Verification | Independently checks facts against source text, field constraints and locators |
| Packaging | Builds deterministic manifests and lists unresolved issues |

**Model output is an untrusted proposal.** Deterministic validation independently checks IDs, hashes, schemas, source associations and permissions. A model reporting its own success never replaces executable validation (compare the §9.2 coding-worker methodology).

### 9A.5 Change-based ingestion

Classify each change as one of:

- new source;
- new release;
- new artefact;
- new quantisation;
- new runtime compatibility;
- changed benchmark;
- changed source document;
- correction;
- supersession;
- withdrawal;
- no material change.

Earlier source versions and canonical claims are preserved. A new version **never overwrites historical evidence.**

### 9A.6 Numbered import batches

**Envelope fields:**

- schema version;
- batch ID, for example `TRACE-KNOW-20261022-0001` (stable and independent of the destination database);
- local run ID;
- creation time;
- source registry and version IDs;
- URL and retrieval time;
- original and normalised hashes;
- source locators;
- candidate claim IDs;
- candidate canonical associations;
- model, runtime and artefact identities;
- the proposed action;
- validation results;
- reviewer-required flags;
- content-policy and storage class;
- record and byte counts;
- batch checksum;
- retry and idempotency identity.

**Format:** JSONL plus a manifest, or an equivalent schema-validated transport.

**Every batch must be replay-safe.** Retrying a failed batch must not duplicate claims.

### 9A.7 Governed import boundary

Design a dedicated, bounded importer on the existing authenticated Worker architecture. **Never allow direct SQL from the workstation to Production D1.**

The importer must:

1. verify identity and authorisation;
2. validate the schema and the size limits;
3. verify hashes and stable IDs;
4. allow only listed record types;
5. reject unsupported source or citation relationships;
6. detect batches already applied;
7. check for existing canonical identities;
8. write bounded records to the correct canonical tables;
9. **keep records in their pending, admission and review states**;
10. return durable receipts per record and per batch;
11. fail safely when the schema is incompatible;
12. support bounded, idempotent retry.

**Storage decision.** Decide whether large permitted bodies go to R2 while D1 holds identities, relationships and concise indexed metadata. Not everything local belongs in D1. Design within D1's limits: 100 bound parameters per statement, statement and batch size limits, and the trigger-counted `meta.changes` behaviour.

### 9A.8 Evidence admission policy

Local processing may **prepare** candidates. It never turns an unreviewed candidate into accepted, current evidence because a local model judged it credible.

Write explicit review rules for two categories:

- **Objective metadata:** for example a release ID, file hash, published variant or declared licence.
- **Interpretive evidence:** for example coding quality, benchmark superiority, compatibility reliability, speed or energy efficiency.

The admission, reviewer and freshness axes are preserved. The workstation **cannot bypass TRACE governance.**

### 9A.9 Resources and cost controls

Set separate budgets for:

- source requests and bytes;
- local storage;
- embeddings;
- local inference time;
- CPU and GPU concurrency;
- D1 import records;
- D1 rows read and written;
- R2 writes;
- retries.

Define kill switches, per-batch caps, daily ceilings and failure thresholds.

**Measure D1 cost in a Preview pilot; do not guess it.** Normal daily operation must not need broad Production scans. Keep the local reconciliation catalogue current from durable import receipts.

**This system must never enable recurring Cloudflare ingestion as a side effect.** STOP-BURN and 0072 stay separate.

### 9A.10 Recovery and integrity

Cover:

- network loss overnight;
- shutdown;
- interrupted retrieval;
- partial batches;
- duplicate updates;
- corrupt batch files;
- Cloudflare API unavailable;
- **a timeout after a successful write**;
- D1 schema evolution;
- conflicting source versions;
- rejected reviewer decisions.

**Local checkpoint states:** prepared → submitted → accepted-for-staging → rejected or committed.

Reconcile against durable receipts; never resend everything blindly. Run logs and batch logs are append-only.

### 9A.11 Phases

| Phase | Content | Gate |
|---|---|---|
| A: contract design | Batch envelope, canonical field mapping, provenance, import authority | Planning only |
| B: offline prototype | Local SQLite or test database with recorded source fixtures. Deterministic packaging with no Cloudflare. | Can run before the workstation exists |
| C: local RAG | Source-version retrieval, change detection, reconciliation | Workstation |
| D: multi-worker | Bounded local-model extraction and classification with independent validation | Workstation |
| E: Preview importer | Governed importer with strict D1 budgets, authentication and idempotency | **Separate approval** |
| F: Production pilot | One reviewed, numbered batch, with D1 usage observed | **Explicit approval** |
| G: nightly operation | Local schedule enabled only after reliable end-to-end runs and cost certification. Remote import stays bounded and independently controlled. | **Separate approval** |

The document must also cover:

- an architecture diagram;
- the existing components reused;
- the source monitoring strategy;
- the nightly stages;
- the testing plan;
- hardware and software dependencies;
- estimated operational costs, with unresolved assumptions stated.

**Recommend the earliest safe portion that can be built before the workstation exists.** The likely candidates are the phase A contract and the phase B offline prototype; say whether the §9A.1 shared-route decision makes them worth building first.

Return `LOCAL_TRACE_ACQUISITION_ARCHITECTURE_READY`, `LOCAL_TRACE_ACQUISITION_CONTRACT_PREREQUISITE_REQUIRED` or `LOCAL_TRACE_ACQUISITION_DESIGN_BLOCKED`.

---

## 10. Workstream 7: product readiness, priorities and roadmap

### 10.1 Three separate verdicts

Give a separate verdict for each of:

- **editorial V1:** site, workflow, governance, release;
- **knowledge acquisition:** capture, extraction, review, provenance, update safety;
- **Ask TRACE:** retrieval, eligibility, decisions, synthesis, citations, usefulness.

The editorial release passing does not make the platform ready.

### 10.2 Feature classification

Classify each item below as `REQUIRED_BEFORE_SEEDING`, `REQUIRED_BEFORE_PUBLIC_ASK`, `REQUIRED_BEFORE_AUTOMATED_INGESTION` or `POST_LAUNCH_IMPROVEMENT` (more than one may apply). **Also assign each to V1.0.1, V1.1, V1.2, the gated track or later.**

- D4;
- freshness triage;
- bulk review and work queues;
- visibility of capture failures;
- the knowledge claim-mapping workflow;
- extraction failure recovery;
- legacy absorption routes (class C paths);
- source 93 compatibility;
- the question-gap queue;
- automatic evidence refresh;
- source and version change notifications;
- D1 consumption monitoring and alerts;
- retrieval evaluation;
- citation locator quality;
- public Ask UX;
- the hardware and workload input;
- the fit calculator;
- runtime compatibility records;
- the catalogue pilot;
- the local acquisition import contract (phases A–B);
- the governed import Worker (phase E);
- the local RAG and workers (phases C–D).

Do not propose a large new system where an accepted subsystem already exists.

### 10.3 D4

Establish whether being unable to open Pending Review clusters blocks the pilot's reviewer actions, and the legacy absorption review. If it does, recommend D4 ahead of the pilot. Do not implement it, and do not touch PR #2.

### 10.4 STOP-BURN and sustained operation

Explain how the pilot and the absorption rehearsal run while STOP-BURN remains active. Then list what sustained operation will require:

- 0072 activation;
- overlap prevention;
- stale-running cleanup (2,667 jobs);
- the source 93 and M2 decisions;
- two clean scheduled opportunities;
- bounded D1 reads;
- ingestion health monitoring;
- source-change detection;
- freshness and review-queue integration.

Neither the pilot nor the absorption plan may depend on these.

Then restate this list in light of the §9A.1 decision. If local acquisition replaces or shrinks Cloudflare-scheduled ingestion, say which items still apply, which change, and which disappear.

### 10.5 Roadmap document

Write `docs/roadmap/trace-v1.1-v1.2.md` with:

- the release lines;
- each item's dependencies;
- its entry and exit criteria;
- its approval gates;
- a relative size estimate (S/M/L).

---

## 11. Validation

- Run the existing suites covering:
  - canonical evidence;
  - eligibility;
  - freshness;
  - provenance;
  - retrieval and capture;
  - backfill;
  - knowledge mapping;
  - retrieval;
  - answer schemas;
  - deterministic decisions;
  - citations;
  - public Ask gating;
  - role boundaries.

  Use `npm test`, `npm run test:evidence-policy`, `npm run test:knowledge-markdown`, the KC test files and `npm run test:security`. Report each result exactly. Do not weaken tests.
- Characterisation tests are optional and local only:
  - absorption-route rehearsal against fixtures or the local snapshot copy;
  - question-suite expectations.

  The snapshot itself is never committed. Committed fixtures must be synthetic or already public.
- **No remote seeding, absorption or pilot runs.**

---

## 12. Deliverables

All on `codex/trace-v1-knowledge-10-readiness`:

| File | Content |
|---|---|
| `docs/audit/trace-v1-knowledge-10-readiness.md` | Census, funnel, freshness, knowledge mapping, capture readiness, source 93 and M2, Ask architecture, retrieval, inference, query appendix |
| `docs/audit/trace-v1-knowledge-10-legacy-absorption.md` | Workstream 1: class per population, routes, rehearsal results, reviewer workload, dead-wood list |
| `docs/audit/trace-v1-knowledge-10-seeding-plan.md` | Seed corpus, sequence, gates, limits, recovery, topic acceptance |
| `docs/audit/trace-v1-knowledge-10-ask-evaluation.md` | General and hardware question suites, acceptance thresholds |
| `docs/audit/trace-v1-knowledge-10-open-model-execution-plan.md` | The sixteen §8 sections |
| `docs/research/ai-models-inference-agents-inventory.md` + `.json` | §9 outputs |
| `docs/audit/trace-v1-knowledge-10-local-acquisition-architecture.md` | §9A: architecture, batch contract, importer, budgets, recovery, phases |
| `docs/roadmap/trace-v1.1-v1.2.md` | §10.5 |

Optional synthetic fixtures and characterisation tests may be added.

**Git discipline.**

- Commit documents and tests on this branch only, ending each message with the standard co-author line.
- **Do not push** without explicit approval.
- Never merge, deploy or force-push.
- Do not touch the release worktree, the scheduler worktree or PR #2.

---

## 13. Dispositions

Return exactly one value from each row:

| Area | Values |
|---|---|
| **Overall** | `KNOWLEDGE_SEEDING_PLAN_READY` / `KNOWLEDGE_SEEDING_PREREQUISITES_REQUIRED` / `KNOWLEDGE_READINESS_UNRESOLVED` |
| **Legacy D1** | `LEGACY_D1_FULLY_ABSORBABLE` / `LEGACY_D1_ABSORBABLE_WITH_NEW_PATHS` / `LEGACY_D1_ABSORPTION_BLOCKED` |
| **Source capture** | `CONTROLLED_SOURCE_CAPTURE_READY` / `CONTROLLED_SOURCE_CAPTURE_READY_WITH_RESTRICTIONS` / `SOURCE_CAPTURE_REMEDIATION_REQUIRED` |
| **Ask TRACE** | `ASK_TRACE_PILOT_READY` / `ASK_TRACE_EVIDENCE_POPULATION_REQUIRED` / `ASK_TRACE_ARCHITECTURAL_BLOCKER` |
| **Open-model execution** | `OPEN_MODEL_EXECUTION_PILOT_READY` / `OPEN_MODEL_EXECUTION_DATA_FOUNDATION_REQUIRED` / `OPEN_MODEL_EXECUTION_ARCHITECTURAL_GAP` |
| **Local acquisition** | `LOCAL_TRACE_ACQUISITION_ARCHITECTURE_READY` / `LOCAL_TRACE_ACQUISITION_CONTRACT_PREREQUISITE_REQUIRED` / `LOCAL_TRACE_ACQUISITION_DESIGN_BLOCKED` |
| **Automated ingestion** | `STOP_BURN_STILL_ACTIVE` / `SCHEDULER_REMEDIATION_READY_FOR_SEPARATE_REVIEW` / `INGESTION_STATE_UNRESOLVED` |
| **Relaunch impact** | `NO_RELAUNCH_BLOCKERS_FOUND` / `LIVE_DEFECT_REPORTED` (with details) |

Never report ingestion as resumed or STOP-BURN as closed.

---

## 14. Final report

Return these sections:

- **A. Starting identities:** repository, branches, commits, trees, worktrees.
- **B. Remote inspection:** Production D1 identity, the snapshot method, query budget and rows read.
- **C. Census:** compared with the historical snapshots.
- **D. Legacy absorption:** the class of each population, the dead-wood list and the disposition.
- **E. Eligibility funnel:** counts and exclusion reasons.
- **F. Freshness:** the breakdown and the triage proposal.
- **G. Knowledge documents:** mapping and citation readiness.
- **H. Source capture:** readiness and limits.
- **I. Source 93 and M2:** state and the decisions required.
- **J. Ask TRACE architecture:** what exists, what is enabled, what is unverified.
- **K. Retrieval:** lexical, FTS and Vectorize.
- **L. Inference:** the decision boundary, cost and routing.
- **M. Question evaluation:** the general and hardware suites, current answerability and gaps.
- **N. Seed corpus:** 20–30 sources with their rationale.
- **O. Seeding plan:** the process, batches and gates.
- **P. Resource budget:** D1, R2, Workers, retrieval and inference.
- **Q. Open-model execution:** the ADR 0019 gap, comparators, Strata/NInfer, the catalogue pilot and the disposition.
- **R. Research intake:** P0 findings, state counts, the disputed-claims register and the executive summary.
- **R2. Local acquisition:** the architecture, the shared-route decision, the effect on scheduler 0072's scope, the earliest pre-workstation slice and the disposition.
- **S. Required features:** by gate and by release line.
- **T. Acceptance targets.**
- **U. Tests:** exact outcomes.
- **V. Changed files:** documentation and tests only.
- **W. Protection proof:** no mutation, Cron change, scheduler activation, deployment or release modification, and the protected identities unchanged.
- **X. Candidate identity:** branch, commit, parent, tree, clean status.
- **Y. Dispositions:** all eight from §13.
- **Z. Recommended next mission:** exactly one bounded execution mission. **Do not start it.**

---

## 15. Suggested execution order

1. Verify identities (§1). Take the Production snapshot (§3). **Check the `knowledge_search_records` draft-visibility question first** (§4.2), because it is the only item that could affect the relaunch.
2. Workstreams 1 and 2 against the local snapshot.
3. Workstream 3: code trace and question suite.
4. Web research for Workstreams 5 and 6 (§8, §9). Independent topics can run in parallel subagents. Merge their findings into one inventory with deduplicated record IDs.
5. Workstream 4: seed selection, drawing on §9's verified items.
6. Workstream 8: local acquisition design. It depends on the capture, ledger and importer patterns found in Workstreams 2–3, and on the shared-route question (§9A.1).
7. Workstream 7: roadmap and classifications, including the §9A.1 effect on the scheduler track.
8. Run the tests, commit and write the final report.

**Final instruction.** The aim is to turn TRACE's existing data and machinery into admitted, current, independently supported, citation-backed evidence that answers real questions, including practical local-AI questions, without restarting the burn. Put evidence quality and answerability ahead of ingestion volume. Make sure nothing already in Production is left as dead wood.
