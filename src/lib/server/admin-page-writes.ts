import type { OperatorIdentity } from "../../security/access-auth";

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

/**
 * Promotes a `needs_review` candidate: candidate state, review cluster, audit
 * row and source link are written together. Every statement after the state
 * change is conditional on it, so a repeated or concurrent promotion of the
 * same candidate writes nothing and returns null instead of a second cluster.
 */
export async function promoteCandidate(db: D1Database, actor: PageOperator | undefined, input: PromotionInput): Promise<number | null> {
  const operator = requirePublisher(actor);
  const requestId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE editorial_candidates SET state='published', updated_at=datetime('now') WHERE id=? AND state='needs_review'")
      .bind(input.candidateId),
    db.prepare(`
      INSERT INTO story_clusters (title, canonical_url, topic, evidence_status, publication_status, needs_human_review, summary, why_it_matters, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'review', 1, ?, ?, datetime('now'), datetime('now')
      WHERE changes() = 1
    `).bind(input.headline, input.submittedUrl, input.topic, input.evidenceStatus, input.summary, input.summary.slice(0, 300)),
    // Records the new cluster id, and anchors the source-link statements below.
    auditStatement(db, operator, {
      action: "promote_candidate_to_cluster", targetType: "candidate", targetId: input.candidateId,
      detailCode: PROMOTED_CLUSTER_PREFIX, detailEndsWithLastInsert: true, onlyIfChanged: true, requestId,
    }),
  ];
  if (input.submittedUrl && input.urlHash) {
    const promoted = "EXISTS (SELECT 1 FROM admin_audit_log WHERE event_id = ?)";
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO feed_items (url, url_hash, title, summary, content_excerpt, source_id, ingestion_status, fetched_at, published_at)
        SELECT ?, ?, ?, ?, ?, ?, 'raw', datetime('now'), datetime('now')
        WHERE ${promoted}
      `).bind(input.submittedUrl, input.urlHash, input.headline, input.summary, input.summary.slice(0, 1000), 1, auditEventId(requestId)),
      // The feed item is found by hash, so an already-ingested URL links too.
      db.prepare(`
        INSERT OR IGNORE INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
        SELECT CAST(substr(a.detail_code, ?) AS INTEGER), f.id, 1
        FROM admin_audit_log a JOIN feed_items f ON f.url_hash = ?
        WHERE a.event_id = ?
      `).bind(PROMOTED_CLUSTER_PREFIX.length + 1, input.urlHash, auditEventId(requestId)),
    );
  }
  const results = await db.batch(statements);
  if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
  const clusterId = Number(results[1]?.meta?.last_row_id ?? 0);
  if (!clusterId) throw new AdminPageWriteError("Promotion did not create a story cluster.");
  return clusterId;
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
