// The Trace Manifest — Model, Provider & Benchmark Data Extraction
// Phase 4: Extracts structured model/provider/benchmark records from feed items.
// Populates models, providers, provider_models, benchmarks, benchmark_runs tables.
// Rule-based extraction within Worker CPU limits; no external AI dependency.

import type { FeedItem, ExtractedModelData } from "./types";

const ALGORITHM_VERSION = "model-extraction-v1";

// ============================================================
// Known model patterns — maps feed-item text to model records
// ============================================================
const KNOWN_MODELS: { name: string; provider: string; patterns: RegExp[]; family?: string }[] = [
  { name: "GPT-5", provider: "OpenAI", family: "GPT", patterns: [/\bGPT-5\b/i] },
  { name: "GPT-4o", provider: "OpenAI", family: "GPT", patterns: [/\bGPT-4o\b/i] },
  { name: "GPT-4.1", provider: "OpenAI", family: "GPT", patterns: [/\bGPT-4\.1\b/i] },
  { name: "o3", provider: "OpenAI", family: "o-series", patterns: [/\bo3\b/i] },
  { name: "o4-mini", provider: "OpenAI", family: "o-series", patterns: [/\bo4[-\s]?mini\b/i] },
  { name: "Claude 4", provider: "Anthropic", family: "Claude", patterns: [/\bClaude\s*4\b/i] },
  { name: "Claude 3.5 Sonnet", provider: "Anthropic", family: "Claude", patterns: [/\bClaude\s*3\.?5\s*Sonnet\b/i] },
  { name: "Claude 3.5 Haiku", provider: "Anthropic", family: "Claude", patterns: [/\bClaude\s*3\.?5\s*Haiku\b/i] },
  { name: "Claude Opus 4", provider: "Anthropic", family: "Claude", patterns: [/\bClaude\s*Opus\s*4\b/i] },
  { name: "Gemini 2.5 Pro", provider: "Google", family: "Gemini", patterns: [/\bGemini\s*2\.?5\s*Pro\b/i] },
  { name: "Gemini 2.5 Flash", provider: "Google", family: "Gemini", patterns: [/\bGemini\s*2\.?5\s*Flash\b/i] },
  { name: "Gemini 2.0 Ultra", provider: "Google", family: "Gemini", patterns: [/\bGemini\s*2\.?0\s*Ultra\b/i] },
  { name: "Llama 4", provider: "Meta", family: "Llama", patterns: [/\bLlama\s*4\b/i] },
  { name: "Llama 3.3", provider: "Meta", family: "Llama", patterns: [/\bLlama\s*3\.?3\b/i] },
  { name: "Mistral Large 3", provider: "Mistral AI", family: "Mistral", patterns: [/\bMistral\s*Large\s*3\b/i] },
  { name: "Mistral Small 3", provider: "Mistral AI", family: "Mistral", patterns: [/\bMistral\s*Small\s*3\b/i] },
  { name: "DeepSeek V3", provider: "DeepSeek", family: "DeepSeek", patterns: [/\bDeepSeek[-\s]*V3\b/i] },
  { name: "DeepSeek R1", provider: "DeepSeek", family: "DeepSeek", patterns: [/\bDeepSeek[-\s]*R1\b/i] },
  { name: "Qwen 2.5", provider: "Alibaba", family: "Qwen", patterns: [/\bQwen\s*2\.?5\b/i] },
  { name: "Qwen 3", provider: "Alibaba", family: "Qwen", patterns: [/\bQwen\s*3\b/i] },
  { name: "Gemma 3", provider: "Google", family: "Gemma", patterns: [/\bGemma\s*3\b/i] },
  { name: "Phi-4", provider: "Microsoft", family: "Phi", patterns: [/\bPhi[-\s]?4\b/i] },
  { name: "Grok 3", provider: "xAI", family: "Grok", patterns: [/\bGrok[-\s]*3\b/i] },
  { name: "Command R+", provider: "Cohere", family: "Command R", patterns: [/\bCommand\s*R\+\b/i] },
];

