// KC-09E: D1-authoritative resolution for Vectorize recall candidates.
//
// Vectorize is deliberately treated as an untrusted, recall-only surface. A
// match is useful only after its stable id, embedding metadata, publication
// state, admission state, and provenance have been re-read from D1.

import {
  KC09_EMBEDDING_POLICY,
  type KnowledgeVectorRecordType,
} from "./knowledge-embedding-policy";

export type KnowledgeVectorMetadata = Record<string, unknown>;

export interface KnowledgeVectorCandidate {
  id: string;
  score: number;
  metadata?: KnowledgeVectorMetadata | null;
}

export type KnowledgeVectorRejectionReason =
  | "invalid_candidate"
  | "duplicate_candidate"
  | "invalid_vector_id"
  | "record_type_mismatch"
  | "embedding_version_missing"
  | "embedding_version_mismatch"
  | "admission_state_mismatch"
  | "publication_state_mismatch"
  | "record_not_found"
  | "source_not_eligible"
  | "claim_not_eligible"
  | "story_not_eligible"
  | "knowledge_not_eligible"
  | "guide_not_eligible"
  | "correction_not_eligible"
  | "record_table_unavailable";

export interface KnowledgeVectorRejection {
  id: string;
  score: number | null;
  reason: KnowledgeVectorRejectionReason;
}

export interface KnowledgeVectorProvenance {
  sourceDocumentIds: string[];
  sourceDocumentVersionIds: string[];
  sourceChunkIds: string[];
  provenanceGroupIds: string[];
  assertionIds: string[];
}

export interface ResolvedKnowledgeVectorMatch {
  id: string;
  score: number;
  recordType: KnowledgeVectorRecordType;
  recordId: string;
  language: string;
  admissionState: string;
  publicationState: string;
  provenance: KnowledgeVectorProvenance;
  metadata: KnowledgeVectorMetadata;
}

export interface KnowledgeVectorResolution {
  accepted: ResolvedKnowledgeVectorMatch[];
  rejected: KnowledgeVectorRejection[];
}

interface ParsedVectorId {
  recordType: KnowledgeVectorRecordType;
  recordId: string;
}

const RECORD_TYPES = new Set<KnowledgeVectorRecordType>([
  "source_chunk", "canonical_claim", "published_story", "knowledge_section", "guide", "correction",
]);

function parseVectorId(id: string): ParsedVectorId | null {
  const separator = id.indexOf(":");
  if (separator <= 0 || separator === id.length - 1) return null;
  const recordType = id.slice(0, separator) as KnowledgeVectorRecordType;
  const recordId = id.slice(separator + 1);
  return RECORD_TYPES.has(recordType) && recordId ? { recordType, recordId } : null;
}

