// The Trace Manifest — Classification Engine
// Phase 3: Rule-based topic, entity, and item-type classification
// Runs within Worker CPU limits; no external AI dependency.

import type { FeedItem } from "./types";

// ============================================================
// Topic taxonomy — matches the platform's filter topics
// ============================================================
const TOPIC_RULES: { topic: string; patterns: RegExp[]; weight: number }[] = [
  {
    topic: "frontier-models",
    patterns: [
      /\bGPT-5\b/i, /\bClaude\s*4\b/i, /\bGemini\s*(2|Ultra|Pro)\b/i,
      /\bfrontier\s*model\b/i, /\bGPT-4o\b/i, /\bflagship\s*model\b/i,
      /\bGPT-4\s*Turbo\b/i, /\bClaude\s*3\.?5\b/i,
    ],
    weight: 10,
  },
  {
    topic: "open-weight-models",
    patterns: [
      /\bopen.?weight\b/i, /\bopen.?source\s*model\b/i, /\bopen.?release\b/i,
      /\bLlama\s*[34]\b/i, /\bMistral\b/i, /\bMixtral\b/i, /\bDeepSeek\b/i,
      /\bQwen\b/i, /\bYi\b/i, /\bPhi\b/i, /\bGemma\b/i, /\bFalcon\b/i,
      /\bPythia\b/i, /\bOLMo\b/i, /\bStableLM\b/i, /\bDBRX\b/i,
    ],
    weight: 10,
  },
  {
    topic: "local-ai",
    patterns: [
      /\blocal\s*(AI|LLM|model|inference)\b/i, /\bllama\.cpp\b/i,
      /\bOllama\b/i, /\bquantiz(ed|ation)\b/i, /\bGGUF\b/i, /\bGGML\b/i,
      /\bMLX\b/i, /\b16\s*GB\s*RAM\b/i, /\b32\s*GB\s*RAM\b/i,
      /\bon.?device\b/i, /\bedge\s*AI\b/i, /\bprivate\s*AI\b/i,
      /\bself.?hosted\b/i, /\bair.?gapped\b/i,
    ],
    weight: 8,
  },
  {
    topic: "coding-assistants",
    patterns: [
      /\bcoding\s*assistant\b/i, /\bcoding\s*agent\b/i, /\bcode\s*generation\b/i,
      /\bCopilot\b/i, /\bCline\b/i, /\bAider\b/i, /\bSWE.?bench\b/i,
      /\bCursor\b/i, /\bDevin\b/i, /\bsoftware\s*engineering\b.*\bAI\b/i,
      /\bautocomplete\b.*\bAI\b/i, /\bIDE\s*AI\b/i,
    ],
    weight: 8,
  },
  {
    topic: "mcp-and-agents",
    patterns: [
      /\bMCP\b/i, /\bModel\s*Context\s*Protocol\b/i,
      /\bAI\s*agent\b/i, /\bautonomous\s*agent\b/i, /\bmulti.?agent\b/i,
      /\btool.?use\b/i, /\bfunction\s*calling\b/i, /\bAutoGen\b/i,
      /\bLangChain\b/i, /\bLangGraph\b/i, /\bCrewAI\b/i,
      /\bagentic\b/i, /\bRAG\b/i,
    ],
    weight: 7,
  },
  {
    topic: "research",
    patterns: [
      /\bresearch\s*paper\b/i, /\bpreprint\b/i, /\barXiv\b/i,
      /\bstudy\s*finds\b/i, /\bpaper\s*(demonstrates|shows|proposes)\b/i,
      /\bneural\s*network\b/i, /\btransformer\b/i, /\battention\s*mechanism\b/i,
      /\breinforcement\s*learning\b/i, /\bRLHF\b/i, /\bDPO\b/i,
      /\balignment\b/i, /\binterpretability\b/i, /\bmechanistic\b/i,
    ],
    weight: 6,
  },
  {
    topic: "benchmarks",
    patterns: [
      /\bbenchmark\b/i, /\bevaluation\b/i, /\bMMLU\b/i, /\bHumanEval\b/i,
      /\bChatbot\s*Arena\b/i, /\bLMSYS\b/i, /\bHELM\b/i,
      /\bSWE.?bench\b/i, /\bLiveBench\b/i, /\bscoring\b/i,
      /\bperformance\s*(comparison|ranking|leaderboard)\b/i,
    ],
    weight: 7,
  },
  {
    topic: "security",
    patterns: [
      /\bsecurity\b/i, /\bvulnerability\b/i, /\badversarial\b/i,
      /\bjailbreak\b/i, /\bprompt\s*injection\b/i, /\bdata\s*poisoning\b/i,
      /\bCVE\b/i, /\bexploit\b/i, /\bbackdoor\b/i,
      /\bCISA\b/i, /\bsafety\b/i, /\bguardrails\b/i,
    ],
    weight: 7,
  },
  {
    topic: "regulation",
    patterns: [
      /\bregulation\b/i, /\bEU\s*AI\s*Act\b/i, /\blegislation\b/i,
      /\bcompliance\b/i, /\blicensing\b/i, /\bcopyright\b/i,
      /\bexecutive\s*order\b/i, /\bFTC\b/i, /\bdata\s*protection\b/i,
      /\boversight\b/i, /\bgovernance\b/i, /\bpolicy\b/i,
    ],
    weight: 6,
  },
  {
    topic: "ai-business",
    patterns: [
      /\bfunding\b/i, /\bvaluation\b/i, /\bacquisition\b/i, /\bIPO\b/i,
      /\brevenue\b/i, /\bpartnership\b/i, /\benterprise\b/i,
      /\bstartup\b/i, /\binvestment\b/i, /\bventure\b/i,
      /\bcommercial\b/i, /\bmonetis(?:ation|ed)\b/i,
    ],
    weight: 5,
  },
  {
    topic: "image-generation",
    patterns: [
      /\bimage\s*generat(?:ion|or)\b/i, /\btext.?to.?image\b/i,
      /\bStable\s*Diffusion\b/i, /\bDALL.?E\b/i, /\bMidjourney\b/i,
      /\bFlux\b/i, /\bimage\s*model\b/i, /\bvisual\s*generation\b/i,
    ],
    weight: 5,
  },
  {
    topic: "audio-video",
    patterns: [
      /\baudio\b.*\bgenerat(?:ion|or)\b/i, /\bvideo\s*generat(?:ion|or)\b/i,
      /\btext.?to.?speech\b/i, /\bElevenLabs\b/i, /\bSora\b/i,
      /\bvoice\s*cloning\b/i, /\bspeech\s*model\b/i, /\bmultimodal\b/i,
    ],
    weight: 5,
  },
  {
    topic: "hardware",
    patterns: [
      /\bNVIDIA\b/i, /\bH100\b/i, /\bH200\b/i, /\bB100\b/i, /\bB200\b/i,
      /\bGPU\b/i, /\bTPU\b/i, /\bdatacenter\b/i, /\baccelerator\b/i,
      /\binference\s*chip\b/i, /\bAMD\s*MI300\b/i, /\bGroq\b/i,
      /\bCerebras\b/i, /\bNPU\b/i, /\bsilicon\b/i,
    ],
    weight: 5,
  },
  {
    topic: "developer-tools",
    patterns: [
      /\bSDK\b/i, /\bAPI\b/i, /\bdeveloper\s*tool\b/i, /\bCLI\b/i,
      /\bPlayground\b/i, /\bVSCode\b/i, /\bIDE\b/i, /\bplugin\b/i,
      /\bdeployment\b/i, /\bMLOps\b/i, /\borchestration\b/i,
    ],
    weight: 4,
  },
  {
    topic: "open-source-releases",
    patterns: [
      /\brelease\b.*\b(open|source|code)\b/i, /\brepository\b.*\breleased\b/i,
      /\bv\d+\.\d+/i, /\bGitHub\s*release\b/i, /\bopen.?sourced\b/i,
    ],
    weight: 4,
  },
];

