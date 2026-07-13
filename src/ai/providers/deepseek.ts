// The Trace Manifest — DeepSeek Provider Adapter
// Phase 5: DeepSeek API integration per ADR-0008.
// Implements TraceModelProvider interface.
// Uses deepseek-v4-flash (routine) and deepseek-v4-pro (editorial).
// Never uses deprecated aliases: deepseek-chat, deepseek-reasoner.

import type {
  TraceModelProvider, ProviderHealth,
  TraceAnswerInput, TraceEditorialInput, TracePredictionInput,
  TraceAnswerDraft, TraceEditorialDraft, TracePredictionCandidate,
  TraceModelId, TraceAIConfig,
} from "../provider";

// ============================================================
// DeepSeek API configuration
// ============================================================

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

// Model name mapping — never use deprecated aliases
const MODEL_NAMES: Record<TraceModelId, string> = {
  "deepseek-v4-flash": "deepseek-v4-flash",
  "deepseek-v4-pro": "deepseek-v4-pro",
};

// ============================================================
// DeepSeek provider implementation
// ============================================================

export class DeepSeekProvider implements TraceModelProvider {
  readonly providerId = "deepseek";
  private apiKey: string;
  private config: TraceAIConfig;

  constructor(config: TraceAIConfig) {
    this.apiKey = config.deepseekApiKey;
    this.config = config;
  }

  // ============================================================
  // Answer generation (Ask TRACE)
  // ============================================================

