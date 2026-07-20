-- Populate Models Directory and Benchmarks Registry with curated manual entries.
-- ADR 0010: Curated Products and Governed Publication.
-- Apply after migration-0026-source-connector-fixes.sql.
-- Run: npx wrangler d1 execute trace-manifest-db --remote --file=db/migration-0027-models-benchmarks-catalogue.sql

-- ============================================================
-- Providers
-- ============================================================

INSERT OR IGNORE INTO providers (name, slug, website, api_docs_url, enterprise_support, api_compatibility, last_verified_at) VALUES
  ('OpenAI',              'openai',              'https://openai.com',           'https://platform.openai.com/docs',           1, 'OpenAI-native',            '2026-07-20'),
  ('Anthropic',           'anthropic',           'https://www.anthropic.com',     'https://docs.anthropic.com/en/api',          1, 'Anthropic-native',         '2026-07-20'),
  ('Google DeepMind',     'google-deepmind',     'https://deepmind.google',       'https://ai.google.dev/gemini-api/docs',      1, 'Gemini-native',            '2026-07-20'),
  ('Meta AI',             'meta-ai',             'https://ai.meta.com',           'https://www.llama.com',                      0, 'OpenAI-compatible',        '2026-07-20'),
  ('Mistral AI',          'mistral-ai',          'https://mistral.ai',            'https://docs.mistral.ai/api/',               1, 'OpenAI-compatible',        '2026-07-20'),
  ('DeepSeek',            'deepseek',            'https://platform.deepseek.com', 'https://platform.deepseek.com/api-docs',     0, 'OpenAI-compatible',        '2026-07-20'),
  ('Alibaba (Qwen)',      'alibaba-qwen',        'https://qwenlm.github.io',      'https://www.alibabacloud.com/help/en/model-studio', 0, 'OpenAI-compatible',  '2026-07-20'),
  ('Z.AI (GLM)',          'z-ai-glm',            'https://z.ai',                  'https://open.bigmodel.cn/dev/api',            0, 'OpenAI-compatible',        '2026-07-20'),
  ('xAI',                 'xai',                 'https://x.ai',                  'https://docs.x.ai/api',                      0, 'OpenAI-compatible',        '2026-07-20'),
  ('Cohere',              'cohere',              'https://cohere.com',            'https://docs.cohere.com/reference/about',     1, 'Cohere-native',            '2026-07-20');

-- ============================================================
-- Models — 20 curated entries covering major current models
-- ============================================================