// ============================================================
// Entity patterns — model names, providers, key people
// ============================================================
const MODEL_PATTERNS: { name: string; provider: string; patterns: RegExp[] }[] = [
  { name: "GPT-5", provider: "OpenAI", patterns: [/\bGPT-5\b/i] },
  { name: "GPT-4o", provider: "OpenAI", patterns: [/\bGPT-4o\b/i] },
  { name: "Claude 4", provider: "Anthropic", patterns: [/\bClaude\s*4\b/i] },
  { name: "Claude 3.5 Sonnet", provider: "Anthropic", patterns: [/\bClaude\s*3\.?5\s*Sonnet\b/i] },
  { name: "Gemini 2", provider: "Google", patterns: [/\bGemini\s*2\b/i] },
  { name: "Gemini Ultra", provider: "Google", patterns: [/\bGemini\s*Ultra\b/i] },
  { name: "Llama 4", provider: "Meta", patterns: [/\bLlama\s*4\b/i] },
  { name: "Llama 3", provider: "Meta", patterns: [/\bLlama\s*3\b/i] },
  { name: "Mistral", provider: "Mistral AI", patterns: [/\bMistral\s*(Large|Small|Nemo|NeMo)?\b/i] },
  { name: "DeepSeek", provider: "DeepSeek", patterns: [/\bDeepSeek[-\s]*(V\d|Coder|Chat)?\b/i] },
  { name: "Qwen 2.5", provider: "Alibaba", patterns: [/\bQwen\s*2\.?5\b/i] },
  { name: "Gemma 2", provider: "Google", patterns: [/\bGemma\s*2\b/i] },
  { name: "Phi", provider: "Microsoft", patterns: [/\bPhi[-\s]*(3|4|Silica)\b/i] },
  { name: "Grok", provider: "xAI", patterns: [/\bGrok[-\s]*\d/i] },
  { name: "Stable Diffusion", provider: "Stability AI", patterns: [/\bStable\s*Diffusion\s*(\d|XL|SD3)\b/i] },
  { name: "o1", provider: "OpenAI", patterns: [/\bo1\b/i] },
  { name: "o3", provider: "OpenAI", patterns: [/\bo3\b/i] },
];

