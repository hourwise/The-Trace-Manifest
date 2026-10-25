// TRACE Weekly issue preparation (TRACE-RESTORE-01 Task E).
//
// Deterministic and human-approved: an issue is built only from stories that
// are currently publicly eligible (publicStoryEligibilitySql: published,
// reviewed, evidence not blocked; withdrawn and superseded excluded), within a
// 7-day publication window, in a fixed order. No model inference. A publisher
// reviews, excludes stories, edits the introduction, previews, approves the
// exact content (by hash), and marks it ready. Queuing it for sending is a
// separate, gated step (TRACE_NEWSLETTER_DISPATCH_ENABLED, off by default), and
// sending itself is the outbox's job (email-outbox.ts) behind its own gates.

import { publicStoryEligibilitySql } from "./d1";
import { escapeHtml, type IssueRenderer } from "./email-outbox";
import { sha256Hex } from "./newsletter";

export const MAX_ISSUE_STORIES = 8;
const SUMMARY_LIMIT = 420;
const WHY_LIMIT = 280;
const INTRO_LIMIT = 1_200;

export interface IssueStory {
  id: number;
  slug: string;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  evidenceStatus: string;
  publishedAt: string;
  topic: string | null;
}

export type IssueStatus = "draft" | "approved" | "ready_for_dispatch" | "dispatched" | "superseded" | "discarded";

export interface NewsletterIssue {
  id: string;
  issueDate: string;
  version: number;
  windowStart: string;
  windowEnd: string;
  status: IssueStatus;
  intro: string;
  stories: IssueStory[];
  excludedStoryIds: number[];
  contentHash: string;
  approvedBy: string | null;
  approvedAt: string | null;
  readyAt: string | null;
  dispatchKey: string | null;
  dispatchedAt: string | null;
}

type Operator = { email: string; role: string } | undefined;

export class NewsletterIssueError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "NewsletterIssueError"; }
}

function requirePublisher(operator: Operator): { email: string } {
  if (operator?.role !== "publisher" || !operator.email) throw new NewsletterIssueError("forbidden", "Only publishers can prepare, approve or dispatch TRACE Weekly.");
  return operator;
}

const ISSUE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The 7 UTC days ending on the issue date, inclusive. */
export function weeklyWindow(issueDate: string): { start: string; end: string } {
  if (!ISSUE_DATE.test(issueDate)) throw new NewsletterIssueError("invalid_date", "The issue date must be YYYY-MM-DD.");
  const end = new Date(`${issueDate}T23:59:59Z`);
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== issueDate) throw new NewsletterIssueError("invalid_date", "The issue date is not a real date.");
  const start = new Date(end.getTime() - 7 * 86_400_000 + 1_000);
  const sql = (date: Date) => date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  return { start: sql(start), end: sql(end) };
}