INSERT OR IGNORE INTO models (name, slug, provider, model_family, version, release_date, status, openness, parameter_count, context_window, modalities, tool_use, structured_output, api_available, local_available, description, best_use_cases, weaknesses, last_verified_at, verified_by) VALUES
  -- OpenAI
  ('GPT-5.6 Sol',              'gpt-5-6-sol',              'OpenAI',         'GPT',      '5.6',   '2026-07-14', 'active', 'closed',    'unknown', '128K', 'text,code,image',      1, 1, 1, 0, 'Flagship OpenAI coding and agent model. Strongest on broad agentic coding benchmarks.', 'agentic coding, terminal use, complex reasoning', 'SWE-Bench Pro lags behind Claude Fable 5', '2026-07-20', 'admin'),
  ('GPT-5.6 Flash',            'gpt-5-6-flash',            'OpenAI',         'GPT',      '5.6',   '2026-07-14', 'active', 'closed',    'unknown', '128K', 'text,code',             1, 1, 1, 0, 'Fast, cost-effective GPT-5.6 variant for high-volume tasks.', 'high-volume API, chat, quick coding', 'Less capable on long-horizon tasks', '2026-07-20', 'admin'),
  ('GPT-5.5 Sol',              'gpt-5-5-sol',              'OpenAI',         'GPT',      '5.5',   '2026-05-01', 'superseded', 'closed', 'unknown', '128K', 'text,code,image',      1, 1, 1, 0, 'Previous-generation OpenAI flagship. Superseded by GPT-5.6.', 'general reasoning, coding', 'Superseded', '2026-07-20', 'admin'),
  ('Codex (GPT-5.6-based)',    'codex-gpt-5-6',            'OpenAI',         'Codex',    '1.0',   '2026-06-01', 'active', 'closed',    'unknown', '128K', 'text,code',             1, 1, 1, 0, 'Specialised coding agent built on GPT-5.6 with terminal and repository awareness.', 'software engineering, repository work', 'Requires IDE integration; cost can accumulate on long sessions', '2026-07-20', 'admin'),

  -- Anthropic
  ('Claude Fable 5',           'claude-fable-5',           'Anthropic',      'Claude',   '5',     '2026-06-15', 'active', 'closed',    'unknown', '200K', 'text,code,image',      1, 1, 1, 0, 'Strongest model for long-horizon repository coding. Excels at complex multi-file work.', 'large codebase work, long-running agents', 'Higher latency than GPT-5.6 Sol', '2026-07-20', 'admin'),
  ('Claude Mythos 5',          'claude-mythos-5',          'Anthropic',      'Claude',   '5',     '2026-06-15', 'active', 'closed',    'unknown', '200K', 'text,code,image',      1, 1, 1, 0, 'Flagship general-purpose Claude model with broad reasoning capabilities.', 'analysis, writing, reasoning', 'Less specialised for coding than Fable 5', '2026-07-20', 'admin'),

  -- Google DeepMind
  ('Gemini 3.5 Flash',         'gemini-3-5-flash',         'Google DeepMind', 'Gemini',  '3.5',   '2026-07-01', 'active', 'closed',    'unknown', '1M',   'text,code,image,audio,video', 1, 1, 1, 0, 'Most intelligent Gemini for sustained frontier performance on agentic and coding tasks.', 'agentic tasks, coding, multimodal', 'Preview-tier models may have rate limits', '2026-07-20', 'admin'),
  ('Gemini 2.5 Pro',           'gemini-2-5-pro',           'Google DeepMind', 'Gemini',  '2.5',   '2025-12-01', 'active', 'closed',    'unknown', '2M',   'text,code,image,audio,video', 1, 1, 1, 0, 'Advanced model for complex tasks featuring deep reasoning and coding capabilities.', 'complex reasoning, long context, research', 'Higher cost than Flash variants', '2026-07-20', 'admin'),
  ('Gemini 2.5 Flash',         'gemini-2-5-flash',         'Google DeepMind', 'Gemini',  '2.5',   '2025-12-01', 'active', 'closed',    'unknown', '1M',   'text,code,image,audio,video', 1, 1, 1, 0, 'Best price-performance for low-latency, high-volume reasoning tasks.', 'high-volume API, chat, real-time', 'Less capable on complex reasoning than Pro', '2026-07-20', 'admin'),

  -- Meta AI
  ('Llama 4',                  'llama-4',                  'Meta AI',         'Llama',    '4',     '2026-04-01', 'active', 'open_weight','405B',  '128K', 'text,code,image',      1, 0, 1, 1, 'Meta''s flagship open-weight model. Competes with frontier closed models on many benchmarks.', 'local deployment, research, fine-tuning', 'Requires significant hardware for full precision', '2026-07-20', 'admin'),

  -- Mistral AI
  ('Mistral Large 3',          'mistral-large-3',          'Mistral AI',      'Mistral',  '3',     '2026-05-01', 'active', 'closed',    'unknown', '128K', 'text,code',             1, 1, 1, 0, 'Mistral''s flagship model with strong multilingual and coding performance.', 'European compliance, multilingual, coding', 'Smaller ecosystem than OpenAI/Anthropic', '2026-07-20', 'admin'),

  -- DeepSeek
  ('DeepSeek V3',              'deepseek-v3',              'DeepSeek',        'DeepSeek', '3',     '2025-12-26', 'active', 'open_weight','671B',  '128K', 'text,code',             1, 0, 1, 1, 'MoE open-weight model competitive with frontier closed models at lower cost.', 'cost-effective API, local inference', 'MoE architecture adds complexity; Chinese regulatory environment', '2026-07-20', 'admin'),

  -- Alibaba Qwen
  ('Qwen3.8',                  'qwen3-8',                  'Alibaba (Qwen)',  'Qwen',     '3.8',   '2026-07-01', 'active', 'open_weight','2.4T',  '128K', 'text,code,image',      1, 0, 1, 1, 'Massive 2.4T parameter open-weight MoE model. One of the most powerful available today.', 'extreme-scale inference, research', 'Enormous hardware requirements; 2.4T parameters impractical for most users', '2026-07-20', 'admin'),

  -- Z.AI
  ('GLM-5.2',                  'glm-5-2',                  'Z.AI (GLM)',      'GLM',      '5.2',   '2026-07-01', 'active', 'open_weight','unknown', '128K', 'text,code',             1, 0, 1, 1, 'Strong open-weight model with competitive coding and reasoning capabilities.', 'coding, local inference', 'Smaller community than Llama/Qwen', '2026-07-20', 'admin'),

  -- xAI
  ('Grok-4',                   'grok-4',                   'xAI',             'Grok',     '4',     '2026-06-01', 'active', 'closed',    'unknown', '128K', 'text,code,image',      1, 0, 1, 0, 'xAI''s flagship model with real-time knowledge integration via X platform.', 'real-time knowledge, conversational AI', 'Limited third-party evaluation; X platform dependency', '2026-07-20', 'admin'),

  -- Cohere
  ('Command R+',               'command-r-plus',           'Cohere',          'Command',  'R+',    '2025-09-01', 'active', 'closed',    'unknown', '128K', 'text,code',             1, 1, 1, 0, 'Cohere''s flagship enterprise RAG and tool-use model.', 'enterprise RAG, tool use, summarisation', 'Less competitive on pure coding benchmarks', '2026-07-20', 'admin'),

  -- Additional open-weight models
  ('Mistral Small 3',          'mistral-small-3',          'Mistral AI',      'Mistral',  '3',     '2025-09-01', 'active', 'open_weight','22B',   '32K',  'text,code',             1, 0, 1, 1, 'Efficient small open-weight model for local and edge deployment.', 'local coding, edge deployment', 'Limited context window and reasoning depth', '2026-07-20', 'admin'),
  ('Llama 3.3 70B',            'llama-3-3-70b',            'Meta AI',         'Llama',    '3.3',   '2025-12-01', 'active', 'open_weight','70B',   '128K', 'text,code',             1, 0, 1, 1, 'Refined 70B open-weight model with strong cost-performance ratio.', 'local deployment, cost-effective API', 'Less capable than Llama 4 405B', '2026-07-20', 'admin'),
  ('DeepSeek R1',              'deepseek-r1',              'DeepSeek',        'DeepSeek', 'R1',    '2025-12-01', 'active', 'open_weight','671B',  '128K', 'text,code',             1, 0, 1, 1, 'Reasoning-specialised variant of DeepSeek V3 with chain-of-thought.', 'complex math, competitive coding, reasoning', 'MoE + reasoning adds inference cost', '2026-07-20', 'admin');

