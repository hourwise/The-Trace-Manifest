# Models & Benchmarks — Implementation Plan

**Date:** 20 July 2026  
**ADR:** 0010 (Curated Products and Governed Publication)  
**Status:** Job 1 complete. Jobs 2-3 pending.

## Job 1 — Populate initial reviewed catalogue ✅

Create manual curated entries for models and benchmarks using official sources.

### Models (19 entries)

- [x] GPT-5.6 Sol (OpenAI)
- [x] GPT-5.6 Flash (OpenAI)
- [x] GPT-5.5 Sol (OpenAI — superseded)
- [x] Codex GPT-5.6 (OpenAI)
- [x] Claude Fable 5 (Anthropic)
- [x] Claude Mythos 5 (Anthropic)
- [x] Gemini 3.5 Flash (Google DeepMind)
- [x] Gemini 2.5 Pro (Google DeepMind)
- [x] Gemini 2.5 Flash (Google DeepMind)
- [x] Llama 4 405B (Meta AI)
- [x] Llama 3.3 70B (Meta AI)
- [x] Mistral Large 3 (Mistral AI)
- [x] Mistral Small 3 (Mistral AI)
- [x] DeepSeek V3 (DeepSeek)
- [x] DeepSeek R1 (DeepSeek)
- [x] Qwen3.8 (Alibaba Qwen)
- [x] GLM-5.2 (Z.AI)
- [x] Grok-4 (xAI)
- [x] Command R+ (Cohere)

### Benchmarks (10 entries)

- [x] SWE-bench Verified
- [x] LMSYS Chatbot Arena
- [x] LiveBench
- [x] MLPerf Inference
- [x] Stanford HELM
- [x] Artificial Analysis Intelligence Index
- [x] MMLU-Pro
- [x] GPQA Diamond
- [x] HumanEval+
- [x] ARC-AGI-2

### Providers (10 entries)

- [x] OpenAI
- [x] Anthropic
- [x] Google DeepMind
- [x] Meta AI
- [x] Mistral AI
- [x] DeepSeek
- [x] Alibaba (Qwen)
- [x] Z.AI (GLM)
- [x] xAI
- [x] Cohere

### Provider-Model pricing

- [x] Approximate pricing populated for API-available models (input/output per 1M tokens)

---

## Job 2 — Repair highest-value source adapters ⏸️

Implement or repair connectors so feed items can link to model/benchmark records as update suggestions.

### Batch A: Official model sources

- [ ] OpenAI Model Documentation — `manual` → needs connector (RSS exists at `https://openai.com/news/rss.xml`)
- [ ] OpenAI API Changelog — `manual` → needs page_diff connector
- [ ] Anthropic Newsroom — `page_diff` (selector exists from SOURCE-07, health reset to unknown)
- [ ] Anthropic API Release Notes — `page_diff` (selector exists from SOURCE-07, health reset to unknown)
- [ ] Gemini API Release Notes — `manual` → needs page_diff or RSS
- [ ] Mistral News — `rss` (feed URL fixed in migration-0026, pending verification)
- [ ] Cohere Blog — `rss` (feed URL fixed in migration-0026, pending verification)
- [ ] Meta AI Blog — `rss` (feed URL fixed in migration-0026, pending verification)
- [ ] xAI Blog — `rss` (feed URL fixed in migration-0026, pending verification)
- [ ] Z.AI Blog — `rss` (pending implementation)

### Batch B: Open-model discovery

- [ ] Hugging Face Trending Models — `manual` → needs custom API connector
- [ ] GitHub Releases — already working (16 repos via `github_api`)
- [ ] Hugging Face Blog — `rss` (healthy)

### Batch C: Benchmark sources

- [ ] Artificial Analysis — `manual` → needs custom connector (high-value, collates model data)
- [ ] LMSYS Chatbot Arena — `manual` → needs custom connector (currently `disabled`)
- [ ] LiveBench — `manual` → needs custom connector
- [ ] SWE-bench — `manual` → needs GitHub connector
- [ ] MLCommons — `manual` → needs custom connector
- [ ] Stanford HELM — `manual` → needs custom connector
- [ ] Epoch AI — `manual` → needs custom connector

---

## Job 3 — Connect feed updates to catalogue records ⏸️

Build the linkage between feed items and model/benchmark records so that:

1. Automated sources discover relevant updates
2. TRACE links the article/release note/paper to the catalogue record
3. The system proposes changed fields (context window, pricing, status)
4. Editor approves the update

### Required work

- [ ] Entity extraction from feed item titles (model names, version numbers, benchmark names)
- [ ] Match extracted entities to `models.slug` and `benchmarks.slug`
- [ ] Create `catalogue_updates` table for proposed changes
- [ ] Review queue for catalogue update proposals
- [ ] Update `model_versions` and `benchmark_runs` from confirmed updates
- [ ] Preserve version history — never silently overwrite

### Target sequence (do one source family at a time)

- [ ] Family 1: OpenAI (docs, changelog, news RSS)
- [ ] Family 2: Anthropic (newsroom, API releases)
- [ ] Family 3: Google (Gemini releases, blog)
- [ ] Family 4: Mistral + Cohere (news, blog)
- [ ] Family 5: Open-model (GitHub releases → model records)
- [ ] Family 6: Benchmarks (Artificial Analysis, LMSYS, LiveBench)

---

## Remaining manual sources (lower priority)

These 25 sources are `manual` or have no RSS feed. They'll need page_diff connectors or stay manual:

| Source | Tier | Priority |
|---|---|---|
| AWS AI/ML What's New | A | Low — AWS blog RSS covers this |
| NIST CSRC Glossary | A | Low — static reference |
| NIST NCCoE AI | A | Low — static reference |
| Hugging Face Trending Models | A | Medium — needs API |
| IBM Research AI | A | Low |
| AI21 Labs Blog | B | Low |
| Artificial Analysis | B | High — Job 2 Batch C |
| Epoch AI | B | High — Job 2 Batch C |
| LMSYS Chatbot Arena | B | High — Job 2 Batch C |
| LiveBench | B | High — Job 2 Batch C |
| MLCommons | B | High — Job 2 Batch C |
| SWE-bench | B | High — Job 2 Batch C |
| Stanford HELM | B | High — Job 2 Batch C |
| Microsoft Azure AI Docs | B | Low — static docs |
| MCP Docs | B | Low — static docs |
| OpenAI Agents SDK Docs | B | Low — static docs |
| Reddit r/LocalLLaMA | C | Low — social |
| Reddit r/MachineLearning | C | Low — social |
| MarkTechPost | C | Medium — page_diff |
| Product Hunt | C | Low |

---

## Definition of done

- [x] Models page shows 19 reviewed model records
- [x] Benchmarks page shows 10 reviewed benchmark records
- [x] Providers directory populated with 10 providers
- [x] Approximate pricing populated for API models
- [x] All records have `publication_status = 'published'` with reviewer attribution
- [ ] At least 5 highest-value source connectors repaired (Job 2 Batch A)
- [ ] Feed-to-catalogue linkage built for at least one source family (Job 3)
- [ ] Catalogue update proposal queue functional
