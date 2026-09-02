/**
 * TRACE V1 Mission 2 bounded activation manifest.
 *
 * The manifest is a declarative, immutable inventory. It contains no fetch
 * instruction and no publication instruction. A source URL/ID is populated
 * only when checked-in evidence proves it; otherwise the item remains an
 * explicit source-identity blocker.
 */

import { fingerprint } from "./trace-v1-m1";

export const TRACE_V1_M2_MANIFEST_VERSION = "trace-v1-m2-activation-manifest-v1" as const;
export const TRACE_V1_M2_MANIFEST_EVIDENCE_FILE = "docs/v1/production-evidence-readiness.md" as const;
export const TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE = "scripts/link-knowledge-sources.sql" as const;

export type CorpusItemKind = "story" | "knowledge";
export type StoryCohort = "primary" | "reserve";

export interface LocalSourceReferenceCandidate {
  evidenceFile: typeof TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE;
  canonicalUrlCandidate: string;
  sourceIdCandidate: number;
  verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED";
}

export interface TraceV1M2ManifestItem {
  itemId: string;
  kind: CorpusItemKind;
  storyId?: number;
  knowledgeId?: string;
  title?: string;
  cohort?: StoryCohort;
  expectedEvidenceRole: "story_primary_source" | "story_reserve_source" | "knowledge_document_source";
  canonicalUrl: string | null;
  canonicalSourceId: number | null;
  expectedConnector: string | null;
  normalizedUrlHashInput: string | null;
  sourceIdentityStatus: "SOURCE_IDENTITY_UNRESOLVED" | "RESOLVED";
  unresolvedFields: readonly string[];
  localSourceReferenceCandidates?: readonly LocalSourceReferenceCandidate[];
  localIdentityEvidenceFile: string;
}

export interface TraceV1M2ManifestBody {
  manifestVersion: typeof TRACE_V1_M2_MANIFEST_VERSION;
  corpus: "trace-v1-initial-evidence-corpus";
  immutable: true;
  sourceIdentityPolicy: "LOCAL_EVIDENCE_ONLY";
  items: readonly TraceV1M2ManifestItem[];
}

export interface TraceV1M2Manifest extends TraceV1M2ManifestBody {
  manifestHash: string;
  manifestIdentity: string;
}

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
] as const satisfies readonly (readonly [number, string])[];

const reserveStories = [
  [339, "Google announces $1.5 billion data center expansion in Alabama"],
  [293, "University of Waterloo students develop AI prototypes including sign language tutors"],
  [378, "EU initiative aims to advance robotics sector"],
  [324, "Stratechery Weekly Roundup: Vibe Coding, Apple in Europe, and Midsummer Mailbag"],
  [317, "Loop Engineering: A New Trend or Passing Fad?"],
] as const satisfies readonly (readonly [number, string])[];