  async generateAnswer(input: TraceAnswerInput): Promise<TraceAnswerDraft> {
    const model = MODEL_NAMES[this.config.publicModel];
    const systemPrompt = buildAnswerSystemPrompt(input);
    const userPrompt = buildAnswerUserPrompt(input);

    const response = await this.callAPI(model, systemPrompt, userPrompt, {
      max_tokens: input.maxOutputTokens,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    return this.parseAnswerResponse(response, input);
  }

  // ============================================================
  // Editorial generation
  // ============================================================

  async generateEditorial(input: TraceEditorialInput): Promise<TraceEditorialDraft> {
    const model = MODEL_NAMES[this.config.editorialModel];
    const systemPrompt = buildEditorialSystemPrompt();
    const userPrompt = buildEditorialUserPrompt(input);

    const response = await this.callAPI(model, systemPrompt, userPrompt, {
      max_tokens: input.maxOutputTokens,
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    return this.parseEditorialResponse(response);
  }

  // ============================================================
  // Prediction generation
  // ============================================================

  async generatePredictions(input: TracePredictionInput): Promise<TracePredictionCandidate[]> {
    const model = MODEL_NAMES[this.config.editorialModel]; // Predictions use editorial model
    const systemPrompt = buildPredictionSystemPrompt(input);
    const userPrompt = buildPredictionUserPrompt(input);

    const response = await this.callAPI(model, systemPrompt, userPrompt, {
      max_tokens: input.maxOutputTokens,
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    return this.parsePredictionResponse(response);
  }

  // ============================================================
  // Health check — never exposed publicly
  // ============================================================

  async healthCheck(): Promise<ProviderHealth> {
    try {
      // Check balance via user endpoint (server-side only)
      const balanceResponse = await fetch(`${DEEPSEEK_BASE_URL}/user/balance`, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      const available = balanceResponse.ok;
      let balance: number | undefined;

      if (available) {
        const data = await balanceResponse.json() as any;
        // DeepSeek balance API returns { balance: number } or similar
        balance = data.balance ?? data.total_balance ?? data.available;
      }

      return {
        available,
        balance,
        balanceCurrency: "USD",
        checkedAt: new Date().toISOString(),
        models: [
          { modelId: "deepseek-v4-flash", available, latencyMs: undefined },
          { modelId: "deepseek-v4-pro", available, latencyMs: undefined },
        ],
      };
    } catch (err: any) {
      return {
        available: false,
        checkedAt: new Date().toISOString(),
        models: [
          { modelId: "deepseek-v4-flash", available: false },
          { modelId: "deepseek-v4-pro", available: false },
        ],
      };
    }
  }

  // ============================================================
  // Core API call (ADR-0008: explicit retry policy, no generic retry)
  // ============================================================

  private async callAPI(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    params: {
      max_tokens: number;
      temperature: number;
      response_format?: { type: string };
    },
  ): Promise<any> {
    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      ...(params.response_format ? { response_format: params.response_format } : {}),
    });

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });

    // Explicit retry policy per ADR-0008 section 7.3
    if (!response.ok) {
      const status = response.status;
      const errorBody = await response.text().catch(() => "");

      switch (status) {
        case 400:
          throw new Error(`DeepSeek 400: Invalid request format — ${errorBody}`);
        case 401:
          throw new Error(`DeepSeek 401: Authentication failure — key may be invalid or expired`);
        case 402:
          throw new Error(`DeepSeek 402: Insufficient balance — topping up required`);
        case 422:
          throw new Error(`DeepSeek 422: Invalid parameters — ${errorBody}`);
        case 429:
          throw new Error(`DeepSeek 429: Rate limited — retry with backoff`);
        case 500:
        case 503:
          throw new Error(`DeepSeek ${status}: Provider error — may retry`);
        default:
          throw new Error(`DeepSeek ${status}: Unexpected error — ${errorBody}`);
      }
    }

    return response.json();
  }

  // ============================================================
  // Response parsers — extract structured output from JSON
  // ============================================================

  private parseAnswerResponse(data: any, input: TraceAnswerInput): TraceAnswerDraft {
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned empty response");

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      throw new Error("DeepSeek response is not valid JSON");
    }

    return {
      answer: parsed.answer ?? parsed.answer_text ?? "",
      keyPoints: parsed.key_points ?? parsed.keyPoints ?? [],
      citedSourceIds: parsed.cited_source_ids ?? parsed.citedSourceIds ?? [],
      citedClaimIds: parsed.cited_claim_ids ?? parsed.citedClaimIds ?? [],
      confirmedFacts: parsed.confirmed_facts ?? parsed.confirmedFacts ?? [],
      reportedClaims: parsed.reported_claims ?? parsed.reportedClaims ?? [],
      analysis: parsed.analysis ?? undefined,
      disagreements: parsed.disagreements ?? [],
      caveats: parsed.caveats ?? [],
      whatCouldChange: parsed.what_could_change ?? parsed.whatCouldChange ?? "",
      proposedConfidence: parsed.proposed_confidence ?? parsed.proposedConfidence ?? "medium",
    };
  }

  private parseEditorialResponse(data: any): TraceEditorialDraft {
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned empty response");

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      throw new Error("DeepSeek response is not valid JSON");
    }

    return {
      summary: parsed.summary ?? "",
      analysis: parsed.analysis ?? "",
      keyPoints: parsed.key_points ?? parsed.keyPoints ?? [],
      citedSourceIds: parsed.cited_source_ids ?? parsed.citedSourceIds ?? [],
      caveats: parsed.caveats ?? [],
      proposedConfidence: parsed.proposed_confidence ?? parsed.proposedConfidence ?? "medium",
    };
  }

  private parsePredictionResponse(data: any): TracePredictionCandidate[] {
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned empty response");

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      throw new Error("DeepSeek response is not valid JSON");
    }

    const candidates = parsed.predictions ?? parsed.candidates ?? [];
    if (!Array.isArray(candidates)) throw new Error("Predictions response is not an array");

    return candidates.map((c: any) => ({
      title: c.title ?? "",
      prediction: c.prediction ?? "",
      probability: c.probability ?? 50,
      reasoning: c.reasoning ?? "",
      evidenceSourceIds: c.evidence_source_ids ?? c.evidenceSourceIds ?? [],
      confirmationCriteria: c.confirmation_criteria ?? c.confirmationCriteria ?? "",
      failureCriteria: c.failure_criteria ?? c.failureCriteria ?? "",
      qualityScore: c.quality_score ?? c.qualityScore ?? 50,
    }));
  }
}

