// RSS feed fetcher
import type { Source, RSSItem } from "../types";

export async function fetchRSS(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  const feedUrl = source.feed_url || source.url;
  if (!safeRemoteUrl(feedUrl)) throw new Error("RSS source URL is not eligible for remote ingestion.");

  try {
    const response = await fetchWithSafeRedirects(feedUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = (response.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (!contentType || (!contentType.includes("xml") && !contentType.includes("rss") && !contentType.includes("atom") && contentType !== "text/plain")) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("RSS response content type is not eligible for ingestion.");
    }

    const text = await readBoundedText(response, 2 * 1024 * 1024);
    return parseRSSXML(text);
  } catch (error: unknown) { throw error; }
}

async function fetchWithSafeRedirects(initialUrl: string): Promise<Response> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
    const response = await fetch(currentUrl, {
      headers: { "User-Agent": "TheTraceManifest/0.1 (RSS Ingestion Bot; +https://thetracemanifest.com)" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("Location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || redirectCount === 3) throw new Error("RSS redirect policy rejected the response.");
    const nextUrl = new URL(location, currentUrl).href;
    if (!safeRemoteUrl(nextUrl)) throw new Error("RSS redirect target is not eligible for remote ingestion.");
    currentUrl = nextUrl;
  }
  throw new Error("RSS redirect policy rejected the response.");
}

function safeRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return false;
    if (url.port && url.port !== "80" && url.port !== "443") return false;
    const host = url.hostname.toLowerCase();
    if (host.includes(":") || host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|169\.254\.|192\.168\.|0\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d{1,3})\./);
    return !(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  } catch {
    return false;
  }
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string> {
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("RSS response exceeds the ingestion limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("RSS response exceeds the ingestion limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseRSSXML(xml: string): Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}> {
  const items: ReturnType<typeof parseRSSXML> = [];

  // Split by <item and </item> to handle any attribute variations
  // Works for: <item>, <item rdf:about="...">, <item xmlns="...">
  const parts = xml.split(/<item[\s>]/i);
  
  for (let i = 1; i < parts.length; i++) {
    const endIdx = parts[i].lastIndexOf("</item>");
    if (endIdx === -1) continue;
    
    const block = parts[i].substring(0, endIdx);
    
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractLinkHref(block);
    const description = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
    const author = extractTag(block, "author") || extractTag(block, "dc:creator");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const guid = extractTag(block, "guid") || extractTag(block, "id");

    if (!title || !link || !safeRemoteUrl(link)) continue;

    items.push({
      external_id: guid || link || null,
      url: link,
      title: decodeHTML(title),
      summary: description ? decodeHTML(description) : null,
      content_excerpt: description ? decodeHTML(description).slice(0, 500) : null,
      author: author || null,
      published_at: pubDate ? normalizeDate(pubDate) : null,
      raw_metadata: { feedTitle: "", itemGuid: guid || null },
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, "is");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractLinkHref(xml: string): string | null {
  const match = xml.match(/<link[^>]*href="([^"]*)"/i);
  return match ? match[1] : null;
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function decodeHTML(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
