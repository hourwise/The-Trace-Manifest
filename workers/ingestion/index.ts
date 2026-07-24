// The Trace Manifest — Ingestion Worker
// Cloudflare Worker for scheduled source fetching, dedup, and metadata storage
// Phase 2: Source Registry and Ingestion

import { fetchRSS } from "./fetchers/rss";
import { fetchGitHubReleases } from "./fetchers/github";
import { fetchArxivPapers } from "./fetchers/arxiv";
import { fetchHackerNews } from "./fetchers/hackernews";
import { fetchHuggingFaceModels } from "./fetchers/huggingface-models";
import { fetchLMSYSArena } from "./fetchers/lmsys-arena";
import { fetchPageDiff } from "./fetchers/page-diff";
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
  getAllClusters, getClusterSources, archiveCluster,
  upgradeClusterEvidence,
} from "./publish";
import type { Source, FetchedFeedItem } from "./types";
import { verifyInternalRequestSignature } from "../../src/security/internal-signature";
import type { OperatorRole } from "../../src/security/access-auth";
import { admitAndQueueFeedCapture, admitAndQueueManualCapture } from "./knowledge-capture-queue";
import { consumeKnowledgeCaptureBatch } from "./knowledge-capture-consumer";
import { recalculateEvidenceScores, recalculateExpiredEvidence } from "../../src/lib/server/evidence-recalculation";

// ============================================================
// Signed internal-service authentication
// ============================================================
interface InternalOperator { email: string; role: OperatorRole; requestId: string }

const RELATED_ITEM_ACTIONS = [
  "same_event", "attach_evidence", "follow_up", "related_context",
  "contradiction", "correction", "supersession", "comparison", "reject",
] as const;
type RelatedItemAction = typeof RELATED_ITEM_ACTIONS[number];

const RELATED_ACTION_RELATIONSHIPS: Partial<Record<RelatedItemAction, string>> = {
  same_event: "same_event",
  follow_up: "follow_up_to",
  related_context: "related_context",
  contradiction: "contradicts",
  correction: "corrects",
  supersession: "supersedes",
  comparison: "compares_with",
};

const READ_ADMIN_ROUTES = new Set([
  "/admin/sources", "/admin/sources/health", "/admin/jobs", "/admin/cron-runs",
  "/admin/corrections", "/admin/published-stories", "/admin/clusters", "/admin/cluster-sources",
  "/admin/candidates", "/admin/social-signals", "/admin/related-items",
]);
const WRITE_ADMIN_ROUTES = new Set([
  "/admin/ingest", "/admin/classify", "/admin/dedup", "/admin/cluster",
  "/admin/extract-claims", "/admin/detect-conflicts", "/admin/correct",
  "/admin/seed-models", "/admin/extract-model-data", "/admin/publish-story",
  "/admin/withdraw-story", "/admin/publish-briefing", "/admin/archive-cluster",
  "/admin/related-items",
  "/admin/candidates", "/admin/social-signals", "/admin/knowledge/capture-url",
]);
const MAX_ADMIN_BODY_BYTES = 64 * 1024;