-- ============================================================
-- Provider-Model pricing (approximate, publicly documented)
-- ============================================================

INSERT OR IGNORE INTO provider_models (provider_id, model_id, input_price_per_1m_tokens, output_price_per_1m_tokens, supports_batch, supports_caching, supports_streaming, last_checked_at)
  SELECT p.id, m.id,
    CASE m.slug
      WHEN 'gpt-5-6-sol'     THEN 2.0   WHEN 'gpt-5-6-flash'  THEN 1.0
      WHEN 'gpt-5-5-sol'     THEN 2.0   WHEN 'codex-gpt-5-6'  THEN 3.0
      WHEN 'claude-fable-5'  THEN 3.0   WHEN 'claude-mythos-5' THEN 3.0
      WHEN 'gemini-3-5-flash' THEN 0.50  WHEN 'gemini-2-5-pro' THEN 2.50
      WHEN 'gemini-2-5-flash' THEN 0.15  WHEN 'llama-4'        THEN NULL
      WHEN 'mistral-large-3'  THEN 1.0   WHEN 'deepseek-v3'    THEN 0.27
      WHEN 'qwen3-8'          THEN NULL  WHEN 'glm-5-2'         THEN NULL
      WHEN 'grok-4'           THEN 2.0   WHEN 'command-r-plus'  THEN 1.50
      WHEN 'mistral-small-3'  THEN 0.10  WHEN 'llama-3-3-70b'   THEN NULL
      WHEN 'deepseek-r1'      THEN 0.55
    END,
    CASE m.slug
      WHEN 'gpt-5-6-sol'     THEN 10.0  WHEN 'gpt-5-6-flash'  THEN 5.0
      WHEN 'gpt-5-5-sol'     THEN 10.0  WHEN 'codex-gpt-5-6'  THEN 15.0
      WHEN 'claude-fable-5'  THEN 15.0  WHEN 'claude-mythos-5' THEN 15.0
      WHEN 'gemini-3-5-flash' THEN 2.50  WHEN 'gemini-2-5-pro' THEN 15.0
      WHEN 'gemini-2-5-flash' THEN 0.60  WHEN 'llama-4'        THEN NULL
      WHEN 'mistral-large-3'  THEN 3.0   WHEN 'deepseek-v3'    THEN 1.10
      WHEN 'qwen3-8'          THEN NULL  WHEN 'glm-5-2'         THEN NULL
      WHEN 'grok-4'           THEN 8.0   WHEN 'command-r-plus'  THEN 5.0
      WHEN 'mistral-small-3'  THEN 0.30  WHEN 'llama-3-3-70b'   THEN NULL
      WHEN 'deepseek-r1'      THEN 2.19
    END,
    0, 0, 1, '2026-07-20'
  FROM providers p, models m
  WHERE m.provider = p.name
    AND NOT EXISTS (SELECT 1 FROM provider_models pm WHERE pm.provider_id = p.id AND pm.model_id = m.id);

