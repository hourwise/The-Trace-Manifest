# ADR 0021: Deterministic-First Knowledge Acquisition, Extraction and Model Tiering

- **Status:** Proposed
- **Date:** 25 October 2026
- **Decision owners:** The Trace Manifest maintainers
- **Applies to:** Knowledge acquisition from primary sources, extraction, the local acquisition workstation, use of language models in ingestion, model-provider tiering
- **Related decisions:** ADR 0004 Human Review Boundary; ADR 0008 Model API and Cost Containment (provider-neutral gateway, §2.2); ADR 0012 Durable Controls; ADR 0016 Governed Ask Research and Source Admission; ADR 0019 Open Model Execution; ADR 0022; ADR 0024; ADR 0009 Amendment 2
- **Design:** `docs/audit/trace-knowledge-pipeline-design.md` (§3, §5, §10, §13)
- **Review trigger:** before any task type is assigned to a model tier other than T0 or T1; before a provider other than DeepSeek or a local runtime is used; if the measured deterministic share falls below the targets in §2.6

## 1. Context

TRACE aims to run about 50 news stories and 20 owner-captured social posts a day, with roughly 20–30 minutes of owner decisions. KNOWLEDGE-10 found 0 of 417 Production assertions Ask-eligible: publishing stories does not create governed knowledge.

The questions TRACE most wants to answer depend on exact, versioned, machine-readable facts:
- which models run on given hardware;
- the latest GGUF builds;
- runtime support.

Hugging Face metadata, GGUF headers, GitHub releases and official model cards publish those facts directly. Extracting them with a language model would add cost, non-determinism and a new trust surface for no gain.

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
10. Each extraction run records adapter, parser, input and output hashes in the extraction-run ledger. Re-running a recorded input with the same versions must produce **byte-identical output**; otherwise submission is blocked.
11. **Untrusted binary inputs** (GGUF headers) are parsed by a bounded parser with explicit limits. Embedded templates are never executed or rendered.

### 2.4 Models never ingest

12. RAG and language models are used for **answering** over governed facts (Ask TRACE, deterministic-first) and for **drafting** prose a human approves.
13. In ingestion, a model's only permitted role is a span-verified mapping proposal (rule 9).
14. **No model output sets or advances any governance axis:** admission, reviewer state, freshness, provenance group or evidence class.
15. A model may add `reviewer_required`; it may never remove it.

### 2.5 Model tiering

16. Tiers:
    - **T0** deterministic code;
    - **T1** a low-cost API through the ADR 0008 gateway (today DeepSeek `deepseek-flash`, subject to the G-1 configuration change);
    - **T2** optional free or flat-rate tiers;
    - **T3** local models through an OpenAI-compatible local server described by ADR 0019 runtime records.
17. **Each task type is assigned exactly one tier by configuration.** There is no runtime fallback between tiers or providers (ADR 0008 §2.1.5; ADR 0012 #3). An unavailable tier fails visibly.
18. **T2 is excluded from the TRACE pipeline** until a separate decision finds a provider whose terms explicitly allow automated batch use with contractually fixed retention. (OpenCode Go, checked 25 October 2026, is intended for coding-agent traffic and has per-model, monthly-renewed retention terms.)
19. T3 on the owner's current CPU-only machine is limited to overnight, non-urgent second-opinion tasks. A future workstation becomes eligible for drafting only after it matches T1 on recorded validator fixtures.
20. Models receive **public material only**. They have no tools and no URL access.

### 2.6 Targets and measurement

21. **Targets:**
    - at least 90 % of pipeline operations are deterministic;
    - at least 75 % of extracted fields come from deterministic extractors;
    - at most about 90 model calls a day at target volume.

    All three are measured from the run ledger and the gateway usage ledger.

### 2.7 Where work runs

22. Acquisition runs on the workstation, manually or by a workstation timer, and submits proposals through the importer route. The Worker re-reads every value that system admission relies on (ADR 0024).
23. **No Cloudflare Cron** is introduced by this decision. STOP-BURN and the scheduler 0072 track are unchanged.

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
