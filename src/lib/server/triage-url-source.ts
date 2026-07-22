import {
  retrieveRemoteSource,
  SourceRetrievalError,
  type SourceRetrievalAuditEvent,
} from "./source-retrieval";

const MAX_EXCERPT_LENGTH = 3_500;

export interface ExtractedTriageSource {
  title: string;
  excerpt: string;
  finalUrl: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
}

// Compatibility export for the existing triage API. KC-03 callers should use
// SourceRetrievalError and its stable `code` rather than a triage-only class.
export { SourceRetrievalError as TriageUrlFetchError } from "./source-retrieval";

/**
 * Retrieves a single, editor-requested public HTML page for AI triage.
 * It deliberately does not follow links embedded in the page, use cookies,
 * or persist the retrieved text.
 */
export async function extractTriageUrlSource(
  value: string,
  onAudit?: (event: SourceRetrievalAuditEvent) => void | Promise<void>,
): Promise<ExtractedTriageSource> {
  const retrieved = await retrieveRemoteSource(value, {
    allowedContentTypes: ["text/html", "application/xhtml+xml"],
    maximumBytes: 256 * 1024,
    timeoutMs: 12_000,
    maxRedirects: 3,
    userAgent: "TheTraceManifest/0.1 (editorial URL triage; +https://thetracemanifest.com)",
    acceptHeader: "text/html,application/xhtml+xml;q=0.9",
    onAudit,
  });
  return extractPageData(retrieved.body, retrieved.finalUrl);
}

function extractPageData(html: string, finalUrl: string): ExtractedTriageSource {
  const metadata = extractMetadata(html);
  const pageTitle = metadata["og:title"] ?? metadata["twitter:title"] ?? extractTitle(html) ?? new URL(finalUrl).hostname;
  const description = metadata["og:description"] ?? metadata["twitter:description"] ?? metadata.description ?? "";
  const authorDisplayName = metadata.author ?? metadata["article:author"] ?? null;
  const authorHandle = metadata["twitter:creator"] ?? null;
  const visibleText = extractVisibleText(html);
  const excerpt = [
    description ? `PAGE DESCRIPTION: ${description}` : "",
    authorDisplayName ? `PAGE AUTHOR: ${authorDisplayName}` : "",
    authorHandle ? `PAGE AUTHOR HANDLE: ${authorHandle}` : "",
    visibleText ? `VISIBLE PAGE TEXT: ${visibleText}` : "",
  ].filter(Boolean).join("\n\n").slice(0, MAX_EXCERPT_LENGTH);

  if (!excerpt) throw new SourceRetrievalError("The public page did not contain usable text or metadata.", 422, "response_empty");
  return {
    title: cleanText(pageTitle).slice(0, 300) || new URL(finalUrl).hostname,
    excerpt,
    finalUrl,
    authorDisplayName: authorDisplayName ? cleanText(authorDisplayName).slice(0, 300) || null : null,
    authorHandle: authorHandle ? cleanText(authorHandle).slice(0, 300) || null : null,
  };
}

function extractMetadata(html: string): Record<string, string> {
  const selected = new Set(["og:title", "twitter:title", "og:description", "twitter:description", "description", "author", "article:author", "twitter:creator"]);
  const metadata: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const key = (attributes.property ?? attributes.name ?? attributes.itemprop ?? "").trim().toLowerCase();
    const content = attributes.content ? cleanText(attributes.content) : "";
    if (selected.has(key) && content && !metadata[key]) metadata[key] = content;
  }
  return metadata;
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

function extractTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return match ? cleanText(match[1]) : "";
}

function extractVisibleText(html: string): string {
  return cleanText(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<\/(?:p|div|li|article|section|h[1-6]|blockquote|pre|tr)\s*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
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
