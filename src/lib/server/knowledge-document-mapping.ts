import { parseKnowledgeMarkdown, type KnowledgeClaimRelationship } from "./knowledge-markdown";
import { getLegacyKnowledgeSourceLink, sourceReferenceMatches } from "./knowledge-source-migration";
import { triggerKnowledgeReview } from "./knowledge-change-proposals";

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
  /** Existing string-only source link being explicitly migrated, if any. */
  legacySourceLinkId?: string;
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

  const legacySourceLink = input.legacySourceLinkId
    ? await getLegacyKnowledgeSourceLink(db, input.legacySourceLinkId, input.knowledgeDocumentId)
    : null;
  if (input.legacySourceLinkId && !legacySourceLink) {
    throw new KnowledgeDocumentMappingError("legacy_source_link_not_found", "The legacy source link is unavailable.", 404);
  }
  if (legacySourceLink && ["rejected", "retained_legacy"].includes(legacySourceLink.state)) {
    throw new KnowledgeDocumentMappingError("legacy_source_link_closed", "That legacy source link has already been closed without migration.", 409);
  }
  if (legacySourceLink?.state === "migrated"
    && (legacySourceLink.migrated_section_key !== input.sectionKey
      || legacySourceLink.migrated_canonical_claim_id !== input.canonicalClaimId)) {
    throw new KnowledgeDocumentMappingError("legacy_source_link_already_migrated", "That legacy source link is already mapped to a different reviewed claim.", 409);
  }
  if (legacySourceLink && legacySourceLink.source_role !== "internal_synthesis" && input.assertions.length === 0) {
    throw new KnowledgeDocumentMappingError("legacy_source_requires_assertion", "An external legacy source link must resolve to at least one reviewed assertion.", 409);
  }

  for (const assertion of input.assertions) {
    const eligible = await db.prepare(`
      SELECT ca.id, version.retrieved_url, source_document.canonical_url
      FROM claim_assertions ca
      LEFT JOIN source_document_versions version ON version.id = ca.source_document_version_id
      LEFT JOIN source_documents source_document ON source_document.id = version.source_document_id
      WHERE ca.id = ? AND ca.canonical_claim_id = ?
        AND ca.reviewer_state = 'accepted'
        AND ca.admission_state = 'admitted'
        AND ca.freshness_state = 'current'
        AND ca.evidence_treatment <> 'internal_synthesis'
    `).bind(assertion.claimAssertionId, input.canonicalClaimId).first<{
      id: string;
      retrieved_url: string | null;
      canonical_url: string | null;
    }>();
    if (!eligible) {
      throw new KnowledgeDocumentMappingError(
        "assertion_not_eligible",
        `Assertion ${assertion.claimAssertionId} is not an accepted, current, admitted external assertion.`,
        409,
      );
    }
    if (legacySourceLink
      && legacySourceLink.source_role !== "internal_synthesis"
      && !sourceReferenceMatches(legacySourceLink.source_reference, eligible.retrieved_url)
      && !sourceReferenceMatches(legacySourceLink.source_reference, eligible.canonical_url)) {
      throw new KnowledgeDocumentMappingError(
        "legacy_source_assertion_mismatch",
        `Assertion ${assertion.claimAssertionId} does not resolve to the legacy source URL under review.`,
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

  if (legacySourceLink) {
    statements.push(db.prepare(`
      UPDATE knowledge_source_link_migration_audit
      SET state = 'migrated', migrated_section_key = ?, migrated_canonical_claim_id = ?,
          reviewed_by = ?, reviewed_at = datetime('now'), migrated_at = datetime('now'),
          review_reason = 'Publisher reviewed section, claim, and assertion mapping.'
      WHERE legacy_source_link_id = ? AND knowledge_document_id = ?
        AND state IN ('pending_review', 'migrated')
    `).bind(
      input.sectionKey, input.canonicalClaimId, input.reviewerEmail,
      input.legacySourceLinkId, input.knowledgeDocumentId,
    ));
  }

  const results = await db.batch(statements);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    throw new KnowledgeDocumentMappingError("mapping_conflict", "The knowledge mapping changed before it could be saved.", 409);
  }
  const currentDocument = await db.prepare(
    "SELECT status FROM knowledge_documents WHERE id = ?",
  ).bind(input.knowledgeDocumentId).first<{ status: string }>();
  if (currentDocument?.status === "approved") {
    await triggerKnowledgeReview(db, {
      kind: "evidence_changed",
      claimIds: [input.canonicalClaimId],
      eventId: input.requestId,
    });
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
