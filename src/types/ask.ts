// The Trace Manifest — Ask Answer Types
// Typed interface for answer data displayed on /ask/[question] pages

export type EvidenceStatus =
  | "confirmed"
  | "strongly_supported"
  | "provisionally_supported"
  | "vendor_reported"
  | "community_reported"
  | "disputed"
  | "unverified"
  | "corrected"
  | "superseded"
  | "outdated";

export type EvidenceChipType = "supporting" | "conflicting" | "vendor" | "gap";

export type EvidenceBlockType =
  | "facts"
  | "supporting"
  | "conflicting"
  | "vendor_claims"
  | "community_opinion"
  | "uncertainty"
  | "interpretation";

export type SourceProvenanceRole = "primary_facts" | "primary_supporting" | "method_interpretation" | "vendor_claim" | "community_opinion";

export interface EvidenceChip {
  type: EvidenceChipType;
  label: string;
  value: string;
  meta: string;
}

export interface EvidenceBlock {
  type: EvidenceBlockType;
  heading: string;
  content: string;
  items?: string[];
}

export interface ChangeCondition {
  text: string;
}

export interface SourceProvenance {
  id: string;
  checkedDate: string;
  label: string;
  url: string;
  role: SourceProvenanceRole;
  roleLabel: string;
  note: string;
}

export interface RelatedQuestion {
  question: string;
  slug: string;
}

export interface AskAnswer {
  question: string;
  slug: string;
  status: EvidenceStatus;
  confidence: number;
  freshnessDate: string;
  freshnessText: string;
  sourceCount: number;
  primarySourceCount: number;
  directAnswer: string;
  briefWhy: string;
  recommendation: string;
  evidenceSummary: EvidenceChip[];
  breakdown: EvidenceBlock[];
  changeConditions: ChangeCondition[];
  sources: SourceProvenance[];
  relatedQuestions: RelatedQuestion[];
  postureExplanation: string;
}

export function statusLabel(status: EvidenceStatus): string {
  const map: Record<EvidenceStatus, string> = {
    confirmed: "Confirmed",
    strongly_supported: "Strongly supported",
    provisionally_supported: "Provisionally supported",
    vendor_reported: "Vendor-reported",
    community_reported: "Community-reported",
    disputed: "Disputed",
    unverified: "Unverified",
    corrected: "Corrected",
    superseded: "Superseded",
    outdated: "Outdated",
  };
  return map[status] ?? status;
}

export function statusBadgeClass(status: EvidenceStatus): string {
  const map: Record<EvidenceStatus, string> = {
    confirmed: "badge-confirmed",
    strongly_supported: "badge-strong",
    provisionally_supported: "badge-provisional",
    vendor_reported: "badge-vendor",
    community_reported: "badge-community",
    disputed: "badge-disputed",
    corrected: "badge-corrected",
    superseded: "badge-superseded",
    outdated: "badge-outdated",
    unverified: "badge-provisional",
  };
  return map[status] ?? "badge-provisional";
}

export function evidenceBlockClass(type: EvidenceBlockType): string {
  const map: Record<EvidenceBlockType, string> = {
    facts: "facts",
    supporting: "facts",
    conflicting: "conflict",
    vendor_claims: "vendor",
    community_opinion: "community",
    uncertainty: "uncertain",
    interpretation: "interp",
  };
  return map[type] ?? "";
}

export function sourceRoleClass(role: SourceProvenanceRole): string {
  const map: Record<SourceProvenanceRole, string> = {
    primary_facts: "is-primary",
    primary_supporting: "is-primary",
    method_interpretation: "is-method",
    vendor_claim: "is-vendor",
    community_opinion: "",
  };
  return map[role] ?? "";
}
