// The Trace Manifest — Ingestion Worker
// Cloudflare Worker for scheduled source fetching, dedup, and metadata storage
// Phase 2: Source Registry and Ingestion

import { fetchRSS } from "./fetchers/rss";
import { fetchGitHubReleases } from "./fetchers/github";
import { fetchArxivPapers } from "./fetchers/arxiv";
import { fetchHackerNews } from "./fetchers/hackernews";
import { checkSourceHealth } from "./health";
import { deduplicateURL, hashURL } from "./dedup";
import { runClassification } from "./classify";
import { runCrossSourceMatching } from "./cross-source-match";
import { runClustering } from "./cluster";
import { runClaimExtraction, detectClaimConflicts } from "./extract-claims";
import { recordClusterCorrection, recordClaimCorrection, listPublishedCorrections, validateCorrectionInput } from "./corrections";
import { runModelDataExtraction, seedModelData } from "./model-data";
import {
  publishStory, updateStoryStatus, publishBriefing,
  getPublishedStories, getPublishedStoryBySlug, getPublishedTopics,
  getLatestPublishedBriefing, getPublishedSourcesForStory, getRelatedStories,
} from "./publish";
import type { Source, FeedItem } from "./types";

// ============================================================
// CORS and authentication
// ============================================================
const ALLOWED_ORIGINS = new Set([
  "https://thetracemanifest.com",
  "https://www.thetracemanifest.com",
  "http://localhost:4321",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function isAuthorised(request: Request, env: Env): boolean {
  const supplied = request.headers.get("Authorization");
  const expected = `Bearer ${env.ADMIN_API_TOKEN}`;
  return supplied === expected;
}

export interface Env {
  DB: D1Database;
  RAW_STORE: R2Bucket;
  ADMIN_API_TOKEN: string;
  ALLOWED_ADMIN_ORIGIN: string;
}

export default {
  // Cron trigger handler — scheduled fetching
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cron = event.cron;
    const cronRunId = await cronRunStart(env, cron);

    try {
      switch (cron) {
        case "*/30 * * * *":
          await ingestTier(env, ctx, "A", "fetch");
          break;
        case "0 */3 * * *":
          await ingestTier(env, ctx, "A", "fetch");
          break;
        case "0 6 * * *":
          await ingestTier(env, ctx, "B", "fetch");
          break;
        case "0 9 * * *":
          await runClassificationPipeline(env);
          await runCrossSourceMatchingPipeline(env);
          await runClusteringPipeline(env);
          await runClaimExtractionPipeline(env);
          await runConflictDetectionPipeline(env);
          await runModelDataPipeline(env);
          break;
        case "0 18 * * *":
          await checkAllSourcesHealth(env);
          break;
        default:
          console.log(`Unknown cron pattern: ${cron}`);
      }
      await cronRunComplete(env, cronRunId, "completed");
    } catch (error: any) {
      await cronRunComplete(env, cronRunId, "failed", error.message);
      throw error;
    }
  },

  // HTTP handler — CORS + admin API with auth
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/admin/")) {
      if (!isAuthorised(request, env)) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401, headers: corsHeaders(request) }
        );
      }
      const response = await handleAdminRoute(path, request, env, ctx);
      for (const [key, value] of Object.entries(corsHeaders(request))) {
        if (value) response.headers.set(key, value);
      }
      return response;
    }

    return new Response("The Trace Manifest — Ingestion Worker", {
      status: 200,
      headers: corsHeaders(request),
    });
  },
};

// ============================================================
// Cron audit
// ============================================================
async function cronRunStart(env: Env, cron: string): Promise<number> {
  const { meta } = await env.DB.prepare(
    "INSERT INTO cron_runs (cron_expression, status) VALUES (?, 'running')"
  ).bind(cron).run();
  return meta.last_row_id;
}

async function cronRunComplete(env: Env, runId: number, status: string, error?: string) {
  await env.DB.prepare(
    "UPDATE cron_runs SET completed_at = datetime('now'), status = ?, error_message = ? WHERE id = ?"
  ).bind(status, error || null, runId).run();
}

// ============================================================
// Tier-based ingestion
// ============================================================
async function ingestTier(env: Env, ctx: ExecutionContext, tier: string, jobType: string) {
  const { results: sources } = await env.DB.prepare(
    "SELECT * FROM sources WHERE tier = ? AND active = 1 AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || cadence_minutes || ' minutes') <= datetime('now'))"
  ).bind(tier).all<Source>();

  if (!sources || sources.length === 0) {
    console.log(`No sources to fetch for tier ${tier}`);
    return;
  }

  console.log(`Ingesting ${sources.length} sources for tier ${tier}`);

  for (const source of sources) {
    ctx.waitUntil(processSource(env, source, jobType));
  }
}

