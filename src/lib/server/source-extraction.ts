/**
 * Deterministic HTML source extraction for Knowledge Continuity KC-03B.
 *
 * This module only interprets an already-admitted, bounded HTML string. It
 * does not fetch, persist, enqueue, call an AI provider, or promote evidence.
 * Source offsets are retained so KC-04 can create resolvable chunk locators.
 */

export type HtmlExtractionContainer = "article" | "main" | "body" | "document";
export type HtmlExtractionBlockKind =
  | "heading"
  | "paragraph"
  | "list_item"
  | "blockquote"
  | "preformatted"
  | "table_cell"
  | "other";

export interface HtmlExtractionBlock {
  kind: HtmlExtractionBlockKind;
  text: string;
  sourceStart: number;
  sourceEnd: number;
  locator: string;
  headingLevel?: number;
}

export interface HtmlExtractionDiagnostics {
  extractionMethod: "deterministic_html_v1";
  inputBytes: number;
  outputCharacters: number;
  blockCount: number;
  headingCount: number;
  container: HtmlExtractionContainer;
  truncated: boolean;
  removedElements: Record<string, number>;
  warnings: string[];
}

export interface ExtractedHtmlDocument {
  extractionState: "extracted" | "metadata_only";
  title: string | null;
  author: string | null;
  authorHandle: string | null;
  publishedAt: string | null;
  description: string | null;
  headings: Array<{
    level: number;
    text: string;
    sourceStart: number;
    sourceEnd: number;
    locator: string;
  }>;
  blocks: HtmlExtractionBlock[];
  text: string;
  diagnostics: HtmlExtractionDiagnostics;
}

export interface HtmlExtractionOptions {
  maxTextCharacters?: number;
  maxBlocks?: number;
}

const DEFAULT_MAX_TEXT_CHARACTERS = 120_000;
const DEFAULT_MAX_BLOCKS = 600;
const META_DATE_KEYS = new Set([
  "article:published_time",
  "date",
  "datepublished",
  "dc.date",
  "dc.date.issued",
  "pubdate",
  "publishdate",
  "published_time",
]);

type ContainerSelection = {
  kind: HtmlExtractionContainer;
  html: string;
  offset: number;
};

type Metadata = {
  title: string | null;
  author: string | null;
  authorHandle: string | null;
  publishedAt: string | null;
  description: string | null;
};

/** Extracts bounded, locator-ready document structure from admitted HTML. */
export function extractHtmlDocument(
  html: string,
  options: HtmlExtractionOptions = {},
): ExtractedHtmlDocument {
  const maxTextCharacters = boundedPositive(options.maxTextCharacters, DEFAULT_MAX_TEXT_CHARACTERS);
  const maxBlocks = boundedPositive(options.maxBlocks, DEFAULT_MAX_BLOCKS);
  const metadata = extractMetadata(html);
  const selected = selectContainer(html);
  const removal = removeUntrustedElements(selected.html);
  const candidates = extractBlocks(removal.html, selected.offset);
  const warnings: string[] = [];

  if (selected.kind === "document") warnings.push("No article or main container was found; the document body was used.");
  if (candidates.length === 0) warnings.push("No block-level main content was found.");
  if (candidates.length > maxBlocks) warnings.push(`Block output was capped at ${maxBlocks}.`);

  const retained: HtmlExtractionBlock[] = [];
  let remaining = maxTextCharacters;
  let truncated = candidates.length > maxBlocks;
  for (const candidate of candidates.slice(0, maxBlocks)) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const separatorLength = retained.length > 0 ? 2 : 0;
    const available = remaining - separatorLength;
    if (available <= 0) {
      truncated = true;
      break;
    }
    if (candidate.text.length > available) {
      retained.push({ ...candidate, text: candidate.text.slice(0, available).trimEnd() });
      truncated = true;
      break;
    }
    retained.push(candidate);
    remaining -= separatorLength + candidate.text.length;
  }
  if (truncated) warnings.push("Main content was truncated to the configured extraction bounds.");

  const text = retained.map((block) => block.text).filter(Boolean).join("\n\n");
  const headings = retained
    .filter((block): block is HtmlExtractionBlock & { headingLevel: number } => block.kind === "heading" && block.headingLevel !== undefined)
    .map((block) => ({
      level: block.headingLevel,
      text: block.text,
      sourceStart: block.sourceStart,
      sourceEnd: block.sourceEnd,
      locator: block.locator,
    }));

  if (!text && !metadata.title && !metadata.description) warnings.push("The document contained no usable text or metadata.");

  return {
    extractionState: text ? "extracted" : "metadata_only",
    ...metadata,
    headings,
    blocks: retained,
    text,
    diagnostics: {
      extractionMethod: "deterministic_html_v1",
      inputBytes: new TextEncoder().encode(html).byteLength,
      outputCharacters: text.length,
      blockCount: retained.length,
      headingCount: headings.length,
      container: selected.kind,
      truncated,
      removedElements: removal.removedElements,
      warnings,
    },
  };
}

function boundedPositive(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 500_000) : fallback;
}

