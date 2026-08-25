/**
 * KC-12B/C: read-only public evidence projection.
 *
 * The public projection intentionally resolves through D1 rather than exposing
 * R2 source bodies. Only reviewed, admitted, current, locator-backed
 * assertions with an extracted source chunk are eligible. This also makes PDF
 * and metadata-only source versions naturally ineligible without a separate
 * public-media exception.
 */

export interface PublicEvidenceAssertion {
  assertionId: string;
  claimId: string;
  assertionText: string;
  relationship: string;
  sourceRole: string;
  directness: string;
  sourceName: string;
  sourceTier: string | null;
  sourceUrl: string | null;
  sourceDocumentVersionId: string;
  sourceDocumentId: string;
  provenanceGroupId: string | null;
  provenanceOriginType: string | null;
  startLocator: string | null;
  endLocator: string | null;
  retrievedAt: string | null;
  publishedAt: string | null;
}

export interface PublicEvidenceClaim {
  claimId: string;
  statement: string;
  role: string;
  materiality: string;
  relationship?: string;
  sectionKey?: string;
  evidenceStatus: string | null;
  assertions: PublicEvidenceAssertion[];
}

export interface PublicStoryEvidence {
  claims: PublicEvidenceClaim[];
  totalClaimCount: number;
  resolvedClaimCount: number;
  unresolvedClaimCount: number;
  assertionCount: number;
  sourceCount: number;
  provenanceGroupCount: number;
}

export interface PublicKnowledgeEvidence {
  claims: PublicEvidenceClaim[];
  totalClaimCount: number;
  resolvedClaimCount: number;
  unresolvedClaimCount: number;
  assertionCount: number;
  sourceCount: number;
  provenanceGroupCount: number;
}

export interface PublicRelatedStory {
  slug: string;
  headline: string;
  topic: string | null;
  relationship: string;
  relationshipLabel: string;
  explanation: string | null;
  confidence: number;
  direction: "outgoing" | "incoming";
}

interface PublicClaimRow {
  claim_id: string;
  canonical_text: string;
  role: string;
  materiality: string;
  relationship?: string;
  section_key?: string;
  evidence_status: string | null;
}

