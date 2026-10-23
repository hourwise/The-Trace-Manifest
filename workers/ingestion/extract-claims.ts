// The Trace Manifest — Claim Extraction Engine
// Phase 3: Rule-based claim extraction from feed item content
// Extracts structured claims, classifies them, scores evidence quality,
// and creates evidence records linking claims to their sources.
// Runs within Worker CPU limits; no external AI dependency.

import type { FeedItem } from "./types";
import { writeCanonicalClaim } from "../../src/lib/server/canonical-claim-write";
import { generateClaimRelationshipProposals } from "../../src/lib/server/claim-relationship-proposals";
import type {
  ExtractedClaim,
  ClaimClass,
  ClaimDomain,
} from "./types";
import type {
  ClaimExtractionRunStatus,
  ClaimExtractionRunTrigger,
} from "../../src/lib/server/claim-extraction-audit";

// ============================================================
// Algorithm identity
// ============================================================
const ALGORITHM_VERSION = "rule-extraction-v1";

export interface ClaimExtractionRunOptions {
  trigger: ClaimExtractionRunTrigger;
  requestId?: string | null;
  operatorEmail?: string | null;
  operatorRole?: "reader" | "publisher" | null;
}

export interface ClaimExtractionResult {
  runId: string;
  requestId: string | null;
  runStatus: ClaimExtractionRunStatus;
  processed: number;
  claimsExtracted: number;
  evidenceCreated: number;
  selectedCount: number;
  processedCount: number;
  noClaimCount: number;
  failedCount: number;
  extractedClaimCount: number;
  newAssertionCount: number;
  canonicalWriteSuccessCount: number;
}

class ExtractionLedgerWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionLedgerWriteError";
  }
}

/** Returns a usable cluster ID, creating a placeholder cluster for unclustered items.
 *  Result is cached in-memory for the duration of the extraction run. */
let _placeholderClusterId: number | null = null;
async function ensureClusterId(db: D1Database, clusterId: number | null, itemId: number): Promise<number> {
  if (clusterId != null) return clusterId;
  if (_placeholderClusterId != null) return _placeholderClusterId;
  // Find or create a placeholder cluster for unclustered items.
  const existing = await db.prepare(
    "SELECT id FROM story_clusters WHERE title = 'Unclustered Items (placeholder)' LIMIT 1"
  ).first<{ id: number }>();
  if (existing) { _placeholderClusterId = existing.id; return existing.id; }
  const result = await db.prepare(
    `INSERT INTO story_clusters (title, summary, publication_status, evidence_status, needs_human_review)
     VALUES ('Unclustered Items (placeholder)', 'Claims extracted from items that have not yet been clustered.', 'draft', 'unverified', 0)`
  ).run();
  _placeholderClusterId = result.meta.last_row_id as number;
  return _placeholderClusterId;
}

// ============================================================
// Claim extraction rule sets
// Each rule: { domain, claimClass, patterns, severity, evidenceWeight }
// Patterns use capturing groups to extract the claim text itself
// ============================================================

interface ClaimRule {
  domain: ClaimDomain;
  claimClass: ClaimClass;
  patterns: RegExp[];
  severity: "low" | "standard" | "high" | "extraordinary";
  evidenceWeight: number; // 0-1, how much this claim type benefits from source tier
}

