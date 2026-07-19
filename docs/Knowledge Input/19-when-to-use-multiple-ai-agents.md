---
canonical_question: "When should a system use multiple AI agents instead of one agent?"
section: ai-agents
topics:
  - multi-agent-systems
  - agent-architecture
  - orchestration
knowledge_type: comparison
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

Use multiple agents when a task benefits from **genuinely separate specialisation, parallel work, independent checking, or permission boundaries**.

Keep one agent when the task is sequential, shares one compact context, uses the same tools and authority, or can be expressed more reliably as ordinary code and functions.

Multiple agents are justified when they provide a measurable improvement over a strong single-agent baseline. They are not automatically more intelligent, safe, or autonomous; they add communication cost, duplicated work, coordination failures, and more places for errors to hide.

## Detailed explanation

A multi-agent system contains several model-driven components that can act or reason in separate loops. Useful patterns include:

- a manager delegating bounded subtasks to specialist agents;
- a triage agent handing control to the correct domain specialist;
- parallel research agents exploring independent source areas;
- an executor and an independent reviewer;
- agents separated by tenant, tool, or security authority;
- different models assigned to planning, execution, or verification.

Multi-agent architecture is most valuable when tasks can be decomposed cleanly. For example, a research question may have independent legal, technical, and market workstreams that can run in parallel. A central synthesiser can compare their evidence after each specialist returns a structured result.

It is less useful when every subagent needs the full conversation and repository state. Repeatedly transferring large context increases token cost and creates inconsistent interpretations. A single agent with well-designed tools may retain coherence better.

Before adding agents, ask whether the problem can be solved with:

1. a deterministic workflow;
2. a function or ordinary software component;
3. retrieval of the correct information;
4. a single agent with a smaller tool set;
5. a stronger model;
6. better evaluation and error handling.

Multi-agent systems introduce failure modes:

- ambiguous ownership;
- circular delegation;
- duplicated searches or edits;
- inconsistent assumptions;
- loss of qualifications during summarisation;
- subagent outputs treated as facts without evidence;
- excessive context transfer;
- uncontrolled cost and latency;
- shared credentials across agents;
- guardrails applied only at the outer boundary.

Anthropic's production research system uses parallel agents because web research has open-ended independent search paths, but the company also reports that coordination, evaluation, reliability, and prompt design became major engineering challenges.

OpenAI reports that parallel GPT-5.6 agents improved the score-latency frontier on selected research, security, and terminal evaluations. That supports multi-agent execution for some difficult decomposable tasks, not as a universal architecture.

The decision should be based on an evaluation comparing:

- task success;
- cost and latency;
- evidence coverage;
- duplication;
- human correction;
- failure recovery;
- security and permission complexity.

## Evidence

- [OpenAI Agents SDK — Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/) — describes manager, handoff, code-driven, sequential, evaluator, and parallel orchestration patterns.
- [OpenAI Agents SDK — Agents](https://openai.github.io/openai-agents-python/agents/) — distinguishes a manager retaining control from a handoff in which a specialist takes over.
- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — describes a production parallel-research architecture and its coordination, evaluation, and reliability challenges.
- [Google — Agent Development Kit](https://developers.googleblog.com/agent-development-kit-easy-to-build-multi-agent-applications/) — presents a code-first framework for controlled multi-agent systems.
- [OpenAI — GPT-5.6](https://openai.com/index/gpt-5-6/) — reports improvements from parallel-agent configurations on selected browsing, security, and terminal evaluations.
