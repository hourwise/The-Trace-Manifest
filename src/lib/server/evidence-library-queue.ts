/**
 * SEED-01: the Evidence Library review queue. Lists assertions whose canonical
 * claim belongs to no real story (a story with at least one member item), so
 * they can be admitted and reviewed in the evidence_library governance context.
 *
 * Read-only and bounded: keyset-paginated by (created_at, id) over the 0076
 * governance-queue index, with capped counts. Ineligibility reasons explain
 * why an assertion is not yet usable evidence; they never change state.
 */

import { freshnessBlockers, FRESHNESS_BLOCKER_LABELS, type FreshnessBlocker } from "./evidence-freshness-queue";

export const EVIDENCE_LIBRARY_PAGE_SIZE = 25;
export const EVIDENCE_LIBRARY_COUNT_CAP = 1_000;

export const EVIDENCE_LIBRARY_FILTERS = ["admission", "review", "accepted", "closed"] as const;
export type EvidenceLibraryFilter = typeof EVIDENCE_LIBRARY_FILTERS[number];

// Each filter is an exact (admission_state, reviewer_state) predicate so the
// governance-queue index serves it.
const FILTER_SQL: Record<EvidenceLibraryFilter, string> = {
  admission: "assertion.admission_state IN ('pending','quarantined')",
  review: "assertion.admission_state = 'admitted' AND assertion.reviewer_state IN ('proposed','needs_research')",
  accepted: "assertion.admission_state = 'admitted' AND assertion.reviewer_state = 'accepted'",
  closed: "(assertion.admission_state = 'rejected' OR assertion.reviewer_state = 'rejected')",
};

export const EVIDENCE_LIBRARY_FILTER_LABELS: Record<EvidenceLibraryFilter, string> = {
  admission: "Awaiting admission",
  review: "Awaiting editorial review",
  accepted: "Accepted",
  closed: "Rejected",
};

const NO_REAL_STORY = `NOT EXISTS (
  SELECT 1 FROM story_claims story_claim
  WHERE story_claim.canonical_claim_id = assertion.canonical_claim_id
    AND EXISTS (SELECT 1 FROM story_cluster_members member WHERE member.cluster_id = story_claim.story_cluster_id)
)`;

export type EvidenceLibraryIneligibility =
  | "not_admitted"
  | "not_editorially_accepted"
  | "not_current"
  | FreshnessBlocker
  | "no_publication_path";

export const EVIDENCE_LIBRARY_INELIGIBILITY_LABELS: Record<EvidenceLibraryIneligibility, string> = {
  not_admitted: "the assertion is not admitted",
  not_editorially_accepted: "the assertion is not editorially accepted",
  not_current: "freshness has not been reviewed as current",
  ...FRESHNESS_BLOCKER_LABELS,
  no_publication_path: "it is not mapped to approved knowledge or a published story, so Ask TRACE cannot use it",
};

export interface EvidenceLibraryAssertion {
  assertionId: string;
  canonicalClaimId: string;
  canonicalText: string;
  assertionText: string;
  relationship: string;
  sourceRole: string;
  evidenceTreatment: string;
  directness: string | null;
  admissionState: "pending" | "admitted" | "quarantined" | "rejected";
  reviewerState: "proposed" | "accepted" | "amended" | "rejected" | "duplicate" | "unsupported" | "needs_research";
  freshnessState: "current" | "stale" | "unknown";
  createdAt: string;
  source: {
    url: string | null;
    title: string | null;
    documentVersionId: string | null;
    retrievedAt: string | null;
    admissionState: string | null;
    isCurrentVersion: boolean;
  };
  excerpt: string | null;
  locator: { start: string | null; end: string | null };
  provenance: { groupId: string; originType: string | null; explanation: string | null } | null;
  knowledgeMapped: boolean;
  ineligibility: EvidenceLibraryIneligibility[];
}

export interface EvidenceLibraryPage {
  filter: EvidenceLibraryFilter;
  items: EvidenceLibraryAssertion[];
  nextCursor: string | null;
  counts: Record<EvidenceLibraryFilter, { count: number; capped: boolean }>;
}