const CLAIM_RULES: ClaimRule[] = [
  // ---- Model releases ----
  {
    domain: "model_release",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:announced?|released?|launched?|unveil(?:ed)?|introduc(?:ed|ing))[^.]*(?:model|GPT|Claude|Gemini|Llama|Mistral|DeepSeek|Qwen|Phi|Gemma|Grok|o[13])\b[^.]*\.)/gi,
      /\b((?:new|next|latest|flagship)[^.]*(?:model|GPT|Claude|Gemini|Llama|Mistral|DeepSeek)[^.]*(?:is|has|can|features|supports)[^.]*\.)/gi,
      /\b((?:release|launch)[^.]*(?:date|version|checkpoint|weights)[^.]*\.)/gi,
    ],
    severity: "high",
    evidenceWeight: 0.3,
  },
  {
    domain: "model_release",
    claimClass: "community_report",
    patterns: [
      /\b((?:rumour|leak|report|source)[^.]*(?:model|GPT|Claude|Gemini|Llama)[^.]*(?:coming|soon|expected|planned)[^.]*\.)/gi,
      /\b((?:community|users?|reddit|twitter|discord)[^.]*(?:report|notice|find|discover)[^.]*(?:model|release|update|change)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.7,
  },

  // ---- Model capabilities ----
  {
    domain: "model_capability",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:support|handle|process)[^.]*(?:context|window|token|parameter)[^.]*(?:\d+[kKmMbB]?)[^.]*\.)/gi,
      /\b((?:achieve|score|reach|obtain)[^.]*(?:\d+(?:\.\d+)?%?)[^.]*(?:on|in|at)[^.]*(?:benchmark|MMLU|HumanEval|GSM8K|MATH|SWE-bench)[^.]*\.)/gi,
      /\b((?:trained|fine.?tuned|optimised)[^.]*(?:on|with|using)[^.]*(?:\d+[kKmMbB]?)[^.]*(?:token|sample|example|parameter)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.3,
  },
  {
    domain: "model_capability",
    claimClass: "benchmark_result",
    patterns: [
      /\b((?:score|rank|place|achieve|obtain)[^.]*(?:\d+(?:\.\d+)?%?)[^.]*(?:on|in|at)[^.]*(?:benchmark|MMLU|HumanEval|GSM8K|MATH|SWE-bench|Chatbot Arena|LMSYS|HELM|LiveBench|ARC|HellaSwag|TruthfulQA|BBH)[^.]*\.)/gi,
      /\b((?:outperform|surpass|beat|exceed)[^.]*(?:model|baseline|human|previous|prior)[^.]*(?:on|in|at|by)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.4,
  },
  {
    domain: "model_capability",
    claimClass: "observed_implementation_behaviour",
    patterns: [
      /\b((?:we|I|researchers?|developers?|users?)[^.]*(?:test|evaluate|observe|find|notice|discover)[^.]*(?:that|how|when)?[^.]*(?:model|LLM|GPT|Claude|Gemini)[^.]*(?:behave|respond|output|generate|fail|hallucinat|refuse)[^.]*\.)/gi,
      /\b((?:in\s*(?:our|the)\s*(?:test|experiment|evaluation))[^.]*(?:model|LLM)[^.]*(?:show|demonstrate|exhibit|display)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.5,
  },

  // ---- Pricing ----
  {
    domain: "pricing",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:price|cost|rate|fee)[^.]*(?:\$[\d.]+|free|[\d.]+[\s]*\$)[^.]*(?:per|\/|[\s])(?:token|million|1M|1K|request|call|month|user)[^.]*\.)/gi,
      /\b((?:reduc|cut|lower|drop|slash|discount)[^.]*(?:price|cost|rate)[^.]*(?:by|to|from)[^.]*(?:\d+%?|\$[\d.]+)[^.]*\.)/gi,
      /\b((?:now|newly|become)[^.]*(?:free|cheaper|more\s*affordable|lower\s*cost)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.2,
  },
  {
    domain: "pricing",
    claimClass: "community_report",
    patterns: [
      /\b((?:users?|community|report)[^.]*(?:price|cost|rate)[^.]*(?:change|increase|decrease|hike|surprise)[^.]*\.)/gi,
    ],
    severity: "low",
    evidenceWeight: 0.7,
  },

  // ---- Security ----
  {
    domain: "security",
    claimClass: "independent_research_finding",
    patterns: [
      /\b((?:vulnerability|CVE|exploit|attack|breach|adversarial)[^.]*(?:found|discover|report|identify|disclose)[^.]*(?:in|affect|impact|allow)[^.]*\.)/gi,
      /\b((?:prompt\s*injection|jailbreak|data\s*poisoning|backdoor)[^.]*(?:demonstrat|show|prove|reveal|expose)[^.]*\.)/gi,
      /\b((?:security|safety)[^.]*(?:researcher|team|lab|firm)[^.]*(?:find|warn|alert|report)[^.]*\.)/gi,
    ],
    severity: "high",
    evidenceWeight: 0.5,
  },
  {
    domain: "security",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:fix|patch|mitigate|address|resolve)[^.]*(?:vulnerability|issue|bug|exploit|CVE)[^.]*\.)/gi,
      /\b((?:security|safety)[^.]*(?:audit|review|assessment|evaluation|report)[^.]*(?:complete|finish|publish)[^.]*\.)/gi,
    ],
    severity: "high",
    evidenceWeight: 0.3,
  },

  // ---- Licence ----
  {
    domain: "licence",
    claimClass: "specification_defined",
    patterns: [
      /\b((?:licen[cs]e|releas)[^.]*(?:under|as|with)[^.]*(?:Apache|MIT|GPL|BSD|CC[-\s]*BY|open[-\s]*source|open[-\s]*weight|proprietary|commercial|research[-\s]*only|non[-\s]*commercial)[^.]*\.)/gi,
      /\b((?:change|switch|migrate|update)[^.]*(?:licen[cs]e|terms)[^.]*(?:from|to)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.2,
  },

  // ---- Regulation ----
  {
    domain: "regulation",
    claimClass: "legal_or_regulatory_statement",
    patterns: [
      /\b((?:EU\s*AI\s*Act|legislation|regulation|executive\s*order|compliance|FTC|CISA|data\s*protection|GDPR)[^.]*(?:require|mandate|prohibit|restrict|allow|permit|govern|apply)[^.]*\.)/gi,
      /\b((?:law|act|bill|directive|framework)[^.]*(?:pass|approve|enact|propose|introduce)[^.]*(?:AI|artificial\s*intelligence|model|algorithm)[^.]*\.)/gi,
    ],
    severity: "high",
    evidenceWeight: 0.2,
  },

  // ---- Research findings ----
  {
    domain: "research",
    claimClass: "independent_research_finding",
    patterns: [
      /\b((?:paper|study|research|preprint|article)[^.]*(?:find|show|demonstrat|reveal|conclude|argue|propose|introduce)[^.]*(?:that|how|a\s*new|novel)[^.]*\.)/gi,
      /\b((?:researchers?|scientists?|authors?)[^.]*(?:from|at|affiliated)[^.]*(?:find|discover|develop|create|propose)[^.]*\.)/gi,
      /\b((?:novel|new|improved)[^.]*(?:method|approach|technique|architecture|mechanism|algorithm)[^.]*(?:for|to|that)[^.]*(?:improve|achieve|enable|allow)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.5,
  },

  // ---- Product changes ----
  {
    domain: "product",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:launch|announce|unveil|introduce|release)[^.]*(?:feature|product|platform|tool|service|API|SDK)[^.]*(?:for|to|that|which|allow)[^.]*\.)/gi,
      /\b((?:deprecat|shut\s*down|discontinu|retir|sunset|end[-\s]*of[-\s]*life)[^.]*(?:feature|product|service|API|model|version)[^.]*\.)/gi,
      /\b((?:partnership|collaboration|integration|alliance)[^.]*(?:with|between|announce)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.3,
  },

  // ---- Funding & business ----
  {
    domain: "funding",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:rais|secures?|closes?)[^.]*(?:\$[\d.]+|[\d.]+\s*(?:million|billion))[^.]*(?:funding|round|investment|series)[^.]*\.)/gi,
      /\b((?:valu|worth)[^.]*(?:\$[\d.]+|[\d.]+\s*(?:million|billion))[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.3,
  },

  // ---- Hardware ----
  {
    domain: "hardware",
    claimClass: "official_vendor_claim",
    patterns: [
      /\b((?:GPU|TPU|NPU|chip|accelerator|processor|H100|H200|B100|B200|MI300)[^.]*(?:announce|release|launch|ship|available|benchmark|performance)[^.]*\.)/gi,
      /\b((?:NVIDIA|AMD|Intel|Groq|Cerebras|Graphcore)[^.]*(?:announce|reveal|launch|ship)[^.]*(?:GPU|chip|processor|accelerator)[^.]*\.)/gi,
    ],
    severity: "standard",
    evidenceWeight: 0.3,
  },

  // ---- Catch-all: any strong assertion about AI/ML ----
  {
    domain: "general",
    claimClass: "editorial_synthesis",
    patterns: [
      /\b((?:AI|artificial\s*intelligence|machine\s*learning|LLM|large\s*language\s*model)[^.]*(?:is|are|will|can|has|have|become|now|increasingly|increasing|growing)[^.]*\.)/gi,
    ],
    severity: "low",
    evidenceWeight: 0.8,
  },
];

// ============================================================
// Text normalisation helpers
// ============================================================
function stripHTML(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function normaliseText(text: string): string {
  return stripHTML(text)
    .replace(/\s+/g, " ")
    .replace(/&#?[a-z0-9]+;/gi, "")
    .trim();
}

function truncateToSentence(text: string, maxLength: number = 500): string {
  // Try to end at a sentence boundary
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastExclaim = truncated.lastIndexOf("!");
  const lastQuestion = truncated.lastIndexOf("?");
  const bestBreak = Math.max(lastPeriod, lastExclaim, lastQuestion);
  if (bestBreak > maxLength * 0.5) {
    return truncated.substring(0, bestBreak + 1);
  }
  return truncated + "...";
}

// ============================================================
// Claim deduplication within a batch
// ============================================================
function deduplicateClaims(claims: ExtractedClaim[]): ExtractedClaim[] {
  const seen = new Set<string>();
  const unique: ExtractedClaim[] = [];

  for (const claim of claims) {
    // Normalize for comparison: lowercase, collapse whitespace
    const key = claim.claimText.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(claim);
    }
  }

  return unique;
}

// ============================================================
// Evidence quality scoring
// ============================================================
function scoreEvidenceQuality(
  sourceTier: string,
  sourceTreatment: string,
  claimClass: ClaimClass,
  evidenceWeight: number,
): { quality: "weak" | "moderate" | "strong" | "very_strong"; score: number } {
  // Base score from source tier
  let baseScore = 0;
  switch (sourceTier) {
    case "A": baseScore = 70; break;
    case "B": baseScore = 50; break;
    case "C": baseScore = 30; break;
    default: baseScore = 20;
  }

  // Boost for primary sources making claims about their own domain
  const isPrimary = sourceTreatment?.includes("primary");
  if (isPrimary) baseScore += 15;

  // Vendor claims about their own products need more corroboration — discount
  if (claimClass === "official_vendor_claim") baseScore -= 10;

  // Independent research gets a boost
  if (claimClass === "independent_research_finding") baseScore += 10;

  // Community reports need corroboration — discount
  if (claimClass === "community_report") baseScore -= 10;

  // Weight adjustment: high evidenceWeight means the claim type depends more
  // on source quality; low means the claim type is more self-evident
  const adjustedScore = Math.round(baseScore * (0.6 + evidenceWeight * 0.4));

  // Clamp to 0-100
  const clampedScore = Math.max(0, Math.min(100, adjustedScore));

  // Map to quality label
  let quality: "weak" | "moderate" | "strong" | "very_strong";
  if (clampedScore >= 80) quality = "very_strong";
  else if (clampedScore >= 60) quality = "strong";
  else if (clampedScore >= 35) quality = "moderate";
  else quality = "weak";

  return { quality, score: clampedScore };
}

// ============================================================
// Main claim extraction for a single feed item
// ============================================================
export function extractClaimsFromItem(
  item: FeedItem,
  sourceTier: string = "C",
  sourceTreatment: string = "",
): ExtractedClaim[] {
  const text = normaliseText(
    [item.title, item.summary ?? "", item.content_excerpt ?? ""].join(". ")
  );

  const extracted: ExtractedClaim[] = [];

  for (const rule of CLAIM_RULES) {
    for (const pattern of rule.patterns) {
      // Reset lastIndex for global regexes
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const rawClaim = (match[1] || match[0]).trim();
        // Skip very short matches (likely false positives)
        if (rawClaim.length < 25) continue;
        // Skip matches that are just titles (too generic)
        if (rawClaim.length < 40 && rawClaim === item.title.trim()) continue;
        // Skip claims that are just URLs, file paths, or download links
        if (/^(https?:\/\/|ftp:\/\/|\/.*\/.*\.(tar|gz|zip|dmg|exe|pkg|bin|sha256|asc))/.test(rawClaim)) continue;
        if (/^[\w./-]+\/(?:releases|download|bin)\//.test(rawClaim)) continue;
        // Skip claims that are just version numbers or build identifiers
        if (/^(b\d{4,6}|v?\d+\.\d+\.\d+(-rc\.?\d+)?|[\d.]+\.\d+)$/.test(rawClaim)) continue;
        // Skip claims dominated by non-alphabetic characters (URLs, paths, JSON fragments)
        const alphaRatio = (rawClaim.match(/[a-zA-Z]/g) ?? []).length / rawClaim.length;
        if (alphaRatio < 0.4) continue;

        const claimText = truncateToSentence(rawClaim, 500);
        const { quality, score } = scoreEvidenceQuality(
          sourceTier,
          sourceTreatment,
          rule.claimClass,
          rule.evidenceWeight,
        );

        extracted.push({
          claimText,
          claimClass: rule.claimClass,
          claimDomain: rule.domain,
          severity: rule.severity,
          evidenceQuality: quality,
          confidenceScore: score,
          supportingPhrase: rawClaim.substring(0, 200),
        });
      }
    }
  }

  // Deduplicate and limit per item (avoid overwhelming the DB)
  const unique = deduplicateClaims(extracted);
  return unique.slice(0, 20);
}

// ============================================================
// Database-backed extraction — fetches clustered items, extracts
// claims, stores them, and creates evidence records.
// ============================================================
export async function runClaimExtraction(
  db: D1Database,
  onProgress?: (processed: number, total: number) => void,
  options: ClaimExtractionRunOptions = { trigger: "manual_admin" },
): Promise<ClaimExtractionResult> {
  const runId = crypto.randomUUID();
  const requestId = options.requestId ?? null;
  let runCreated = false;

  try {
    await createExtractionRun(db, runId, options);
    runCreated = true;

  // Fetch clustered items with source info, excluding already-extracted.
  // Require at least some content — items with only a title cannot produce claims.
    const { results } = await db.prepare(
      `SELECT fi.*, s.tier as source_tier, s.treatment as source_treatment
       FROM feed_items fi
       JOIN sources s ON fi.source_id = s.id
       LEFT JOIN pipeline_stages ps ON ps.feed_item_id = fi.id AND ps.stage = 'claim_extracted'
       WHERE fi.ingestion_status IN ('clustered', 'classified', 'published')
       AND ps.id IS NULL
       AND fi.fetched_at >= datetime('now', '-7 days')
       AND (fi.summary IS NOT NULL OR fi.content_excerpt IS NOT NULL)
       ORDER BY fi.fetched_at DESC
       LIMIT 50`
    ).all<FeedItem & { source_tier: string; source_treatment: string }>();

    // Membership is persisted before any canonical processing. This is the
    // durable answer to which exact bounded population this run selected.
    await persistSelectedItems(db, runId, results);
    const runItems = await db.prepare(
      "SELECT id, feed_item_id FROM claim_extraction_run_items WHERE run_id = ? ORDER BY ordinal ASC",
    ).bind(runId).all<{ id: number; feed_item_id: number }>();
    const runItemIds = new Map(
      (runItems.results ?? []).map((row) => [Number(row.feed_item_id), Number(row.id)]),
    );

    const total = results.length;
    let processed = 0;

    for (const row of results) {
    const item: FeedItem = {
      id: row.id,
      source_id: row.source_id,
      external_id: row.external_id,
      url: row.url,
      url_hash: row.url_hash,
      title: row.title,
      summary: row.summary,
      content_excerpt: row.content_excerpt,
      author: row.author,
      published_at: row.published_at,
      fetched_at: row.fetched_at,
      raw_metadata: row.raw_metadata,
      ingestion_status: row.ingestion_status,
      duplicate_of: row.duplicate_of,
      created_at: row.created_at,
    };
      const runItemId = runItemIds.get(item.id);
      if (runItemId === undefined) throw new Error(`Missing extraction ledger membership for feed item ${item.id}`);

      let stageId: number | null = null;
      let extractedClaimCount = 0;
      let newAssertionCount = 0;
      let canonicalWriteSuccessCount = 0;
      let failureCode: string | null = null;
      let failureMessage: string | null = null;
      let outcome: "extracted" | "no_claims" | "failed" = "failed";

      try {

        // Use effective cluster ID (cached, creates placeholder for unclustered items)
        let clusterId: number | null = null;
        try {
          const clusterRow = await db.prepare(
            "SELECT cluster_id FROM story_cluster_members WHERE feed_item_id = ? LIMIT 1"
          ).bind(item.id).first<{ cluster_id: number }>();
          clusterId = clusterRow?.cluster_id ?? null;
        } catch { /* unclustered — handled below */ }

        // Skip DB call if we already have the placeholder cached and clusterId is null
        const effectiveClusterId = clusterId != null ? clusterId : (_placeholderClusterId ?? await ensureClusterId(db, null, item.id));

        // Extract claims. This remains the pure deterministic rule engine.
        const claims = extractClaimsFromItem(
          item,
          row.source_tier ?? "C",
          row.source_treatment ?? "",
        );
        extractedClaimCount = claims.length;

        if (claims.length === 0) {
          // Mark as processed even if no claims found
          stageId = await recordPipelineStage(db, item.id, "claim_extracted", "completed",
            `No claims extracted — item content too short or no patterns matched`);
          outcome = "no_claims";
        } else {
          // Store claims and source assertions in the canonical graph. Legacy
          // claims/claim_evidence are frozen by KC-05G and must never receive new
          // writes.
          let hadFailure = false;
          for (let effectOrdinal = 0; effectOrdinal < claims.length; effectOrdinal++) {
            const claim = claims[effectOrdinal];
            try {
              const materiality = claim.severity === "extraordinary"
                ? "critical" : claim.severity === "high" ? "high"
                  : claim.severity === "low" ? "low" : "standard";
              const written = await writeCanonicalClaim(db, {
                feedItemId: item.id,
                clusterId: effectiveClusterId,
                sourceId: row.source_id,
                sourceUrl: item.url,
                sourceUrlHash: item.url_hash,
                title: item.title,
                author: item.author,
                publishedAt: item.published_at,
                content: item.content_excerpt ?? item.summary,
                claimText: claim.claimText,
                claimClass: claim.claimClass,
                claimDomain: claim.claimDomain,
                materiality,
                confidence: claim.confidenceScore,
                extractionMethod: "rule_based",
                extractionVersion: ALGORITHM_VERSION,
              });
              await recordExtractionEffect(db, {
                runId,
                runItemId,
                feedItemId: item.id,
                effectOrdinal,
                claimText: claim.claimText,
                claimClass: claim.claimClass,
                claimDomain: claim.claimDomain,
                attemptOutcome: written.inserted ? "inserted" : "reused",
                sourceDocumentId: written.sourceDocumentId,
                sourceDocumentVersionId: written.sourceDocumentVersionId,
                canonicalClaimId: written.canonicalClaimId,
                assertionId: written.assertionId,
                canonicalClaimInserted: written.canonicalClaimInserted,
                assertionInserted: written.inserted,
                storyClaimInserted: written.storyClaimInserted,
                failureCode: null,
                failureMessage: null,
              });
              if (written.inserted) {
                newAssertionCount++;
              }
              canonicalWriteSuccessCount++;
            } catch (error: unknown) {
              if (error instanceof ExtractionLedgerWriteError) throw error;
              hadFailure = true;
              failureCode ??= "canonical_write_failed";
              failureMessage ??= boundedExtractionError(error);
              await recordExtractionEffect(db, {
                runId,
                runItemId,
                feedItemId: item.id,
                effectOrdinal,
                claimText: claim.claimText,
                claimClass: claim.claimClass,
                claimDomain: claim.claimDomain,
                attemptOutcome: "failed",
                sourceDocumentId: null,
                sourceDocumentVersionId: null,
                canonicalClaimId: null,
                assertionId: null,
                canonicalClaimInserted: null,
                assertionInserted: null,
                storyClaimInserted: null,
                failureCode: "canonical_write_failed",
                failureMessage: boundedExtractionError(error),
              });
              stageId = await recordPipelineStage(db, item.id, "claim_extracted", "failed",
                `Claim insert failed: ${boundedExtractionError(error, 200)}`);
            }
          }
          outcome = hadFailure ? "failed" : "extracted";
          if (!hadFailure) {
            stageId = await recordPipelineStage(db, item.id, "claim_extracted", "completed",
              `${claims.length} claims extracted, ${canonicalWriteSuccessCount} canonical writer calls`);
          }
        }
      } catch (error: unknown) {
        if (error instanceof ExtractionLedgerWriteError) throw error;
        failureCode ??= "extraction_failed";
        failureMessage ??= boundedExtractionError(error);
        stageId = await recordPipelineStage(db, item.id, "claim_extracted", "failed",
          `Claim extraction failed: ${boundedExtractionError(error, 200)}`);
        outcome = "failed";
      }

      await updateExtractionRunItem(db, {
        runItemId,
        outcome,
        pipelineStageId: stageId,
        extractedClaimCount,
        newAssertionCount,
        canonicalWriteSuccessCount,
        failureCode,
        failureMessage,
      });
      await refreshExtractionRunCounters(db, runId, false);
    processed++;
    onProgress?.(processed, total);
  }

    const summary = await refreshExtractionRunCounters(db, runId, true);
    return {
      runId,
      requestId,
      runStatus: summary.status,
      processed: summary.processed_count,
      claimsExtracted: summary.new_assertion_count,
      evidenceCreated: summary.canonical_write_success_count,
      selectedCount: summary.selected_count,
      processedCount: summary.processed_count,
      noClaimCount: summary.no_claim_count,
      failedCount: summary.failed_count,
      extractedClaimCount: summary.extracted_claim_count,
      newAssertionCount: summary.new_assertion_count,
      canonicalWriteSuccessCount: summary.canonical_write_success_count,
    };
  } catch (error: unknown) {
    if (runCreated) {
      try {
        await markExtractionRunFailed(db, runId, error);
      } catch {
        // A stale running row is more honest than claiming failed finalization
        // when the database could not record the failure.
      }
    }
    throw error;
  }
}

interface ExtractionRunRow {
  status: ClaimExtractionRunStatus;
  selected_count: number;
  processed_count: number;
  no_claim_count: number;
  failed_count: number;
  extracted_claim_count: number;
  new_assertion_count: number;
  canonical_write_success_count: number;
}

interface RunItemMembership {
  id: number;
  feed_item_id: number;
}

interface ExtractionEffectInput {
  runId: string;
  runItemId: number;
  feedItemId: number;
  effectOrdinal: number;
  claimText: string;
  claimClass: string;
  claimDomain: string;
  attemptOutcome: "inserted" | "reused" | "failed";
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  canonicalClaimId: string | null;
  assertionId: string | null;
  canonicalClaimInserted: boolean | null;
  assertionInserted: boolean | null;
  storyClaimInserted: boolean | null;
  failureCode: string | null;
  failureMessage: string | null;
}

async function createExtractionRun(
  db: D1Database,
  runId: string,
  options: ClaimExtractionRunOptions,
): Promise<void> {
  await db.prepare(`
    INSERT INTO claim_extraction_runs
      (id, trigger, algorithm_version, request_id, operator_email, operator_role, status)
    VALUES (?, ?, ?, ?, ?, ?, 'running')
  `).bind(
    runId,
    options.trigger,
    ALGORITHM_VERSION,
    options.requestId ?? null,
    options.operatorEmail ?? null,
    options.operatorRole ?? null,
  ).run();
}

async function persistSelectedItems(
  db: D1Database,
  runId: string,
  results: Array<FeedItem & { source_tier: string; source_treatment: string }>,
): Promise<void> {
  if (results.length === 0) return;
  await db.batch(results.map((row, ordinal) => db.prepare(`
    INSERT INTO claim_extraction_run_items (run_id, feed_item_id, ordinal)
    VALUES (?, ?, ?)
  `).bind(runId, row.id, ordinal)));
}

async function recordExtractionEffect(db: D1Database, effect: ExtractionEffectInput): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO claim_extraction_run_effects
        (run_id, run_item_id, feed_item_id, effect_ordinal, claim_text, claim_class,
         claim_domain, attempt_outcome, source_document_id, source_document_version_id,
         canonical_claim_id, assertion_id, canonical_claim_inserted, assertion_inserted,
         story_claim_inserted, failure_code, failure_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      effect.runId,
      effect.runItemId,
      effect.feedItemId,
      effect.effectOrdinal,
      effect.claimText.substring(0, 500),
      effect.claimClass,
      effect.claimDomain,
      effect.attemptOutcome,
      effect.sourceDocumentId,
      effect.sourceDocumentVersionId,
      effect.canonicalClaimId,
      effect.assertionId,
      effect.canonicalClaimInserted === null ? null : effect.canonicalClaimInserted ? 1 : 0,
      effect.assertionInserted === null ? null : effect.assertionInserted ? 1 : 0,
      effect.storyClaimInserted === null ? null : effect.storyClaimInserted ? 1 : 0,
      effect.failureCode,
      effect.failureMessage?.substring(0, 1000) ?? null,
    ).run();
  } catch (error: unknown) {
    throw new ExtractionLedgerWriteError(
      `Unable to record extraction effect: ${boundedExtractionError(error, 900)}`,
    );
  }
}

async function updateExtractionRunItem(
  db: D1Database,
  item: {
    runItemId: number;
    outcome: "extracted" | "no_claims" | "failed";
    pipelineStageId: number | null;
    extractedClaimCount: number;
    newAssertionCount: number;
    canonicalWriteSuccessCount: number;
    failureCode: string | null;
    failureMessage: string | null;
  },
): Promise<void> {
  await db.prepare(`
    UPDATE claim_extraction_run_items
    SET outcome = ?, pipeline_stage_id = ?, extracted_claim_count = ?,
        new_assertion_count = ?, canonical_write_success_count = ?,
        failure_code = ?, failure_message = ?, completed_at = datetime('now')
    WHERE id = ?
  `).bind(
    item.outcome,
    item.pipelineStageId,
    item.extractedClaimCount,
    item.newAssertionCount,
    item.canonicalWriteSuccessCount,
    item.failureCode,
    item.failureMessage,
    item.runItemId,
  ).run();
}

async function refreshExtractionRunCounters(
  db: D1Database,
  runId: string,
  finalize: boolean,
): Promise<ExtractionRunRow> {
  await db.prepare(`
    UPDATE claim_extraction_runs
    SET selected_count = (SELECT COUNT(*) FROM claim_extraction_run_items WHERE run_id = ?),
        processed_count = (SELECT COUNT(*) FROM claim_extraction_run_items WHERE run_id = ? AND outcome <> 'pending'),
        no_claim_count = (SELECT COUNT(*) FROM claim_extraction_run_items WHERE run_id = ? AND outcome = 'no_claims'),
        failed_count = (SELECT COUNT(*) FROM claim_extraction_run_items WHERE run_id = ? AND outcome = 'failed'),
        extracted_claim_count = (SELECT COALESCE(SUM(extracted_claim_count), 0) FROM claim_extraction_run_items WHERE run_id = ?),
        new_assertion_count = (SELECT COUNT(*) FROM claim_extraction_run_effects WHERE run_id = ? AND assertion_inserted = 1),
        canonical_write_success_count = (SELECT COUNT(*) FROM claim_extraction_run_effects WHERE run_id = ? AND attempt_outcome IN ('inserted', 'reused')),
        status = CASE WHEN ? = 1 THEN CASE
          WHEN (SELECT COUNT(*) FROM claim_extraction_run_items WHERE run_id = ? AND outcome = 'failed') > 0
            THEN 'completed_with_failures' ELSE 'completed' END ELSE status END,
        completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE completed_at END,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    runId, runId, runId, runId, runId, runId, runId,
    finalize ? 1 : 0, runId, finalize ? 1 : 0, runId,
  ).run();
  const row = await db.prepare(`
    SELECT status, selected_count, processed_count, no_claim_count, failed_count,
           extracted_claim_count, new_assertion_count, canonical_write_success_count
    FROM claim_extraction_runs WHERE id = ?
  `).bind(runId).first<ExtractionRunRow>();
  if (!row) throw new Error(`Extraction run ${runId} disappeared during finalization`);
  return {
    status: row.status,
    selected_count: Number(row.selected_count),
    processed_count: Number(row.processed_count),
    no_claim_count: Number(row.no_claim_count),
    failed_count: Number(row.failed_count),
    extracted_claim_count: Number(row.extracted_claim_count),
    new_assertion_count: Number(row.new_assertion_count),
    canonical_write_success_count: Number(row.canonical_write_success_count),
  };
}

async function markExtractionRunFailed(db: D1Database, runId: string, error: unknown): Promise<void> {
  const message = boundedExtractionError(error);
  await db.prepare(`
    UPDATE claim_extraction_runs
    SET status = 'failed', failure_code = 'run_failed', failure_message = ?,
        completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND status = 'running'
  `).bind(message, runId).run();
}

function boundedExtractionError(error: unknown, maximum = 1000): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.substring(0, maximum) || "Unknown extraction failure";
}

// ============================================================
// Pipeline stage tracking
// ============================================================
async function recordPipelineStage(
  db: D1Database,
  feedItemId: number,
  stage: string,
  status: string,
  summary: string,
  error?: string,
): Promise<number | null> {
  try {
    // Check if a record already exists
    const existing = await db.prepare(
      "SELECT id FROM pipeline_stages WHERE feed_item_id = ? AND stage = ?"
    ).bind(feedItemId, stage).first<{ id: number }>();

    if (existing) {
      await db.prepare(
        `UPDATE pipeline_stages
         SET completed_at = datetime('now'), status = ?, result_summary = ?, error_message = ?
         WHERE id = ?`
      ).bind(status, summary, error ?? null, existing.id).run();
      return existing.id;
    } else {
      const result = await db.prepare(
        `INSERT INTO pipeline_stages (feed_item_id, stage, algorithm_version, status, result_summary, error_message, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(feedItemId, stage, ALGORITHM_VERSION, status, summary, error ?? null).run();
      return result.meta.last_row_id == null ? null : Number(result.meta.last_row_id);
    }
  } catch {
    console.error("Claim pipeline stage tracking failed.");
    return null;
  }
}

// ============================================================
// Claim relationship discovery — run after extraction. KC-05G routes this
// work into review-gated canonical relationship proposals; the legacy
// claim_conflicts table is compatibility-only and is never mutated.
// ============================================================
export async function detectClaimConflicts(
  db: D1Database,
): Promise<{ conflictsDetected: number }> {
  const { results } = await db.prepare(
    `SELECT DISTINCT assertion.id
     FROM claim_assertions assertion
     JOIN canonical_claims claim ON claim.id = assertion.canonical_claim_id
     WHERE assertion.created_at >= datetime('now', '-3 days')
       AND assertion.reviewer_state <> 'rejected'
       AND claim.current_state <> 'retired'`
  ).all<{ id: string }>();
  let conflictsDetected = 0;
  for (const assertion of results ?? []) {
    const generated = await generateClaimRelationshipProposals(db, {
      sourceAssertionId: assertion.id,
      maxCandidates: 10,
    });
    conflictsDetected += generated.proposalsCreated;
  }
  return { conflictsDetected };
}

// ============================================================
// Conflict detection helpers
// ============================================================
function detectConflictType(
  textA: string,
  textB: string,
  classA: string,
  classB: string,
): string | null {
  const a = textA.toLowerCase();
  const b = textB.toLowerCase();

  // Vendor claim vs independent finding = potential source disagreement
  if (
    (classA === "official_vendor_claim" && classB === "independent_research_finding") ||
    (classA === "independent_research_finding" && classB === "official_vendor_claim")
  ) {
    return "source_disagreement";
  }

  // Check for direct contradiction signals
  const contradictionWords = [
    /\b(not|no|never|false|incorrect|wrong|misleading|inaccurate)\b/gi,
    /\b(contradict|refute|debunk|disprove|challenge|dispute)\b/gi,
    /\b(however|although|despite|contrary|unlike)\b/gi,
  ];

  let contradictionSignals = 0;
  for (const pattern of contradictionWords) {
    if (pattern.test(a)) contradictionSignals++;
    if (pattern.test(b)) contradictionSignals++;
    pattern.lastIndex = 0;
  }

  if (contradictionSignals >= 2) {
    return "direct_contradiction";
  }

  // Different methodologies or versions
  if (classA !== classB) {
    if (classA === "benchmark_result" || classB === "benchmark_result") {
      return "methodology_difference";
    }
    return "interpretation_difference";
  }

  return null;
}

function assessConflictSeverity(
  classA: string,
  classB: string,
  conflictType: string,
): "low" | "standard" | "high" | "critical" {
  if (conflictType === "direct_contradiction") return "high";
  if (conflictType === "source_disagreement") {
    // Vendor vs independent disagreement is high severity
    if (
      (classA === "official_vendor_claim" && classB === "independent_research_finding") ||
      (classA === "independent_research_finding" && classB === "official_vendor_claim")
    ) {
      return "high";
    }
    return "standard";
  }
  if (conflictType === "methodology_difference") return "standard";
  return "low";
}
