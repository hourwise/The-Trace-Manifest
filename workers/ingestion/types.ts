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
  job_type: "fetch" | "classify" | "dedup" | "cluster" | "health_check" | "briefing";
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
