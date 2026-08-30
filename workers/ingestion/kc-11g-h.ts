// KC-11G/H: bounded historical score bootstrap followed by the existing
// Preview-only approved-record embedding indexer. D1 remains authoritative.

import { evaluateEvidencePolicy } from "../../src/lib/server/evidence-evaluation";
import { evidencePolicyEvaluationFixtures } from "../../src/lib/server/evidence-evaluation-fixtures";
import {
  bootstrapHistoricalEvidenceScores,
  type HistoricalEvidenceScoreOptions,
  type HistoricalEvidenceScoreResult,
} from "../../src/lib/server/historical-evidence-scores";
import {
  indexKnowledgeEmbeddings,
  type KnowledgeEmbeddingEnvironment,
  type KnowledgeEmbeddingRunOptions,
  type KnowledgeEmbeddingRunSummary,
} from "./knowledge-embedding-index";

export interface Kc11GHOptions {
  scoreLimit?: number;
  indexLimit?: number;
  dryRun?: boolean;
}

export interface Kc11GHResult {
  state: "completed" | "partial" | "failed" | "disabled" | "evaluation_blocked";
  evaluation: ReturnType<typeof evaluateEvidencePolicy>;
  scores: HistoricalEvidenceScoreResult | null;
  indexing: KnowledgeEmbeddingRunSummary | null;
  errorCode?: "kc11g_score_failed" | "kc11h_index_failed";
}

export const KC11G_PREVIEW_D1_RESOURCE_ID = "f312f662-2252-4005-8103-1a40d546e16b";
const RESOURCE_IDENTITY_VERSION = "trace-d1-resource-v1";

interface RuntimeResourceIdentity {
  identity_version: string;
  environment: string;
  resource_id: string;
}

/**
 * The binding object does not expose its Cloudflare D1 database ID. The
 * immutable row inside the bound database is therefore checked against the
 * reviewed Preview database ID from wrangler.toml before any score mutation.
 */
export async function hasKc11PreviewDataPlaneIdentity(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(`
      SELECT identity_version, environment, resource_id
      FROM trace_runtime_resource_identity
      WHERE identity_key = 'd1'
    `).first<RuntimeResourceIdentity>();
    return row?.identity_version === RESOURCE_IDENTITY_VERSION
      && row.environment === "preview"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.resource_id)
      && row.resource_id.toLowerCase() === KC11G_PREVIEW_D1_RESOURCE_ID;
  } catch {
    // Missing migration, malformed legacy schema, and unavailable D1 all fail closed.
    return false;
  }
}

function disabledIndexSummary(): KnowledgeEmbeddingRunSummary {
  return {
    state: "disabled",
    runId: null,
    selected: 0,
    submitted: 0,
    indexed: 0,
    skipped: 0,
    deferred: 0,
    confirmationPending: 0,
    reconciled: 0,
    inputTokens: 0,
  };
}

/**
 * Run the bounded KC-11G/H gate in order. G must globally drain its cursorless
 * live work queue before H re-indexes approved records. The fixed policy set
 * and positive Preview D1 identity are checked before either write path.
 */
export async function runKc11GH(
  env: KnowledgeEmbeddingEnvironment,
  options: Kc11GHOptions = {},
): Promise<Kc11GHResult> {
  const evaluation = evaluateEvidencePolicy(evidencePolicyEvaluationFixtures());
  if (!evaluation.pass) {
    return { state: "evaluation_blocked", evaluation, scores: null, indexing: null };
  }

  if (env.TRACE_ENVIRONMENT !== "preview" || !env.AI || !env.KNOWLEDGE_VECTOR_INDEX
    || !await hasKc11PreviewDataPlaneIdentity(env.DB)) {
    return { state: "disabled", evaluation, scores: null, indexing: disabledIndexSummary() };
  }

  const scoreOptions: HistoricalEvidenceScoreOptions = {
    limit: options.scoreLimit,
    dryRun: options.dryRun === true,
  };
  let scores: HistoricalEvidenceScoreResult;
  try {
    scores = await bootstrapHistoricalEvidenceScores(env.DB, scoreOptions);
  } catch {
    return {
      state: "failed", evaluation, scores: null, indexing: null,
      errorCode: "kc11g_score_failed",
    };
  }
  if (scores.state === "partial") {
    return { state: "partial", evaluation, scores, indexing: null };
  }

  const indexOptions: KnowledgeEmbeddingRunOptions = {
    limit: options.indexLimit,
    dryRun: options.dryRun === true,
  };
  let indexing: KnowledgeEmbeddingRunSummary;
  try {
    indexing = await indexKnowledgeEmbeddings(env, indexOptions);
  } catch {
    return {
      state: "failed", evaluation, scores, indexing: null,
      errorCode: "kc11h_index_failed",
    };
  }
  return {
    state: indexing.state === "failed" ? "failed" : indexing.state,
    evaluation,
    scores,
    indexing,
  };
}
