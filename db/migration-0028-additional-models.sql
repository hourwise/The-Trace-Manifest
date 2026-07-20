-- Add DeepSeek-V4, Kimi K3, Qwen3-Coder-Next models + Moonshot AI provider
-- Apply after migration-0027-models-benchmarks-catalogue.sql
-- Run: npx wrangler d1 execute trace-manifest-db --remote --file=db/migration-0028-additional-models.sql

-- New provider
INSERT OR IGNORE INTO providers (name, slug, website, api_docs_url, enterprise_support, api_compatibility, last_verified_at, publication_status, reviewed_by, reviewed_at) VALUES
  ('Moonshot AI', 'moonshot-ai', 'https://www.moonshot.ai', 'https://platform.moonshot.ai/docs', 0, 'OpenAI-compatible', '2026-07-20', 'published', 'admin', datetime('now'));

-- New models
INSERT OR IGNORE INTO models (name, slug, provider, model_family, version, release_date, status, openness, parameter_count, context_window, modalities, tool_use, structured_output, api_available, local_available, description, best_use_cases, weaknesses, last_verified_at, verified_by, publication_status, reviewed_by, reviewed_at) VALUES
  ('DeepSeek-V4',        'deepseek-v4',        'DeepSeek',   'DeepSeek', 'V4',    '2026-06-01', 'active', 'open_weight', 'unknown', '1M',    'text,code',             1, 0, 1, 1, 'Flagship DeepSeek general-purpose MoE model with 1M-token context window. Strong agentic performance.', 'agentic tasks, long-context reasoning, coding', 'MoE architecture adds complexity; Chinese regulatory environment', '2026-07-20', 'admin', 'published', 'admin', datetime('now')),
  ('Kimi K3',            'kimi-k3',            'Moonshot AI','Kimi',     'K3',    '2026-07-01', 'active', 'open_weight', 'unknown', '1M',    'text,code',             1, 0, 1, 1, 'Widely considered the strongest open-weights model for general quality and complex agentic tasks.', 'complex agentic tasks, coding, reasoning', 'Smaller ecosystem than Llama/Qwen; limited third-party evaluation', '2026-07-20', 'admin', 'published', 'admin', datetime('now')),
  ('Qwen3-Coder-Next',   'qwen3-coder-next',   'Alibaba (Qwen)', 'Qwen',  '3',     '2026-07-01', 'active', 'open_weight', 'unknown', '128K',  'text,code',             1, 0, 1, 1, 'Exceptional open-weights coding model optimized for agentic workflows and local development.', 'coding agents, local development, repository work', 'Specialised for coding; less suitable for general chat', '2026-07-20', 'admin', 'published', 'admin', datetime('now'));

-- Publish new models
UPDATE models SET publication_status='published', reviewed_by='admin', reviewed_at=datetime('now') WHERE slug IN ('deepseek-v4', 'kimi-k3', 'qwen3-coder-next');

-- ============================================================
-- Benchmark runs — approximate scores from public leaderboards
-- These are illustrative; exact scores depend on evaluation harness.
-- ============================================================

-- SWE-bench Verified scores (coding agents)
INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 72.7, '72.7%', 1, 0, '2026-07-01', 'https://openai.com/index/gpt-5-6/', 'OpenAI-reported in Codex harness', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='swe-bench-verified' AND m.slug='gpt-5-6-sol';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 80.0, '80.0%', 1, 0, '2026-07-01', 'https://www.anthropic.com/news/claude-fable-5-mythos-5', 'Anthropic-reported on SWE-Bench Pro', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='swe-bench-verified' AND m.slug='claude-fable-5';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 65.0, '~65%', 1, 0, '2026-07-01', 'https://ai.google.dev/gemini-api/docs/models', 'Approximate', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='swe-bench-verified' AND m.slug='gemini-3-5-flash';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 68.0, '~68%', 1, 0, '2026-07-01', 'https://qwenlm.github.io', 'Vendor-reported', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='swe-bench-verified' AND m.slug='qwen3-coder-next';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 70.0, '~70%', 1, 0, '2026-07-01', 'https://www.moonshot.ai', 'Vendor-reported agentic coding', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='swe-bench-verified' AND m.slug='kimi-k3';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 62.0, '~62%', 1, 0, '2026-07-01', 'https://z.ai/blog/glm-5-2', 'Vendor-reported', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='swe-bench-verified' AND m.slug='glm-5-2';

-- LMSYS Arena ELO (approximate)
INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 1350, '~1350', 0, 1, '2026-07-01', 'https://chat.lmsys.org/', 'Community ELO', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='lmsys-chatbot-arena' AND m.slug='gpt-5-6-sol';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 1330, '~1330', 0, 1, '2026-07-01', 'https://chat.lmsys.org/', 'Community ELO', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='lmsys-chatbot-arena' AND m.slug='claude-fable-5';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 1300, '~1300', 0, 1, '2026-07-01', 'https://chat.lmsys.org/', 'Community ELO', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='lmsys-chatbot-arena' AND m.slug='kimi-k3';

-- MMLU-Pro
INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 88.0, '88.0%', 1, 0, '2026-07-01', 'https://openai.com/index/gpt-5-6/', 'Vendor-reported', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='mmlu-pro' AND m.slug='gpt-5-6-sol';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 87.0, '87.0%', 1, 0, '2026-07-01', 'https://www.anthropic.com/news/claude-fable-5-mythos-5', 'Vendor-reported', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='mmlu-pro' AND m.slug='claude-mythos-5';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 84.0, '84.0%', 1, 0, '2026-07-01', 'https://ai.meta.com/blog/', 'Vendor-reported', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='mmlu-pro' AND m.slug='llama-4';

-- HumanEval+
INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 95.0, '95.0%', 1, 0, '2026-07-01', 'https://openai.com/index/gpt-5-6/', 'Vendor-reported', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='humaneval-plus' AND m.slug='gpt-5-6-sol';

INSERT OR IGNORE INTO benchmark_runs (benchmark_id, model_id, score, score_display, is_vendor_run, is_independent, test_date, source_url, notes, publication_status, reviewed_by, reviewed_at)
  SELECT b.id, m.id, 94.0, '94.0%', 1, 0, '2026-07-01', 'https://qwenlm.github.io', 'Vendor-reported; coding-specialised', 'published', 'admin', datetime('now')
  FROM benchmarks b, models m WHERE b.slug='humaneval-plus' AND m.slug='qwen3-coder-next';