function selectContainer(html: string): ContainerSelection {
  for (const kind of ["article", "main", "body"] as const) {
    const match = html.match(new RegExp(`<${kind}\\b[^>]*>([\\s\\S]*?)<\\/${kind}\\s*>`, "i"));
    if (match && match[1].trim()) {
      const start = match.index ?? 0;
      return { kind, html: match[1], offset: start + match[0].indexOf(match[1]) };
    }
  }
  return { kind: "document", html, offset: 0 };
}

function extractMetadata(html: string): Metadata {
  const metadata: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const key = (attributes.property ?? attributes.name ?? attributes.itemprop ?? "").trim().toLowerCase();
    const content = attributes.content ? cleanText(attributes.content) : "";
    if (key && content && !metadata[key]) metadata[key] = content;
  }

  const jsonLd = extractJsonLdMetadata(html);
  const title = firstValue(metadata["og:title"], metadata["twitter:title"], jsonLd.title, extractTitle(html));
  const author = firstValue(metadata.author, metadata["article:author"], metadata.byline, jsonLd.author);
  const authorHandle = firstValue(metadata["twitter:creator"], metadata["author:handle"]);
  const publishedAt = firstValue(
    ...[...META_DATE_KEYS].map((key) => metadata[key]),
    jsonLd.publishedAt,
    extractTimeDate(html),
  );
  const description = firstValue(metadata["og:description"], metadata["twitter:description"], metadata.description);

  return {
    title: title ? cleanText(title).slice(0, 500) || null : null,
    author: author ? cleanText(author).slice(0, 500) || null : null,
    authorHandle: authorHandle ? cleanText(authorHandle).slice(0, 200) || null : null,
    publishedAt: publishedAt ? cleanText(publishedAt).slice(0, 128) || null : null,
    description: description ? cleanText(description).slice(0, 2_000) || null : null,
  };
}

function firstValue(...values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
}

function extractJsonLdMetadata(html: string): { title: string | null; author: string | null; publishedAt: string | null } {
  let title: string | null = null;
  let author: string | null = null;
  let publishedAt: string | null = null;
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const value: unknown = JSON.parse(match[1]);
      const records = flattenJsonLd(value);
      for (const record of records) {
        title ??= stringValue(record.headline) ?? stringValue(record.name);
        publishedAt ??= stringValue(record.datePublished) ?? stringValue(record.dateCreated);
        if (!author) {
          const authorValue = record.author;
          if (typeof authorValue === "string") author = authorValue;
          else if (authorValue && typeof authorValue === "object" && !Array.isArray(authorValue)) {
            author = stringValue((authorValue as Record<string, unknown>).name);
          }
        }
      }
    } catch {
      // Invalid JSON-LD is untrusted page content, not an extraction failure.
    }
  }
  return { title, author, publishedAt };
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const graph = Array.isArray(record["@graph"]) ? record["@graph"].flatMap(flattenJsonLd) : [];
  return [record, ...graph];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return match ? cleanText(match[1]) || null : null;
}

function extractTimeDate(html: string): string | null {
  const match = html.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
  return match ? cleanText(match[1]) || null : null;
}

function removeUntrustedElements(html: string): { html: string; removedElements: Record<string, number> } {
  const removedElements: Record<string, number> = {};
  let result = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "svg", "template", "canvas", "iframe", "object", "embed", "nav", "header", "footer", "aside", "form"]) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    const matches = result.match(pattern) ?? [];
    if (matches.length > 0) removedElements[tag] = matches.length;
    result = result.replace(pattern, " ");
  }
  return { html: result, removedElements };
}

function extractBlocks(html: string, offset: number): HtmlExtractionBlock[] {
  const blocks: HtmlExtractionBlock[] = [];
  const pattern = /<(h[1-6]|p|li|blockquote|pre|td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const rawText = match[2]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|article|section|h[1-6]|blockquote|pre|tr|td|th)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    const text = cleanText(rawText);
    if (!text) continue;
    const sourceStart = offset + (match.index ?? 0);
    const sourceEnd = sourceStart + match[0].length;
    const tag = match[1].toLowerCase();
    const headingLevel = tag.startsWith("h") ? Number(tag.slice(1)) : undefined;
    blocks.push({
      kind: headingLevel ? "heading" : blockKindFor(tag),
      text,
      sourceStart,
      sourceEnd,
      locator: `html:${sourceStart}-${sourceEnd}`,
      ...(headingLevel ? { headingLevel } : {}),
    });
  }
  if (blocks.length === 0) {
    const text = cleanText(html.replace(/<[^>]+>/g, " "));
    if (text) blocks.push({ kind: "other", text, sourceStart: offset, sourceEnd: offset + html.length, locator: `html:${offset}-${offset + html.length}` });
  }
  return blocks;
}

function blockKindFor(tag: string): HtmlExtractionBlockKind {
  if (tag === "p") return "paragraph";
  if (tag === "li") return "list_item";
  if (tag === "blockquote") return "blockquote";
  if (tag === "pre") return "preformatted";
  if (tag === "td" || tag === "th") return "table_cell";
  return "other";
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const expression = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(tag))) {
    const name = match[1].toLowerCase();
    if (name === "meta") continue;
    attributes[name] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, entity: string) => {
      const codePoint = entity.toLowerCase().startsWith("x") ? Number.parseInt(entity.slice(1), 16) : Number.parseInt(entity, 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    });
}