/** Trims to a word boundary; text stays plain (escaped when rendered), never interpreted. */
export function clip(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 40)).trimEnd()}…`;
}

export function defaultIntro(storyCount: number): string {
  return storyCount === 1
    ? "This week TRACE published one story. The summary below links to the full story with its sources, evidence rating and any corrections."
    : `This week TRACE published ${storyCount} stories. Each summary below links to the full story with its sources, evidence rating and any corrections.`;
}

/** Currently eligible stories published in the window, newest first, ties by id. One bounded statement. */
export async function selectWeeklyStories(db: D1Database, window: { start: string; end: string }, excluded: readonly number[] = []): Promise<IssueStory[]> {
  const { results } = await db.prepare(`
    SELECT sc.id, sc.slug, sc.title, sc.summary, sc.why_it_matters, sc.evidence_status, sc.published_at, sc.topic
    FROM story_clusters sc
    WHERE ${publicStoryEligibilitySql("sc")}
      AND datetime(sc.published_at) >= datetime(?) AND datetime(sc.published_at) <= datetime(?)
    ORDER BY datetime(sc.published_at) DESC, sc.id ASC
    LIMIT ?
  `).bind(window.start, window.end, MAX_ISSUE_STORIES + excluded.length).all<{
    id: number; slug: string; title: string; summary: string; why_it_matters: string | null; evidence_status: string; published_at: string; topic: string | null;
  }>();
  const seen = new Set<string>();
  const stories: IssueStory[] = [];
  for (const row of results ?? []) {
    if (excluded.includes(row.id) || seen.has(row.slug)) continue;
    seen.add(row.slug);
    stories.push({
      id: row.id, slug: row.slug, headline: row.title, summary: clip(row.summary, SUMMARY_LIMIT),
      whyItMatters: row.why_it_matters ? clip(row.why_it_matters, WHY_LIMIT) : null,
      evidenceStatus: row.evidence_status, publishedAt: row.published_at, topic: row.topic,
    });
    if (stories.length === MAX_ISSUE_STORIES) break;
  }
  return stories;
}

export async function issueContentHash(intro: string, stories: readonly IssueStory[]): Promise<string> {
  return sha256Hex(JSON.stringify({ intro, stories }));
}

interface IssueRow {
  id: string; issue_date: string; version: number; window_start: string; window_end: string; status: IssueStatus; intro: string;
  snapshot_json: string; excluded_story_ids_json: string; content_hash: string; approved_by: string | null; approved_at: string | null;
  approved_content_hash: string | null; ready_at: string | null; dispatch_key: string | null; dispatched_at: string | null;
}

function toIssue(row: IssueRow): NewsletterIssue {
  return {
    id: row.id, issueDate: row.issue_date, version: row.version, windowStart: row.window_start, windowEnd: row.window_end,
    status: row.status, intro: row.intro, stories: (JSON.parse(row.snapshot_json) as { stories: IssueStory[] }).stories,
    excludedStoryIds: JSON.parse(row.excluded_story_ids_json) as number[], contentHash: row.content_hash,
    approvedBy: row.approved_by, approvedAt: row.approved_at, readyAt: row.ready_at, dispatchKey: row.dispatch_key, dispatchedAt: row.dispatched_at,
  };
}

export async function getIssue(db: D1Database, id: string): Promise<NewsletterIssue | null> {
  const row = await db.prepare("SELECT * FROM newsletter_issues WHERE id = ?").bind(id).first<IssueRow>();
  return row ? toIssue(row) : null;
}

export async function listRecentIssues(db: D1Database, limit = 20): Promise<NewsletterIssue[]> {
  const { results } = await db.prepare("SELECT * FROM newsletter_issues ORDER BY issue_date DESC, version DESC LIMIT ?")
    .bind(Math.max(1, Math.min(limit, 50))).all<IssueRow>();
  return (results ?? []).map(toIssue);
}

const audit = (db: D1Database, operator: { email: string }, action: string, issueId: string, detail: string) => {
  const requestId = crypto.randomUUID();
  return db.prepare(`
    INSERT INTO admin_audit_log (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    SELECT ?, ?, 'publisher', ?, 'newsletter_issue', ?, ?, 'succeeded', ? WHERE changes() = 1
  `).bind(`${requestId}:succeeded`, operator.email, action, issueId, requestId, detail.slice(0, 240));
};

const stamp = (now: Date) => now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

export type GenerateOutcome = { status: "created"; issue: NewsletterIssue } | { status: "no_eligible_stories" };

/**
 * Builds a new draft version for the issue date from currently eligible
 * stories. Earlier drafts and approvals for that date that were not yet ready
 * are superseded; ready or dispatched issues are never touched.
 */
export async function generateIssueDraft(db: D1Database, actor: Operator, input: { issueDate: string; now?: Date }): Promise<GenerateOutcome> {
  const operator = requirePublisher(actor);
  const window = weeklyWindow(input.issueDate);
  const stories = await selectWeeklyStories(db, window);
  if (stories.length === 0) return { status: "no_eligible_stories" };
  const intro = defaultIntro(stories.length);
  const latest = await db.prepare("SELECT MAX(version) AS version FROM newsletter_issues WHERE issue_date = ?").bind(input.issueDate).first<{ version: number | null }>();
  const version = Number(latest?.version ?? 0) + 1;
  const id = crypto.randomUUID();
  const now = stamp(input.now ?? new Date());
  const contentHash = await issueContentHash(intro, stories);
  try {
    await db.batch([
      db.prepare(`
        UPDATE newsletter_issues SET status = 'superseded', updated_at = ?
        WHERE issue_date = ? AND status IN ('draft','approved')
      `).bind(now, input.issueDate),
      db.prepare(`
        INSERT INTO newsletter_issues (id, issue_date, version, window_start, window_end, status, intro, snapshot_json, content_hash, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
      `).bind(id, input.issueDate, version, window.start, window.end, intro, JSON.stringify({ stories }), contentHash, operator.email, now, now),
      audit(db, operator, "generate_newsletter_issue", id, `version:${version};stories:${stories.length}`),
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: newsletter_issues/.test(String(error))) throw new NewsletterIssueError("conflict", "Another draft for this date was created at the same time. Reload and try again.");
    throw error;
  }
  return { status: "created", issue: (await getIssue(db, id))! };
}

/**
 * Edits a draft (or an approved issue, which returns to draft: editing always
 * invalidates approval). Guarded on the content hash the editor saw.
 */
export async function editIssue(
  db: D1Database, actor: Operator, issueId: string,
  input: { expectedHash: string; intro?: string; excludeStoryId?: number; now?: Date },
): Promise<NewsletterIssue> {
  const operator = requirePublisher(actor);
  const issue = await getIssue(db, issueId);
  if (!issue || !["draft", "approved"].includes(issue.status)) throw new NewsletterIssueError("not_editable", "Only a draft or approved issue can be edited.");
  if (issue.contentHash !== input.expectedHash) throw new NewsletterIssueError("stale", "This issue changed since you opened it. Reload and review it again.");
  let intro = issue.intro;
  if (input.intro !== undefined) {
    intro = input.intro.replace(/\r\n/g, "\n").trim();
    if (intro.length < 20 || intro.length > INTRO_LIMIT) throw new NewsletterIssueError("invalid_intro", `The introduction must be 20–${INTRO_LIMIT} characters.`);
  }
  let stories = issue.stories;
  const excluded = [...issue.excludedStoryIds];
  if (input.excludeStoryId !== undefined) {
    if (!stories.some((story) => story.id === input.excludeStoryId)) throw new NewsletterIssueError("unknown_story", "That story is not in this issue.");
    stories = stories.filter((story) => story.id !== input.excludeStoryId);
    excluded.push(input.excludeStoryId);
    if (stories.length === 0) throw new NewsletterIssueError("empty_issue", "An issue needs at least one story. Discard it instead.");
  }
  const contentHash = await issueContentHash(intro, stories);
  const now = stamp(input.now ?? new Date());
  const [update] = await db.batch([
    db.prepare(`
      UPDATE newsletter_issues
      SET intro = ?, snapshot_json = ?, excluded_story_ids_json = ?, content_hash = ?, status = 'draft',
          approved_by = NULL, approved_at = NULL, approved_content_hash = NULL, updated_at = ?
      WHERE id = ? AND content_hash = ? AND status IN ('draft','approved')
    `).bind(intro, JSON.stringify({ stories }), JSON.stringify(excluded), contentHash, now, issueId, input.expectedHash),
    audit(db, operator, "edit_newsletter_issue", issueId, input.excludeStoryId !== undefined ? `excluded:${input.excludeStoryId}` : "intro"),
  ]);
  if (Number(update?.meta?.changes ?? 0) === 0) throw new NewsletterIssueError("stale", "This issue changed since you opened it. Reload and review it again.");
  return (await getIssue(db, issueId))!;
}

/**
 * Stories in the snapshot that are no longer publicly eligible, or whose
 * published headline, summary or why-it-matters changed since the draft.
 */
export async function changedIssueStories(db: D1Database, stories: readonly IssueStory[]): Promise<number[]> {
  if (stories.length === 0) return [];
  const { results } = await db.prepare(`
    SELECT sc.id, sc.slug, sc.title, sc.summary, sc.why_it_matters, sc.evidence_status
    FROM story_clusters sc
    WHERE sc.id IN (${stories.map(() => "?").join(", ")}) AND ${publicStoryEligibilitySql("sc")}
  `).bind(...stories.map((story) => story.id)).all<{ id: number; slug: string; title: string; summary: string; why_it_matters: string | null; evidence_status: string }>();
  const current = new Map((results ?? []).map((row) => [row.id, row]));
  return stories.filter((story) => {
    const row = current.get(story.id);
    return !row || row.slug !== story.slug || row.title !== story.headline || clip(row.summary, SUMMARY_LIMIT) !== story.summary
      || (row.why_it_matters ? clip(row.why_it_matters, WHY_LIMIT) : null) !== story.whyItMatters || row.evidence_status !== story.evidenceStatus;
  }).map((story) => story.id);
}

export type ApproveOutcome = { status: "approved"; issue: NewsletterIssue } | { status: "stories_changed"; storyIds: number[] };

/** Approves exactly the content (hash) the publisher reviewed, if every story is still eligible and unchanged. */
export async function approveIssue(db: D1Database, actor: Operator, issueId: string, expectedHash: string, now = new Date()): Promise<ApproveOutcome> {
  const operator = requirePublisher(actor);
  const issue = await getIssue(db, issueId);
  if (!issue || issue.status !== "draft") throw new NewsletterIssueError("not_draft", "Only a draft can be approved.");
  if (issue.contentHash !== expectedHash) throw new NewsletterIssueError("stale", "This issue changed since you opened it. Reload and review it again.");
  const changed = await changedIssueStories(db, issue.stories);
  if (changed.length > 0) return { status: "stories_changed", storyIds: changed };
  const at = stamp(now);
  const [update] = await db.batch([
    db.prepare(`
      UPDATE newsletter_issues SET status = 'approved', approved_by = ?, approved_at = ?, approved_content_hash = content_hash, updated_at = ?
      WHERE id = ? AND status = 'draft' AND content_hash = ?
    `).bind(operator.email, at, at, issueId, expectedHash),
    audit(db, operator, "approve_newsletter_issue", issueId, `hash:${expectedHash.slice(0, 16)}`),
  ]);
  if (Number(update?.meta?.changes ?? 0) === 0) throw new NewsletterIssueError("stale", "This issue changed since you opened it. Reload and review it again.");
  return { status: "approved", issue: (await getIssue(db, issueId))! };
}

export type ReadyOutcome = { status: "ready"; issue: NewsletterIssue } | { status: "stories_changed"; storyIds: number[] };

/** Marks the approved content ready for manual dispatch, fixing its unique dispatch key. */
export async function markIssueReady(db: D1Database, actor: Operator, issueId: string, now = new Date()): Promise<ReadyOutcome> {
  const operator = requirePublisher(actor);
  const issue = await getIssue(db, issueId);
  if (!issue || issue.status !== "approved") throw new NewsletterIssueError("not_approved", "Only an approved issue can be marked ready.");
  const changed = await changedIssueStories(db, issue.stories);
  if (changed.length > 0) return { status: "stories_changed", storyIds: changed };
  const at = stamp(now);
  const dispatchKey = `trace-weekly:${issue.issueDate}:v${issue.version}:${issue.contentHash.slice(0, 16)}`;
  const [update] = await db.batch([
    db.prepare(`
      UPDATE newsletter_issues SET status = 'ready_for_dispatch', ready_by = ?, ready_at = ?, dispatch_key = ?, updated_at = ?
      WHERE id = ? AND status = 'approved' AND approved_content_hash = content_hash AND content_hash = ?
    `).bind(operator.email, at, dispatchKey, at, issueId, issue.contentHash),
    audit(db, operator, "ready_newsletter_issue", issueId, dispatchKey),
  ]);
  if (Number(update?.meta?.changes ?? 0) === 0) throw new NewsletterIssueError("stale", "This issue changed since it was approved. Reload and review it again.");
  return { status: "ready", issue: (await getIssue(db, issueId))! };
}

export type DispatchOutcome =
  | { status: "disabled" }
  | { status: "queued"; recipients: number }
  | { status: "stories_changed"; storyIds: number[] };

/**
 * The future send interface: queues one outbox row per confirmed subscriber for
 * a ready issue and marks it dispatched, in one batch, at most once (guarded
 * status change, unique dispatch key, idempotent outbox keys). Off unless
 * TRACE_NEWSLETTER_DISPATCH_ENABLED is "true". Queuing sends nothing:
 * the outbox does, behind TRACE_EMAIL_DELIVERY_ENABLED.
 */
export async function queueIssueDispatch(
  db: D1Database, actor: Operator, issueId: string,
  options: { dispatchEnabled: boolean; now?: Date },
): Promise<DispatchOutcome> {
  const operator = requirePublisher(actor);
  if (!options.dispatchEnabled) return { status: "disabled" };
  const issue = await getIssue(db, issueId);
  if (!issue || issue.status !== "ready_for_dispatch") throw new NewsletterIssueError("not_ready", "Only a ready issue can be dispatched, and only once.");
  const changed = await changedIssueStories(db, issue.stories);
  if (changed.length > 0) return { status: "stories_changed", storyIds: changed };
  const at = stamp(options.now ?? new Date());
  // Each statement is conditional on the one before (changes() = 1): status,
  // then its audit row, then the recipients.
  const [update, , queued] = await db.batch([
    db.prepare(`
      UPDATE newsletter_issues SET status = 'dispatched', dispatched_by = ?, dispatched_at = ?, updated_at = ?
      WHERE id = ? AND status = 'ready_for_dispatch' AND approved_content_hash = content_hash
    `).bind(operator.email, at, at, issueId),
    audit(db, operator, "dispatch_newsletter_issue", issueId, issue.dispatchKey ?? ""),
    db.prepare(`
      INSERT OR IGNORE INTO email_outbox (id, idempotency_key, kind, subscriber_id, issue_id)
      SELECT lower(hex(randomblob(16))), ? || ':' || subscriber.id, 'newsletter_issue', subscriber.id, ?
      FROM newsletter_subscribers subscriber
      WHERE subscriber.status = 'confirmed' AND changes() = 1
    `).bind(issue.dispatchKey, issueId),
  ]);
  if (Number(update?.meta?.changes ?? 0) === 0) throw new NewsletterIssueError("not_ready", "Only a ready issue can be dispatched, and only once.");
  return { status: "queued", recipients: Number(queued?.meta?.changes ?? 0) };
}

const EVIDENCE_LABELS: Record<string, string> = {
  confirmed: "Confirmed", strongly_supported: "Strongly supported", provisionally_supported: "Provisionally supported",
  vendor_reported: "Vendor-reported", community_reported: "Community-reported", disputed: "Disputed", corrected: "Corrected",
};

function issueDateLabel(issueDate: string): string {
  return new Date(`${issueDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Renders an issue as HTML and plain text. Every value from the database is
 * escaped (HTML) or emitted as plain text; nothing is interpreted, so source
 * text cannot add links, markup or instructions. Deterministic for a given
 * issue and URLs.
 */
export function renderIssueEmail(issue: Pick<NewsletterIssue, "issueDate" | "intro" | "stories">, urls: { siteUrl: string; unsubscribeUrl: string }): { subject: string; html: string; text: string } {
  const date = issueDateLabel(issue.issueDate);
  const subject = `TRACE Weekly — ${date}`;
  const storyUrl = (story: IssueStory) => `${urls.siteUrl}/stories/${encodeURIComponent(story.slug)}`;
  const label = (story: IssueStory) => EVIDENCE_LABELS[story.evidenceStatus] ?? story.evidenceStatus.replace(/_/g, " ");
  const published = (story: IssueStory) => new Date(story.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const paragraphs = issue.intro.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f5f5f4;"><div style="max-width:600px;margin:0 auto;padding:20px 16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1917;line-height:1.55;">`,
    `<p style="margin:0;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#57534e;">The Trace Manifest</p>`,
    `<h1 style="margin:4px 0 2px;font-size:26px;">TRACE Weekly</h1><p style="margin:0 0 16px;color:#57534e;">${escapeHtml(date)}</p>`,
    ...paragraphs.map((part) => `<p style="margin:0 0 12px;">${escapeHtml(part)}</p>`),
    `<h2 style="margin:20px 0 8px;font-size:18px;">Top stories</h2>`,
    ...issue.stories.map((story) => [
      `<div style="background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:14px;margin:0 0 12px;">`,
      `<h3 style="margin:0 0 4px;font-size:17px;"><a href="${escapeHtml(storyUrl(story))}" style="color:#1c1917;">${escapeHtml(story.headline)}</a></h3>`,
      `<p style="margin:0 0 8px;font-size:13px;color:#57534e;">Evidence: ${escapeHtml(label(story))} · Published ${escapeHtml(published(story))}</p>`,
      `<p style="margin:0 0 8px;">${escapeHtml(story.summary)}</p>`,
      story.whyItMatters ? `<p style="margin:0;"><strong>Why it matters:</strong> ${escapeHtml(story.whyItMatters)}</p>` : "",
      `</div>`,
    ].join("")),
    `<p style="margin:16px 0 4px;font-size:13px;color:#57534e;">Evidence ratings describe what the published sources support at publication; see <a href="${escapeHtml(`${urls.siteUrl}/methodology`)}">how TRACE rates evidence</a>. Mistakes are corrected in public: <a href="${escapeHtml(`${urls.siteUrl}/corrections`)}">corrections ledger</a>.</p>`,
    `<p style="margin:12px 0 0;font-size:12px;color:#78716c;">You receive TRACE Weekly because you confirmed a subscription. <a href="${escapeHtml(urls.unsubscribeUrl)}">Unsubscribe</a>.</p>`,
    `</div></body></html>`,
  ].join("");

  const text = [
    `TRACE Weekly — ${date}`,
    "",
    ...paragraphs.flatMap((part) => [part, ""]),
    "TOP STORIES",
    "",
    ...issue.stories.flatMap((story, index) => [
      `${index + 1}. ${story.headline}`,
      `   Evidence: ${label(story)} · Published ${published(story)}`,
      `   ${story.summary}`,
      ...(story.whyItMatters ? [`   Why it matters: ${story.whyItMatters}`] : []),
      `   Read: ${storyUrl(story)}`,
      "",
    ]),
    `How TRACE rates evidence: ${urls.siteUrl}/methodology`,
    `Corrections ledger: ${urls.siteUrl}/corrections`,
    "",
    `You receive TRACE Weekly because you confirmed a subscription. Unsubscribe: ${urls.unsubscribeUrl}`,
  ].join("\n");
  return { subject, html, text };
}

/** The outbox's issue renderer: only a dispatched issue is ever rendered for sending. */
export function dispatchedIssueRenderer(db: D1Database, siteUrl: string): IssueRenderer {
  return async (issueId, unsubscribeUrl) => {
    const issue = await getIssue(db, issueId);
    if (!issue || issue.status !== "dispatched") return null;
    return renderIssueEmail(issue, { siteUrl, unsubscribeUrl });
  };
}
