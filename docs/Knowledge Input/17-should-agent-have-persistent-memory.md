---
canonical_question: "Should an AI agent have persistent memory?"
section: ai-agents
topics:
  - agent-memory
  - long-term-memory
  - privacy
  - provenance
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

An AI agent should have persistent memory **only when remembering across sessions creates clear user value and the memory can be governed**.

Persistent memory is useful for stable preferences, project decisions, recurring workflows, validated lessons, and durable task state. It should not become an indiscriminate archive of every conversation, tool result, assumption, or model-generated conclusion.

A trustworthy memory system needs:

- explicit scope by user, organisation, project, and agent;
- provenance and observation time;
- confidence and validation status;
- expiry, correction, and deletion;
- access control and encryption;
- retrieval only when relevant;
- conflict and staleness handling;
- separation between factual records and model-generated summaries;
- user visibility and control.

## Detailed explanation

Several different mechanisms are often called “memory”:

1. **Conversation history** — messages and tool calls within one thread.
2. **Working state** — the current plan, pending approvals, intermediate results, and identifiers.
3. **Long-term memory** — selected information reused across threads or future runs.
4. **External knowledge** — documents and databases retrieved through RAG.
5. **Learned model behaviour** — information encoded through model training or fine-tuning.

These mechanisms have different retention, privacy, and correctness requirements.

OpenAI's Agents SDK sessions store conversation history for a specific session. Its sandbox-agent memory is different: it distils lessons from previous runs into files so later runs can avoid repeated exploration. LangGraph similarly distinguishes short-term thread state from long-term memory stored in user- or application-scoped namespaces.

Persistent memory can improve efficiency and continuity. It may remember that a repository uses a particular test command, that a user prefers British English, or that a previous migration failed for a documented reason.

It can also amplify mistakes. Research on agent memory finds that agents often follow retrieved experiences closely. Incorrect, obsolete, or poorly matched memories can therefore cause error propagation and misaligned replay. Unbounded memory growth also increases storage, retrieval, privacy, and context costs.

A good admission policy asks:

- Is this information likely to be useful again?
- Is it sufficiently supported by evidence?
- Is it a fact, preference, decision, hypothesis, or generated lesson?
- Who owns it and who may retrieve it?
- What is its valid time range?
- Can it conflict with a newer record?
- Does the user expect it to be remembered?
- Is storage lawful and proportionate?
- Can it be corrected or deleted?

The memory record should preserve the original source or event reference. A generated summary is a derived artefact and should not silently replace the underlying evidence. When memory changes behaviour, the system should be able to show which record was retrieved.

Not every agent needs write access to long-term memory. Short-lived specialists, checkers, and untrusted subagents may be read-only or have no memory access. Proposed memories can also enter a staging area and require validation before promotion.

## Evidence

- [OpenAI Agents SDK — Sessions](https://openai.github.io/openai-agents-python/sessions/) — distinguishes persistent session conversation history and documents storage, compaction, encryption, and clearing.
- [OpenAI Agents SDK — Agent memory](https://openai.github.io/openai-agents-python/sandbox/memory/) — distinguishes learned cross-run memory from conversation sessions and supports separate read and generate permissions.
- [LangGraph — Memory overview](https://docs.langchain.com/oss/python/concepts/memory) — distinguishes thread-scoped short-term memory from cross-session long-term memory and describes semantic, episodic, and procedural memory.
- [How Memory Management Impacts LLM Agents](https://arxiv.org/abs/2505.16067) — reports error propagation and misaligned experience replay from naive memory growth and benefits from selective addition and deletion.
- [Agent Memory: Characterization and System Implications](https://arxiv.org/abs/2606.06448) — provides a systems taxonomy and identifies cost, freshness, construction, retrieval, and fleet-scale trade-offs.
