// URL deduplication utilities
import { sourceUrlHash } from "../../src/lib/server/source-identity";

/** url_hash for a feed item. Shared with Desk promotion (TRACE-EDITORIAL-DEDUPE-R1). */
export async function hashURL(url: string): Promise<string> {
  return sourceUrlHash(url);
}

export interface ExistingFeedItem {
  id: number;
  source_id: number;
  url: string;
  ingestion_status: string;
}

/** Load the canonical duplicate row once so downstream duplicate handling can reuse it. */
export async function deduplicateURL(db: D1Database, urlHash: string): Promise<ExistingFeedItem | null> {
  return db.prepare(
    "SELECT id, source_id, url, ingestion_status FROM feed_items WHERE url_hash = ? LIMIT 1"
  ).bind(urlHash).first<ExistingFeedItem>();
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
