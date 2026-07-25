export type KnowledgeSourceLinkMigrationState =
  | "pending_review"
  | "migrated"
  | "retained_legacy"
  | "rejected";

export interface LegacyKnowledgeSourceLink {
  id: string;
  legacy_source_link_id: string;
  knowledge_document_id: string;
  source_reference: string;
  claim_reference: string;
  source_kind: string;
  source_role: string;
  admission_state: string;
  freshness_state: string;
  independent_evidence_weight: number;
  relationship: string;
  state: KnowledgeSourceLinkMigrationState;
  migrated_section_key: string | null;
  migrated_canonical_claim_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  migrated_at: string | null;
  created_at: string;
}

/** Return legacy string links that still need an explicit publisher decision. */
export async function listLegacyKnowledgeSourceLinks(
  db: D1Database,
  knowledgeDocumentId: string,
): Promise<LegacyKnowledgeSourceLink[]> {
  const result = await db.prepare(`
    SELECT id, legacy_source_link_id, knowledge_document_id, source_reference,
           claim_reference, source_kind, source_role, admission_state,
           freshness_state, independent_evidence_weight, relationship, state,
           migrated_section_key, migrated_canonical_claim_id, reviewed_by,
           reviewed_at, review_reason, migrated_at, created_at
    FROM knowledge_source_link_migration_audit
    WHERE knowledge_document_id = ?
    ORDER BY CASE state WHEN 'pending_review' THEN 0 ELSE 1 END, created_at ASC
  `).bind(knowledgeDocumentId).all<LegacyKnowledgeSourceLink>();
  return result.results ?? [];
}

export async function getLegacyKnowledgeSourceLink(
  db: D1Database,
  legacySourceLinkId: string,
  knowledgeDocumentId: string,
): Promise<LegacyKnowledgeSourceLink | null> {
  return db.prepare(`
    SELECT id, legacy_source_link_id, knowledge_document_id, source_reference,
           claim_reference, source_kind, source_role, admission_state,
           freshness_state, independent_evidence_weight, relationship, state,
           migrated_section_key, migrated_canonical_claim_id, reviewed_by,
           reviewed_at, review_reason, migrated_at, created_at
    FROM knowledge_source_link_migration_audit
    WHERE legacy_source_link_id = ? AND knowledge_document_id = ?
  `).bind(legacySourceLinkId, knowledgeDocumentId).first<LegacyKnowledgeSourceLink>();
}

/**
 * URL comparison for migration review. Redirects are handled by the source
 * document's canonical URL; fragments are never evidence locators.
 */
export function sourceReferenceMatches(reference: string, candidate: string | null): boolean {
  if (!candidate) return false;
  try {
    const normalise = (value: string) => {
      const url = new URL(value);
      url.hash = "";
      return url.toString().replace(/\/$/, "").toLowerCase();
    };
    return normalise(reference) === normalise(candidate);
  } catch {
    return false;
  }
}
