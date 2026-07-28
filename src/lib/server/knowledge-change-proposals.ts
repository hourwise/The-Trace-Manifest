/**
 * KC-08H: deterministic review triggers for inherited knowledge.
 *
 * A proposal is a queue signal, not an automatic rewrite. The public
 * knowledge document remains immutable until a publisher creates and reviews
 * a revision. Ask TRACE excludes documents with an open proposal.
 */

export const KNOWLEDGE_CHANGE_DETECTOR_VERSION = "kc-08h-v1";

export type KnowledgeChangeKind =
  | "evidence_changed"
  | "expiry_reached"
  | "conflict_created"
  | "correction_recorded"
  | "supersession_recorded";

export interface KnowledgeChangeTriggerInput {
  kind: KnowledgeChangeKind;
  claimIds?: string[];
  sourceDocumentIds?: string[];
  sourceDocumentVersionId?: string | null;
  triggeringStoryId?: number | null;
  eventId?: string | null;
  now?: string;
}

export interface KnowledgeChangeTriggerResult {
  kind: KnowledgeChangeKind;
  proposalsCreated: number;
  proposalIds: string[];
  affectedDocumentIds: string[];
}

interface LinkedKnowledgeRow {
  knowledge_document_id: string;
  canonical_question: string;
  knowledge_status: string;
  review_after: string | null;
  hard_expiry: string | null;
  canonical_claim_id: string | null;
  claim_current_state: string | null;
  claim_assertion_id: string | null;
  assertion_admission_state: string | null;
  assertion_reviewer_state: string | null;
  assertion_freshness_state: string | null;
  assertion_relationship: string | null;
  assertion_source_document_version_id: string | null;
  assertion_source_document_id: string | null;
  source_admission_state: string | null;
  source_current_version_id: string | null;
  conflict_id: string | null;
  conflict_kind: string | null;
  conflict_status: string | null;
}

interface ProposalReason {
  code: string;
  claimId: string | null;
  assertionId: string | null;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  currentVersionId: string | null;
  conflictId: string | null;
  conflictKind: string | null;
}

interface ProposalBucket {
  document: LinkedKnowledgeRow;
  reasons: ProposalReason[];
}

