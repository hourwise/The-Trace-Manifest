# Source Registry

**Status:** Launch draft  
**Date:** 12 July 2026  
**Source count:** ~65 sources across three operational tiers

## Launch discovery expansion (ADR 0015)

After `migration-0015-editorial-desk.sql` is applied, TRACE may activate Google AI Blog (A/60 minutes), The Verge AI (B/60 minutes), MarkTechPost (C/120 minutes), ByteByteGo (B/12 hours), Product Hunt (C/6 hours), The Pragmatic Engineer (B/12 hours), Stratechery (B/12 hours), and MCP Radar (C/daily). Each has a concrete feed endpoint in the migration; the existing Worker parser must mark it healthy before it is relied on. Import AI is recorded but remains inactive until its restricted endpoint passes the same verification.

**16 July 2026 verification:** the eight active launch feeds were parsed through the production RSS/Atom parser against their live endpoints and recorded as `healthy` in `trace-manifest-db-preview`. The Verge AI and Product Hunt required Atom `<entry>` support, which is now covered by a parser fixture and deployed to the Worker. Import AI remains disabled. See [`docs/audit/desk-03-discovery-feed-health-evidence.md`](../audit/desk-03-discovery-feed-health-evidence.md).

All of these records are discovery or context inputs, never automatic publication authority. Citation lineage is mandatory: an official announcement, reporting on it, and derivative newsletters or product listings cannot be counted as separate corroboration.

Phase 2 should not begin with 100 equally weighted feeds. The launch registry is divided into three tiers:

- **Tier A:** Poll frequently; eligible for automatic ingestion
- **Tier B:** Poll daily; usually needs classification or review
- **Tier C:** Discovery signals only; never treated as factual evidence without a primary source

The first registry favours official sources, research repositories, and dependable APIs.

### Connector admission status (SOURCE-06)

As at 18 July 2026, Anthropic Newsroom and Research, Google Developers AI and Cloud AI, Meta AI Blog and Research, Mistral, Cohere, Stability AI, IBM Research AI, xAI, Groq, AI21, and MarkTechPost have no RSS or Atom endpoint that currently passes the production Worker parser. They remain source records, but are classified as `page_diff` and displayed as **unsupported** until a safe page-diff connector exists. They must not produce recurring RSS failure jobs and they cannot be treated as ingested evidence in the meantime. MarkTechPost's previously recorded `/feed/` endpoint now serves `text/html` to the Worker; this is a current endpoint change, not a parser exception.

---

## Section A — Official Model Providers and Product Sources

These form the backbone of the feed.

