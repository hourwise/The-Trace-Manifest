import type { OperatorIdentity } from "../../security/access-auth";
import {
  classifySourceRelationship, findFeedItemByUrlHash, loadSourceMemberships, primarySourceKey, type SourceMembership,
} from "./source-identity";

// /admin/desk and /admin/social write D1 from page frontmatter rather than
// through the signed admin proxy. These helpers give those writes the proxy's
// guarantees: publisher-only, attributed to the signed-in operator, and
// committed in one batch with their admin_audit_log row, so a write never
// lands without its audit record (or the reverse).

export class AdminPageWriteError extends Error {}

type PageOperator = Pick<OperatorIdentity, "email" | "role">;

function requirePublisher(operator: PageOperator | undefined): PageOperator {
  if (operator?.role !== "publisher" || !operator.email) {
    throw new AdminPageWriteError("Publisher access is required.");
  }
  return operator;
}

interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  detailCode?: string | null;
  /** Record the audit row only if the previous statement changed exactly one row. */
  onlyIfChanged?: boolean;
  /** Use the row id the previous statement inserted as the target id. */
  targetIsLastInsert?: boolean;
  /** Append the row id the previous statement inserted to detailCode. */
  detailEndsWithLastInsert?: boolean;
  requestId?: string;
}

function auditStatement(db: D1Database, operator: PageOperator, entry: AuditEntry): D1PreparedStatement {
  const requestId = entry.requestId ?? crypto.randomUUID();
  const targetId = entry.targetIsLastInsert ? "CAST(last_insert_rowid() AS TEXT)" : "?";
  const detailCode = entry.detailEndsWithLastInsert ? "? || last_insert_rowid()" : "?";
  const statement = db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome, detail_code)
    SELECT ?, ?, ?, ?, ?, ${targetId}, ?, 'succeeded', ${detailCode}
    ${entry.onlyIfChanged ? "WHERE changes() = 1" : ""}
  `);
  const head = [auditEventId(requestId), operator.email, operator.role, entry.action, entry.targetType];
  const tail = [requestId, entry.detailCode ?? null];
  return entry.targetIsLastInsert
    ? statement.bind(...head, ...tail)
    : statement.bind(...head, entry.targetId ?? null, ...tail);
}

const auditEventId = (requestId: string) => `${requestId}:succeeded`;

export interface CandidateInput {
  intakeType: string;
  submittedUrl: string | null;
  leadText: string;
  sourceHash: string;
  section: string | null;
  urgency: string;
  sourceLanguage: string | null;
}

export async function recordCandidate(db: D1Database, actor: PageOperator | undefined, input: CandidateInput): Promise<string> {
  const operator = requirePublisher(actor);
  const candidateId = crypto.randomUUID();
  await db.batch([
    db.prepare(`
      INSERT INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, section_slug, urgency, source_language, created_by)
      VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
    `).bind(candidateId, input.intakeType, input.submittedUrl, input.leadText, input.sourceHash, input.section, input.urgency, input.sourceLanguage, operator.email),
    auditStatement(db, operator, { action: "submit_candidate", targetType: "candidate", targetId: candidateId, detailCode: `intake:${input.intakeType}` }),
  ]);
  return candidateId;
}

/** Moves a candidate only if it is still in `fromState`; returns false if it changed meanwhile. */
export async function transitionCandidate(
  db: D1Database, actor: PageOperator | undefined, candidateId: string, fromState: string, toState: string,
): Promise<boolean> {
  const operator = requirePublisher(actor);
  const [update] = await db.batch([
    db.prepare("UPDATE editorial_candidates SET state=?, updated_at=datetime('now') WHERE id=? AND state=?")
      .bind(toState, candidateId, fromState),
    auditStatement(db, operator, {
      action: "transition_candidate", targetType: "candidate", targetId: candidateId,
      detailCode: `${fromState}->${toState}`, onlyIfChanged: true,
    }),
  ]);
  return Number(update?.meta?.changes ?? 0) > 0;
}

export interface PromotionInput {
  candidateId: string;
  submittedUrl: string | null;
  urlHash: string | null;
  headline: string;
  summary: string;
  topic: string;
  evidenceStatus: string;
}

const PROMOTED_CLUSTER_PREFIX = "story_cluster:";
const REUSED_CLUSTER_PREFIX = "reused_story_cluster:";

export type PromotionOutcome =
  /** A new review cluster seeded by this candidate's source. */
  | { kind: "created"; clusterId: number }
  /** The source item already belongs to exactly one current cluster: the candidate is linked to it, nothing new is created. */
  | { kind: "reused"; clusterId: number; title: string; publicationStatus: string }
  /** The source is held only by withdrawn/superseded clusters, or by several current ones: nothing is written; an editor decides. */
  | { kind: "conflict"; reason: "retired" | "ambiguous"; clusters: SourceMembership[] }
  /** The candidate is no longer in needs_review (repeat or concurrent promotion). */
  | { kind: "not_promotable" }
  /** The source gained a cluster between the check and the write; nothing was written. */
  | { kind: "source_changed" };

/**
 * Promotes a `needs_review` candidate (TRACE Desk), aware of clusters that
 * automated ingestion already created for the same source item
 * (TRACE-EDITORIAL-DEDUPE-R1):
 * - no cluster holds the source: candidate state, review cluster (with its
 *   unique primary_source_key), audit row and source link are written in one
 *   batch, each statement conditional on the guarded state change;
 * - one current cluster holds it: the candidate is linked to that cluster;
 * - only retired clusters, or several current ones, hold it: a conflict is
 *   returned and nothing is written.
 */
export async function promoteCandidate(db: D1Database, actor: PageOperator | undefined, input: PromotionInput): Promise<PromotionOutcome> {
  const operator = requirePublisher(actor);
  const urlHash = input.submittedUrl && input.urlHash ? input.urlHash : null;
  if (urlHash) {
    const feedItem = await findFeedItemByUrlHash(db, urlHash);
    const relationship = classifySourceRelationship(feedItem ? (await loadSourceMemberships(db, [feedItem.id])).get(feedItem.id) ?? [] : []);
    if (relationship.kind === "retired") return { kind: "conflict", reason: "retired", clusters: relationship.retired };
    if (relationship.kind === "ambiguous") return { kind: "conflict", reason: "ambiguous", clusters: relationship.clusters };
    if (relationship.kind === "exact") return reuseSourceCluster(db, operator, input.candidateId, relationship.cluster);
  }
  return createPromotedCluster(db, operator, input, urlHash);
}

async function promotionFailure(db: D1Database, candidateId: string): Promise<PromotionOutcome> {
  const candidate = await db.prepare("SELECT state FROM editorial_candidates WHERE id = ?").bind(candidateId).first<{ state: string }>();
  return candidate?.state === "needs_review" ? { kind: "source_changed" } : { kind: "not_promotable" };
}

async function reuseSourceCluster(db: D1Database, operator: PageOperator, candidateId: string, cluster: SourceMembership): Promise<PromotionOutcome> {
  const [update] = await db.batch([
    // Guarded on the membership still being current, so a cluster withdrawn
    // since the check is never adopted.
    db.prepare(`
      UPDATE editorial_candidates SET state='published', updated_at=datetime('now')
      WHERE id=? AND state='needs_review'
        AND EXISTS (
          SELECT 1 FROM story_cluster_members member JOIN story_clusters cluster ON cluster.id = member.cluster_id
          WHERE member.feed_item_id = ? AND member.cluster_id = ? AND cluster.publication_status NOT IN ('withdrawn','superseded')
        )
    `).bind(candidateId, cluster.feedItemId, cluster.clusterId),
    auditStatement(db, operator, {
      action: "promote_candidate_to_cluster", targetType: "candidate", targetId: candidateId,
      detailCode: `${REUSED_CLUSTER_PREFIX}${cluster.clusterId}`, onlyIfChanged: true,
    }),
  ]);
  if (Number(update?.meta?.changes ?? 0) === 0) return promotionFailure(db, candidateId);
  return { kind: "reused", clusterId: cluster.clusterId, title: cluster.title, publicationStatus: cluster.publicationStatus };
}

async function createPromotedCluster(db: D1Database, operator: PageOperator, input: PromotionInput, urlHash: string | null): Promise<PromotionOutcome> {
  const requestId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    // When the candidate has a source, the state change is also guarded on no
    // cluster having taken that source since the check.
    db.prepare(`
      UPDATE editorial_candidates SET state='published', updated_at=datetime('now')
      WHERE id=? AND state='needs_review'
        AND (? IS NULL OR NOT EXISTS (
          SELECT 1 FROM feed_items item JOIN story_cluster_members member ON member.feed_item_id = item.id
          WHERE item.url_hash = ?
        ))
    `).bind(input.candidateId, urlHash, urlHash),
    db.prepare(`
      INSERT INTO story_clusters (title, canonical_url, topic, evidence_status, publication_status, needs_human_review, summary, why_it_matters, primary_source_key, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'review', 1, ?, ?, ?, datetime('now'), datetime('now')
      WHERE changes() = 1
    `).bind(input.headline, input.submittedUrl, input.topic, input.evidenceStatus, input.summary, input.summary.slice(0, 300), urlHash ? primarySourceKey(urlHash) : null),
    // Records the new cluster id, and anchors the source-link statements below.
    auditStatement(db, operator, {
      action: "promote_candidate_to_cluster", targetType: "candidate", targetId: input.candidateId,
      detailCode: PROMOTED_CLUSTER_PREFIX, detailEndsWithLastInsert: true, onlyIfChanged: true, requestId,
    }),
  ];
  if (urlHash) {
    const promoted = "EXISTS (SELECT 1 FROM admin_audit_log WHERE event_id = ?)";
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO feed_items (url, url_hash, title, summary, content_excerpt, source_id, ingestion_status, fetched_at, published_at)
        SELECT ?, ?, ?, ?, ?, ?, 'raw', datetime('now'), datetime('now')
        WHERE ${promoted}
      `).bind(input.submittedUrl, urlHash, input.headline, input.summary, input.summary.slice(0, 1000), 1, auditEventId(requestId)),
      // The feed item is found by hash, so an already-ingested URL links too.
      db.prepare(`
        INSERT OR IGNORE INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
        SELECT CAST(substr(a.detail_code, ?) AS INTEGER), f.id, 1
        FROM admin_audit_log a JOIN feed_items f ON f.url_hash = ?
        WHERE a.event_id = ?
      `).bind(PROMOTED_CLUSTER_PREFIX.length + 1, urlHash, auditEventId(requestId)),
    );
  }
  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch (error) {
    // Clustering seeded a cluster from the same primary source concurrently;
    // the unique primary_source_key rolled the whole promotion back.
    if (/UNIQUE constraint failed: story_clusters\.primary_source_key/.test(String(error))) return { kind: "source_changed" };
    throw error;
  }
  if (Number(results[0]?.meta?.changes ?? 0) === 0) return promotionFailure(db, input.candidateId);
  const clusterId = Number(results[1]?.meta?.last_row_id ?? 0);
  if (!clusterId) throw new AdminPageWriteError("Promotion did not create a story cluster.");
  return { kind: "created", clusterId };
}

