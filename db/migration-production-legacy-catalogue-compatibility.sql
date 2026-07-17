-- Production forward repair for the missing catalogue tables observed on
-- trace-manifest-db on 17 July 2026. Apply after
-- migration-production-legacy-claims-compatibility.sql and before
-- migration-stabilisation-security.sql.
--
-- All records begin as drafts when the following stabilisation migration adds
-- publication status columns. No catalogue record is published by this file.

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER REFERENCES entities(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  provider_entity_id INTEGER REFERENCES entities(id),
  model_family TEXT,
  version TEXT,
  release_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deprecated','superseded','archived','announced')),
  openness TEXT NOT NULL CHECK(openness IN ('closed','open_weight','open_source','api_only')),
  licence TEXT,
  parameter_count TEXT,
  context_window TEXT,
  modalities TEXT NOT NULL DEFAULT 'text',
  tool_use BOOLEAN NOT NULL DEFAULT 0,
  structured_output BOOLEAN NOT NULL DEFAULT 0,
  api_available BOOLEAN NOT NULL DEFAULT 0,
  local_available BOOLEAN NOT NULL DEFAULT 0,
  description TEXT,
  best_use_cases TEXT,
  weaknesses TEXT,
  hardware_requirements TEXT,
  quantisation_options TEXT,
  superseded_by INTEGER REFERENCES models(id),
  last_verified_at TEXT,
  verified_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_models_slug ON models(slug);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
CREATE INDEX IF NOT EXISTS idx_models_openness ON models(openness);

CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL REFERENCES models(id),
  version_label TEXT NOT NULL,
  release_date TEXT,
  change_summary TEXT,
  benchmark_scores_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER REFERENCES entities(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website TEXT,
  api_docs_url TEXT,
  status_page_url TEXT,
  regions TEXT,
  data_retention_policy TEXT,
  privacy_terms_url TEXT,
  enterprise_support BOOLEAN NOT NULL DEFAULT 0,
  api_compatibility TEXT,
  moderation_policy TEXT,
  commercial_restrictions TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_providers_slug ON providers(slug);

CREATE TABLE IF NOT EXISTS provider_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  model_id INTEGER NOT NULL REFERENCES models(id),
  input_price_per_1m_tokens REAL,
  output_price_per_1m_tokens REAL,
  cached_input_price_per_1m_tokens REAL,
  fine_tuning_price REAL,
  rate_limit_rpm INTEGER,
  rate_limit_tpm INTEGER,
  supports_batch BOOLEAN NOT NULL DEFAULT 0,
  supports_caching BOOLEAN NOT NULL DEFAULT 0,
  supports_fine_tuning BOOLEAN NOT NULL DEFAULT 0,
  supports_streaming BOOLEAN NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_provider ON provider_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_pm_model ON provider_models(model_id);

CREATE TABLE IF NOT EXISTS pricing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_model_id INTEGER NOT NULL REFERENCES provider_models(id),
  input_price REAL,
  output_price REAL,
  cached_input_price REAL,
  change_reason TEXT,
  source_url TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ph_provider_model ON pricing_history(provider_model_id);

CREATE TABLE IF NOT EXISTS benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER REFERENCES entities(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  version TEXT,
  owner TEXT,
  purpose TEXT NOT NULL,
  domain TEXT NOT NULL,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK(health_status IN ('healthy','limited','saturating','contamination_concern','poorly_reproducible','vendor_specific','deprecated')),
  reproducibility TEXT CHECK(reproducibility IN ('reproducible','partially_reproducible','not_reproducible','unknown')),
  contamination_concern TEXT CHECK(contamination_concern IN ('low','medium','high','unknown')),
  saturation_level TEXT,
  code_available BOOLEAN NOT NULL DEFAULT 0,
  data_available BOOLEAN NOT NULL DEFAULT 0,
  code_url TEXT,
  data_url TEXT,
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_slug ON benchmarks(slug);
CREATE INDEX IF NOT EXISTS idx_benchmarks_health ON benchmarks(health_status);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  benchmark_id INTEGER NOT NULL REFERENCES benchmarks(id),
  model_id INTEGER REFERENCES models(id),
  model_version_id INTEGER REFERENCES model_versions(id),
  score REAL NOT NULL,
  score_display TEXT,
  prompting_method TEXT,
  tool_access BOOLEAN,
  reasoning_settings TEXT,
  sampling_settings TEXT,
  hardware_or_provider TEXT,
  is_vendor_run BOOLEAN NOT NULL DEFAULT 0,
  is_independent BOOLEAN NOT NULL DEFAULT 0,
  comparable_results BOOLEAN NOT NULL DEFAULT 1,
  test_date TEXT NOT NULL,
  source_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_br_benchmark ON benchmark_runs(benchmark_id);
CREATE INDEX IF NOT EXISTS idx_br_model ON benchmark_runs(model_id);
CREATE INDEX IF NOT EXISTS idx_br_date ON benchmark_runs(test_date);
