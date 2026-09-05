/**
 * TRACE V1 Mission 2 final launch manifest.
 *
 * This is an immutable launch candidate, not an ingestion instruction.  The
 * four source records below are assessment starting points only.  They are
 * never sufficient for activation until a governed source read proves the
 * source ID, normalized canonical URL, connector, and URL hash together.
 */

import { fingerprint } from "./trace-v1-m1";
import type { TraceV1M2Manifest, TraceV1M2ManifestItem } from "./trace-v1-m2-manifest";

export const TRACE_V1_M2_FINAL_MANIFEST_VERSION = "trace-v1-m2-bounded-activation-v1" as const;
export const TRACE_V1_M2_FINAL_MANIFEST_ID = "trace-v1-m2-bounded-activation" as const;
export const TRACE_V1_M2_FINAL_BASE_SHA = "68baf510de47687759e1602dc517cd23ed3e2eb8" as const;

export type TraceV1M2SourceIdentityExpectation = Readonly<{
  identityKey: string;
  sourceId: number;
  name: string;
  canonicalUrl: string;
  connector: "rss" | "github_api";
  status: "EXPECTED_UNVERIFIED";
  verificationBasis: "ASSESSMENT_STARTING_POINT";
}>;

export type TraceV1M2FinalManifestItem = TraceV1M2ManifestItem & Readonly<{
  sourceIdentityExpectationKey: string | null;
  remediationRequirements: readonly string[];
}>;

export interface TraceV1M2FinalManifest extends Omit<TraceV1M2Manifest, "manifestVersion" | "items"> {
  manifestVersion: typeof TRACE_V1_M2_FINAL_MANIFEST_VERSION;
  manifestId: typeof TRACE_V1_M2_FINAL_MANIFEST_ID;
  createdFromMainSha: typeof TRACE_V1_M2_FINAL_BASE_SHA;
  sourceIdentityExpectations: readonly TraceV1M2SourceIdentityExpectation[];
  executorBounds: Readonly<{
    maxItemsPerInvocation: 3;
    maxSourceCaptures: 3;
    maxClaims: 12;
    maxAssertions: 24;
    maxChunks: 24;
    maxKnowledgeMappings: 3;
  }>;
  items: readonly TraceV1M2FinalManifestItem[];
}

const unresolvedFields = Object.freeze([
  "canonicalUrl",
  "canonicalSourceId",
  "expectedConnector",
  "normalizedUrlHashInput",
] as const);

const primaryStories = [
  [377, "DiffusionGemma claims 4x faster text generation"],
  [328, "Anthropic's new model Fable faces user restrictions, may impact Codex market share"],
  [376, "AI Agent Security Guidance Published"],
  [347, "Ex-Meta L8 Engineer Shares Agentic Engineering Workflow"],
  [346, "Comparison of RAG, Graph RAG, and Agentic RAG Approaches"],
  [345, "Google Announces New Capabilities for Managed Agents in Gemini API"],
  [341, "Microsoft VP Discusses Enterprise AI Agent Deployment"],
  [291, "Google's AMIE AI matches primary care physicians in disease management study"],
  [233, "Multiple llama.cpp patches improve SYCL, SME2, Vulkan, and fix bugs"],
  [318, "Bun's Rust rewrite completed in 11 days with AI assistance"],
  [348, "Kent Beck discusses Agile, TDD, and trust in AI-era software engineering"],
  [305, "Article Explains Progression from AI Answering Questions to Autonomous Agents"],
  [351, "Engineering departments show trend of reducing AI spending"],
  [325, "Figma CEO Dylan Field Discusses AI as a Tailwind for Design"],
  [320, "Pragmatic Engineer AMA covers AI, engineering, hiring, and careers"],
] as const;

const reserveStories = [
  [339, "Google announces $1.5 billion data center expansion in Alabama"],
  [293, "University of Waterloo students develop AI prototypes including sign language tutors"],
  [378, "EU initiative aims to advance robotics sector"],
  [324, "Stratechery Weekly Roundup: Vibe Coding, Apple in Europe, and Midsummer Mailbag"],
  [317, "Loop Engineering: A New Trend or Passing Fad?"],
] as const;

export const TRACE_V1_M2_FINAL_PRIMARY_STORY_IDS = Object.freeze(primaryStories.map(([id]) => id));
export const TRACE_V1_M2_FINAL_RESERVE_STORY_IDS = Object.freeze(reserveStories.map(([id]) => id));

export const TRACE_V1_M2_FINAL_KNOWLEDGE_IDS = Object.freeze([
  "knowledge-what-is-an-ai-agent-and-when-should-one-be-used-5b742525",
  "knowledge-how-should-an-ai-coding-agent-be-secured-d3c9c019",
  "knowledge-what-are-ai-guardrails-and-what-can-they-actually-protect-against-2b010204",
  "knowledge-how-should-multiple-ai-agents-coordinate-and-delegate-work-8d45a76a",
  "knowledge-what-is-ai-model-quantization-and-does-it-reduce-quality-62978647",
  "knowledge-what-is-the-model-context-protocol-and-when-should-it-be-used-c93ef1b9",
] as const);

