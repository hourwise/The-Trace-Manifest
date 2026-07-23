export type ConflictRelationship = "contradicts" | "corrects" | "supersedes" | "temporal_change";
export const CLAIM_CONFLICT_ALGORITHM_VERSION = "claim-conflict-v1";

interface RelationshipRow {
  id: string;
  source_canonical_claim_id: string;
  target_canonical_claim_id: string;
  relationship: ConflictRelationship;
  confidence: number;
  rationale: string;
  state: string;
}

export interface ClaimConflictCaseResult {
  conflictCaseId: string | null;
  created: boolean;
}

/** Materialises an explicit unresolved conflict case from an accepted relation. */
export async function generateClaimConflictCase(
  db: D1Database,
  input: { relationshipProposalId: string },
): Promise<ClaimConflictCaseResult> {
  const relationship = await db.prepare(`
    SELECT id, source_canonical_claim_id, target_canonical_claim_id,
           relationship, confidence, rationale, state
    FROM knowledge_claim_relationship_proposals WHERE id = ?
  `).bind(input.relationshipProposalId).first<RelationshipRow>();
  if (!relationship || relationship.state !== "accepted" || !["contradicts", "corrects", "supersedes", "temporal_change"].includes(relationship.relationship)) {
    return { conflictCaseId: null, created: false };
  }
  const conflictKind = relationship.relationship === "contradicts"
    ? "contradiction" : relationship.relationship === "corrects"
      ? "correction" : relationship.relationship === "supersedes" ? "supersession" : "temporal_change";
  const idempotencyKey = await sha256(`${CLAIM_CONFLICT_ALGORITHM_VERSION}:${relationship.id}`);
  const conflictCaseId = `claim-conflict-${idempotencyKey}`;
  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO knowledge_claim_conflict_cases
      (id, source_claim_id, target_claim_id, relationship_proposal_id,
       conflict_kind, explanation, confidence, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    conflictCaseId, relationship.source_canonical_claim_id, relationship.target_canonical_claim_id,
    relationship.id, conflictKind,
    `Unresolved ${conflictKind} preserved from reviewed relationship proposal: ${relationship.rationale}`,
    relationship.confidence, idempotencyKey,
  ).run();
  return { conflictCaseId, created: Number(inserted.meta.changes ?? 0) === 1 };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
