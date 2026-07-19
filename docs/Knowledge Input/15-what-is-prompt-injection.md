---
canonical_question: "What is prompt injection, and how should AI agents defend against it?"
section: ai-agents
topics:
  - prompt-injection
  - agent-security
  - indirect-prompt-injection
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

**Prompt injection** is an attack in which untrusted content supplies instructions intended to override, redirect, or manipulate an AI system.

A direct injection comes from the user. An **indirect prompt injection** is hidden or embedded in material the agent reads, such as a web page, email, document, code repository, tool description, or retrieved memory.

No single prompt, classifier, or blocklist can provide a complete defence. Secure agents need defence in depth:

- distinguish trusted instructions from untrusted data;
- minimise access to data and tools;
- sandbox execution;
- restrict network destinations;
- validate tool arguments;
- require approval before consequential actions or data transmission;
- isolate and label external content;
- monitor source-to-action flows;
- red-team continuously;
- assume that some injections will bypass the model.

## Detailed explanation

Prompt injection exists because models process instructions and data through the same general input channel. An attacker can place text in ordinary content that tells the model to ignore the user's task, expose secrets, contact an attacker, select a biased result, run code, or misuse a connected tool.

Indirect injection is particularly serious for agents because the user may never see the malicious text. A browsing agent, for example, might encounter instructions hidden in a page. An email agent might process a malicious message while summarising an inbox. A coding agent might read hostile instructions in a repository file or issue description.

NIST defines prompt injection as an attack that exploits the concatenation of untrusted input with a prompt constructed by a higher-trust party. NIST also uses “agent hijacking” for cases where indirect injection causes an agent to take unintended actions.

The most useful security model separates:

- **sources** — places where an attacker can influence content;
- **sinks** — capabilities that can produce harm, such as sending data, running code, spending money, or modifying permissions.

Risk becomes highest when an agent can carry untrusted information from a source to a powerful sink without an enforceable control.

Defences should include:

1. **Instruction hierarchy** — system and application rules must outrank retrieved content.
2. **Content labelling** — external text must be represented as evidence, not executable instruction.
3. **Least privilege** — the agent receives only the data and tools needed for the task.
4. **Capability separation** — research agents should not automatically gain sending, payment, or deletion powers.
5. **Argument validation** — deterministic code checks targets, schemas, limits, and policy.
6. **Approval** — sensitive calls pause with exact details visible to the user.
7. **Sandboxing and egress control** — compromise cannot freely access files, credentials, or arbitrary network endpoints.
8. **Data-flow monitoring** — detect sensitive information moving toward external tools or URLs.
9. **Tool and server review** — treat descriptions and annotations from untrusted MCP servers as untrusted input.
10. **Adversarial testing** — test realistic multi-step attacks and update mitigations continuously.

Prompt injection remains an open security problem. A safe design limits the damage possible when detection fails instead of assuming every malicious instruction will be recognised.

## Evidence

- [NIST — Prompt injection glossary](https://csrc.nist.gov/glossary/term/prompt_injection) — provides a formal definition based on combining untrusted input with higher-trust prompts.
- [NIST — Strengthening AI agent hijacking evaluations](https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations) — describes indirect prompt injection and agent hijacking risks.
- [OpenAI — Designing AI agents to resist prompt injection](https://openai.com/index/designing-agents-to-resist-prompt-injection/) — presents a source-and-sink security model and argues for limiting impact even when attacks succeed.
- [OpenAI — Understanding prompt injections](https://openai.com/safety/prompt-injections/) — explains the attack class and recommends layered controls, limited access, and confirmation.
- [Model Context Protocol — Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — documents prompt-injection, token, session, and confused-deputy risks in tool-connected agents.
