// The Trace Manifest — Correction Workflow
// Phase 3: Records and manages corrections to stories, clusters, and claims.
// Implements product principle 2.5: "Updates, corrections, and score changes
// should be visible. The site should not silently rewrite history."
// Runs within Worker CPU limits; no external AI dependency.
import { recalculateEvidenceScores } from "../../src/lib/server/evidence-recalculation";

// ============================================================
// Types
// ============================================================
export type CorrectionType =
  | "factual_error"
  | "rating_change"
  | "licence_correction"
  | "pricing_correction"
  | "benchmark_correction"
  | "supersession"
  | "deprecation"
  | "methodology_update"
  | "other";

export interface CorrectionInput {
  clusterId?: number | null;
  claimId?: number | null;
  correctionType: CorrectionType;
  previousStatement: string;
  updatedStatement: string;
  previousEvidenceStatus?: string | null;
  updatedEvidenceStatus?: string | null;
  reason: string;
  evidenceUrl?: string | null;
  impact?: string | null;
  correctedBy: string;
}

export interface CorrectionRecord {
  id: number;
  cluster_id: number | null;
  claim_id: number | null;
  correction_type: CorrectionType;
  previous_statement: string;
  updated_statement: string;
  previous_evidence_status: string | null;
  updated_evidence_status: string | null;
  reason: string;
  evidence_url: string | null;
  impact: string | null;
  corrected_by: string;
  corrected_at: string;
  published: boolean;
}

// ============================================================
// Human-readable labels
// ============================================================
const CORRECTION_TYPE_LABELS: Record<CorrectionType, string> = {
  factual_error: "Factual error",
  rating_change: "Rating change",
  licence_correction: "Licence correction",
  pricing_correction: "Pricing correction",
  benchmark_correction: "Benchmark correction",
  supersession: "Superseded by newer information",
  deprecation: "Deprecated",
  methodology_update: "Methodology update",
  other: "Other correction",
};

