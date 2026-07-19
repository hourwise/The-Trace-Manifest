---
canonical_question: "When should an AI agent require human approval?"
section: ai-agents
topics:
  - human-in-the-loop
  - approvals
  - agent-governance
knowledge_type: guide
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

An AI agent should require human approval **before a proposed action crosses a meaningful risk, authority, or reversibility boundary**.

Approval is normally appropriate for:

- sending external communications;
- purchases, payments, refunds, or financial commitments;
- deletion or destructive modification;
- production deployment or merge;
- permission, identity, or security-setting changes;
- disclosure of confidential or personal information;
- access outside the agent's normal sandbox;
- use of a new network destination;
- legal, medical, employment, or safety-critical decisions;
- actions with uncertain targets, arguments, or consequences.

Low-risk, reversible actions inside a tightly bounded workspace can usually proceed without repeated approval. The approval must show the exact action, target, arguments, data to be shared, and expected consequence.

## Detailed explanation

Human approval is most useful when it controls authority rather than merely interrupting the workflow. Asking “continue?” after every harmless step creates approval fatigue and encourages automatic clicking. Asking immediately before a consequential, specific action creates a meaningful control.

A risk-based approval policy can consider:

1. **Impact** — how much harm could occur?
2. **Reversibility** — can the action be reliably undone?
3. **Externality** — does it affect another person or system?
4. **Data sensitivity** — will confidential information be accessed or transmitted?
5. **Financial or legal commitment** — does it bind the user or organisation?
6. **Privilege** — does it alter permissions or use elevated credentials?
7. **Novelty** — is the target, domain, or tool unfamiliar?
8. **Confidence and ambiguity** — is the intent or target uncertain?
9. **Scale** — will the action affect one item or thousands?
10. **Evidence** — has the action been validated by tests or independent checks?

The OpenAI Agents SDK implements human-in-the-loop execution by pausing before tools marked as requiring approval, serialising the run state, recording the proposed tool name and arguments, and resuming after a person approves or rejects the specific call. This is stronger than an informal chat message because the pending action is bound to a tool-call identity.

Approval should be **state-bound**. If the target resource, arguments, price, diff, permission set, or underlying state changes after approval, the approval should no longer be valid. Broad approvals such as “allow all future shell commands” should be limited to low-risk sessions and protected environments.

The reviewer needs enough information to make a real decision:

- what the agent intends to do;
- why it believes the action is necessary;
- the exact target and parameters;
- which information will leave the system;
- relevant validation results;
- whether the action can be reversed;
- the consequences of rejection.

Human oversight does not guarantee safety. Reviewers can misunderstand technical output, become fatigued, or approve under time pressure. High-impact actions should therefore also use deterministic controls, least privilege, rate and value limits, separation of duties, logs, and post-action monitoring.

## Evidence

- [OpenAI Agents SDK — Human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/) — documents pausing, inspecting, approving, rejecting, serialising, and resuming sensitive tool calls.
- [OpenAI — Running Codex safely](https://openai.com/index/running-codex-safely/) — describes combining sandboxes with approval policies so higher-risk actions stop for review.
- [NIST AI RMF — Human-AI interaction](https://airc.nist.gov/airmf-resources/airmf/appendices/app-c-ai-risk-management-and-human-ai-interaction/) — states that human roles, responsibilities, and oversight configurations should be clearly defined.
- [OpenAI — Understanding prompt injections](https://openai.com/safety/prompt-injections/) — recommends confirmation before consequential actions and careful review of the exact proposed action.
- [OpenAI Agents SDK — Run state](https://openai.github.io/openai-agents-python/ref/run_state/) — defines a durable state snapshot that preserves interruptions and approval decisions across resumed runs.
