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

  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "TheTraceManifest/0.1 (RSS Ingestion Bot; +https://thetracemanifest.com)" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    return parseRSSXML(text);
  } catch (error: any) {
    console.error(`RSS fetch failed for ${source.name}: ${error.message}`);
    throw error;
  }
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

    if (!title && !link) continue; // Skip empty blocks

    items.push({
      external_id: guid || link || null,
      url: link || "",
      title: decodeHTML(title || "Untitled"),
      summary: decodeHTML(description),
      content_excerpt: decodeHTML(description)?.slice(0, 500) ?? null,
      author: author || null,
      published_at: pubDate || null,
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