-- ============================================================
-- Benchmarks — 10 curated entries
-- ============================================================

INSERT OR IGNORE INTO benchmarks (name, slug, version, owner, purpose, domain, health_status, reproducibility, contamination_concern, code_available, data_available, code_url, last_reviewed_at) VALUES
  ('SWE-bench Verified',        'swe-bench-verified',        '1.0',  'Princeton NLP / OpenAI',  'Evaluate coding agents on real-world GitHub issues with verified patches.', 'coding',      'healthy',              'reproducible',              'medium', 1, 1, 'https://github.com/princeton-nlp/SWE-bench',                           '2026-07-20'),
  ('LMSYS Chatbot Arena',       'lmsys-chatbot-arena',       '2.0',  'LMSYS / UC Berkeley',     'Human preference evaluation via blind pairwise comparisons.',            'general',     'healthy',              'partially_reproducible',    'low',    0, 0, 'https://chat.lmsys.org/',                                               '2026-07-20'),
  ('LiveBench',                 'livebench',                 '2.0',  'Abacus.AI',               'Contamination-resistant live benchmark updated with recent data.',      'general',     'healthy',              'reproducible',              'low',    1, 1, 'https://github.com/LiveBench/LiveBench',                                 '2026-07-20'),
  ('MLPerf Inference',          'mlperf-inference',          '5.0',  'MLCommons',               'Industry-standard hardware inference performance with reproducible results.', 'hardware', 'healthy',        'reproducible',              'low',    1, 1, 'https://github.com/mlcommons/inference',                                 '2026-07-20'),
  ('Stanford HELM',             'stanford-helm',             '2.0',  'Stanford CRFM',           'Holistic evaluation of language models across 40+ scenarios.',          'general',     'healthy',              'reproducible',              'medium', 1, 1, 'https://github.com/stanford-crfm/helm',                                  '2026-07-20'),
  ('Artificial Analysis Intelligence Index', 'artificial-analysis-intelligence-index', '2.0', 'Artificial Analysis', 'Cross-model intelligence, latency, and pricing comparison.',          'general',     'healthy',              'partially_reproducible',    'medium', 0, 0, 'https://artificialanalysis.ai/',                                         '2026-07-20'),
  ('MMLU-Pro',                  'mmlu-pro',                  '1.0',  'University of Waterloo',  'Massive multitask language understanding with harder, reasoning-focused questions.', 'general', 'healthy',    'reproducible',              'medium', 1, 1, 'https://github.com/TIGER-AI-Lab/MMLU-Pro',                               '2026-07-20'),
  ('GPQA Diamond',              'gpqa-diamond',              '1.0',  'NYU / Anthropic',         'Graduate-level physics, chemistry, and biology questions — gold-standard hard benchmark.', 'science', 'healthy', 'reproducible',        'medium', 1, 1, 'https://github.com/idavidrein/gpqa',                                     '2026-07-20'),
  ('HumanEval+',                'humaneval-plus',            '1.0',  'OpenAI / EvalPlus',       'Function synthesis benchmark with expanded test cases to catch false positives.', 'coding', 'healthy',          'reproducible',              'medium', 1, 1, 'https://github.com/evalplus/evalplus',                                   '2026-07-20'),
  ('ARC-AGI-2',                 'arc-agi-2',                 '2.0',  'ARC Prize Foundation',    'Abstract reasoning corpus designed to resist memorisation. Tests fluid intelligence.', 'reasoning', 'healthy',  'reproducible',              'low',    1, 1, 'https://github.com/arcprize/ARC-AGI-2',                                  '2026-07-20');