| # | Source | What to ingest | Cadence | Treatment |
| -: | --- | --- | --- | --- |
| 1 | OpenAI News | Product, model, safety and company announcements | 1 hour | Vendor-reported |
| 2 | OpenAI API changelog/docs | Model availability, deprecations, pricing and API changes | 3 hours | Primary technical |
| 3 | OpenAI model documentation | Context, pricing, capabilities and limits | Daily change check | Primary technical |
| 4 | Anthropic Newsroom | Claude releases, policy and company announcements | 1 hour | Vendor-reported |
| 5 | Anthropic Research | Alignment, interpretability and safety research | 6 hours | Primary research |
| 6 | Anthropic API release notes | API and model changes | 3 hours | Primary technical |
| 7 | Google DeepMind Blog | Models, research and technical releases | 2 hours | Primary/vendor |
| 8 | Google Research Blog | Research publications | 6 hours | Primary research |
| 9 | Google Developers AI | Gemini, Gemma, agents and developer tooling | 2 hours | Primary technical |
| 10 | Google Cloud AI Blog | Vertex AI, provider and enterprise changes | 3 hours | Primary/vendor |
| 11 | Gemini API release notes | Model/API changes and deprecations | 3 hours | Primary technical |
| 12 | Meta AI Blog | Model, research and product announcements | 2 hours | Vendor-reported |
| 13 | Meta AI Research | Papers, datasets and research artefacts | 6 hours | Primary research |
| 14 | Microsoft AI Blog | Copilot, models and company AI announcements | 3 hours | Vendor-reported |
| 15 | Azure Blog | Azure AI/Foundry, platform and technical updates; classification keeps only the relevant material | 3 hours | Primary technical |
| 16 | GitHub Blog — AI and Copilot | Copilot and developer-platform changes | 3 hours | Primary/vendor |
| 17 | Mistral News | Models, Le Chat, Vibe and platform releases | 1–2 hours | Vendor-reported |
| 18 | Mistral documentation/changelog | API, model and pricing changes | 3 hours | Primary technical |
| 19 | Cohere Blog | Models, enterprise AI and research | 3 hours | Vendor-reported |
| 20 | Cohere documentation | Models, endpoints and pricing changes | Daily | Primary technical |
| 21 | NVIDIA Technical Blog — Generative AI | Inference, hardware, agents and model optimisation | 3 hours | Primary/vendor |
| 22 | NVIDIA Deep Learning Blog | Product and ecosystem deep-learning announcements | 3 hours | Vendor-reported |
| 23 | Hugging Face Blog | Models, libraries, leaderboards and research | 2 hours | Mixed primary |
| 24 | Hugging Face model trending feed | Fast-moving open-weight releases | 1–3 hours | Discovery until verified |
| 25 | AWS Machine Learning Blog | Bedrock, models and deployment tooling | 3 hours | Primary/vendor |
| 26 | AWS "What's New" for AI/ML | Bedrock model and service changes | 3 hours | Primary technical |
| 27 | Apple Machine Learning Research | Apple models and research | 12 hours | Primary research |
| 28 | IBM Research AI | Research and enterprise AI | 12 hours | Primary research |
| 29 | Databricks Release Notes | Official platform, model, data and integration release notes | 6 hours | Primary technical |
| 30 | Stability AI News | Image, audio and open-model releases | 3 hours | Vendor-reported |

---

## Section B — Chinese and Other Open-Weight Ecosystems

These are important, but ingestion may require GitHub releases, Hugging Face organisation feeds, or page-diff monitoring rather than dependable RSS.

| # | Source | Preferred ingestion |
| -: | --- | --- |
| 31 | DeepSeek V3 GitHub releases | Official DeepSeek V3 releases only; organisation-wide repository activity needs a future connector |
| 32 | DeepSeek Hugging Face organisation | New and updated model cards |
| 33 | Qwen Code GitHub releases | Official Qwen Code releases and changelogs; model-card coverage remains with the Qwen Hugging Face source |
| 34 | Qwen Hugging Face organisation | Models and model cards |
| 35 | Alibaba Cloud Qwen announcements | Official release posts |
| 36 | Zhipu AI/GLM GitHub | Releases |
| 37 | GLM Hugging Face organisation | Models and model cards |
| 38 | Moonshot AI/Kimi official announcements | Page-diff/manual review |
| 39 | MiniMax official announcements | Page-diff/manual review |
| 40 | Baidu PaddlePaddle/PaddleNLP releases | GitHub releases |
| 41 | ModelScope updates | Selected model releases |
| 42 | AI21 Labs Blog | Models and platform updates |

**Policy:** Do not automatically label these as less reliable because of origin. Apply the same distinction used for Western providers: official product claim, reproducible artefact, independent evaluation, community experience.

---

## Section C — Research and Benchmark Sources

These are the main counterweight to vendor marketing.

