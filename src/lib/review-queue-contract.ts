import type { EvidenceStatus } from "../types/ask";

export type ReviewQueueScope = "pending-review" | "publishable";

export type ReviewQueuePublicationStatus = "draft" | "review" | "published" | "withdrawn" | "superseded";

export interface ReviewQueueCluster {
  id: number;
  title: string;
  topic: string | null;
  evidence_status: EvidenceStatus;
  publication_status: ReviewQueuePublicationStatus;
  needs_human_review: boolean;
  source_count: number;
  summary: string | null;
  why_it_matters: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export const REVIEW_QUEUE_SCOPE_VALUES = ["pending-review", "publishable"] as const satisfies readonly ReviewQueueScope[];
export const REVIEW_QUEUE_MAX_LIMIT = 200;
export const REVIEW_QUEUE_DEFAULT_LIMITS: Record<ReviewQueueScope, number> = {
  "pending-review": 50,
  publishable: 200,
};

export function isReviewQueueScope(value: string | null | undefined): value is ReviewQueueScope {
  return value === "pending-review" || value === "publishable";
}

export function reviewQueueLimit(scope: ReviewQueueScope, value: number | undefined): number {
  const requested = Number.isInteger(value) ? value! : REVIEW_QUEUE_DEFAULT_LIMITS[scope];
  return Math.max(1, Math.min(requested, REVIEW_QUEUE_MAX_LIMIT));
}
