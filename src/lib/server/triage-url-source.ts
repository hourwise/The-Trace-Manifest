const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_EXCERPT_LENGTH = 3_500;

export interface ExtractedTriageSource {
  title: string;
  excerpt: string;
  finalUrl: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
}

export class TriageUrlFetchError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 | 503,
  ) {
    super(message);
    this.name = "TriageUrlFetchError";
  }
}

/**
 * Retrieves a single, editor-requested public HTML page for AI triage.
 * It deliberately does not follow links embedded in the page, use cookies,
 * or persist the retrieved text.
 */
export async function extractTriageUrlSource(value: string): Promise<ExtractedTriageSource> {
  const initialUrl = eligibleRemoteUrl(value);
  if (!initialUrl) {
    throw new TriageUrlFetchError("The submitted URL is not eligible for remote triage.", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = initialUrl;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      let response: Response;
      try {
        response = await fetch(currentUrl.href, {
          headers: {
            "Accept": "text/html,application/xhtml+xml;q=0.9",
            "User-Agent": "TheTraceManifest/0.1 (editorial URL triage; +https://thetracemanifest.com)",
          },
          redirect: "manual",
          signal: controller.signal,
        });
      } catch {
        throw new TriageUrlFetchError("The URL could not be retrieved for triage.", 503);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("Location");
        await response.body?.cancel().catch(() => undefined);
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new TriageUrlFetchError("The URL redirect could not be safely followed.", 422);
        }
        let nextUrl: URL | null = null;
        try {
          nextUrl = eligibleRemoteUrl(new URL(location, currentUrl).href);
        } catch {
          throw new TriageUrlFetchError("The URL redirect could not be safely followed.", 422);
        }
        if (!nextUrl) {
          throw new TriageUrlFetchError("The URL redirect is not eligible for remote triage.", 422);
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new TriageUrlFetchError("The URL did not return a public page for triage.", 422);
      }

      const contentType = (response.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
        await response.body?.cancel().catch(() => undefined);
        throw new TriageUrlFetchError("The URL did not return an HTML page for triage.", 422);
      }

      const html = await readBoundedHtml(response);
      return extractPageData(html, currentUrl.href);
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new TriageUrlFetchError("The URL redirect could not be safely followed.", 422);
}

function eligibleRemoteUrl(value: string): URL | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    if (!hostname || !hostname.includes(".") || hostname.includes(":") || isIpv4) return null;
    if (
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.endsWith(".local")
      || hostname.endsWith(".internal")
      || hostname.endsWith(".home")
      || hostname.endsWith(".lan")
    ) return null;

    return url;
  } catch {
    return null;
  }
}

async function readBoundedHtml(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new TriageUrlFetchError("The page is too large to triage safely.", 422);
  }
  if (!response.body) throw new TriageUrlFetchError("The URL returned an empty page.", 422);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TriageUrlFetchError("The page is too large to triage safely.", 422);
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof TriageUrlFetchError) throw error;
    throw new TriageUrlFetchError("The URL could not be retrieved for triage.", 503);
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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

  if (!excerpt) throw new TriageUrlFetchError("The public page did not contain usable text or metadata.", 422);
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