interface Row {
  assertion_id: string;
  canonical_claim_id: string;
  canonical_text: string;
  assertion_text: string;
  relationship: string;
  source_role: string;
  evidence_treatment: string;
  directness: string | null;
  admission_state: EvidenceLibraryAssertion["admissionState"];
  reviewer_state: EvidenceLibraryAssertion["reviewerState"];
  freshness_state: EvidenceLibraryAssertion["freshnessState"];
  created_at: string;
  source_url: string | null;
  source_title: string | null;
  source_document_version_id: string | null;
  retrieved_at: string | null;
  source_admission_state: string | null;
  excerpt: string | null;
  start_locator: string | null;
  end_locator: string | null;
  provenance_group_id: string | null;
  origin_type: string | null;
  provenance_explanation: string | null;
  knowledge_mapped: number;
  claim_ok: number; evidence_ok: number; relationship_ok: number; provenance_ok: number;
  source_ok: number; version_ok: number; extraction_ok: number; locator_ok: number; url_ok: number;
}

/** Cursor: base64url of `${created_at}\u0000${id}`; anything malformed restarts. */
export function encodeLibraryCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}\u0000${id}`).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeLibraryCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor || cursor.length > 400 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const decoded = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
    const [createdAt, id, ...rest] = decoded.split("\u0000");
    if (rest.length || !createdAt || !id || createdAt.length > 40 || id.length > 200) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function ineligibility(row: Row): EvidenceLibraryIneligibility[] {
  const reasons: EvidenceLibraryIneligibility[] = [];
  if (row.admission_state !== "admitted") reasons.push("not_admitted");
  if (row.reviewer_state !== "accepted") reasons.push("not_editorially_accepted");
  if (row.freshness_state !== "current") reasons.push("not_current");
  reasons.push(...freshnessBlockers(row));
  // Library assertions have no real story by construction; Ask TRACE reaches
  // them only through an approved knowledge mapping.
  if (Number(row.knowledge_mapped) !== 1) reasons.push("no_publication_path");
  return reasons;
}

export async function listEvidenceLibrary(
  db: Pick<D1Database, "prepare">,
  options: { filter?: string | null; cursor?: string | null } = {},
): Promise<EvidenceLibraryPage> {
  const filter: EvidenceLibraryFilter = (EVIDENCE_LIBRARY_FILTERS as readonly string[]).includes(options.filter ?? "")
    ? options.filter as EvidenceLibraryFilter
    : "admission";
  const cursor = decodeLibraryCursor(options.cursor);
  const cursorSql = cursor ? "AND (assertion.created_at > ? OR (assertion.created_at = ? AND assertion.id > ?))" : "";
  const cursorArgs = cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : [];

  const rows = await db.prepare(`
    SELECT assertion.id AS assertion_id, assertion.canonical_claim_id, claim.canonical_text,
           assertion.assertion_text, assertion.relationship, assertion.source_role,
           assertion.evidence_treatment, assertion.directness,
           assertion.admission_state, assertion.reviewer_state, assertion.freshness_state,
           assertion.created_at,
           COALESCE(NULLIF(trim(version.retrieved_url), ''), source.canonical_url) AS source_url,
           version.title AS source_title, assertion.source_document_version_id,
           version.retrieved_at, source.admission_state AS source_admission_state,
           chunk.text_excerpt AS excerpt,
           COALESCE(assertion.start_locator, chunk.start_locator) AS start_locator,
           COALESCE(assertion.end_locator, chunk.end_locator) AS end_locator,
           assertion.provenance_group_id, grp.origin_type, grp.explanation AS provenance_explanation,
           CASE WHEN EXISTS (
             SELECT 1 FROM knowledge_document_claim_assertions mapping
             WHERE mapping.claim_assertion_id = assertion.id
           ) THEN 1 ELSE 0 END AS knowledge_mapped,
           CASE WHEN claim.current_state IN ('corrected','superseded','retired','disputed') THEN 0 ELSE 1 END AS claim_ok,
           CASE WHEN assertion.source_role = 'evidence' AND assertion.evidence_treatment = 'factual_support' THEN 1 ELSE 0 END AS evidence_ok,
           CASE WHEN assertion.relationship IN ('supports','partially_supports','qualifies','reproduces') THEN 1 ELSE 0 END AS relationship_ok,
           CASE WHEN assertion.provenance_group_id IS NOT NULL THEN 1 ELSE 0 END AS provenance_ok,
           CASE WHEN source.id IS NOT NULL AND source.admission_state = 'admitted' THEN 1 ELSE 0 END AS source_ok,
           CASE WHEN version.id IS NOT NULL AND source.current_version_id = version.id THEN 1 ELSE 0 END AS version_ok,
           CASE WHEN version.extraction_state IN ('extracted','captured') THEN 1 ELSE 0 END AS extraction_ok,
           CASE WHEN assertion.source_chunk_id IS NOT NULL AND (
                  (trim(COALESCE(assertion.start_locator, '')) <> '' AND trim(COALESCE(assertion.end_locator, '')) <> '')
                  OR (trim(COALESCE(chunk.start_locator, '')) <> '' AND trim(COALESCE(chunk.end_locator, '')) <> '')
                ) THEN 1 ELSE 0 END AS locator_ok,
           CASE WHEN lower(COALESCE(NULLIF(trim(version.retrieved_url), ''), source.canonical_url, '')) LIKE 'http://%'
                  OR lower(COALESCE(NULLIF(trim(version.retrieved_url), ''), source.canonical_url, '')) LIKE 'https://%' THEN 1 ELSE 0 END AS url_ok
    FROM claim_assertions assertion
    JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
    LEFT JOIN source_document_versions version ON version.id = assertion.source_document_version_id
    LEFT JOIN source_documents source ON source.id = version.source_document_id
    LEFT JOIN source_chunks chunk ON chunk.id = assertion.source_chunk_id
    LEFT JOIN provenance_groups grp ON grp.id = assertion.provenance_group_id
    WHERE ${FILTER_SQL[filter]}
      AND ${NO_REAL_STORY}
      ${cursorSql}
    ORDER BY assertion.created_at, assertion.id
    LIMIT ?
  `).bind(...cursorArgs, EVIDENCE_LIBRARY_PAGE_SIZE + 1).all<Row>();
  const results = rows.results ?? [];
  const page = results.slice(0, EVIDENCE_LIBRARY_PAGE_SIZE);
  const last = page.at(-1);

  const counts = Object.fromEntries(await Promise.all(EVIDENCE_LIBRARY_FILTERS.map(async (key) => {
    const row = await db.prepare(`
      SELECT COUNT(*) AS count FROM (
        SELECT 1 FROM claim_assertions assertion
        WHERE ${FILTER_SQL[key]} AND ${NO_REAL_STORY}
        LIMIT ?
      )
    `).bind(EVIDENCE_LIBRARY_COUNT_CAP + 1).first<{ count: number }>();
    const count = Number(row?.count ?? 0);
    return [key, { count: Math.min(count, EVIDENCE_LIBRARY_COUNT_CAP), capped: count > EVIDENCE_LIBRARY_COUNT_CAP }];
  }))) as EvidenceLibraryPage["counts"];

  return {
    filter,
    items: page.map((row) => ({
      assertionId: row.assertion_id,
      canonicalClaimId: row.canonical_claim_id,
      canonicalText: row.canonical_text,
      assertionText: row.assertion_text,
      relationship: row.relationship,
      sourceRole: row.source_role,
      evidenceTreatment: row.evidence_treatment,
      directness: row.directness,
      admissionState: row.admission_state,
      reviewerState: row.reviewer_state,
      freshnessState: row.freshness_state,
      createdAt: row.created_at,
      source: {
        url: row.source_url,
        title: row.source_title,
        documentVersionId: row.source_document_version_id,
        retrievedAt: row.retrieved_at,
        admissionState: row.source_admission_state,
        isCurrentVersion: Number(row.version_ok) === 1,
      },
      excerpt: row.excerpt,
      locator: { start: row.start_locator, end: row.end_locator },
      provenance: row.provenance_group_id
        ? { groupId: row.provenance_group_id, originType: row.origin_type, explanation: row.provenance_explanation }
        : null,
      knowledgeMapped: Number(row.knowledge_mapped) === 1,
      ineligibility: ineligibility(row),
    })),
    nextCursor: results.length > EVIDENCE_LIBRARY_PAGE_SIZE && last ? encodeLibraryCursor(last.created_at, last.assertion_id) : null,
    counts,
  };
}
