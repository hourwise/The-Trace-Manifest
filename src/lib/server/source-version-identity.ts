import type { ExtractedHtmlDocument, HtmlExtractionBlock } from "./source-extraction";

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
}

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
  const policy = policyVersionFor(input.mediaKind);
  let content: Record<string, unknown>;
  if (input.mediaKind === "html") {
    const extraction = input.extraction;
    content = {
      policy,
      mediaKind: input.mediaKind,
      title: normalizeInline(extraction?.title),
      author: normalizeInline(extraction?.author),
      publishedAt: normalizeInline(extraction?.publishedAt),
      description: normalizeInline(extraction?.description),
      blocks: (extraction?.blocks ?? []).map(normalizedBlock),
      links: (extraction?.links ?? []).map((link) => ({
        href: normalizeLink(link.href),
        text: normalizeInline(link.text),
      })),
    };
  } else if (input.mediaKind === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.body);
    } catch {
      throw new Error("JSON source content is not valid JSON.");
    }
    content = { policy, mediaKind: input.mediaKind, value: canonicalValue(parsed) };
  } else {
    content = {
      policy,
      mediaKind: input.mediaKind,
      text: normalizeLineContent(input.body),
    };
  }
  return JSON.stringify(content);
}

export async function hashNormalizedSourceContent(input: SourceIdentityInput): Promise<SourceIdentityResult> {
  const canonicalContent = canonicalNormalizedContent(input);
  return {
    normalizedContentHash: await sha256(canonicalContent),
    hashSemanticsVersion: SOURCE_HASH_SEMANTICS_VERSION,
    canonicalContent,
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
