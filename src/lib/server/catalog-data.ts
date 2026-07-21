export interface PublicModel {
  id: number;
  name: string;
  slug: string;
  provider: string;
  modelFamily: string | null;
  version: string | null;
  releaseDate: string | null;
  status: string;
  openness: string;
  licence: string | null;
  parameterCount: string | null;
  contextWindow: string | null;
  modalities: string;
  toolUse: boolean;
  structuredOutput: boolean;
  apiAvailable: boolean;
  localAvailable: boolean;
  description: string | null;
  bestUseCases: string[];
  weaknesses: string[];
  hardwareRequirements: string | null;
  quantisationOptions: string | null;
  lastVerifiedAt: string | null;
}

export interface PublicProvider {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  regions: string[];
  apiCompatibility: string | null;
  enterpriseSupport: boolean;
  lastVerifiedAt: string | null;
}

export interface PublicBenchmark {
  id: number;
  name: string;
  slug: string;
  version: string | null;
  owner: string | null;
  purpose: string;
  domain: string;
  healthStatus: string;
  reproducibility: string | null;
  contaminationConcern: string | null;
  saturationLevel: string | null;
  codeAvailable: boolean;
  dataAvailable: boolean;
  codeUrl: string | null;
  dataUrl: string | null;
  lastReviewedAt: string | null;
}

export interface PublicBenchmarkRun {
  id: number;
  modelName: string | null;
  scoreDisplay: string;
  isVendorRun: boolean;
  isIndependent: boolean;
  comparableResults: boolean;
  testDate: string;
  sourceUrl: string | null;
}

function commaList(value: string | null): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 30);
}

function validSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function model(row: Record<string, unknown>): PublicModel {
  return {
    id: row.id as number, name: row.name as string, slug: row.slug as string, provider: row.provider as string,
    modelFamily: row.model_family as string | null, version: row.version as string | null,
    releaseDate: row.release_date as string | null, status: row.status as string, openness: row.openness as string,
    licence: row.licence as string | null, parameterCount: row.parameter_count as string | null,
    contextWindow: row.context_window as string | null, modalities: row.modalities as string,
    toolUse: Boolean(row.tool_use), structuredOutput: Boolean(row.structured_output),
    apiAvailable: Boolean(row.api_available), localAvailable: Boolean(row.local_available),
    description: row.description as string | null, bestUseCases: commaList(row.best_use_cases as string | null),
    weaknesses: commaList(row.weaknesses as string | null), hardwareRequirements: row.hardware_requirements as string | null,
    quantisationOptions: row.quantisation_options as string | null, lastVerifiedAt: row.last_verified_at as string | null,
  };
}

const MODEL_COLUMNS = `id, name, slug, provider, model_family, version, release_date, status, openness, licence,
  parameter_count, context_window, modalities, tool_use, structured_output, api_available, local_available,
  description, best_use_cases, weaknesses, hardware_requirements, quantisation_options, last_verified_at`;

export async function getPublishedModels(db: D1Database): Promise<PublicModel[]> {
  const result = await db.prepare(`SELECT ${MODEL_COLUMNS} FROM models
    WHERE publication_status = 'published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND last_verified_at IS NOT NULL
    ORDER BY name LIMIT 200`).all<Record<string, unknown>>();
  return result.results.filter((row) => validSlug(row.slug)).map(model);
}

export async function getPublishedModelBySlug(db: D1Database, slug: string): Promise<PublicModel | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const row = await db.prepare(`SELECT ${MODEL_COLUMNS} FROM models
    WHERE slug = ? AND publication_status = 'published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND last_verified_at IS NOT NULL`)
    .bind(slug).first<Record<string, unknown>>();
  return row ? model(row) : null;
}

export async function getPublishedProviders(db: D1Database): Promise<PublicProvider[]> {
  const result = await db.prepare(`
    SELECT id, name, slug, website, regions, api_compatibility, enterprise_support, last_verified_at
    FROM providers WHERE publication_status = 'published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND last_verified_at IS NOT NULL
    ORDER BY name LIMIT 200
  `).all<Record<string, unknown>>();
  return result.results.filter((row) => validSlug(row.slug)).map((row) => ({
    id: row.id as number, name: row.name as string, slug: row.slug as string,
    website: safeUrl(row.website as string | null), regions: commaList(row.regions as string | null),
    apiCompatibility: row.api_compatibility as string | null, enterpriseSupport: Boolean(row.enterprise_support),
    lastVerifiedAt: row.last_verified_at as string | null,
  }));
}