async function processSource(env: Env, source: Source, jobType: string) {
  const jobId = await createJob(env, source.id, jobType);

  try {
    let items: Omit<FeedItem, "id" | "created_at">[] = [];

    switch (source.ingestion_type) {
      case "rss":
        items = await fetchRSS(source);
        break;
      case "github_api":
        items = await fetchGitHubReleases(source);
        break;
      case "arxiv_api":
        items = await fetchArxivPapers(source);
        break;
      case "hackernews_api":
        items = await fetchHackerNews(source);
        break;
      default:
        console.log(`Skipping source ${source.name}: ingestion_type=${source.ingestion_type} not yet implemented`);
        await completeJob(env, jobId, "completed", 0, 0);
        return;
    }

    // Deduplicate against existing items
    let created = 0;
    for (const item of items) {
      const urlHash = await hashURL(item.url);
      const isDup = await deduplicateURL(env.DB, urlHash);

      if (!isDup) {
        await env.DB.prepare(
          `INSERT INTO feed_items (source_id, external_id, url, url_hash, title, summary, content_excerpt, author, published_at, fetched_at, raw_metadata, ingestion_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'raw')`
        ).bind(
          source.id, item.external_id, item.url, urlHash, item.title,
          item.summary, item.content_excerpt, item.author,
          item.published_at, JSON.stringify(item.raw_metadata || {})
        ).run();
        created++;
      }
    }

    // Update source health
    await env.DB.prepare(
      "UPDATE sources SET last_fetched_at = datetime('now'), last_success_at = datetime('now'), consecutive_failures = 0, health_status = 'healthy' WHERE id = ?"
    ).bind(source.id).run();

    await completeJob(env, jobId, "completed", items.length, created);
    console.log(`Source ${source.name}: ${created}/${items.length} new items`);
  } catch (error: any) {
    console.error(`Error processing source ${source.name}: ${error.message}`);

    await env.DB.prepare(
      "UPDATE sources SET last_fetched_at = datetime('now'), last_error_at = datetime('now'), last_error_message = ?, consecutive_failures = consecutive_failures + 1, health_status = CASE WHEN consecutive_failures >= 3 THEN 'failing' WHEN consecutive_failures >= 1 THEN 'degraded' ELSE health_status END WHERE id = ?"
    ).bind(error.message, source.id).run();

    await completeJob(env, jobId, "failed", 0, 0, error.message);
  }
}

// ============================================================
// Job tracking
// ============================================================
async function createJob(env: Env, sourceId: number, jobType: string): Promise<number> {
  const { meta } = await env.DB.prepare(
    "INSERT INTO ingestion_jobs (source_id, job_type, status, started_at) VALUES (?, ?, 'running', datetime('now'))"
  ).bind(sourceId, jobType).run();
  return meta.last_row_id;
}

async function completeJob(env: Env, jobId: number, status: string, processed: number, created: number, error?: string) {
  await env.DB.prepare(
    "UPDATE ingestion_jobs SET status = ?, items_processed = ?, items_created = ?, error_message = ?, completed_at = datetime('now') WHERE id = ?"
  ).bind(status, processed, created, error || null, jobId).run();
}

// ============================================================
// Classification pipeline (morning run)
// ============================================================
async function runClassificationPipeline(env: Env) {
  console.log("Classification pipeline: starting...");
  const result = await runClassification(env.DB,
    (processed, total) => {
      if (processed % 25 === 0 || processed === total) {
        console.log(`Classification progress: ${processed}/${total}`);
      }
    }
  );
  console.log(`Classification pipeline: done — ${result.classified} of ${result.processed} items classified`);
}

// ============================================================
// Cross-source matching pipeline (runs after classification)
// ============================================================
async function runCrossSourceMatchingPipeline(env: Env) {
  console.log("Cross-source matching: starting...");
  const result = await runCrossSourceMatching(env.DB);
  console.log(`Cross-source matching: done — ${result.matched} candidate matches from ${result.processed} items`);
}

// ============================================================
// Clustering pipeline (runs after semantic dedup)
// ============================================================
async function runClusteringPipeline(env: Env) {
  console.log("Clustering: starting...");
  const result = await runClustering(env.DB);
  console.log(`Clustering: done — ${result.clusters} clusters from ${result.processed} items`);
}

