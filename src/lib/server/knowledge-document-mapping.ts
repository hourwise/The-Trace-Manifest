import { parseKnowledgeMarkdown, type KnowledgeClaimRelationship } from "./knowledge-markdown";

export type KnowledgeAssertionRelationship =
  | "supports"
  | "qualifies"
  | "contradicts"
  | "contextualises"
  | "reports";

export interface KnowledgeDocumentMappingInput {
  knowledgeDocumentId: string;
  sectionKey: string;
  canonicalClaimId: string;
  claimRelationship: KnowledgeClaimRelationship;
  assertions: Array<{
    claimAssertionId: string;
    relationship: KnowledgeAssertionRelationship;
  }>;
  reviewerEmail: string;
  requestId: string;
}

export interface KnowledgeDocumentMappingResult {
  knowledgeDocumentId: string;
  sectionKey: string;
  canonicalClaimId: string;
  assertionsMapped: number;
}

export class KnowledgeDocumentMappingError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "KnowledgeDocumentMappingError";
  }
}

const claimRelationships = new Set<KnowledgeClaimRelationship>([
  "answers", "supports", "qualifies", "contradicts", "contextualises", "inference_basis",
]);
const assertionRelationships = new Set<KnowledgeAssertionRelationship>([
  "supports", "qualifies", "contradicts", "contextualises", "reports",
]);

/**
 * Saves a publisher-reviewed section → canonical claim → assertion mapping.
 * All assertion writes are checked against accepted, admitted, current
 * external assertions before the transaction is committed.
 */
export async function mapKnowledgeDocumentClaim(
  db: D1Database,
  input: KnowledgeDocumentMappingInput,
): Promise<KnowledgeDocumentMappingResult> {
  validateInput(input);
  const document = await db.prepare(
    "SELECT id, document_json FROM knowledge_documents WHERE id = ?",
  ).bind(input.knowledgeDocumentId).first<{ id: string; document_json: string }>();
  if (!document) throw new KnowledgeDocumentMappingError("document_not_found", "Knowledge document not found.", 404);

  if (!sectionExists(document.document_json, input.sectionKey)) {
    throw new KnowledgeDocumentMappingError("section_not_found", "The section is not a material section in this document.");
  }

  const claim = await db.prepare(`
    SELECT id FROM canonical_claims
    WHERE id = ? AND current_state <> 'retired'
  `).bind(input.canonicalClaimId).first<{ id: string }>();
  if (!claim) throw new KnowledgeDocumentMappingError("claim_not_found", "The canonical claim is unavailable.", 409);

  for (const assertion of input.assertions) {
    const eligible = await db.prepare(`
      SELECT id FROM claim_assertions
      WHERE id = ? AND canonical_claim_id = ?
        AND reviewer_state = 'accepted'
        AND admission_state = 'admitted'
        AND freshness_state = 'current'
        AND evidence_treatment <> 'internal_synthesis'
    `).bind(assertion.claimAssertionId, input.canonicalClaimId).first<{ id: string }>();
    if (!eligible) {
      throw new KnowledgeDocumentMappingError(
        "assertion_not_eligible",
        `Assertion ${assertion.claimAssertionId} is not an accepted, current, admitted external assertion.`,
        409,
      );
    }
  }

  const now = "datetime('now')";
  const statements: D1PreparedStatement[] = [db.prepare(`
    INSERT INTO knowledge_document_claims
      (knowledge_document_id, canonical_claim_id, section_key, relationship,
       display_order, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, 0, ?, ${now})
    ON CONFLICT(knowledge_document_id, canonical_claim_id, section_key)
    DO UPDATE SET relationship = excluded.relationship,
                  reviewed_by = excluded.reviewed_by,
                  reviewed_at = excluded.reviewed_at
  `).bind(
    input.knowledgeDocumentId, input.canonicalClaimId, input.sectionKey,
    input.claimRelationship, input.reviewerEmail,
  )];

  for (const assertion of input.assertions) {
    statements.push(db.prepare(`
      INSERT INTO knowledge_document_claim_assertions
        (knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id,
         relationship, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ${now})
      ON CONFLICT(knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id)
      DO UPDATE SET relationship = excluded.relationship,
                    reviewed_by = excluded.reviewed_by,
                    reviewed_at = excluded.reviewed_at
    `).bind(
      input.knowledgeDocumentId, input.sectionKey, input.canonicalClaimId,
      assertion.claimAssertionId, assertion.relationship, input.reviewerEmail,
    ));
  }

  statements.push(db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id,
       request_id, outcome, detail_code)
    VALUES (?, ?, 'publisher', 'map_knowledge_document_claim',
            'knowledge_document', ?, ?, 'succeeded', ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(
    `${input.requestId}:succeeded`, input.reviewerEmail, input.knowledgeDocumentId,
    input.requestId, `section:${input.sectionKey}:assertions:${input.assertions.length}`,
  ));

  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    throw new KnowledgeDocumentMappingError("mapping_conflict", "The knowledge mapping changed before it could be saved.", 409);
  }
  return {
    knowledgeDocumentId: input.knowledgeDocumentId,
    sectionKey: input.sectionKey,
    canonicalClaimId: input.canonicalClaimId,
    assertionsMapped: input.assertions.length,
  };
}

