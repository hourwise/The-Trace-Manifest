// Knowledge page: What is an AI Agent?
import type { KnowledgePageData } from "../../components/KnowledgePage.astro";

const page: KnowledgePageData = {
  slug: "what-is-an-ai-agent",
  title: "What is an AI agent?",
  hub: "agents",
  pageType: "core_concept",
  status: "published",
  version: 1,
  canonicalSummary: "An AI agent is a system that uses a large language model (LLM) to reason about a task, decide what actions to take, execute those actions (typically via tools), observe the results, and iterate until the task is complete.",
  lastReviewed: "2026-07-13",
  reviewedBy: "editorial",
  whyItMatters: "AI agents represent a fundamental shift from passive Q&A to active task execution. Understanding what agents are — and what they are not — is critical for anyone building, buying, or evaluating AI-powered systems.",
  currentStatus: "Agent architectures are maturing rapidly. The basic pattern (LLM + tools + loop) is well-established, but production-grade reliability, safety, and observability remain active areas of research.",
  coreConcepts: [
    { term: "Agent loop", definition: "The core execution pattern: (1) observe current state, (2) reason about next action, (3) execute action via tool, (4) observe result, (5) repeat until goal is reached. Sometimes called the 'sense-reason-act' loop." },
    { term: "Tool use", definition: "The mechanism by which an agent interacts with the world — calling APIs, reading files, executing code, querying databases. Tools are the agent's hands." },
    { term: "Planning", definition: "The agent's ability to decompose a complex goal into sub-tasks, order them, and adapt the plan as new information arrives." },
    { term: "Memory", definition: "Agents need to remember: conversation history, facts from tools, decisions and outcomes, and user preferences. Memory can be short-term (in-context) or long-term (persisted)." },
    { term: "Orchestration", definition: "The layer that manages agent execution — deciding which agent handles what, managing retries and error recovery, enforcing timeouts, and coordinating multi-agent interactions." },
  ],
  whatItDoes: "<p>AI agents can: execute multi-step tasks autonomously, use tools to interact with external systems, adapt their plan when new information changes the situation, ask clarifying questions, and operate in loops until a task succeeds.</p>",
  whatItDoesNotDo: "<p>AI agents do not: have consciousness or genuine understanding, always succeed, replace human judgment for high-stakes decisions, guarantee safety by themselves, or work well without clear goals and termination conditions.</p>",
  knownLimitations: [
    "Agents can get stuck in loops, repeatedly calling the same tool without making progress.",
    "Goal drift: the agent may pursue a related but incorrect goal if the prompt is ambiguous.",
    "Tool failures can derail an agent if error handling is insufficient.",
    "Long-running agents consume significant context window space, degrading reasoning over time.",
    "Agent behaviour can be non-deterministic; the same prompt may produce different tool-call sequences.",
  ],
  securityGovernance: "<p>Agents amplify both the capabilities and the risks of LLMs. Key governance requirements: human approval gates for high-impact actions, tool-use policies defining access per circumstance, execution sandboxing, audit logging of every tool invocation, and budget/rate limiting.</p>",
  comparisons: [
    { aspect: "Control model", optionA: "Chatbot: user drives the conversation", optionB: "Agent: agent drives the execution" },
    { aspect: "Tool access", optionA: "Chatbot: no tool access (or single-shot)", optionB: "Agent: multi-tool, multi-step, iterative" },
    { aspect: "Failure mode", optionA: "Chatbot: wrong answer", optionB: "Agent: wrong action with real consequences" },
  ],
  claims: [
    { claimText: "The agent loop (sense-reason-act) is the foundational pattern for all current AI agent architectures.", claimClass: "editorial_synthesis", relationship: "supports", isInference: true, evidenceQuality: "moderate" },
    { claimText: "Human-in-the-loop approval is essential for high-stakes agent actions.", claimClass: "editorial_synthesis", relationship: "supports", isInference: true, evidenceQuality: "moderate" },
  ],
  openQuestions: ["At what level of reliability do agents become safe to deploy without human-in-the-loop?", "How should agent memory be structured — single store, per-agent stores, or shared graph?", "When do multi-agent systems outperform single-agent systems?"],
  relatedPages: [
    { title: "Agents vs workflows vs automation", slug: "agents-vs-workflows" },
    { title: "Agent memory", slug: "agent-memory" },
    { title: "Human approval in agent systems", slug: "human-approval" },
    { title: "How to evaluate an agent system", slug: "evaluating-agent-systems" },
  ],
  versionHistory: [{ version: 1, date: "2026-07-13", summary: "Initial publication. Defines AI agents, the agent loop, key components, limitations, and governance requirements." }],
};

export default page;