function benchmark(row: Record<string, unknown>): PublicBenchmark {
  return {
    id: row.id as number, name: row.name as string, slug: row.slug as string, version: row.version as string | null,
    owner: row.owner as string | null, purpose: row.purpose as string, domain: row.domain as string,
    healthStatus: row.health_status as string, reproducibility: row.reproducibility as string | null,
    contaminationConcern: row.contamination_concern as string | null, saturationLevel: row.saturation_level as string | null,
    codeAvailable: Boolean(row.code_available), dataAvailable: Boolean(row.data_available),
    codeUrl: safeUrl(row.code_url as string | null), dataUrl: safeUrl(row.data_url as string | null),
    lastReviewedAt: row.last_reviewed_at as string | null,
  };
}

const BENCHMARK_COLUMNS = `id, name, slug, version, owner, purpose, domain, health_status, reproducibility,
  contamination_concern, saturation_level, code_available, data_available, code_url, data_url, last_reviewed_at`;

export async function getPublishedBenchmarks(db: D1Database): Promise<PublicBenchmark[]> {
  const result = await db.prepare(`SELECT ${BENCHMARK_COLUMNS} FROM benchmarks
    WHERE publication_status = 'published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND last_reviewed_at IS NOT NULL
    ORDER BY name LIMIT 200`).all<Record<string, unknown>>();
  return result.results.filter((row) => validSlug(row.slug)).map(benchmark);
}

export async function getPublishedBenchmarkBySlug(db: D1Database, slug: string): Promise<PublicBenchmark | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const row = await db.prepare(`SELECT ${BENCHMARK_COLUMNS} FROM benchmarks
    WHERE slug = ? AND publication_status = 'published' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND last_reviewed_at IS NOT NULL`)
    .bind(slug).first<Record<string, unknown>>();
  return row ? benchmark(row) : null;
}

export async function getPublishedBenchmarkRuns(db: D1Database, benchmarkId: number): Promise<PublicBenchmarkRun[]> {
  const result = await db.prepare(`
    SELECT br.id, m.name AS model_name, br.score, br.score_display, br.is_vendor_run, br.is_independent,
           br.comparable_results, br.test_date, br.source_url
    FROM benchmark_runs br LEFT JOIN models m ON m.id = br.model_id
    WHERE br.benchmark_id = ? AND br.publication_status = 'published'
      AND br.reviewed_by IS NOT NULL AND br.reviewed_at IS NOT NULL
      AND br.source_url IS NOT NULL AND date(br.test_date) <= date('now')
      AND (m.id IS NULL OR (m.publication_status = 'published' AND m.reviewed_by IS NOT NULL
        AND m.reviewed_at IS NOT NULL AND m.last_verified_at IS NOT NULL))
    ORDER BY br.test_date DESC, br.id DESC LIMIT 200
  `).bind(benchmarkId).all<Record<string, unknown>>();
  return result.results.filter((row) => safeUrl(row.source_url as string | null) !== null).map((row) => ({
    id: row.id as number, modelName: row.model_name as string | null,
    scoreDisplay: (row.score_display ?? String(row.score)) as string,
    isVendorRun: Boolean(row.is_vendor_run), isIndependent: Boolean(row.is_independent),
    comparableResults: Boolean(row.comparable_results), testDate: row.test_date as string,
    sourceUrl: safeUrl(row.source_url as string | null),
  }));
}

// ============================================================
// TRACE aggregate model scores
// ============================================================

export interface TraceModelScore {
  modelId: number;
  modelName: string;
  modelSlug: string;
  provider: string;
  /** Weighted aggregate 0–100; null if fewer than 2 benchmark sources */
  aggregateScore: number | null;
  /** Number of distinct benchmarks contributing to the score */
  benchmarkCount: number;
  /** Number of independent runs */
  independentRuns: number;
  /** Number of vendor-reported runs */
  vendorRuns: number;
  /** Individual benchmark results that feed the aggregate */
  breakdowns: TraceScoreBreakdown[];
  /** When the latest contributing run was recorded */
  lastUpdated: string | null;
}

export interface TraceScoreBreakdown {
  benchmarkName: string;
  benchmarkSlug: string;
  scoreDisplay: string;
  score: number;
  isIndependent: boolean;
  testDate: string;
  sourceUrl: string | null;
}