export interface SocialSignalInput {
  platform: string;
  canonicalUrl: string;
  canonicalUrlHash: string;
  reason: string;
  authorDisplayName: string | null;
  authorHandle: string | null;
  notes: string;
}

export async function recordSocialSignal(db: D1Database, actor: PageOperator | undefined, input: SocialSignalInput): Promise<void> {
  const operator = requirePublisher(actor);
  await db.batch([
    db.prepare(`
      INSERT INTO social_signals (platform, canonical_url, canonical_url_hash, submitted_by, submission_reason, author_display_name, author_handle, reviewer_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(input.platform, input.canonicalUrl, input.canonicalUrlHash, operator.email, input.reason, input.authorDisplayName, input.authorHandle, input.notes),
    auditStatement(db, operator, {
      action: "submit_social_signal", targetType: "social_signal", targetIsLastInsert: true, detailCode: `platform:${input.platform}`,
    }),
  ]);
}

/**
 * Records a reviewer decision on a pending signal. Approval only records the
 * review: under ADR 0009 a social post is a discovery signal, not evidence, so
 * it is never turned into an approved knowledge document here.
 * Returns false if the signal does not exist or was already reviewed.
 */
export async function reviewSocialSignal(
  db: D1Database, actor: PageOperator | undefined, signalId: number, decision: "approve" | "reject", traceSummary: string | null,
): Promise<boolean> {
  const operator = requirePublisher(actor);
  const reviewStatus = decision === "approve" ? "approved" : "rejected";
  const [update] = await db.batch([
    db.prepare(`
      UPDATE social_signals SET review_status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
      trace_summary = COALESCE(?, trace_summary), updated_at = datetime('now')
      WHERE id = ? AND review_status = 'pending'
    `).bind(reviewStatus, operator.email, traceSummary, signalId),
    auditStatement(db, operator, {
      action: `${decision}_social_signal`, targetType: "social_signal", targetId: String(signalId), onlyIfChanged: true,
    }),
  ]);
  return Number(update?.meta?.changes ?? 0) > 0;
}
