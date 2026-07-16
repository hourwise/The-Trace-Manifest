import { fetchRSS } from "../workers/ingestion/fetchers/rss";
import type { Source } from "../workers/ingestion/types";

const discoverySources = [
  { id: 1, name: "Google AI Blog", url: "https://blog.google/technology/ai/", feed_url: "https://blog.google/technology/ai/rss/", tier: "A" as const, treatment: "vendor-reported", cadence_minutes: 60 },
  { id: 2, name: "The Verge AI", url: "https://www.theverge.com/ai-artificial-intelligence", feed_url: "https://www.theverge.com/rss/index.xml", tier: "B" as const, treatment: "independent-reporting", cadence_minutes: 60 },
  { id: 3, name: "MarkTechPost", url: "https://www.marktechpost.com/", feed_url: "https://www.marktechpost.com/feed/", tier: "C" as const, treatment: "discovery", cadence_minutes: 120 },
  { id: 4, name: "ByteByteGo", url: "https://blog.bytebytego.com/", feed_url: "https://blog.bytebytego.com/feed", tier: "B" as const, treatment: "specialist-analysis", cadence_minutes: 720 },
  { id: 5, name: "Product Hunt", url: "https://www.producthunt.com/", feed_url: "https://www.producthunt.com/feed", tier: "C" as const, treatment: "discovery", cadence_minutes: 360 },
  { id: 6, name: "The Pragmatic Engineer", url: "https://newsletter.pragmaticengineer.com/", feed_url: "https://newsletter.pragmaticengineer.com/feed", tier: "B" as const, treatment: "specialist-analysis", cadence_minutes: 720 },
  { id: 7, name: "Stratechery", url: "https://stratechery.com/", feed_url: "https://stratechery.com/feed/", tier: "B" as const, treatment: "specialist-analysis", cadence_minutes: 720 },
  { id: 8, name: "MCP Radar", url: "https://mcp.liqiwa.com/", feed_url: "https://mcp.liqiwa.com/feed.xml", tier: "C" as const, treatment: "discovery", cadence_minutes: 1440 },
];

const results: Array<{ name: string; status: "healthy" | "rejected"; items?: number; error?: string }> = [];

for (const source of discoverySources) {
  try {
    const items = await fetchRSS({
      ...source, section: "F", ingestion_type: "rss", active: true,
      last_fetched_at: null, last_success_at: null, last_error_at: null, last_error_message: null,
      consecutive_failures: 0, health_status: "unknown", licence_terms: null, commercial_restrictions: null,
      requires_review: true,
    } satisfies Source);
    results.push({ name: source.name, status: "healthy", items: items.length });
  } catch (error) {
    results.push({ name: source.name, status: "rejected", error: error instanceof Error ? error.message : String(error) });
  }
}

console.log(JSON.stringify(results, null, 2));

if (results.some((result) => result.status === "rejected")) process.exitCode = 1;
