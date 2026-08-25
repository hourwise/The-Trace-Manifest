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
  scoreCursor?: string | null;
  indexLimit?: number;
  dryRun?: boolean;
}

export interface Kc11GHResult {
  state: "completed" | "partial" | "failed" | "disabled" | "evaluation_blocked";
  evaluation: ReturnType<typeof evaluateEvidencePolicy>;
  scores: HistoricalEvidenceScoreResult | null;
  indexing: KnowledgeEmbeddingRunSummary | null;
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
 * Run the bounded KC-11G/H gate in order. G must finish its current page
 * before H re-indexes approved records; a later invocation resumes G through
 * its cursor. The fixed policy set is evaluated before either write path.
 */
export async function runKc11GH(
  env: KnowledgeEmbeddingEnvironment,
  options: Kc11GHOptions = {},
): Promise<Kc11GHResult> {
  const evaluation = evaluateEvidencePolicy(evidencePolicyEvaluationFixtures());
  if (!evaluation.pass) {
    return { state: "evaluation_blocked", evaluation, scores: null, indexing: null };
  }

  if (env.TRACE_ENVIRONMENT !== "preview" || !env.AI || !env.KNOWLEDGE_VECTOR_INDEX) {
    return { state: "disabled", evaluation, scores: null, indexing: disabledIndexSummary() };
  }

  const scoreOptions: HistoricalEvidenceScoreOptions = {
    limit: options.scoreLimit,
    cursor: options.scoreCursor,
    dryRun: options.dryRun === true,
  };
  const scores = await bootstrapHistoricalEvidenceScores(env.DB, scoreOptions);
  if (scores.state === "partial") {
    return { state: "partial", evaluation, scores, indexing: null };
  }

  const indexOptions: KnowledgeEmbeddingRunOptions = {
    limit: options.indexLimit,
    dryRun: options.dryRun === true,
  };
  const indexing = await indexKnowledgeEmbeddings(env, indexOptions);
  return {
    state: indexing.state === "failed" ? "failed" : indexing.state,
    evaluation,
    scores,
    indexing,
  };
}
