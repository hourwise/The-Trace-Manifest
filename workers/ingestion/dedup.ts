// URL deduplication utilities

export async function hashURL(url: string): Promise<string> {
  // Normalize URL before hashing
  const normalized = normalizeURL(url);
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deduplicateURL(db: D1Database, urlHash: string): Promise<boolean> {
  const existing = await db.prepare(
    "SELECT id FROM feed_items WHERE url_hash = ? LIMIT 1"
  ).bind(urlHash).first();

  return !!existing;
}

export async function deduplicateTitle(db: D1Database, title: string, sourceId: number, windowDays: number = 7): Promise<boolean> {
  // Simple exact-title dedup within a time window for the same source
  const existing = await db.prepare(
    `SELECT id FROM feed_items 
     WHERE source_id = ? 
     AND title = ? 
     AND published_at >= datetime('now', ?) 
     LIMIT 1`
  ).bind(sourceId, title, `-${windowDays} days`).first();

  return !!existing;
}

function normalizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove tracking parameters
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source", "fbclid", "gclid"];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    // Remove trailing slash for consistency
    let normalized = parsed.toString();
    if (normalized.endsWith("/") && !parsed.pathname.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}
