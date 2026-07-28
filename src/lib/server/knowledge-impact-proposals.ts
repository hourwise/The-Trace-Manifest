/** KC-10B: create idempotent, review-gated proposals from KC-10A matches. */

import { KNOWLEDGE_IMPACT_MATCH_VERSION, matchKnowledgeImpacts, type KnowledgeImpactMatch, type KnowledgeImpactTargetType } from "./knowledge-impact-matching";

export const KNOWLEDGE_IMPACT_PROPOSAL_VERSION = "kc-10b-v1";
export type KnowledgeImpactType = "support" | "qualification" | "contradiction" | "correction" | "supersession" | "timeline_addition" | "comparison_update" | "review_only";

export interface KnowledgeImpactProposalResult {
  detectorVersion: string;
  matchesConsidered: number;
  proposalsCreated: number;
  proposalIds: string[];
  skippedImpacts: number;
}

export interface KnowledgeImpactTypeOverride {
  targetType: KnowledgeImpactTargetType;
  targetId: string;
  impactType: KnowledgeImpactType;
  rationale?: string;
}

interface ProposalRow { id: string; }

/**
 * Re-runs KC-10A eligibility, then records only bounded, idempotent proposals.
 * A reviewer must decide each proposal; this function never mutates a target.
 */
export async function createKnowledgeImpactProposals(
  db: D1Database,
  input: {
    claimIds: string[];
    impactTypes?: KnowledgeImpactTypeOverride[];
    triggeringStoryId?: number | null;
    maxMatchesPerClaim?: number;
    now?: string;
  },
): Promise<KnowledgeImpactProposalResult> {
  const matchesResult = await matchKnowledgeImpacts(db, input);
  const overrides = new Map((input.impactTypes ?? []).map((item) => [`${item.targetType}:${item.targetId}`, item]));
  const proposalIds: string[] = [];
  let proposalsCreated = 0;
  let skippedImpacts = 0;
  for (const match of matchesResult.matches) {
    const override = overrides.get(`${match.targetType}:${match.targetId}`);
    const impactType = override?.impactType ?? defaultImpactType(match.targetType);
    if (!impactTypeAllowed(impactType)) { skippedImpacts++; continue; }
    const rationale = override?.rationale?.trim() || defaultRationale(match, impactType);
    const id = `knowledge-impact-${await digest(`${KNOWLEDGE_IMPACT_PROPOSAL_VERSION}:${match.targetType}:${match.targetId}:${match.acceptedClaimId}:${impactType}`)}`;
    const payload = JSON.stringify({
      detectorVersion: KNOWLEDGE_IMPACT_PROPOSAL_VERSION,
      matcherVersion: KNOWLEDGE_IMPACT_MATCH_VERSION,
      impactType,
      acceptedClaimId: match.acceptedClaimId,
      target: { type: match.targetType, id: match.targetId, label: match.targetLabel, state: match.targetState },
      match: { kind: match.matchKind, score: match.matchScore, terms: match.matchedTerms },
      detectedAt: input.now ?? new Date().toISOString(),
    });
    const inserted = await db.prepare(`
      INSERT OR IGNORE INTO knowledge_impact_proposals
        (id, target_type, target_id, accepted_claim_id, triggering_story_id,
         impact_type, proposed_change_json, rationale, detector_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, match.targetType, match.targetId, match.acceptedClaimId,
      input.triggeringStoryId ?? null, impactType, payload, rationale,
      KNOWLEDGE_IMPACT_PROPOSAL_VERSION).run<ProposalRow>();
    if (Number(inserted.meta.changes ?? 0) === 1) proposalsCreated++;
    proposalIds.push(id);
  }
  return { detectorVersion: KNOWLEDGE_IMPACT_PROPOSAL_VERSION, matchesConsidered: matchesResult.matches.length, proposalsCreated, proposalIds, skippedImpacts };
}

function defaultImpactType(targetType: KnowledgeImpactTargetType): KnowledgeImpactType {
  return targetType === "knowledge_document" ? "support" : "review_only";
}

function defaultRationale(match: KnowledgeImpactMatch, impactType: KnowledgeImpactType): string {
  return `${impactType} impact candidate for ${match.targetLabel}; deterministic ${match.matchKind} match (${match.matchScore}) on ${match.matchedTerms.slice(0, 5).join(", ") || "bounded signals"}.`;
}

function impactTypeAllowed(value: string): value is KnowledgeImpactType {
  return ["support", "qualification", "contradiction", "correction", "supersession", "timeline_addition", "comparison_update", "review_only"].includes(value);
}

async function digest(value: string): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