const sourceIdentityExpectations = Object.freeze([
  {
    identityKey: "source-1-openai-news",
    sourceId: 1,
    name: "OpenAI News",
    canonicalUrl: "https://openai.com/news/rss.xml",
    connector: "rss",
    status: "EXPECTED_UNVERIFIED",
    verificationBasis: "ASSESSMENT_STARTING_POINT",
  },
  {
    identityKey: "source-116-openai-agents-sdk-docs",
    sourceId: 116,
    name: "OpenAI Agents SDK Docs",
    canonicalUrl: "https://github.com/openai/openai-agents-python",
    connector: "github_api",
    status: "EXPECTED_UNVERIFIED",
    verificationBasis: "ASSESSMENT_STARTING_POINT",
  },
  {
    identityKey: "source-17-hugging-face-blog",
    sourceId: 17,
    name: "Hugging Face Blog",
    canonicalUrl: "https://huggingface.co/blog/feed.xml",
    connector: "rss",
    status: "EXPECTED_UNVERIFIED",
    verificationBasis: "ASSESSMENT_STARTING_POINT",
  },
  {
    identityKey: "source-115-model-context-protocol-docs",
    sourceId: 115,
    name: "Model Context Protocol Docs",
    canonicalUrl: "https://github.com/modelcontextprotocol/docs",
    connector: "github_api",
    status: "EXPECTED_UNVERIFIED",
    verificationBasis: "ASSESSMENT_STARTING_POINT",
  },
] as const satisfies readonly TraceV1M2SourceIdentityExpectation[]);

const knowledgeSourceKeys: Readonly<Record<string, string>> = Object.freeze({
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[0]]: "source-1-openai-news",
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[1]]: "source-1-openai-news",
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[2]]: "source-116-openai-agents-sdk-docs",
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[3]]: "source-116-openai-agents-sdk-docs",
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[4]]: "source-17-hugging-face-blog",
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[5]]: "source-115-model-context-protocol-docs",
});

const knowledgeRemediation: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[0]]: ["prove source identity before capture", "preserve source/version/chunk provenance"],
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[1]]: ["prove source identity before capture", "retain security-specific claim relationships"],
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[2]]: ["prove source identity before capture", "retain guardrail scope and limitation claims"],
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[3]]: ["prove source identity before capture", "retain multi-agent relationship and delegation claims"],
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[4]]: ["prove source identity before capture", "retain model quality and limitation claims"],
  [TRACE_V1_M2_FINAL_KNOWLEDGE_IDS[5]]: ["prove source identity before capture", "retain protocol scope and adoption claims"],
});

function storyItem(id: number, title: string, cohort: "primary" | "reserve"): TraceV1M2FinalManifestItem {
  const remediationRequirements = id === 233
    ? ["prove source identity before capture", "prevent duplicate llama.cpp claim admission"]
    : ["prove source identity before capture", "preserve story claim and source provenance"];
  return {
    itemId: `story-${id}`,
    kind: "story",
    storyId: id,
    title,
    cohort,
    expectedEvidenceRole: cohort === "primary" ? "story_primary_source" : "story_reserve_source",
    canonicalUrl: null,
    canonicalSourceId: null,
    expectedConnector: null,
    normalizedUrlHashInput: null,
    sourceIdentityStatus: "SOURCE_IDENTITY_UNRESOLVED",
    unresolvedFields,
    sourceIdentityExpectationKey: null,
    remediationRequirements,
    localIdentityEvidenceFile: "docs/v1/mission-2-bounded-activation.md",
  };
}

function knowledgeItem(knowledgeId: string): TraceV1M2FinalManifestItem {
  return {
    itemId: knowledgeId,
    kind: "knowledge",
    knowledgeId,
    expectedEvidenceRole: "knowledge_document_source",
    canonicalUrl: null,
    canonicalSourceId: null,
    expectedConnector: null,
    normalizedUrlHashInput: null,
    sourceIdentityStatus: "SOURCE_IDENTITY_UNRESOLVED",
    unresolvedFields,
    sourceIdentityExpectationKey: knowledgeSourceKeys[knowledgeId],
    remediationRequirements: knowledgeRemediation[knowledgeId],
    localIdentityEvidenceFile: "docs/v1/mission-2-bounded-activation.md",
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function serializeTraceV1M2FinalManifest(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeTraceV1M2FinalManifest).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serializeTraceV1M2FinalManifest(record[key])}`).join(",")}}`;
}

