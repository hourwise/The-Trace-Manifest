import {
  EVIDENCE_SCORE_POLICY_VERSION,
  scoreCanonicalClaim,
  scoreStory,
  type ClaimScoringInput,
  type ScoringAssertion,
  type ScoringConflict,
  type StoryClaimForScoring,
} from "./evidence-scoring";

type RecalculationEvent =
  | "accepted_evidence"
  | "claim_match_accepted"
  | "provenance_changed"
  | "conflict_created"
  | "conflict_reviewed"
  | "correction_recorded"
  | "expiry_reached"
  | "story_withdrawn"
  | "story_superseded"
  | "story_archived";

interface ClaimRow {
  id: string;
  current_state: ClaimScoringInput["currentState"];
  materiality: ClaimScoringInput["materiality"];
  claim_class: ClaimScoringInput["claimClass"];
}

interface AssertionRow {
  admission_state: ScoringAssertion["admissionState"];
  reviewer_state: ScoringAssertion["reviewerState"];
  freshness_state: ScoringAssertion["freshnessState"];
  relationship: ScoringAssertion["relationship"];
  source_role: ScoringAssertion["sourceRole"];
  directness: ScoringAssertion["directness"];
  evidence_treatment: ScoringAssertion["evidenceTreatment"];
  provenance_group_id: string | null;
  provenance_origin_type: ScoringAssertion["provenanceOriginType"] | null;
  confidence: number;
}

interface AttachmentRow {
  relationship: "supports" | "qualifies" | "contradicts" | "contextualises";
  confidence: number;
  source_treatment: string;
}

interface ConflictRow {
  source_claim_id: string;
  target_claim_id: string;
  status: string;
  materiality: ClaimScoringInput["materiality"];
}

interface StoryClaimRow {
  story_cluster_id: number;
  canonical_claim_id: string;
  materiality: ClaimScoringInput["materiality"];
}

export interface RecalculateEvidenceInput {
  claimIds?: string[];
  storyIds?: number[];
  triggeringEvent: RecalculationEvent;
}

export interface RecalculateEvidenceResult {
  triggeringEvent: RecalculationEvent;
  claimIds: string[];
  storyIds: number[];
  claimSnapshots: number;
  storySnapshots: number;
  statusChanges: number;
}

function originFromTreatment(treatment: string): ScoringAssertion["provenanceOriginType"] {
  if (treatment.includes("vendor")) return "vendor_statement";
  if (treatment.includes("community") || treatment === "discovery") return "community";
  if (treatment.includes("research")) return "research";
  if (treatment.includes("primary")) return "primary";
  return "unknown";
}

function asPlaceholders(values: string[]): string {
  return values.map(() => "?").join(", ");
}

async function loadClaim(db: D1Database, claimId: string): Promise<ClaimScoringInput | null> {
  const claim = await db.prepare(`
    SELECT id, current_state, materiality, claim_class
    FROM canonical_claims WHERE id = ?
  `).bind(claimId).first<ClaimRow>();
  if (!claim) return null;

  const assertions = await db.prepare(`
    SELECT assertion.admission_state, assertion.reviewer_state,
           assertion.freshness_state, assertion.relationship,
           assertion.source_role, assertion.directness,
           assertion.evidence_treatment, assertion.provenance_group_id,
           groups.origin_type AS provenance_origin_type, assertion.confidence
    FROM claim_assertions assertion
    LEFT JOIN provenance_groups groups ON groups.id = assertion.provenance_group_id
    WHERE assertion.canonical_claim_id = ?
  `).bind(claimId).all<AssertionRow>();

  const attachments = await db.prepare(`
    SELECT attachment.relationship, review.confidence, source.treatment AS source_treatment
    FROM story_claim_evidence_attachments attachment
    JOIN story_related_item_reviews review
      ON review.source_story_id = attachment.story_cluster_id
     AND review.target_feed_item_id = attachment.feed_item_id
     AND review.action = 'attach_evidence'
     AND review.state = 'accepted'
    JOIN feed_items item ON item.id = attachment.feed_item_id
    JOIN sources source ON source.id = item.source_id
    WHERE attachment.canonical_claim_id = ?
      AND attachment.eligibility_state = 'eligible'
  `).bind(claimId).all<AttachmentRow>();

  const conflicts = await db.prepare(`
    SELECT source_claim_id, target_claim_id, status,
           source_claim.materiality AS materiality
    FROM knowledge_claim_conflict_cases conflict
    JOIN canonical_claims source_claim ON source_claim.id = conflict.source_claim_id
    WHERE (source_claim_id = ? OR target_claim_id = ?)
  `).bind(claimId, claimId).all<ConflictRow>();

  const scoringAssertions: ScoringAssertion[] = [
    ...(assertions.results ?? []).map((assertion) => ({
      admissionState: assertion.admission_state,
      reviewerState: assertion.reviewer_state,
      freshnessState: assertion.freshness_state,
      relationship: assertion.relationship,
      sourceRole: assertion.source_role,
      directness: assertion.directness,
      evidenceTreatment: assertion.evidence_treatment,
      provenanceGroupId: assertion.provenance_group_id,
      provenanceOriginType: assertion.provenance_origin_type ?? "unknown",
      confidence: assertion.confidence,
    })),
    ...(attachments.results ?? []).map((attachment) => ({
      admissionState: "admitted" as const,
      reviewerState: "accepted" as const,
      freshnessState: "current" as const,
      relationship: attachment.relationship,
      sourceRole: "evidence" as const,
      directness: "direct" as const,
      evidenceTreatment: "factual_support" as const,
      // An attachment has not passed provenance grouping yet. It can support
      // directness and freshness, but cannot create an independent root.
      provenanceGroupId: null,
      provenanceOriginType: originFromTreatment(attachment.source_treatment),
      confidence: attachment.confidence,
    })),
  ];

  const scoringConflicts: ScoringConflict[] = (conflicts.results ?? [])
    .filter((conflict) => conflict.status === "unresolved" || conflict.status === "acknowledged")
    .map((conflict) => ({ unresolved: true, materiality: conflict.materiality }));

  return {
    id: claim.id,
    currentState: claim.current_state,
    materiality: claim.materiality,
    claimClass: claim.claim_class,
    assertions: scoringAssertions,
    conflicts: scoringConflicts,
  };
}

