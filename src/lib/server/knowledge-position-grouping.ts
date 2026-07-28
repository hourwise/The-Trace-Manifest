// KC-09F: deterministic compatible/competing position grouping.
//
// This module consumes KC-09E's D1-resolved recall matches. It never infers a
// contradiction from a model score or from loose text similarity: compatible
// and competing edges come from the reviewed D1 relationship/conflict tables.

import type { KnowledgeVectorRecordType } from "./knowledge-embedding-policy";
import type { ResolvedKnowledgeVectorMatch } from "./knowledge-vector-resolution";

export type KnowledgePositionRelationship =
  | "supports"
  | "reproduces"
  | "qualifies"
  | "contradicts"
  | "corrects"
  | "supersedes"
  | "temporal_change";

export interface KnowledgePositionRelationshipEdge {
  targetClaimId: string;
  relationship: KnowledgePositionRelationship;
}

export interface KnowledgePositionEvidence {
  id: string;
  recordType: KnowledgeVectorRecordType;
  recordId: string;
  score: number;
  claimId: string | null;
  statement: string;
  provenanceGroupIds?: string[];
  relationships?: KnowledgePositionRelationshipEdge[];
}

export interface KnowledgePosition {
  id: string;
  claimIds: string[];
  evidenceIds: string[];
  statements: string[];
  provenanceGroupIds: string[];
  score: number;
}

export interface KnowledgePositionCompetition {
  id: string;
  leftPositionId: string;
  rightPositionId: string;
  relationships: KnowledgePositionRelationship[];
  evidenceIds: string[];
}

export interface KnowledgePositionGrouping {
  positions: KnowledgePosition[];
  competitions: KnowledgePositionCompetition[];
  ignoredEvidenceIds: string[];
}

const COMPATIBLE_RELATIONSHIPS = new Set<KnowledgePositionRelationship>([
  "supports", "reproduces", "qualifies",
]);
const COMPETING_RELATIONSHIPS = new Set<KnowledgePositionRelationship>([
  "contradicts", "corrects", "supersedes", "temporal_change",
]);

function normalizeStatement(value: string): string {
  return value.normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
}

function positionKey(evidence: KnowledgePositionEvidence): string {
  if (evidence.claimId) return `claim:${evidence.claimId}`;
  const normalized = normalizeStatement(evidence.statement);
  return normalized ? `text:${normalized}` : `record:${evidence.recordType}:${evidence.recordId}`;
}

class DisjointSet {
  private readonly parents = new Map<string, string>();

  constructor(keys: string[]) {
    for (const key of keys) this.parents.set(key, key);
  }

