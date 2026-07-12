// The Trace Manifest — Phase 3 Golden Test Fixtures
// Tests for classification, cross-source matching, and clustering
// NOTE: fixtures use plain arrays/objects — no test framework dependencies

import { classifyFeedItem } from "../classify";
import type { FeedItem } from "../types";

// ============================================================
// Helper: create a minimal FeedItem for testing
// ============================================================
function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: overrides.id ?? 1,
    source_id: overrides.source_id ?? 1,
    external_id: overrides.external_id ?? null,
    url: overrides.url ?? "https://example.com/test",
    url_hash: overrides.url_hash ?? "abc123",
    title: overrides.title ?? "Test item",
    summary: overrides.summary ?? null,
    content_excerpt: overrides.content_excerpt ?? null,
    author: overrides.author ?? null,
    published_at: overrides.published_at ?? null,
    fetched_at: overrides.fetched_at ?? new Date().toISOString(),
    raw_metadata: overrides.raw_metadata ?? null,
    ingestion_status: overrides.ingestion_status ?? "raw",
    duplicate_of: overrides.duplicate_of ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
  };
}

// ============================================================
// Classification fixtures — { label, item, expected }
// expected uses arrays for topics/models/providers (checked with includes/subset)
// ============================================================
export const CLASSIFICATION_FIXTURES = [
  {
    label: "frontier model release by OpenAI",
    item: makeItem({
      title: "OpenAI Releases GPT-5: A New Frontier Model with Enhanced Reasoning",
      summary: "OpenAI announced GPT-5 today, their most advanced model with improved coding and agent capabilities.",
    }),
    expected: {
      hasTopics: ["frontier-models"],
      hasModels: ["GPT-5"],
      hasProviders: ["OpenAI"],
      minItemTypes: 1,
    },
  },
  {
    label: "open-weight local model release",
    item: makeItem({
      title: "Meta Releases Llama 4 as Open-Weight Model, Runs on 32GB RAM with Ollama",
      summary: "Llama 4 is now available as an open-weight model via Ollama with GGUF quantization.",
    }),
    expected: {
      hasTopics: ["open-weight-models", "local-ai"],
      hasModels: ["Llama 4"],
      hasProviders: ["Meta"],
      minItemTypes: 2,
    },
  },
  {
    label: "security advisory with CVE",
    item: makeItem({
      title: "Critical Prompt Injection Vulnerability Found in Popular AI Coding Assistants (CVE-2026-12345)",
      summary: "A new prompt injection vulnerability affects multiple AI coding tools including Cursor and Cline.",
    }),
    expected: {
      hasTopics: ["security", "coding-assistants"],
      hasModels: [],
      hasProviders: [],
      minItemTypes: 1,
    },
  },
  {
    label: "research paper on arXiv",
    item: makeItem({
      title: "New Research Paper Proposes Novel Attention Mechanism for Transformer Models",
      summary: "A paper published on arXiv cs.CL proposes a revised attention mechanism.",
    }),
    expected: {
      hasTopics: ["research"],
      hasModels: [],
      hasProviders: [],
      minItemTypes: 1,
    },
  },
  {
    label: "pricing change announcement",
    item: makeItem({
      title: "Anthropic Reduces Claude API Prices by 40% for High-Volume Customers",
      summary: "Anthropic announced pricing changes today for Claude 4 API.",
    }),
    expected: {
      hasTopics: ["ai-business"],
      hasModels: ["Claude 4"],
      hasProviders: ["Anthropic"],
      minItemTypes: 1,
    },
  },
  {
    label: "EU regulation update",
    item: makeItem({
      title: "EU AI Act Compliance Deadline Approaches: What Developers Need to Know",
      summary: "The EU AI Act's next phase takes effect in 30 days.",
    }),
    expected: {
      hasTopics: ["regulation"],
      hasModels: [],
      hasProviders: [],
      minItemTypes: 1,
    },
  },
  {
    label: "ambiguity: model release + benchmark + pricing",
    item: makeItem({
      title: "Google Launches Gemini Ultra with Record-Breaking MMLU Score at Competitive Pricing",
      summary: "Google's new Gemini Ultra model achieves 92% on MMLU while undercutting competitors on price.",
    }),
    expected: {
      hasTopics: ["frontier-models"],
      hasModels: ["Gemini Ultra"],
      hasProviders: ["Google"],
      minItemTypes: 2,
    },
  },
  {
    label: "general tech news (should get 'general' topic)",
    item: makeItem({
      title: "Tuesday Morning Tech Roundup",
      summary: "A roundup of today's technology news including updates from various companies.",
    }),
    expected: {
      hasTopics: ["general"],
      hasModels: [],
      hasProviders: [],
      minItemTypes: 0,
    },
  },
];

// ============================================================
// Idempotency: same input → same output
// ============================================================
export const IDEMPOTENCY_ITEM = makeItem({
  title: "Anthropic Releases Claude 4: A New Standard in AI Safety",
  summary: "Claude 4 features improved alignment and reduced hallucination rates.",
});

// ============================================================
// Metadata preservation check
// ============================================================
export const METADATA_FIXTURE = {
  label: "classification should preserve existing fetcher metadata",
  existingMetadata: JSON.stringify({
    fetcher: "rss",
    fetchDuration: 234,
    httpStatus: 200,
    etag: "abc123",
  }),
};
