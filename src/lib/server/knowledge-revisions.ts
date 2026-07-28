/** KC-10D: reviewed immutable revisions for approved knowledge documents. */

export const KNOWLEDGE_REVISION_VERSION = "kc-10d-v1";

export interface KnowledgeRevisionPayload {
  canonicalQuestion?: string;
  directAnswer?: string | null;
  detailedExplanation?: string | null;
  documentJson: string;
  sourceSetHash?: string | null;
  evidenceStatus?: string;
  reviewAfter?: string | null;
  hardExpiry?: string | null;
}

export interface KnowledgeRevisionProposalResult {
  revisionId: string;
  revisionNumber: number;
  status: "draft";
  knowledgeDocumentId: string;
}

export interface KnowledgeRevisionReviewResult {
  revisionId: string;
  decision: "approved" | "rejected";
  status: "approved" | "rejected";
  knowledgeDocumentId: string;
}

export interface KnowledgeRevisionHistoryEntry {
  revisionId: string;
  revisionNumber: number;
  status: string;
  changeSummary: string | null;
  createdBy: string;
  createdAt: string;
  priorDocumentJson: string;
  priorSourceSetHash: string | null;
  priorEvidenceStatus: string;
  priorScoreSnapshotJson: string;
  priorEvidenceSetJson: string;
  rationale: string;
  decision: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

interface DocumentRow {
  id: string; status: string; canonical_question: string; direct_answer: string | null;
  detailed_explanation: string | null; document_json: string; source_set_hash: string | null;
  evidence_status: string; review_after: string | null; hard_expiry: string | null;
}
interface RevisionRow { id: string; knowledge_document_id: string; revision_number: number; status: string; document_json: string; }
interface KnowledgeRevisionHistoryRow {
  revision_id: string; revision_number: number; status: string; change_summary: string | null; created_by: string; created_at: string;
  prior_document_json: string; prior_source_set_hash: string | null; prior_evidence_status: string; prior_score_snapshot_json: string;
  prior_evidence_set_json: string; rationale: string; decision: string | null; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
}

/** Creates a draft revision only; the approved document remains unchanged. */
export async function proposeKnowledgeRevision(
  db: D1Database,
  input: { knowledgeDocumentId: string; payload: KnowledgeRevisionPayload; rationale: string; changeSummary: string; createdBy: string; proposalId?: string | null },
): Promise<KnowledgeRevisionProposalResult> {
  validateText(input.knowledgeDocumentId, 1, 240, "knowledge_document_id");
  validateText(input.rationale, 1, 4_000, "rationale");
  validateText(input.changeSummary, 1, 1_000, "change_summary");
  validatePayload(input.payload);
  const document = await db.prepare(`
    SELECT id, status, canonical_question, direct_answer, detailed_explanation, document_json,
           source_set_hash, evidence_status, review_after, hard_expiry
    FROM knowledge_documents WHERE id = ?
  `).bind(input.knowledgeDocumentId).first<DocumentRow>();
  if (!document) throw new KnowledgeRevisionError("document_not_found", "Knowledge document not found.", 404);
  if (document.status !== "approved") throw new KnowledgeRevisionError("document_not_approved", "Only approved knowledge can receive a substantive revision.", 409);

  const max = await db.prepare("SELECT MAX(revision_number) AS max_revision FROM knowledge_document_revisions WHERE knowledge_document_id = ?").bind(document.id).first<{ max_revision: number | null }>();
  const revisionNumber = (max?.max_revision ?? 0) + 1;
  const revisionId = `knowledge-revision-${crypto.randomUUID()}`;
  const priorScores = await db.prepare(`
    SELECT snapshot.canonical_claim_id AS claimId, snapshot.score, snapshot.evidence_status AS evidenceStatus,
           snapshot.component_json AS components, snapshot.policy_version AS policyVersion
    FROM canonical_claim_score_snapshots snapshot
    JOIN knowledge_document_claims link ON link.canonical_claim_id = snapshot.canonical_claim_id
    WHERE link.knowledge_document_id = ?
      AND snapshot.created_at = (SELECT MAX(innerSnapshot.created_at) FROM canonical_claim_score_snapshots innerSnapshot WHERE innerSnapshot.canonical_claim_id = snapshot.canonical_claim_id)
    ORDER BY snapshot.canonical_claim_id
  `).bind(document.id).all();
  const payloadJson = JSON.stringify({ version: KNOWLEDGE_REVISION_VERSION, ...input.payload });
  const [claimLinks, assertionLinks, sourceLinks] = await Promise.all([
    db.prepare("SELECT canonical_claim_id, section_key, relationship, display_order FROM knowledge_document_claims WHERE knowledge_document_id = ? ORDER BY section_key, canonical_claim_id").bind(document.id).all(),
    db.prepare("SELECT section_key, canonical_claim_id, claim_assertion_id, relationship FROM knowledge_document_claim_assertions WHERE knowledge_document_id = ? ORDER BY section_key, canonical_claim_id, claim_assertion_id").bind(document.id).all(),
    db.prepare("SELECT source_reference, claim_reference, source_kind, source_role, admission_state, freshness_state, relationship FROM knowledge_document_sources WHERE knowledge_document_id = ? ORDER BY source_reference, claim_reference").bind(document.id).all(),
  ]);
  const evidenceSetJson = JSON.stringify({ claimLinks: claimLinks.results ?? [], assertionLinks: assertionLinks.results ?? [], sourceLinks: sourceLinks.results ?? [] });
  await db.batch([
    db.prepare(`INSERT INTO knowledge_document_revisions
      (id, knowledge_document_id, revision_number, status, document_json, source_set_hash, change_summary, created_by)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`)
      .bind(revisionId, document.id, revisionNumber, payloadJson, input.payload.sourceSetHash ?? document.source_set_hash, input.changeSummary, input.createdBy),
    db.prepare(`INSERT INTO knowledge_revision_decisions
      (revision_id, proposal_id, prior_document_json, prior_source_set_hash, prior_evidence_status, prior_score_snapshot_json, rationale)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(revisionId, input.proposalId ?? null, document.document_json, document.source_set_hash, document.evidence_status, JSON.stringify(priorScores.results ?? []), input.rationale),
    db.prepare("INSERT INTO knowledge_revision_evidence_snapshots (revision_id, evidence_set_json) VALUES (?, ?)").bind(revisionId, evidenceSetJson),
  ]);
  return { revisionId, revisionNumber, status: "draft", knowledgeDocumentId: document.id };
}

/** Returns bounded immutable revision history for publisher inspection. */
export async function listKnowledgeRevisionHistory(db: D1Database, input: { knowledgeDocumentId: string; limit?: number }): Promise<KnowledgeRevisionHistoryEntry[]> {
  validateText(input.knowledgeDocumentId, 1, 240, "knowledge_document_id");
  const limit = Number.isInteger(input.limit) && (input.limit as number) > 0 ? Math.min(input.limit as number, 100) : 50;
  const result = await db.prepare(`
    SELECT revision.id AS revision_id, revision.revision_number, revision.status,
           revision.change_summary, revision.created_by, revision.created_at,
           decision.prior_document_json, decision.prior_source_set_hash,
           decision.prior_evidence_status, decision.prior_score_snapshot_json,
           snapshot.evidence_set_json AS prior_evidence_set_json,
           decision.rationale, decision.decision, decision.reviewed_by,
           decision.reviewed_at, decision.review_note
    FROM knowledge_document_revisions revision
    JOIN knowledge_revision_decisions decision ON decision.revision_id = revision.id
    JOIN knowledge_revision_evidence_snapshots snapshot ON snapshot.revision_id = revision.id
    WHERE revision.knowledge_document_id = ?
    ORDER BY revision.revision_number DESC
    LIMIT ?
  `).bind(input.knowledgeDocumentId, limit).all<KnowledgeRevisionHistoryRow>();
  return (result.results ?? []).map((row) => ({
    revisionId: row.revision_id, revisionNumber: row.revision_number, status: row.status,
    changeSummary: row.change_summary, createdBy: row.created_by, createdAt: row.created_at,
    priorDocumentJson: row.prior_document_json, priorSourceSetHash: row.prior_source_set_hash,
    priorEvidenceStatus: row.prior_evidence_status, priorScoreSnapshotJson: row.prior_score_snapshot_json,
    priorEvidenceSetJson: row.prior_evidence_set_json, rationale: row.rationale,
    decision: row.decision, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, reviewNote: row.review_note,
  }));
}

/** Applies or rejects a draft revision with an attributable publisher decision. */
export async function reviewKnowledgeRevision(
  db: D1Database,
  input: { revisionId: string; decision: "approve" | "reject"; reviewer: string; reviewNote?: string },
): Promise<KnowledgeRevisionReviewResult> {
  validateText(input.revisionId, 1, 240, "revision_id");
  validateText(input.reviewer, 1, 320, "reviewer");
  if (input.reviewNote && input.reviewNote.length > 4_000) throw new KnowledgeRevisionError("review_note_invalid", "Review note is too long.", 400);
  const revision = await db.prepare(`SELECT id, knowledge_document_id, revision_number, status, document_json FROM knowledge_document_revisions WHERE id = ?`).bind(input.revisionId).first<RevisionRow>();
  if (!revision) throw new KnowledgeRevisionError("revision_not_found", "Knowledge revision not found.", 404);
  if (revision.status !== "draft" && revision.status !== "needs_review") throw new KnowledgeRevisionError("revision_not_pending", "Revision is no longer awaiting review.", 409);
  const document = await db.prepare("SELECT status, source_set_hash, evidence_status, review_after, hard_expiry FROM knowledge_documents WHERE id = ?").bind(revision.knowledge_document_id).first<{ status: string; source_set_hash: string | null; evidence_status: string; review_after: string | null; hard_expiry: string | null }>();
  if (!document || document.status !== "approved") throw new KnowledgeRevisionError("document_not_approved", "The current public document is no longer approved.", 409);
  const decision = input.decision === "approve" ? "approved" : "rejected";
  if (input.decision === "reject") {
    const result = await db.batch([
      db.prepare("UPDATE knowledge_document_revisions SET status = 'rejected' WHERE id = ? AND status IN ('draft','needs_review')").bind(revision.id),
      db.prepare("UPDATE knowledge_revision_decisions SET decision = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE revision_id = ? AND decision IS NULL").bind(input.reviewer, input.reviewNote ?? null, revision.id),
    ]);
    if (Number(result[0]?.meta.changes ?? 0) !== 1) throw new KnowledgeRevisionError("revision_changed", "Revision changed before review was saved.", 409);
    return { revisionId: revision.id, decision, status: "rejected", knowledgeDocumentId: revision.knowledge_document_id };
  }
  let payload: KnowledgeRevisionPayload;
  try {
    const parsed = JSON.parse(revision.document_json) as Partial<KnowledgeRevisionPayload> & { version?: string };
    if (parsed.version !== KNOWLEDGE_REVISION_VERSION || typeof parsed.documentJson !== "string") throw new Error("invalid_payload");
    payload = { ...parsed, documentJson: parsed.documentJson };
    validatePayload(payload);
  } catch {
    throw new KnowledgeRevisionError("revision_payload_invalid", "Revision payload is invalid and cannot be published.", 409);
  }
  const result = await db.batch([
    db.prepare(`UPDATE knowledge_document_revisions SET status = 'approved' WHERE id = ? AND status IN ('draft','needs_review')`).bind(revision.id),
    db.prepare(`UPDATE knowledge_documents SET
      canonical_question = COALESCE(?, canonical_question), direct_answer = ?, detailed_explanation = ?, document_json = ?,
      source_set_hash = ?, evidence_status = COALESCE(?, evidence_status), review_after = ?, hard_expiry = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'approved'`)
      .bind(payload.canonicalQuestion ?? null, payload.directAnswer ?? null, payload.detailedExplanation ?? null, payload.documentJson,
        payload.sourceSetHash ?? document.source_set_hash, payload.evidenceStatus ?? document.evidence_status, payload.reviewAfter ?? document.review_after, payload.hardExpiry ?? document.hard_expiry, revision.knowledge_document_id),
    db.prepare("UPDATE knowledge_revision_decisions SET decision = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ? WHERE revision_id = ? AND decision IS NULL").bind(input.reviewer, input.reviewNote ?? null, revision.id),
  ]);
  if (Number(result[0]?.meta.changes ?? 0) !== 1 || Number(result[1]?.meta.changes ?? 0) !== 1) throw new KnowledgeRevisionError("revision_changed", "Revision changed before review was saved.", 409);
  return { revisionId: revision.id, decision, status: "approved", knowledgeDocumentId: revision.knowledge_document_id };
}

export class KnowledgeRevisionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = "KnowledgeRevisionError"; }
}

function validatePayload(payload: KnowledgeRevisionPayload): void {
  if (!payload || typeof payload.documentJson !== "string" || payload.documentJson.length < 2 || payload.documentJson.length > 1_000_000) throw new KnowledgeRevisionError("revision_payload_invalid", "documentJson must be between 2 and 1000000 characters.", 400);
  if (payload.canonicalQuestion !== undefined) validateText(payload.canonicalQuestion, 1, 500, "canonical_question");
  if (payload.directAnswer !== undefined && payload.directAnswer !== null) validateText(payload.directAnswer, 1, 20_000, "direct_answer");
  if (payload.detailedExplanation !== undefined && payload.detailedExplanation !== null) validateText(payload.detailedExplanation, 1, 50_000, "detailed_explanation");
}
function validateText(value: string, min: number, max: number, field: string): void { if (typeof value !== "string" || value.trim().length < min || value.length > max) throw new KnowledgeRevisionError("invalid_" + field, `${field} is invalid.`, 400); }