/**
 * Compute TRACE aggregate scores for all models with published benchmark runs.
 * Independent runs are weighted 3×; vendor runs 1×. Only comparable results
 * are included. A model must have ≥2 distinct benchmark sources to receive
 * an aggregate score.
 */
export async function getTraceModelScores(db: D1Database): Promise<TraceModelScore[]> {
  const result = await db.prepare(`
    SELECT m.id AS model_id, m.name AS model_name, m.slug AS model_slug,
           m.provider, b.name AS benchmark_name, b.slug AS benchmark_slug,
           br.score, br.score_display, br.is_vendor_run, br.is_independent,
           br.comparable_results, br.test_date, br.source_url
    FROM benchmark_runs br
    JOIN benchmarks b ON b.id = br.benchmark_id
    JOIN models m ON m.id = br.model_id
    WHERE br.publication_status = 'published'
      AND br.reviewed_by IS NOT NULL AND br.reviewed_at IS NOT NULL
      AND br.source_url IS NOT NULL AND date(br.test_date) <= date('now')
      AND br.comparable_results = 1
      AND m.publication_status = 'published' AND m.reviewed_by IS NOT NULL
      AND m.reviewed_at IS NOT NULL AND m.last_verified_at IS NOT NULL
      AND b.publication_status = 'published' AND b.reviewed_by IS NOT NULL
      AND b.reviewed_at IS NOT NULL AND b.last_reviewed_at IS NOT NULL
    ORDER BY m.name, br.test_date DESC
  `).all<{
    model_id: number; model_name: string; model_slug: string; provider: string;
    benchmark_name: string; benchmark_slug: string;
    score: number; score_display: string | null;
    is_vendor_run: number; is_independent: number;
    comparable_results: number; test_date: string; source_url: string | null;
  }>();

  // Group runs by model
  const grouped = new Map<number, {
    modelName: string; modelSlug: string; provider: string;
    runs: TraceScoreBreakdown[];
  }>();

  for (const row of result.results) {
    const sourceUrl = safeUrl(row.source_url as string | null);
    if (!sourceUrl) continue;

    const breakdown: TraceScoreBreakdown = {
      benchmarkName: row.benchmark_name,
      benchmarkSlug: row.benchmark_slug,
      scoreDisplay: (row.score_display ?? String(row.score)),
      score: row.score,
      isIndependent: Boolean(row.is_independent),
      testDate: row.test_date,
      sourceUrl,
    };

    if (!grouped.has(row.model_id)) {
      grouped.set(row.model_id, {
        modelName: row.model_name,
        modelSlug: row.model_slug,
        provider: row.provider,
        runs: [],
      });
    }
    grouped.get(row.model_id)!.runs.push(breakdown);
  }

  // Compute aggregate scores
  const scores: TraceModelScore[] = [];
  for (const [modelId, data] of grouped) {
    const { runs } = data;
    const distinctBenchmarks = new Set(runs.map(r => r.benchmarkSlug)).size;
    const independentRuns = runs.filter(r => r.isIndependent).length;
    const vendorRuns = runs.filter(r => !r.isIndependent).length;

    // Weighted average: independent ×3, vendor ×1
    let weightedSum = 0;
    let totalWeight = 0;
    for (const run of runs) {
      const weight = run.isIndependent ? 3 : 1;
      weightedSum += run.score * weight;
      totalWeight += weight;
    }

    const aggregateScore = distinctBenchmarks >= 2
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : null;

    const lastUpdated = runs.reduce((latest, r) =>
      !latest || r.testDate > latest ? r.testDate : latest, null as string | null);

    scores.push({
      modelId,
      modelName: data.modelName,
      modelSlug: data.modelSlug,
      provider: data.provider,
      aggregateScore,
      benchmarkCount: distinctBenchmarks,
      independentRuns,
      vendorRuns,
      breakdowns: runs,
      lastUpdated,
    });
  }

  // Sort: scored models first (highest score), then by benchmark count
  scores.sort((a, b) => {
    if (a.aggregateScore !== null && b.aggregateScore !== null) return b.aggregateScore - a.aggregateScore;
    if (a.aggregateScore !== null) return -1;
    if (b.aggregateScore !== null) return 1;
    return b.benchmarkCount - a.benchmarkCount;
  });

  return scores;
}
