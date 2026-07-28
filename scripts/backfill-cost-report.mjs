#!/usr/bin/env node
// KC-11B: read-only historical backfill cost dry-run.
// This script consumes a KC-11A inventory and never reserves budget, calls a
// model, writes D1, captures a source, or changes a publication state.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const BACKFILL_COST_POLICY_VERSION = "kc-11b-v1";
export const ROUTINE_MODEL = "deepseek-v4-flash";
export const ROUTINE_MODEL_PRICING = {
  inputPerMillionUsd: 1,
  outputPerMillionUsd: 5,
  source: "src/ai/config.ts defaults; production must provide reviewed pricing variables",
};
export const EMBEDDING_POLICY = {
  version: "kc09-bge-m3-v1",
  provider: "workers_ai",
  model: "@cf/baai/bge-m3",
  inputUsdPerMillionTokens: 0.012,
  backfillInputTokenCeiling: 1_000_000,
  maximumInputTokensPerBatch: 16_000,
  source: "src/lib/server/knowledge-embedding-policy.ts",
};

const BACKFILL_ORDER = [
  "published_story",
  "approved_knowledge_document",
  "correction",
  "model",
  "provider",
  "benchmark",
  "static_knowledge_page",
  "guide",
  "knowledge_authoring_input",
];

// The input ceilings are deliberately explicit because KC-11A contains
// metadata and URLs, not captured source bodies. They are upper bounds for the
// dry-run and are not targets for a provider request.
export const TASK_POLICIES = {
  extract_source_structure: { inputTokens: 12_000, outputTokens: 800, callsPerSource: 1 },
  summarise_source: { inputTokens: 12_000, outputTokens: 800, callsPerSource: 1 },
  extract_source_claims: { inputTokens: 12_000, outputTokens: 1_500, callsPerSource: 1 },
  canonicalise_claim: { inputTokens: 1_500, outputTokens: 600, callsPerClaim: 1 },
  classify_provenance: { inputTokens: 1_500, outputTokens: 600, callsPerClaim: 1 },
  detect_knowledge_impact: { inputTokens: 4_000, outputTokens: 800, callsPerSource: 1 },
  synthesise_multi_position_answer: { inputTokens: 12_000, outputTokens: 1_200, calls: 0 },
};

