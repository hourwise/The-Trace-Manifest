import type {
  EditorialAssertion,
  EditorialClaim,
  EditorialClusterEvidence,
  EditorialEvidenceAttachment,
  EditorialEvidenceSource,
  EditorialProvenance,
  EditorialSourceDocument,
} from "../editorial-evidence-contract";

export const EDITORIAL_EVIDENCE_MAX_CLAIMS = 50;
export const EDITORIAL_EVIDENCE_MAX_ASSERTIONS_PER_CLAIM = 8;
export const EDITORIAL_EVIDENCE_MAX_ATTACHMENTS_PER_CLAIM = 8;

interface ClaimRow {
  canonical_claim_id: string;
  canonical_text: string;
  claim_state: EditorialClaim["claimState"];
  claim_materiality: EditorialClaim["materiality"];
  role: EditorialClaim["role"];
  score: number | null;
  evidence_status: EditorialClaim["evidenceStatus"];
  claim_rank: number;
  total_claim_count: number;
}

interface AssertionRow {
  canonical_claim_id: string;
  assertion_id: string;
  assertion_text: string;
  relationship: EditorialAssertion["relationship"];
  source_role: EditorialAssertion["sourceRole"];
  directness: EditorialAssertion["directness"];
  evidence_treatment: EditorialAssertion["evidenceTreatment"];
  admission_state: EditorialAssertion["admissionState"];
  reviewer_state: EditorialAssertion["reviewerState"];
  freshness_state: EditorialAssertion["freshnessState"];
  confidence: number;
  source_name: string | null;
  source_tier: string | null;
  canonical_url: string | null;
  retrieved_url: string | null;
  source_document_id: string | null;
  source_document_version_id: string | null;
  source_document_admission_state: string | null;
  start_locator: string | null;
  end_locator: string | null;
  provenance_group_id: string | null;
  provenance_origin_type: string | null;
  provenance_explanation: string | null;
  retrieved_at: string | null;
  published_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  assertion_rank: number;
  total_assertion_count: number;
  admitted_assertion_count: number;
  current_reviewed_assertion_count: number;
}

