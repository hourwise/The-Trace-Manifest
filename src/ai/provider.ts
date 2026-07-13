// The Trace Manifest — AI Provider Interface
// Phase 5: Provider-neutral model gateway types per ADR-0008.
// All application code calls this interface — never provider-specific logic directly.

// ============================================================
// Task types
// ============================================================
export type TraceTaskType =
  | "ask_trace"        // Public Ask TRACE Q&A
  | "editorial"        // TRACE Analysis, article summarisation
  | "prediction"       // TRACE Predicts candidate generation
  | "newsletter"       // Newsletter content drafting
  | "internal";        // Admin/internal research (restricted)

// ============================================================
// Model identifiers
// ============================================================
export type TraceModelId =
  | "deepseek-v4-flash"   // Routine public requests
  | "deepseek-v4-pro";    // Reviewed editorial workflows only

// ============================================================
// Request/response types
// ============================================================

export interface TraceAnswerInput {
  taskType: "ask_trace";
  question: string;
  evidenceExcerpts: EvidenceExcerpt[];
  timeWindow?: { from?: string; to?: string };
  maxOutputTokens: number;
}

export interface TraceEditorialInput {
  taskType: "editorial";
  instruction: string;
  sourceMaterial: EvidenceExcerpt[];
  editorialContext?: string;
  maxOutputTokens: number;
}

export interface TracePredictionInput {
  taskType: "prediction";
  evidenceSummary: string;
  candidateCount: number;
  forecastWindow: { from: string; to: string };
  maxOutputTokens: number;
}

export type TraceTaskInput =
  | TraceAnswerInput
  | TraceEditorialInput
  | TracePredictionInput;

export interface EvidenceExcerpt {
  sourceId: string;
  claimId?: string;
  text: string;
  sourceClassification: string;
  publishedAt?: string;
  trustNotes?: string;
}

// ============================================================
// Structured output types
// ============================================================

export interface TraceAnswerDraft {
  answer: string;
  keyPoints: string[];
  citedSourceIds: string[];
  citedClaimIds: string[];
  confirmedFacts: string[];
  reportedClaims: string[];
  analysis?: string;
  disagreements: string[];
  caveats: string[];
  whatCouldChange: string;
  proposedConfidence: "high" | "medium" | "low" | "insufficient_evidence";
}

export interface TraceEditorialDraft {
  summary: string;
  analysis: string;
  keyPoints: string[];
  citedSourceIds: string[];
  caveats: string[];
  proposedConfidence: "high" | "medium" | "low";
}

export interface TracePredictionCandidate {
  title: string;
  prediction: string;
  probability: number;
  reasoning: string;
  evidenceSourceIds: string[];
  confirmationCriteria: string;
  failureCriteria: string;
  qualityScore: number;
}

// ============================================================
// Provider interface (ADR-0008: provider-neutral)
// ============================================================

export interface TraceModelProvider {
  /** Provider identifier for logging and circuit breakers */
  readonly providerId: string;

  /** Generate a structured answer from evidence */
  generateAnswer(input: TraceAnswerInput): Promise<TraceAnswerDraft>;

  /** Generate editorial content from source material */
  generateEditorial(input: TraceEditorialInput): Promise<TraceEditorialDraft>;

  /** Generate prediction candidates from evidence */
  generatePredictions(input: TracePredictionInput): Promise<TracePredictionCandidate[]>;

  /** Check provider health/balance — never exposed publicly */
  healthCheck(): Promise<ProviderHealth>;
}

export interface ProviderHealth {
  available: boolean;
  balance?: number;
  balanceCurrency?: string;
  checkedAt: string;
  models: { modelId: TraceModelId; available: boolean; latencyMs?: number }[];
}

// ============================================================
// Gateway configuration
// ============================================================

export interface TraceAIConfig {
  // Feature switches
  publicAskTraceEnabled: boolean;
  scheduledJobsEnabled: boolean;
  globalKillSwitch: boolean;

  // Provider config
  provider: "deepseek";
  deepseekApiKey: string;       // Server-side only, never exposed

  // Model routing
  publicModel: TraceModelId;
  editorialModel: TraceModelId;
  modelAllowlist: TraceModelId[];

  // Budget (USD)
  dailyPublicBudget: number;
  monthlyPublicBudget: number;
  maxCostPerRequest: number;
  warningBalance: number;
  restrictBalance: number;
  stopBalance: number;

  // Limits
  maxQuestionLength: number;
  maxEvidenceExcerpts: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxModelCallsPerRequest: number;
  maxRetries: number;
  maxValidationRegenerations: number;
  requestTimeoutMs: number;

  // Rate limiting
  dailyPublicQuestionsPerVisitor: number;
  maxConcurrentPerSession: number;
}

// ============================================================
// Usage tracking
// ============================================================

export interface UsageRecord {
  id: string;
  requestId: string;
  idempotencyKeyHash: string;
  taskType: TraceTaskType;
  provider: string;
  model: TraceModelId;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCost: number;
  actualCost: number;
  attemptNumber: number;
  latencyMs: number;
  providerStatus: number;
  validationStatus: "passed" | "failed" | "skipped";
  validationFailures: string[];
  budgetReservation: number;
  createdAt: string;
  completedAt: string;
}

// ============================================================
// Budget state
// ============================================================

export interface BudgetState {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  currentReservation: number;
  availableBalance: number;
  warningThreshold: number;
  restrictThreshold: number;
  stopThreshold: number;
  killSwitchActive: boolean;
  lastUpdated: string;
}

// ============================================================
// Circuit breaker state
// ============================================================

export type CircuitBreakerId =
  | "global_kill"
  | "public_ask"
  | "scheduled_jobs"
  | "provider_deepseek"
  | "model_flash"
  | "model_pro"
  | "daily_budget"
  | "monthly_budget"
  | "balance"
  | "auth_error"
  | "failure_rate"
  | "latency";

export type CircuitState = "closed" | "half_open" | "open";

export interface CircuitStatus {
  breakerId: CircuitBreakerId;
  state: CircuitState;
  openedAt?: string;
  failureCount: number;
  lastFailureAt?: string;
  lastFailureReason?: string;
}

// ============================================================
// Request state machine (ADR-0008 section 7.4)
// ============================================================

export type RequestState =
  | "received"
  | "validated"
  | "budget_reserved"
  | "retrieving"
  | "model_in_progress"
  | "validating"
  | "completed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "circuit_open";

export const TERMINAL_STATES: RequestState[] = [
  "completed", "failed", "rejected", "cancelled", "circuit_open",
];

export const VALID_TRANSITIONS: Record<RequestState, RequestState[]> = {
  received: ["validated", "rejected"],
  validated: ["budget_reserved", "rejected"],
  budget_reserved: ["retrieving", "failed"],
  retrieving: ["model_in_progress", "failed"],
  model_in_progress: ["validating", "failed"],
  validating: ["completed", "failed"],
  completed: [],
  failed: [],
  rejected: [],
  cancelled: [],
  circuit_open: [],
};
