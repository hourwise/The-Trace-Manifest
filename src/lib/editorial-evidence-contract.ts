import type { EvidenceStatus } from "../types/ask";

export type EditorialClaimState = "active" | "qualified" | "disputed" | "corrected" | "superseded" | "retired";
export type EditorialClaimMateriality = "low" | "standard" | "high" | "critical";
export type EditorialClaimRole = "primary" | "supporting" | "context" | "caveat" | "correction";

export type EditorialAssertionRelationship =
  | "supports" | "partially_supports" | "qualifies" | "contradicts" | "reports"
  | "reproduces" | "fails_to_reproduce" | "supersedes" | "corrects" | "contextualises";
export type EditorialAssertionSourceRole = "evidence" | "reported_claim" | "discovery_context" | "internal_synthesis";
export type EditorialAssertionDirectness = "direct" | "indirect" | "derivative" | "unknown";
export type EditorialEvidenceTreatment = "factual_support" | "attributed_opinion" | "context_only" | "discovery_only" | "internal_synthesis";
export type EditorialAssertionAdmissionState = "pending" | "admitted" | "quarantined" | "rejected";
export type EditorialAssertionFreshnessState = "current" | "stale" | "unknown";
export type EditorialAssertionReviewerState = "proposed" | "accepted" | "amended" | "rejected" | "duplicate" | "unsupported" | "needs_research";

export type EditorialAttachmentRelationship = "supports" | "qualifies" | "contradicts" | "contextualises";
export type EditorialAttachmentEligibilityState = "eligible" | "pending" | "ineligible";

export interface EditorialEvidenceSource {
  name: string;
  tier: string | null;
  url: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
}

export interface EditorialProvenance {
  groupId: string;
  originType: string;
  explanation: string;
}

export interface EditorialSourceDocument {
  documentId: string;
  versionId: string;
  admissionState: string;
  startLocator: string | null;
  endLocator: string | null;
}

export interface EditorialAssertion {
  assertionId: string;
  text: string;
  relationship: EditorialAssertionRelationship;
  sourceRole: EditorialAssertionSourceRole;
  directness: EditorialAssertionDirectness;
  evidenceTreatment: EditorialEvidenceTreatment;
  admissionState: EditorialAssertionAdmissionState;
  reviewerState: EditorialAssertionReviewerState;
  freshnessState: EditorialAssertionFreshnessState;
  confidence: number;
  source: EditorialEvidenceSource | null;
  sourceDocument: EditorialSourceDocument | null;
  provenance: EditorialProvenance | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface EditorialEvidenceAttachment {
  attachmentId: string;
  relationship: EditorialAttachmentRelationship;
  explanation: string | null;
  eligibilityState: EditorialAttachmentEligibilityState;
  eligibilityReason: string;
  reviewedBy: string;
  reviewedAt: string;
  source: EditorialEvidenceSource | null;
}

export interface EditorialClaim {
  canonicalClaimId: string;
  text: string;
  claimState: EditorialClaimState;
  materiality: EditorialClaimMateriality;
  role: EditorialClaimRole;
  score: number | null;
  evidenceStatus: EvidenceStatus | null;
  assertionCount: number;
  admittedAssertionCount: number;
  currentReviewedAssertionCount: number;
  assertions: EditorialAssertion[];
  assertionsTruncated: boolean;
  attachmentCount: number;
  eligibleAttachmentCount: number;
  attachments: EditorialEvidenceAttachment[];
  attachmentsTruncated: boolean;
}

export interface EditorialClusterEvidence {
  clusterId: number;
  claims: EditorialClaim[];
  claimCount: number;
  claimsTruncated: boolean;
  assertionCount: number;
  admittedAssertionCount: number;
  attachmentCount: number;
  eligibleAttachmentCount: number;
}
