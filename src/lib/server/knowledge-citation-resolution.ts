// KC-09I: D1-authoritative citation resolution.
//
// Answer citations are identifiers supplied by a model, never proof.  Before
// they enter an answer packet, re-read the reviewed assertion, its canonical
// claim, source document version, and source chunk from D1.  Every locator is
// compared byte-for-byte with both the reviewed assertion and the chunk.

export interface KnowledgeCitationInput {
  assertionId: string;
  sourceDocumentVersionId: string;
  sourceChunkId: string;
  startLocator: string;
  endLocator: string;
}

export type KnowledgeCitationRejectionReason =
  | "invalid_citation"
  | "duplicate_citation"
  | "assertion_not_found"
  | "assertion_not_eligible"
  | "stale_or_disputed"
  | "source_not_admitted"
  | "version_not_eligible"
  | "source_version_mismatch"
  | "source_chunk_not_found"
  | "source_chunk_mismatch"
  | "locator_mismatch";

export interface KnowledgeCitationRejection {
  citation: KnowledgeCitationInput;
  reason: KnowledgeCitationRejectionReason;
}

export interface ResolvedKnowledgeCitation extends KnowledgeCitationInput {
  canonicalClaimId: string;
  assertionText: string;
  relationship: string;
  sourceRole: string;
  directness: string;
  evidenceTreatment: string;
  freshnessState: string;
  sourceDocumentId: string;
  canonicalUrl: string;
  retrievedAt: string;
  sourceLanguage: string | null;
  chunkText: string;
  provenanceGroupId: string | null;
  provenanceGroupIds: string[];
}

export interface KnowledgeCitationResolution {
  resolved: ResolvedKnowledgeCitation[];
  rejected: KnowledgeCitationRejection[];
}

export interface CitationReferenceValidation {
  passed: boolean;
  failures: string[];
  resolution: KnowledgeCitationResolution;
}

const MAX_CITATIONS = 100;
const MAX_FIELD_LENGTH = 512;

function malformed(citation: unknown): boolean {
  if (!citation || typeof citation !== "object") return true;
  return Object.values(citation as Record<string, unknown>).some((value) =>
    typeof value !== "string" || value.length === 0 || value.length > MAX_FIELD_LENGTH || value.trim() !== value,
  );
}

function citationShape(value: unknown): KnowledgeCitationInput {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    assertionId: typeof record.assertionId === "string" ? record.assertionId : "",
    sourceDocumentVersionId: typeof record.sourceDocumentVersionId === "string" ? record.sourceDocumentVersionId : "",
    sourceChunkId: typeof record.sourceChunkId === "string" ? record.sourceChunkId : "",
    startLocator: typeof record.startLocator === "string" ? record.startLocator : "",
    endLocator: typeof record.endLocator === "string" ? record.endLocator : "",
  };
}

interface CitationRow {
  assertion_id: string;
  canonical_claim_id: string;
  claim_state: string;
  assertion_version_id: string | null;
  assertion_chunk_id: string | null;
  assertion_start: string | null;
  assertion_end: string | null;
  assertion_text: string;
  relationship: string;
  source_role: string;
  directness: string;
  evidence_treatment: string;
  assertion_admission: string;
  freshness_state: string;
  provenance_group_id: string | null;
  reviewer_state: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  version_id: string | null;
  source_document_id: string | null;
  source_language: string | null;
  extraction_status: string | null;
  retrieved_at: string | null;
  canonical_url: string | null;
  document_admission: string | null;
  chunk_id: string | null;
  chunk_version_id: string | null;
  chunk_start: string | null;
  chunk_end: string | null;
  chunk_text: string | null;
}

function rejectCitation(citation: KnowledgeCitationInput, reason: KnowledgeCitationRejectionReason): KnowledgeCitationRejection {
  return { citation, reason };
}

function classify(citation: KnowledgeCitationInput, row: CitationRow | null): KnowledgeCitationRejectionReason | null {
  if (!row) return "assertion_not_found";
  if (["retired", "corrected", "superseded", "disputed"].includes(row.claim_state)
    || row.freshness_state === "stale") return "stale_or_disputed";
  if (row.document_admission !== "admitted") return "source_not_admitted";
  if (!row.version_id || row.version_id !== citation.sourceDocumentVersionId || row.assertion_version_id !== citation.sourceDocumentVersionId) {
    return "source_version_mismatch";
  }
  if (!row.extraction_status || !["captured", "extracted"].includes(row.extraction_status)) return "version_not_eligible";
  if (!row.chunk_id) return "source_chunk_not_found";
  if (row.chunk_id !== citation.sourceChunkId || row.assertion_chunk_id !== citation.sourceChunkId || row.chunk_version_id !== citation.sourceDocumentVersionId) {
    return "source_chunk_mismatch";
  }
  if (row.assertion_admission !== "admitted"
    || !["accepted", "amended"].includes(row.reviewer_state)
    || !row.reviewed_by || !row.reviewed_at
    || !["evidence", "reported_claim"].includes(row.source_role)
    || ["discovery_only", "internal_synthesis"].includes(row.evidence_treatment)) {
    return "assertion_not_eligible";
  }
  if (!row.assertion_start || !row.assertion_end || !row.chunk_start || !row.chunk_end
    || row.assertion_start !== citation.startLocator || row.assertion_end !== citation.endLocator
    || row.chunk_start !== citation.startLocator || row.chunk_end !== citation.endLocator) {
    return "locator_mismatch";
  }
  return null;
}

