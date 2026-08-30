import {
  calculateCanonicalClaimEvidenceScore,
  persistCanonicalStoryScore,
  recalculateEvidenceScores,
  type RecalculateEvidenceResult,
} from "./evidence-recalculation";
import {
  EVIDENCE_SCORE_POLICY_VERSION,
  type ClaimScore,
  type EvidenceStatus,
} from "./evidence-scoring";

export const KC11G_INITIAL_SNAPSHOT_IDENTITY = "kc-11g-initial-score";
export const KC11G_INITIAL_TRIGGER = "historical_backfill_initial" as const;

export interface HistoricalEvidenceScoreOptions {
  limit?: number;
  dryRun?: boolean;
}

export interface HistoricalEvidenceScoreResult extends RecalculateEvidenceResult {
  state: "completed" | "partial";
  selectedClaims: number;
  processed: number;
  /** KC-11G is a cursorless live work queue; this is always null. */
  nextCursor: null;
  remaining: number | null;
  dryRun: boolean;
  work: {
    sourceRowCeiling: number;
    sourceRowsRead: number;
    storyClaimEdgeCeiling: number;
    storyClaimEdgesProcessed: number;
    storyFinalizationCeiling: number;
    storiesFinalized: number;
    deferredItems: number;
  };
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
// KC-11 admits 100 top-level items. Four source-row families feed each score,
// so one invocation admits at most four rows per maximum item on average.
export const KC11G_SOURCE_ROW_CEILING = 400;
export const KC11G_STORY_CLAIM_EDGE_CEILING = 25;
export const KC11G_STORY_FINALIZATION_CEILING = 25;

interface StoryWorkRow {
  story_cluster_id: number;
  canonical_claim_id: string;
  materiality: "low" | "standard" | "high" | "critical";
}

interface StoryAggregateRow {
  story_cluster_id: number;
  claim_count: number;
  weighted_score_sum: number;
  total_weight: number;
  confirmed_count: number;
  disputed_count: number;
  corrected_count: number;
  superseded_count: number;
  vendor_count: number;
  community_count: number;
  outdated_count: number;
  supported_count: number;
}

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
            SELECT 1 FROM knowledge_change_proposals proposal
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

function initialStorySnapshotPrefix(): string {
  return `score-snapshot:${KC11G_INITIAL_SNAPSHOT_IDENTITY}:story:`;
}

async function selectClaims(db: D1Database, limit: number): Promise<string[]> {
  const rows = await db.prepare(`
    SELECT claim.id
    FROM canonical_claims claim
    WHERE ${eligibleClaimWhere()}
      AND NOT EXISTS (
        SELECT 1 FROM canonical_claim_score_snapshots snapshot
        WHERE snapshot.id = ? || claim.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM kc11g_deferred_score_work deferred
        WHERE deferred.snapshot_identity = ?
          AND deferred.work_kind = 'claim_snapshot'
          AND deferred.canonical_claim_id = claim.id
          AND deferred.story_cluster_id IS NULL
      )
    ORDER BY claim.id ASC
    LIMIT ?
  `).bind(initialClaimSnapshotPrefix(), KC11G_INITIAL_SNAPSHOT_IDENTITY, limit).all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

async function claimSourceRows(db: D1Database, claimId: string): Promise<number> {
  const existing = await db.prepare(
    "SELECT 1 AS present FROM canonical_claim_score_snapshots WHERE id = ?",
  ).bind(`${initialClaimSnapshotPrefix()}${claimId}`).first<{ present: number }>();
  if (existing) return 1;
  const row = await db.prepare(`
    SELECT 1
      + (SELECT COUNT(*) FROM claim_assertions WHERE canonical_claim_id = ?)
      + (SELECT COUNT(*)
           FROM story_claim_evidence_attachments attachment
           JOIN story_related_item_reviews review
             ON review.source_story_id = attachment.story_cluster_id
            AND review.target_feed_item_id = attachment.feed_item_id
            AND review.action = 'attach_evidence' AND review.state = 'accepted'
           JOIN feed_items item ON item.id = attachment.feed_item_id
           JOIN sources source ON source.id = item.source_id
          WHERE attachment.canonical_claim_id = ? AND attachment.eligibility_state = 'eligible')
      + (SELECT COUNT(*) FROM knowledge_claim_conflict_cases
          WHERE source_claim_id = ? OR target_claim_id = ?) AS source_rows
  `).bind(claimId, claimId, claimId, claimId).first<{ source_rows: number }>();
  return Math.max(1, Number(row?.source_rows ?? 1));
}

async function deferWork(
  db: D1Database,
  kind: "claim_snapshot" | "story_claim_score",
  claimId: string,
  storyId: number | null,
  sourceRows: number,
): Promise<number> {
  const id = `kc11g-deferred:${kind}:${storyId ?? "none"}:${claimId}`;
  const result = await db.prepare(`
    INSERT OR IGNORE INTO kc11g_deferred_score_work
      (id, snapshot_identity, work_kind, canonical_claim_id, story_cluster_id,
       measured_source_rows, source_row_ceiling, reason_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'source_row_ceiling_exceeded')
  `).bind(
    id, KC11G_INITIAL_SNAPSHOT_IDENTITY, kind, claimId, storyId,
    sourceRows, KC11G_SOURCE_ROW_CEILING,
  ).run();
  return Number(result.meta.changes ?? 0) > 0 ? 1 : 0;
}

async function selectStoryClaimWork(db: D1Database, limit: number): Promise<StoryWorkRow[]> {
  const rows = await db.prepare(`
    SELECT story_claim.story_cluster_id, story_claim.canonical_claim_id, story_claim.materiality
    FROM story_claims story_claim
    WHERE EXISTS (
        SELECT 1
        FROM story_claims seed_link
        JOIN canonical_claim_score_snapshots seed_snapshot
          ON seed_snapshot.canonical_claim_id = seed_link.canonical_claim_id
         AND seed_snapshot.id = ? || seed_link.canonical_claim_id
        WHERE seed_link.story_cluster_id = story_claim.story_cluster_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM evidence_score_snapshots snapshot
        WHERE snapshot.id = ? || CAST(story_claim.story_cluster_id AS TEXT)
      )
      AND NOT EXISTS (
        SELECT 1 FROM kc11g_story_claim_score_work work
        WHERE work.snapshot_identity = ?
          AND work.story_cluster_id = story_claim.story_cluster_id
          AND work.canonical_claim_id = story_claim.canonical_claim_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM kc11g_deferred_score_work deferred
        WHERE deferred.snapshot_identity = ?
          AND deferred.work_kind = 'story_claim_score'
          AND deferred.story_cluster_id = story_claim.story_cluster_id
          AND deferred.canonical_claim_id = story_claim.canonical_claim_id
      )
    ORDER BY story_claim.story_cluster_id ASC, story_claim.canonical_claim_id ASC
    LIMIT ?
  `).bind(
    initialClaimSnapshotPrefix(), initialStorySnapshotPrefix(),
    KC11G_INITIAL_SNAPSHOT_IDENTITY, KC11G_INITIAL_SNAPSHOT_IDENTITY, limit,
  ).all<StoryWorkRow>();
  return rows.results ?? [];
}

async function loadInitialClaimScore(db: D1Database, claimId: string): Promise<ClaimScore | null> {
  const row = await db.prepare(`
    SELECT score, evidence_status, component_json
    FROM canonical_claim_score_snapshots WHERE id = ?
  `).bind(`${initialClaimSnapshotPrefix()}${claimId}`).first<{
    score: number; evidence_status: EvidenceStatus; component_json: string;
  }>();
  if (!row) return null;
  return {
    claimId,
    score: row.score,
    evidenceStatus: row.evidence_status,
    components: JSON.parse(row.component_json) as ClaimScore["components"],
    policyVersion: EVIDENCE_SCORE_POLICY_VERSION,
  };
}

async function persistStoryClaimWork(db: D1Database, work: StoryWorkRow, score: ClaimScore): Promise<number> {
  const result = await db.prepare(`
    INSERT OR IGNORE INTO kc11g_story_claim_score_work
      (snapshot_identity, story_cluster_id, canonical_claim_id, materiality,
       score, evidence_status, component_json, policy_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    KC11G_INITIAL_SNAPSHOT_IDENTITY, work.story_cluster_id, work.canonical_claim_id,
    work.materiality, score.score, score.evidenceStatus, JSON.stringify(score.components),
    EVIDENCE_SCORE_POLICY_VERSION,
  ).run();
  return Number(result.meta.changes ?? 0) > 0 ? 1 : 0;
}

async function readyStoryIds(db: D1Database): Promise<number[]> {
  const rows = await db.prepare(`
    SELECT work.story_cluster_id
    FROM kc11g_story_claim_score_work work
    WHERE work.snapshot_identity = ?
      AND NOT EXISTS (
        SELECT 1 FROM evidence_score_snapshots snapshot
        WHERE snapshot.id = ? || CAST(work.story_cluster_id AS TEXT)
      )
      AND NOT EXISTS (
        SELECT 1 FROM story_claims story_claim
        WHERE story_claim.story_cluster_id = work.story_cluster_id
          AND NOT EXISTS (
            SELECT 1 FROM kc11g_story_claim_score_work completed
            WHERE completed.snapshot_identity = ?
              AND completed.story_cluster_id = story_claim.story_cluster_id
              AND completed.canonical_claim_id = story_claim.canonical_claim_id
          )
      )
    GROUP BY work.story_cluster_id
    ORDER BY work.story_cluster_id ASC
    LIMIT ?
  `).bind(
    KC11G_INITIAL_SNAPSHOT_IDENTITY, initialStorySnapshotPrefix(),
    KC11G_INITIAL_SNAPSHOT_IDENTITY, KC11G_STORY_FINALIZATION_CEILING,
  ).all<{ story_cluster_id: number }>();
  return (rows.results ?? []).map((row) => row.story_cluster_id);
}

async function aggregateStory(db: D1Database, storyId: number): Promise<StoryAggregateRow | null> {
  return db.prepare(`
    SELECT story_cluster_id, COUNT(*) AS claim_count,
           SUM(score * CASE materiality WHEN 'low' THEN 1 WHEN 'standard' THEN 2 WHEN 'high' THEN 3 ELSE 4 END) AS weighted_score_sum,
           SUM(CASE materiality WHEN 'low' THEN 1 WHEN 'standard' THEN 2 WHEN 'high' THEN 3 ELSE 4 END) AS total_weight,
           SUM(CASE WHEN evidence_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
           SUM(CASE WHEN evidence_status = 'disputed' THEN 1 ELSE 0 END) AS disputed_count,
           SUM(CASE WHEN evidence_status = 'corrected' THEN 1 ELSE 0 END) AS corrected_count,
           SUM(CASE WHEN evidence_status = 'superseded' THEN 1 ELSE 0 END) AS superseded_count,
           SUM(CASE WHEN evidence_status = 'vendor_reported' THEN 1 ELSE 0 END) AS vendor_count,
           SUM(CASE WHEN evidence_status = 'community_reported' THEN 1 ELSE 0 END) AS community_count,
           SUM(CASE WHEN evidence_status = 'outdated' THEN 1 ELSE 0 END) AS outdated_count,
           SUM(CASE WHEN evidence_status NOT IN ('unverified', 'outdated') THEN 1 ELSE 0 END) AS supported_count
    FROM kc11g_story_claim_score_work
    WHERE snapshot_identity = ? AND story_cluster_id = ?
    GROUP BY story_cluster_id
  `).bind(KC11G_INITIAL_SNAPSHOT_IDENTITY, storyId).first<StoryAggregateRow>();
}

function aggregateStoryStatus(row: StoryAggregateRow, score: number): EvidenceStatus {
  if (row.disputed_count > 0) return "disputed";
  if (row.corrected_count > 0) return "corrected";
  if (row.superseded_count > 0) return "superseded";
  if (row.vendor_count === row.claim_count) return "vendor_reported";
  if (row.community_count === row.claim_count) return "community_reported";
  if (score >= 80 && row.confirmed_count > 0) return "confirmed";
  if (score >= 65) return "strongly_supported";
  if (score >= 45 && row.supported_count > 0) return "provisionally_supported";
  if (row.outdated_count === row.claim_count) return "outdated";
  return "unverified";
}

async function hasOutstandingStoryWork(db: D1Database): Promise<boolean> {
  const story = await db.prepare(`
    SELECT 1 AS present
    FROM story_claims seed_link
    JOIN canonical_claim_score_snapshots seed_snapshot
      ON seed_snapshot.canonical_claim_id = seed_link.canonical_claim_id
     AND seed_snapshot.id = ? || seed_link.canonical_claim_id
    WHERE NOT EXISTS (
      SELECT 1 FROM evidence_score_snapshots snapshot
      WHERE snapshot.id = ? || CAST(seed_link.story_cluster_id AS TEXT)
    )
    LIMIT 1
  `).bind(initialClaimSnapshotPrefix(), initialStorySnapshotPrefix()).first<{ present: number }>();
  return Boolean(story);
}

async function hasOutstandingWork(db: D1Database): Promise<boolean> {
  const claim = await db.prepare(`
    SELECT 1 AS present
    FROM canonical_claims claim
    WHERE ${eligibleClaimWhere()}
      AND NOT EXISTS (
        SELECT 1 FROM canonical_claim_score_snapshots snapshot WHERE snapshot.id = ? || claim.id
      )
    LIMIT 1
  `).bind(initialClaimSnapshotPrefix()).first<{ present: number }>();
  return Boolean(claim) || await hasOutstandingStoryWork(db);
}

async function countDeferredWork(db: D1Database): Promise<number> {
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM kc11g_deferred_score_work
    WHERE snapshot_identity = ?
  `).bind(KC11G_INITIAL_SNAPSHOT_IDENTITY).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function dryRunWouldRemain(db: D1Database, selected: string[], hasMoreClaims: boolean): Promise<{
  partial: boolean;
  sourceRows: number;
  storyEdges: number;
}> {
  let sourceRows = 0;
  for (const claimId of selected) sourceRows += await claimSourceRows(db, claimId);
  let storyEdges = 0;
  let stories = 0;
  if (selected.length > 0) {
    const placeholders = selected.map(() => "?").join(", ");
    const row = await db.prepare(`
      SELECT COUNT(*) AS edges, COUNT(DISTINCT all_links.story_cluster_id) AS stories
      FROM story_claims selected_links
      JOIN story_claims all_links ON all_links.story_cluster_id = selected_links.story_cluster_id
      WHERE selected_links.canonical_claim_id IN (${placeholders})
    `).bind(...selected).first<{ edges: number; stories: number }>();
    storyEdges = Number(row?.edges ?? 0);
    stories = Number(row?.stories ?? 0);
  }
  const partial = hasMoreClaims
    || await hasOutstandingStoryWork(db)
    || await countDeferredWork(db) > 0
    || sourceRows > KC11G_SOURCE_ROW_CEILING
    || storyEdges > KC11G_STORY_CLAIM_EDGE_CEILING
    || stories > KC11G_STORY_FINALIZATION_CEILING;
  return { partial, sourceRows, storyEdges };
}

function emptyWork(): HistoricalEvidenceScoreResult["work"] {
  return {
    sourceRowCeiling: KC11G_SOURCE_ROW_CEILING,
    sourceRowsRead: 0,
    storyClaimEdgeCeiling: KC11G_STORY_CLAIM_EDGE_CEILING,
    storyClaimEdgesProcessed: 0,
    storyFinalizationCeiling: KC11G_STORY_FINALIZATION_CEILING,
    storiesFinalized: 0,
    deferredItems: 0,
  };
}

/** Cursorless, bounded live work queue for initial historical score snapshots. */
export async function bootstrapHistoricalEvidenceScores(
  db: D1Database,
  options: HistoricalEvidenceScoreOptions = {},
): Promise<HistoricalEvidenceScoreResult> {
  const limit = boundedLimit(options.limit);
  const selectedWithProbe = await selectClaims(db, limit + 1);
  const selected = selectedWithProbe.slice(0, limit);
  if (options.dryRun) {
    const projection = await dryRunWouldRemain(db, selected, selectedWithProbe.length > limit);
    return {
      state: projection.partial ? "partial" : "completed",
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      claimIds: selected,
      storyIds: [], claimSnapshots: 0, storySnapshots: 0,
      statusChanges: 0, approvalRequests: 0,
      selectedClaims: selected.length, processed: 0,
      nextCursor: null,
      remaining: projection.partial ? null : 0,
      dryRun: true,
      work: {
        ...emptyWork(),
        sourceRowsRead: projection.sourceRows,
        storyClaimEdgesProcessed: projection.storyEdges,
        deferredItems: await countDeferredWork(db),
      },
    };
  }

  const work = emptyWork();
  const claimIds: string[] = [];
  const storyIds: number[] = [];
  let claimSnapshots = 0;
  let storySnapshots = 0;
  let statusChanges = 0;
  let approvalRequests = 0;

  for (const claimId of selected) {
    const sourceRows = await claimSourceRows(db, claimId);
    if (sourceRows > KC11G_SOURCE_ROW_CEILING) {
      work.deferredItems += await deferWork(db, "claim_snapshot", claimId, null, sourceRows);
      continue;
    }
    if (work.sourceRowsRead + sourceRows > KC11G_SOURCE_ROW_CEILING) break;
    const result = await recalculateEvidenceScores(db, {
      claimIds: [claimId], triggeringEvent: KC11G_INITIAL_TRIGGER,
      snapshotIdentity: KC11G_INITIAL_SNAPSHOT_IDENTITY,
      includeLinkedStories: false,
    });
    work.sourceRowsRead += sourceRows;
    claimIds.push(...result.claimIds);
    claimSnapshots += result.claimSnapshots;
  }

  const storyWork = await selectStoryClaimWork(db, KC11G_STORY_CLAIM_EDGE_CEILING);
  for (const edge of storyWork) {
    const sourceRows = await claimSourceRows(db, edge.canonical_claim_id);
    if (sourceRows > KC11G_SOURCE_ROW_CEILING) {
      work.deferredItems += await deferWork(
        db, "story_claim_score", edge.canonical_claim_id, edge.story_cluster_id, sourceRows,
      );
      continue;
    }
    if (work.sourceRowsRead + sourceRows > KC11G_SOURCE_ROW_CEILING) break;
    const score = await loadInitialClaimScore(db, edge.canonical_claim_id)
      ?? await calculateCanonicalClaimEvidenceScore(db, edge.canonical_claim_id);
    if (!score) continue;
    work.sourceRowsRead += sourceRows;
    work.storyClaimEdgesProcessed += await persistStoryClaimWork(db, edge, score);
  }

  for (const storyId of await readyStoryIds(db)) {
    const aggregate = await aggregateStory(db, storyId);
    if (!aggregate || aggregate.total_weight <= 0) continue;
    const score = Math.round((aggregate.weighted_score_sum / aggregate.total_weight) * 100) / 100;
    const evidenceStatus = aggregateStoryStatus(aggregate, score);
    const componentJson = JSON.stringify({
      claimCount: aggregate.claim_count,
      weightedScore: score,
      statusCounts: {
        confirmed: aggregate.confirmed_count, disputed: aggregate.disputed_count,
        corrected: aggregate.corrected_count, superseded: aggregate.superseded_count,
        vendorReported: aggregate.vendor_count, communityReported: aggregate.community_count,
        outdated: aggregate.outdated_count,
      },
    });
    const persisted = await persistCanonicalStoryScore(db, {
      storyId, score, evidenceStatus, componentJson,
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      snapshotIdentity: KC11G_INITIAL_SNAPSHOT_IDENTITY,
    });
    storySnapshots += persisted.storySnapshots;
    statusChanges += persisted.statusChanges;
    approvalRequests += persisted.approvalRequests;
    if (persisted.storySnapshots > 0) storyIds.push(storyId);
  }
  work.storiesFinalized = storyIds.length;
  work.deferredItems = await countDeferredWork(db);

  const outstanding = await hasOutstandingWork(db);
  return {
    state: outstanding ? "partial" : "completed",
    triggeringEvent: KC11G_INITIAL_TRIGGER,
    claimIds, storyIds, claimSnapshots, storySnapshots, statusChanges, approvalRequests,
    selectedClaims: selected.length,
    processed: claimIds.length,
    nextCursor: null,
    remaining: outstanding ? null : 0,
    dryRun: false,
    work,
  };
}