// ============================================================
// Claim extraction pipeline (runs after clustering)
// ============================================================
async function runClaimExtractionPipeline(env: Env) {
  console.log("Claim extraction: starting...");
  const result = await runClaimExtraction(env.DB,
    (processed, total) => {
      if (processed % 50 === 0 || processed === total) {
        console.log(`Claim extraction progress: ${processed}/${total}`);
      }
    }
  );
  console.log(`Claim extraction: done — ${result.claimsExtracted} claims from ${result.processed} items, ${result.evidenceCreated} evidence records`);
}

// ============================================================
// Conflict detection pipeline (runs after claim extraction)
// ============================================================
async function runConflictDetectionPipeline(env: Env) {
  console.log("Conflict detection: starting...");
  const result = await detectClaimConflicts(env.DB);
  console.log(`Conflict detection: done — ${result.conflictsDetected} conflicts detected`);
}

// ============================================================
// Model data extraction pipeline (runs after conflict detection)
// ============================================================
async function runModelDataPipeline(env: Env) {
  console.log("Model data extraction: starting...");
  const result = await runModelDataExtraction(env.DB,
    (processed, total) => {
      if (processed % 50 === 0 || processed === total) {
        console.log(`Model data progress: ${processed}/${total}`);
      }
    }
  );
  console.log(`Model data: done — ${result.modelsFound} models, ${result.providersFound} providers, ${result.benchmarksFound} benchmarks, ${result.pricesRecorded} prices`);
}

// ============================================================
// Source health check
// ============================================================
async function checkAllSourcesHealth(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM sources WHERE active = 1"
  ).all<Source>();

  if (!results) return;

  for (const source of results) {
    await checkSourceHealth(env, source);
  }
}

// ============================================================
// Admin route dispatcher
// ============================================================
async function handleAdminRoute(path: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  switch (path) {
    case "/admin/ingest":
      return handleManualIngest(request, env, ctx);
    case "/admin/sources":
      return handleSourceList(env);
    case "/admin/sources/health":
      return handleHealthReport(env);
    case "/admin/jobs":
      return handleJobList(env);
    case "/admin/cron-runs":
      return handleCronRunList(env);
    case "/admin/classify":
      return handleManualClassify(env);
    case "/admin/dedup":
      return handleCrossSourceMatch(env);
    case "/admin/cluster":
      return handleManualCluster(env);
    case "/admin/extract-claims":
      return handleManualClaimExtraction(env);
    case "/admin/detect-conflicts":
      return handleManualConflictDetection(env);
    case "/admin/corrections":
      return handleCorrectionsList(env);
    case "/admin/correct":
      return handleRecordCorrection(request, env);
    case "/admin/seed-models":
      return handleSeedModelData(env);
    case "/admin/extract-model-data":
      return handleModelDataExtraction(env);
    case "/admin/publish-story":
      return handlePublishStory(request, env);
    case "/admin/withdraw-story":
      return handleWithdrawStory(request, env);
    case "/admin/publish-briefing":
      return handlePublishBriefing(request, env);
    case "/admin/published-stories":
      return handlePublishedStoriesList(request, env);
    default:
      return Response.json({ error: "Not found" }, { status: 404 });
  }
}

// ============================================================
// Admin API handlers
// ============================================================
async function handleManualIngest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { sourceId } = await request.json() as { sourceId?: number };

  if (sourceId) {
    const source = await env.DB.prepare("SELECT * FROM sources WHERE id = ?").bind(sourceId).first<Source>();
    if (source) {
      ctx.waitUntil(processSource(env, source, "fetch"));
      return Response.json({ status: "ok", source: source.name });
    }
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  // Ingest all due sources across all tiers
  await ingestTier(env, ctx, "A", "fetch");
  await ingestTier(env, ctx, "B", "fetch");
  return Response.json({ status: "ok", message: "Full ingestion triggered" });
}

async function handleSourceList(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, url, tier, treatment, ingestion_type, health_status, last_fetched_at, last_success_at, consecutive_failures FROM sources WHERE active = 1 ORDER BY tier, name"
  ).all();
  return Response.json(results || []);
}

async function handleHealthReport(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT health_status, COUNT(*) as count FROM sources WHERE active = 1 GROUP BY health_status"
  ).all();
  return Response.json(results || []);
}

