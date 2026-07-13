// Knowledge page: MCP Architecture
import type { KnowledgePageData } from "../../components/KnowledgePage.astro";

const page: KnowledgePageData = {
  slug: "mcp-architecture",
  title: "MCP architecture: hosts, clients, servers, tools, resources, prompts, and transports",
  hub: "mcp",
  pageType: "architecture",
  status: "published",
  version: 1,
  canonicalSummary: "A detailed walkthrough of the MCP client-server architecture: how hosts embed clients, how clients connect to servers, how tools and resources are exposed and invoked, how prompts standardise interactions, and how transports carry messages between components.",
  lastReviewed: "2026-07-13",
  reviewedBy: "editorial",
  whyItMatters: "Understanding the MCP architecture is essential for building secure, reliable AI-tool integrations. The architecture defines clear boundaries between components — hosts, clients, and servers — each with distinct responsibilities.",
  currentStatus: "The architecture has been stable since the initial specification. Transport support has expanded from stdio-only to include HTTP with Server-Sent Events (SSE) and experimental WebSocket support.",
  coreConcepts: [
    { term: "Host process", definition: "The application that the user interacts with — Claude Desktop, VS Code, a web app. The host creates and manages client instances. One host can connect to many servers." },
    { term: "Client-server connection", definition: "Each client maintains exactly one connection to one server. The connection is established when the client starts and terminates when the client disconnects or the server process exits." },
    { term: "Capability negotiation", definition: "At connection time, client and server exchange capability declarations. This tells each side what features the other supports. Unknown capabilities are silently ignored for forward compatibility." },
    { term: "Tool invocation lifecycle", definition: "1. Server declares available tools at connection. 2. Model decides to invoke a tool. 3. Host sends tool call request through client to server. 4. Server executes the tool. 5. Server returns structured result. 6. Result is added to model context." },
    { term: "Resource subscription model", definition: "The host can subscribe to resources that change over time. When a subscribed resource changes, the server sends an update notification." },
  ],
  comparisons: [
    { aspect: "Direction of control", optionA: "Tools: model decides when to call", optionB: "Resources: host decides what to inject" },
    { aspect: "Latency model", optionA: "Tools: synchronous request-response", optionB: "Resources: pre-fetched or subscribed (async updates)" },
    { aspect: "Transport", optionA: "Stdio: local, process-level security", optionB: "HTTP+SSE: remote, requires TLS and auth" },
  ],
  implementationOptions: [
    { label: "Stdio transport", description: "Client spawns server as a child process. Messages flow over stdin/stdout as JSON-RPC. Simplest to set up, limited to local machine." },
    { label: "HTTP + SSE transport", description: "Server runs as an HTTP endpoint. Client connects via Server-Sent Events for server→client messages and HTTP POST for client→server. Supports remote servers." },
    { label: "Streamable HTTP (experimental)", description: "Replaces SSE with a single HTTP stream for bidirectional communication. Reduces connection overhead and improves reliability." },
  ],
  timeline: [
    { date: "2024-11", event: "Initial architecture: stdio transport, tools, resources, prompts" },
    { date: "2025-Q2", event: "HTTP+SSE transport added for remote server support" },
    { date: "2025-Q3", event: "Resource subscriptions, sampling, and elicitation capabilities added" },
    { date: "2026-Q1", event: "Streamable HTTP transport proposed for improved performance" },
  ],
  claims: [
    { claimText: "Each MCP client maintains exactly one connection to one server.", claimClass: "specification_defined", relationship: "supports", sourceLabel: "MCP Specification — Architecture", sourceUrl: "https://modelcontextprotocol.io/docs/concepts/architecture", evidenceQuality: "strong" },
    { claimText: "Capability negotiation ensures forward compatibility — unknown capabilities are silently ignored.", claimClass: "specification_defined", relationship: "supports", sourceLabel: "MCP Specification — Lifecycle", evidenceQuality: "strong" },
    { claimText: "MCP's architecture draws heavily from the Language Server Protocol (LSP) design pattern.", claimClass: "trace_manifest_inference", relationship: "contextualises", isInference: true, evidenceQuality: "moderate" },
  ],
  openQuestions: ["Will streamable HTTP replace SSE as the recommended remote transport?", "How should large binary resources be handled over JSON-RPC?"],
  relatedPages: [
    { title: "What is MCP?", slug: "what-is-mcp" },
    { title: "MCP security and the execution-governance gap", slug: "mcp-security" },
    { title: "MCP vs function calling", slug: "mcp-vs-function-calling" },
  ],
  versionHistory: [{ version: 1, date: "2026-07-13", summary: "Initial publication. Covers architecture components, transport options, and tool/resource lifecycle." }],
};

export default page;
