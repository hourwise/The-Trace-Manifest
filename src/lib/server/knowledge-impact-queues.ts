/** KC-10C: bounded, read-only publisher queues for knowledge continuity work. */

export const KNOWLEDGE_IMPACT_QUEUE_VERSION = "kc-10c-v1";

export type KnowledgeImpactQueueLane = "affected_knowledge" | "expiring_knowledge" | "unresolved_contradictions" | "orphan_claims";

export interface KnowledgeImpactQueueItem {
  lane: KnowledgeImpactQueueLane;
  id: string;
  label: string;
  detail: string;
  state: string;
  priority: number;
  detectedAt: string | null;
}

export interface KnowledgeImpactQueues {
  algorithmVersion: string;
  generatedAt: string;
  affectedKnowledge: KnowledgeImpactQueueItem[];
  expiringKnowledge: KnowledgeImpactQueueItem[];
  unresolvedContradictions: KnowledgeImpactQueueItem[];
  orphanClaims: KnowledgeImpactQueueItem[];
}

interface QueueRow { id: string | number; label: string; detail: string; state: string; priority: number; detected_at: string | null; }

/** No writes, no publication decisions, and no unbounded scans are performed. */
export async function loadKnowledgeImpactQueues(
  db: D1Database,
  input: { now?: string; limit?: number } = {},
): Promise<KnowledgeImpactQueues> {
  const now = input.now ?? new Date().toISOString();
  const limit = boundedLimit(input.limit);
  const [affected, expiring, contradictions, orphanClaims] = await Promise.all([
    db.prepare(`
      SELECT document.id, document.canonical_question AS label,
        'impact proposals: ' || GROUP_CONCAT(proposal.impact_type, ', ') AS detail,
        document.status AS state, MAX(CASE proposal.impact_type WHEN 'contradiction' THEN 4 WHEN 'correction' THEN 5 WHEN 'supersession' THEN 5 ELSE 2 END) AS priority,
        MAX(proposal.created_at) AS detected_at
      FROM (
        SELECT target_id AS knowledge_document_id, impact_type, state, created_at
        FROM knowledge_impact_proposals
        WHERE target_type = 'knowledge_document' AND state = 'proposed'
        UNION ALL
        SELECT knowledge_document_id, proposal_type AS impact_type, state, created_at
        FROM knowledge_change_proposals
        WHERE state = 'proposed'
      ) proposal
      JOIN knowledge_documents document ON document.id = proposal.knowledge_document_id
      GROUP BY document.id, document.canonical_question, document.status
      ORDER BY priority DESC, detected_at ASC, document.id
      LIMIT ?
    `).bind(limit).all<QueueRow>(),
    db.prepare(`
      SELECT id, canonical_question AS label,
        CASE WHEN hard_expiry IS NOT NULL AND datetime(hard_expiry) <= datetime(?) THEN 'hard_expiry' ELSE 'review_due' END AS detail,
        status AS state,
        CASE WHEN hard_expiry IS NOT NULL AND datetime(hard_expiry) <= datetime(?) THEN 5 ELSE 3 END AS priority,
        COALESCE(hard_expiry, review_after) AS detected_at
      FROM knowledge_documents
      WHERE status IN ('approved', 'needs_review') AND visibility IN ('public_knowledge', 'public_guide')
        AND ((review_after IS NOT NULL AND datetime(review_after) <= datetime(?)) OR (hard_expiry IS NOT NULL AND datetime(hard_expiry) <= datetime(?)))
      ORDER BY priority DESC, datetime(COALESCE(hard_expiry, review_after)) ASC, id
      LIMIT ?
    `).bind(now, now, now, now, limit).all<QueueRow>(),
    db.prepare(`
      SELECT conflict.id, source.canonical_text || ' ↔ ' || target.canonical_text AS label,
        conflict.conflict_kind || ': ' || conflict.explanation AS detail,
        conflict.status AS state,
        CASE conflict.conflict_kind WHEN 'correction' THEN 5 WHEN 'supersession' THEN 5 ELSE 4 END AS priority,
        conflict.created_at AS detected_at
      FROM knowledge_claim_conflict_cases conflict
      JOIN canonical_claims source ON source.id = conflict.source_claim_id
      JOIN canonical_claims target ON target.id = conflict.target_claim_id
      WHERE conflict.status IN ('unresolved', 'acknowledged')
      ORDER BY priority DESC, conflict.created_at ASC, conflict.id
      LIMIT ?
    `).bind(limit).all<QueueRow>(),
    db.prepare(`
      SELECT claim.id, claim.canonical_text AS label,
        'accepted claim has no story or knowledge mapping' AS detail,
        claim.current_state AS state, 2 AS priority, claim.created_at AS detected_at
      FROM canonical_claims claim
      WHERE claim.current_state IN ('active', 'qualified')
        AND EXISTS (
          SELECT 1 FROM claim_assertions assertion
          JOIN source_document_versions version ON version.id = assertion.source_document_version_id
          JOIN source_documents source ON source.id = version.source_document_id
          WHERE assertion.canonical_claim_id = claim.id
            AND assertion.admission_state = 'admitted' AND assertion.reviewer_state IN ('accepted', 'amended')
            AND assertion.freshness_state IN ('current', 'unknown') AND source.admission_state = 'admitted'
        )
        AND NOT EXISTS (SELECT 1 FROM story_claims story_link WHERE story_link.canonical_claim_id = claim.id)
        AND NOT EXISTS (SELECT 1 FROM knowledge_document_claims knowledge_link WHERE knowledge_link.canonical_claim_id = claim.id)
      ORDER BY claim.created_at ASC, claim.id
      LIMIT ?
    `).bind(limit).all<QueueRow>(),
  ]);
  return {
    algorithmVersion: KNOWLEDGE_IMPACT_QUEUE_VERSION,
    generatedAt: now,
    affectedKnowledge: toItems("affected_knowledge", affected.results ?? []),
    expiringKnowledge: toItems("expiring_knowledge", expiring.results ?? []),
    unresolvedContradictions: toItems("unresolved_contradictions", contradictions.results ?? []),
    orphanClaims: toItems("orphan_claims", orphanClaims.results ?? []),
  };
}

function toItems(lane: KnowledgeImpactQueueLane, rows: QueueRow[]): KnowledgeImpactQueueItem[] {
  return rows.map((row) => ({ lane, id: String(row.id), label: row.label, detail: row.detail, state: row.state, priority: Number(row.priority), detectedAt: row.detected_at }));
}
function boundedLimit(value: number | undefined): number { return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 100) : 50; }