  find(key: string): string {
    const parent = this.parents.get(key) ?? key;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parents.set(key, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents.set(rightRoot, leftRoot < rightRoot ? leftRoot : rightRoot);
  }
}

function sortedUnique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

/**
 * Group already-resolved evidence. Exact claim identity is compatible by
 * default; reviewed supports/reproduces/qualifies edges add compatible links,
 * while contradiction/correction/supersession/temporal-change edges remain
 * explicit competing positions.
 */
export function groupKnowledgePositions(evidence: KnowledgePositionEvidence[]): KnowledgePositionGrouping {
  const usable = evidence.filter((item) => Boolean(item.id && item.recordType && item.recordId && Number.isFinite(item.score)));
  const deduped = new Map<string, KnowledgePositionEvidence>();
  const ignoredEvidenceIds: string[] = [];
  for (const item of usable) {
    const previous = deduped.get(item.id);
    if (!previous || item.score > previous.score) deduped.set(item.id, item);
    else ignoredEvidenceIds.push(item.id);
  }
  const items = [...deduped.values()];
  const keys = [...new Set(items.map(positionKey))];
  const keyByClaim = new Map(items.filter(item => item.claimId).map(item => [item.claimId!, positionKey(item)]));
  const sets = new DisjointSet(keys);
  const competingEdges: Array<{ left: string; right: string; relationship: KnowledgePositionRelationship; evidenceId: string }> = [];

  for (const item of items) {
    const left = positionKey(item);
    for (const edge of item.relationships ?? []) {
      const right = keyByClaim.get(edge.targetClaimId);
      if (!right || left === right) continue;
      if (COMPATIBLE_RELATIONSHIPS.has(edge.relationship)) sets.union(left, right);
      else if (COMPETING_RELATIONSHIPS.has(edge.relationship)) {
        competingEdges.push({ left, right, relationship: edge.relationship, evidenceId: item.id });
      }
    }
  }

  const grouped = new Map<string, KnowledgePositionEvidence[]>();
  for (const item of items) {
    const root = sets.find(positionKey(item));
    const existing = grouped.get(root) ?? [];
    existing.push(item);
    grouped.set(root, existing);
  }

  const positions = [...grouped.entries()].map(([root, members]) => {
    const ordered = [...members].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    return {
      id: `position:${root}`,
      claimIds: sortedUnique(ordered.map(item => item.claimId)),
      evidenceIds: ordered.map(item => item.id),
      statements: sortedUnique(ordered.map(item => normalizeStatement(item.statement)).filter(Boolean)),
      provenanceGroupIds: sortedUnique(ordered.flatMap(item => item.provenanceGroupIds ?? [])),
      score: ordered[0]?.score ?? 0,
    } satisfies KnowledgePosition;
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const positionByRoot = new Map([...grouped.keys()].map(root => [root, `position:${root}`]));
  const competitions = new Map<string, KnowledgePositionCompetition>();
  for (const edge of competingEdges) {
    const leftRoot = sets.find(edge.left);
    const rightRoot = sets.find(edge.right);
    if (leftRoot === rightRoot) continue;
    const leftPositionId = positionByRoot.get(leftRoot) ?? `position:${leftRoot}`;
    const rightPositionId = positionByRoot.get(rightRoot) ?? `position:${rightRoot}`;
    const [orderedLeft, orderedRight] = [leftPositionId, rightPositionId].sort();
    const id = `${orderedLeft}~${orderedRight}`;
    const previous = competitions.get(id);
    if (previous) {
      previous.relationships = sortedUnique([...previous.relationships, edge.relationship]) as KnowledgePositionRelationship[];
      previous.evidenceIds = sortedUnique([...previous.evidenceIds, edge.evidenceId]);
    } else {
      competitions.set(id, {
        id,
        leftPositionId: orderedLeft,
        rightPositionId: orderedRight,
        relationships: [edge.relationship],
        evidenceIds: [edge.evidenceId],
      });
    }
  }

  return { positions, competitions: [...competitions.values()].sort((left, right) => left.id.localeCompare(right.id)), ignoredEvidenceIds };
}

interface ClaimRow {
  id: string;
  canonical_text: string;
}

interface AssertionRow {
  id: string;
  canonical_claim_id: string;
  source_chunk_id: string | null;
  assertion_text: string;
  relationship: KnowledgePositionRelationship;
}

interface RelationRow {
  source_canonical_claim_id: string;
  target_canonical_claim_id: string;
  relationship: KnowledgePositionRelationship;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

/**
 * Build grouping inputs from KC-09E matches and reviewed D1 relationships.
 * This helper intentionally leaves unclaimed records as standalone positions;
 * later citation code can decide whether such a position is sufficient.
 */
export async function loadKnowledgePositionEvidence(
  db: D1Database,
  matches: ResolvedKnowledgeVectorMatch[],
): Promise<KnowledgePositionEvidence[]> {
  if (matches.length === 0) return [];
  const evidence: KnowledgePositionEvidence[] = [];
  const claimIds = new Set<string>();
  const directClaimMatches = matches.filter(match => match.recordType === "canonical_claim");
  if (directClaimMatches.length > 0) {
    const claims = await db.prepare(`SELECT id, canonical_text FROM canonical_claims WHERE id IN (${placeholders(directClaimMatches.length)})`)
      .bind(...directClaimMatches.map(match => match.recordId)).all<ClaimRow>();
    const claimById = new Map((claims.results ?? []).map(row => [row.id, row]));
    for (const match of directClaimMatches) {
      const claim = claimById.get(match.recordId);
      if (!claim) continue;
      claimIds.add(claim.id);
      evidence.push({ id: match.id, recordType: match.recordType, recordId: match.recordId, score: match.score, claimId: claim.id, statement: claim.canonical_text, provenanceGroupIds: match.provenance.provenanceGroupIds });
    }
  }

  const sourceMatches = matches.filter(match => match.recordType === "source_chunk");
  if (sourceMatches.length > 0) {
    const assertions = await db.prepare(`
      SELECT id, canonical_claim_id, source_chunk_id, assertion_text, relationship
      FROM claim_assertions
      WHERE source_chunk_id IN (${placeholders(sourceMatches.length)})
        AND admission_state = 'admitted' AND reviewer_state = 'accepted'
        AND freshness_state IN ('current', 'unknown')
    `).bind(...sourceMatches.map(match => match.recordId)).all<AssertionRow>();
    for (const assertion of assertions.results ?? []) {
      const match = sourceMatches.find(candidate => candidate.recordId === assertion.source_chunk_id);
      if (!match) continue;
      claimIds.add(assertion.canonical_claim_id);
      evidence.push({
        id: `${match.id}:assertion:${assertion.id}`,
        recordType: match.recordType,
        recordId: match.recordId,
        score: match.score,
        claimId: assertion.canonical_claim_id,
        statement: assertion.assertion_text,
        provenanceGroupIds: match.provenance.provenanceGroupIds,
      });
    }
  }

  const storyMatches = matches.filter(match => match.recordType === "published_story");
  if (storyMatches.length > 0) {
    const storyClaims = await db.prepare(`
      SELECT story_claim.story_cluster_id, story_claim.canonical_claim_id, claim.canonical_text
      FROM story_claims story_claim JOIN canonical_claims claim ON claim.id = story_claim.canonical_claim_id
      WHERE story_claim.story_cluster_id IN (${placeholders(storyMatches.length)})
        AND claim.current_state NOT IN ('retired', 'corrected', 'superseded')
    `).bind(...storyMatches.map(match => match.recordId)).all<{ story_cluster_id: number; canonical_claim_id: string; canonical_text: string }>();
    for (const row of storyClaims.results ?? []) {
      const match = storyMatches.find(candidate => String(candidate.recordId) === String(row.story_cluster_id));
      if (!match) continue;
      claimIds.add(row.canonical_claim_id);
      evidence.push({ id: `${match.id}:claim:${row.canonical_claim_id}`, recordType: match.recordType, recordId: match.recordId, score: match.score, claimId: row.canonical_claim_id, statement: row.canonical_text, provenanceGroupIds: match.provenance.provenanceGroupIds });
    }
  }

  const knowledgeMatches = matches.filter(match => match.recordType === "knowledge_section");
  if (knowledgeMatches.length > 0) {
    const documentIds = knowledgeMatches.map(match => match.recordId.split(":", 1)[0]);
    const knowledgeClaims = await db.prepare(`
      SELECT document_claim.knowledge_document_id, document_claim.canonical_claim_id, claim.canonical_text
      FROM knowledge_document_claims document_claim JOIN canonical_claims claim ON claim.id = document_claim.canonical_claim_id
      WHERE document_claim.knowledge_document_id IN (${placeholders(documentIds.length)})
        AND claim.current_state NOT IN ('retired', 'corrected', 'superseded')
    `).bind(...documentIds).all<{ knowledge_document_id: string; canonical_claim_id: string; canonical_text: string }>();
    for (const row of knowledgeClaims.results ?? []) {
      const match = knowledgeMatches.find(candidate => candidate.recordId.startsWith(`${row.knowledge_document_id}:`));
      if (!match) continue;
      claimIds.add(row.canonical_claim_id);
      evidence.push({ id: `${match.id}:claim:${row.canonical_claim_id}`, recordType: match.recordType, recordId: match.recordId, score: match.score, claimId: row.canonical_claim_id, statement: row.canonical_text, provenanceGroupIds: match.provenance.provenanceGroupIds });
    }
  }

  for (const match of matches.filter(item => ["guide", "correction"].includes(item.recordType))) {
    evidence.push({ id: match.id, recordType: match.recordType, recordId: match.recordId, score: match.score, claimId: null, statement: `${match.recordType}:${match.recordId}`, provenanceGroupIds: match.provenance.provenanceGroupIds });
  }

  const relationsByClaim = new Map<string, KnowledgePositionRelationshipEdge[]>();
  if (claimIds.size > 0) {
    const ids = [...claimIds];
    const relations = await db.prepare(`
      SELECT source_canonical_claim_id, target_canonical_claim_id, relationship
      FROM knowledge_claim_relationship_proposals
      WHERE state = 'accepted'
        AND ((source_canonical_claim_id IN (${placeholders(ids.length)}))
          OR (target_canonical_claim_id IN (${placeholders(ids.length)})))
    `).bind(...ids, ...ids).all<RelationRow>();
    const conflicts = await db.prepare(`
      SELECT source_claim_id AS source_canonical_claim_id, target_claim_id AS target_canonical_claim_id,
             CASE conflict_kind WHEN 'contradiction' THEN 'contradicts'
               WHEN 'correction' THEN 'corrects' WHEN 'supersession' THEN 'supersedes'
               ELSE 'temporal_change' END AS relationship
      FROM knowledge_claim_conflict_cases
      WHERE status IN ('unresolved', 'acknowledged')
        AND (source_claim_id IN (${placeholders(ids.length)}) OR target_claim_id IN (${placeholders(ids.length)}))
    `).bind(...ids, ...ids).all<RelationRow>();
    const allRelations = [...(relations.results ?? []), ...(conflicts.results ?? [])];
    for (const relation of allRelations) {
      const forward = relationsByClaim.get(relation.source_canonical_claim_id) ?? [];
      forward.push({ targetClaimId: relation.target_canonical_claim_id, relationship: relation.relationship });
      relationsByClaim.set(relation.source_canonical_claim_id, forward);
      const reverse = relationsByClaim.get(relation.target_canonical_claim_id) ?? [];
      reverse.push({ targetClaimId: relation.source_canonical_claim_id, relationship: relation.relationship });
      relationsByClaim.set(relation.target_canonical_claim_id, reverse);
    }
  }

  for (const item of evidence) item.relationships = item.claimId ? relationsByClaim.get(item.claimId) ?? [] : [];
  // Preserve a recall match with no claim assertion as a standalone position.
  for (const match of matches) {
    if (!evidence.some(item => item.id === match.id)) {
      evidence.push({ id: match.id, recordType: match.recordType, recordId: match.recordId, score: match.score, claimId: null, statement: `${match.recordType}:${match.recordId}`, provenanceGroupIds: match.provenance.provenanceGroupIds });
    }
  }
  return evidence;
}

export async function groupResolvedKnowledgePositions(
  db: D1Database,
  matches: ResolvedKnowledgeVectorMatch[],
): Promise<KnowledgePositionGrouping> {
  return groupKnowledgePositions(await loadKnowledgePositionEvidence(db, matches));
}