const PROVIDER_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  { name: "OpenAI", patterns: [/\bOpenAI\b/i] },
  { name: "Anthropic", patterns: [/\bAnthropic\b/i] },
  { name: "Google", patterns: [/\b(Google\s*(DeepMind|AI)|Gemini\s*API)\b/i] },
  { name: "Meta", patterns: [/\bMeta\s*AI\b/i] },
  { name: "Microsoft", patterns: [/\bMicrosoft\s*(AI|Copilot|Azure)\b/i] },
  { name: "Mistral AI", patterns: [/\bMistral\s*AI\b/i] },
  { name: "xAI", patterns: [/\bxAI\b/i] },
  { name: "NVIDIA", patterns: [/\bNVIDIA\b/i] },
  { name: "Amazon", patterns: [/\b(AWS|Amazon\s*Bedrock)\b/i] },
  { name: "Cohere", patterns: [/\bCohere\b/i] },
  { name: "Hugging Face", patterns: [/\bHugging\s*Face\b/i] },
  { name: "Stability AI", patterns: [/\bStability\s*AI\b/i] },
  { name: "DeepSeek", patterns: [/\bDeepSeek\b/i] },
  { name: "Alibaba", patterns: [/\b(Alibaba|Qwen)\b/i] },
];

// ============================================================
// Item type classification
// ============================================================
const ITEM_TYPE_RULES: { type: string; patterns: RegExp[] }[] = [
  { type: "model_release", patterns: [/\b(new|release|launch|announce).*\bmodel\b/i, /\bmodel\b.*\b(new|release|launch|announce)\b/i, /\bintroducing\b.*\bmodel\b/i] },
  { type: "model_update", patterns: [/\b(update|upgrade|version|checkpoint).*\bmodel\b/i, /\bmodel\b.*\b(update|upgrade)\b/i] },
  { type: "pricing_change", patterns: [/\b(pric(?:e|ing)).*\b(change|cut|drop|reduc|lower|increase|raise)\b/i, /\bnow\s*(free|cheaper|more\s*expensive)\b/i] },
  { type: "research_paper", patterns: [/\b(paper|preprint|study|research)\b.*\b(publish|release|propose|present)\b/i, /\barXiv\b/i] },
  { type: "benchmark_result", patterns: [/\b(benchmark|leaderboard|evaluation|score)\b.*\b(result|ranking|top)\b/i] },
  { type: "security_advisory", patterns: [/\b(security|vulnerability|CVE|exploit|advisory)\b/i] },
  { type: "regulation_update", patterns: [/\b(regulation|legislation|act|compliance|law)\b.*\b(update|change|pass|enact|effective)\b/i] },
  { type: "funding_announcement", patterns: [/\b(funding|raised|investment|series\s*[A-C]|valuation|acquired)\b/i] },
  { type: "product_launch", patterns: [/\b(launch|announce|unveil|introduce)\b.*\b(product|feature|platform|tool)\b/i] },
  { type: "deprecation", patterns: [/\b(deprecat|shut\s*down|discontinu|retir|sunset)\b/i] },
  { type: "partnership", patterns: [/\b(partner|collaborat|alliance)\b/i] },
  { type: "open_source_release", patterns: [/\b(open.?sourc|open.?weight|release).*\b(code|model|weights|repo)\b/i, /\bpublicly\s*available\b/i] },
];

