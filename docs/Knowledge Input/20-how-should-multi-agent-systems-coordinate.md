---
canonical_question: "How should multiple AI agents coordinate and delegate work?"
section: ai-agents
topics:
  - multi-agent-systems
  - delegation
  - handoffs
  - orchestration
knowledge_type: guide
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

Multiple agents should coordinate through **explicit contracts and bounded delegation**, not through an unstructured shared conversation.

A reliable delegation should identify:

- the task and expected output;
- the reason the specialist was selected;
- allowed tools and authority;
- relevant input and source references;
- time, token, and retry budgets;
- completion and validation criteria;
- ownership of the final answer or action;
- how errors, uncertainty, and escalation are returned.

Use a **manager pattern** when one agent must retain responsibility and combine several specialist outputs. Use a **handoff** when a selected specialist should take over the interaction. Use deterministic code for steps, routing, or approvals that must be predictable.

## Detailed explanation

OpenAI's Agents SDK describes two primary model-driven patterns.

### Manager or agents-as-tools

A central agent owns the user interaction and invokes specialists as tools. Each specialist receives a bounded task and returns a result to the manager. This pattern is appropriate when:

- one component must own the final answer;
- several specialist results must be combined;
- shared output rules need one enforcement point;
- the specialist should not see or control the entire conversation;
- delegation is a private implementation detail.

### Handoffs

A routing agent transfers control to a specialist that receives the conversation context and becomes the active agent. This pattern is appropriate when:

- the specialist should communicate directly with the user;
- the new role needs a focused instruction set;
- the workflow is primarily routing rather than synthesis;
- continuing through the manager would add unnecessary narration or context.

A handoff should include small structured metadata such as reason, priority, language, or requested capability. The receiving agent should receive only the history and resources it needs. Input filters or summaries can reduce context leakage and token cost.

### Code-driven orchestration

Use code rather than model choice when the flow is known. Examples include:

- classify into a fixed category and route;
- run independent tasks in parallel;
- transform one structured output into the next step's input;
- repeat execution and evaluation until a bounded criterion passes;
- require an approval before a specific tool;
- stop after a maximum number of turns or failures.

### Shared state

Agents should not silently mutate an unversioned shared scratchpad. Use typed, versioned state with explicit ownership. Concurrent agents should produce proposals or isolated artefacts that a coordinator merges. Writes need conflict detection, idempotency, correlation identifiers, and audit records.

### Evidence and output contracts

Subagents should return structured results that separate:

- answer or recommendation;
- evidence and source identifiers;
- assumptions;
- uncertainty;
- actions taken;
- validation performed;
- unresolved questions.

The manager must not treat a confident subagent message as independent evidence. It should verify source references and identify duplicate provenance across agents.

### Authority

Delegation should attenuate or preserve authority, never silently expand it. A subagent receives no more permissions than the task requires. Consequential approvals should surface to the outer run so users can see which specialist and tool requested the action.

### Observability

Every delegation should share a correlation ID and record parent, child, task, inputs, outputs, tools, cost, latency, approvals, failures, and final disposition. This is essential for debugging and evaluation.

## Evidence

- [OpenAI Agents SDK — Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/) — defines manager, handoff, LLM-driven, and code-driven orchestration patterns and their appropriate uses.
- [OpenAI Agents SDK — Handoffs](https://openai.github.io/openai-agents-python/handoffs/) — documents structured handoff metadata, input filtering, history transfer, and specialist delegation.
- [OpenAI Agents SDK — Human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) — shows that nested-agent approvals can surface to and resume from the outer run.
- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — describes manager-led parallel research and lessons about task decomposition, coordination, and synthesis.
- [Google — Agent Development Kit](https://developers.googleblog.com/agent-development-kit-easy-to-build-multi-agent-applications/) — supports code-first, model-flexible multi-agent orchestration with explicit control.