| # | Source | Role | Cadence |
| -: | --- | --- | --- |
| 43 | arXiv `cs.AI` | General AI research | 6 hours |
| 44 | arXiv `cs.CL` | Language models and NLP | 6 hours |
| 45 | arXiv `cs.LG` | Machine learning | 6 hours |
| 46 | arXiv `cs.CV` | Vision and multimodal research | 12 hours |
| 47 | arXiv `cs.SE` | Coding agents and software engineering | 12 hours |
| 48 | arXiv `stat.ML` | Statistical ML | 12 hours |
| 49 | MLCommons | Standardised benchmark releases | Daily |
| 50 | Epoch AI Benchmarks | Capability and benchmark datasets | Daily |
| 51 | Epoch AI Model Database | Model history and metadata | Daily |
| 52 | Artificial Analysis | Model quality, speed and price comparisons | Daily/API terms permitting |
| 53 | LMSYS / Chatbot Arena | Human-preference evaluation | Daily |
| 54 | Stanford HELM | Holistic evaluations | Daily or release-based |
| 55 | Stanford AI Index | Annual and periodic ecosystem data | Weekly |
| 56 | SWE-bench | Software-engineering benchmark results | Daily |
| 57 | LiveBench | Contamination-resistant evaluation updates | Daily |
| 58 | Aider Polyglot Leaderboard | Practical coding-model results | Daily |
| 59 | Berkeley Function-Calling Leaderboard | Tool and function calling | Daily |
| 60 | BigCodeBench | Code-generation evaluation | Daily |
| 61 | OpenCompass | Multi-model evaluation | Daily |
| 62 | Hugging Face Open LLM Leaderboard | Open-model comparisons | Daily |
| 63 | METR | Frontier-model autonomy and risk evaluations | Daily |
| 64 | ARC Prize | Generalisation/reasoning progress | Daily |
| 65 | MLPerf inference and training results | Hardware and serving performance | Release-based |

### Research ingestion rule

Do **not** deeply analyse every arXiv paper. Initial filters should look for:

- References to named current models
- New benchmark or dataset
- Independent replication
- Security vulnerability
- Major efficiency improvement
- Agent, memory or coding relevance
- Public code or data
- Strong citation or community signal
- Direct contradiction of a significant claim

**Target:** ingest metadata for ~100–500 relevant papers daily, lightweight-classify them, deeply analyse only 3–10, promote 1–3 into a briefing.

---

## Section D — GitHub Release and Project Radar

Use GitHub's API rather than scraping repository pages. Store all repos under one **GitHub connector** with one source-policy record and separate repository subscriptions.

### Local inference and serving

1. `ggml-org/llama.cpp`
2. `ollama/ollama`
3. `vllm-project/vllm`
4. `huggingface/text-generation-inference`
5. `sgl-project/sglang`
6. `ml-explore/mlx`
7. `ml-explore/mlx-lm`
8. `open-webui/open-webui`
9. `ggerganov/whisper.cpp`

### Model and training ecosystems

10. `huggingface/transformers`
11. `huggingface/peft`
12. `huggingface/trl`
13. `EleutherAI/lm-evaluation-harness`
14. `axolotl-ai-cloud/axolotl`
15. `unslothai/unsloth`

### Agents, orchestration and retrieval

16. `langchain-ai/langchain`
17. `run-llama/llama_index`
18. `microsoft/autogen`
19. `microsoft/semantic-kernel`
20. `crewAIInc/crewAI`
21. `stanfordnlp/dspy`
22. `BerriAI/litellm`
23. `openai/openai-agents-python`
24. `openai/openai-agents-js`
25. `modelcontextprotocol/specification`
26. `modelcontextprotocol/servers`

### Evaluation and observability

27. `langfuse/langfuse`
28. `promptfoo/promptfoo`
29. `openai/evals`
30. `UKGovernmentBEIS/inspect_ai`
31. `confident-ai/deepeval`
32. `explodinggradients/ragas`

### GitHub radar ingestion

- New release
- Release notes
- Tag
- Security advisory
- Repository archived/unarchived status
- Licence-file change
- Default-branch change
- Major activity anomaly

Do **not** publish "repository gained 2,000 stars" as a quality judgement. It is a popularity signal only.

---

## Section E — Regulation, Governance and Security

