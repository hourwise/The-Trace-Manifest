import type { ExtractedHtmlDocument, HtmlExtractionBlock, HtmlExtractionContainer } from "./source-extraction";

/** Hash semantics for source versions created after migration 0059. */
export const SOURCE_HASH_SEMANTICS_VERSION = "normalized_content_v1" as const;
export const LEGACY_SOURCE_HASH_SEMANTICS_VERSION = "legacy_raw_v1" as const;

export type SourceIdentityMediaKind = "html" | "markdown" | "plain_text" | "json" | "pdf" | "image" | "other";

export interface SourceIdentityInput {
  mediaKind: SourceIdentityMediaKind;
  body: string;
  extraction?: ExtractedHtmlDocument | null;
}

export interface SourceIdentityResult {
  normalizedContentHash: string;
  hashSemanticsVersion: typeof SOURCE_HASH_SEMANTICS_VERSION;
  canonicalContent: string;
  diagnostics: SourceIdentityDiagnostics;
}

/** Privacy-safe component hashes for explaining normalized identity changes. */
export interface SourceIdentityDiagnostics {
  normalizedMetadataHash: string;
  normalizedBlocksHash: string;
  normalizedLinksHash: string;
  normalizedStructureHash: string;
  blockCount: number;
  linkCount: number;
  headingCount: number;
  extractionContainer: HtmlExtractionContainer | "not_applicable";
  extractionTruncated: boolean;
  normalizationPolicyVersion: string;
}

type CanonicalIdentityParts = {
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  blocks: unknown;
  links: unknown;
  structure: Record<string, unknown>;
  blockCount: number;
  linkCount: number;
  headingCount: number;
  extractionContainer: SourceIdentityDiagnostics["extractionContainer"];
  extractionTruncated: boolean;
};

/** Hash exact UTF-8 body bytes when a retrieval boundary has no byte hash. */
export async function hashTransportBody(body: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(body));
}

/**
 * Build a deterministic, evidence-bearing identity. Volatile document shell
 * markup is intentionally absent; the extraction module has already removed
 * scripts, styles, navigation, hydration and other non-evidence elements.
 */
export function canonicalNormalizedContent(input: SourceIdentityInput): string {
  return JSON.stringify(canonicalIdentityParts(input).content);
}

function canonicalIdentityParts(input: SourceIdentityInput): CanonicalIdentityParts {
  const policy = policyVersionFor(input.mediaKind);
  let content: Record<string, unknown>;
  let metadata: Record<string, unknown> = { title: null, author: null, publishedAt: null, description: null };
  let blocks: unknown = [];
  let links: unknown = [];
  let structure: Record<string, unknown> = { policy, mediaKind: input.mediaKind };
  let blockCount = 0;
  let linkCount = 0;
  let headingCount = 0;
  let extractionContainer: SourceIdentityDiagnostics["extractionContainer"] = "not_applicable";
  let extractionTruncated = false;
  if (input.mediaKind === "html") {
    const extraction = input.extraction;
    metadata = {
      title: normalizeInline(extraction?.title),
      author: normalizeInline(extraction?.author),
      publishedAt: normalizeInline(extraction?.publishedAt),
      description: normalizeInline(extraction?.description),
    };
    blocks = (extraction?.blocks ?? []).map(normalizedBlock);
    links = (extraction?.links ?? []).map((link) => ({
      href: normalizeLink(link.href),
      text: normalizeInline(link.text),
    }));
    const blockStructure = (blocks as Array<Record<string, unknown>>).map((block) => ({
      kind: block.kind,
      headingLevel: block.headingLevel,
    }));
    blockCount = extraction?.diagnostics.blockCount ?? blockStructure.length;
    linkCount = extraction?.links.length ?? 0;
    headingCount = extraction?.diagnostics.headingCount ?? blockStructure.filter((block) => block.kind === "heading").length;
    extractionContainer = extraction?.diagnostics.container ?? "document";
    extractionTruncated = extraction?.diagnostics.truncated ?? false;
    structure = { policy, mediaKind: input.mediaKind, blocks: blockStructure, linkCount };
    content = {
      policy,
      mediaKind: input.mediaKind,
      ...metadata,
      blocks,
      links,
    };
  } else if (input.mediaKind === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.body);
    } catch {
      throw new Error("JSON source content is not valid JSON.");
    }
    const value = canonicalValue(parsed);
    blocks = { value };
    content = { policy, mediaKind: input.mediaKind, value };
  } else {
    const text = normalizeLineContent(input.body);
    blocks = { text };
    content = {
      policy,
      mediaKind: input.mediaKind,
      text,
    };
  }
  return {
    content, metadata, blocks, links, structure,
    blockCount, linkCount, headingCount, extractionContainer, extractionTruncated,
  };
}

export async function hashNormalizedSourceContent(input: SourceIdentityInput): Promise<SourceIdentityResult> {
  const parts = canonicalIdentityParts(input);
  const canonicalContent = JSON.stringify(parts.content);
  const normalizationPolicyVersion = policyVersionFor(input.mediaKind);
  const [normalizedContentHash, normalizedMetadataHash, normalizedBlocksHash, normalizedLinksHash, normalizedStructureHash] = await Promise.all([
    sha256(canonicalContent),
    sha256(JSON.stringify(parts.metadata)),
    sha256(JSON.stringify(parts.blocks)),
    sha256(JSON.stringify(parts.links)),
    sha256(JSON.stringify(parts.structure)),
  ]);
  return {
    normalizedContentHash,
    hashSemanticsVersion: SOURCE_HASH_SEMANTICS_VERSION,
    canonicalContent,
    diagnostics: {
      normalizedMetadataHash,
      normalizedBlocksHash,
      normalizedLinksHash,
      normalizedStructureHash,
      blockCount: parts.blockCount,
      linkCount: parts.linkCount,
      headingCount: parts.headingCount,
      extractionContainer: parts.extractionContainer,
      extractionTruncated: parts.extractionTruncated,
      normalizationPolicyVersion,
    },
  };
}

export function policyVersionFor(mediaKind: SourceIdentityMediaKind): string {
  return `source-normalized-${mediaKind}-v1`;
}

function normalizedBlock(block: HtmlExtractionBlock): Record<string, unknown> {
  return {
    kind: block.kind,
    headingLevel: block.headingLevel ?? null,
    text: block.kind === "preformatted" ? normalizePreformatted(block.text) : normalizeInline(block.text),
  };
}

function normalizeInline(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/\s+/g, " ").trim() || null;
}

function normalizePreformatted(value: string): string {
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n").trim();
}

function normalizeLineContent(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLink(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite JSON values are not supported.");
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error("Sparse arrays are not supported in source identity.");
    }
    return value.map(canonicalValue);
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Unsupported object value in source identity.");
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalValue(record[key])]));
  }
  throw new Error("Unsupported source identity value.");
}

async function sha256(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