// ============================================================
// Prompt builders
// ============================================================

function buildAnswerSystemPrompt(input: TraceAnswerInput): string {
  return `You are TRACE — Traceable Research, Analysis, Context and Evidence.
You answer questions using ONLY the evidence excerpts supplied to you.
You must NOT invent facts, sources, or citations.
You must NOT claim knowledge beyond the supplied evidence.
If evidence is insufficient, say so explicitly.
Always distinguish between confirmed facts and reported claims.
Always label your analysis as analysis.
Always cite specific source IDs for every factual statement.
Respond ONLY with valid JSON matching the required schema.`;
}

function buildAnswerUserPrompt(input: TraceAnswerInput): string {
  const excerpts = input.evidenceExcerpts.map((e, i) =>
    `[SOURCE:${e.sourceId}]${e.claimId ? ` [CLAIM:${e.claimId}]` : ""} (${e.sourceClassification})\n${e.text}`
  ).join("\n\n");

  const timeInfo = input.timeWindow
    ? `\nTime window: ${input.timeWindow.from ?? "any"} to ${input.timeWindow.to ?? "now"}`
    : "";

  return `Question: ${input.question}${timeInfo}

Evidence excerpts:
${excerpts}

Respond with JSON:
{
  "answer": "concise answer",
  "key_points": ["point 1", "point 2"],
  "cited_source_ids": ["source_id"],
  "cited_claim_ids": ["claim_id"],
  "confirmed_facts": ["fact supported by primary sources"],
  "reported_claims": ["claim reported but not independently verified"],
  "analysis": "TRACE analysis of significance (optional)",
  "disagreements": ["disagreement between sources"],
  "caveats": ["limitation or uncertainty"],
  "what_could_change": "what new evidence would change the answer",
  "proposed_confidence": "high|medium|low|insufficient_evidence"
}`;
}

function buildEditorialSystemPrompt(): string {
  return `You are TRACE — Traceable Research, Analysis, Context and Evidence.
You draft editorial content based on supplied source material.
Distinguish neutral summary from analysis.
Cite source IDs for factual statements.
Label uncertainty explicitly.
Respond ONLY with valid JSON.`;
}

function buildEditorialUserPrompt(input: TraceEditorialInput): string {
  const material = input.sourceMaterial.map((e, i) =>
    `[SOURCE:${e.sourceId}] ${e.text}`
  ).join("\n\n");

  return `Instruction: ${input.instruction}
${input.editorialContext ? `\nContext: ${input.editorialContext}` : ""}

Source material:
${material}

Respond with JSON:
{
  "summary": "neutral summary of what happened",
  "analysis": "TRACE analysis — why it matters, what may be overstated",
  "key_points": ["point 1", "point 2"],
  "cited_source_ids": ["source_id"],
  "caveats": ["limitation or uncertainty"],
  "proposed_confidence": "high|medium|low"
}`;
}

function buildPredictionSystemPrompt(input: TracePredictionInput): string {
  return `You are TRACE Predicts. You generate falsifiable, evidence-linked predictions.
Every prediction must include: probability (0-100), confirmation criteria, failure criteria.
Reject vague predictions that cannot be evaluated.
Reject predictions without evidence support.
Respond ONLY with valid JSON.`;
}

function buildPredictionUserPrompt(input: TracePredictionInput): string {
  return `Evidence summary:
${input.evidenceSummary}

Forecast window: ${input.forecastWindow.from} to ${input.forecastWindow.to}
Generate ${input.candidateCount} prediction candidates.

Respond with JSON:
{
  "predictions": [
    {
      "title": "short prediction title",
      "prediction": "what is expected to happen",
      "probability": 65,
      "reasoning": "why this prediction based on evidence",
      "evidence_source_ids": ["source_id"],
      "confirmation_criteria": "what counts as confirmed",
      "failure_criteria": "what counts as failed",
      "quality_score": 75
    }
  ]
}`;
}
