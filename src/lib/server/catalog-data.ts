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
