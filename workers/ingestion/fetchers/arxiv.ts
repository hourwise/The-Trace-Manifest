// arXiv API fetcher
import type { Source, ArxivEntry } from "../types";

export async function fetchArxivPapers(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  // source.url should be an arXiv category like "cs.AI"
  // source.feed_url can override with a specific query
  const category = source.feed_url || source.url.replace(/^.*arxiv\.org\//, "");

  try {
    const apiUrl = `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(category)}&sortBy=submittedDate&sortOrder=descending&max_results=25`;

    const response = await fetch(apiUrl, {
      headers: { "User-Agent": "TheTraceManifest/0.1" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`arXiv API ${response.status}`);
    }

    const text = await response.text();
    return parseArxivAtom(text);
  } catch (error: unknown) { throw error; }
}

function parseArxivAtom(xml: string): Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}> {
  const items: ReturnType<typeof parseArxivAtom> = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  const blocks = xml.match(entryRegex) || [];

  for (const block of blocks) {
    const id = extractTag(block, "id");
    const title = extractTag(block, "title");
    const summary = extractTag(block, "summary");
    const published = extractTag(block, "published");
    const updated = extractTag(block, "updated");
    const arxivId = id ? id.replace(/^.*\/abs\//, "") : null;
    const url = arxivId ? `https://arxiv.org/abs/${arxivId}` : null;

    // Extract authors
    const authorMatches = block.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/gi) || [];
    const authors = authorMatches.map((a) => {
      const nameMatch = a.match(/<name>(.*?)<\/name>/);
      return nameMatch ? nameMatch[1].trim() : null;
    }).filter(Boolean);

    // Extract categories
    const categoryMatches = block.match(/<category[^>]*term="([^"]*)"/gi) || [];
    const categories = categoryMatches.map((c) => {
      const termMatch = c.match(/term="([^"]*)"/);
      return termMatch ? termMatch[1] : null;
    }).filter(Boolean);

    if (title && url) {
      items.push({
        external_id: arxivId || null,
        url,
        title: decodeHTML(title).trim(),
        summary: summary ? decodeHTML(stripHTML(summary)).trim().substring(0, 500) : null,
        content_excerpt: summary ? decodeHTML(summary).trim().substring(0, 300) : null,
        author: authors.length > 0 ? authors.join(", ") : null,
        published_at: published ? normalizeDate(published) : (updated ? normalizeDate(updated) : null),
        raw_metadata: {
          feed_type: "arxiv",
          arxiv_id: arxivId,
          authors,
          categories,
          primary_category: categories[0] || null,
        },
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