These sources need a higher standard of handling because legal and security statements can be consequential.

| Source | Coverage | Cadence |
| --- | --- | --- |
| UK AI Security Institute | Evaluations, frontier risk and safety research | 6 hours |
| GOV.UK AI publications | UK policy and official guidance | 6 hours |
| UK NCSC | AI-related cybersecurity guidance and alerts | 3 hours |
| ICO AI guidance | Data protection, automated decisions and privacy | Daily |
| EU AI Office | AI Act implementation and guidance | 6 hours |
| European Commission AI pages | Codes, implementation and consultations | 6 hours |
| EUR-Lex AI Act documents | Authoritative legislation | Daily/change |
| ENISA AI security | European cybersecurity guidance | Daily |
| NIST AI Resource Center | AI RMF, evaluations and standards | Daily |
| NIST vulnerability publications | AI security and standards developments | Daily |
| CISA alerts | AI-related exploitation and software security | 1–3 hours |
| OWASP GenAI Security Project | LLM and agent security guidance | Daily |
| MITRE ATLAS | AI attack techniques and mitigations | Daily |
| UK Parliament committees | Relevant reports and inquiries | Daily |
| US Federal Register AI notices | Regulatory changes | Daily |

### Legal material handling

- Ingest the primary document
- Do not let the model state that a law "requires" something based only on a news article
- Attach jurisdiction and effective date
- Distinguish enacted law, guidance, consultation and proposal
- Require human review before publishing practical compliance conclusions

---

## Section F — Specialist Publications and Community Signals

These provide interpretation and early discovery, but should not be scored like primary evidence.

### Specialist editorial sources

Ars Technica AI, MIT Technology Review AI, IEEE Spectrum AI, The Register AI/ML, TechCrunch AI, VentureBeat AI, Semafor technology/AI, Financial Times AI coverage, Reuters technology/AI, Associated Press AI coverage, The Decoder, Latent Space, Simon Willison's Weblog, Interconnects, Import AI, The Batch, One Useful Thing, Stratechery AI analysis, Ahead of AI, Last Week in AI.

Used for: context, interviews, independent reporting, industry reaction, discovery of primary material.

They should **not** automatically corroborate one another when they all repeat the same press release.

### Community and social discovery

1. Hacker News official API (safest automated community source)
2. Lobsters RSS
3. GitHub Discussions from selected projects
4. Hugging Face community posts
5. Manually submitted Reddit links
6. Manually submitted Bluesky/Mastodon links
7. Selected YouTube channels and podcasts
8. User-submitted tips

Social posts are discovery signals, not proof. A reviewer must record provenance and create a separately evaluated source candidate for each linked article, paper, official document, repository, release or advisory that may enter the evidence pipeline. Do not automatically follow every link or use engagement as corroboration. See [ADR 0009](../adr/0009-governed-social-media-signal-intake-linked-source-discovery-and-outbound-linking.md).

### Reddit monitoring (manual only, per Reddit policy)

Monitor but do not scrape:

- `r/LocalLLaMA`
- `r/MachineLearning`
- `r/ArtificialInteligence`
- `r/ClaudeAI`
- `r/OpenAI`
- `r/ChatGPTCoding`
- Relevant vendor or tool subreddits

Store only: link, title, submission date, subreddit, engagement snapshot if permitted, your own summary, primary sources discovered through the discussion. Do not mirror comments or treat Reddit consensus as evidence.

---

## Tiers Summary

| Tier | Count | Description |
| --- | --- | --- |
| Tier A | ~30 | Official provider blogs, API changelogs, GitHub releases — poll frequently, auto-ingest eligible |
| Tier B | ~25 | Research feeds, specialist publications, benchmark sources — poll daily, classify before publish |
| Tier C | ~10+ | Community signals, Reddit, social discovery — manual review only, never auto-published as evidence |

Total: ~65 sources, fitting within the 50–100 estimate in the [ingestion scale](ingestion-scale.md).
