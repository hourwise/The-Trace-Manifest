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
  job_type: "fetch" | "classify" | "dedup" | "cluster" | "health_check" | "briefing" | "extract_claims" | "conflict_detection" | "model_data" | "seed_models";
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

// ============================================================
// Phase 4: Models, Providers, Benchmarks
// ============================================================

export interface ModelRecord {
  id: number;
  entity_id: number | null;
  name: string;
  slug: string;
  provider: string;
  provider_entity_id: number | null;
  model_family: string | null;
  version: string | null;
  release_date: string | null;
  status: "active" | "deprecated" | "superseded" | "archived" | "announced";
  openness: "closed" | "open_weight" | "open_source" | "api_only";
  licence: string | null;
  parameter_count: string | null;
  context_window: string | null;
  modalities: string;
  tool_use: boolean;
  structured_output: boolean;
  api_available: boolean;
  local_available: boolean;
  description: string | null;
  best_use_cases: string | null;
  weaknesses: string | null;
  hardware_requirements: string | null;
  quantisation_options: string | null;
  superseded_by: number | null;
  last_verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderRecord {
  id: number;
  entity_id: number | null;
  name: string;
  slug: string;
  website: string | null;
  api_docs_url: string | null;
  status_page_url: string | null;
  regions: string | null;
  data_retention_policy: string | null;
  privacy_terms_url: string | null;
  enterprise_support: boolean;
  api_compatibility: string | null;
  moderation_policy: string | null;
  commercial_restrictions: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderModelRecord {
  id: number;
  provider_id: number;
  model_id: number;
  input_price_per_1m_tokens: number | null;
  output_price_per_1m_tokens: number | null;
  cached_input_price_per_1m_tokens: number | null;
  fine_tuning_price: number | null;
  rate_limit_rpm: number | null;
  rate_limit_tpm: number | null;
  supports_batch: boolean;
  supports_caching: boolean;
  supports_fine_tuning: boolean;
  supports_streaming: boolean;
  is_available: boolean;
  last_checked_at: string | null;
}

export interface BenchmarkRecord {
  id: number;
  entity_id: number | null;
  name: string;
  slug: string;
  version: string | null;
  owner: string | null;
  purpose: string;
  domain: string;
  health_status: "healthy" | "limited" | "saturating" | "contamination_concern" | "poorly_reproducible" | "vendor_specific" | "deprecated";
  reproducibility: "reproducible" | "partially_reproducible" | "not_reproducible" | "unknown" | null;
  contamination_concern: "low" | "medium" | "high" | "unknown" | null;
  saturation_level: string | null;
  code_available: boolean;
  data_available: boolean;
  code_url: string | null;
  data_url: string | null;
  last_reviewed_at: string | null;
}

export interface BenchmarkRunRecord {
  id: number;
  benchmark_id: number;
  model_id: number | null;
  model_version_id: number | null;
  score: number;
  score_display: string | null;
  prompting_method: string | null;
  tool_access: boolean | null;
  reasoning_settings: string | null;
  sampling_settings: string | null;
  hardware_or_provider: string | null;
  is_vendor_run: boolean;
  is_independent: boolean;
  comparable_results: boolean;
  test_date: string;
  source_url: string | null;
  notes: string | null;
}

export interface ExtractedModelData {
  name: string;
  provider: string;
  openness?: string;
  licence?: string;
  parameterCount?: string;
  contextWindow?: string;
  modalities?: string;
  toolUse?: boolean;
  inputPrice?: number;
  outputPrice?: number;
  benchmarkScores?: { benchmark: string; score: number; display: string }[];
}
