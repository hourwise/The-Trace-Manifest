// Ask TRACE's application-owned KC-09 decision packet.
//
// Retrieval is allowed to recall candidates, but this module is the boundary
// where admitted D1 evidence is grouped into positions and KC-09G selects the
// conclusion. Nothing in this packet is derived from model prose.

import type { EvidenceExcerpt } from "../../ai/provider";
import { isAnswerEligibleEvidence, type TraceEvidenceQuality, type TraceSourceRole } from "../../ai/task-policy";
import {
  groupKnowledgePositions,
  type KnowledgePosition,
  type KnowledgePositionCompetition,
  type KnowledgePositionEvidence,
  type KnowledgePositionRelationship,
} from "./knowledge-position-grouping";
import {
  selectKnowledgeConclusion,
  type KnowledgeConclusionPolicyResult,
  type KnowledgeEvidenceMode,
  type KnowledgePositionAssessment,
} from "./knowledge-conclusion-policy";

export type AskTraceSynthesisMode = "none" | "deterministic" | "model";

export interface AskTraceDecisionPacket extends KnowledgeConclusionPolicyResult {
  positions: KnowledgePosition[];
  competitions: KnowledgePositionCompetition[];
  eligibleEvidenceIds: string[];
  eligibleClaimIds: string[];
  eligibleAssertionIds: string[];
  synthesisMode: AskTraceSynthesisMode;
}

interface RelationRow {
  source_canonical_claim_id: string;
  target_canonical_claim_id: string;
  relationship: KnowledgePositionRelationship;
}

const RELATIONSHIP_CLAIM_CHUNK_SIZE = 32;
const MAX_RELATIONSHIP_CLAIM_IDS = 128;

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function canonicalClaimIdFor(item: EvidenceExcerpt): string | null {
  return item.canonicalClaimId ?? item.claimId ?? null;
}

function evidenceIdFor(item: EvidenceExcerpt, index: number): string {
  return item.assertionId
    ? `assertion:${item.assertionId}`
    : `${item.sourceId}:${item.claimId ?? index}`;
}