export function traceV1M2FinalManifestBody(): Omit<TraceV1M2FinalManifest, "manifestHash" | "manifestIdentity"> {
  const items = [
    ...primaryStories.map(([id, title]) => storyItem(id, title, "primary")),
    ...reserveStories.map(([id, title]) => storyItem(id, title, "reserve")),
    ...TRACE_V1_M2_FINAL_KNOWLEDGE_IDS.map(knowledgeItem),
  ];
  return {
    manifestVersion: TRACE_V1_M2_FINAL_MANIFEST_VERSION,
    manifestId: TRACE_V1_M2_FINAL_MANIFEST_ID,
    createdFromMainSha: TRACE_V1_M2_FINAL_BASE_SHA,
    corpus: "trace-v1-initial-evidence-corpus",
    immutable: true,
    sourceIdentityPolicy: "LOCAL_EVIDENCE_ONLY",
    sourceIdentityExpectations,
    executorBounds: {
      maxItemsPerInvocation: 3,
      maxSourceCaptures: 3,
      maxClaims: 12,
      maxAssertions: 24,
      maxChunks: 24,
      maxKnowledgeMappings: 3,
    },
    items,
  };
}

export async function buildTraceV1M2FinalManifestFromBody(
  body: Omit<TraceV1M2FinalManifest, "manifestHash" | "manifestIdentity">,
): Promise<TraceV1M2FinalManifest> {
  validateTraceV1M2FinalManifestBody(body);
  const manifestHash = await fingerprint(body);
  return deepFreeze({
    ...body,
    manifestHash,
    manifestIdentity: `${TRACE_V1_M2_FINAL_MANIFEST_VERSION}:${manifestHash}`,
  });
}

export async function buildTraceV1M2FinalManifest(): Promise<TraceV1M2FinalManifest> {
  return buildTraceV1M2FinalManifestFromBody(traceV1M2FinalManifestBody());
}

export function validateTraceV1M2FinalManifestBody(
  body: Omit<TraceV1M2FinalManifest, "manifestHash" | "manifestIdentity">,
): void {
  if (body.manifestVersion !== TRACE_V1_M2_FINAL_MANIFEST_VERSION || body.manifestId !== TRACE_V1_M2_FINAL_MANIFEST_ID) {
    throw new Error("TRACE_V1_M2_FINAL_MANIFEST_IDENTITY_INVALID");
  }
  const itemIds = body.items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) throw new Error("TRACE_V1_M2_FINAL_MANIFEST_DUPLICATE_ITEM");
  const storyIds = body.items.filter((item) => item.kind === "story").map((item) => item.storyId);
  const knowledgeIds = body.items.filter((item) => item.kind === "knowledge").map((item) => item.knowledgeId);
  if (body.items.filter((item) => item.cohort === "primary").length !== 15) throw new Error("TRACE_V1_M2_FINAL_PRIMARY_COUNT_INVALID");
  if (body.items.filter((item) => item.cohort === "reserve").length !== 5) throw new Error("TRACE_V1_M2_FINAL_RESERVE_COUNT_INVALID");
  if (body.items.filter((item) => item.kind === "knowledge").length !== 6) throw new Error("TRACE_V1_M2_FINAL_KNOWLEDGE_COUNT_INVALID");
  if (JSON.stringify(storyIds.filter((id): id is number => typeof id === "number" && id < 1000).slice(0, 15)) !== JSON.stringify([...TRACE_V1_M2_FINAL_PRIMARY_STORY_IDS])) {
    throw new Error("TRACE_V1_M2_FINAL_PRIMARY_SET_INVALID");
  }
  const reserveIds = body.items.filter((item) => item.cohort === "reserve").map((item) => item.storyId);
  if (JSON.stringify(reserveIds) !== JSON.stringify([339, 293, 378, 324, 317])) throw new Error("TRACE_V1_M2_FINAL_RESERVE_SET_INVALID");
  if (!TRACE_V1_M2_FINAL_KNOWLEDGE_IDS.every((id) => knowledgeIds.includes(id))) throw new Error("TRACE_V1_M2_FINAL_KNOWLEDGE_SET_INVALID");
  for (const item of body.items) {
    if (item.sourceIdentityStatus !== "SOURCE_IDENTITY_UNRESOLVED" || item.canonicalUrl !== null || item.canonicalSourceId !== null || item.expectedConnector !== null) {
      throw new Error("TRACE_V1_M2_FINAL_URL_ONLY_IDENTITY_FORBIDDEN");
    }
    if (item.sourceIdentityExpectationKey && !body.sourceIdentityExpectations.some((expectation) => expectation.identityKey === item.sourceIdentityExpectationKey)) {
      throw new Error("TRACE_V1_M2_FINAL_SOURCE_EXPECTATION_UNKNOWN");
    }
  }
  for (const expectation of body.sourceIdentityExpectations) {
    if (!Number.isSafeInteger(expectation.sourceId) || expectation.sourceId <= 0 || expectation.status !== "EXPECTED_UNVERIFIED") {
      throw new Error("TRACE_V1_M2_FINAL_SOURCE_EXPECTATION_INVALID");
    }
  }
}