const SOURCE_RECORD_CATEGORIES = new Set([
  "published_story", "approved_knowledge_document", "correction", "model", "provider", "benchmark",
  "static_knowledge_page", "guide", "knowledge_authoring_input",
]);

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer.`);
  return parsed;
}

function roundMoney(value) {
  return Math.ceil(value * 100_000) / 100_000;
}

function moneyForTokens(inputTokens, outputTokens, inputRate, outputRate) {
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

function categoryItems(inventory, category) {
  const values = inventory?.categories?.[category];
  if (!Array.isArray(values)) throw new Error(`Inventory category is missing or invalid: ${category}.`);
  return values;
}

function sumCounts(inventory) {
  return BACKFILL_ORDER.reduce((total, category) => total + categoryItems(inventory, category).length, 0);
}

export function estimateBackfillCost(inventory, options = {}) {
  if (inventory?.schemaVersion !== "kc-11a-v1") {
    throw new Error("KC-11B requires a kc-11a-v1 inventory.");
  }

  const inputRate = options.inputRate ?? ROUTINE_MODEL_PRICING.inputPerMillionUsd;
  const outputRate = options.outputRate ?? ROUTINE_MODEL_PRICING.outputPerMillionUsd;
  const maxClaimsPerSource = options.maxClaimsPerSource ?? 4;
  const embeddingCeiling = options.embeddingInputTokenCeiling ?? EMBEDDING_POLICY.backfillInputTokenCeiling;
  if (!Number.isFinite(inputRate) || inputRate < 0 || !Number.isFinite(outputRate) || outputRate < 0) {
    throw new Error("Model token rates must be non-negative numbers.");
  }
  nonNegativeInteger(maxClaimsPerSource, "maxClaimsPerSource");
  nonNegativeInteger(embeddingCeiling, "embeddingInputTokenCeiling");

  const sourceCount = categoryItems(inventory, "source_url").length;
  const contentCount = sumCounts(inventory);
  const tasks = [];
  const addTask = (taskType, calls, inputTokens, outputTokens, rationale) => {
    const maxInputTokens = calls * inputTokens;
    const maxOutputTokens = calls * outputTokens;
    tasks.push({
      taskType,
      calls,
      inputTokenCeilingPerCall: inputTokens,
      outputTokenCeilingPerCall: outputTokens,
      maxInputTokens,
      maxOutputTokens,
      maxCostUsd: roundMoney(moneyForTokens(maxInputTokens, maxOutputTokens, inputRate, outputRate)),
      rationale,
    });
  };

  addTask("deterministic_fetchability_check", sourceCount, 0, 0,
    "One deterministic URL admission/fetchability check per unique source URL; no model cost.");
  addTask("extract_source_structure", sourceCount, TASK_POLICIES.extract_source_structure.inputTokens,
    TASK_POLICIES.extract_source_structure.outputTokens, "At most one governed extraction for each admitted source.");
  addTask("summarise_source", sourceCount, TASK_POLICIES.summarise_source.inputTokens,
    TASK_POLICIES.summarise_source.outputTokens, "At most one bounded summary for each admitted source.");
  addTask("extract_source_claims", sourceCount, TASK_POLICIES.extract_source_claims.inputTokens,
    TASK_POLICIES.extract_source_claims.outputTokens, "At most one claims/opinions extraction for each admitted source.");
  addTask("canonicalise_claim", sourceCount * maxClaimsPerSource, TASK_POLICIES.canonicalise_claim.inputTokens,
    TASK_POLICIES.canonicalise_claim.outputTokens, `Upper bound of ${maxClaimsPerSource} extracted claims per source; deterministic extraction may reduce this.`);
  addTask("classify_provenance", sourceCount * maxClaimsPerSource, TASK_POLICIES.classify_provenance.inputTokens,
    TASK_POLICIES.classify_provenance.outputTokens, "One provenance proposal per bounded canonical-claim candidate.");
  addTask("detect_knowledge_impact", sourceCount, TASK_POLICIES.detect_knowledge_impact.inputTokens,
    TASK_POLICIES.detect_knowledge_impact.outputTokens, "At most one impact proposal pass per admitted source.");
  addTask("synthesise_multi_position_answer", 0, TASK_POLICIES.synthesise_multi_position_answer.inputTokens,
    TASK_POLICIES.synthesise_multi_position_answer.outputTokens, "Answer synthesis is not part of historical backfill.");

  const extractionInputTokens = tasks.reduce((total, task) => total + task.maxInputTokens, 0);
  const extractionOutputTokens = tasks.reduce((total, task) => total + task.maxOutputTokens, 0);
  const extractionCostUsd = roundMoney(moneyForTokens(extractionInputTokens, extractionOutputTokens, inputRate, outputRate));
  const embeddingCalls = embeddingCeiling === 0 ? 0 : Math.ceil(embeddingCeiling / EMBEDDING_POLICY.maximumInputTokensPerBatch);
  const embeddingCostUsd = roundMoney((embeddingCeiling * EMBEDDING_POLICY.inputUsdPerMillionTokens) / 1_000_000);
  const maxCostUsd = roundMoney(extractionCostUsd + embeddingCostUsd);

  return {
    schemaVersion: "kc-11b-v1-cost-report",
    policyVersion: BACKFILL_COST_POLICY_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    inventory: {
      schemaVersion: inventory.schemaVersion,
      generatedAt: inventory.generatedAt ?? null,
      totalItems: inventory.totalItems ?? contentCount + sourceCount,
      contentItems: contentCount,
      uniqueSourceUrls: sourceCount,
      counts: inventory.counts ?? Object.fromEntries(Object.entries(inventory.categories).map(([key, values]) => [key, values.length])),
    },
    backfillOrder: BACKFILL_ORDER,
    execution: {
      readOnly: true,
      budgetReserved: false,
      providerCalled: false,
      approvalRequired: true,
      expectedDeterministicCalls: sourceCount,
      expectedGovernedAiCalls: tasks.filter(task => task.taskType !== "deterministic_fetchability_check").reduce((total, task) => total + task.calls, 0),
      expectedEmbeddingBatches: embeddingCalls,
    },
    model: {
      tier: "routine",
      provider: "deepseek",
      model: ROUTINE_MODEL,
      inputUsdPerMillionTokens: inputRate,
      outputUsdPerMillionTokens: outputRate,
      pricingSource: ROUTINE_MODEL_PRICING.source,
      strongerModelEscalation: "excluded; contradiction/high-impact exceptions require separate approval",
    },
    tasks,
    totals: {
      extractionMaxInputTokens: extractionInputTokens,
      extractionMaxOutputTokens: extractionOutputTokens,
      extractionMaxCostUsd: extractionCostUsd,
      embeddingInputTokenCeiling: embeddingCeiling,
      embeddingMaxCostUsd: embeddingCostUsd,
      maxCostUsd,
      recommendedTotalBudgetUsd: maxCostUsd,
    },
    embedding: {
      ...EMBEDDING_POLICY,
      callsAreBatchCeiling: true,
      note: "KC-11A has no captured source-body or chunk counts. Embeddings therefore use the separately governed KC-09 backfill token envelope, not an invented per-record chunk estimate.",
    },
    assumptions: [
      "The report is a maximum-cost ceiling, not an expected spend forecast or a budget reservation.",
      "Only admitted, fetchable source content may proceed; rejected, unavailable, unchanged, or cached content costs less than this ceiling.",
      "Deterministic parsing and existing rule extraction run before governed AI and may reduce governed calls.",
      `The claim fan-out ceiling is ${maxClaimsPerSource} candidates per source because KC-11A inventories metadata and URLs, not extracted claim counts.`,
      "Canonical claim and provenance calls are bounded proposals; no model output may write public D1 directly.",
      "Embedding spend is separately capped by the KC-09 BGE-M3 backfill input-token envelope.",
      "Multi-position answer synthesis and stronger-model escalation are outside the historical backfill budget and require a separate reviewed estimate.",
    ],
    review: {
      status: "pending_explicit_approval",
      reviewerDecisionRequired: [
        "confirm the inventory target and source admission scope",
        "confirm routine-model pricing variables in the execution environment",
        "approve or lower the claim fan-out ceiling",
        "approve the recommended total budget before any batch starts",
      ],
    },
  };
}

function main() {
  const inventoryPath = argValue("--inventory");
  if (!inventoryPath) throw new Error("Usage: node scripts/backfill-cost-report.mjs --inventory <kc-11a-json> [--output <path>] [--summary].");
  const inventory = JSON.parse(readFileSync(resolve(inventoryPath), "utf8"));
  const options = {
    inputRate: argValue("--input-rate") === null ? undefined : positiveNumber(argValue("--input-rate"), "--input-rate"),
    outputRate: argValue("--output-rate") === null ? undefined : positiveNumber(argValue("--output-rate"), "--output-rate"),
    maxClaimsPerSource: argValue("--max-claims-per-source") === null ? undefined : nonNegativeInteger(argValue("--max-claims-per-source"), "--max-claims-per-source"),
    embeddingInputTokenCeiling: argValue("--embedding-input-token-ceiling") === null ? undefined : nonNegativeInteger(argValue("--embedding-input-token-ceiling"), "--embedding-input-token-ceiling"),
  };
  const report = estimateBackfillCost(inventory, options);
  const output = JSON.stringify(report, null, 2);
  const outputPath = argValue("--output");
  if (outputPath) writeFileSync(resolve(outputPath), `${output}\n`, "utf8");
  if (hasArg("--summary")) {
    console.log(JSON.stringify({
      schemaVersion: report.schemaVersion,
      policyVersion: report.policyVersion,
      contentItems: report.inventory.contentItems,
      uniqueSourceUrls: report.inventory.uniqueSourceUrls,
      expectedDeterministicCalls: report.execution.expectedDeterministicCalls,
      expectedGovernedAiCalls: report.execution.expectedGovernedAiCalls,
      expectedEmbeddingBatches: report.execution.expectedEmbeddingBatches,
      extractionMaxInputTokens: report.totals.extractionMaxInputTokens,
      extractionMaxOutputTokens: report.totals.extractionMaxOutputTokens,
      embeddingInputTokenCeiling: report.totals.embeddingInputTokenCeiling,
      maxCostUsd: report.totals.maxCostUsd,
      reviewStatus: report.review.status,
    }, null, 2));
  } else if (!outputPath) {
    console.log(output);
  } else {
    console.log(`KC-11B cost report written to ${outputPath}`);
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/backfill-cost-report.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(`KC-11B cost report failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
