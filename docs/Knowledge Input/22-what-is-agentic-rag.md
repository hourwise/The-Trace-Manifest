---
canonical_question: "What is agentic RAG, and how is it different from ordinary RAG?"
section: ai-agents
topics:
  - agentic-rag
  - rag
  - retrieval
  - knowledge-systems
knowledge_type: comparison
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**Ordinary retrieval-augmented generation (RAG)** usually follows a predefined pipeline: receive a query, search one or more indexes, retrieve a fixed number of passages, place them in the prompt, and generate an answer.

**Agentic RAG** gives an agent control over retrieval. The agent can decide whether retrieval is needed, reformulate the question, choose among sources or indexes, issue several searches, inspect intermediate results, follow references, resolve conflicts, and stop when it has sufficient evidence.

Use ordinary RAG for predictable, high-volume questions over a well-structured knowledge base. Use agentic RAG for ambiguous, multi-part, cross-source, or investigative questions where one search is unlikely to be enough.

## Detailed explanation

RAG grounds a model in information retrieved at request time. It is valuable because the knowledge can be current, private, permission-controlled, and linked back to evidence rather than memorised in model weights.

A conventional RAG pipeline commonly performs these steps:

1. convert the user's request into a search query;
2. search an index;
3. select the top-ranked chunks;
4. add the chunks to the model context;
5. generate an answer;
6. attach the retrieved sources.

The application designer chooses the search strategy, indexes, number of results, filters, and sequence in advance. This simplicity improves latency, predictability, cost control, and reproducibility.

Agentic RAG treats retrieval as one or more tools inside an agent loop. The agent may:

- decompose a broad question into subquestions;
- search different collections for different aspects;
- switch between semantic, keyword, graph, database, and web retrieval;
- inspect whether a source is current and authoritative;
- retrieve a full document after finding a relevant chunk;
- search for contradictory evidence;
- repeat retrieval when evidence is incomplete;
- ask a clarifying question;
- abstain when the available sources do not support an answer.

Microsoft's architecture guidance describes this distinction directly: standard RAG follows a fixed orchestrated sequence, while agentic RAG lets an agent invoke retrieval on demand, evaluate intermediate results, and iterate across heterogeneous data sources.

Agentic RAG can improve difficult answers, but it introduces new risks:

- more searches, tokens, and latency;
- loops that fail to converge;
- inconsistent search strategies between runs;
- retrieval from an unauthorised source;
- prompt injection in retrieved documents;
- source duplication mistaken for corroboration;
- the model stopping too early or continuing wastefully;
- harder evaluation and debugging.

A robust agentic RAG system needs:

1. **Source routing rules** — which index is appropriate for which data.
2. **Access control** — permission checks before retrieval, not merely before display.
3. **Freshness metadata** — valid dates, versions, and superseded records.
4. **Provenance** — source identity and claim-level evidence links.
5. **Budgets** — maximum searches, tokens, time, and tool calls.
6. **Stopping criteria** — sufficient evidence, unresolved conflict, or escalation.
7. **Injection defences** — retrieved content is evidence, not trusted instruction.
8. **Evaluation** — retrieval recall, citation correctness, completeness, and answer quality.
9. **Observability** — queries, results, filters, reranking, and final evidence set.
10. **Fallback** — ordinary retrieval or human review when the agent cannot resolve the question.

For TRACE, agentic RAG would be useful when a user asks a broad or comparative question that spans knowledge entries, recent stories, source documents, and live web evidence. A simple canonical question with one authoritative entry may be better served by deterministic retrieval.

## Evidence

- [Microsoft Azure Architecture Center — Develop an agentic RAG solution](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-agentic) — distinguishes fixed RAG pipelines from agent-controlled iterative retrieval.
- [Microsoft Learn — Retrieval-augmented generation and indexes](https://learn.microsoft.com/en-us/azure/foundry/concepts/retrieval-augmented-generation?view=foundry-classic) — explains RAG for private, current, and grounded information.
- [Google Cloud — Vertex AI RAG Engine](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-overview) — documents ingestion, retrieval, grounding, and managed RAG components.
- [OpenAI — File search](https://platform.openai.com/docs/guides/tools-file-search) — documents model-driven retrieval from vector stores using semantic and keyword search.
- [NIST — Building evaluation probes into agentic AI](https://www.nist.gov/programs-projects/building-evaluation-probes-agentic-ai) — identifies grounding, citation correctness, completeness, and source-supported claims as agent-evaluation concerns.
