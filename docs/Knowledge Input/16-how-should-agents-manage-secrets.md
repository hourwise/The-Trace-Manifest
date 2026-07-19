---
canonical_question: "How should AI agents manage secrets, credentials, and identity?"
section: ai-agents
topics:
  - agent-identity
  - credentials
  - secrets-management
  - least-privilege
knowledge_type: how_to
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

An AI agent should have a **separate, identifiable, least-privilege security principal**. It should not silently inherit a developer's or administrator's complete authority.

Credentials should be:

- short-lived;
- restricted to the intended service and resource;
- limited to the minimum scopes;
- stored in a secure keyring, vault, or workload-identity system;
- delivered only to the tool or process that needs them;
- rotated and revocable;
- excluded from prompts, source files, model memory, and ordinary logs;
- attributable to both the agent and the authorising user or service.

An inbound token for one service must never be blindly passed to another service. Each downstream service should receive a separate token issued for that audience.

## Detailed explanation

Agent identity has at least two relevant principals:

1. the **agent or workload identity** that performed the action;
2. the **human, service, or organisation** that authorised or delegated the action.

Keeping both identities allows systems to determine who initiated the task, which agent executed it, what authority was delegated, and which approval or policy permitted the action.

NIST's 2026 agent identity and authorisation work highlights identification, authorisation, auditing, and non-repudiation as central challenges when agents receive access to data, tools, and applications.

A secure credential flow follows several rules.

### Least privilege and scope

Issue only the permissions required for the current operation. Read and write scopes should be separate where practical. High-risk scopes can be acquired through step-up authorisation when a specific operation requires them rather than granted permanently.

### Audience and resource binding

A token must identify the service for which it was issued. The MCP authorisation specification requires Resource Indicators and validation that a token is intended for the receiving MCP server. This prevents a token obtained for one server from being replayed at another.

### No token passthrough

An MCP server that calls a downstream API acts as a separate OAuth client. It must obtain a separate downstream token rather than forwarding the token it received from the MCP client. Token passthrough breaks audience boundaries and creates confused-deputy risks.

### Secure storage and injection

Credentials belong in a dedicated secret store, OS keyring, hardware-backed identity system, or managed workload-identity service. The runtime should inject a credential into the narrow tool process that needs it. The model should receive a reference or capability handle, not the raw secret value.

### Lifetime and revocation

Use short-lived access tokens, rotate refresh tokens, revoke compromised grants, and end session-scoped permissions when the run ends. Cache only when required and encrypt cached credentials.

### Logging

Log identity, scopes, resource, action, approval reference, and outcome—but redact secret values, bearer tokens, authorisation codes, cookies, and private keys. Model transcripts and tool-error messages must not echo credentials.

### Development environments

Coding agents should not automatically inherit the entire shell environment. Allowlisted variables, protected credential brokers, and sandbox-specific identities are safer than exposing every developer credential to every command.

## Evidence

- [NIST — Software and AI agent identity and authorization](https://www.nccoe.nist.gov/projects/software-and-ai-agent-identity-and-authorization) — frames agent identification, authorisation, auditing, and secure action control as core deployment requirements.
- [NIST — Agent identity concept paper](https://csrc.nist.gov/pubs/other/2026/02/05/accelerating-the-adoption-of-software-and-ai-agent/ipd) — explains the risks created when agents receive access to diverse tools, data, and applications.
- [Model Context Protocol — Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — requires resource-bound tokens, audience validation, short-lived credentials, secure OAuth flows, and separate downstream tokens.
- [Model Context Protocol — Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — explains token passthrough and confused-deputy risks.
- [OpenAI — Running Codex safely](https://openai.com/index/running-codex-safely/) — describes storing CLI and MCP OAuth credentials in the OS keyring and binding agent use to an enterprise workspace.
