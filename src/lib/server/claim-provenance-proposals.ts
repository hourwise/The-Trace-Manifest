export const CLAIM_PROVENANCE_ALGORITHM_VERSION = "claim-provenance-v1";

export interface ClaimProvenanceProposalResult {
  proposalId: string | null;
  created: boolean;
}

interface AssertionContext {
  assertionId: string;
  canonicalClaimId: string;
  sourceDocumentId: string;
  sourceRole: "evidence" | "reported_claim" | "discovery_context" | "internal_synthesis";
  directness: "direct" | "indirect" | "derivative" | "unknown";
  evidenceTreatment: "factual_support" | "attributed_opinion" | "context_only" | "discovery_only" | "internal_synthesis";
  materiality: "low" | "standard" | "high" | "critical";
}

/** Creates one deterministic, review-gated provenance proposal for an assertion. */
export async function generateClaimProvenanceProposal(
  db: D1Database,
  input: { claimAssertionId: string },
): Promise<ClaimProvenanceProposalResult> {
  const context = await db.prepare(`
    SELECT assertion.id AS assertionId, assertion.canonical_claim_id AS canonicalClaimId,
           document.id AS sourceDocumentId, assertion.source_role AS sourceRole,
           assertion.directness, assertion.evidence_treatment AS evidenceTreatment,
           claim.materiality
    FROM claim_assertions assertion
    JOIN source_document_versions version ON version.id = assertion.source_document_version_id
    JOIN source_documents document ON document.id = version.source_document_id
    JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
    WHERE assertion.id = ?
  `).bind(input.claimAssertionId).first<AssertionContext>();
  if (!context) return { proposalId: null, created: false };

  const proposedRelationship = context.sourceRole === "evidence"
    ? "original"
    : context.sourceRole === "reported_claim" ? "reports_on" : "unknown";
  const confidence = context.sourceRole === "evidence" && context.directness === "direct" ? 0.85 : 0.55;
  const reviewRequirement = context.materiality === "high" || context.materiality === "critical"
    || context.directness === "unknown" || proposedRelationship === "unknown" ? "mandatory" : "standard";
  const rationale = proposedRelationship === "original"
    ? "Rule proposal: evidence assertion is treated as originating from its admitted source."
    : proposedRelationship === "reports_on"
      ? "Rule proposal: reported claim remains attributed to the source document and is not treated as an original finding."
      : "Rule proposal: lineage is uncertain and requires publisher review before any provenance assignment.";
  const idempotencyKey = await sha256(`${CLAIM_PROVENANCE_ALGORITHM_VERSION}:${context.assertionId}`);
  const proposalId = `claim-provenance-${idempotencyKey}`;
  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO knowledge_claim_provenance_proposals
      (id, claim_assertion_id, canonical_claim_id, source_document_id,
       proposed_relationship, proposed_directness, proposed_source_role,
       proposed_evidence_treatment, confidence, review_requirement, rationale,
       determination_method, algorithm_version, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule_proposal', ?, ?)
  `).bind(
    proposalId, context.assertionId, context.canonicalClaimId, context.sourceDocumentId,
    proposedRelationship, context.directness, context.sourceRole, context.evidenceTreatment,
    confidence, reviewRequirement, rationale, CLAIM_PROVENANCE_ALGORITHM_VERSION, idempotencyKey,
  ).run();
  return { proposalId, created: Number(inserted.meta.changes ?? 0) === 1 };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
