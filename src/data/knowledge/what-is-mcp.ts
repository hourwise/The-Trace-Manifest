// Knowledge page: What is MCP?
import type { KnowledgePageData } from "../../components/KnowledgePage.astro";

const page: KnowledgePageData = {
  slug: "what-is-mcp",
  title: "What is the Model Context Protocol (MCP)?",
  hub: "mcp",
  pageType: "core_concept",
  status: "published",
  version: 1,
  canonicalSummary: "The Model Context Protocol (MCP) is an open protocol that standardises how AI models connect to external tools, data sources, and services. It defines a client-server architecture where AI hosts act as clients, and tools, resources, and prompts are exposed by servers.",
  lastReviewed: "2026-07-13",
  reviewedBy: "editorial",

  whyItMatters: "Before MCP, every AI model integration with an external tool was a bespoke implementation — different APIs, different authentication patterns, different data formats. MCP provides a single, open standard that any model can use to discover and invoke tools, read resources, and use prompt templates. This means tool builders write one server, and every MCP-compatible AI host can use it. It is the equivalent of USB for AI-tool connectivity.",

  currentStatus: "MCP was introduced by Anthropic in November 2024 and has gained rapid adoption across the AI ecosystem. As of mid-2026, it is supported by major AI hosts including Claude Desktop, Continue, Cline, and Zed, with servers available for filesystems, databases, APIs, and development tools. The specification continues to evolve with community contributions. The protocol is open and not controlled by any single vendor.",

  coreConcepts: [
    { term: "Host", definition: "The AI application that initiates connections — e.g. Claude Desktop, a coding IDE, or a custom agent. The host is an MCP client." },
    { term: "Client", definition: "A protocol client that maintains a 1:1 connection with a server. The host may manage multiple clients, each connected to a different server." },
    { term: "Server", definition: "A lightweight program that exposes tools, resources, and prompts via the MCP protocol. Each server provides specific capabilities — file access, database queries, API calls, etc." },
    { term: "Tool", definition: "A function that the AI model can invoke. Tools are model-controlled: the model decides whether and when to call a tool, and the server executes it. Tools take structured inputs and return structured outputs." },
    { term: "Resource", definition: "A structured data object exposed by the server that the model can read. Unlike tools, resources are application-controlled: the host decides what context to include. Resources can be static (files), dynamic (API responses), or subscribed (live updates)." },
    { term: "Prompt", definition: "A reusable prompt template provided by the server. Prompts help standardise interactions — for example, a server might provide a code-review prompt template that the host can offer to users." },
    { term: "Transport", definition: "The communication layer between client and server. MCP supports stdio (for local processes) and HTTP with Server-Sent Events (for remote servers). The transport layer is pluggable — new transports can be added." },
  ],

  architecture: `<p>MCP follows a client-server model inspired by the Language Server Protocol (LSP). The host application (e.g., Claude Desktop) embeds an MCP client. That client connects to one or more MCP servers, each running as a separate process — locally via stdio, or remotely via HTTP+SSE.</p>
<p>When a user asks a question, the AI model (running within the host) can decide to invoke a tool. The tool call goes from the model → host → client → server. The server executes the tool and returns the result. The result is added to the model's context, allowing it to incorporate real-time data or take real-world actions.</p>
<p>Resources work differently: the host pre-fetches relevant resources and injects them into the model's context before the model generates a response. This means the model always has access to the latest data without needing to make tool calls for every query.</p>
<p>This separation — tools are model-pulled, resources are host-pushed — is a key design decision that balances flexibility with control.</p>`,

  whatItDoes: `<p>MCP enables AI models to:</p><ul><li>Read files, databases, and live data feeds</li><li>Execute code, run queries, and call APIs</li><li>Interact with development tools (git, linters, build systems)</li><li>Access web services and external platforms</li><li>Use structured prompt templates for consistent interactions</li><li>Discover available capabilities dynamically at connection time</li></ul>`,

  whatItDoesNotDo: `<p>MCP does not:</p><ul><li>Define <em>what</em> the AI model decides to do — it only defines <em>how</em> tools are exposed and invoked</li><li>Provide authentication or authorisation — that is the responsibility of each server implementation</li><li>Enforce safety policies — the host must implement guardrails</li><li>Replace function calling — MCP is a protocol for connecting to tools; function calling is the model's mechanism for invoking them</li><li>Dictate a specific AI model or provider — any model that supports tool/function calling can use MCP</li></ul>`,

  knownLimitations: [
    "MCP does not define a standard for tool permissions or access control — each server must implement its own authorisation.",
    "The protocol is still evolving; breaking changes to the specification are possible.",
    "Remote transports (HTTP+SSE) require network configuration and have different security properties than local stdio.",
    "Server discovery is not yet standardised — users must manually configure which servers a host connects to.",
    "There is no built-in mechanism for servers to compose or chain — complex multi-tool workflows must be orchestrated by the host.",
    "Resource subscriptions (live updates) are defined but not yet widely implemented across servers.",
  ],

  securityGovernance: `<p>MCP's design introduces a fundamental tension: the protocol makes it easy to give AI models access to powerful tools, but it does not prescribe <em>how much</em> access is safe. This is the execution-governance gap.</p>
<p>Key security considerations:</p>
<ul>
<li><strong>Tool poisoning:</strong> A compromised server could return malicious results that influence the model's behaviour.</li>
<li><strong>Confused deputy:</strong> The model may invoke a tool in a way the user did not intend, using its authority to perform unintended actions.</li>
<li><strong>Credential exposure:</strong> Servers often hold API keys and credentials — if a server is compromised, those secrets may be exposed.</li>
<li><strong>Indirect prompt injection:</strong> Data from tools and resources enters the model's context and could contain injected instructions.</li>
<li><strong>Transport security:</strong> Remote HTTP connections must use TLS; stdio connections are limited to the local machine but are still vulnerable to process-level attacks.</li>
</ul>
<p>Human approval, tool-use policies, and execution sandboxing are critical complements to MCP that the protocol itself does not provide.</p>`,

  implementationOptions: [
    { label: "MCP TypeScript SDK", description: "Official SDK for building MCP servers and clients in TypeScript/JavaScript. Provides high-level abstractions for tools, resources, and prompts.", url: "https://github.com/modelcontextprotocol/typescript-sdk" },
    { label: "MCP Python SDK", description: "Official SDK for Python. Supports the full protocol including stdio and HTTP transports.", url: "https://github.com/modelcontextprotocol/python-sdk" },
    { label: "Claude Desktop (built-in client)", description: "Anthropic's Claude Desktop application includes native MCP client support. Configure servers via a JSON config file.", url: "https://claude.ai/download" },
    { label: "Continue (IDE extension)", description: "Open-source AI code assistant for VS Code and JetBrains with MCP support for tool integration.", url: "https://continue.dev" },
  ],

  timeline: [
    { date: "2024-11-25", event: "MCP introduced by Anthropic with initial specification and TypeScript/Python SDKs", url: "https://www.anthropic.com/news/model-context-protocol" },
    { date: "2025-Q1", event: "Community servers proliferate — filesystem, GitHub, Postgres, Slack, Brave Search, and more" },
    { date: "2025-Q2", event: "HTTP+SSE transport added, enabling remote MCP servers" },
    { date: "2025-Q3", event: "Resource subscriptions, sampling, and elicitation added to the specification" },
    { date: "2026-Q1", event: "MCP becomes the de-facto standard for AI-tool connectivity; major IDE and platform support" },
    { date: "2026-Q2", event: "Specification governance broadens; community contribution process formalised" },
  ],

  claims: [
    {
      claimText: "MCP is an open protocol, not controlled by any single vendor.",
      claimClass: "specification_defined",
      relationship: "supports",
      sourceLabel: "MCP Specification repository",
      sourceUrl: "https://github.com/modelcontextprotocol/specification",
      evidenceQuality: "strong",
    },
    {
      claimText: "MCP follows a client-server architecture inspired by the Language Server Protocol (LSP).",
      claimClass: "specification_defined",
      relationship: "supports",
      sourceLabel: "MCP Architecture documentation",
      sourceUrl: "https://modelcontextprotocol.io/docs/concepts/architecture",
      evidenceQuality: "strong",
    },
    {
      claimText: "MCP enables a clear separation between model-pulled tools and host-pushed resources.",
      claimClass: "trace_manifest_inference",
      relationship: "contextualises",
      isInference: true,
      evidenceQuality: "moderate",
    },
    {
      claimText: "MCP does not define authentication or authorisation — security is the responsibility of each server implementation.",
      claimClass: "specification_defined",
      relationship: "qualifies",
      sourceLabel: "MCP Specification — Security Considerations",
      evidenceQuality: "strong",
    },
  ],

  openQuestions: [
    "Will MCP server discovery become standardised, or will manual configuration remain the norm?",
    "How should tool permissions be managed at scale — per-user, per-session, or per-tool?",
    "Should MCP include a standard for human-approval gates (e.g., 'ask user before executing this tool')?",
    "Can MCP servers be safely composed without introducing new attack surfaces?",
    "How does MCP compare to emerging agent-to-agent protocols like A2A (Google's Agent-to-Agent)?",
  ],

  relatedPages: [
    { title: "MCP architecture: hosts, clients, servers, tools, resources, prompts, and transports", slug: "mcp-architecture" },
    { title: "MCP security and the execution-governance gap", slug: "mcp-security" },
    { title: "MCP vs function calling", slug: "mcp-vs-function-calling" },
    { title: "Tool calling, function calling, and MCP", slug: "tool-calling-function-calling-mcp" },
  ],

  versionHistory: [
    { version: 1, date: "2026-07-13", summary: "Initial publication. Covers MCP fundamentals, architecture, security considerations, and ecosystem status." },
  ],
};

export default page;