// ============================================================
// Record a correction against a story/cluster
// ============================================================
export async function recordClusterCorrection(
  db: D1Database,
  input: CorrectionInput,
): Promise<{ correctionId: number; updatedStatus: string | null }> {
  if (!input.clusterId) {
    throw new Error("clusterId is required for cluster corrections");
  }

  // Get current cluster info for the previous_evidence_status
  const cluster = await db.prepare(
    "SELECT evidence_status, title, publication_status FROM story_clusters WHERE id = ?"
  ).bind(input.clusterId).first<{ evidence_status: string; title: string; publication_status: string }>();
  if (!cluster || cluster.publication_status !== "published") {
    throw new Error("Corrections may only be recorded against a published story.");
  }

  const previousEvidenceStatus = input.previousEvidenceStatus ?? cluster?.evidence_status ?? null;

  const targetStatus = input.updatedEvidenceStatus ?? "corrected";
  const [inserted] = await db.batch([
    db.prepare(
      `INSERT INTO corrections
       (cluster_id, correction_type, previous_statement, updated_statement,
        previous_evidence_status, updated_evidence_status, reason, evidence_url, impact, corrected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      input.clusterId, input.correctionType, input.previousStatement, input.updatedStatement,
      previousEvidenceStatus, targetStatus, input.reason, input.evidenceUrl ?? null,
      input.impact ?? null, input.correctedBy,
    ),
    db.prepare(
      `UPDATE story_clusters SET evidence_status = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(targetStatus, input.clusterId),
    db.prepare(
      `UPDATE feed_items SET ingestion_status = 'classified'
       WHERE id IN (SELECT feed_item_id FROM story_cluster_members WHERE cluster_id = ?)`
    ).bind(input.clusterId),
  ]);
  const correctionId = inserted.meta.last_row_id;

  await recalculateEvidenceScores(db, {
    storyIds: [input.clusterId],
    triggeringEvent: "correction_recorded",
  });

  console.log(`Correction ${correctionId}: cluster ${input.clusterId} — ${input.correctionType}`);

  return { correctionId, updatedStatus: targetStatus };
}

// ============================================================
// Record a correction against a single claim
// ============================================================
export async function recordClaimCorrection(
  db: D1Database,
  input: CorrectionInput,
): Promise<{ correctionId: number }> {
  if (!input.claimId) {
    throw new Error("claimId is required for claim corrections");
  }

  // Resolve the legacy identifier through the KC-05G mapping. The numeric
  // claim_id remains on the correction ledger for compatibility, but the
  // canonical claim/assertion graph is the only claim state that changes.
  const claim = await db.prepare(`
    SELECT cc.id AS canonical_claim_id, ca.id AS assertion_id,
           cc.canonical_text, cc.current_state,
           sc.id AS cluster_id, sc.publication_status
    FROM legacy_claim_cutover map
    JOIN canonical_claims cc ON cc.id = map.canonical_claim_id
    JOIN claim_assertions ca
      ON ca.canonical_claim_id = cc.id
     AND ca.legacy_claim_id = map.legacy_claim_id
     AND ca.id = 'legacy-claim-assertion-' || map.legacy_claim_id
    JOIN story_claims story_claim ON story_claim.canonical_claim_id = cc.id
    JOIN story_clusters sc ON sc.id = story_claim.story_cluster_id
    WHERE map.legacy_claim_id = ? AND map.state = 'mapped'
    ORDER BY sc.published_at DESC
    LIMIT 1
  `).bind(input.claimId).first<{
    canonical_claim_id: string;
    assertion_id: string;
    canonical_text: string;
    current_state: string;
    cluster_id: number;
    publication_status: string;
  }>();
  if (!claim || claim.publication_status !== "published") {
    throw new Error("Corrections may only be recorded against claims in a published story.");
  }

  const previousEvidenceStatus = input.previousEvidenceStatus ?? claim?.current_state ?? null;
  const targetStatus = input.updatedEvidenceStatus ?? "corrected";
  const correctionAssertionId = `canonical-correction-${crypto.randomUUID()}`;

  const [inserted] = await db.batch([
    db.prepare(
      `INSERT INTO corrections
       (cluster_id, claim_id, correction_type, previous_statement, updated_statement,
        previous_evidence_status, updated_evidence_status, reason, evidence_url, impact, corrected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      claim.cluster_id, input.claimId, input.correctionType, input.previousStatement,
      input.updatedStatement, previousEvidenceStatus, targetStatus,
      input.reason, input.evidenceUrl ?? null, input.impact ?? null, input.correctedBy,
    ),
    db.prepare(
      `UPDATE canonical_claims
       SET current_state = CASE
         WHEN ? = 'superseded' THEN 'superseded'
         WHEN ? = 'corrected' THEN 'corrected'
         ELSE 'disputed'
       END, updated_at = datetime('now')
       WHERE id = ?`
    ).bind(targetStatus, targetStatus, claim.canonical_claim_id),
    db.prepare(
      `INSERT INTO claim_assertions
       (id, canonical_claim_id, legacy_claim_id, assertion_text, relationship,
        source_role, directness, evidence_treatment, admission_state,
        freshness_state, extraction_method, extraction_version, confidence,
        reviewer_state, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, 'corrects', 'reported_claim', 'unknown',
               'factual_support', 'admitted', 'current', 'publisher_correction',
               'kc-05g', 1, 'accepted', ?, datetime('now'))`
    ).bind(
      correctionAssertionId, claim.canonical_claim_id, input.claimId,
      input.updatedStatement, input.correctedBy,
    ),
    db.prepare(
      `UPDATE story_clusters SET evidence_status = ?, updated_at = datetime('now')
       WHERE id = ? AND evidence_status NOT IN ('corrected', 'superseded', 'outdated')`
    ).bind(targetStatus, claim.cluster_id),
  ]);
  const correctionId = inserted.meta.last_row_id;

  await recalculateEvidenceScores(db, {
    claimIds: [claim.canonical_claim_id],
    triggeringEvent: targetStatus === "superseded" ? "story_superseded" : "correction_recorded",
  });

  console.log(`Correction ${correctionId}: claim ${input.claimId} — ${input.correctionType}`);

  return { correctionId };
}

// ============================================================
// List published corrections (for public corrections page)
// ============================================================
export async function listPublishedCorrections(
  db: D1Database,
  limit: number = 50,
): Promise<CorrectionRecord[]> {
  const { results } = await db.prepare(
    `SELECT * FROM corrections
     WHERE published = 1
     ORDER BY corrected_at DESC
     LIMIT ?`
  ).bind(limit).all<CorrectionRecord>();

  return results ?? [];
}

// ============================================================
// Get corrections for a specific cluster
// ============================================================
export async function getClusterCorrections(
  db: D1Database,
  clusterId: number,
): Promise<CorrectionRecord[]> {
  const { results } = await db.prepare(
    `SELECT * FROM corrections
     WHERE cluster_id = ? AND published = 1
     ORDER BY corrected_at DESC`
  ).bind(clusterId).all<CorrectionRecord>();

  return results ?? [];
}

// ============================================================
// Get corrections for a specific claim
// ============================================================
export async function getClaimCorrections(
  db: D1Database,
  claimId: number,
): Promise<CorrectionRecord[]> {
  const { results } = await db.prepare(
    `SELECT * FROM corrections
     WHERE claim_id = ? AND published = 1
     ORDER BY corrected_at DESC`
  ).bind(claimId).all<CorrectionRecord>();

  return results ?? [];
}

// ============================================================
// Unpublish a correction (soft delete — preserves history)
// ============================================================
export async function unpublishCorrection(
  db: D1Database,
  correctionId: number,
): Promise<void> {
  await db.prepare(
    "UPDATE corrections SET published = 0 WHERE id = ?"
  ).bind(correctionId).run();

  console.log(`Correction ${correctionId}: unpublished`);
}

// ============================================================
// Get correction type label
// ============================================================
export function getCorrectionTypeLabel(type: CorrectionType): string {
  return CORRECTION_TYPE_LABELS[type] ?? type;
}

// ============================================================
// Validate correction input — checks that at least one target
// (cluster or claim) is specified and the type is valid
// ============================================================
export function validateCorrectionInput(input: CorrectionInput): string | null {
  if (!input.clusterId && !input.claimId) {
    return "At least one of clusterId or claimId must be provided.";
  }
  if (!input.previousStatement || !input.updatedStatement) {
    return "previousStatement and updatedStatement are required.";
  }
  if (!input.reason) {
    return "reason is required.";
  }
  if (!input.correctedBy) {
    return "correctedBy is required.";
  }
  if (!CORRECTION_TYPE_LABELS[input.correctionType]) {
    return `Invalid correction_type: ${input.correctionType}.`;
  }
  return null; // valid
}
