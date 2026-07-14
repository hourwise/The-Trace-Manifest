// Hacker News API fetcher
import type { Source } from "../types";

export async function fetchHackerNews(source: Source): Promise<Array<{
  external_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  raw_metadata: Record<string, unknown>;
}>> {
  try {
    // Fetch top stories from HN API
    const topResponse = await fetch(
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      { signal: AbortSignal.timeout(15000) }
    );
    if (!topResponse.ok) throw new Error(`HN API ${topResponse.status}`);

    const ids = await topResponse.json() as number[];
    const topIds = ids.slice(0, 30); // Top 30 stories

    const items = await Promise.all(
      topIds.map(async (id) => {
        try {
          const itemResponse = await fetch(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!itemResponse.ok) return null;
          return itemResponse.json() as any;
        } catch {
          return null;
        }
      })
    );

    return items
      .filter((item): item is any => item !== null && item.title && item.url)
      .map((item) => ({
        external_id: String(item.id),
        url: item.url,
        title: item.title,
        summary: item.text ? item.text.substring(0, 500) : null,
        content_excerpt: item.text ? item.text.substring(0, 300) : null,
        author: item.by || null,
        published_at: item.time ? new Date(item.time * 1000).toISOString() : null,
        raw_metadata: {
          feed_type: "hackernews",
          hn_id: item.id,
          score: item.score,
          descendants: item.descendants,
          type: item.type,
        },
      }));
  } catch (error: unknown) { throw error; }
}
