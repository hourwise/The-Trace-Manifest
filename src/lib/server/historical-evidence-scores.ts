import {
  recalculateEvidenceScores,
  type RecalculateEvidenceResult,
} from "./evidence-recalculation";

/** KC-11G: the first historical score is a replay-safe bootstrap snapshot. */
export const KC11G_INITIAL_SNAPSHOT_IDENTITY = "kc-11g-initial-score";
export const KC11G_INITIAL_TRIGGER = "historical_backfill_initial" as const;

export interface HistoricalEvidenceScoreOptions {
  limit?: number;
  cursor?: string | null;
  dryRun?: boolean;
}

export interface HistoricalEvidenceScoreResult extends RecalculateEvidenceResult {
  state: "completed" | "partial";
  selectedClaims: number;
  processed: number;
  nextCursor: string | null;
  remaining: number | null;
  dryRun: boolean;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function boundedLimit(value: number | undefined): number {
  if (!Number.isInteger(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(value as number, 1), MAX_LIMIT);
}

function eligibleClaimWhere(): string {
  return `
    claim.current_state <> 'retired'
    AND (
      EXISTS (
        SELECT 1
        FROM story_claims story_claim
        JOIN story_clusters story ON story.id = story_claim.story_cluster_id
        WHERE story_claim.canonical_claim_id = claim.id
          AND story.publication_status = 'published'
          AND story.published_at IS NOT NULL
          AND story.reviewed_by IS NOT NULL
          AND story.reviewed_at IS NOT NULL
      )
      OR EXISTS (
        SELECT 1
        FROM knowledge_document_claims document_claim
        JOIN knowledge_documents document ON document.id = document_claim.knowledge_document_id
        WHERE document_claim.canonical_claim_id = claim.id
          AND document.status = 'approved'
          AND document.visibility IN ('public_knowledge', 'public_guide')
          AND document.approved_by IS NOT NULL
          AND document.approved_at IS NOT NULL
          AND (document.hard_expiry IS NULL OR datetime(document.hard_expiry) > datetime('now'))
          AND NOT EXISTS (
            SELECT 1
            FROM knowledge_change_proposals proposal
            WHERE proposal.knowledge_document_id = document.id
              AND proposal.state = 'proposed'
          )
      )
    )
  `;
}

function initialClaimSnapshotPrefix(): string {
  return `score-snapshot:${KC11G_INITIAL_SNAPSHOT_IDENTITY}:claim:`;
}

async function selectClaims(
  db: D1Database,
  limit: number,
  cursor: string | null,
): Promise<string[]> {
  const rows = await db.prepare(`
    SELECT claim.id
    FROM canonical_claims claim
    WHERE ${eligibleClaimWhere()}
      AND NOT EXISTS (
        SELECT 1
        FROM canonical_claim_score_snapshots snapshot
        WHERE snapshot.id = ? || claim.id
      )
      AND (? IS NULL OR claim.id > ?)
    ORDER BY claim.id ASC
    LIMIT ?
  `).bind(initialClaimSnapshotPrefix(), cursor, cursor, limit).all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

async function hasMoreClaims(db: D1Database, cursor: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT 1 AS present
    FROM canonical_claims claim
    WHERE ${eligibleClaimWhere()}
      AND NOT EXISTS (
        SELECT 1
        FROM canonical_claim_score_snapshots snapshot
        WHERE snapshot.id = ? || claim.id
      )
      AND claim.id > ?
    LIMIT 1
  `).bind(initialClaimSnapshotPrefix(), cursor).first<{ present: number }>();
  return Boolean(row?.present);
}

/**
 * Calculate the first score snapshot for approved/published-linked history.
 *
 * The source-of-truth inputs are loaded by the existing recalculation service.
 * A deterministic snapshot identity makes a crash between the snapshot and
 * its explanation safe to replay, while the existing status-approval policy
 * prevents a material status change from silently becoming a publication.
 */
export async function bootstrapHistoricalEvidenceScores(
  db: D1Database,
  options: HistoricalEvidenceScoreOptions = {},
): Promise<HistoricalEvidenceScoreResult> {
  const limit = boundedLimit(options.limit);
  const cursor = options.cursor ?? null;
  const claimIds = await selectClaims(db, limit, cursor);
  if (claimIds.length === 0) {
    return {
      state: "completed",
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      claimIds: [],
      storyIds: [],
      claimSnapshots: 0,
      storySnapshots: 0,
      statusChanges: 0,
      approvalRequests: 0,
      selectedClaims: 0,
      processed: 0,
      nextCursor: null,
      remaining: 0,
      dryRun: options.dryRun === true,
    };
  }

  if (options.dryRun) {
    const nextCursor = claimIds.length === limit ? claimIds.at(-1)! : null;
    return {
      state: nextCursor ? "partial" : "completed",
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      claimIds,
      storyIds: [],
      claimSnapshots: 0,
      storySnapshots: 0,
      statusChanges: 0,
      approvalRequests: 0,
      selectedClaims: claimIds.length,
      processed: 0,
      nextCursor,
      remaining: nextCursor ? null : 0,
      dryRun: true,
    };
  }

  const result = await recalculateEvidenceScores(db, {
    claimIds,
    triggeringEvent: KC11G_INITIAL_TRIGGER,
    snapshotIdentity: KC11G_INITIAL_SNAPSHOT_IDENTITY,
  });
  const nextCursor = claimIds.length === limit ? claimIds.at(-1)! : null;
  const remaining = nextCursor === null ? 0 : (await hasMoreClaims(db, nextCursor) ? null : 0);
  return {
    ...result,
    state: nextCursor && remaining === null ? "partial" : "completed",
    selectedClaims: claimIds.length,
    processed: claimIds.length,
    nextCursor,
    remaining,
    dryRun: false,
  };
}
