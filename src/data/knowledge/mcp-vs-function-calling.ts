// Knowledge page: MCP vs Function Calling
import type { KnowledgePageData } from "../../components/KnowledgePage.astro";

const page: KnowledgePageData = {
  slug: "mcp-vs-function-calling",
  title: "MCP vs function calling",
  hub: "mcp",
  pageType: "comparison",
  status: "published",
  version: 1,
  canonicalSummary: "MCP (Model Context Protocol) and function calling are complementary, not competing, technologies. Function calling is the mechanism by which an LLM decides to invoke a specific function. MCP is the protocol that defines how those functions (tools) are discovered, described, and invoked across process boundaries.",
  lastReviewed: "2026-07-13",
  reviewedBy: "editorial",
  whyItMatters: "Confusing MCP with function calling leads to poor architectural decisions. The two technologies solve different problems at different layers of the stack.",
  currentStatus: "Function calling is a mature capability supported by every major LLM provider. MCP is newer but has been rapidly adopted as the standard for cross-tool connectivity. Most production AI systems use both.",
  coreConcepts: [
    { term: "Function calling (the mechanism)", definition: "The LLM's ability to output a structured function name + parameters instead of free text. The model decides whether to call a function, which function, and what arguments." },
    { term: "MCP (the protocol)", definition: "A standard for how tools are described, discovered, and invoked across processes. MCP standardises the 'wiring' between models and tools." },
    { term: "Tool description (the bridge)", definition: "The MCP server provides a tool description (name, description, JSON Schema). The host converts this into the function-calling format the specific LLM expects." },
  ],
  architecture: "<p><strong>Layer 1 — The Model:</strong> The LLM receives a prompt and available function definitions. It decides whether to respond with text or a function call.</p><p><strong>Layer 2 — The Host:</strong> The host application receives the function call from the model and routes it to the correct tool via its MCP client.</p><p><strong>Layer 3 — The Server:</strong> The MCP server receives the tool call, executes it, and returns the result back up through the host to the model.</p>",
  comparisons: [
    { aspect: "What it is", optionA: "Function calling: LLM capability (outputs a function call)", optionB: "MCP: connectivity protocol (connects model to tool)" },
    { aspect: "Layer", optionA: "Function calling: model/inference layer", optionB: "MCP: transport/integration layer" },
    { aspect: "Standardisation", optionA: "Function calling: provider-specific API format", optionB: "MCP: open, cross-provider standard" },
    { aspect: "Reuse", optionA: "Function calling: tool defined per integration", optionB: "MCP: write once, use with any MCP host" },
    { aspect: "Without the other", optionA: "Function calling without MCP: works for simple API calls, but every integration is bespoke", optionB: "MCP without function calling: tools are described but no model can invoke them" },
  ],
  knownLimitations: [
    "Function-calling formats differ across providers — host code must normalise these differences.",
    "MCP tool descriptions must be converted to provider-specific formats, which can lose fidelity.",
    "MCP does not prescribe which function-calling format to use — that is a host implementation detail.",
  ],
  claims: [
    { claimText: "MCP and function calling are complementary technologies operating at different layers of the stack.", claimClass: "trace_manifest_inference", relationship: "supports", isInference: true, evidenceQuality: "moderate" },
    { claimText: "MCP standardises tool description and invocation in a way that is independent of any specific model provider.", claimClass: "specification_defined", relationship: "supports", sourceLabel: "MCP Specification", sourceUrl: "https://modelcontextprotocol.io/", evidenceQuality: "strong" },
  ],
  openQuestions: ["Will LLM providers converge on a single function-calling format?", "Should MCP evolve to include a standard function-calling format?", "How do emerging agent-to-agent protocols relate to the MCP + function-calling stack?"],
  relatedPages: [
    { title: "What is MCP?", slug: "what-is-mcp" },
    { title: "MCP architecture", slug: "mcp-architecture" },
    { title: "Tool calling, function calling, and MCP", slug: "tool-calling-function-calling-mcp" },
  ],
  versionHistory: [{ version: 1, date: "2026-07-13", summary: "Initial publication. Establishes MCP vs function-calling as complementary layers." }],
};

export default page;