async function handleJobList(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT j.*, s.name as source_name FROM ingestion_jobs j LEFT JOIN sources s ON j.source_id = s.id ORDER BY j.created_at DESC LIMIT 100"
  ).all();
  return Response.json(results || []);
}

async function handleCronRunList(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT 50"
  ).all();
  return Response.json(results || []);
}

async function handleManualClassify(env: Env): Promise<Response> {
  const result = await runClassification(env.DB);
  return Response.json({ status: "ok", ...result });
}

async function handleCrossSourceMatch(env: Env): Promise<Response> {
  const result = await runCrossSourceMatching(env.DB);
  return Response.json({ status: "ok", ...result });
}

async function handleManualCluster(env: Env): Promise<Response> {
  const result = await runClustering(env.DB);
  return Response.json({ status: "ok", ...result });
}

async function handleManualClaimExtraction(env: Env): Promise<Response> {
  const result = await runClaimExtraction(env.DB);
  return Response.json({ status: "ok", ...result });
}

async function handleManualConflictDetection(env: Env): Promise<Response> {
  const result = await detectClaimConflicts(env.DB);
  return Response.json({ status: "ok", ...result });
}

async function handleCorrectionsList(env: Env): Promise<Response> {
  const results = await listPublishedCorrections(env.DB);
  return Response.json(results || []);
}

async function handleRecordCorrection(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed — use POST" }, { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validationError = validateCorrectionInput(body);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  try {
    if (body.clusterId) {
      const result = await recordClusterCorrection(env.DB, body);
      return Response.json({ status: "ok", ...result });
    } else if (body.claimId) {
      const result = await recordClaimCorrection(env.DB, body);
      return Response.json({ status: "ok", ...result });
    }
    return Response.json({ error: "clusterId or claimId required" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function handleSeedModelData(env: Env): Promise<Response> {
  const result = await seedModelData(env.DB);
  return Response.json({ status: "ok", ...result });
}

async function handleModelDataExtraction(env: Env): Promise<Response> {
  const result = await runModelDataExtraction(env.DB);
  return Response.json({ status: "ok", ...result });
}

// ============================================================
// Phase 5E Publication handlers
// ============================================================

async function handlePublishStory(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    clusterId?: number;
    headline?: string;
    summary?: string;
    editorialAnalysis?: string;
    whyItMatters?: string;
    headlineImageUrl?: string;
    reviewedBy?: string;
  };

  if (!body.clusterId) {
    return Response.json({ error: "clusterId is required" }, { status: 400 });
  }
  if (!body.summary || body.summary.trim().length < 20) {
    return Response.json({ error: "summary is required (min 20 characters)" }, { status: 400 });
  }

  const result = await publishStory(env, {
    clusterId: body.clusterId,
    headline: body.headline,
    summary: body.summary,
    editorialAnalysis: body.editorialAnalysis,
    whyItMatters: body.whyItMatters,
    headlineImageUrl: body.headlineImageUrl,
    reviewedBy: body.reviewedBy || "admin",
  });

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok", story: result.story });
}

async function handleWithdrawStory(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    clusterId?: number;
    status?: string;
    reason?: string;
  };

  if (!body.clusterId) {
    return Response.json({ error: "clusterId is required" }, { status: 400 });
  }

  const newStatus = body.status === "superseded" ? "superseded" : "withdrawn";
  const result = await updateStoryStatus(env, body.clusterId, newStatus, body.reason);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok" });
}

async function handlePublishBriefing(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    briefingType?: string;
    briefingDate?: string;
    title?: string;
    summary?: string;
    contentJson?: string;
    reviewedBy?: string;
  };

  if (!body.briefingType || !["daily", "weekly"].includes(body.briefingType)) {
    return Response.json({ error: "briefingType must be 'daily' or 'weekly'" }, { status: 400 });
  }
  if (!body.briefingDate || !body.title || !body.summary || !body.contentJson) {
    return Response.json({ error: "briefingDate, title, summary, and contentJson are required" }, { status: 400 });
  }

  const result = await publishBriefing(env, {
    briefingType: body.briefingType as "daily" | "weekly",
    briefingDate: body.briefingDate,
    title: body.title,
    summary: body.summary,
    contentJson: body.contentJson,
    reviewedBy: body.reviewedBy || "admin",
  });

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok", briefing: result.briefing });
}

async function handlePublishedStoriesList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const stories = await getPublishedStories(env, { topic, limit, offset });
  return Response.json(stories);
}
