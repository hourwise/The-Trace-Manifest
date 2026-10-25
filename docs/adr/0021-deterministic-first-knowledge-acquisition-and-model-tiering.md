# ADR 0021: Deterministic-First Knowledge Acquisition, Extraction and Model Tiering

- **Status:** Proposed
- **Date:** 25 October 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Knowledge acquisition from primary sources, extraction, the local acquisition workstation, use of language models in ingestion, model-provider tiering
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0008 Model API and Cost Containment (provider-neutral gateway, §2.2); ADR 0012 Durable Controls; ADR 0016 Governed Ask Research and Source Admission; ADR 0019 Open Model Execution; ADR 0022; ADR 0024; ADR 0009 Amendment 2
- **Design:** `docs/audit/trace-knowledge-pipeline-design.md` (§3, §5, §10, §13, §14.1, §16.1)
- **Revision 2 (25 October 2026, owner-approved):** DeepSeek Flash is the primary engine; Qwen is optional; spending limits and off-peak scheduling (§2.8); legacy-path isolation (§2.9)
- **Review trigger:** before any task type is assigned to a model tier other than T0 or T1; before a provider other than DeepSeek or a local runtime is used; if the measured deterministic share falls below the targets in §2.6

## 1. Context

TRACE aims to run about 50 news stories and 20 owner-captured social posts a day, with roughly 20–30 minutes of owner decisions. KNOWLEDGE-10 found 0 of 417 Production assertions Ask-eligible: publishing stories does not create governed knowledge.

The questions TRACE most wants to answer depend on exact, versioned, machine-readable facts:
- which models run on given hardware;
- the latest GGUF builds;
- runtime support.

Hugging Face metadata, GGUF headers, GitHub releases and official model cards publish those facts directly. Extracting them with a language model would add cost, non-determinism and a new trust surface for no gain.

The existing Production source registry (read-only, 25 October 2026) has ingested nothing since about 6 September 2026 (STOP-BURN). It holds about 1,013 GitHub release-note items as unstructured text. Its Hugging Face source has never succeeded. There is no model-card or GGUF ingestion.

The local-acquisition design (KNOWLEDGE-10 workstream 8) already established:
- Cloudflare verifies and local proposes (L-3);
- the workstation has no database access (L-4);
- the KC-11 route is the single evidence write path (L-2).

## 2. Decision

### 2.1 Primary-source acquisition is the main knowledge path

1. TRACE acquires model, artefact, runtime and licence facts from **primary sources through their own public APIs or files:**
   - the Hugging Face model and tree APIs;
   - GGUF headers read with HTTP range requests (bounded, never full weight downloads);
   - the GitHub releases and commits APIs with conditional requests;
   - official model cards and documentation through conditional GET and `normalized_content_v3` diffing.
2. Acquisition follows an **owner-approved watch list** plus **triggers** from stories and social posts that name a primary identifier. It does not crawl.
3. Every acquired fact is **pinned to an immutable identifier** (revision SHA, file SHA-256, tag plus commit, or source version plus locator). Branch names are never citations.
4. **File-level evidence prevails over repository summaries.** A GGUF artefact's facts come from its own header, not from a repository-level summary. Disagreements are findings for review.

### 2.2 News and social posts are triggers, context and occasionally evidence

5. News articles and social posts **trigger** primary acquisition and provide context.
6. They may be admitted as evidence only through the existing item-level review.
7. Deterministic shared-origin signals may **merge** a derivative item into its origin's provenance group. They may never split groups.
8. **The two-independent-provenance-groups requirement for `supported` is unchanged.**

### 2.3 Extraction is deterministic and reproducible

9. A step uses a language model only if:
   - it needs natural-language understanding;
   - a deterministic grammar has been measured as insufficient on recorded fixtures;
   - its output is either a human-approved draft or a structured proposal whose **every value re-finds verbatim** in the stored source text.
10. **Reproducibility contract.** Each extraction run records adapter, parser, grammar and normalisation versions, plus input and deterministic-output hashes, in the extraction-run ledger. Re-running the same pinned inputs (source bytes identified by SHA-256) with the same versions must produce **byte-identical deterministic extraction output**; otherwise submission is blocked.
    - Model-assisted output is stored with the run and **replayed, never regenerated**. Re-validating it must be byte-identical.
    - Run ids, timestamps, package numbers and batch ids, actual API usage and cost, provider request ids and execution receipts may differ between runs.
10a. **Unchanged source data must not produce duplicate actionable import records:**
    - an unchanged source produces no item;
    - every item carries an idempotency key derived from record type, canonical source identity, normalised content hash, proposed action and extractor version. The key is independent of run, batch, time and the model response;
    - a key already packaged, or rejected, is not packaged again as actionable;
    - a parser or prompt version change re-extracts existing sources only by an explicit owner-triggered run that emits supersede proposals.
11. **Untrusted binary inputs** (GGUF headers) are parsed by a bounded parser with explicit limits. Embedded templates are never executed or rendered.

### 2.4 Models never ingest

12. RAG and language models are used for **answering** over governed facts (Ask TRACE, deterministic-first) and for **drafting** prose a human approves.
13. In ingestion, a model's only permitted role is a span-verified mapping proposal (rule 9).
14. **No model output sets or advances any governance axis:** admission, reviewer state, freshness, provenance group or evidence class.
15. A model may add `reviewer_required`; it may never remove it.

### 2.5 Model tiering

