---
canonical_question: "What is an AI agent, and when should one be used?"
section: ai-agents
topics:
  - ai-agents
  - agent-architecture
  - automation
knowledge_type: definition
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

An **AI agent** is a system in which a model is given a goal, instructions, access to tools or data, and a loop that lets it observe results and choose further actions until it finishes, stops, fails, or asks for help.

Use an agent when the work requires judgement across several steps, such as searching, interpreting unstructured information, selecting tools, recovering from failures, or deciding what to do next.

Do not use an agent when ordinary software can perform the task more predictably. Fixed business rules, database transactions, scheduled jobs, calculations, and well-defined API sequences are usually better implemented as deterministic code. The strongest systems combine deterministic software with model-driven decisions only where flexibility is genuinely useful.

## Detailed explanation

A model response is not automatically an agent. A basic language-model application receives input and produces output. An agent adds an execution loop and capabilities that allow the system to affect or inspect an environment.

A practical agent normally contains:

1. **A goal or trigger** — the task to be completed.
2. **Instructions** — role, constraints, priorities, and stopping rules.
3. **A model** — the component that interprets the situation and selects the next step.
4. **Tools** — controlled capabilities such as search, retrieval, code execution, database access, or messaging.
5. **State** — the conversation, plan, tool results, approvals, and durable task identifiers.
6. **An agent loop** — repeated model decisions, tool calls, observations, and revisions.
7. **Guardrails and policy** — controls around permitted inputs, outputs, tools, data, and authority.
8. **A completion boundary** — success criteria, maximum turns, budget limits, escalation, or human review.

OpenAI's practical agent guide describes the agent loop as central: the model chooses an action, the environment returns a result, and the process continues until an exit condition is reached. The Agents SDK similarly defines an agent as a model configured with instructions, tools, and optional behaviours such as handoffs, guardrails, and structured output.

Agents are useful for work where rigid rules become brittle. Examples include:

- researching a question across several sources;
- triaging customer requests written in natural language;
- investigating a software failure;
- reconciling records from inconsistent documents;
- coordinating a multi-step coding task;
- preparing a draft that depends on retrieved private information;
- operating a user interface for a system without a suitable API.

An agent is usually the wrong choice when:

- the steps and branches are already known;
- the output must be mathematically exact;
- a database constraint or business rule can enforce the requirement;
- failure could cause immediate irreversible harm;
- the task is a single retrieval or transformation;
- latency and cost must be tightly predictable;
- the system lacks meaningful evaluation data.

Agentic behaviour increases the number of possible execution paths. That flexibility creates additional failure modes: incorrect tool selection, invalid arguments, repeated loops, prompt injection, uncontrolled cost, stale state, and actions taken with excessive authority.

The recommended architecture is therefore **deterministic orchestration around bounded model decisions**. Code should enforce identity, permissions, schemas, financial limits, approval boundaries, timeouts, retries, and final validation. The model should decide only the parts that genuinely benefit from semantic interpretation or adaptable planning.

An agent should be judged by reliable completion of the whole task under realistic constraints—not by how human-like or autonomous its conversation appears.

## Evidence

- [OpenAI — A practical guide to building AI agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) — defines agents, the agent loop, suitable use cases, tools, instructions, and guardrails.
- [OpenAI Agents SDK — Agents](https://openai.github.io/openai-agents-python/agents/) — defines an agent as a model configured with instructions, tools, and optional runtime behaviours.
- [OpenAI — Workspace agents](https://openai.com/academy/workspace-agents/) — describes agents as reusable task systems with triggers, processes, skills, and connected tools.
- [NIST — Building evaluation probes into agentic AI](https://www.nist.gov/programs-projects/building-evaluation-probes-agentic-ai) — describes agents as systems capable of planning multi-step tasks and taking actions through tools.
- [OpenAI — New tools for building agents](https://openai.com/index/new-tools-for-building-agents/) — establishes the Responses API, tool use, tracing, and guardrails as components of agentic applications.