interface AttachmentRow {
  canonical_claim_id: string;
  attachment_id: string;
  relationship: EditorialEvidenceAttachment["relationship"];
  explanation: string | null;
  eligibility_state: EditorialEvidenceAttachment["eligibilityState"];
  eligibility_reason: string;
  reviewed_by: string;
  reviewed_at: string;
  source_name: string | null;
  source_tier: string | null;
  source_url: string | null;
  published_at: string | null;
  fetched_at: string | null;
  attachment_rank: number;
  total_attachment_count: number;
  eligible_attachment_count: number;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function safeHttpUrl(value: string | null | undefined): string | null {
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

function sourceFromRow(row: {
  source_name: string | null;
  source_tier: string | null;
  source_url: string | null;
  published_at: string | null;
  retrieved_at: string | null;
}): EditorialEvidenceSource | null {
  if (!row.source_name && !row.source_tier && !row.source_url && !row.published_at && !row.retrieved_at) return null;
  return {
    name: row.source_name?.trim() || "Unidentified source",
    tier: row.source_tier,
    url: safeHttpUrl(row.source_url),
    publishedAt: row.published_at,
    retrievedAt: row.retrieved_at,
  };
}

function mapAssertion(row: AssertionRow): EditorialAssertion {
  const source = sourceFromRow({
    source_name: row.source_name,
    source_tier: row.source_tier,
    source_url: safeHttpUrl(row.retrieved_url) ?? safeHttpUrl(row.canonical_url),
    published_at: row.published_at,
    retrieved_at: row.retrieved_at,
  });
  const sourceDocument: EditorialSourceDocument | null = row.source_document_id && row.source_document_version_id
    ? {
      documentId: row.source_document_id,
      versionId: row.source_document_version_id,
      admissionState: row.source_document_admission_state ?? "unknown",
      startLocator: row.start_locator,
      endLocator: row.end_locator,
    }
    : null;
  const provenance: EditorialProvenance | null = row.provenance_group_id
    ? {
      groupId: row.provenance_group_id,
      originType: row.provenance_origin_type ?? "unknown",
      explanation: row.provenance_explanation ?? "No provenance explanation recorded.",
    }
    : null;
  return {
    assertionId: row.assertion_id,
    text: row.assertion_text,
    relationship: row.relationship,
    sourceRole: row.source_role,
    directness: row.directness,
    evidenceTreatment: row.evidence_treatment,
    admissionState: row.admission_state,
    reviewerState: row.reviewer_state,
    freshnessState: row.freshness_state,
    confidence: row.confidence,
    source,
    sourceDocument,
    provenance,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  };
}

function mapAttachment(row: AttachmentRow): EditorialEvidenceAttachment {
  return {
    attachmentId: row.attachment_id,
    relationship: row.relationship,
    explanation: row.explanation,
    eligibilityState: row.eligibility_state,
    eligibilityReason: row.eligibility_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    source: sourceFromRow({
      source_name: row.source_name,
      source_tier: row.source_tier,
      source_url: row.source_url,
      published_at: row.published_at,
      retrieved_at: row.fetched_at,
    }),
  };
}

/**
 * Read-only editorial projection for one selected story cluster.
 *
 * This deliberately does not reuse the public evidence projection: reviewers
 * need claim state and non-admitted assertions, while the public projection
 * only exposes evidence eligible for a published story. The query bundle is
 * fixed and set-based: cluster existence/claims, assertions, and attachments.
 */
export async function getEditorialClusterEvidence(
  db: D1Database,
  clusterId: number,
): Promise<EditorialClusterEvidence | null> {
  if (!Number.isInteger(clusterId) || clusterId < 1) return null;

  const cluster = await db.prepare("SELECT id FROM story_clusters WHERE id = ?")
    .bind(clusterId)
    .first<{ id: number }>();
  if (!cluster) return null;

  const claimResult = await db.prepare(`
    WITH latest_scores AS (
      SELECT canonical_claim_id, score, evidence_status,
             ROW_NUMBER() OVER (
               PARTITION BY canonical_claim_id
               ORDER BY created_at DESC, id DESC
             ) AS score_rank
      FROM canonical_claim_score_snapshots
    ), ranked_claims AS (
      SELECT story_claim.canonical_claim_id, claim.canonical_text,
             claim.current_state AS claim_state,
             claim.materiality AS claim_materiality,
             story_claim.role,
             latest.score, latest.evidence_status,
             ROW_NUMBER() OVER (
               ORDER BY CASE story_claim.materiality
                 WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                 WHEN 'standard' THEN 2 ELSE 3 END,
                 story_claim.display_order ASC,
                 story_claim.canonical_claim_id ASC
             ) AS claim_rank,
             COUNT(*) OVER () AS total_claim_count
      FROM story_claims story_claim
      JOIN canonical_claims claim ON claim.id = story_claim.canonical_claim_id
      LEFT JOIN latest_scores latest
        ON latest.canonical_claim_id = claim.id AND latest.score_rank = 1
      WHERE story_claim.story_cluster_id = ?
    )
    SELECT canonical_claim_id, canonical_text, claim_state,
           claim_materiality, role, score, evidence_status,
           claim_rank, total_claim_count
    FROM ranked_claims
    WHERE claim_rank <= ?
    ORDER BY claim_rank ASC
  `).bind(clusterId, EDITORIAL_EVIDENCE_MAX_CLAIMS + 1).all<ClaimRow>();
  const claimRows = claimResult.results ?? [];
  const claimCount = Number(claimRows[0]?.total_claim_count ?? 0);
  const claimsTruncated = claimCount > EDITORIAL_EVIDENCE_MAX_CLAIMS;
  const visibleClaimRows = claimRows.slice(0, EDITORIAL_EVIDENCE_MAX_CLAIMS);

  if (visibleClaimRows.length === 0) {
    return {
      clusterId,
      claims: [],
      claimCount: 0,
      claimsTruncated: false,
      assertionCount: 0,
      admittedAssertionCount: 0,
      attachmentCount: 0,
      eligibleAttachmentCount: 0,
    };
  }

  const claimIds = visibleClaimRows.map((row) => row.canonical_claim_id);
  const claimIdPlaceholders = placeholders(claimIds.length);
  const [assertionResult, attachmentResult] = await Promise.all([
    db.prepare(`
      WITH ranked_assertions AS (
        SELECT ca.canonical_claim_id, ca.id AS assertion_id, ca.assertion_text,
               ca.relationship, ca.source_role, ca.directness,
               ca.evidence_treatment, ca.admission_state,
               ca.reviewer_state, ca.freshness_state, ca.confidence,
               source.name AS source_name, source.tier AS source_tier,
               documents.canonical_url, versions.retrieved_url,
               documents.id AS source_document_id,
               versions.id AS source_document_version_id,
               documents.admission_state AS source_document_admission_state,
               ca.start_locator, ca.end_locator,
               ca.provenance_group_id,
               groups.origin_type AS provenance_origin_type,
               groups.explanation AS provenance_explanation,
               versions.retrieved_at, versions.published_at,
               ca.reviewed_by, ca.reviewed_at,
               ROW_NUMBER() OVER (
                 PARTITION BY ca.canonical_claim_id
                 ORDER BY ca.created_at DESC, ca.id ASC
               ) AS assertion_rank,
               COUNT(*) OVER (PARTITION BY ca.canonical_claim_id) AS total_assertion_count,
               SUM(CASE WHEN ca.admission_state = 'admitted' THEN 1 ELSE 0 END)
                 OVER (PARTITION BY ca.canonical_claim_id) AS admitted_assertion_count,
               SUM(CASE WHEN ca.admission_state = 'admitted'
                              AND ca.reviewer_state IN ('accepted', 'amended')
                              AND ca.freshness_state = 'current'
                        THEN 1 ELSE 0 END)
                 OVER (PARTITION BY ca.canonical_claim_id) AS current_reviewed_assertion_count
        FROM claim_assertions ca
        LEFT JOIN source_document_versions versions
          ON versions.id = ca.source_document_version_id
        LEFT JOIN source_documents documents
          ON documents.id = versions.source_document_id
        LEFT JOIN sources source ON source.id = documents.source_id
        LEFT JOIN provenance_groups groups
          ON groups.id = ca.provenance_group_id
        WHERE ca.canonical_claim_id IN (${claimIdPlaceholders})
      )
      SELECT canonical_claim_id, assertion_id, assertion_text,
             relationship, source_role, directness, evidence_treatment,
             admission_state, reviewer_state, freshness_state, confidence,
             source_name, source_tier, canonical_url, retrieved_url,
             source_document_id, source_document_version_id,
             source_document_admission_state, start_locator, end_locator,
             provenance_group_id, provenance_origin_type, provenance_explanation,
             retrieved_at, published_at, reviewed_by, reviewed_at,
             assertion_rank, total_assertion_count, admitted_assertion_count,
             current_reviewed_assertion_count
      FROM ranked_assertions
      WHERE assertion_rank <= ?
      ORDER BY canonical_claim_id ASC, assertion_rank ASC
    `).bind(...claimIds, EDITORIAL_EVIDENCE_MAX_ASSERTIONS_PER_CLAIM + 1).all<AssertionRow>(),
    db.prepare(`
      WITH ranked_attachments AS (
        SELECT attachment.canonical_claim_id,
               attachment.id AS attachment_id, attachment.relationship,
               attachment.explanation, attachment.eligibility_state,
               attachment.eligibility_reason, attachment.reviewed_by,
               attachment.reviewed_at, source.name AS source_name,
               source.tier AS source_tier, item.url AS source_url,
               item.published_at, item.fetched_at,
               ROW_NUMBER() OVER (
                 PARTITION BY attachment.canonical_claim_id
                 ORDER BY attachment.reviewed_at DESC, attachment.id ASC
               ) AS attachment_rank,
               COUNT(*) OVER (PARTITION BY attachment.canonical_claim_id) AS total_attachment_count,
               SUM(CASE WHEN attachment.eligibility_state = 'eligible' THEN 1 ELSE 0 END)
                 OVER (PARTITION BY attachment.canonical_claim_id) AS eligible_attachment_count
        FROM story_claim_evidence_attachments attachment
        JOIN feed_items item ON item.id = attachment.feed_item_id
        LEFT JOIN sources source ON source.id = item.source_id
        WHERE attachment.story_cluster_id = ?
          AND attachment.canonical_claim_id IN (${claimIdPlaceholders})
      )
      SELECT canonical_claim_id, attachment_id, relationship, explanation,
             eligibility_state, eligibility_reason, reviewed_by, reviewed_at,
             source_name, source_tier, source_url, published_at, fetched_at,
             attachment_rank, total_attachment_count, eligible_attachment_count
      FROM ranked_attachments
      WHERE attachment_rank <= ?
      ORDER BY canonical_claim_id ASC, attachment_rank ASC
    `).bind(clusterId, ...claimIds, EDITORIAL_EVIDENCE_MAX_ATTACHMENTS_PER_CLAIM + 1).all<AttachmentRow>(),
  ]);

  const assertionsByClaim = new Map<string, AssertionRow[]>();
  for (const row of assertionResult.results ?? []) {
    const existing = assertionsByClaim.get(row.canonical_claim_id) ?? [];
    existing.push(row);
    assertionsByClaim.set(row.canonical_claim_id, existing);
  }
  const attachmentsByClaim = new Map<string, AttachmentRow[]>();
  for (const row of attachmentResult.results ?? []) {
    const existing = attachmentsByClaim.get(row.canonical_claim_id) ?? [];
    existing.push(row);
    attachmentsByClaim.set(row.canonical_claim_id, existing);
  }

  const claims = visibleClaimRows.map((row): EditorialClaim => {
    const assertionRows = assertionsByClaim.get(row.canonical_claim_id) ?? [];
    const attachmentRows = attachmentsByClaim.get(row.canonical_claim_id) ?? [];
    const assertionCount = Number(assertionRows[0]?.total_assertion_count ?? 0);
    const attachmentCount = Number(attachmentRows[0]?.total_attachment_count ?? 0);
    return {
      canonicalClaimId: row.canonical_claim_id,
      text: row.canonical_text,
      claimState: row.claim_state,
      materiality: row.claim_materiality,
      role: row.role,
      score: row.score,
      evidenceStatus: row.evidence_status,
      assertionCount,
      admittedAssertionCount: Number(assertionRows[0]?.admitted_assertion_count ?? 0),
      currentReviewedAssertionCount: Number(assertionRows[0]?.current_reviewed_assertion_count ?? 0),
      assertions: assertionRows.slice(0, EDITORIAL_EVIDENCE_MAX_ASSERTIONS_PER_CLAIM).map(mapAssertion),
      assertionsTruncated: assertionCount > EDITORIAL_EVIDENCE_MAX_ASSERTIONS_PER_CLAIM,
      attachmentCount,
      eligibleAttachmentCount: Number(attachmentRows[0]?.eligible_attachment_count ?? 0),
      attachments: attachmentRows.slice(0, EDITORIAL_EVIDENCE_MAX_ATTACHMENTS_PER_CLAIM).map(mapAttachment),
      attachmentsTruncated: attachmentCount > EDITORIAL_EVIDENCE_MAX_ATTACHMENTS_PER_CLAIM,
    };
  });

  return {
    clusterId,
    claims,
    claimCount,
    claimsTruncated,
    assertionCount: claims.reduce((total, claim) => total + claim.assertionCount, 0),
    admittedAssertionCount: claims.reduce((total, claim) => total + claim.admittedAssertionCount, 0),
    attachmentCount: claims.reduce((total, claim) => total + claim.attachmentCount, 0),
    eligibleAttachmentCount: claims.reduce((total, claim) => total + claim.eligibleAttachmentCount, 0),
  };
}