16. Tiers:
    - **T0** deterministic code;
    - **T1** DeepSeek `deepseek-flash` in non-thinking mode (`{"thinking": {"type": "disabled"}}`), the **primary language engine** for the initial local acquisition system and for owner-triggered Worker tasks;
    - **T2** optional free or flat-rate tiers;
    - **T3** local models through an OpenAI-compatible local server described by ADR 0019 runtime records.
17. **Each task type is assigned exactly one tier by configuration.** There is no runtime fallback between tiers or providers (ADR 0008 §2.1.5; ADR 0012 #3). An unavailable tier defers the item visibly.
18. **T2 is excluded from the TRACE pipeline** until a separate decision finds a provider whose terms explicitly allow automated batch use with contractually fixed retention. (OpenCode Go, checked 25 October 2026, is intended for coding-agent traffic and has per-model, monthly-renewed retention terms.)
19. **T3 is optional only.** The owner's machine (32 GB DDR3-1600, CPU only, no GPU; theoretical ceiling about 4.4 tokens per second for a 9B Q4 model) may serve as a benchmark or as an independent verifier that can only add `reviewer_required`. Any future machine must first match T1 on recorded validator fixtures. Performance is established by an actual benchmark, not an estimate.
20. Models receive **public material only**. They have no tools and no URL access.
    - Public primary-source material is the first pilot dataset.
    - Owner-supplied social excerpts are not sent to DeepSeek until its training opt-out is confirmed in writing and the owner accepts processing in the PRC. DeepSeek's privacy policy (10 February 2026) permits training on inputs, with an email opt-out, and its API terms do not exclude it.
    - Reviewer notes, personal information, credentials and private Desk content are never sent.
20a. **The workstation calls DeepSeek directly, faithfully sharing the ADR 0008 contracts.** It imports, from the same repository and commit:
    - the task policy, schemas and validators;
    - the model allow-list and deprecated-alias guard;
    - the provider request shape.

    It implements the `DurableAIGovernance` lifecycle (reserve, settle, circuit breaker, idempotency) on a local ledger, with one contract-test suite run against both implementations. It uses a dedicated, revocable DeepSeek API key, and an outbound host allow-list.

### 2.6 Targets and measurement

21. **Targets:**
    - at least 90 % of pipeline operations are deterministic;
    - at least 75 % of extracted fields come from deterministic extractors;
    - at most about 90 model calls a day at target volume.

    All three are measured from the run ledger and the gateway usage ledger.

### 2.7 Where work runs

22. Acquisition runs on the workstation, manually or by a workstation timer, and submits proposals through the importer route. The Worker re-reads every value that system admission relies on (ADR 0024).
23. **No Cloudflare Cron** is introduced by this decision. STOP-BURN and the scheduler 0072 track are unchanged. The legacy daily classification and clustering pipeline stays paused.

### 2.8 Spending limits and scheduling

24. **Model requests from the workstation start only in the off-peak window 22:00–00:45 UTC.** DeepSeek's peak hours are 01:00–04:00 and 06:00–10:00 UTC on weekdays.
    - Work is checkpointed per item.
    - Unstarted items are deferred to the next window.
    - A request in flight at a crash is settled at its reservation and never resent in the same window.
    - Requests never run in peak hours automatically.
25. **Hard limits, all fail-closed:**
    - a combined US$6.25 a week (about £5): the Worker's unchanged editorial budget of US$0.50 a day, plus US$2.75 a week for the workstation;
    - a workstation daily limit and per-task daily limits;
    - reservations at cap tokens × peak price, settled from actual usage.
26. **Guards:**
    - a response showing reasoning output opens the task's circuit;
    - a pinned price table older than 30 days, a missing model id, or a mismatch between the account balance and the settled ledger stops all model tasks until the owner re-verifies.
27. Volume increases (story drafts from 10 a day upward) only by owner decision after measured weekly reports.

### 2.9 Isolation from legacy Worker paths

28. **The workstation never holds** the internal service secret, a publisher identity, D1 or R2 credentials, or Cloudflare API tokens.
29. It reaches Cloudflare only as a separate **`importer`** role with its own secret and an Access service token. That role is limited to an exact allow-list of import routes (batch manifest, staged items, receipts).
30. **Tests must prove all of the following before any importer deployment:**
    - every existing admin route rejects importer credentials, with no D1 write and no pipeline call;
    - each secret validates only its own role;
    - the allow-list matches a reviewed snapshot;
    - the import module cannot import the legacy ingestion pipeline modules.

## 3. Consequences

### Positive

- Most knowledge arrives as exact, pinned, reproducible facts at near-zero model cost.
- The catalogue and hardware Ask gain a reliable data source.
- Model spend and the model trust surface are small and bounded.
- Errors are reproducible and therefore fixable and revocable.

### Negative

- Adapters and grammars must be maintained as APIs and formats evolve.
- Some prose facts remain human work.
- Self-describing primary facts still cannot reach `supported` in prose Ask without the separate P-1 decision.

## 4. Rejected alternatives

| Alternative | Reason for rejection |
|---|---|
| LLM extraction of everything | Non-reproducible, costlier, and adds a trust surface for facts already published in machine-readable form |
| RAG over fetched pages to "learn" facts | Similarity and generation are not evidence (ADR 0019) |
| Free flat-rate tiers for batch work | Terms target interactive coding agents; retention varies by model and month |
| Automatic fallback across providers | Duplicate cost and inconsistent privacy (ADR 0012) |
| Crawling Hugging Face broadly | Cost and rate limits with little value; a watch list plus triggers is sufficient |
