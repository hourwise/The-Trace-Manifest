---
canonical_question: "What are AI guardrails, and what can they actually protect against?"
section: ai-agents
topics:
  - guardrails
  - ai-safety
  - validation
  - agent-governance
knowledge_type: definition
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**AI guardrails** are checks and controls placed around an AI system's inputs, outputs, tool calls, data access, and execution path.

They can detect or block disallowed content, irrelevant requests, sensitive-data leakage, malformed output, unsupported claims, unsafe tool arguments, or policy violations.

Guardrails reduce risk, but they are not a complete security boundary. Model-based guardrails can make mistakes and be bypassed. High-impact controls—permissions, transaction limits, sandboxing, authentication, network restrictions, database constraints, and approval requirements—must be enforced by deterministic systems outside the model.

## Detailed explanation

The term “guardrail” is used broadly. It may refer to:

- an input classifier;
- an output moderation check;
- a schema validator;
- a policy engine;
- a tool-call interceptor;
- a data-loss-prevention rule;
- a permission or approval gate;
- a factual-grounding checker;
- a rate, cost, or value limit;
- a sandbox or network restriction.

These controls operate at different trust levels and should not be treated as interchangeable.

OpenAI's Agents SDK distinguishes:

1. **Input guardrails** — checks on the initial user input.
2. **Output guardrails** — checks on the final agent output.
3. **Tool guardrails** — checks before and after each custom function-tool invocation.
4. **Tripwires** — signals that stop or redirect the workflow when a check fails.

Input guardrails may run in parallel with the agent for lower latency or block execution before the agent begins. Blocking is safer when the agent could call tools or incur consequential side effects before the guardrail completes.

Useful guardrail layers include:

### Input controls

- detect harmful or disallowed requests;
- reject oversized or malformed input;
- identify prompt-injection patterns;
- classify the task and permitted workflow;
- remove or quarantine unsupported attachments;
- enforce tenant and user access boundaries.

### Retrieval controls

- restrict authorised collections;
- filter by tenant, user, project, and classification;
- reject stale or superseded sources;
- label retrieved content as untrusted evidence;
- scan for prompt injection and sensitive data.

### Tool controls

- validate schemas and business rules;
- check identity, scope, and resource ownership;
- enforce amount, rate, and destination limits;
- require approval;
- deny unexpected network destinations;
- redact secrets from arguments and results.

### Output controls

- enforce structure and allowed fields;
- check citations and grounding;
- detect confidential or personal information;
- moderate disallowed content;
- prevent unsupported certainty;
- require abstention when evidence is insufficient.

### Runtime controls

- sandbox execution;
- impose time, token, and action budgets;
- detect loops;
- preserve audit records;
- stop after repeated validation failures.

Guardrails have limitations. A classifier can produce false positives and false negatives. An LLM judge may share the same blind spots as the agent. A prompt-injection detector may miss a new attack. A grounding check may validate a claim against an unreliable source.

The correct design is defence in depth. Use model-based guardrails for semantic judgement and deterministic controls for enforceable authority. Test guardrails independently, measure their error rates, monitor what they block, and include adversarial cases in regression suites.

## Evidence

- [OpenAI Agents SDK — Guardrails](https://openai.github.io/openai-agents-python/guardrails/) — defines input, output, and tool guardrails, blocking and parallel modes, and tripwires.
- [OpenAI — A practical guide to building AI agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) — presents guardrails as a layered component of production agent systems.
- [OpenAI Guardrails](https://guardrails.openai.com/) — provides guardrail examples for safety, hallucination, personally identifiable information, and other checks.
- [NIST AI Risk Management Framework](https://airc.nist.gov/airmf-resources/playbook/) — provides governance, measurement, and risk-management practices applicable to AI controls.
- [OpenAI — Understanding prompt injections](https://openai.com/safety/prompt-injections/) — explains why layered safeguards and constrained access are necessary rather than relying on one detector.