// ============================================================
// Classification result type
// ============================================================
export interface ClassificationResult {
  topics: string[];
  models: string[];
  providers: string[];
  itemType: string | null;
  confidence: number; // 0–100
  classifiedAt: string;
}

// ============================================================
// Main classifier
// ============================================================
export function classifyFeedItem(item: FeedItem): ClassificationResult {
  const text = [item.title, item.summary ?? "", item.content_excerpt ?? ""].join(" ");

  // Topic classification
  const topicScores: Map<string, number> = new Map();
  for (const rule of TOPIC_RULES) {
    let matchCount = 0;
    for (const pattern of rule.patterns) {
      const matches = (text.match(new RegExp(pattern.source, pattern.flags)) || []).length;
      matchCount += matches;
    }
    if (matchCount > 0) {
      topicScores.set(rule.topic, matchCount * rule.weight);
    }
  }

  // Sort topics by score, take top 3
  const sortedTopics = [...topicScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  // If no topics matched, assign "general"
  if (sortedTopics.length === 0) {
    sortedTopics.push("general");
  }

  // Entity extraction
  const models = MODEL_PATTERNS
    .filter(m => m.patterns.some(p => p.test(text)))
    .map(m => m.name);

  const providers = PROVIDER_PATTERNS
    .filter(p => p.patterns.some(pat => pat.test(text)))
    .map(p => p.name);

  // Item type
  let itemType: string | null = null;
  for (const rule of ITEM_TYPE_RULES) {
    if (rule.patterns.some(p => p.test(text))) {
      itemType = rule.type;
      break; // First match wins
    }
  }

  // Confidence: based on how many signals matched
  const signalCount = sortedTopics.length + models.length + providers.length + (itemType ? 1 : 0);
  const confidence = Math.min(100, signalCount * 12 + 20);

  return {
    topics: sortedTopics,
    models: [...new Set(models)],       // deduplicate
    providers: [...new Set(providers)], // deduplicate
    itemType,
    confidence: Math.round(confidence),
    classifiedAt: new Date().toISOString(),
  };
}

// ============================================================
// Pipeline runner — classify all raw items from last 24h
// ============================================================
export async function runClassification(
  db: D1Database,
  onProgress?: (processed: number, total: number) => void
): Promise<{ processed: number; classified: number }> {
  const { results } = await db.prepare(
    "SELECT * FROM feed_items WHERE ingestion_status = 'raw' AND fetched_at >= datetime('now', '-1 day') ORDER BY fetched_at DESC LIMIT 500"
  ).all<FeedItem>();

  if (!results || results.length === 0) {
    return { processed: 0, classified: 0 };
  }

  let classified = 0;

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const classification = classifyFeedItem(item);

    await db.prepare(
      `UPDATE feed_items
       SET ingestion_status = 'classified',
           raw_metadata = ?
       WHERE id = ?`
    ).bind(
      JSON.stringify({
        classification: {
          topics: classification.topics,
          models: classification.models,
          providers: classification.providers,
          itemType: classification.itemType,
          confidence: classification.confidence,
          classifiedAt: classification.classifiedAt,
        },
      }),
      item.id
    ).run();

    classified++;
    onProgress?.(i + 1, results.length);
  }

  return { processed: results.length, classified };
}