interface PublicAssertionRow {
  assertion_id: string;
  canonical_claim_id: string;
  assertion_text: string;
  relationship: string;
  source_role: string;
  directness: string;
  source_document_version_id: string;
  source_document_id: string;
  canonical_url: string;
  retrieved_url: string | null;
  source_name: string | null;
  source_tier: string | null;
  provenance_group_id: string | null;
  provenance_origin_type: string | null;
  start_locator: string | null;
  end_locator: string | null;
  retrieved_at: string | null;
  published_at: string | null;
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number): number {
  return Math.max(1, Math.min(Number.isInteger(value) ? value! : fallback, maximum));
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function safePublicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function boundedAssertionText(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 480 ? `${text.slice(0, 477)}…` : text;
}

function mapAssertion(row: PublicAssertionRow): PublicEvidenceAssertion {
  return {
    assertionId: row.assertion_id,
    claimId: row.canonical_claim_id,
    assertionText: boundedAssertionText(row.assertion_text),
    relationship: row.relationship,
    sourceRole: row.source_role,
    directness: row.directness,
    sourceName: row.source_name?.trim() || "Captured source",
    sourceTier: row.source_tier,
    sourceUrl: safePublicUrl(row.retrieved_url) ?? safePublicUrl(row.canonical_url),
    sourceDocumentVersionId: row.source_document_version_id,
    sourceDocumentId: row.source_document_id,
    provenanceGroupId: row.provenance_group_id,
    provenanceOriginType: row.provenance_origin_type,
    startLocator: row.start_locator,
    endLocator: row.end_locator,
    retrievedAt: row.retrieved_at,
    publishedAt: row.published_at,
  };
}

function projectEvidence(
  claimRows: PublicClaimRow[],
  assertionRows: PublicAssertionRow[],
): Omit<PublicStoryEvidence, "totalClaimCount" | "resolvedClaimCount" | "unresolvedClaimCount"> & { claims: PublicEvidenceClaim[] } {
  const assertionsByClaim = new Map<string, PublicEvidenceAssertion[]>();
  for (const row of assertionRows) {
    const assertion = mapAssertion(row);
    const existing = assertionsByClaim.get(row.canonical_claim_id) ?? [];
    if (existing.length < 4) existing.push(assertion);
    assertionsByClaim.set(row.canonical_claim_id, existing);
  }

  const claims = claimRows.flatMap((row): PublicEvidenceClaim[] => {
    const assertions = assertionsByClaim.get(row.claim_id) ?? [];
    return assertions.length > 0
      ? [{
        claimId: row.claim_id,
        statement: row.canonical_text,
        role: row.role,
        materiality: row.materiality,
        ...(row.relationship ? { relationship: row.relationship } : {}),
        ...(row.section_key ? { sectionKey: row.section_key } : {}),
        evidenceStatus: row.evidence_status,
        assertions,
      }]
      : [];
  });
  const visibleAssertions = claims.flatMap((claim) => claim.assertions);
  const sourceIds = new Set(visibleAssertions.map((assertion) => assertion.sourceDocumentId));
  const provenanceIds = new Set(visibleAssertions.map((assertion) => assertion.provenanceGroupId).filter(Boolean));
  return {
    claims,
    assertionCount: claims.reduce((total, claim) => total + claim.assertions.length, 0),
    sourceCount: sourceIds.size,
    provenanceGroupCount: provenanceIds.size,
  };
}

async function loadAssertions(
  db: D1Database,
  claimIds: string[],
  documentId?: string,
): Promise<PublicAssertionRow[]> {
  if (claimIds.length === 0) return [];
  const documentPredicate = documentId ? "AND kda.knowledge_document_id = ?" : "";
  const documentJoin = documentId
    ? `
      JOIN knowledge_document_claim_assertions kda
        ON kda.claim_assertion_id = ca.id
       AND kda.canonical_claim_id = ca.canonical_claim_id
       AND kda.reviewed_by IS NOT NULL
       AND kda.reviewed_at IS NOT NULL
    `
    : "";
  const params: unknown[] = [...claimIds];
  if (documentId) params.push(documentId);
  params.push(Math.min(claimIds.length * 4, 96));
  const result = await db.prepare(`
    SELECT ca.id AS assertion_id, ca.canonical_claim_id, ca.assertion_text,
           ca.relationship, ca.source_role, ca.directness,
           ca.source_document_version_id, sd.id AS source_document_id,
           sd.canonical_url, sv.retrieved_url, s.name AS source_name,
           s.tier AS source_tier, pg.id AS provenance_group_id,
           pg.origin_type AS provenance_origin_type, ca.start_locator,
           ca.end_locator, sv.retrieved_at, sv.published_at
    FROM claim_assertions ca
    JOIN canonical_claims cc ON cc.id = ca.canonical_claim_id
    JOIN source_document_versions sv ON sv.id = ca.source_document_version_id
    JOIN source_documents sd ON sd.id = sv.source_document_id
    JOIN source_chunks chunk ON chunk.id = ca.source_chunk_id
    ${documentJoin}
    LEFT JOIN sources s ON s.id = sd.source_id
    LEFT JOIN provenance_groups pg ON pg.id = ca.provenance_group_id
    WHERE ca.canonical_claim_id IN (${placeholders(claimIds.length)})
      ${documentPredicate}
      AND ca.reviewer_state IN ('accepted', 'amended')
      AND ca.admission_state = 'admitted'
      AND ca.freshness_state = 'current'
      AND ca.evidence_treatment <> 'internal_synthesis'
      AND ca.start_locator IS NOT NULL AND ca.end_locator IS NOT NULL
      AND sd.admission_state = 'admitted'
      AND sd.media_kind <> 'pdf'
      AND sv.extraction_state = 'extracted'
      AND cc.current_state NOT IN ('corrected', 'superseded', 'retired')
    ORDER BY ca.canonical_claim_id, ca.id
    LIMIT ?
  `).bind(...params).all<PublicAssertionRow>();
  return result.results ?? [];
}

function scoreStatusSubquery(alias: string): string {
  return `(
    SELECT ${alias}.evidence_status
    FROM canonical_claim_score_snapshots ${alias}
    WHERE ${alias}.canonical_claim_id = cc.id
    ORDER BY ${alias}.created_at DESC, ${alias}.id DESC
    LIMIT 1
  )`;
}

export async function getPublicStoryEvidence(
  db: D1Database,
  storyId: number,
  limit = 24,
): Promise<PublicStoryEvidence> {
  const claimLimit = boundedLimit(limit, 24, 24);
  if (!Number.isInteger(storyId) || storyId < 1) {
    return { claims: [], totalClaimCount: 0, resolvedClaimCount: 0, unresolvedClaimCount: 0, assertionCount: 0, sourceCount: 0, provenanceGroupCount: 0 };
  }
  const result = await db.prepare(`
    SELECT sc.canonical_claim_id AS claim_id, cc.canonical_text, sc.role,
           sc.materiality, ${scoreStatusSubquery("story_score")} AS evidence_status
    FROM story_claims sc
    JOIN canonical_claims cc ON cc.id = sc.canonical_claim_id
    WHERE sc.story_cluster_id = ?
    ORDER BY sc.display_order, sc.canonical_claim_id
    LIMIT ?
  `).bind(storyId, claimLimit).all<PublicClaimRow>();
  const claimRows = result.results ?? [];
  const projected = projectEvidence(claimRows, await loadAssertions(db, claimRows.map((row) => row.claim_id)));
  const totalClaimCount = claimRows.length;
  return {
    ...projected,
    totalClaimCount,
    resolvedClaimCount: projected.claims.length,
    unresolvedClaimCount: Math.max(0, totalClaimCount - projected.claims.length),
  };
}

export async function getPublicKnowledgeEvidence(
  db: D1Database,
  knowledgeDocumentId: string,
  limit = 24,
): Promise<PublicKnowledgeEvidence> {
  const claimLimit = boundedLimit(limit, 24, 24);
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(knowledgeDocumentId)) {
    return { claims: [], totalClaimCount: 0, resolvedClaimCount: 0, unresolvedClaimCount: 0, assertionCount: 0, sourceCount: 0, provenanceGroupCount: 0 };
  }
  const result = await db.prepare(`
    SELECT kdc.canonical_claim_id AS claim_id, cc.canonical_text,
           kdc.relationship, kdc.section_key, kdc.relationship AS role,
           cc.materiality, ${scoreStatusSubquery("knowledge_score")} AS evidence_status
    FROM knowledge_document_claims kdc
    JOIN canonical_claims cc ON cc.id = kdc.canonical_claim_id
    WHERE kdc.knowledge_document_id = ?
      AND kdc.reviewed_by IS NOT NULL AND kdc.reviewed_at IS NOT NULL
    ORDER BY kdc.section_key, kdc.display_order, kdc.canonical_claim_id
    LIMIT ?
  `).bind(knowledgeDocumentId, claimLimit).all<PublicClaimRow>();
  const claimRows = result.results ?? [];
  const projected = projectEvidence(
    claimRows,
    await loadAssertions(db, claimRows.map((row) => row.claim_id), knowledgeDocumentId),
  );
  const totalClaimCount = claimRows.length;
  return {
    ...projected,
    totalClaimCount,
    resolvedClaimCount: projected.claims.length,
    unresolvedClaimCount: Math.max(0, totalClaimCount - projected.claims.length),
  };
}