/** Recompute affected claims/stories from current reviewed D1 state. */
export async function recalculateEvidenceScores(
  db: D1Database,
  input: RecalculateEvidenceInput,
): Promise<RecalculateEvidenceResult> {
  const claimIds = new Set((input.claimIds ?? []).filter(Boolean));
  const storyIds = new Set((input.storyIds ?? []).filter((id) => Number.isInteger(id) && id > 0));

  if (storyIds.size > 0) {
    const ids = [...storyIds];
    const rows = await db.prepare(`
      SELECT story_cluster_id, canonical_claim_id, materiality
      FROM story_claims
      WHERE story_cluster_id IN (${asPlaceholders(ids.map(String))})
    `).bind(...ids).all<StoryClaimRow>();
    for (const row of rows.results ?? []) claimIds.add(row.canonical_claim_id);
  }

  if (claimIds.size > 0) {
    const ids = [...claimIds];
    const rows = await db.prepare(`
      SELECT DISTINCT story_cluster_id
      FROM story_claims
      WHERE canonical_claim_id IN (${asPlaceholders(ids)})
    `).bind(...ids).all<{ story_cluster_id: number }>();
    for (const row of rows.results ?? []) storyIds.add(row.story_cluster_id);
  }

  const claimScores = new Map<string, ReturnType<typeof scoreCanonicalClaim>>();
  for (const claimId of claimIds) {
    const claim = await loadClaim(db, claimId);
    if (claim) claimScores.set(claimId, scoreCanonicalClaim(claim));
  }

  const storyClaims = new Map<number, StoryClaimForScoring[]>();
  if (storyIds.size > 0) {
    const ids = [...storyIds];
    const rows = await db.prepare(`
      SELECT story_cluster_id, canonical_claim_id, materiality
      FROM story_claims
      WHERE story_cluster_id IN (${asPlaceholders(ids.map(String))})
    `).bind(...ids).all<StoryClaimRow>();
    for (const row of rows.results ?? []) {
      const claim = await loadClaim(db, row.canonical_claim_id);
      if (claim) {
        storyClaims.set(row.story_cluster_id, [
          ...(storyClaims.get(row.story_cluster_id) ?? []),
          { ...claim, materiality: row.materiality },
        ]);
      }
    }
  }

  const statements: D1PreparedStatement[] = [];
  for (const score of claimScores.values()) {
    statements.push(db.prepare(`
      INSERT INTO canonical_claim_score_snapshots
        (id, canonical_claim_id, score, evidence_status, component_json, policy_version, triggering_event)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), score.claimId, score.score, score.evidenceStatus,
      JSON.stringify(score.components), EVIDENCE_SCORE_POLICY_VERSION, input.triggeringEvent,
    ));
  }

  let statusChanges = 0;
  for (const [storyId, claims] of storyClaims) {
    const score = scoreStory(claims);
    statements.push(db.prepare(`
      INSERT INTO evidence_score_snapshots
        (id, story_cluster_id, score, evidence_status, component_json, policy_version, triggering_event)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), storyId, score.score, score.evidenceStatus,
      JSON.stringify({ claimScores: score.claimScores }), EVIDENCE_SCORE_POLICY_VERSION, input.triggeringEvent,
    ));
    statements.push(db.prepare(`
      UPDATE story_clusters
      SET evidence_status = ?, updated_at = datetime('now')
      WHERE id = ? AND evidence_status <> ?
    `).bind(score.evidenceStatus, storyId, score.evidenceStatus));
  }

  if (statements.length > 0) {
    const results = await db.batch(statements);
    for (const result of results) statusChanges += Number(result.meta.changes ?? 0) > 0 ? 1 : 0;
  }

  return {
    triggeringEvent: input.triggeringEvent,
    claimIds: [...claimScores.keys()],
    storyIds: [...storyClaims.keys()],
    claimSnapshots: claimScores.size,
    storySnapshots: storyClaims.size,
    statusChanges,
  };
}

/** Scheduled expiry hook: stale assertions are already classified by ingestion/review. */
export async function recalculateExpiredEvidence(db: D1Database): Promise<RecalculateEvidenceResult> {
  const rows = await db.prepare(`
    SELECT DISTINCT canonical_claim_id
    FROM claim_assertions
    WHERE freshness_state = 'stale'
  `).all<{ canonical_claim_id: string }>();
  return recalculateEvidenceScores(db, {
    claimIds: (rows.results ?? []).map((row) => row.canonical_claim_id),
    triggeringEvent: "expiry_reached",
  });
}
