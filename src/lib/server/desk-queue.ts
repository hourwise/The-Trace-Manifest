/**
 * TRACE Desk candidate queue: one filter at a time, with per-state counts, so
 * candidates waiting on an editor (`held`, then `needs_review`) are never
 * buried under newer intake. The default filter lists only those two.
 *
 * Read-only and bounded: keyset-paginated by (rank, created_at, id), where
 * rank puts `held` before `needs_review` in the default filter and is constant
 * elsewhere; a single-state filter is served by
 * idx_editorial_candidates_state_created. The counts are one GROUP BY.
 */

import { DESK_STATE_LABELS } from "../admin/desk-transitions";

export const DESK_QUEUE_PAGE_SIZE = 50;

export const DESK_QUEUE_FILTERS = [
  "decide", "held", "needs_review", "draft_ready", "drafting", "new", "published", "rejected", "archived", "all",
] as const;
export type DeskQueueFilter = typeof DESK_QUEUE_FILTERS[number];
export const DESK_QUEUE_DEFAULT_FILTER: DeskQueueFilter = "decide";

export const DESK_QUEUE_FILTER_LABELS: Readonly<Record<DeskQueueFilter, string>> = {
  decide: "Needs a decision",
  held: DESK_STATE_LABELS.held, needs_review: DESK_STATE_LABELS.needs_review, draft_ready: DESK_STATE_LABELS.draft_ready,
  drafting: DESK_STATE_LABELS.drafting, new: DESK_STATE_LABELS.new, published: DESK_STATE_LABELS.published,
  rejected: DESK_STATE_LABELS.rejected, archived: DESK_STATE_LABELS.archived,
  all: "All",
};

// The states each filter lists; `all` lists every state, including ones the
// Desk has no filter for (for example `failed`).
const FILTER_STATES: Readonly<Record<DeskQueueFilter, readonly string[] | null>> = {
  decide: ["held", "needs_review"],
  held: ["held"], needs_review: ["needs_review"], draft_ready: ["draft_ready"], drafting: ["drafting"],
  new: ["new"], published: ["published"], rejected: ["rejected"], archived: ["archived"],
  all: null,
};

export interface DeskCandidateRow {
  id: string; intake_type: string; submitted_url: string | null;
  lead_text: string | null; state: string; section_slug: string | null;
  topic_slug: string | null; urgency: string; development_status: string | null;
  source_language: string | null; created_by: string; created_at: string;
  updated_at: string;
}

export interface DeskQueuePage {
  filter: DeskQueueFilter;
  items: DeskCandidateRow[];
  counts: Record<DeskQueueFilter, number>;
  /** True when this page continues from a cursor rather than the start of the filter. */
  continued: boolean;
  nextCursor: string | null;
}

export function parseDeskQueueFilter(value: string | null | undefined): DeskQueueFilter {
  return (DESK_QUEUE_FILTERS as readonly string[]).includes(value ?? "") ? value as DeskQueueFilter : DESK_QUEUE_DEFAULT_FILTER;
}

interface DeskQueueCursor { rank: number; createdAt: string; id: string }

/** Cursor: base64url of `${rank}\u0000${created_at}\u0000${id}`; anything malformed restarts. */
export function encodeDeskQueueCursor(cursor: DeskQueueCursor): string {
  return btoa(`${cursor.rank}\u0000${cursor.createdAt}\u0000${cursor.id}`).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeDeskQueueCursor(cursor: string | null | undefined): DeskQueueCursor | null {
  if (!cursor || cursor.length > 400 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const decoded = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
    const [rank, createdAt, id, ...rest] = decoded.split("\u0000");
    if (rest.length || (rank !== "0" && rank !== "1") || !createdAt || !id || createdAt.length > 40 || id.length > 200) return null;
    return { rank: Number(rank), createdAt, id };
  } catch {
    return null;
  }
}

export async function loadDeskQueue(
  db: D1Database,
  options: { filter?: string | null; cursor?: string | null; pageSize?: number } = {},
): Promise<DeskQueuePage> {
  const filter = parseDeskQueueFilter(options.filter);
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? DESK_QUEUE_PAGE_SIZE), 1), DESK_QUEUE_PAGE_SIZE);
  const states = FILTER_STATES[filter];
  const rank = filter === "decide" ? "CASE state WHEN 'held' THEN 0 ELSE 1 END" : "0";
  const cursor = decodeDeskQueueCursor(options.cursor);

  const where: string[] = [];
  const args: Array<string | number> = [];
  if (states) {
    where.push(`state IN (${states.map(() => "?").join(", ")})`);
    args.push(...states);
  }
  if (cursor) {
    where.push(`(${rank} > ? OR (${rank} = ? AND (created_at < ? OR (created_at = ? AND id < ?))))`);
    args.push(cursor.rank, cursor.rank, cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const [listed, grouped] = await Promise.all([
    db.prepare(`
      SELECT id, intake_type, submitted_url, lead_text, state, section_slug, topic_slug, urgency, development_status, source_language, created_by, created_at, updated_at,
        ${rank} AS queue_rank
      FROM editorial_candidates
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY queue_rank ASC, created_at DESC, id DESC
      LIMIT ?
    `).bind(...args, pageSize + 1).all<DeskCandidateRow & { queue_rank: number }>(),
    db.prepare("SELECT state, COUNT(*) AS n FROM editorial_candidates GROUP BY state").all<{ state: string; n: number }>(),
  ]);

  const byState = new Map((grouped.results ?? []).map((row) => [row.state, Number(row.n)]));
  const counts = Object.fromEntries(DESK_QUEUE_FILTERS.map((key) => {
    const keyStates = FILTER_STATES[key];
    const count = keyStates
      ? keyStates.reduce((sum, state) => sum + (byState.get(state) ?? 0), 0)
      : [...byState.values()].reduce((sum, n) => sum + n, 0);
    return [key, count];
  })) as Record<DeskQueueFilter, number>;

  const rows = listed.results ?? [];
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return {
    filter,
    items: page.map(({ queue_rank: _rank, ...row }) => row),
    counts,
    continued: cursor !== null,
    nextCursor: rows.length > pageSize && last
      ? encodeDeskQueueCursor({ rank: Number(last.queue_rank), createdAt: last.created_at, id: last.id })
      : null,
  };
}
