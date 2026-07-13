// The Trace Manifest — Correction Workflow
// Phase 3: Records and manages corrections to stories, clusters, and claims.
// Implements product principle 2.5: "Updates, corrections, and score changes
// should be visible. The site should not silently rewrite history."
// Runs within Worker CPU limits; no external AI dependency.

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
    "SELECT evidence_status, title FROM story_clusters WHERE id = ?"
  ).bind(input.clusterId).first<{ evidence_status: string; title: string }>();

  const previousEvidenceStatus = input.previousEvidenceStatus ?? cluster?.evidence_status ?? null;

  // Insert the correction record
  const { meta } = await db.prepare(
    `INSERT INTO corrections
     (cluster_id, correction_type, previous_statement, updated_statement,
      previous_evidence_status, updated_evidence_status, reason, evidence_url, impact, corrected_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    input.clusterId,
    input.correctionType,
    input.previousStatement,
    input.updatedStatement,
    previousEvidenceStatus,
    input.updatedEvidenceStatus ?? "corrected",
    input.reason,
    input.evidenceUrl ?? null,
    input.impact ?? null,
    input.correctedBy,
  ).run();

  const correctionId = meta.last_row_id;

  // Update the cluster evidence status to "corrected" and mark as reviewed
  const targetStatus = input.updatedEvidenceStatus ?? "corrected";
  await db.prepare(
    `UPDATE story_clusters
     SET evidence_status = ?, is_published = 1, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(targetStatus, input.clusterId).run();

  // Mark all member feed items as needing re-review
  await db.prepare(
    `UPDATE feed_items
     SET ingestion_status = 'classified'
     WHERE id IN (SELECT feed_item_id FROM story_cluster_members WHERE cluster_id = ?)`
  ).bind(input.clusterId).run();

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

  // Get current claim info
  const claim = await db.prepare(
    "SELECT claim_text, evidence_quality, cluster_id FROM claims WHERE id = ?"
  ).bind(input.claimId).first<{ claim_text: string; evidence_quality: string; cluster_id: number | null }>();

  const previousEvidenceStatus = input.previousEvidenceStatus ?? claim?.evidence_quality ?? null;

  // Insert the correction
  const { meta } = await db.prepare(
    `INSERT INTO corrections
     (cluster_id, claim_id, correction_type, previous_statement, updated_statement,
      previous_evidence_status, updated_evidence_status, reason, evidence_url, impact, corrected_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    claim?.cluster_id ?? null,
    input.claimId,
    input.correctionType,
    input.previousStatement,
    input.updatedStatement,
    previousEvidenceStatus,
    input.updatedEvidenceStatus ?? "corrected",
    input.reason,
    input.evidenceUrl ?? null,
    input.impact ?? null,
    input.correctedBy,
  ).run();

  // Mark the claim as corrected
  await db.prepare(
    `UPDATE claims
     SET is_corrected = 1, evidence_quality = 'disputed', updated_at = datetime('now')
     WHERE id = ?`
  ).bind(input.claimId).run();

  // If claim belongs to a cluster, update cluster status too
  if (claim?.cluster_id) {
    await db.prepare(
      `UPDATE story_clusters
       SET evidence_status = 'corrected', updated_at = datetime('now')
       WHERE id = ? AND evidence_status NOT IN ('corrected', 'superseded', 'outdated')`
    ).bind(claim.cluster_id).run();
  }

  console.log(`Correction ${correctionId}: claim ${input.claimId} — ${input.correctionType}`);

  return { correctionId: meta.last_row_id };
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