// ============================================================
// Known provider patterns
// ============================================================
const KNOWN_PROVIDERS: { name: string; slug: string; patterns: RegExp[] }[] = [
  { name: "OpenAI", slug: "openai", patterns: [/\bOpenAI\b/i] },
  { name: "Anthropic", slug: "anthropic", patterns: [/\bAnthropic\b/i] },
  { name: "Google", slug: "google", patterns: [/\bGoogle\s*(DeepMind|AI|Cloud)?\b/i] },
  { name: "Meta", slug: "meta", patterns: [/\bMeta\s*(AI)?\b/i] },
  { name: "Microsoft", slug: "microsoft", patterns: [/\bMicrosoft\s*(Azure|AI|Copilot)?\b/i] },
  { name: "Mistral AI", slug: "mistral-ai", patterns: [/\bMistral\s*AI\b/i] },
  { name: "DeepSeek", slug: "deepseek", patterns: [/\bDeepSeek\b/i] },
  { name: "Alibaba", slug: "alibaba", patterns: [/\b(Alibaba|Qwen)\b/i] },
  { name: "xAI", slug: "xai", patterns: [/\bxAI\b/i] },
  { name: "Cohere", slug: "cohere", patterns: [/\bCohere\b/i] },
  { name: "NVIDIA", slug: "nvidia", patterns: [/\bNVIDIA\b/i] },
  { name: "Amazon", slug: "amazon", patterns: [/\b(AWS|Amazon\s*Bedrock)\b/i] },
  { name: "Together AI", slug: "together-ai", patterns: [/\bTogether\s*AI\b/i] },
  { name: "Fireworks AI", slug: "fireworks-ai", patterns: [/\bFireworks\s*AI\b/i] },
  { name: "Groq", slug: "groq", patterns: [/\bGroq\b/i] },
  { name: "Hugging Face", slug: "hugging-face", patterns: [/\bHugging\s*Face\b/i] },
  { name: "Stability AI", slug: "stability-ai", patterns: [/\bStability\s*AI\b/i] },
];

// ============================================================
// Known benchmark patterns
// ============================================================
const KNOWN_BENCHMARKS: { name: string; slug: string; domain: string; patterns: RegExp[] }[] = [
  { name: "MMLU", slug: "mmlu", domain: "General knowledge", patterns: [/\bMMLU\b/i] },
  { name: "HumanEval", slug: "humaneval", domain: "Code generation", patterns: [/\bHumanEval\b/i] },
  { name: "SWE-bench", slug: "swe-bench", domain: "Software engineering", patterns: [/\bSWE[-\s]?bench\b/i] },
  { name: "GSM8K", slug: "gsm8k", domain: "Math reasoning", patterns: [/\bGSM8K\b/i] },
  { name: "MATH", slug: "math", domain: "Math reasoning", patterns: [/\bMATH\s*(benchmark|dataset)?\b/i] },
  { name: "HellaSwag", slug: "hellaswag", domain: "Commonsense reasoning", patterns: [/\bHellaSwag\b/i] },
  { name: "TruthfulQA", slug: "truthfulqa", domain: "Truthfulness", patterns: [/\bTruthfulQA\b/i] },
  { name: "ARC", slug: "arc", domain: "Reasoning", patterns: [/\bARC[-\s]?(Challenge|Easy)?\b/i] },
  { name: "BBH", slug: "bbh", domain: "Reasoning", patterns: [/\bBBH\b/i] },
  { name: "Chatbot Arena", slug: "chatbot-arena", domain: "Human preference", patterns: [/\bChatbot\s*Arena\b/i, /\bLMSYS\b/i] },
  { name: "LiveBench", slug: "livebench", domain: "General capability", patterns: [/\bLiveBench\b/i] },
  { name: "AgentBench", slug: "agentbench", domain: "Agent capability", patterns: [/\bAgentBench\b/i] },
];

// ============================================================
// Pricing pattern extraction
// ============================================================
const PRICING_PATTERNS: RegExp[] = [
  /\$(?<price>[\d.]+)\s*\/\s*(?:1M|million)\s*(?:input\s*)?tokens?/gi,
  /\$(?<price>[\d.]+)\s*\/\s*(?:1M|million)\s*(?:output\s*)?tokens?/gi,
  /input[:\s]*\$(?<price>[\d.]+)/gi,
  /output[:\s]*\$(?<price>[\d.]+)/gi,
  /(?:price|cost|rate)[:\s]*\$(?<price>[\d.]+)/gi,
];

