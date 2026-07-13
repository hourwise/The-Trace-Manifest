// The Trace Manifest — Ingestion Types

export interface Source {
  id: number;
  name: string;
  url: string;
  feed_url: string | null;
  section: string;
  tier: "A" | "B" | "C";
  treatment: string;
  cadence_minutes: number;
  ingestion_type: "rss" | "github_api" | "arxiv_api" | "page_diff" | "huggingface_api" | "hackernews_api" | "manual";
  active: boolean;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  health_status: "healthy" | "degraded" | "failing" | "disabled" | "unknown";
  licence_terms: string | null;
  commercial_restrictions: string | null;
  requires_review: boolean;
}

export interface FeedItem {
  id: number;
  source_id: number;
  external_id: string | null;
  url: string;
  url_hash: string;
  title: string;
  summary: string | null;
  content_excerpt: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  raw_metadata: string | null;
  ingestion_status: "raw" | "duplicate" | "classified" | "clustered" | "published" | "archived" | "rejected";
  duplicate_of: number | null;
  created_at: string;
}

export interface IngestionJob {
  id: number;
  source_id: number | null;
  job_type: "fetch" | "classify" | "dedup" | "cluster" | "health_check" | "briefing" | "extract_claims" | "conflict_detection";
  status: "pending" | "running" | "completed" | "failed";
  items_processed: number;
  items_created: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RSSItem {
  title: string;
  link: string;
  description: string | null;
  author: string | null;
  pubDate: string | null;
  guid: string | null;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  html_url: string;
  published_at: string;
  author: { login: string };
}

export interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: { name: string }[];
  published: string;
  updated: string;
  links: { href: string; type: string }[];
  categories: { term: string }[];
}

// ============================================================
// Phase 3: Claims and Evidence
// ============================================================

/** Claim classes per build plan — reflects who/what kind of source made the claim */
export type ClaimClass =
  | "specification_defined"
  | "official_vendor_claim"
  | "observed_implementation_behaviour"
  | "independent_research_finding"
  | "benchmark_result"
  | "community_report"
  | "legal_or_regulatory_statement"
  | "editorial_synthesis"
  | "trace_manifest_inference";

/** Claim domains — what the claim is about */
export type ClaimDomain =
  | "model_capability"
  | "model_release"
  | "benchmark"
  | "pricing"
  | "security"
  | "licence"
  | "regulation"
  | "research"
  | "product"
  | "funding"
  | "hardware"
  | "general";

/** Evidence relationship types per build plan */
export type EvidenceRelationship =
  | "supports"
  | "partially_supports"
  | "qualifies"
  | "contradicts"
  | "reports"
  | "reproduces"
  | "fails_to_reproduce"
  | "supersedes"
  | "corrects"
  | "contextualises";

export interface ExtractedClaim {
  claimText: string;
  claimClass: ClaimClass;
  claimDomain: ClaimDomain;
  severity: "low" | "standard" | "high" | "extraordinary";
  evidenceQuality: "weak" | "moderate" | "strong" | "very_strong";
  confidenceScore: number;
  supportingPhrase: string;   // the text snippet that triggered extraction
}

export interface ClaimExtractionResult {
  feedItemId: number;
  clusterId: number | null;
  claims: ExtractedClaim[];
}

export interface ClaimRecord {
  id: number;
  cluster_id: number | null;
  feed_item_id: number;
  claim_text: string;
  claim_class: ClaimClass;
  claim_domain: ClaimDomain;
  severity: string;
  evidence_quality: string;
  confidence_score: number;
  is_disputed: boolean;
  is_corrected: boolean;
  superseded_by: number | null;
  extraction_method: string;
  extraction_version: string;
  created_at: string;
  updated_at: string;
}
