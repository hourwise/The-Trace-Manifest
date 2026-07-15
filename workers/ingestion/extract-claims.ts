// The Trace Manifest — Claim Extraction Engine
// Phase 3: Rule-based claim extraction from feed item content
// Extracts structured claims, classifies them, scores evidence quality,
// and creates evidence records linking claims to their sources.
// Runs within Worker CPU limits; no external AI dependency.

import type { FeedItem } from "./types";
import type {
  ExtractedClaim,
  ClaimClass,
  ClaimDomain,
} from "./types";

// ============================================================
// Algorithm identity
// ============================================================
const ALGORITHM_VERSION = "rule-extraction-v1";

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
): Promise<{ processed: number; claimsExtracted: number; evidenceCreated: number }> {
  // Fetch clustered items with source info, excluding already-extracted
  const { results } = await db.prepare(
    `SELECT fi.*, s.tier as source_tier, s.treatment as source_treatment
     FROM feed_items fi
     JOIN sources s ON fi.source_id = s.id
     LEFT JOIN pipeline_stages ps ON ps.feed_item_id = fi.id AND ps.stage = 'claim_extracted'
     WHERE fi.ingestion_status IN ('clustered', 'classified')
     AND ps.id IS NULL
     AND fi.fetched_at >= datetime('now', '-7 days')
     ORDER BY fi.fetched_at DESC
     LIMIT 500`
  ).all<FeedItem & { source_tier: string; source_treatment: string }>();

  if (results.length === 0) {
    return { processed: 0, claimsExtracted: 0, evidenceCreated: 0 };
  }

  const total = results.length;
  let claimsExtracted = 0;
  let evidenceCreated = 0;
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

    // Find the cluster this item belongs to
    let clusterId: number | null = null;
    try {
      const clusterRow = await db.prepare(
        "SELECT cluster_id FROM story_cluster_members WHERE feed_item_id = ? LIMIT 1"
      ).bind(item.id).first<{ cluster_id: number }>();
      clusterId = clusterRow?.cluster_id ?? null;
    } catch {
      // Item may not be clustered yet — still extract claims
    }

    // Extract claims
    const claims = extractClaimsFromItem(
      item,
      row.source_tier ?? "C",
      row.source_treatment ?? "",
    );

    if (claims.length === 0) {
      // Mark as processed even if no claims found
      await recordPipelineStage(db, item.id, "claim_extracted", "completed",
        `No claims extracted — item content too short or no patterns matched`);
      processed++;
      onProgress?.(processed, total);
      continue;
    }

    // Store claims and evidence in a transaction-like batch
    for (const claim of claims) {
      try {
        // Insert the claim
        const { meta } = await db.prepare(
          `INSERT INTO claims
           (cluster_id, feed_item_id, claim_text, claim_class, claim_domain,
            severity, evidence_quality, confidence_score, extraction_method, extraction_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rule_based', ?)`
        ).bind(
          clusterId,
          item.id,
          claim.claimText,
          claim.claimClass,
          claim.claimDomain,
          claim.severity,
          claim.evidenceQuality,
          claim.confidenceScore,
          ALGORITHM_VERSION,
        ).run();

        const claimId = meta.last_row_id;
        claimsExtracted++;

        // Create initial evidence record — the source item itself is evidence
        await db.prepare(
          `INSERT INTO claim_evidence
           (claim_id, feed_item_id, relationship, evidence_summary, source_tier, is_primary_source)
           VALUES (?, ?, 'reports', ?, ?, 1)`
        ).bind(
          claimId,
          item.id,
          `Original source: ${claim.supportingPhrase}`,
          row.source_tier ?? "C",
        ).run();

        evidenceCreated++;
      } catch {
        console.error(`Claim extraction failed for item ${item.id}.`);
      }
    }

    // Mark pipeline stage
    await recordPipelineStage(db, item.id, "claim_extracted", "completed",
      `${claims.length} claims extracted`);
    processed++;
    onProgress?.(processed, total);
  }

  return { processed, claimsExtracted, evidenceCreated };
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
): Promise<void> {
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
    } else {
      await db.prepare(
        `INSERT INTO pipeline_stages (feed_item_id, stage, algorithm_version, status, result_summary, error_message, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(feedItemId, stage, ALGORITHM_VERSION, status, summary, error ?? null).run();
    }
  } catch {
    console.error("Claim pipeline stage tracking failed.");
  }
}

// ============================================================
// Claim conflict detection — run after extraction to find
// contradictory claims within the same cluster
// ============================================================
export async function detectClaimConflicts(
  db: D1Database,
): Promise<{ conflictsDetected: number }> {
  // Find clusters with multiple claims
  const { results: clusters } = await db.prepare(
    `SELECT c.id as cluster_id, COUNT(*) as claim_count
     FROM claims c
     WHERE c.created_at >= datetime('now', '-3 days')
     AND c.is_disputed = 0
     GROUP BY c.cluster_id
     HAVING COUNT(*) >= 2`
  ).all<{ cluster_id: number; claim_count: number }>();

  if (clusters.length === 0) {
    return { conflictsDetected: 0 };
  }

  let conflictsDetected = 0;

  for (const cluster of clusters) {
    const { results: claimPairs } = await db.prepare(
      `SELECT c1.id as claim_a_id, c2.id as claim_b_id,
              c1.claim_text as text_a, c2.claim_text as text_b,
              c1.claim_class as class_a, c2.claim_class as class_b,
              c1.claim_domain as domain_a, c2.claim_domain as domain_b
       FROM claims c1
       JOIN claims c2 ON c1.cluster_id = c2.cluster_id AND c1.id < c2.id
       WHERE c1.cluster_id = ?
       AND c1.claim_domain = c2.claim_domain
       AND c1.claim_class != c2.claim_class`
    ).bind(cluster.cluster_id).all<{
      claim_a_id: number; claim_b_id: number;
      text_a: string; text_b: string;
      class_a: string; class_b: string;
      domain_a: string; domain_b: string;
    }>();

    if (!claimPairs) continue;

    for (const pair of claimPairs) {
      // Heuristic conflict detection:
      // 1. Different claim classes on the same domain (e.g., vendor claim vs independent finding)
      // 2. Opposite-sentiment phrases

      const conflictType = detectConflictType(pair.text_a, pair.text_b, pair.class_a, pair.class_b);

      if (conflictType) {
        const severity = assessConflictSeverity(pair.class_a, pair.class_b, conflictType);

        await db.prepare(
          `INSERT INTO claim_conflicts (claim_a_id, claim_b_id, conflict_type, severity)
           VALUES (?, ?, ?, ?)`
        ).bind(pair.claim_a_id, pair.claim_b_id, conflictType, severity).run();

        // Mark both claims as disputed
        await db.prepare(
          "UPDATE claims SET is_disputed = 1, updated_at = datetime('now') WHERE id IN (?, ?)"
        ).bind(pair.claim_a_id, pair.claim_b_id).run();

        conflictsDetected++;
      }
    }
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