function placeholders(values: string[]): string {
  return values.map(() => "?").join(", ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function due(value: string | null, now: number): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now;
}

function reasonFor(row: LinkedKnowledgeRow, code: string): ProposalReason {
  return {
    code,
    claimId: row.canonical_claim_id,
    assertionId: row.claim_assertion_id,
    sourceDocumentId: row.assertion_source_document_id,
    sourceDocumentVersionId: row.assertion_source_document_version_id,
    currentVersionId: row.source_current_version_id,
    conflictId: row.conflict_id,
    conflictKind: row.conflict_kind,
  };
}

async function digest(value: string): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function proposalTypeFor(kind: KnowledgeChangeKind): "update" | "correction" | "supersession" | "freshness_review" | "conflict_review" {
  if (kind === "expiry_reached") return "freshness_review";
  if (kind === "conflict_created") return "conflict_review";
  if (kind === "correction_recorded") return "correction";
  if (kind === "supersession_recorded") return "supersession";
  return "update";
}

function eventKey(input: KnowledgeChangeTriggerInput, document: LinkedKnowledgeRow, reasons: ProposalReason[]): string {
  if (input.kind === "expiry_reached") return `${document.review_after ?? ""}:${document.hard_expiry ?? ""}:${input.eventId ?? "scheduled"}`;
  if (input.eventId) return input.eventId;
  if (input.sourceDocumentVersionId) return input.sourceDocumentVersionId;
  return unique(reasons.map((reason) => reason.assertionId ?? reason.claimId ?? "unknown")).sort().join(",");
}

/** Create idempotent publisher-review proposals for affected knowledge pages. */
export async function triggerKnowledgeReview(
  db: D1Database,
  input: KnowledgeChangeTriggerInput,
): Promise<KnowledgeChangeTriggerResult> {
  const now = input.now ?? new Date().toISOString();
  const nowTimestamp = new Date(now).getTime();
  const claimIds = unique(input.claimIds ?? []);
  const sourceDocumentIds = unique(input.sourceDocumentIds ?? []);
  const predicates: string[] = [];
  const bindings: unknown[] = [];

  if (input.kind === "expiry_reached") {
    predicates.push("(datetime(kd.review_after) <= datetime(?) OR datetime(kd.hard_expiry) <= datetime(?))");
    bindings.push(now, now);
  }
  if (claimIds.length > 0) {
    predicates.push(`kdc.canonical_claim_id IN (${placeholders(claimIds)})`);
    bindings.push(...claimIds);
  }
  if (sourceDocumentIds.length > 0) {
    predicates.push(`sd.id IN (${placeholders(sourceDocumentIds)})`);
    bindings.push(...sourceDocumentIds);
  }
  // A source-version event can be discovered through the current source
  // document even when callers do not know the source-document ID.
  if (input.sourceDocumentVersionId) {
    predicates.push("(sd.current_version_id = ? OR ca.source_document_version_id = ?)");
    bindings.push(input.sourceDocumentVersionId, input.sourceDocumentVersionId);
  }
  if (predicates.length === 0) return { kind: input.kind, proposalsCreated: 0, proposalIds: [], affectedDocumentIds: [] };

  const rows = await db.prepare(`
    SELECT kd.id AS knowledge_document_id, kd.canonical_question,
           kd.status AS knowledge_status, kd.review_after, kd.hard_expiry,
           kdc.canonical_claim_id,
           cc.current_state AS claim_current_state,
           kda.claim_assertion_id,
           ca.admission_state AS assertion_admission_state,
           ca.reviewer_state AS assertion_reviewer_state,
           ca.freshness_state AS assertion_freshness_state,
           ca.relationship AS assertion_relationship,
           ca.source_document_version_id AS assertion_source_document_version_id,
           sd.id AS assertion_source_document_id,
           sd.admission_state AS source_admission_state,
           sd.current_version_id AS source_current_version_id,
           conflict.id AS conflict_id,
           conflict.conflict_kind,
           conflict.status AS conflict_status
    FROM knowledge_documents kd
    LEFT JOIN knowledge_document_claims kdc ON kdc.knowledge_document_id = kd.id
    LEFT JOIN knowledge_document_claim_assertions kda
      ON kda.knowledge_document_id = kd.id
     AND kda.section_key = kdc.section_key
     AND kda.canonical_claim_id = kdc.canonical_claim_id
    LEFT JOIN claim_assertions ca ON ca.id = kda.claim_assertion_id
    LEFT JOIN canonical_claims cc ON cc.id = kdc.canonical_claim_id
    LEFT JOIN source_document_versions sv ON sv.id = ca.source_document_version_id
    LEFT JOIN source_documents sd ON sd.id = sv.source_document_id
    LEFT JOIN knowledge_claim_conflict_cases conflict
      ON conflict.status IN ('unresolved', 'acknowledged')
     AND (conflict.source_claim_id = kdc.canonical_claim_id OR conflict.target_claim_id = kdc.canonical_claim_id)
    WHERE kd.status IN ('approved', 'needs_review')
      AND (${predicates.join(" OR ")})
    ORDER BY kd.id, kdc.section_key, kda.claim_assertion_id
  `).bind(...bindings).all<LinkedKnowledgeRow>();

  const buckets = new Map<string, ProposalBucket>();
  for (const row of rows.results ?? []) {
    let bucket = buckets.get(row.knowledge_document_id);
    if (!bucket) {
      bucket = { document: row, reasons: [] };
      buckets.set(row.knowledge_document_id, bucket);
    }
    const documentDue = input.kind === "expiry_reached" &&
      (due(row.review_after, nowTimestamp) || due(row.hard_expiry, nowTimestamp));
    const reasons: ProposalReason[] = [];
    if (documentDue) reasons.push(reasonFor(row, row.hard_expiry && due(row.hard_expiry, nowTimestamp) ? "hard_expiry_reached" : "review_due"));
    if (row.source_current_version_id && row.assertion_source_document_version_id &&
        row.source_current_version_id !== row.assertion_source_document_version_id) {
      reasons.push(reasonFor(row, "source_version_changed"));
    }
    if (row.assertion_freshness_state && row.assertion_freshness_state !== "current") {
      reasons.push(reasonFor(row, "linked_assertion_not_current"));
    }
    if (row.assertion_admission_state && row.assertion_admission_state !== "admitted") {
      reasons.push(reasonFor(row, "linked_assertion_not_admitted"));
    }
    if (row.assertion_reviewer_state && row.assertion_reviewer_state !== "accepted") {
      reasons.push(reasonFor(row, "linked_assertion_not_accepted"));
    }
    if (row.source_admission_state && row.source_admission_state !== "admitted") {
      reasons.push(reasonFor(row, "linked_source_not_admitted"));
    }
    if (row.claim_current_state === "corrected") reasons.push(reasonFor(row, "canonical_claim_corrected"));
    if (row.claim_current_state === "superseded") reasons.push(reasonFor(row, "canonical_claim_superseded"));
    if (row.claim_current_state === "retired") reasons.push(reasonFor(row, "canonical_claim_retired"));
    if (row.conflict_id && ["unresolved", "acknowledged"].includes(row.conflict_status ?? "")) {
      reasons.push(reasonFor(row, "unresolved_claim_conflict"));
    }
    if (reasons.length === 0 && input.kind !== "expiry_reached") reasons.push(reasonFor(row, input.kind));
    bucket.reasons.push(...reasons);
  }

  const proposalType = proposalTypeFor(input.kind);
  const proposalIds: string[] = [];
  let proposalsCreated = 0;
  for (const bucket of buckets.values()) {
    const reasons = bucket.reasons.filter((reason, index, all) => all.findIndex((item) => JSON.stringify(item) === JSON.stringify(reason)) === index);
    if (reasons.length === 0) continue;
    const document = bucket.document;
    const key = eventKey(input, document, reasons);
    const proposalId = `knowledge-change-${await digest(`${KNOWLEDGE_CHANGE_DETECTOR_VERSION}:${document.knowledge_document_id}:${proposalType}:${key}`)}`;
    const triggeringClaimId = reasons.find((reason) => reason.claimId)?.claimId ?? claimIds[0] ?? null;
    const rationale = `Knowledge review required for “${document.canonical_question}”: ${unique(reasons.map((reason) => reason.code)).join(", ")}.`;
    const payload = JSON.stringify({
      detectorVersion: KNOWLEDGE_CHANGE_DETECTOR_VERSION,
      trigger: input.kind,
      eventId: input.eventId ?? null,
      detectedAt: now,
      reasons,
      reviewAfter: document.review_after,
      hardExpiry: document.hard_expiry,
    });
    const inserted = await db.prepare(`
      INSERT OR IGNORE INTO knowledge_change_proposals
        (id, knowledge_document_id, triggering_story_id, triggering_claim_id,
         proposal_type, proposed_change_json, rationale, detector_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      proposalId, document.knowledge_document_id, input.triggeringStoryId ?? null,
      triggeringClaimId, proposalType, payload, rationale, KNOWLEDGE_CHANGE_DETECTOR_VERSION,
    ).run();
    if (Number(inserted.meta.changes ?? 0) === 1) proposalsCreated++;
    proposalIds.push(proposalId);
  }
  return {
    kind: input.kind,
    proposalsCreated,
    proposalIds,
    affectedDocumentIds: [...buckets.keys()],
  };
}