/** Resolve reviewed answer citations. D1 state is authoritative; input metadata is not trusted. */
export async function resolveKnowledgeCitations(
  db: D1Database,
  citations: KnowledgeCitationInput[],
  options: { limit?: number } = {},
): Promise<KnowledgeCitationResolution> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 32), 1), MAX_CITATIONS);
  const resolved: ResolvedKnowledgeCitation[] = [];
  const rejected: KnowledgeCitationRejection[] = [];
  const seen = new Set<string>();
  const inputs = Array.isArray(citations) ? citations : [];

  for (const candidate of inputs.slice(0, MAX_CITATIONS)) {
    const citation = citationShape(candidate);
    if (malformed(citation)) {
      rejected.push(rejectCitation(citation, "invalid_citation"));
      continue;
    }
    if (seen.has(citation.assertionId)) {
      rejected.push(rejectCitation(citation, "duplicate_citation"));
      continue;
    }
    seen.add(citation.assertionId);

    const row = await db.prepare(`
      SELECT assertion.id AS assertion_id, assertion.canonical_claim_id,
             claim.current_state AS claim_state,
             assertion.source_document_version_id AS assertion_version_id,
             assertion.source_chunk_id AS assertion_chunk_id,
             assertion.start_locator AS assertion_start, assertion.end_locator AS assertion_end,
             assertion.assertion_text, assertion.relationship, assertion.source_role,
             assertion.directness, assertion.evidence_treatment,
             assertion.admission_state AS assertion_admission, assertion.freshness_state,
             assertion.provenance_group_id, assertion.reviewer_state,
             assertion.reviewed_by, assertion.reviewed_at,
             version.id AS version_id, version.source_document_id,
             version.source_language, version.extraction_status, version.retrieved_at,
             document.canonical_url, document.admission_state AS document_admission,
             chunk.id AS chunk_id, chunk.source_document_version_id AS chunk_version_id,
             chunk.start_locator AS chunk_start, chunk.end_locator AS chunk_end,
             chunk.text_excerpt AS chunk_text
      FROM claim_assertions assertion
      LEFT JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
      LEFT JOIN source_document_versions version ON version.id = assertion.source_document_version_id
      LEFT JOIN source_documents document ON document.id = version.source_document_id
      LEFT JOIN source_chunks chunk ON chunk.id = assertion.source_chunk_id
      WHERE assertion.id = ?
    `).bind(citation.assertionId).first<CitationRow>();
    const reason = classify(citation, row);
    if (reason) {
      rejected.push(rejectCitation(citation, reason));
      continue;
    }
    if (resolved.length >= limit) {
      rejected.push(rejectCitation(citation, "invalid_citation"));
      continue;
    }
    const provenance = row!.source_document_id
      ? await db.prepare(`
          SELECT DISTINCT provenance_group_id
          FROM source_provenance_memberships
          WHERE source_document_id = ?
        `).bind(row!.source_document_id).all<{ provenance_group_id: string }>()
      : { results: [] as Array<{ provenance_group_id: string }> };
    resolved.push({
      assertionId: citation.assertionId,
      sourceDocumentVersionId: citation.sourceDocumentVersionId,
      sourceChunkId: citation.sourceChunkId,
      startLocator: citation.startLocator,
      endLocator: citation.endLocator,
      canonicalClaimId: row!.canonical_claim_id,
      assertionText: row!.assertion_text,
      relationship: row!.relationship,
      sourceRole: row!.source_role,
      directness: row!.directness,
      evidenceTreatment: row!.evidence_treatment,
      freshnessState: row!.freshness_state,
      sourceDocumentId: row!.source_document_id!,
      canonicalUrl: row!.canonical_url!,
      retrievedAt: row!.retrieved_at!,
      sourceLanguage: row!.source_language,
      chunkText: row!.chunk_text!,
      provenanceGroupId: row!.provenance_group_id,
      provenanceGroupIds: [...new Set((provenance.results ?? []).map((item) => item.provenance_group_id))],
    });
  }
  return { resolved, rejected };
}

/** Resolve citations and ensure every answer-level assertion reference survived. */
export async function resolveAndValidateCitationReferences(
  db: D1Database,
  citations: KnowledgeCitationInput[],
  referencedAssertionIds: string[] = [],
): Promise<CitationReferenceValidation> {
  const resolution = await resolveKnowledgeCitations(db, citations);
  const resolvedIds = new Set(resolution.resolved.map((citation) => citation.assertionId));
  const failures = resolution.rejected.map((item) => `${item.citation.assertionId}: ${item.reason}`);
  for (const assertionId of referencedAssertionIds) {
    if (!resolvedIds.has(assertionId)) failures.push(`Referenced assertion was not resolved: ${assertionId}`);
  }
  return { passed: failures.length === 0, failures, resolution };
}