function validateInput(input: KnowledgeDocumentMappingInput): void {
  if (!/^[A-Za-z0-9_-]{4,240}$/.test(input.knowledgeDocumentId)) {
    throw new KnowledgeDocumentMappingError("invalid_document_id", "Invalid knowledge document id.");
  }
  if (!/^[a-z0-9_]{1,100}$/.test(input.sectionKey)) {
    throw new KnowledgeDocumentMappingError("invalid_section_key", "Invalid knowledge section key.");
  }
  if (!/^[A-Za-z0-9_-]{4,240}$/.test(input.canonicalClaimId)) {
    throw new KnowledgeDocumentMappingError("invalid_claim_id", "Invalid canonical claim id.");
  }
  if (!claimRelationships.has(input.claimRelationship)) {
    throw new KnowledgeDocumentMappingError("invalid_claim_relationship", "Invalid knowledge claim relationship.");
  }
  if (!input.reviewerEmail || input.reviewerEmail.length > 320) {
    throw new KnowledgeDocumentMappingError("reviewer_required", "A publisher identity is required.");
  }
  if (!/^[A-Za-z0-9_-]{8,240}$/.test(input.requestId)) {
    throw new KnowledgeDocumentMappingError("invalid_request_id", "Invalid request id.");
  }
  if (!Array.isArray(input.assertions) || input.assertions.length > 25) {
    throw new KnowledgeDocumentMappingError("too_many_assertions", "A mapping may contain at most 25 assertions.");
  }
  const seen = new Set<string>();
  for (const assertion of input.assertions) {
    if (!/^[A-Za-z0-9_-]{4,240}$/.test(assertion.claimAssertionId)) {
      throw new KnowledgeDocumentMappingError("invalid_assertion_id", "Invalid claim assertion id.");
    }
    if (!assertionRelationships.has(assertion.relationship)) {
      throw new KnowledgeDocumentMappingError("invalid_assertion_relationship", "Invalid assertion relationship.");
    }
    if (seen.has(assertion.claimAssertionId)) {
      throw new KnowledgeDocumentMappingError("duplicate_assertion", "An assertion may only be mapped once.");
    }
    seen.add(assertion.claimAssertionId);
  }
}

function sectionExists(documentJson: string, sectionKey: string): boolean {
  try {
    const document = JSON.parse(documentJson) as { body?: unknown; materialClaims?: unknown };
    if (Array.isArray(document.materialClaims)
      && document.materialClaims.some((claim) => !!claim && typeof claim === "object" && (claim as { sectionKey?: unknown }).sectionKey === sectionKey)) {
      return true;
    }
    if (typeof document.body === "string") {
      const parsed = parseKnowledgeMarkdown(`---\nplaceholder: true\n---\n${document.body}`);
      if (!("error" in parsed)) return parsed.materialClaims.some((claim) => claim.sectionKey === sectionKey);
    }
  } catch {
    return false;
  }
  return false;
}