function stringMetadata(metadata: KnowledgeVectorMetadata | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function emptyProvenance(): KnowledgeVectorProvenance {
  return { sourceDocumentIds: [], sourceDocumentVersionIds: [], sourceChunkIds: [], provenanceGroupIds: [], assertionIds: [] };
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function provenanceForSourceDocument(db: D1Database, sourceDocumentId: string): Promise<KnowledgeVectorProvenance> {
  const rows = await db.prepare(`
    SELECT source_document_id, provenance_group_id
    FROM source_provenance_memberships
    WHERE source_document_id = ?
  `).bind(sourceDocumentId).all<{ source_document_id: string; provenance_group_id: string }>();
  const provenance = emptyProvenance();
  provenance.sourceDocumentIds = [sourceDocumentId];
  provenance.provenanceGroupIds = unique((rows.results ?? []).map(row => row.provenance_group_id));
  return provenance;
}

function stateRejected(
  candidate: KnowledgeVectorCandidate,
  expected: { admissionState: string; publicationState: string },
): KnowledgeVectorRejection | null {
  const metadata = candidate.metadata;
  const version = stringMetadata(metadata, "embedding_version");
  if (!version) return { id: candidate.id, score: candidate.score, reason: "embedding_version_missing" };
  if (version !== KC09_EMBEDDING_POLICY.policyVersion) {
    return { id: candidate.id, score: candidate.score, reason: "embedding_version_mismatch" };
  }
  const admission = stringMetadata(metadata, "admission_state");
  if (admission && admission !== expected.admissionState) {
    return { id: candidate.id, score: candidate.score, reason: "admission_state_mismatch" };
  }
  const publication = stringMetadata(metadata, "publication_state");
  if (publication && publication !== expected.publicationState) {
    return { id: candidate.id, score: candidate.score, reason: "publication_state_mismatch" };
  }
  return null;
}

function resolved(
  candidate: KnowledgeVectorCandidate,
  parsed: ParsedVectorId,
  state: { language: string | null; admissionState: string; publicationState: string },
  provenance: KnowledgeVectorProvenance,
): ResolvedKnowledgeVectorMatch {
  return {
    id: candidate.id,
    score: candidate.score,
    recordType: parsed.recordType,
    recordId: parsed.recordId,
    language: state.language?.trim().toLowerCase() || "und",
    admissionState: state.admissionState,
    publicationState: state.publicationState,
    provenance,
    metadata: candidate.metadata ?? {},
  };
}

async function resolveSourceChunk(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  const row = await db.prepare(`
    SELECT chunk.id, chunk.source_document_version_id, chunk.start_locator, chunk.end_locator,
           chunk.embedding_state, chunk.embedding_model, chunk.embedding_version,
           version.source_document_id, version.source_language, version.extraction_status,
           document.admission_state
    FROM source_chunks chunk
    JOIN source_document_versions version ON version.id = chunk.source_document_version_id
    JOIN source_documents document ON document.id = version.source_document_id
    WHERE chunk.id = ?
  `).bind(parsed.recordId).first<{
    id: string; source_document_version_id: string; start_locator: string | null; end_locator: string | null;
    embedding_state: string; embedding_model: string | null; embedding_version: string | null;
    source_document_id: string; source_language: string | null; extraction_status: string; admission_state: string;
  }>();
  if (!row) return { id: candidate.id, score: candidate.score, reason: "record_not_found" };
  if (row.admission_state !== "admitted" || !["captured", "extracted"].includes(row.extraction_status)
    || !row.start_locator || !row.end_locator || row.embedding_state !== "indexed"
    || row.embedding_model !== KC09_EMBEDDING_POLICY.embeddingModel
    || row.embedding_version !== KC09_EMBEDDING_POLICY.policyVersion) {
    return { id: candidate.id, score: candidate.score, reason: "source_not_eligible" };
  }
  const metadataRejection = stateRejected(candidate, { admissionState: "admitted", publicationState: "not_applicable" });
  if (metadataRejection) return metadataRejection;
  const provenance = await provenanceForSourceDocument(db, row.source_document_id);
  provenance.sourceDocumentVersionIds = [row.source_document_version_id];
  provenance.sourceChunkIds = [row.id];
  return resolved(candidate, parsed, { language: row.source_language, admissionState: "admitted", publicationState: "not_applicable" }, provenance);
}

async function resolveCanonicalClaim(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  const row = await db.prepare(`
    SELECT claim.id, version.id AS source_document_version_id, version.source_document_id,
           version.source_language, document.admission_state, assertion.id AS assertion_id,
           assertion.source_chunk_id, assertion.provenance_group_id, assertion.start_locator,
           assertion.end_locator, assertion.source_role, assertion.evidence_treatment,
           assertion.freshness_state, assertion.admission_state AS assertion_admission,
           assertion.reviewer_state
    FROM canonical_claims claim
    JOIN claim_assertions assertion ON assertion.canonical_claim_id = claim.id
    JOIN source_document_versions version ON version.id = assertion.source_document_version_id
    JOIN source_documents document ON document.id = version.source_document_id
    WHERE claim.id = ?
      AND claim.current_state NOT IN ('retired', 'corrected', 'superseded')
      AND assertion.admission_state = 'admitted'
      AND assertion.reviewer_state = 'accepted'
      AND assertion.freshness_state IN ('current', 'unknown')
      AND assertion.source_role IN ('evidence', 'reported_claim')
      AND assertion.evidence_treatment NOT IN ('discovery_only', 'internal_synthesis')
      AND document.admission_state = 'admitted'
      AND version.extraction_status IN ('captured', 'extracted')
    ORDER BY CASE WHEN assertion.source_role = 'evidence' THEN 0 ELSE 1 END, assertion.reviewed_at DESC
    LIMIT 1
  `).bind(parsed.recordId).first<{
    id: string; source_document_version_id: string; source_document_id: string; source_language: string | null;
    admission_state: string; assertion_id: string; source_chunk_id: string | null; provenance_group_id: string | null;
    start_locator: string | null; end_locator: string | null; source_role: string; evidence_treatment: string;
    freshness_state: string; assertion_admission: string; reviewer_state: string;
  }>();
  if (!row) return { id: candidate.id, score: candidate.score, reason: "claim_not_eligible" };
  const metadataRejection = stateRejected(candidate, { admissionState: "admitted", publicationState: "not_applicable" });
  if (metadataRejection) return metadataRejection;
  const provenance = await provenanceForSourceDocument(db, row.source_document_id);
  provenance.sourceDocumentVersionIds = [row.source_document_version_id];
  provenance.assertionIds = [row.assertion_id];
  provenance.sourceChunkIds = unique([row.source_chunk_id]);
  provenance.provenanceGroupIds = unique([...provenance.provenanceGroupIds, row.provenance_group_id]);
  return resolved(candidate, parsed, { language: row.source_language, admissionState: "admitted", publicationState: "not_applicable" }, provenance);
}

async function resolvePublishedStory(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  const row = await db.prepare(`
    SELECT id, publication_status, published_at, reviewed_by, reviewed_at
    FROM story_clusters
    WHERE id = ? AND publication_status = 'published'
      AND published_at IS NOT NULL AND datetime(published_at) <= datetime('now')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
  `).bind(parsed.recordId).first<{ id: number; publication_status: string; published_at: string; reviewed_by: string; reviewed_at: string }>();
  if (!row) return { id: candidate.id, score: candidate.score, reason: "story_not_eligible" };
  const metadataRejection = stateRejected(candidate, { admissionState: "admitted", publicationState: "published" });
  if (metadataRejection) return metadataRejection;
  const groups = await db.prepare(`
    SELECT DISTINCT assertion.provenance_group_id
    FROM story_claims story_claim
    JOIN claim_assertions assertion ON assertion.canonical_claim_id = story_claim.canonical_claim_id
    JOIN source_document_versions version ON version.id = assertion.source_document_version_id
    JOIN source_documents document ON document.id = version.source_document_id
    WHERE story_claim.story_cluster_id = ? AND assertion.admission_state = 'admitted'
      AND assertion.reviewer_state = 'accepted' AND document.admission_state = 'admitted'
      AND assertion.provenance_group_id IS NOT NULL
  `).bind(parsed.recordId).all<{ provenance_group_id: string }>();
  const provenance = emptyProvenance();
  provenance.provenanceGroupIds = unique((groups.results ?? []).map(group => group.provenance_group_id));
  return resolved(candidate, parsed, { language: null, admissionState: "admitted", publicationState: "published" }, provenance);
}

async function resolveKnowledgeSection(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  const separator = parsed.recordId.indexOf(":");
  if (separator <= 0 || separator === parsed.recordId.length - 1) return { id: candidate.id, score: candidate.score, reason: "invalid_vector_id" };
  const documentId = parsed.recordId.slice(0, separator);
  const sectionSlug = parsed.recordId.slice(separator + 1);
  const row = await db.prepare(`
    SELECT id, section_slug, visibility, status, approved_by, approved_at, hard_expiry
    FROM knowledge_documents
    WHERE id = ? AND section_slug = ? AND status = 'approved'
      AND visibility IN ('public_knowledge', 'public_guide')
      AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND (hard_expiry IS NULL OR datetime(hard_expiry) > datetime('now'))
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_change_proposals proposal
        WHERE proposal.knowledge_document_id = knowledge_documents.id AND proposal.state = 'proposed'
      )
  `).bind(documentId, sectionSlug).first<{ id: string; section_slug: string; visibility: string; status: string; approved_by: string; approved_at: string; hard_expiry: string | null }>();
  if (!row) return { id: candidate.id, score: candidate.score, reason: "knowledge_not_eligible" };
  const metadataRejection = stateRejected(candidate, { admissionState: "admitted", publicationState: row.visibility });
  if (metadataRejection) return metadataRejection;
  const provenance = emptyProvenance();
  const sources = await db.prepare(`
    SELECT source_reference, claim_reference FROM knowledge_document_sources
    WHERE knowledge_document_id = ? AND admission_state = 'admitted' AND freshness_state IN ('current', 'unknown')
  `).bind(row.id).all<{ source_reference: string; claim_reference: string }>();
  provenance.sourceDocumentIds = unique((sources.results ?? []).map(source => source.source_reference.startsWith("source_document:") ? source.source_reference.slice("source_document:".length) : null));
  provenance.assertionIds = unique((sources.results ?? []).map(source => source.claim_reference.startsWith("claim_assertion:") ? source.claim_reference.slice("claim_assertion:".length) : null));
  return resolved(candidate, parsed, { language: null, admissionState: "admitted", publicationState: row.visibility }, provenance);
}

async function resolveGuide(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  let row: { id: string; status: string; visibility: string; reviewed_by: string | null; published_at: string | null } | null;
  try {
    row = await db.prepare(`
      SELECT id, status, visibility, reviewed_by, published_at
      FROM guides WHERE id = ? AND status = 'published' AND visibility = 'public'
        AND reviewed_by IS NOT NULL AND published_at IS NOT NULL
    `).bind(parsed.recordId).first();
  } catch {
    return { id: candidate.id, score: candidate.score, reason: "record_table_unavailable" };
  }
  if (!row) return { id: candidate.id, score: candidate.score, reason: "guide_not_eligible" };
  const metadataRejection = stateRejected(candidate, { admissionState: "admitted", publicationState: "published" });
  if (metadataRejection) return metadataRejection;
  return resolved(candidate, parsed, { language: null, admissionState: "admitted", publicationState: "published" }, emptyProvenance());
}

async function resolveCorrection(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  const row = await db.prepare("SELECT id FROM corrections WHERE id = ? AND published = 1").bind(parsed.recordId).first<{ id: number }>();
  if (!row) return { id: candidate.id, score: candidate.score, reason: "correction_not_eligible" };
  const metadataRejection = stateRejected(candidate, { admissionState: "admitted", publicationState: "published" });
  if (metadataRejection) return metadataRejection;
  return resolved(candidate, parsed, { language: null, admissionState: "admitted", publicationState: "published" }, emptyProvenance());
}

async function resolveOne(db: D1Database, candidate: KnowledgeVectorCandidate, parsed: ParsedVectorId): Promise<ResolvedKnowledgeVectorMatch | KnowledgeVectorRejection> {
  const metadataType = stringMetadata(candidate.metadata, "record_type");
  if (metadataType && metadataType !== parsed.recordType) return { id: candidate.id, score: candidate.score, reason: "record_type_mismatch" };
  switch (parsed.recordType) {
    case "source_chunk": return resolveSourceChunk(db, candidate, parsed);
    case "canonical_claim": return resolveCanonicalClaim(db, candidate, parsed);
    case "published_story": return resolvePublishedStory(db, candidate, parsed);
    case "knowledge_section": return resolveKnowledgeSection(db, candidate, parsed);
    case "guide": return resolveGuide(db, candidate, parsed);
    case "correction": return resolveCorrection(db, candidate, parsed);
  }
}

/** Resolve Vectorize matches in score order; no metadata is trusted as authority. */
export async function resolveKnowledgeVectorMatches(
  db: D1Database,
  candidates: KnowledgeVectorCandidate[],
  options: { limit?: number } = {},
): Promise<KnowledgeVectorResolution> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 20), 1), 100);
  const ordered = [...candidates]
    .filter(candidate => candidate && typeof candidate.id === "string" && candidate.id.length > 0 && Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);
  const seen = new Set<string>();
  const accepted: ResolvedKnowledgeVectorMatch[] = [];
  const rejected: KnowledgeVectorRejection[] = [];
  for (const candidate of ordered) {
    if (seen.has(candidate.id)) {
      rejected.push({ id: candidate.id, score: candidate.score, reason: "duplicate_candidate" });
      continue;
    }
    seen.add(candidate.id);
    const parsed = parseVectorId(candidate.id);
    if (!parsed) {
      rejected.push({ id: candidate.id, score: candidate.score, reason: "invalid_vector_id" });
      continue;
    }
    const result = await resolveOne(db, candidate, parsed);
    if ("reason" in result) rejected.push(result);
    else if (accepted.length < limit) accepted.push(result);
  }
  return { accepted, rejected };
}
