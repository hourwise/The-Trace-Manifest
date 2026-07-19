---
canonical_question: "What is a computer-use agent, and is it safe?"
section: ai-agents
topics:
  - computer-use
  - browser-agents
  - agent-security
  - ui-automation
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

A **computer-use agent** is an AI agent that interprets screenshots or other interface state and operates software through actions such as clicking, typing, scrolling, dragging, and navigating.

It is useful when a website or application has no suitable API, when a task spans several interfaces, or when human-style visual interaction is required.

Computer use is one of the highest-risk agent capabilities. The agent can misunderstand the screen, click the wrong control, disclose information, accept malicious instructions embedded in a page, or perform an irreversible action. It should run in an isolated environment with restricted accounts, limited data, controlled network access, and human confirmation before consequential actions.

## Detailed explanation

Traditional automation relies on stable APIs, command-line interfaces, browser selectors, or scripted workflows. Computer-use agents add visual interpretation and model-driven action selection. A typical loop is:

1. the environment provides a screenshot and task state;
2. the model proposes a computer action;
3. the application validates and executes the action;
4. the environment returns a new screenshot;
5. the model assesses progress and proposes the next action;
6. the loop stops, fails, or requests approval.

Current systems may support browsers, desktop environments, and mobile interfaces. Gemini 3.5 Flash, for example, exposes computer-use capabilities for browser, mobile, and desktop environments. Anthropic's computer-use documentation provides an agent loop and a Docker-based reference environment.

Computer use is valuable for:

- navigating legacy enterprise systems;
- testing web interfaces;
- collecting information from visual dashboards;
- performing repetitive administration;
- transferring information between applications;
- assisting users with accessibility or complex workflows;
- operating systems where no supported integration exists.

It should not be the first choice when a reliable API is available. APIs provide structured inputs, clearer permission boundaries, easier validation, better speed, and less ambiguity. Computer use should usually be a fallback or a deliberately selected capability.

The main risks include:

### Visual and state errors

The model can click a nearby control, misread a disabled button, overlook a modal, type into the wrong field, or act on a stale screenshot.

### Prompt injection

A web page, document, message, or interface can contain instructions intended to hijack the agent. The agent may mistake this untrusted content for part of its task.

### Sensitive information exposure

Screenshots can contain passwords, personal information, customer data, messages, or unrelated open applications. Typed data can be sent to the wrong site.

### Consequential actions

A computer-use agent may submit a form, send a message, make a purchase, delete data, change permissions, or agree to terms through an ordinary interface.

### Authentication and impersonation

Using the user's live browser profile can silently give the agent authority across many services. Dedicated accounts and narrowly scoped sessions are safer.

A secure deployment should:

- use a disposable virtual machine or container;
- avoid the user's everyday desktop and browser profile;
- close unrelated applications and files;
- restrict browsing to approved domains;
- use a dedicated low-privilege account;
- block access to password managers and local secrets;
- require confirmation immediately before submission, payment, deletion, sending, or permission changes;
- display the proposed action and target;
- log screenshots, actions, approvals, and outcomes subject to privacy rules;
- detect loops and enforce time and action limits;
- prefer API or deterministic automation where possible.

Computer use is safe only in a relative sense: the system can reduce and contain risk, but it cannot guarantee that visual interpretation or prompt-injection detection will always succeed.

## Evidence

- [Google — Computer Use with the Gemini API](https://ai.google.dev/gemini-api/docs/computer-use) — documents browser, mobile, and desktop computer use, action loops, safety policies, and prompt-injection detection.
- [Anthropic — Computer use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) — documents the screenshot-action loop, Docker reference environment, isolation, and prompt-injection precautions.
- [Google — Introducing the Gemini Computer Use model](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-computer-use-model/) — describes the model's UI interaction capability and safety design.
- [Microsoft Foundry — Computer use tool](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/computer-use) — warns of significant security and privacy risks and identifies sensitive-domain monitoring requirements.
- [NIST — Strengthening AI agent hijacking evaluations](https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations) — explains how malicious content in websites, files, or messages can hijack an agent.