async function hashValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticateInternalRequest(request: Request, env: Env, body: string): Promise<InternalOperator | null> {
  const secret = env.TRACE_INTERNAL_SERVICE_SECRET ?? "";
  const version = request.headers.get("X-Trace-Internal-Version");
  const operator = request.headers.get("X-Trace-Operator")?.trim().toLowerCase() ?? "";
  const role = request.headers.get("X-Trace-Role") as OperatorRole | null;
  const timestamp = request.headers.get("X-Trace-Timestamp") ?? "";
  const nonce = request.headers.get("X-Trace-Nonce") ?? "";
  const signature = request.headers.get("X-Trace-Signature") ?? "";
  const numericTimestamp = Number(timestamp);
  if (
    secret.length < 32 || version !== "v1"
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(operator)
    || (role !== "reader" && role !== "publisher")
    || !Number.isFinite(numericTimestamp) || Math.abs(Date.now() - numericTimestamp) > 60_000
    || !/^[0-9a-f-]{36}$/i.test(nonce)
  ) return null;
  const url = new URL(request.url);
  if (!await verifyInternalRequestSignature(
    secret, request.method, `${url.pathname}${url.search}`, body,
    { operator, role, timestamp, nonce }, signature,
  )) return null;
  try {
    await env.DB.prepare("DELETE FROM admin_request_nonces WHERE expires_at <= datetime('now')").run();
    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO admin_request_nonces (nonce, operator_hash, expires_at)
      VALUES (?, ?, datetime('now', '+2 minutes'))
    `).bind(nonce, await hashValue(operator)).run();
    if (Number(inserted.meta.changes ?? 0) !== 1) return null;
  } catch {
    return null;
  }
  return { email: operator, role, requestId: nonce };
}

function routeAllowed(path: string, method: string, role: OperatorRole): boolean {
  if (method === "GET") return READ_ADMIN_ROUTES.has(path) && (path !== "/admin/candidates" || role === "publisher");
  return method === "POST" && role === "publisher" && WRITE_ADMIN_ROUTES.has(path);
}

async function readBoundedAdminBody(request: Request): Promise<string | null> {
  if (request.method === "GET") return "";
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_ADMIN_BODY_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ADMIN_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export interface Env {
  DB: D1Database;
  RAW_STORE: R2Bucket;
  KNOWLEDGE_PROCESSING_QUEUE?: Queue;
  TRACE_INTERNAL_SERVICE_SECRET: string;
  GITHUB_TOKEN?: string;
}

export default {
  // Cron trigger handler — scheduled fetching
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cron = event.cron;
    const cronRunId = await cronRunStart(env, cron);
    let ingestionSummary: IngestSummary | undefined;

    try {
      switch (cron) {
        case "*/30 * * * *":
          ingestionSummary = await ingestTier(env, ctx, "A", "fetch");
          break;
        case "0 6 * * *":
          ingestionSummary = await ingestTier(env, ctx, "B", "fetch");
          break;
        case "0 12 * * *":
          // Tier C is a low-frequency discovery pass. Its items remain discovery
          // signals and cannot independently establish evidence or publication.
          ingestionSummary = await ingestTier(env, ctx, "C", "fetch");
          break;
        case "0 9 * * *":
          await runClassificationPipeline(env);
          await runCrossSourceMatchingPipeline(env);
          await runClusteringPipeline(env);
          await runEvidenceUpgradePipeline(env);
          await runClaimExtractionPipeline(env);
          await runConflictDetectionPipeline(env);
          await recalculateExpiredEvidence(env.DB);
          await runModelDataPipeline(env);
          break;
        case "0 18 * * *":
          await checkAllSourcesHealth(env);
          break;
        default:
          throw new Error(`Unsupported cron pattern: ${cron}`);
      }
      await cronRunComplete(
        env,
        cronRunId,
        ingestionSummary?.failed ? "failed" : "completed",
        ingestionSummary?.failed ? "One or more source jobs failed." : undefined,
        ingestionSummary,
      );
    } catch (error: any) {
      await cronRunComplete(env, cronRunId, "failed", redactError(error));
      throw error;
    }
  },

  // HTTP handler — CORS + admin API with auth
  async queue(batch: MessageBatch<import("./knowledge-capture-queue").KnowledgeCaptureMessage>, env: Env) {
    await consumeKnowledgeCaptureBatch(batch, env);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/admin/")) {
      const body = await readBoundedAdminBody(request);
      if (body === null) {
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      const operator = await authenticateInternalRequest(request, env, body);
      if (!operator) return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (!routeAllowed(path, request.method, operator.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
      const authenticatedRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" ? undefined : body,
      });
      const targetId = adminTargetId(url, body);
      try {
        await recordAdminAuditWithRetry(env.DB, operator, path, targetId, "allowed");
      } catch {
        return Response.json({ error: "Audit service unavailable" }, { status: 503 });
      }
      let response: Response;
      try {
        response = await handleAdminRoute(path, authenticatedRequest, env, ctx, operator);
      } catch (error) {
        console.error(JSON.stringify({
          message: "Admin route failed closed",
          requestId: operator.requestId,
          action: path,
          error: redactError(error),
        }));
        response = Response.json({ error: "Admin action failed." }, { status: 500 });
      }
      try {
        await recordAdminAuditWithRetry(env.DB, operator, path, targetId, response.ok ? "succeeded" : "failed");
      } catch {
        console.error(JSON.stringify({ message: "Admin outcome audit failed", requestId: operator.requestId, action: path }));
        return Response.json({ error: "The action completed but its outcome audit could not be confirmed." }, { status: 503 });
      }
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    return new Response("The Trace Manifest — Ingestion Worker", {
      status: 200,
    });
  },
};

function adminTargetId(url: URL, body: string): string | null {
  const queryTarget = url.searchParams.get("clusterId") ?? url.searchParams.get("sourceId") ?? url.searchParams.get("claimId") ?? url.searchParams.get("candidateId");
  if (queryTarget && /^\d+$/.test(queryTarget)) return queryTarget;
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const value = parsed.candidateId ?? parsed.clusterId ?? parsed.sourceId ?? parsed.claimId;
    return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
      ? value
      : typeof value === "number" && Number.isInteger(value) && value > 0 ? String(value) : null;
  } catch {
    return null;
  }
}

async function recordAdminAudit(
  db: D1Database,
  operator: InternalOperator,
  action: string,
  targetId: string | null,
  outcome: "allowed" | "succeeded" | "failed",
): Promise<void> {
  await db.prepare(`
    INSERT INTO admin_audit_log
      (event_id, operator_email, operator_role, action, target_type, target_id, request_id, outcome)
    VALUES (?, ?, ?, ?, 'admin_route', ?, ?, ?)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(`${operator.requestId}:${outcome}`, operator.email, operator.role, action, targetId, operator.requestId, outcome).run();
}

async function recordAdminAuditWithRetry(
  db: D1Database,
  operator: InternalOperator,
  action: string,
  targetId: string | null,
  outcome: "allowed" | "succeeded" | "failed",
): Promise<void> {
  try {
    await recordAdminAudit(db, operator, action, targetId, outcome);
  } catch {
    await recordAdminAudit(db, operator, action, targetId, outcome);
  }
}

// ============================================================
// Cron audit
// ============================================================
async function cronRunStart(env: Env, cron: string): Promise<number> {
  const { meta } = await env.DB.prepare(
    "INSERT INTO cron_runs (cron_expression, status) VALUES (?, 'running')"
  ).bind(cron).run();
  return meta.last_row_id;
}

async function cronRunComplete(env: Env, runId: number, status: string, error?: string, summary?: IngestSummary) {
  const detail = summary
    ? `${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.created} items accepted, ${summary.duplicates} duplicates, ${summary.tooOld} too old, ${summary.filtered} filtered, ${summary.malformed} malformed, ${summary.rejected} rejected, ${summary.skipped} unsupported, ${summary.candidatesCreated} candidates created, ${summary.candidatesLinked} linked.`
    : null;
  await env.DB.prepare(
    `UPDATE cron_runs SET completed_at = datetime('now'), status = ?, error_message = ?,
       items_processed = ?, items_failed = ?, items_rejected = ?, items_skipped = ?, outcome_detail = ? WHERE id = ?`
  ).bind(
    status,
    error || null,
    summary?.processed ?? 0,
    summary?.failed ?? 0,
    summary?.rejected ?? 0,
    summary?.skipped ?? 0,
    detail,
    runId,
  ).run();
}

// ============================================================
// Tier-based ingestion
// ============================================================
const SUPPORTED_CONNECTORS = new Set(["rss", "github_api", "arxiv_api", "hackernews_api", "page_diff"]);

interface IngestSummary {
  processed: number; created: number; succeeded: number; failed: number; rejected: number; skipped: number;
  duplicates: number; tooOld: number; filtered: number; malformed: number;
  candidatesCreated: number; candidatesLinked: number;
}

interface SourceOutcome {
  resultStatus: string;
  processed: number; created: number; rejected: number; skipped: number;
  duplicates: number; tooOld: number; filtered: number; malformed: number;
  candidatesCreated: number; candidatesLinked: number;
}

async function ingestTier(env: Env, _ctx: ExecutionContext, tier: string, jobType: string): Promise<IngestSummary> {
  const { results: sources } = await env.DB.prepare(
    "SELECT * FROM sources WHERE tier = ? AND active = 1 AND (last_fetched_at IS NULL OR datetime(last_fetched_at, '+' || cadence_minutes || ' minutes') <= datetime('now'))"
  ).bind(tier).all<Source>();

  if (!sources || sources.length === 0) {
    console.log(`No sources to fetch for tier ${tier}`);
    return { processed: 0, created: 0, succeeded: 0, failed: 0, rejected: 0, skipped: 0, duplicates: 0, tooOld: 0, filtered: 0, malformed: 0, candidatesCreated: 0, candidatesLinked: 0 };
  }

  // Separate supported and unsupported sources
  const supported: Source[] = [];
  const unsupportedCount = { skipped: 0 };
  for (const source of sources) {
    if (SUPPORTED_CONNECTORS.has(source.ingestion_type)) {
      supported.push(source);
    } else {
      // Mark unsupported sources as degraded without running a job
      await env.DB.prepare(
        "UPDATE sources SET health_status = 'degraded', last_fetched_at = datetime('now'), last_error_at = datetime('now'), last_error_message = ? WHERE id = ?"
      ).bind(`Unsupported connector type: ${source.ingestion_type}. Source is scheduled but has no implemented fetcher.`, source.id).run();
      console.warn(`Skipping source ${source.id} (${source.name}): connector type ${source.ingestion_type} is not implemented`);
      unsupportedCount.skipped++;
    }
  }

  console.log(`Ingesting ${supported.length} supported sources for tier ${tier} (${unsupportedCount.skipped} unsupported skipped)`);

  const outcomes: SourceOutcome[] = [];
  for (let index = 0; index < supported.length; index += 4) {
    outcomes.push(...await Promise.all(supported.slice(index, index + 4).map((source) => processSource(env, source, jobType))));
  }
  return {
    processed: outcomes.reduce((sum, item) => sum + item.processed, 0),
    created: outcomes.reduce((sum, item) => sum + item.created, 0),
    succeeded: outcomes.filter((item) => item.resultStatus.startsWith("succeeded")).length,
    failed: outcomes.filter((item) => item.resultStatus === "failed").length,
    rejected: outcomes.reduce((sum, item) => sum + item.rejected, 0),
    skipped: outcomes.reduce((sum, item) => sum + item.skipped, 0) + unsupportedCount.skipped,
    duplicates: outcomes.reduce((sum, item) => sum + item.duplicates, 0),
    tooOld: outcomes.reduce((sum, item) => sum + item.tooOld, 0),
    filtered: outcomes.reduce((sum, item) => sum + item.filtered, 0),
    malformed: outcomes.reduce((sum, item) => sum + item.malformed, 0),
    candidatesCreated: outcomes.reduce((sum, item) => sum + item.candidatesCreated, 0),
    candidatesLinked: outcomes.reduce((sum, item) => sum + item.candidatesLinked, 0),
  };
}

function eligibleFeedItem(item: FetchedFeedItem, rawMetadata: string): { ok: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(item.url);
  } catch {
    return { ok: false, reason: "invalid_url_parse" };
  }
  const host = url.hostname.toLowerCase();
  const private172 = host.match(/^172\.(\d{1,3})\./);
  const publicUrl = (url.protocol === "https:" || url.protocol === "http:")
    && !url.username && !url.password && item.url.length <= 2_048
    && !host.includes(":") && host !== "localhost" && !host.endsWith(".local")
    && !/^(127\.|10\.|169\.254\.|192\.168\.|0\.)/.test(host)
    && !(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  if (!publicUrl) return { ok: false, reason: "non_public_url" };
  if (typeof item.title !== "string" || item.title.trim().length < 1) return { ok: false, reason: "missing_title" };
  if (item.title.length > 500) return { ok: false, reason: "title_too_long" };
  if (item.external_id !== null && (typeof item.external_id !== "string" || item.external_id.length > 500)) return { ok: false, reason: "invalid_external_id" };
  if (item.summary !== null && (typeof item.summary !== "string" || item.summary.length > 4_000)) return { ok: false, reason: "summary_too_long" };
  if (item.content_excerpt !== null && (typeof item.content_excerpt !== "string" || item.content_excerpt.length > 4_000)) return { ok: false, reason: "excerpt_too_long" };
  if (item.author !== null && (typeof item.author !== "string" || item.author.length > 500)) return { ok: false, reason: "author_too_long" };
  if (item.published_at !== null && (typeof item.published_at !== "string" || item.published_at.length > 50 || Number.isNaN(Date.parse(item.published_at)))) return { ok: false, reason: "invalid_published_date" };
  if (rawMetadata.length > 32_000) return { ok: false, reason: "metadata_too_large" };
  return { ok: true };
}

// Items older than this are counted as "too old" rather than candidates
const MAX_ITEM_AGE_DAYS = 30;

function isTooOld(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  try {
    const pubDate = new Date(publishedAt).getTime();
    if (Number.isNaN(pubDate)) return false;
    return (Date.now() - pubDate) > MAX_ITEM_AGE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isProbablyIrrelevant(title: string, summary: string | null): boolean {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  // Reject items that are clearly not AI/tech news (spam, unrelated topics)
  const spamPatterns = [
    /\b(casino|gambling|poker|slots|betting)\b/i,
    /\b(weight loss|diet pill|miracle cure)\b/i,
    /\b(earn \$\d+|make money online|get rich quick)\b/i,
    /\b(viagra|cialis|pharmacy)\b/i,
    /\b(seo services|buy backlinks|link building)\b/i,
    /\b(nft drop|token presale|crypto airdrop)\b/i,
  ];
  return spamPatterns.some((p) => p.test(text));
}

async function processSource(env: Env, source: Source, jobType: string): Promise<SourceOutcome> {
  const jobId = await createJob(env, source.id, jobType);

  const outcome: SourceOutcome = {
    resultStatus: "failed", processed: 0, created: 0, rejected: 0, skipped: 0,
    duplicates: 0, tooOld: 0, filtered: 0, malformed: 0,
    candidatesCreated: 0, candidatesLinked: 0,
  };

  try {
    let items: FetchedFeedItem[] = [];
    const fetchMeta: Record<string, unknown> = { connector: source.ingestion_type };

    switch (source.ingestion_type) {
      case "rss":
        items = await fetchRSS(source);
        break;
      case "github_api":
        items = await fetchGitHubReleases(source, env.GITHUB_TOKEN);
        break;
      case "arxiv_api":
        items = await fetchArxivPapers(source);
        break;
      case "hackernews_api":
        items = await fetchHackerNews(source);
        break;
      case "huggingface_api":
        items = await fetchHuggingFaceModels(source);
        break;
      case "lmsys_api":
        items = await fetchLMSYSArena(source);
        break;
      case "page_diff":
        items = await fetchPageDiff(source.id, source.url);
        break;
      default:
        // Should be filtered by ingestTier, but guard anyway
        const unsupportedMsg = `Connector ${source.ingestion_type} is not implemented.`;
        await env.DB.prepare(
          "UPDATE sources SET health_status = 'degraded', last_fetched_at = datetime('now'), last_error_at = datetime('now'), last_error_message = ? WHERE id = ?"
        ).bind(unsupportedMsg, source.id).run();
        await completeJob(env, jobId, "completed", 0, 0, undefined, "unsupported", 0, 0, 0, 0, 0, 0, 1, `Connector ${source.ingestion_type} is not implemented.`);
        outcome.resultStatus = "unsupported";
        outcome.skipped = 1;
        return outcome;
    }

    outcome.processed = items.length;
    fetchMeta.items_discovered = items.length;

    // Deduplicate against existing items and apply filtering
    for (const item of items) {
      const rawMetadata = JSON.stringify({ ...item.raw_metadata, fetch_meta: fetchMeta });
      const eligibility = eligibleFeedItem(item, rawMetadata);
      if (!eligibility.ok) {
        outcome.malformed++;
        continue;
      }

      // Age check — count separately, don't just skip
      if (isTooOld(item.published_at)) {
        outcome.tooOld++;
        continue;
      }

      // Content relevance check
      if (isProbablyIrrelevant(item.title, item.summary)) {
        outcome.filtered++;
        continue;
      }

      const urlHash = await hashURL(item.url);
      const isDup = await deduplicateURL(env.DB, urlHash);

      if (isDup) {
        outcome.duplicates++;
        const existing = await env.DB.prepare(
          "SELECT id, source_id, url FROM feed_items WHERE url_hash = ? LIMIT 1"
        ).bind(urlHash).first<{ id: number; source_id: number; url: string }>();
        if (existing) {
          try {
            await admitAndQueueFeedCapture(env, {
              feedItemId: existing.id, sourceId: existing.source_id, url: existing.url,
            });
          } catch (error) {
            console.warn(JSON.stringify({ stage: "knowledge_capture_admission", feedItemId: existing.id, error: error instanceof Error ? error.message : "unknown" }));
          }
        }
        // Try to link to existing candidate
        const linked = await linkItemToExistingCandidate(env, urlHash);
        if (linked) outcome.candidatesLinked++;
        continue;
      }

      // Persist the new item
      const insertedFeedItem = await env.DB.prepare(
        `INSERT INTO feed_items (source_id, external_id, url, url_hash, title, summary, content_excerpt, author, published_at, fetched_at, raw_metadata, ingestion_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'raw')`
      ).bind(
        source.id, item.external_id, item.url, urlHash, item.title,
        item.summary, item.content_excerpt, item.author,
        item.published_at, rawMetadata
      ).run();
      outcome.created++;

      const feedItemId = Number(insertedFeedItem.meta.last_row_id ?? 0);
      if (feedItemId > 0) {
        try {
          await admitAndQueueFeedCapture(env, { feedItemId, sourceId: source.id, url: item.url });
        } catch (error) {
          console.warn(JSON.stringify({ stage: "knowledge_capture_admission", feedItemId, error: error instanceof Error ? error.message : "unknown" }));
        }
      }

      // Create or link story candidate from accepted item
      const candidateResult = await createCandidateFromItem(env, {
        url: item.url,
        urlHash,
        title: item.title,
        summary: item.summary,
        publishedAt: item.published_at,
        sourceId: source.id,
        sourceName: source.name,
      });
      if (candidateResult === "created") outcome.candidatesCreated++;
      else if (candidateResult === "linked") outcome.candidatesLinked++;
    }

    // Update source health — success
    await env.DB.prepare(
      "UPDATE sources SET last_fetched_at = datetime('now'), last_success_at = datetime('now'), last_error_at = NULL, last_error_message = NULL, consecutive_failures = 0, health_status = 'healthy' WHERE id = ?"
    ).bind(source.id).run();

    const resultStatus = outcome.created === 0 && outcome.processed > 0
      ? (outcome.duplicates > 0 ? "succeeded_duplicates_only" : "succeeded_zero_accepted")
      : outcome.rejected > 0 || outcome.malformed > 0 || outcome.tooOld > 0 || outcome.filtered > 0
        ? "succeeded_with_rejections"
        : "succeeded";

    const detail = buildOutcomeDetail(outcome, items.length);

    await completeJob(
      env, jobId, "completed", items.length, outcome.created, undefined, resultStatus,
      outcome.malformed, outcome.duplicates, outcome.tooOld, outcome.filtered,
      outcome.candidatesCreated, outcome.candidatesLinked,
      0, detail,
    );
    outcome.resultStatus = resultStatus;
    console.log(`Source ${source.name}: ${outcome.created} new, ${outcome.duplicates} dup, ${outcome.malformed} malformed, ${outcome.tooOld} old, ${outcome.filtered} filtered, ${outcome.candidatesCreated} candidates`);
    return outcome;
  } catch (error: any) {
    const errorDetail = captureFetchError(error, source);
    console.error(JSON.stringify({
      message: "Source processing failed",
      sourceId: source.id,
      sourceName: source.name,
      connector: source.ingestion_type,
      error: errorDetail,
    }));

    await env.DB.prepare(
      "UPDATE sources SET last_fetched_at = datetime('now'), last_error_at = datetime('now'), last_error_message = ?, consecutive_failures = consecutive_failures + 1, health_status = CASE WHEN consecutive_failures + 1 >= 3 THEN 'failing' ELSE 'degraded' END WHERE id = ?"
    ).bind(JSON.stringify(errorDetail), source.id).run();

    await completeJob(
      env, jobId, "failed", 0, 0, undefined, "failed",
      0, 0, 0, 0, 0, 0, 0,
      `${errorDetail.stage ?? "fetch"}: ${errorDetail.message ?? "Unknown error"}`,
    );
    outcome.resultStatus = "failed";
    return outcome;
  }
}

/**
 * Capture structured error detail from a fetch/parse failure.
 */
function captureFetchError(error: unknown, source: Source): Record<string, unknown> {
  const message = error instanceof Error ? error.message : "Unknown processing error";
  const detail: Record<string, unknown> = {
    sourceId: source.id,
    sourceName: source.name,
    connector: source.ingestion_type,
    message: message.slice(0, 500),
    retryable: true,
  };

  // Parse HTTP status from error message
  const httpMatch = message.match(/HTTP\s+(\d{3})/i);
  if (httpMatch) {
    detail.httpStatus = parseInt(httpMatch[1]);
    detail.retryable = ![400, 401, 403, 404, 410].includes(detail.httpStatus as number);
  }

  // Detect timeout
  if (/timeout|timed out/i.test(message)) {
    detail.stage = "fetch";
    detail.timeout = true;
    detail.retryable = true;
  }

  // Detect redirect issues
  if (/redirect/i.test(message)) {
    detail.stage = "redirect";
    detail.retryable = false;
  }

  // Detect content type issues
  if (/content.type/i.test(message)) {
    detail.stage = "content_type_validation";
    detail.retryable = false;
  }

  // Detect parsing errors
  if (/parse|xml|malformed|syntax/i.test(message)) {
    detail.stage = detail.stage ?? "parse";
  }

  // Detect rate limiting
  if (/rate.limit|429|too many requests/i.test(message)) {
    detail.httpStatus = 429;
    detail.stage = "fetch";
    detail.rateLimited = true;
    detail.retryable = true;
  }

  // Detect size issues
  if (/exceeds.*limit|too large/i.test(message)) {
    detail.stage = "response_size";
    detail.retryable = false;
  }

  if (!detail.stage) detail.stage = "fetch";

  // Sanitise: never store secrets
  const safe = redactError(error);
  detail.sanitisedMessage = safe;

  return detail;
}

function buildOutcomeDetail(outcome: SourceOutcome, discovered: number): string {
  const parts: string[] = [];
  if (outcome.created > 0) parts.push(`${outcome.created} accepted`);
  if (outcome.duplicates > 0) parts.push(`${outcome.duplicates} duplicates`);
  if (outcome.tooOld > 0) parts.push(`${outcome.tooOld} too old`);
  if (outcome.filtered > 0) parts.push(`${outcome.filtered} filtered irrelevant`);
  if (outcome.malformed > 0) parts.push(`${outcome.malformed} malformed`);
  if (outcome.candidatesCreated > 0) parts.push(`${outcome.candidatesCreated} candidates created`);
  if (outcome.candidatesLinked > 0) parts.push(`${outcome.candidatesLinked} linked to existing`);
  if (parts.length === 0) parts.push(`${discovered} discovered, 0 accepted`);
  return parts.join("; ");
}

/**
 * Try to link a duplicate URL to an existing story candidate.
 */
async function linkItemToExistingCandidate(env: Env, urlHash: string): Promise<boolean> {
  try {
    const existing = await env.DB.prepare(
      "SELECT id, ingestion_status FROM feed_items WHERE url_hash = ? LIMIT 1"
    ).bind(urlHash).first<{ id: number; ingestion_status: string }>();
    if (!existing) return false;

    // Check if already linked to a candidate
    const linked = await env.DB.prepare(
      "SELECT 1 FROM story_cluster_members WHERE feed_item_id = ? LIMIT 1"
    ).bind(existing.id).first();
    return !!linked;
  } catch {
    return false;
  }
}

/**
 * Create a story candidate from an accepted feed item, or link to an existing one.
 */
async function createCandidateFromItem(
  env: Env,
  item: { url: string; urlHash: string; title: string; summary: string | null; publishedAt: string | null; sourceId: number; sourceName: string },
): Promise<"created" | "linked" | "none"> {
  try {
    // Check if this URL is already in a cluster
    const existingItem = await env.DB.prepare(
      `SELECT fi.id FROM feed_items fi
       JOIN story_cluster_members scm ON fi.id = scm.feed_item_id
       WHERE fi.url_hash = ? LIMIT 1`
    ).bind(item.urlHash).first<{ id: number }>();

    if (existingItem) return "linked";

    // Check for an existing open candidate with a similar title
    const similarCandidate = await findSimilarOpenCandidate(env, item.title, item.url);

    if (similarCandidate) {
      // Link to existing candidate
      await env.DB.prepare(
        "UPDATE editorial_candidates SET updated_at = datetime('now') WHERE id = ?"
      ).bind(similarCandidate).run();
      return "linked";
    }

    // Create a new editorial candidate for this item
    const candidateId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO editorial_candidates
        (id, intake_type, submitted_url, lead_text, source_hash, state, section_slug, urgency, development_status, created_by)
      VALUES (?, 'manual_url', ?, ?, ?, 'new', 'ai-agents', 'normal', 'developing', 'auto-ingestion')
    `).bind(
      candidateId,
      item.url,
      item.summary ?? item.title,
      item.urlHash,
    ).run();

    return "created";
  } catch {
    return "none";
  }
}

/**
 * Find an existing open editorial candidate with a similar title or URL.
 */
async function findSimilarOpenCandidate(env: Env, title: string, url: string): Promise<string | null> {
  try {
    // Check by URL first
    const urlHash = await hashURL(url);
    const byUrl = await env.DB.prepare(
      "SELECT id FROM editorial_candidates WHERE source_hash = ? AND state NOT IN ('published','archived','rejected') LIMIT 1"
    ).bind(urlHash).first<{ id: string }>();
    if (byUrl) return byUrl.id;

    // Check by title keyword similarity — simple shared-word heuristic
    const titleWords = new Set(
      title.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 3)
    );
    if (titleWords.size < 3) return null;

    const recent = await env.DB.prepare(
      "SELECT id, lead_text FROM editorial_candidates WHERE state NOT IN ('published','archived','rejected') AND created_at >= datetime('now', '-3 days') LIMIT 30"
    ).all<{ id: string; lead_text: string | null }>();
    if (!recent.results) return null;

    for (const row of recent.results) {
      const candidateWords = new Set(
        (row.lead_text ?? "").toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter((w) => w.length > 3)
      );
      const intersection = [...titleWords].filter((w) => candidateWords.has(w));
      if (intersection.length >= 3) return row.id;
    }
    return null;
  } catch {
    return null;
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

async function completeJob(
  env: Env,
  jobId: number,
  status: string,
  processed: number,
  created: number,
  error?: string,
  resultStatus = status === "failed" ? "failed" : "succeeded",
  rejected = 0,
  duplicates = 0,
  tooOld = 0,
  filtered = 0,
  candidatesCreated = 0,
  candidatesLinked = 0,
  skipped = 0,
  detail?: string,
) {
  // Store all nuanced counters in outcome_detail since the table schema
  // only has items_processed, items_created, items_rejected, items_skipped.
  const fullDetail = detail || [
    created > 0 ? `${created} accepted` : null,
    duplicates > 0 ? `${duplicates} duplicates` : null,
    tooOld > 0 ? `${tooOld} too old` : null,
    filtered > 0 ? `${filtered} filtered` : null,
    rejected > 0 ? `${rejected} malformed` : null,
    candidatesCreated > 0 ? `${candidatesCreated} candidates created` : null,
    candidatesLinked > 0 ? `${candidatesLinked} linked` : null,
    skipped > 0 ? `${skipped} unsupported` : null,
    created === 0 && duplicates === 0 ? "0 accepted" : null,
  ].filter(Boolean).join("; ");

  await env.DB.prepare(
    `UPDATE ingestion_jobs SET status = ?, items_processed = ?, items_created = ?, error_message = ?,
       result_status = ?, items_rejected = ?, items_skipped = ?, outcome_detail = ?, completed_at = datetime('now')
     WHERE id = ?`
  ).bind(status, processed, created, error || null, resultStatus, rejected, skipped, fullDetail || null, jobId).run();
}

function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown processing error";
  return message
    .replace(/https?:\/\/[^\s/@:]+:[^\s/@]+@/gi, "https://[REDACTED]@")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9]+/gi, "[REDACTED]")
    .replace(/(api[_-]?key|token|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 500);
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
// Evidence upgrade pipeline (runs after clustering)
// Disabled until claim-level provenance and reviewed assertions exist.
// ============================================================
async function runEvidenceUpgradePipeline(env: Env) {
  console.log("Evidence upgrade: skipped — claim-level provenance is not implemented");
  const results = await upgradeClusterEvidence(env.DB);
  if (results.length > 0) {
    for (const r of results) {
      console.log(`Evidence upgrade: cluster #${r.clusterId} "${r.title.slice(0, 60)}" ${r.previousStatus} → ${r.newStatus} (${r.tierA}A ${r.tierB}B ${r.tierC}C, ${r.sourceCount} sources)`);
    }
  }
  console.log(`Evidence upgrade: done — ${results.length} cluster(s) upgraded`);
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
async function handleAdminRoute(
  path: string,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  operator: InternalOperator,
): Promise<Response> {
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
      return handleRecordCorrection(request, env, operator);
    case "/admin/seed-models":
      return handleSeedModelData(env);
    case "/admin/extract-model-data":
      return handleModelDataExtraction(env);
    case "/admin/knowledge/capture-url":
      return handleManualKnowledgeCapture(request, env, operator);
    case "/admin/publish-story":
      return handlePublishStory(request, env, operator);
    case "/admin/withdraw-story":
      return handleWithdrawStory(request, env);
    case "/admin/publish-briefing":
      return handlePublishBriefing(request, env, operator);
    case "/admin/published-stories":
      return handlePublishedStoriesList(request, env);
    case "/admin/clusters":
      return handleClustersList(request, env);
    case "/admin/cluster-sources":
      return handleClusterSources(request, env);
    case "/admin/archive-cluster":
      return handleArchiveCluster(request, env);
    case "/admin/related-items":
      return request.method === "GET"
        ? handleRelatedItems(request, env)
        : handleRelatedItemReview(request, env, operator);
    case "/admin/candidates":
      return request.method === "GET"
        ? handleCandidateList(env)
        : handleCandidateIntake(request, env, operator);
    case "/admin/social-signals":
      return request.method === "GET"
        ? handleSocialSignalList(env)
        : handleSocialSignalIntake(request, env, operator);
    default:
      return Response.json({ error: "Not found" }, { status: 404 });
  }
}

// ============================================================
// Admin API handlers
// ============================================================
async function readAdminObject(request: Request, allowedKeys: readonly string[]): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return Object.keys(record).every((key) => allowedKeys.includes(key)) ? record : null;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function optionalText(value: unknown, maximum: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length <= maximum);
}

function requiredText(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function optionalHttpUrl(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function supportedIntakeType(value: unknown): value is "manual_url" | "social_url" | "lead" | "additional_evidence" {
  return value === "manual_url" || value === "social_url" || value === "lead" || value === "additional_evidence";
}

function supportedUrgency(value: unknown): boolean {
  return value === undefined || value === "low" || value === "normal" || value === "high" || value === "breaking";
}

function supportedDevelopmentStatus(value: unknown): boolean {
  return value === undefined || value === "developing" || value === "current" || value === "historical";
}

async function handleCandidateIntake(request: Request, env: Env, operator: InternalOperator): Promise<Response> {
  const body = await readAdminObject(request, [
    "intakeType", "url", "lead", "section", "topic", "storyFormat", "urgency", "developmentStatus", "sourceLanguage",
  ]);
  if (!body || !supportedIntakeType(body.intakeType)) {
    return Response.json({ error: "A supported intakeType is required." }, { status: 400 });
  }
  if (!optionalHttpUrl(body.url) || !optionalText(body.lead, 8_000) || !optionalText(body.section, 80)
    || !optionalText(body.topic, 80) || !optionalText(body.storyFormat, 80) || !optionalText(body.sourceLanguage, 35)
    || !supportedUrgency(body.urgency) || !supportedDevelopmentStatus(body.developmentStatus)) {
    return Response.json({ error: "Candidate fields are invalid." }, { status: 400 });
  }

  const intakeType = body.intakeType;
  const submittedUrl = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
  const leadText = typeof body.lead === "string" && body.lead.trim() ? body.lead.trim() : null;
  if ((intakeType === "manual_url" || intakeType === "social_url" || intakeType === "additional_evidence") && !submittedUrl) {
    return Response.json({ error: "This intake type requires an HTTPS or HTTP URL." }, { status: 400 });
  }
  if (intakeType === "lead" && !leadText) return Response.json({ error: "A lead requires text." }, { status: 400 });
  if (!submittedUrl && !leadText) return Response.json({ error: "Provide a URL or lead text." }, { status: 400 });

  const section = typeof body.section === "string" && body.section.trim() ? body.section.trim() : null;
  const topic = typeof body.topic === "string" && body.topic.trim() ? body.topic.trim() : null;
  if (section) {
    const found = await env.DB.prepare("SELECT 1 FROM editorial_sections WHERE slug = ?").bind(section).first();
    if (!found) return Response.json({ error: "Unknown editorial section." }, { status: 400 });
  }
  if (topic) {
    const found = await env.DB.prepare("SELECT 1 FROM editorial_topics WHERE slug = ?").bind(topic).first();
    if (!found) return Response.json({ error: "Unknown editorial topic." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const sourceHash = await hashValue(`${intakeType}\n${submittedUrl ?? ""}\n${leadText ?? ""}`);
  try {
    await env.DB.prepare(`
      INSERT INTO editorial_candidates
        (id, intake_type, submitted_url, lead_text, source_hash, section_slug, topic_slug, story_format, urgency, development_status, source_language, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, intakeType, submittedUrl, leadText, sourceHash, section, topic,
      typeof body.storyFormat === "string" && body.storyFormat.trim() ? body.storyFormat.trim() : null,
      typeof body.urgency === "string" ? body.urgency : "normal",
      typeof body.developmentStatus === "string" ? body.developmentStatus : "developing",
      typeof body.sourceLanguage === "string" && body.sourceLanguage.trim() ? body.sourceLanguage.trim() : null,
      operator.email,
    ).run();
  } catch {
    return Response.json({ error: "TRACE Desk is unavailable until its migration is applied." }, { status: 503 });
  }
  return Response.json({ id, state: "new", message: "Candidate recorded. It has not been fetched, researched, or published." }, { status: 201 });
}

async function handleCandidateList(env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, intake_type, submitted_url, lead_text, state, section_slug, topic_slug, urgency,
             development_status, source_language, created_by, created_at, updated_at
      FROM editorial_candidates
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    return Response.json(results ?? []);
  } catch {
    return Response.json({ error: "TRACE Desk is unavailable until its migration is applied." }, { status: 503 });
  }
}

// ============================================================
// ADR 0009 — Social signal intake (manual, governed)
// ============================================================

const SOCIAL_PLATFORMS = ["reddit","x","bluesky","mastodon","linkedin","youtube","github-discussion","forum","other-approved"] as const;

async function handleSocialSignalIntake(request: Request, env: Env, operator: InternalOperator): Promise<Response> {
  const body = await readAdminObject(request, [
    "platform", "url", "reason", "authorDisplayName", "authorHandle", "notes",
  ]);
  if (!body) return Response.json({ error: "Invalid request body." }, { status: 400 });

  const platform = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const authorDisplayName = typeof body.authorDisplayName === "string" ? body.authorDisplayName.trim().slice(0, 200) : null;
  const authorHandle = typeof body.authorHandle === "string" ? body.authorHandle.trim().slice(0, 200) : null;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";

  if (!SOCIAL_PLATFORMS.includes(platform as typeof SOCIAL_PLATFORMS[number])) {
    return Response.json({ error: `Platform must be one of: ${SOCIAL_PLATFORMS.join(", ")}.` }, { status: 400 });
  }
  if (!url || url.length > 2048) {
    return Response.json({ error: "A valid URL is required (max 2048 characters)." }, { status: 400 });
  }
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      return Response.json({ error: "URL must be a public HTTP/HTTPS address." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "URL is not valid." }, { status: 400 });
  }
  if (!reason || reason.length < 10 || reason.length > 1000) {
    return Response.json({ error: "A submission reason is required (10–1000 characters)." }, { status: 400 });
  }

  const canonical = url;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const canonicalUrlHash = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");

  try {
    await env.DB.prepare(`
      INSERT INTO social_signals
        (platform, canonical_url, canonical_url_hash, submitted_by, submission_reason,
         author_display_name, author_handle, reviewer_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(platform, canonical, canonicalUrlHash, operator.email, reason,
            authorDisplayName, authorHandle, notes).run();
    return Response.json(
      { message: "Social signal recorded. Awaiting reviewer evaluation." },
      { status: 201 },
    );
  } catch (e: any) {
    if (e?.message?.includes?.("UNIQUE constraint")) {
      return Response.json({ error: "This URL has already been submitted as a social signal." }, { status: 409 });
    }
    return Response.json({ error: "Social-signal intake is unavailable." }, { status: 503 });
  }
}

async function handleSocialSignalList(env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, platform, canonical_url, submitted_by, submitted_at, submission_reason,
             author_display_name, author_handle, reviewer_notes, evidence_status,
             corroboration_status, link_status, review_status, reviewed_by, reviewed_at,
             created_at
      FROM social_signals
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    return Response.json(results ?? []);
  } catch {
    return Response.json({ error: "Social signals are unavailable until its migration is applied." }, { status: 503 });
  }
}

async function handleManualIngest(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const body = await readAdminObject(request, ["sourceId"]);
  if (!body || (body.sourceId !== undefined && !positiveInteger(body.sourceId))) {
    return Response.json({ error: "Body must contain only an optional positive sourceId." }, { status: 400 });
  }
  const sourceId = body.sourceId as number | undefined;

  if (sourceId) {
    const source = await env.DB.prepare("SELECT * FROM sources WHERE id = ?").bind(sourceId).first<Source>();
    if (source) {
      const outcome = await processSource(env, source, "fetch");
      const status = outcome.resultStatus === "succeeded" ? 200
        : outcome.resultStatus === "succeeded_with_rejections" ? 207
        : outcome.resultStatus === "unsupported" ? 422 : 502;
      return Response.json({ status: outcome.resultStatus, source: source.name, outcome }, { status });
    }
    return Response.json({ error: "Source not found" }, { status: 404 });
  }

  // Ingest all due sources across all tiers
  const tierA = await ingestTier(env, _ctx, "A", "fetch");
  const tierB = await ingestTier(env, _ctx, "B", "fetch");
  const failed = tierA.failed + tierB.failed;
  const rejected = tierA.rejected + tierB.rejected;
  const skipped = tierA.skipped + tierB.skipped;
  return Response.json(
    {
      status: failed ? "partial_failure"
        : skipped ? "completed_with_unsupported"
        : rejected ? "completed_with_rejections"
        : "completed",
      tiers: { A: tierA, B: tierB },
    },
    { status: failed || skipped || rejected ? 207 : 200 },
  );
}

async function handleManualKnowledgeCapture(request: Request, env: Env, operator: InternalOperator): Promise<Response> {
  const body = await readAdminObject(request, ["url", "storageMode"]);
  if (!body || !requiredText(body.url, 1, 2_048) || !optionalHttpUrl(body.url)) {
    return Response.json({ error: "A public HTTP(S) URL is required." }, { status: 400 });
  }
  const storageMode = body.storageMode === undefined ? "private_full_text" : body.storageMode;
  if (storageMode !== "private_full_text" && storageMode !== "editor_supplied_document") {
    return Response.json({ error: "storageMode must be private_full_text or editor_supplied_document." }, { status: 400 });
  }
  const result = await admitAndQueueManualCapture(env, {
    url: body.url,
    copyrightStorageMode: storageMode,
    correlationId: `manual-${operator.requestId}`,
  });
  if (result.reason === "queue_unbound") {
    return Response.json({ error: "Knowledge capture Queue is not enabled for this environment." }, { status: 503 });
  }
  if (result.reason === "queue_send_failed") {
    return Response.json({ error: "Knowledge capture was admitted but could not be queued for processing." }, { status: 503 });
  }
  return Response.json({
    status: result.reason === "queued" ? "queued" : "already_queued",
    sourceDocumentId: result.sourceDocumentId,
    jobId: result.jobId,
  }, { status: 202 });
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

async function handleRecordCorrection(request: Request, env: Env, operator: InternalOperator): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed — use POST" }, { status: 405 });
  }

  const body = await readAdminObject(request, [
    "clusterId", "claimId", "correctionType", "previousStatement", "updatedStatement", "reason",
    "evidenceUrl", "impact", "previousEvidenceStatus", "updatedEvidenceStatus",
  ]) as any;
  if (!body) return Response.json({ error: "Invalid correction body." }, { status: 400 });

  const correctionTypes = new Set([
    "factual_error", "rating_change", "licence_correction", "pricing_correction",
    "benchmark_correction", "supersession", "deprecation", "methodology_update", "other",
  ]);
  const evidenceStatuses = new Set([
    "confirmed", "strongly_supported", "provisionally_supported", "vendor_reported",
    "community_reported", "disputed", "unverified", "corrected", "superseded", "outdated",
  ]);
  const hasCluster = positiveInteger(body.clusterId);
  const hasClaim = positiveInteger(body.claimId);
  const optionalEvidenceStatus = (value: unknown) => value === undefined || value === null
    || (typeof value === "string" && evidenceStatuses.has(value));
  if (
    hasCluster === hasClaim
    || (body.clusterId !== undefined && !hasCluster)
    || (body.claimId !== undefined && !hasClaim)
    || typeof body.correctionType !== "string" || !correctionTypes.has(body.correctionType)
    || !requiredText(body.previousStatement, 1, 8_000)
    || !requiredText(body.updatedStatement, 1, 8_000)
    || !requiredText(body.reason, 3, 2_000)
    || !optionalText(body.impact, 2_000)
    || !optionalHttpUrl(body.evidenceUrl)
    || !optionalEvidenceStatus(body.previousEvidenceStatus)
    || !optionalEvidenceStatus(body.updatedEvidenceStatus)
  ) return Response.json({ error: "Correction fields are invalid, unbounded, or target more than one record." }, { status: 400 });
  body.correctedBy = operator.email;

  const validationError = validateCorrectionInput(body);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  try {
    if (hasCluster) {
      const result = await recordClusterCorrection(env.DB, body);
      return Response.json({ status: "ok", ...result });
    } else if (hasClaim) {
      const result = await recordClaimCorrection(env.DB, body);
      return Response.json({ status: "ok", ...result });
    }
    return Response.json({ error: "clusterId or claimId required" }, { status: 400 });
  } catch (err: any) {
    console.error(JSON.stringify({
      message: "Correction recording failed",
      operator: operator.email,
      error: redactError(err),
    }));
    const targetNotPublished = err instanceof Error && err.message.startsWith("Corrections may only be recorded against");
    return Response.json(
      { error: targetNotPublished ? "The correction target is not an eligible published record." : "Correction recording failed." },
      { status: targetNotPublished ? 409 : 500 },
    );
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

async function handlePublishStory(request: Request, env: Env, operator: InternalOperator): Promise<Response> {
  const body = await readAdminObject(request, [
    "clusterId", "headline", "summary", "editorialAnalysis", "whyItMatters", "headlineImageUrl",
  ]);

  if (!body || !positiveInteger(body.clusterId)
    || !optionalText(body.headline, 200) || !optionalText(body.summary, 2_000)
    || !optionalText(body.editorialAnalysis, 8_000) || !optionalText(body.whyItMatters, 1_000)
    || !optionalText(body.headlineImageUrl, 2_048)) {
    return Response.json({ error: "Invalid or unexpected publication field." }, { status: 400 });
  }
  if (!body.clusterId) {
    return Response.json({ error: "clusterId is required" }, { status: 400 });
  }
  if (typeof body.summary !== "string" || body.summary.trim().length < 20) {
    return Response.json({ error: "summary is required (min 20 characters)" }, { status: 400 });
  }

  const result = await publishStory(env, {
    clusterId: body.clusterId as number,
    headline: body.headline as string | undefined,
    summary: body.summary,
    editorialAnalysis: body.editorialAnalysis as string | undefined,
    whyItMatters: body.whyItMatters as string | undefined,
    headlineImageUrl: body.headlineImageUrl as string | undefined,
    reviewedBy: "Admin",
  });

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok", story: result.story });
}

async function handleWithdrawStory(request: Request, env: Env): Promise<Response> {
  const body = await readAdminObject(request, ["clusterId", "status", "reason"]);

  if (!body || !positiveInteger(body.clusterId) || !["withdrawn", "superseded"].includes(String(body.status))
    || !optionalText(body.reason, 1_000)) {
    return Response.json({ error: "A valid clusterId, status, and bounded reason are required." }, { status: 400 });
  }
  if (!body.clusterId) {
    return Response.json({ error: "clusterId is required" }, { status: 400 });
  }

  const newStatus = body.status === "superseded" ? "superseded" : "withdrawn";
  const result = await updateStoryStatus(env, body.clusterId as number, newStatus, body.reason as string | undefined);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok" });
}

async function handlePublishBriefing(request: Request, env: Env, operator: InternalOperator): Promise<Response> {
  const body = await readAdminObject(request, ["briefingType", "briefingDate", "title", "summary", "contentJson"]);

  if (!body || !["daily", "weekly"].includes(String(body.briefingType))
    || !optionalText(body.briefingDate, 10) || !optionalText(body.title, 200)
    || !optionalText(body.summary, 2_000) || !optionalText(body.contentJson, 32_000)) {
    return Response.json({ error: "Invalid or unexpected briefing field." }, { status: 400 });
  }
  if (!body.briefingType || !["daily", "weekly"].includes(body.briefingType as string)) {
    return Response.json({ error: "briefingType must be 'daily' or 'weekly'" }, { status: 400 });
  }
  if (!body.briefingDate || !body.title || !body.summary || !body.contentJson) {
    return Response.json({ error: "briefingDate, title, summary, and contentJson are required" }, { status: 400 });
  }

  const result = await publishBriefing(env, {
    briefingType: body.briefingType as "daily" | "weekly",
    briefingDate: body.briefingDate as string,
    title: body.title as string,
    summary: body.summary as string,
    contentJson: body.contentJson as string,
    reviewedBy: "Admin",
  });

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok", briefing: result.briefing });
}

async function handlePublishedStoriesList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || undefined;
  const limit = Number(url.searchParams.get("limit") || "20");
  const offset = Number(url.searchParams.get("offset") || "0");
  if ((topic && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,79}$/.test(topic))
    || !Number.isInteger(limit) || limit < 1 || limit > 100
    || !Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    return Response.json({ error: "Invalid list query." }, { status: 400 });
  }

  const stories = await getPublishedStories(env, { topic, limit, offset });
  return Response.json(stories);
}

async function handleClustersList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = Number(url.searchParams.get("limit") || "50");
  if ((status && !["draft", "review", "published", "withdrawn", "superseded"].includes(status))
    || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    return Response.json({ error: "Invalid cluster query." }, { status: 400 });
  }

  const clusters = await getAllClusters(env, { limit, status });
  return Response.json(clusters);
}

async function handleClusterSources(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const clusterId = Number(url.searchParams.get("clusterId") || "0");

  if (!Number.isInteger(clusterId) || clusterId < 1) {
    return Response.json({ error: "clusterId query param is required" }, { status: 400 });
  }

  const sources = await getClusterSources(env, clusterId);
  return Response.json(sources);
}

async function handleArchiveCluster(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await readAdminObject(request, ["clusterId"]);
  if (!body || !positiveInteger(body.clusterId)) {
    return Response.json({ error: "clusterId is required" }, { status: 400 });
  }

  const result = await archiveCluster(env, body.clusterId as number);
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ status: "ok" });
}

async function handleRelatedItems(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const clusterId = Number(url.searchParams.get("clusterId") || "0");
  if (!Number.isInteger(clusterId) || clusterId < 1) {
    return Response.json({ error: "clusterId query param is required" }, { status: 400 });
  }

  try {
    const currentCluster = await env.DB.prepare(`
      SELECT id, slug, title, topic, summary, editorial_analysis, why_it_matters,
             publication_status, published_at, created_at
      FROM story_clusters
      WHERE id = ?
    `).bind(clusterId).first<{
      id: number; title: string; topic: string | null; summary: string | null;
      editorial_analysis: string | null; why_it_matters: string | null;
      slug: string | null; publication_status: string; published_at: string | null; created_at: string;
    }>();
    if (!currentCluster) return Response.json({ error: "Cluster not found." }, { status: 404 });

    const clusterSources = await env.DB.prepare(`
      SELECT fi.id, fi.title, fi.content_excerpt, fi.url
      FROM story_cluster_members scm
      JOIN feed_items fi ON scm.feed_item_id = fi.id
      WHERE scm.cluster_id = ? AND fi.ingestion_status <> 'archived'
      LIMIT 10
    `).bind(clusterId).all<{ id: number; title: string; content_excerpt: string | null; url: string }>();

    const clusterWords = new Set<string>();
    for (const text of [
      currentCluster.title,
      currentCluster.summary,
      currentCluster.editorial_analysis,
      currentCluster.why_it_matters,
    ]) {
      if (text) for (const word of tokenizeForSearch(text.slice(0, 2_000))) clusterWords.add(word);
    }
    for (const src of clusterSources.results) {
      for (const word of tokenizeForSearch(src.title)) clusterWords.add(word);
      if (src.content_excerpt) {
        for (const word of tokenizeForSearch(src.content_excerpt.slice(0, 500))) clusterWords.add(word);
      }
    }

    if (clusterWords.size < 2) {
      return Response.json({ clusterItemCount: clusterSources.results.length, items: [] });
    }

    const clusterItemIds = new Set(clusterSources.results.map(r => r.id));
    const [feedCandidates, relatedClusters] = await Promise.all([
      env.DB.prepare(`
        SELECT fi.id, fi.title, fi.content_excerpt, fi.url, fi.published_at, fi.fetched_at,
               (SELECT scm.cluster_id FROM story_cluster_members scm
                WHERE scm.feed_item_id = fi.id
                ORDER BY scm.is_primary DESC LIMIT 1) AS cluster_id,
               s.name AS source_name, s.tier AS source_tier
        FROM feed_items fi
        JOIN sources s ON fi.source_id = s.id
        WHERE fi.ingestion_status IN ('classified', 'clustered', 'published')
          AND fi.fetched_at >= datetime('now', '-30 days')
        ORDER BY fi.fetched_at DESC
        LIMIT 500
      `).all<{
        id: number; title: string; content_excerpt: string | null; url: string;
        published_at: string | null; fetched_at: string; cluster_id: number | null;
        source_name: string; source_tier: string;
      }>(),
      env.DB.prepare(`
        SELECT id, slug, title, topic, summary, editorial_analysis, why_it_matters,
               publication_status, published_at, created_at
        FROM story_clusters
        WHERE id <> ? AND publication_status NOT IN ('withdrawn', 'superseded')
        ORDER BY COALESCE(published_at, updated_at, created_at) DESC
        LIMIT 250
      `).bind(clusterId).all<{
        id: number; slug: string | null; title: string; topic: string | null;
        summary: string | null; editorial_analysis: string | null; why_it_matters: string | null;
        publication_status: string; published_at: string | null; created_at: string;
      }>(),
    ]);

    type RelatedProfile = {
      entities: Set<number>;
      claims: Map<string, string>;
      provenanceGroups: Set<string>;
    };
    const emptyProfile = (): RelatedProfile => ({
      entities: new Set<number>(),
      claims: new Map<string, string>(),
      provenanceGroups: new Set<string>(),
    });
    const clusterIds = [...new Set([
      clusterId,
      ...(relatedClusters.results ?? []).map((row) => row.id),
      ...(feedCandidates.results ?? []).map((row) => row.cluster_id).filter((id): id is number => id !== null),
    ])];
    const feedItemIds = (feedCandidates.results ?? []).map((row) => row.id);
    const clusterPlaceholders = clusterIds.map(() => "?").join(",");
    const feedItemPlaceholders = feedItemIds.map(() => "?").join(",");
    const [entityRows, claimRows, provenanceRows, feedClaimRows, feedProvenanceRows] = await Promise.all([
      env.DB.prepare(`
        SELECT cluster_id, entity_id FROM story_entities
        WHERE cluster_id IN (${clusterPlaceholders})
      `).bind(...clusterIds).all<{ cluster_id: number; entity_id: number }>(),
      env.DB.prepare(`
        SELECT sc.story_cluster_id AS cluster_id, sc.canonical_claim_id AS claim_id,
               cc.canonical_text
        FROM story_claims sc
        JOIN canonical_claims cc ON cc.id = sc.canonical_claim_id
        WHERE sc.story_cluster_id IN (${clusterPlaceholders})
      `).bind(...clusterIds).all<{ cluster_id: number; claim_id: string; canonical_text: string }>(),
      env.DB.prepare(`
        SELECT sc.story_cluster_id AS cluster_id, ca.provenance_group_id
        FROM story_claims sc
        JOIN claim_assertions ca ON ca.canonical_claim_id = sc.canonical_claim_id
        WHERE sc.story_cluster_id IN (${clusterPlaceholders})
          AND ca.provenance_group_id IS NOT NULL
          AND ca.admission_state = 'admitted'
          AND ca.reviewer_state IN ('accepted', 'amended')
      `).bind(...clusterIds).all<{ cluster_id: number; provenance_group_id: string }>(),
      feedItemIds.length > 0
        ? env.DB.prepare(`
            SELECT c.feed_item_id, m.canonical_claim_id AS claim_id, cc.canonical_text
            FROM claims c
            JOIN legacy_claim_cutover m ON m.legacy_claim_id = c.id AND m.state = 'mapped'
            JOIN canonical_claims cc ON cc.id = m.canonical_claim_id
            WHERE c.feed_item_id IN (${feedItemPlaceholders})
          `).bind(...feedItemIds).all<{ feed_item_id: number; claim_id: string; canonical_text: string }>()
        : Promise.resolve({ results: [] as { feed_item_id: number; claim_id: string; canonical_text: string }[] }),
      feedItemIds.length > 0
        ? env.DB.prepare(`
            SELECT c.feed_item_id, ca.provenance_group_id
            FROM claims c
            JOIN legacy_claim_cutover m ON m.legacy_claim_id = c.id AND m.state = 'mapped'
            JOIN claim_assertions ca ON ca.canonical_claim_id = m.canonical_claim_id
            WHERE c.feed_item_id IN (${feedItemPlaceholders})
              AND ca.provenance_group_id IS NOT NULL
              AND ca.admission_state = 'admitted'
              AND ca.reviewer_state IN ('accepted', 'amended')
          `).bind(...feedItemIds).all<{ feed_item_id: number; provenance_group_id: string }>()
        : Promise.resolve({ results: [] as { feed_item_id: number; provenance_group_id: string }[] }),
    ]);

    const clusterProfiles = new Map<number, RelatedProfile>();
    const feedProfiles = new Map<number, RelatedProfile>();
    for (const id of clusterIds) clusterProfiles.set(id, emptyProfile());
    for (const id of feedItemIds) feedProfiles.set(id, emptyProfile());
    for (const row of entityRows.results ?? []) clusterProfiles.get(row.cluster_id)?.entities.add(row.entity_id);
    for (const row of claimRows.results ?? []) clusterProfiles.get(row.cluster_id)?.claims.set(row.claim_id, row.canonical_text);
    for (const row of provenanceRows.results ?? []) clusterProfiles.get(row.cluster_id)?.provenanceGroups.add(row.provenance_group_id);
    for (const row of feedClaimRows.results ?? []) feedProfiles.get(row.feed_item_id)?.claims.set(row.claim_id, row.canonical_text);
    for (const row of feedProvenanceRows.results ?? []) feedProfiles.get(row.feed_item_id)?.provenanceGroups.add(row.provenance_group_id);

    const currentProfile = clusterProfiles.get(clusterId) ?? emptyProfile();
    for (const claimText of currentProfile.claims.values()) {
      for (const word of tokenizeForSearch(claimText)) clusterWords.add(word);
    }
    const reviewRows = await env.DB.prepare(`
      SELECT target_story_id, target_feed_item_id, action, state, reviewed_by, reviewed_at
      FROM story_related_item_reviews
      WHERE source_story_id = ?
      ORDER BY reviewed_at DESC
    `).bind(clusterId).all<{
      target_story_id: number | null; target_feed_item_id: number | null;
      action: RelatedItemAction; state: "accepted" | "rejected";
      reviewed_by: string; reviewed_at: string;
    }>();
    const latestReviews = new Map<string, (typeof reviewRows.results)[number]>();
    for (const review of reviewRows.results ?? []) {
      const key = relatedCandidateKey(review.target_story_id, review.target_feed_item_id);
      if (!latestReviews.has(key)) latestReviews.set(key, review);
    }
    const [affectedStoryRows, affectedKnowledgeRelationshipRows, affectedKnowledgeClaimRows] = await Promise.all([
      env.DB.prepare(`
        SELECT id, slug, title, publication_status
        FROM story_clusters
        WHERE id IN (${clusterPlaceholders}) AND publication_status = 'published'
      `).bind(...clusterIds).all<{ id: number; slug: string | null; title: string; publication_status: string }>(),
      env.DB.prepare(`
        SELECT kdr.related_id AS story_id, kd.id, kd.canonical_question, kd.visibility
        FROM knowledge_document_relationships kdr
        JOIN knowledge_documents kd ON kd.id = kdr.knowledge_document_id
        WHERE kdr.related_type = 'story_cluster'
          AND kdr.related_id IN (${clusterPlaceholders})
          AND kd.status = 'approved'
          AND kd.visibility IN ('public_knowledge', 'public_guide')
          AND (kd.hard_expiry IS NULL OR datetime(kd.hard_expiry) > datetime('now'))
      `).bind(...clusterIds.map(String)).all<{ story_id: string; id: string; canonical_question: string; visibility: string }>(),
      env.DB.prepare(`
        SELECT sc.story_cluster_id AS story_id, kd.id, kd.canonical_question, kd.visibility
        FROM story_claims sc
        JOIN knowledge_document_claims kdc ON kdc.canonical_claim_id = sc.canonical_claim_id
        JOIN knowledge_documents kd ON kd.id = kdc.knowledge_document_id
        WHERE sc.story_cluster_id IN (${clusterPlaceholders})
          AND kd.status = 'approved'
          AND kd.visibility IN ('public_knowledge', 'public_guide')
          AND (kd.hard_expiry IS NULL OR datetime(kd.hard_expiry) > datetime('now'))
      `).bind(...clusterIds).all<{ story_id: number; id: string; canonical_question: string; visibility: string }>(),
    ]);
    const publishedStoriesById = new Map((affectedStoryRows.results ?? []).map((row) => [row.id, row]));
    const knowledgeByStoryId = new Map<number, Map<string, { id: string; title: string; visibility: string }>>();
    const addKnowledge = (storyId: number, row: { id: string; canonical_question: string; visibility: string }) => {
      const pages = knowledgeByStoryId.get(storyId) ?? new Map<string, { id: string; title: string; visibility: string }>();
      pages.set(row.id, { id: row.id, title: row.canonical_question, visibility: row.visibility });
      knowledgeByStoryId.set(storyId, pages);
    };
    for (const row of affectedKnowledgeRelationshipRows.results ?? []) addKnowledge(Number(row.story_id), row);
    for (const row of affectedKnowledgeClaimRows.results ?? []) addKnowledge(row.story_id, row);

    const affectedRecordsFor = (
      targetStoryId: number | null,
      targetFeedItemId: number | null,
      review: { state: "accepted" | "rejected"; action: RelatedItemAction } | null,
    ) => {
      if (!review || review.state !== "accepted") return { publishedStories: [], knowledgePages: [] };
      const storyIds = targetFeedItemId !== null ? [clusterId] : [clusterId, targetStoryId as number];
      const publishedStories = storyIds
        .map((id) => publishedStoriesById.get(id))
        .filter((row): row is { id: number; slug: string | null; title: string; publication_status: string } => Boolean(row))
        .map((row) => ({ id: row.id, title: row.title, url: row.slug ? `/stories/${encodeURIComponent(row.slug)}` : null }));
      const knowledgePages = [...new Map(storyIds.flatMap((id) => [...(knowledgeByStoryId.get(id)?.values() ?? [])]).map((page) => [page.id, page])).values()]
        .map((page) => ({ ...page, url: `/knowledge/doc/${encodeURIComponent(page.id)}` }));
      return { publishedStories, knowledgePages };
    };

    interface RelatedItem {
      id: number; title: string; sourceName: string; sourceTier: string;
      kind: "ingested_coverage" | "cluster" | "published_story";
      clusterId: number | null; url: string | null; publishedAt: string | null;
      score: number; matchReasons: string[];
      claimOptions: Array<{ id: string; text: string }>;
      review: { action: RelatedItemAction; state: "accepted" | "rejected"; reviewedBy: string; reviewedAt: string } | null;
      affectedRecords: { publishedStories: Array<{ id: number; title: string; url: string | null }>; knowledgePages: Array<{ id: string; title: string; visibility: string; url: string }> };
    }

    const scored: RelatedItem[] = [];
    for (const row of feedCandidates.results ?? []) {
      if (clusterItemIds.has(row.id)) continue;
      const match = scoreRelatedContent(
        clusterWords,
        row.title,
        row.content_excerpt,
        currentCluster.topic,
        null,
        currentCluster.published_at ?? currentCluster.created_at,
        row.published_at ?? row.fetched_at,
        currentProfile,
        feedProfiles.get(row.id) ?? emptyProfile(),
      );
      if (match.score >= 20) {
        scored.push({
          id: row.id, title: row.title,
          sourceName: row.source_name, sourceTier: row.source_tier,
          kind: "ingested_coverage", clusterId: null,
          url: row.url, publishedAt: row.published_at, score: match.score,
          matchReasons: match.reasons,
          claimOptions: [...currentProfile.claims].map(([id, text]) => ({ id, text })),
          affectedRecords: affectedRecordsFor(null, row.id, latestReviews.get(relatedCandidateKey(null, row.id)) ?? null),
          review: (() => {
            const review = latestReviews.get(relatedCandidateKey(null, row.id));
            return review ? { action: review.action, state: review.state, reviewedBy: review.reviewed_by, reviewedAt: review.reviewed_at } : null;
          })(),
        });
      }
    }

    for (const row of relatedClusters.results ?? []) {
      const match = scoreRelatedContent(
        clusterWords,
        row.title,
        [row.summary, row.editorial_analysis, row.why_it_matters].filter(Boolean).join("\n"),
        currentCluster.topic,
        row.topic,
        currentCluster.published_at ?? currentCluster.created_at,
        row.published_at ?? row.created_at,
        currentProfile,
        clusterProfiles.get(row.id) ?? emptyProfile(),
      );
      if (match.score < 20) continue;
      const publishedStory = row.publication_status === "published";
      scored.push({
        id: row.id, title: row.title,
        sourceName: publishedStory ? "Published TRACE story" : `Story cluster #${row.id}`,
        sourceTier: publishedStory ? "TRACE" : "cluster",
        kind: publishedStory ? "published_story" : "cluster",
        clusterId: row.id,
        url: publishedStory && row.slug ? `/stories/${encodeURIComponent(row.slug)}` : null,
        publishedAt: row.published_at,
        score: match.score,
        matchReasons: match.reasons,
        claimOptions: [...currentProfile.claims].map(([id, text]) => ({ id, text })),
        affectedRecords: affectedRecordsFor(row.id, null, latestReviews.get(relatedCandidateKey(row.id, null)) ?? null),
        review: (() => {
          const review = latestReviews.get(relatedCandidateKey(row.id, null));
          return review ? { action: review.action, state: review.state, reviewedBy: review.reviewed_by, reviewedAt: review.reviewed_at } : null;
        })(),
      });
    }

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return Response.json({ clusterItemCount: clusterSources.results.length, items: scored.slice(0, 20) });
  } catch (error: any) {
    console.error(JSON.stringify({ message: "Related items search failed", clusterId, error: redactError(error) }));
    return Response.json({ error: "Related items search is unavailable." }, { status: 500 });
  }
}

function isRelatedItemAction(value: unknown): value is RelatedItemAction {
  return typeof value === "string" && (RELATED_ITEM_ACTIONS as readonly string[]).includes(value);
}

function assessRelatedEvidenceEligibility(
  ingestionStatus: string | null,
  claimState: string | null,
): { state: "eligible" | "pending" | "ineligible"; reason: string } {
  if (["corrected", "superseded", "retired"].includes(claimState ?? "")) {
    return { state: "ineligible", reason: `The canonical claim is ${claimState} and cannot receive current support.` };
  }
  if (["archived", "rejected", "duplicate"].includes(ingestionStatus ?? "")) {
    return { state: "ineligible", reason: `The feed item is ${ingestionStatus} and is not eligible evidence.` };
  }
  if (ingestionStatus === "raw" || ingestionStatus === null) {
    return { state: "pending", reason: "The feed item requires classification before score eligibility can be assessed." };
  }
  if (!["classified", "clustered", "published"].includes(ingestionStatus)) {
    return { state: "pending", reason: `The feed item is ${ingestionStatus} and has not reached an eligible review state.` };
  }
  return { state: "eligible", reason: "The claim is active and the feed item is admitted to the reviewed ingestion pool." };
}

function relatedCandidateKey(targetStoryId: number | null, targetFeedItemId: number | null): string {
  return targetStoryId !== null ? `story:${targetStoryId}` : `feed:${targetFeedItemId}`;
}

async function handleRelatedItemReview(
  request: Request,
  env: Env,
  operator: InternalOperator,
): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const body = await readAdminObject(request, [
    "sourceStoryId", "targetStoryId", "targetFeedItemId", "canonicalClaimId", "action", "explanation", "confidence",
  ]);
  if (!body || !positiveInteger(body.sourceStoryId) || !isRelatedItemAction(body.action)) {
    return Response.json({ error: "sourceStoryId and a valid action are required." }, { status: 400 });
  }
  const sourceStoryId = body.sourceStoryId as number;
  const targetStoryId = body.targetStoryId === undefined ? null : body.targetStoryId;
  const targetFeedItemId = body.targetFeedItemId === undefined ? null : body.targetFeedItemId;
  const canonicalClaimId = body.canonicalClaimId === undefined ? null : body.canonicalClaimId;
  if ((targetStoryId !== null && !positiveInteger(targetStoryId))
    || (targetFeedItemId !== null && !positiveInteger(targetFeedItemId))
    || (targetStoryId !== null && targetFeedItemId !== null)
    || (targetStoryId === null && targetFeedItemId === null)) {
    return Response.json({ error: "Exactly one target story or feed item is required." }, { status: 400 });
  }
  if (canonicalClaimId !== null && (typeof canonicalClaimId !== "string" || canonicalClaimId.length < 1 || canonicalClaimId.length > 200)) {
    return Response.json({ error: "canonicalClaimId is invalid." }, { status: 400 });
  }
  if (body.explanation !== undefined && !optionalText(body.explanation, 2_000)) {
    return Response.json({ error: "explanation is too long." }, { status: 400 });
  }
  const explanation = typeof body.explanation === "string" ? body.explanation.trim() : "";
  if (["contradiction", "correction", "supersession"].includes(body.action) && explanation.length < 10) {
    return Response.json({ error: "An explanation of at least 10 characters is required for this action." }, { status: 400 });
  }
  const confidence = body.confidence === undefined ? 0.5 : body.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return Response.json({ error: "confidence must be between 0 and 1." }, { status: 400 });
  }

  let targetFeedIngestionStatus: string | null = null;
  let selectedClaimState: string | null = null;
  try {
    const source = await env.DB.prepare("SELECT id FROM story_clusters WHERE id = ?")
      .bind(sourceStoryId).first<{ id: number }>();
    if (!source) return Response.json({ error: "Source story not found." }, { status: 404 });

    if (targetStoryId !== null) {
      if (targetStoryId === sourceStoryId) return Response.json({ error: "A story cannot relate to itself." }, { status: 400 });
      const target = await env.DB.prepare("SELECT id FROM story_clusters WHERE id = ?")
        .bind(targetStoryId).first<{ id: number }>();
      if (!target) return Response.json({ error: "Target story not found." }, { status: 404 });
    } else {
      const target = await env.DB.prepare("SELECT id, ingestion_status FROM feed_items WHERE id = ?")
        .bind(targetFeedItemId).first<{ id: number; ingestion_status: string }>();
      if (!target) return Response.json({ error: "Target feed item not found." }, { status: 404 });
      targetFeedIngestionStatus = target.ingestion_status;
    }

    if (body.action !== "reject" && body.action !== "attach_evidence" && targetStoryId === null) {
      return Response.json({ error: "This action requires a story candidate." }, { status: 400 });
    }
    if (body.action === "attach_evidence") {
      if (targetFeedItemId === null || canonicalClaimId === null) {
        return Response.json({ error: "Attaching evidence requires a feed item and a canonical claim from the source story." }, { status: 400 });
      }
      const sourceClaim = await env.DB.prepare(`
        SELECT sc.canonical_claim_id, cc.current_state
        FROM story_claims sc
        JOIN canonical_claims cc ON cc.id = sc.canonical_claim_id
        WHERE sc.story_cluster_id = ? AND sc.canonical_claim_id = ?
      `).bind(sourceStoryId, canonicalClaimId).first<{ canonical_claim_id: string; current_state: string }>();
      if (!sourceClaim) return Response.json({ error: "The selected canonical claim does not belong to the source story." }, { status: 400 });
      selectedClaimState = sourceClaim.current_state;
    }

    const attachmentEligibility = body.action === "attach_evidence"
      ? assessRelatedEvidenceEligibility(targetFeedIngestionStatus, selectedClaimState)
      : null;

    const targetPredicate = targetStoryId !== null
      ? "target_story_id = ? AND target_feed_item_id IS NULL"
      : "target_story_id IS NULL AND target_feed_item_id = ?";
    const targetValue = targetStoryId ?? targetFeedItemId;
    const existing = await env.DB.prepare(`
      SELECT id, action, state, reviewed_by, reviewed_at
      FROM story_related_item_reviews
      WHERE source_story_id = ? AND ${targetPredicate} AND action = ?
      LIMIT 1
    `).bind(sourceStoryId, targetValue, body.action).first<{
      id: string; action: RelatedItemAction; state: "accepted" | "rejected";
      reviewed_by: string; reviewed_at: string;
    }>();
    if (existing) {
      return Response.json({
        status: existing.state,
        action: existing.action,
        reviewId: existing.id,
        alreadyReviewed: true,
      });
    }

    const reviewId = crypto.randomUUID();
    const state = body.action === "reject" ? "rejected" : "accepted";
    const relationship = targetStoryId !== null ? RELATED_ACTION_RELATIONSHIPS[body.action] : undefined;
    const statements = [] as D1PreparedStatement[];
    if (body.action === "attach_evidence" && targetFeedItemId !== null && canonicalClaimId !== null) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO story_claim_evidence_attachments
          (id, story_cluster_id, canonical_claim_id, feed_item_id, relationship, explanation,
           eligibility_state, eligibility_reason, reviewed_by, reviewed_at)
        VALUES (?, ?, ?, ?, 'supports', ?, ?, ?, ?, datetime('now'))
      `).bind(
        crypto.randomUUID(), sourceStoryId, canonicalClaimId, targetFeedItemId,
        explanation || null, attachmentEligibility?.state, attachmentEligibility?.reason, operator.email,
      ));
    }
    if (relationship && targetStoryId !== null) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO story_relationships
          (id, source_story_id, target_story_id, relationship, explanation, confidence, created_by, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        crypto.randomUUID(), sourceStoryId, targetStoryId, relationship,
        explanation || null, confidence, operator.email,
      ));
    }
    statements.push(env.DB.prepare(`
      INSERT INTO story_related_item_reviews
        (id, source_story_id, target_story_id, target_feed_item_id, action, state,
         explanation, confidence, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      reviewId, sourceStoryId, targetStoryId, targetFeedItemId, body.action, state,
      explanation || null, confidence, operator.email,
    ));
    await env.DB.batch(statements);

    if (body.action === "attach_evidence" && attachmentEligibility?.state === "eligible" && canonicalClaimId !== null) {
      await recalculateEvidenceScores(env.DB, {
        claimIds: [canonicalClaimId],
        triggeringEvent: "accepted_evidence",
      });
    }

    return Response.json({
      status: state,
      action: body.action,
      reviewId,
      relationshipRecorded: Boolean(relationship && targetStoryId !== null),
      attachmentRecorded: body.action === "attach_evidence",
      evidenceEligibility: attachmentEligibility?.state ?? null,
      evidenceEligibilityReason: attachmentEligibility?.reason ?? null,
      evidenceScoreChanged: body.action === "attach_evidence" && attachmentEligibility?.state === "eligible",
    }, { status: 201 });
  } catch (error: any) {
    console.error(JSON.stringify({ message: "Related item review failed", sourceStoryId, error: redactError(error) }));
    return Response.json({ error: "Related item review is unavailable." }, { status: 500 });
  }
}

