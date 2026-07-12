// Source health monitoring
import type { Source, Env } from "../types";

export async function checkSourceHealth(env: Env, source: Source): Promise<void> {
  // Check if the source URL is still reachable
  try {
    const response = await fetch(source.url, {
      method: "HEAD",
      headers: { "User-Agent": "TheTraceManifest/0.1 (Health Check)" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      await markDegraded(env.DB, source.id, `HTTP ${response.status}`);
    }
  } catch (error: any) {
    await markDegraded(env.DB, source.id, error.message);
  }

  // Check for stale sources (not fetched in > 2x cadence)
  if (source.last_fetched_at) {
    const lastFetch = new Date(source.last_fetched_at);
    const maxAge = source.cadence_minutes * 2 * 60 * 1000; // 2x cadence in ms
    if (Date.now() - lastFetch.getTime() > maxAge) {
      await env.DB.prepare(
        "UPDATE sources SET health_status = 'degraded' WHERE id = ? AND health_status = 'healthy'"
      ).bind(source.id).run();
    }
  }
}

async function markDegraded(db: D1Database, sourceId: number, reason: string): Promise<void> {
  await db.prepare(
    "UPDATE sources SET health_status = CASE WHEN consecutive_failures >= 3 THEN 'failing' ELSE 'degraded' END, last_error_at = datetime('now'), last_error_message = ? WHERE id = ?"
  ).bind(reason, sourceId).run();
}

export async function disableFailingSource(db: D1Database, sourceId: number): Promise<void> {
  await db.prepare(
    "UPDATE sources SET active = 0, health_status = 'disabled' WHERE id = ? AND consecutive_failures >= 5"
  ).bind(sourceId).run();
}