async function relationshipsFor(db: D1Database, claimIds: string[]): Promise<Map<string, RelationRow[]>> {
  const result = new Map<string, RelationRow[]>();
  const uniqueClaimIds = unique(claimIds);
  if (uniqueClaimIds.length === 0) return result;
  if (uniqueClaimIds.length > MAX_RELATIONSHIP_CLAIM_IDS) {
    throw new Error(`ask_trace_relationship_claim_limit:${MAX_RELATIONSHIP_CLAIM_IDS}`);
  }

  const rows: RelationRow[] = [];
  for (let offset = 0; offset < uniqueClaimIds.length; offset += RELATIONSHIP_CLAIM_CHUNK_SIZE) {
    const chunk = uniqueClaimIds.slice(offset, offset + RELATIONSHIP_CLAIM_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const proposals = await db.prepare(`
      SELECT source_canonical_claim_id, target_canonical_claim_id, relationship
      FROM knowledge_claim_relationship_proposals
      WHERE state = 'accepted'
        AND (source_canonical_claim_id IN (${placeholders}) OR target_canonical_claim_id IN (${placeholders}))
      ORDER BY source_canonical_claim_id, target_canonical_claim_id, relationship
    `).bind(...chunk, ...chunk).all<RelationRow>();
    const conflicts = await db.prepare(`
      SELECT source_claim_id AS source_canonical_claim_id,
             target_claim_id AS target_canonical_claim_id,
             CASE conflict_kind WHEN 'contradiction' THEN 'contradicts'
               WHEN 'correction' THEN 'corrects' WHEN 'supersession' THEN 'supersedes'
               ELSE 'temporal_change' END AS relationship
      FROM knowledge_claim_conflict_cases
      WHERE status IN ('unresolved', 'acknowledged')
        AND (source_claim_id IN (${placeholders}) OR target_claim_id IN (${placeholders}))
      ORDER BY source_claim_id, target_claim_id, conflict_kind
    `).bind(...chunk, ...chunk).all<RelationRow>();
    rows.push(...(proposals.results ?? []), ...(conflicts.results ?? []));
  }

  rows.sort((left, right) =>
    left.source_canonical_claim_id.localeCompare(right.source_canonical_claim_id)
    || left.target_canonical_claim_id.localeCompare(right.target_canonical_claim_id)
    || left.relationship.localeCompare(right.relationship));
  for (const row of rows) {
    const forward = result.get(row.source_canonical_claim_id) ?? [];
    forward.push(row);
    result.set(row.source_canonical_claim_id, forward);
    const reverse = result.get(row.target_canonical_claim_id) ?? [];
    reverse.push({
      source_canonical_claim_id: row.target_canonical_claim_id,
      target_canonical_claim_id: row.source_canonical_claim_id,
      relationship: row.relationship,
    });
    result.set(row.target_canonical_claim_id, reverse);
  }
  return result;
}

function evidenceRoleIsDirect(role: TraceSourceRole, directness: EvidenceExcerpt["directness"]): boolean {
  return role === "evidence" && directness === "direct";
}

function isStrongEvidenceQuality(value: TraceEvidenceQuality | undefined): boolean {
  return value === "strong" || value === "very_strong";
}

function assessPosition(position: KnowledgePosition, evidenceById: Map<string, EvidenceExcerpt>): KnowledgePositionAssessment {
  const evidence = position.evidenceIds.map(id => evidenceById.get(id)).filter((item): item is EvidenceExcerpt => Boolean(item));
  const current = evidence.filter(item => item.freshnessState === "current");
  const direct = current.filter(item => evidenceRoleIsDirect(item.sourceRole, item.directness));
  const strong = current.filter(item => isStrongEvidenceQuality(item.evidenceQuality));
  const stale = evidence.filter(item => item.freshnessState === "stale");
  const disputed = evidence.filter(item => item.isDisputed || item.relationship === "contradicts");
  const provenanceGroups = unique(evidence.flatMap(item => item.provenanceGroupIds ?? []));
  const derivativeOnly = evidence.length > 0 && evidence.every(item =>
    item.sourceRole === "internal_synthesis"
      || item.directness === "derivative"
      || item.independentEvidenceWeight === 0 && provenanceGroups.length === 0,
  );
  return {
    positionId: position.id,
    evidenceCount: evidence.length,
    currentEvidenceCount: current.length,
    directEvidenceCount: direct.length,
    independentProvenanceGroupCount: provenanceGroups.length,
    strongEvidenceCount: strong.length,
    staleEvidenceCount: stale.length,
    disputedEvidenceCount: disputed.length,
    derivativeOnly,
  };
}

function evidenceModeFor(evidence: EvidenceExcerpt[], requested?: KnowledgeEvidenceMode): KnowledgeEvidenceMode {
  if (requested) return requested;
  if (evidence.some(item => item.sourceKind === "trace_knowledge" || item.knowledgeDocumentId)) return "knowledge";
  return "researched";
}

export async function buildAskTraceDecisionPacket(
  db: D1Database,
  evidence: EvidenceExcerpt[],
  requestedEvidenceMode?: KnowledgeEvidenceMode,
): Promise<AskTraceDecisionPacket> {
  const eligibleEvidence = evidence.filter(isAnswerEligibleEvidence);
  const evidenceById = new Map<string, EvidenceExcerpt>();
  const groupingEvidence: KnowledgePositionEvidence[] = [];
  for (const [index, item] of eligibleEvidence.entries()) {
    const id = evidenceIdFor(item, index);
    evidenceById.set(id, item);
    const claimId = canonicalClaimIdFor(item);
    groupingEvidence.push({
      id,
      recordType: "canonical_claim",
      recordId: claimId ?? id,
      score: isStrongEvidenceQuality(item.evidenceQuality) ? 1 : 0.5,
      claimId,
      statement: item.text,
      provenanceGroupIds: item.provenanceGroupIds,
      relationships: [],
    });
  }
  let relationships: Map<string, RelationRow[]>;
  try {
    relationships = await relationshipsFor(db, unique(groupingEvidence.map(item => item.claimId ?? undefined)));
  } catch (error) {
    // Relationship/conflict state is provenance-critical. Any query failure,
    // missing legacy schema, or bounded-parameter overflow must reduce the
    // packet to a governed non-answer; it must never erase contradictions.
    console.error(JSON.stringify({
      message: "Ask TRACE relationship resolution failed closed",
      error: error instanceof Error ? error.message : "unknown",
    }));
    const safePolicy = selectKnowledgeConclusion({
      evidenceMode: "insufficient",
      positions: [],
      competitions: [],
    });
    return {
      ...safePolicy,
      positions: [],
      competitions: [],
      eligibleEvidenceIds: eligibleEvidence.map((item, index) => evidenceIdFor(item, index)),
      eligibleClaimIds: unique(eligibleEvidence.map(item => item.claimId)),
      eligibleAssertionIds: unique(eligibleEvidence.map(item => item.assertionId)),
      synthesisMode: "none",
    };
  }
  for (const item of groupingEvidence) {
    item.relationships = (relationships.get(item.claimId ?? "") ?? []).map(row => ({
      targetClaimId: row.target_canonical_claim_id,
      relationship: row.relationship,
    }));
  }
  const grouping = groupKnowledgePositions(groupingEvidence);
  const positions = grouping.positions;
  const assessments = positions.map(position => assessPosition(position, evidenceById));
  const policy = selectKnowledgeConclusion({
    evidenceMode: evidenceModeFor(evidence, requestedEvidenceMode),
    positions: assessments,
    competitions: grouping.competitions.map(competition => ({
      leftPositionId: competition.leftPositionId,
      rightPositionId: competition.rightPositionId,
      unresolved: true,
    })),
  });
  const synthesisMode: AskTraceSynthesisMode = policy.conclusionMode === "insufficient_evidence"
    || ["insufficient", "out_of_scope", "refused"].includes(policy.evidenceMode)
    ? "none"
    : "model";
  return {
    ...policy,
    positions,
    competitions: grouping.competitions,
    eligibleEvidenceIds: eligibleEvidence.map((item, index) => evidenceIdFor(item, index)),
    eligibleClaimIds: unique(eligibleEvidence.map(item => item.claimId)),
    eligibleAssertionIds: unique(eligibleEvidence.map(item => item.assertionId)),
    synthesisMode,
  };
}
