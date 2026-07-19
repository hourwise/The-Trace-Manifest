---
canonical_question: "What is the Model Context Protocol, and when should it be used?"
section: ai-agents
topics:
  - mcp
  - tool-calling
  - agent-integrations
knowledge_type: definition
evidence_status: vendor_reported
valid_from: 2026-07-19
review_after: 2026-10-19
hard_expiry: 2027-07-19
source_set_hash: ""
---

## Direct answer

The **Model Context Protocol (MCP)** is an open client-server protocol for connecting AI applications to external tools and context through a standard interface.

An MCP server can expose:

- **tools** that an AI application may invoke;
- **resources** that provide data or context;
- **prompts** that provide reusable interaction templates.

Use MCP when an integration should be reusable across multiple compatible AI hosts, when tools need to be discovered dynamically, or when a provider-neutral interface is more valuable than a custom model-specific adapter.

Do not use MCP merely because it is fashionable. A direct API integration can be simpler and safer for one narrow, stable use case. MCP also does not by itself provide complete execution governance, trust, or protection against prompt injection and malicious tools.

## Detailed explanation

MCP separates the AI application from the systems that provide data and actions.

The main participants are:

- the **host**, such as an AI IDE or desktop assistant;
- an **MCP client** created by the host for each connection;
- an **MCP server** that exposes capabilities.

The protocol uses JSON-RPC 2.0 at its data layer. It defines lifecycle management, protocol-version negotiation, capability discovery, requests, responses, and notifications. Local servers commonly use standard input and output, while remote servers commonly use Streamable HTTP.

The three principal server primitives are:

1. **Tools** — executable operations such as reading a database, creating a ticket, querying an API, or modifying a file.
2. **Resources** — contextual data such as documents, schemas, records, or API responses.
3. **Prompts** — reusable templates or examples that help structure a model interaction.

MCP is valuable when:

- the same tool should work with several AI clients or models;
- capabilities need to be listed and discovered at runtime;
- an organisation wants a consistent integration contract;
- a local process and a remote service should expose similar semantics;
- a tool provider wants to avoid building a separate adapter for every host;
- prompts, resources, and actions belong in one negotiated interface.

A direct API or function-call integration may be better when:

- there is only one client and one stable service;
- the operation is simple and performance-critical;
- the security boundary requires a narrowly audited interface;
- dynamic discovery adds no value;
- the existing API contract already provides the necessary governance.

MCP standardises communication, not trust. A tool description can be misleading or malicious. A connected server can expose more capability than expected. Remote authorisation must bind tokens to the intended resource, minimise scopes, avoid token passthrough, and use secure OAuth flows. Hosts should present tool identity and arguments clearly, constrain permissions, and require approval for consequential actions.

The correct adoption question is therefore: **Does a standard, reusable tool-and-context interface provide enough integration value to justify the additional protocol and security surface?**

## Evidence

- [Model Context Protocol — Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture) — defines MCP's scope, hosts, clients, servers, data and transport layers, and tools, resources, and prompts.
- [Model Context Protocol — Authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — defines OAuth-based remote authorisation, audience binding, scope handling, token validation, and the prohibition on token passthrough.
- [Model Context Protocol — Security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — documents security risks including session hijacking, prompt injection, and confused-deputy failures.
- [Breaking the Protocol: Security Analysis of MCP](https://arxiv.org/abs/2601.17549) — provides independent research on protocol-level trust and prompt-injection risks in tool-integrated agents.