function relationshipLabel(relationship: string, direction: "outgoing" | "incoming"): string {
  const labels: Record<string, [string, string]> = {
    same_event: ["Same event", "Same event"],
    follow_up_to: ["Follow-up to", "Followed up by"],
    updates: ["Updates", "Updated by"],
    contradicts: ["Contradicts", "Contradicted by"],
    supersedes: ["Supersedes", "Superseded by"],
    corrects: ["Corrects", "Corrected by"],
    compares_with: ["Compared with", "Compared with"],
    same_model_family: ["Same model family", "Same model family"],
    related_context: ["Related context", "Related context"],
  };
  const pair = labels[relationship] ?? [relationship.replace(/_/g, " "), relationship.replace(/_/g, " ")];
  return pair[direction === "outgoing" ? 0 : 1];
}

export async function getPublicRelatedStories(
  db: D1Database,
  storyId: number,
  limit = 6,
): Promise<PublicRelatedStory[]> {
  const bounded = boundedLimit(limit, 6, 12);
  if (!Number.isInteger(storyId) || storyId < 1) return [];
  const result = await db.prepare(`
    SELECT relation.id, relation.relationship, relation.explanation, relation.confidence,
           CASE WHEN relation.source_story_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
           other.slug, other.title AS headline, other.topic
    FROM story_relationships relation
    JOIN story_clusters other
      ON other.id = CASE WHEN relation.source_story_id = ? THEN relation.target_story_id ELSE relation.source_story_id END
    WHERE (relation.source_story_id = ? OR relation.target_story_id = ?)
      AND relation.reviewed_at IS NOT NULL
      AND other.publication_status = 'published'
      AND other.slug IS NOT NULL
      AND other.published_at IS NOT NULL
      AND datetime(other.published_at) <= datetime('now')
      AND other.reviewed_by IS NOT NULL AND other.reviewed_at IS NOT NULL
      AND other.summary IS NOT NULL AND trim(other.summary) <> ''
      AND other.evidence_status NOT IN ('unverified', 'outdated', 'superseded')
      AND EXISTS (
        SELECT 1 FROM story_cluster_members member
        JOIN feed_items item ON item.id = member.feed_item_id
        WHERE member.cluster_id = other.id AND item.ingestion_status = 'published'
      )
    ORDER BY relation.confidence DESC, other.published_at DESC, relation.id
    LIMIT ?
  `).bind(storyId, storyId, storyId, storyId, bounded).all<{
    id: string;
    relationship: string;
    explanation: string | null;
    confidence: number;
    direction: "outgoing" | "incoming";
    slug: string;
    headline: string;
    topic: string | null;
  }>();
  return (result.results ?? []).map((row) => ({
    slug: row.slug,
    headline: row.headline,
    topic: row.topic,
    relationship: row.relationship,
    relationshipLabel: relationshipLabel(row.relationship, row.direction),
    explanation: row.explanation,
    confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
    direction: row.direction,
  }));
}