function scoreRelatedContent(
  searchTerms: Set<string>,
  title: string,
  supportingText: string | null,
  currentTopic: string | null,
  candidateTopic: string | null,
  currentDate: string | null,
  candidateDate: string | null,
  currentProfile: { entities: Set<number>; claims: Map<string, string>; provenanceGroups: Set<string> },
  candidateProfile: { entities: Set<number>; claims: Map<string, string>; provenanceGroups: Set<string> },
): { score: number; reasons: string[] } {
  const titleTerms = new Set(tokenizeForSearch(title));
  const textTerms = new Set([
    ...titleTerms,
    ...tokenizeForSearch((supportingText ?? "").slice(0, 2_000)),
  ]);
  const titleMatches = [...searchTerms].filter((term) => titleTerms.has(term));
  const contextMatches = [...searchTerms].filter((term) => !titleTerms.has(term) && textTerms.has(term));
  const reasons: string[] = [];
  let score = 0;

  if (titleMatches.length >= 2) {
    score += 20 + Math.min(titleMatches.length, 4) * 10;
    reasons.push(`shared title terms: ${titleMatches.slice(0, 3).join(", ")}`);
  } else if (titleMatches.length === 1) {
    score += 10;
    reasons.push(`shared title term: ${titleMatches[0]}`);
  }
  if (contextMatches.length >= 2) {
    score += Math.min(contextMatches.length, 4) * 5;
    reasons.push(`related context: ${contextMatches.slice(0, 3).join(", ")}`);
  }
  if (currentTopic && candidateTopic && currentTopic === candidateTopic) {
    score += 20;
    reasons.push(`same topic (${currentTopic})`);
  }

  const sharedEntities = [...currentProfile.entities].filter((id) => candidateProfile.entities.has(id));
  if (sharedEntities.length > 0) {
    score += Math.min(25, 15 + (sharedEntities.length - 1) * 5);
    reasons.push(`shared entities (${sharedEntities.length})`);
  }

  const sharedClaims = [...currentProfile.claims.keys()].filter((id) => candidateProfile.claims.has(id));
  if (sharedClaims.length > 0) {
    score += Math.min(30, 20 + (sharedClaims.length - 1) * 5);
    reasons.push(`shared canonical claims (${sharedClaims.length})`);
  }

  const sharedProvenance = [...currentProfile.provenanceGroups].filter((id) => candidateProfile.provenanceGroups.has(id));
  if (sharedProvenance.length > 0) {
    score += 15;
    reasons.push(`shared provenance group (${sharedProvenance.length})`);
  }

  const dateDistance = dateDistanceDays(currentDate, candidateDate);
  if (dateDistance !== null && dateDistance <= 30) {
    score += dateDistance <= 7 ? 10 : 5;
    reasons.push(`date proximity (${dateDistance}d)`);
  }

  const semanticSimilarity = tokenCosineSimilarity(searchTerms, textTerms);
  if (semanticSimilarity >= 0.2) {
    score += Math.min(20, Math.round(semanticSimilarity * 30));
    reasons.push(`semantic proxy (${Math.round(semanticSimilarity * 100)}%)`);
  }

  return { score: Math.min(score, 100), reasons };
}

function dateDistanceDays(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null;
  return Math.floor(Math.abs(leftTime - rightTime) / 86_400_000);
}

function tokenCosineSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / Math.sqrt(left.size * right.size);
}

function tokenizeForSearch(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim().split(" ")
    .filter(w => w.length > 2 && !["the","and","for","with","that","this","from","have","been","what","when","where","which","about","just","also","very","only","more","some","than","then","over","into","after","before","their","they","will","would","could","should","these","those"].includes(w));
}
