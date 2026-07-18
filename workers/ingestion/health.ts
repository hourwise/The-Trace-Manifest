// Source health monitoring
import type { Source } from "./types";
import type { Env } from "./index";

const DAILY_SCHEDULE_WINDOW_MINUTES = 25 * 60;

/**
 * The ingestion outcome is the authoritative source-health signal. The daily
 * health task only detects a source which has missed its expected scheduler
 * window; probing a publisher's landing page produces false failures when it
 * redirects or rejects HEAD requests.
 */
export function sourceHealthWindowMinutes(source: Pick<Source, "tier" | "cadence_minutes">): number {
  // Tier B and C ingestion is scheduled once per day, regardless of a source's
  // preferred cadence. Allow one complete daily window plus an hour of grace.
  const schedulerWindow = source.tier === "A" ? 0 : DAILY_SCHEDULE_WINDOW_MINUTES;
  return Math.max(source.cadence_minutes * 2, schedulerWindow);
}

export function isSourceStale(
  source: Pick<Source, "tier" | "cadence_minutes" | "last_fetched_at">,
  now = Date.now(),
): boolean {
  if (!source.last_fetched_at) return false;

  // D1's datetime('now') is UTC and omits the timezone suffix.
  const fetchedAt = Date.parse(`${source.last_fetched_at.replace(" ", "T")}Z`);
  if (!Number.isFinite(fetchedAt)) return false;

  return now - fetchedAt > sourceHealthWindowMinutes(source) * 60_000;
}

export async function checkSourceHealth(env: Env, source: Source): Promise<void> {
  if (!isSourceStale(source)) return;

  await env.DB.prepare(
    `UPDATE sources
     SET health_status = 'degraded', last_error_at = datetime('now'),
         last_error_message = 'No ingestion attempt completed within the expected scheduler window.'
     WHERE id = ? AND health_status = 'healthy'`
  ).bind(source.id).run();
}

export async function disableFailingSource(db: D1Database, sourceId: number): Promise<void> {
  await db.prepare(
    "UPDATE sources SET active = 0, health_status = 'disabled' WHERE id = ? AND consecutive_failures >= 5"
  ).bind(sourceId).run();
}
