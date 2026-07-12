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

  // Simple regex-based RSS/Atom parser (no XML library dependency)
  // Matches <item> blocks in RSS 2.0 and <entry> blocks in Atom
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;

  const blocks = xml.match(itemRegex) || xml.match(entryRegex) || [];

  for (const block of blocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractLinkHref(block);
    const description = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
    const author = extractTag(block, "author") || extractTag(block, "dc:creator");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const guid = extractTag(block, "guid") || extractTag(block, "id");

    if (title && link) {
      items.push({
        external_id: guid || null,
        url: link,
        title: decodeHTML(title).trim(),
        summary: description ? decodeHTML(stripHTML(description)).trim().substring(0, 500) : null,
        content_excerpt: description ? decodeHTML(description).trim().substring(0, 300) : null,
        author: author ? decodeHTML(author).trim() : null,
        published_at: pubDate ? normalizeDate(pubDate) : null,
        raw_metadata: { feed_type: "rss", raw_date: pubDate },
      });
    }
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