// ============================================================
// Main extraction function — processes classified feed items
// ============================================================
export async function runModelDataExtraction(
  db: D1Database,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ processed: number; modelsFound: number; providersFound: number; benchmarksFound: number; pricesRecorded: number }> {
  // Fetch classified items with source info from last 7 days
  const { results } = await db.prepare(
    `SELECT fi.*, s.tier as source_tier
     FROM feed_items fi
     JOIN sources s ON fi.source_id = s.id
     WHERE fi.ingestion_status IN ('classified', 'clustered')
     AND fi.fetched_at >= datetime('now', '-7 days')
     AND fi.id NOT IN (
       SELECT DISTINCT feed_item_id FROM pipeline_stages WHERE stage = 'model_data_extracted'
     )
     LIMIT 300`
  ).all<FeedItem & { source_tier: string }>();

  if (!results || results.length === 0) {
    return { processed: 0, modelsFound: 0, providersFound: 0, benchmarksFound: 0, pricesRecorded: 0 };
  }

  const total = results.length;
  let modelsFound = 0;
  let providersFound = 0;
  let benchmarksFound = 0;
  let pricesRecorded = 0;
  let processed = 0;

  for (const row of results) {
    const text = [row.title, row.summary ?? "", row.content_excerpt ?? ""].join(" ");

    // 1. Extract and upsert models
    for (const modelDef of KNOWN_MODELS) {
      const matched = modelDef.patterns.some(p => p.test(text));
      if (!matched) continue;

      const slug = modelDef.name.toLowerCase().replace(/[\s.]+/g, "-").replace(/[()]/g, "");
      const existing = await db.prepare("SELECT id FROM models WHERE slug = ?").bind(slug).first<{ id: number }>();

      if (!existing) {
        await db.prepare(
          `INSERT INTO models (name, slug, provider, model_family, status, openness)
           VALUES (?, ?, ?, ?, 'active', 'closed')`
        ).bind(modelDef.name, slug, modelDef.provider, modelDef.family ?? null).run();
        modelsFound++;
      }
    }

    // 2. Extract and upsert providers
    for (const provDef of KNOWN_PROVIDERS) {
      const matched = provDef.patterns.some(p => p.test(text));
      if (!matched) continue;

      const existing = await db.prepare("SELECT id FROM providers WHERE slug = ?").bind(provDef.slug).first<{ id: number }>();
      if (!existing) {
        await db.prepare(
          `INSERT INTO providers (name, slug) VALUES (?, ?)`
        ).bind(provDef.name, provDef.slug).run();
        providersFound++;
      }
    }

    // 3. Extract and upsert benchmarks
    for (const benchDef of KNOWN_BENCHMARKS) {
      const matched = benchDef.patterns.some(p => p.test(text));
      if (!matched) continue;

      const existing = await db.prepare("SELECT id FROM benchmarks WHERE slug = ?").bind(benchDef.slug).first<{ id: number }>();
      if (!existing) {
        await db.prepare(
          `INSERT INTO benchmarks (name, slug, purpose, domain, health_status)
           VALUES (?, ?, ?, ?, 'healthy')`
        ).bind(benchDef.name, benchDef.slug, `${benchDef.name} benchmark for ${benchDef.domain}`, benchDef.domain).run();
        benchmarksFound++;
      }
    }

    // 4. Extract pricing information
    const prices = extractPrices(text);
    for (const price of prices) {
      // Find matching model and provider from context
      const modelMatch = KNOWN_MODELS.find(m => m.patterns.some(p => p.test(text)));
      const provMatch = KNOWN_PROVIDERS.find(p => p.patterns.some(pat => pat.test(text)));

      if (modelMatch && provMatch) {
        const modelSlug = modelMatch.name.toLowerCase().replace(/[\s.]+/g, "-").replace(/[()]/g, "");
        const model = await db.prepare("SELECT id FROM models WHERE slug = ?").bind(modelSlug).first<{ id: number }>();
        const prov = await db.prepare("SELECT id FROM providers WHERE slug = ?").bind(provMatch.slug).first<{ id: number }>();

        if (model && prov) {
          // Check existing provider_model record
          const pm = await db.prepare(
            "SELECT id, input_price_per_1m_tokens, output_price_per_1m_tokens FROM provider_models WHERE provider_id = ? AND model_id = ?"
          ).bind(prov.id, model.id).first<{ id: number; input_price_per_1m_tokens: number | null; output_price_per_1m_tokens: number | null }>();

          if (pm) {
            // Record pricing history if changed
            if (price.inputPrice && pm.input_price_per_1m_tokens !== price.inputPrice) {
              await db.prepare(
                `INSERT INTO pricing_history (provider_model_id, input_price, change_reason, source_url)
                 VALUES (?, ?, 'detected change', ?)`
              ).bind(pm.id, price.inputPrice, row.url).run();
              pricesRecorded++;
            }
            if (price.outputPrice && pm.output_price_per_1m_tokens !== price.outputPrice) {
              await db.prepare(
                `INSERT INTO pricing_history (provider_model_id, output_price, change_reason, source_url)
                 VALUES (?, ?, 'detected change', ?)`
              ).bind(pm.id, price.outputPrice, row.url).run();
              pricesRecorded++;
            }

            // Update current prices
            await db.prepare(
              `UPDATE provider_models SET input_price_per_1m_tokens = COALESCE(?, input_price_per_1m_tokens), output_price_per_1m_tokens = COALESCE(?, output_price_per_1m_tokens), last_checked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
            ).bind(price.inputPrice ?? null, price.outputPrice ?? null, pm.id).run();
          } else {
            // Create new provider_model junction
            await db.prepare(
              `INSERT INTO provider_models (provider_id, model_id, input_price_per_1m_tokens, output_price_per_1m_tokens, last_checked_at)
               VALUES (?, ?, ?, ?, datetime('now'))`
            ).bind(prov.id, model.id, price.inputPrice ?? null, price.outputPrice ?? null).run();
            pricesRecorded++;
          }
        }
      }
    }

    // Mark as processed
    await recordStage(db, row.id, "model_data_extracted", "completed", "processed");
    processed++;
    onProgress?.(processed, total);
  }

  return { processed, modelsFound, providersFound, benchmarksFound, pricesRecorded };
}

// ============================================================
// Pricing extraction from text
// ============================================================
interface ExtractedPrice {
  inputPrice?: number;
  outputPrice?: number;
}

function extractPrices(text: string): ExtractedPrice[] {
  const results: ExtractedPrice[] = [];
  let inputPrice: number | undefined;
  let outputPrice: number | undefined;

  // Look for input price: $X / 1M input tokens
  const inputMatch = text.match(/\$([\d.]+)\s*\/\s*(?:1M|million)\s*input\s*tokens?/i);
  if (inputMatch) inputPrice = parseFloat(inputMatch[1]);

  // Look for output price: $X / 1M output tokens
  const outputMatch = text.match(/\$([\d.]+)\s*\/\s*(?:1M|million)\s*output\s*tokens?/i);
  if (outputMatch) outputPrice = parseFloat(outputMatch[1]);

  // Alternative: "input: $X" / "output: $X"
  if (!inputPrice) {
    const m = text.match(/input[:\s]*\$([\d.]+)/i);
    if (m) inputPrice = parseFloat(m[1]);
  }
  if (!outputPrice) {
    const m = text.match(/output[:\s]*\$([\d.]+)/i);
    if (m) outputPrice = parseFloat(m[1]);
  }

  if (inputPrice || outputPrice) {
    results.push({ inputPrice, outputPrice });
  }

  return results;
}

// ============================================================
// Pipeline stage tracking
// ============================================================
async function recordStage(
  db: D1Database,
  feedItemId: number,
  stage: string,
  status: string,
  summary: string,
): Promise<void> {
  try {
    const existing = await db.prepare(
      "SELECT id FROM pipeline_stages WHERE feed_item_id = ? AND stage = ?"
    ).bind(feedItemId, stage).first<{ id: number }>();

    if (existing) {
      await db.prepare(
        `UPDATE pipeline_stages SET completed_at = datetime('now'), status = ?, result_summary = ? WHERE id = ?`
      ).bind(status, summary, existing.id).run();
    } else {
      await db.prepare(
        `INSERT INTO pipeline_stages (feed_item_id, stage, algorithm_version, status, result_summary, completed_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).bind(feedItemId, stage, ALGORITHM_VERSION, status, summary).run();
    }
  } catch (err: any) {
    console.error(`Stage tracking error: ${err.message}`);
  }
}

// ============================================================
// Seed initial model and provider data for the static site
// Called once during deployment to populate known models/providers
// ============================================================
export async function seedModelData(db: D1Database): Promise<{ models: number; providers: number; benchmarks: number }> {
  let modelsCreated = 0;
  let providersCreated = 0;
  let benchmarksCreated = 0;

  // Seed known providers
  for (const p of KNOWN_PROVIDERS) {
    const exists = await db.prepare("SELECT id FROM providers WHERE slug = ?").bind(p.slug).first();
    if (!exists) {
      await db.prepare("INSERT INTO providers (name, slug) VALUES (?, ?)").bind(p.name, p.slug).run();
      providersCreated++;
    }
  }

  // Seed known models with basic info
  const modelSeedData: { name: string; provider: string; openness: string; parameterCount?: string; contextWindow?: string }[] = [
    { name: "GPT-5", provider: "OpenAI", openness: "closed", contextWindow: "256K tokens" },
    { name: "GPT-4o", provider: "OpenAI", openness: "closed", contextWindow: "128K tokens" },
    { name: "o3", provider: "OpenAI", openness: "closed", contextWindow: "200K tokens" },
    { name: "Claude 4", provider: "Anthropic", openness: "closed", contextWindow: "200K tokens" },
    { name: "Claude 3.5 Sonnet", provider: "Anthropic", openness: "closed", contextWindow: "200K tokens" },
    { name: "Gemini 2.5 Pro", provider: "Google", openness: "closed", contextWindow: "1M tokens" },
    { name: "Gemini 2.5 Flash", provider: "Google", openness: "closed", contextWindow: "1M tokens" },
    { name: "Llama 4", provider: "Meta", openness: "open_weight", parameterCount: "8B / 70B / 405B", contextWindow: "128K tokens" },
    { name: "Mistral Large 3", provider: "Mistral AI", openness: "open_weight", contextWindow: "256K tokens" },
    { name: "DeepSeek V3", provider: "DeepSeek", openness: "open_weight", parameterCount: "671B (MoE)", contextWindow: "128K tokens" },
    { name: "DeepSeek R1", provider: "DeepSeek", openness: "open_weight", parameterCount: "671B (MoE)", contextWindow: "128K tokens" },
    { name: "Qwen 2.5", provider: "Alibaba", openness: "open_weight", contextWindow: "128K tokens" },
    { name: "Gemma 3", provider: "Google", openness: "open_weight", contextWindow: "128K tokens" },
    { name: "Phi-4", provider: "Microsoft", openness: "open_weight", parameterCount: "14B", contextWindow: "16K tokens" },
    { name: "Grok 3", provider: "xAI", openness: "closed", contextWindow: "1M tokens" },
    { name: "Command R+", provider: "Cohere", openness: "open_weight", contextWindow: "128K tokens" },
  ];

  for (const m of modelSeedData) {
    const slug = m.name.toLowerCase().replace(/[\s.]+/g, "-").replace(/[()]/g, "");
    const exists = await db.prepare("SELECT id FROM models WHERE slug = ?").bind(slug).first();
    if (!exists) {
      await db.prepare(
        `INSERT INTO models (name, slug, provider, openness, parameter_count, context_window, modalities, tool_use, structured_output, api_available, status)
         VALUES (?, ?, ?, ?, ?, ?, 'text,code', 1, 1, 1, 'active')`
      ).bind(m.name, slug, m.provider, m.openness, m.parameterCount ?? null, m.contextWindow ?? null).run();
      modelsCreated++;
    }
  }

  // Seed known benchmarks
  for (const b of KNOWN_BENCHMARKS) {
    const exists = await db.prepare("SELECT id FROM benchmarks WHERE slug = ?").bind(b.slug).first();
    if (!exists) {
      await db.prepare(
        `INSERT INTO benchmarks (name, slug, purpose, domain, health_status)
         VALUES (?, ?, ?, ?, 'healthy')`
      ).bind(b.name, b.slug, `${b.name} benchmark for ${b.domain}`, b.domain).run();
      benchmarksCreated++;
    }
  }

  return { models: modelsCreated, providers: providersCreated, benchmarks: benchmarksCreated };
}
