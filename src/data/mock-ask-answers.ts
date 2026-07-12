// The Trace Manifest — Mock Ask Answers
// Placeholder design data for the ask results page.
// All content is fabricated for design purposes — not live intelligence.
// Connects to real API in Phase 5.

import type { AskAnswer } from "../types/ask";

export const mockAnswers: Record<string, AskAnswer> = {
  "best-value-agent-workloads": {
    question: "Which AI provider offers the best value for agent workloads?",
    slug: "best-value-agent-workloads",
    status: "provisionally_supported",
    confidence: 64,
    freshnessDate: "2026-07-12T08:06:00Z",
    freshnessText: "8 min ago",
    sourceCount: 5,
    primarySourceCount: 2,
    directAnswer:
      "For tool-heavy agents, mid-tier closed models with recent list-price cuts often beat flagship reasoning models on cost per successful task. Open-weight APIs remain competitive when latency SLAs are flexible and you control the scaffold. There is no universal winner — value is workload-specific.",
    briefWhy:
      "Agent bills are dominated by output tokens and retries. Small quality gaps rarely justify multi-fold price differences unless failure cost is extreme. Scaffold efficiency can outweigh provider brand.",
    recommendation:
      "Start with the current mid-tier closed model that has transparent tool docs and a recent price cut; parallel-test one open-weight API. Lock only after measuring success rate × cost on your scaffold. Revisit when list prices or model versions change.",
    evidenceSummary: [
      {
        type: "supporting",
        label: "Supporting",
        value: "Public list prices + independent agent cost notes agree that mid-tier often wins unit economics.",
        meta: "3 sources · high agreement",
      },
      {
        type: "conflicting",
        label: "Conflicting",
        value: "Enterprise discounts, caching, and batch APIs can invert public rankings.",
        meta: "2 notes · open variables",
      },
      {
        type: "vendor",
        label: "Vendor claims",
        value: '"Best model = best value" framing is common; treat as marketing until matched-task studies exist.',
        meta: "vendor · not primary",
      },
      {
        type: "gap",
        label: "Evidence gaps",
        value: "Your traffic mix, tool error rates, and caching strategy are unknown — confidence capped.",
        meta: "uncertainty · 64%",
      },
    ],
    breakdown: [
      {
        type: "facts",
        heading: "Facts",
        content: "",
        items: [
          "Public list prices for major providers are documented; at least one frontier API adjusted rates recently.",
          "Independent agent runs show scaffold choice moves scores more than some model swaps.",
          "Open-weight hosted APIs publish lower token rates with different latency profiles.",
        ],
      },
      {
        type: "supporting",
        heading: "Supporting evidence",
        content:
          'Pricing tables; independent SWE-style cost write-ups; desk "Best value" methodology on the model index.',
      },
      {
        type: "conflicting",
        heading: "Conflicting evidence",
        content:
          "Enterprise discounts, prompt caching, and batch APIs can invert public list-price rankings. Some vendors claim superior reliability that is not yet independently cost-normalised.",
      },
      {
        type: "vendor_claims",
        heading: "Vendor claims",
        content:
          'Marketing often equates "best model" with "best value." Treat as claims until matched-task cost studies exist for your scaffold.',
      },
      {
        type: "community_opinion",
        heading: "Community opinion",
        content:
          "Practitioners frequently report overpaying for flagship models on routine agent loops; others report flagship savings via fewer retries. Both can be true for different harnesses.",
      },
      {
        type: "uncertainty",
        heading: "Uncertainty",
        content:
          "Your traffic mix, tool error rates, and caching strategy are unknown here. Confidence is capped until those are measured on a fixed internal harness.",
      },
      {
        type: "interpretation",
        heading: "Interpretation",
        content:
          "Prefer a short internal bake-off (50–100 tasks) across two mid-tier and one open-weight option before committing. Track cost per successful task, not tokens alone.",
      },
    ],
    changeConditions: [
      { text: "Large enterprise discounts or committed-use pricing" },
      { text: "New independent cost-normalised agent studies" },
      { text: "Material quality jump on a cheaper open-weight release" },
      { text: "Security constraints that force a single provider" },
    ],
    sources: [
      {
        id: "SRC-PRICE-TABLES",
        checkedDate: "12 Jul 2026",
        label: "Provider public pricing pages (Anthropic, OpenAI, Google, DeepSeek list rates)",
        url: "#",
        role: "primary_facts",
        roleLabel: "Primary · facts",
        note: "Independent of vendor narrative · list rates only",
      },
      {
        id: "SRC-2026-0712-01",
        checkedDate: "published 12 Jul 2026",
        label: "Independent agent trajectory package — cost notes under matched tools",
        url: "#",
        role: "primary_supporting",
        roleLabel: "Primary · supporting",
        note: "Public artifacts · scaffold documented",
      },
      {
        id: "SRC-VALUE-METHOD",
        checkedDate: "desk note",
        label: "The Trace Manifest best-value methodology (model movement tab)",
        url: "#",
        role: "method_interpretation",
        roleLabel: "Method · interpretation",
        note: "How this desk ranks quality per dollar",
      },
      {
        id: "SRC-VENDOR-BLOGS",
        checkedDate: "secondary",
        label: "Vendor performance / value blog posts (composite)",
        url: "#",
        role: "vendor_claim",
        roleLabel: "Vendor · claim only",
        note: "Not used as sole support for rankings",
      },
      {
        id: "SRC-COMMUNITY-2026-H1",
        checkedDate: "",
        label: "Community cost reports (forums / GitHub discussions, curated sample)",
        url: "#",
        role: "community_opinion",
        roleLabel: "Community · opinion",
        note: "Anecdotal · harnesses not standardised",
      },
    ],
    relatedQuestions: [
      { question: "What is currently the best local coding model for 16 GB RAM?", slug: "best-local-coding-model" },
      { question: "Has claude-sonnet-4 been independently benchmarked on SWE-bench Verified?", slug: "claude-sonnet-swe-bench" },
      { question: "What is the current thinking on persistent agent memory?", slug: "agent-memory-current-thinking" },
    ],
    postureExplanation:
      "List prices and independent cost notes support the direction, but enterprise terms and your scaffold can reverse the ranking. Colour is never the only signal.",
  },
};
