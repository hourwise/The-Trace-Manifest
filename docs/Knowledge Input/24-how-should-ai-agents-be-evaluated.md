---
canonical_question: "How should an AI agent be evaluated before production use?"
section: ai-agents
topics:
  - agent-evaluation
  - evals
  - observability
  - reliability
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

Evaluate an AI agent as an **end-to-end system**, not only as a language model.

A production evaluation should measure:

- whether the final task was completed correctly;
- correct tool selection and arguments;
- factual grounding and citation accuracy;
- policy, permission, and approval compliance;
- recovery from tool failures and incomplete information;
- resistance to prompt injection and malicious content;
- cost, latency, turns, and retries;
- consistency across repeated runs;
- human review and correction effort;
- harmful side effects and actions the agent should have refused.

Use realistic private tasks, hidden checks, fixed environments, recorded traces, multiple runs, and comparison with a simple baseline. Continue evaluating after deployment with sampled production traces and regression suites.

## Detailed explanation

An agent can produce an impressive final answer while taking an unsafe path. It can also make several harmless mistakes and still reach the correct result. Output-only evaluation therefore misses important information.

A layered evaluation should include:

### 1. Component evaluations

Test individual elements in isolation:

- query classification;
- retrieval recall and ranking;
- structured-output validity;
- tool selection;
- argument generation;
- guardrails;
- permission checks;
- source attribution;
- memory retrieval;
- routing and handoffs.

### 2. End-to-end task evaluations

Give the system realistic tasks and score the final outcome. The environment should include the same tools, permissions, data shape, and constraints expected in production. Hidden tests should detect incomplete or superficially correct results.

### 3. Trace evaluations

Inspect the sequence of model calls, searches, tool calls, errors, approvals, retries, and state transitions. Trace analysis can detect unnecessary loops, benchmark gaming, unsafe shortcuts, suspicious tool use, or accidental success.

NIST has highlighted agent evaluation cheating and recommends clearer benchmark-specific expectations about agent affordances and restrictions. A system may otherwise exploit unintended environment behaviour rather than demonstrate the intended capability.

### 4. Safety and adversarial evaluations

Test prompt injection, misleading tool output, poisoned memory, inaccessible resources, permission boundaries, malicious documents, ambiguous targets, and requests that should require approval or refusal.

### 5. Operational evaluations

Measure:

- p50 and p95 latency;
- total input and output tokens;
- tool and infrastructure cost;
- number of turns and retries;
- timeout and abandonment rate;
- human review time;
- successful-task cost;
- production incident and rollback rate.

### 6. Statistical design

One run is not enough for stochastic systems. Repeat tasks across seeds or independent attempts, report confidence intervals, and avoid claiming meaningful differences from tiny samples. Keep model versions, prompts, tools, and environments recorded.

NIST's AI 800-2 work emphasises validity, transparency, reproducibility, and documented benchmark practice. The evaluation question must match the deployment claim: a coding benchmark does not establish safe customer-service behaviour, and a general knowledge benchmark does not establish reliable tool use.

### 7. Baselines

Compare the agent against:

- a deterministic workflow;
- a single model without tools;
- a simpler agent;
- the existing human process;
- a lower-cost model;
- a human-plus-tool baseline.

An agent should not be deployed merely because it completes some examples. It should demonstrate a measurable advantage under an explicitly defined acceptable-risk threshold.

### 8. Continuous evaluation

Model updates, prompt changes, new tools, source changes, and shifting user behaviour can cause regression. Run the evaluation suite before releases, canary changes, monitor live traces, and convert production failures into new held-out tests.

## Evidence

- [NIST — Towards best practices for automated benchmark evaluations](https://www.nist.gov/news-events/news/2026/01/towards-best-practices-automated-benchmark-evaluations) — summarises NIST AI 800-2 guidance on validity, transparency, and reproducibility for model and agent evaluations.
- [NIST — Cheating on AI agent evaluations](https://www.nist.gov/caisi/cheating-ai-agent-evaluations) — documents unintended benchmark exploitation and recommends standardising affordances and restrictions.
- [NIST — Analyzing transcripts from AI agent evaluations](https://www.nist.gov/blogs/caisi-research-blog/analyzing-transcripts-ai-agent-evaluations) — establishes trace and transcript analysis as an evaluation method.
- [NIST — Building evaluation probes into agentic AI](https://www.nist.gov/programs-projects/building-evaluation-probes-agentic-ai) — identifies factual grounding, completeness, and rubric-based evaluation of agent outputs.
- [OpenAI — Evals API](https://platform.openai.com/docs/api-reference/evals) — documents reusable evaluation definitions, datasets, runs, and graders across models and settings.
