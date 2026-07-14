// Source health monitoring
import type { Source } from "./types";
import type { Env } from "./index";

export async function checkSourceHealth(env: Env, source: Source): Promise<void> {
  if (!safeRemoteUrl(source.url)) {
    await markDegraded(env.DB, source.id, "Source URL is not eligible for remote health checks.");
    return;
  }
  // Check if the source URL is still reachable
  try {
    const response = await fetch(source.url, {
      method: "HEAD",
      headers: { "User-Agent": "TheTraceManifest/0.1 (Health Check)" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      await markDegraded(env.DB, source.id, `HTTP ${response.status}`);
    }
  } catch {
    await markDegraded(env.DB, source.id, "Source health request failed.");
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

function safeRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const private172 = host.match(/^172\.(\d{1,3})\./);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username && !url.password && (!url.port || url.port === "80" || url.port === "443")
      && !host.includes(":") && host !== "localhost" && !host.endsWith(".local")
      && !/^(127\.|10\.|169\.254\.|192\.168\.|0\.)/.test(host)
      && !(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  } catch {
    return false;
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
