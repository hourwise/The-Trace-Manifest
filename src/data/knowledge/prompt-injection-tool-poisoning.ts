// Knowledge page: Prompt Injection, Tool Poisoning, and Confused-Deputy Risks
import type { KnowledgePageData } from "../../components/KnowledgePage.astro";

const page: KnowledgePageData = {
  slug: "prompt-injection-tool-poisoning",
  title: "Prompt injection, tool poisoning, and confused-deputy risks",
  hub: "security",
  pageType: "risk_security",
  status: "published",
  version: 1,
  canonicalSummary: "Three critical security vulnerability classes in AI agent systems: prompt injection (attacker-controlled text manipulates the model), tool poisoning (compromised tools return malicious results), and confused-deputy attacks (the agent misuses its authority to perform unintended actions).",
  lastReviewed: "2026-07-13",
  reviewedBy: "editorial",
  whyItMatters: "These three vulnerability classes are not theoretical — they have been demonstrated in every major AI agent framework. As agents gain access to more powerful tools, the blast radius of a successful attack grows proportionally.",
  currentStatus: "Active research area. Mitigations exist but no single solution eliminates all three threat classes. Major agent frameworks have added varying levels of built-in protections.",
  coreConcepts: [
    { term: "Prompt injection", definition: "An attack where untrusted data enters the LLM's context window and is interpreted as instructions rather than data." },
    { term: "Indirect prompt injection", definition: "A variant where the injected prompt comes from a data source the agent retrieves (tool output, web page, document), rather than from the user directly." },
    { term: "Tool poisoning", definition: "A compromised or malicious MCP server returns crafted responses designed to manipulate the agent's subsequent behaviour." },
    { term: "Confused deputy", definition: "A security scenario where the agent, acting with legitimate authority, is tricked into misusing that authority — sending email to the wrong recipient, deleting the wrong file, etc." },
    { term: "Execution-governance gap", definition: "The space between what an agent is technically capable of doing (execution) and what policies constrain it to do (governance). The wider this gap, the greater the security risk." },
  ],
  securityGovernance: "<p><strong>Defence in depth — no single mitigation is sufficient:</strong></p><h3>1. Input and output validation</h3><p>Tool outputs should be treated as untrusted data. Never pass raw tool output directly into the model's context without sanitisation.</p><h3>2. Human approval gates</h3><p>High-impact actions must require explicit human confirmation. Classify tools by risk level.</p><h3>3. Execution sandboxing</h3><p>Run tool executions in isolated environments to limit blast radius.</p><h3>4. Tool-call audit trail</h3><p>Log every tool invocation with timestamp, inputs, outputs, and the agent's stated reasoning.</p><h3>5. Principle of least privilege</h3><p>Agents should only have access to the tools they genuinely need for their specific task.</p>",
  knownLimitations: [
    "No known defence eliminates indirect prompt injection entirely — it is a fundamental tension between utility and safety.",
    "Tool poisoning is hard to detect in real-time because malicious outputs can look identical to legitimate ones.",
    "Confused-deputy attacks exploit the agent's legitimate authority — the system cannot easily distinguish intended from manipulated use.",
  ],
  claims: [
    { claimText: "Indirect prompt injection is a fundamental unsolved problem in LLM-based agent systems as of mid-2026.", claimClass: "independent_research_finding", relationship: "supports", sourceLabel: "Multiple security research papers (2024-2026)", evidenceQuality: "strong" },
    { claimText: "No single mitigation is sufficient alone; defence in depth is required.", claimClass: "trace_manifest_inference", relationship: "supports", isInference: true, evidenceQuality: "moderate" },
  ],
  openQuestions: ["Can we develop a formal threat model for AI agent security?", "Is it possible to create a 'secure by construction' tool interface?", "Will regulatory requirements mandate specific agent security controls?"],
  relatedPages: [
    { title: "MCP security and the execution-governance gap", slug: "mcp-security" },
    { title: "Human approval in agent systems", slug: "human-approval" },
    { title: "Auditability vs enforceability", slug: "auditability-vs-enforceability" },
  ],
  versionHistory: [{ version: 1, date: "2026-07-13", summary: "Initial publication. Covers three agent vulnerability classes with mitigations." }],
};

export default page;