const knowledgeSourceCandidates: Readonly<Record<string, readonly LocalSourceReferenceCandidate[]>> = Object.freeze({
  "knowledge-can-a-local-open-weight-model-replace-a-frontier-cloud-model-for-coding-a194ede4": [
    { evidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE, canonicalUrlCandidate: "https://z.ai/blog/glm-5.2", sourceIdCandidate: 118, verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED" },
  ],
  "knowledge-how-can-ai-tool-calling-be-made-reliable-6852c808": [
    { evidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE, canonicalUrlCandidate: "https://ai.google.dev/gemini-api/docs/function-calling", sourceIdCandidate: 79, verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED" },
  ],
  "knowledge-how-should-ai-agents-manage-secrets-credentials-and-identity-b9d24e27": [
    { evidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE, canonicalUrlCandidate: "https://www.nccoe.nist.gov/projects/software-and-ai-agent-identity-and-authorization", sourceIdCandidate: 117, verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED" },
  ],
  "knowledge-how-should-an-ai-agent-be-evaluated-before-production-use-bdab120b": [
    { evidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE, canonicalUrlCandidate: "https://www.nist.gov/news-events/news/2026/01/towards-best-practices-automated-benchmark-evaluations", sourceIdCandidate: 113, verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED" },
  ],
  "knowledge-how-should-an-ai-coding-agent-be-secured-d3c9c019": [
    { evidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE, canonicalUrlCandidate: "https://openai.com/index/running-codex-safely/", sourceIdCandidate: 1, verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED" },
  ],
  "knowledge-how-should-multiple-ai-agents-coordinate-and-delegate-work-8d45a76a": [
    { evidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE, canonicalUrlCandidate: "https://openai.github.io/openai-agents-python/multi_agent/", sourceIdCandidate: 116, verificationStatus: "SCRIPT_REFERENCE_UNVERIFIED" },
  ],
});

const knowledgeIds = [
  "knowledge-can-a-local-open-weight-model-replace-a-frontier-cloud-model-for-coding-a194ede4",
  "knowledge-how-can-ai-tool-calling-be-made-reliable-6852c808",
  "knowledge-how-should-ai-agents-manage-secrets-credentials-and-identity-b9d24e27",
  "knowledge-how-should-an-ai-agent-be-evaluated-before-production-use-bdab120b",
  "knowledge-how-should-an-ai-coding-agent-be-secured-d3c9c019",
  "knowledge-how-should-multiple-ai-agents-coordinate-and-delegate-work-8d45a76a",
] as const;

const unresolvedFields = Object.freeze(["canonicalUrl", "canonicalSourceId", "expectedConnector", "normalizedUrlHashInput"] as const);

function storyItem(id: number, title: string, cohort: StoryCohort): TraceV1M2ManifestItem {
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
    localIdentityEvidenceFile: TRACE_V1_M2_MANIFEST_EVIDENCE_FILE,
  };
}

function knowledgeItem(knowledgeId: string): TraceV1M2ManifestItem {
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
    localSourceReferenceCandidates: knowledgeSourceCandidates[knowledgeId],
    localIdentityEvidenceFile: TRACE_V1_M2_KNOWLEDGE_REFERENCE_FILE,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function traceV1M2ManifestBody(): TraceV1M2ManifestBody {
  const items = [
    ...primaryStories.map(([id, title]) => storyItem(id, title, "primary")),
    ...reserveStories.map(([id, title]) => storyItem(id, title, "reserve")),
    ...knowledgeIds.map((knowledgeId) => knowledgeItem(knowledgeId)),
  ];
  if (items.filter((item) => item.cohort === "primary").length !== 15) throw new Error("TRACE_V1_M2_PRIMARY_COUNT_INVALID");
  if (items.filter((item) => item.cohort === "reserve").length !== 5) throw new Error("TRACE_V1_M2_RESERVE_COUNT_INVALID");
  if (items.filter((item) => item.kind === "knowledge").length !== 6) throw new Error("TRACE_V1_M2_KNOWLEDGE_COUNT_INVALID");
  return {
    manifestVersion: TRACE_V1_M2_MANIFEST_VERSION,
    corpus: "trace-v1-initial-evidence-corpus",
    immutable: true,
    sourceIdentityPolicy: "LOCAL_EVIDENCE_ONLY",
    items,
  };
}

export async function buildTraceV1M2ManifestFromBody(body: TraceV1M2ManifestBody): Promise<TraceV1M2Manifest> {
  const manifestHash = await fingerprint(body);
  return deepFreeze({
    ...body,
    manifestHash,
    manifestIdentity: `${TRACE_V1_M2_MANIFEST_VERSION}:${manifestHash}`,
  });
}

export async function buildTraceV1M2Manifest(): Promise<TraceV1M2Manifest> {
  return buildTraceV1M2ManifestFromBody(traceV1M2ManifestBody());
}

/** Canonical JSON used for hashing and deterministic dry-run snapshots. */
export function serializeTraceV1M2Manifest(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeTraceV1M2Manifest).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serializeTraceV1M2Manifest(record[key])}`).join(",")}}`;
}
