---
canonical_question: "How should an AI coding agent be secured?"
section: ai-agents
topics:
  - coding-agents
  - agent-security
  - sandboxing
  - human-approval
knowledge_type: security_advisory
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

Treat an AI coding agent as **untrusted automation with potentially powerful access**, not as a trusted developer.

The minimum secure posture is:

- an OS-enforced sandbox;
- least-privilege filesystem and tool access;
- outbound network access blocked by default or restricted to an allowlist;
- short-lived, narrowly scoped credentials;
- explicit approval for actions that cross a risk boundary;
- isolated branches, worktrees, containers, or disposable environments;
- mandatory tests and security checks;
- complete tool, network, approval, and change logs;
- human review before merge, deployment, publication, payment, deletion, or permission changes.

A system prompt telling the agent to “be careful” is not a security control.

## Detailed explanation

Coding agents process untrusted material: source files, package metadata, documentation, issue text, web pages, test output, tool descriptions, and sometimes emails or tickets. Any of these can contain malicious or misleading instructions. The model can also make ordinary mistakes, misunderstand scope, invoke a dangerous command, expose a secret, or change files outside the intended task.

Security must therefore be enforced outside the model.

### Execution boundary

Run the agent inside a sandbox that controls readable and writable paths, process execution, resource use, and network access. Prefer a disposable container, virtual machine, or similarly isolated environment for high-risk or untrusted repositories. Do not give the agent unrestricted access to the developer's home directory, browser profile, SSH keys, cloud credentials, or production systems.

### Identity and credentials

Give the agent its own scoped identity rather than silently borrowing a human user's full authority. Use short-lived credentials, minimum scopes, explicit resource and tenant boundaries, and separate tokens for separate downstream services. Never place secrets in prompts, source files, logs, or environment variables that every process can read.

### Network control

Deny open-ended outbound access. Allow known package registries, documentation sites, and internal services only when required. Log allowed and denied destinations. Require approval before contacting an unfamiliar domain or transmitting repository content.

### Approval and authority

Approval should be required when the requested action materially changes risk. Examples include writing outside the workspace, accessing secrets, sending external messages, creating releases, modifying permissions, deleting data, merging, or deploying. The approval must bind to the exact action, target, arguments, and current state so that the agent cannot mutate the action after approval.

### Validation and review

Require the agent to run the project's tests, linting, type-checking, and security scans. Preserve the diff, commands, results, and relevant reasoning summary. Human reviewers should examine consequential changes before they are integrated. Production deployment should remain a separate governed action.

### MCP and tool security

Only connect reviewed tools and servers. Inspect tool descriptions and schemas, pin versions or verify manifests where possible, display arguments before consequential calls, and assume that tool metadata or retrieved content can contain prompt injection. MCP authorisation protects access tokens; it does not prove that a tool is honest or safe.

## Evidence

- [OpenAI — Running Codex safely](https://openai.com/index/running-codex-safely/) — describes sandboxing, approvals, managed network policy, constrained execution, and agent-native telemetry used for coding agents.
- [OpenAI — Introducing Codex](https://openai.com/index/introducing-codex/) — establishes the breadth of file, command, test, and repository actions a coding agent may perform in an isolated environment.
- [Model Context Protocol — Authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — requires resource-bound tokens, token validation, secure OAuth practices, and prohibits token passthrough.
- [Model Context Protocol — Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — documents prompt-injection, session, token, and confused-deputy risks.
- [Model Context Protocol threat-modelling research](https://arxiv.org/abs/2603.22489) — identifies tool poisoning as a significant client-side risk and proposes layered validation and transparency controls.
