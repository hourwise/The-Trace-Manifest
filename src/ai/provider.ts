// The Trace Manifest — AI Provider Interface
// Phase 5: Provider-neutral model gateway types per ADR-0008.
// All application code calls this interface — never provider-specific logic directly.

import type {
  TraceAdmissionState, TraceEvidenceQuality, TraceFreshnessState, TraceSourceKind, TraceSourceRole,
} from "./task-policy";

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
  /** Application-owned KC-09 decision. The provider may only render it. */
  decision: TraceAnswerDecision;
  timeWindow?: { from?: string; to?: string };
  maxOutputTokens: number;
}

export interface TraceAnswerDecision {
  evidenceMode: "knowledge" | "researched" | "insufficient" | "out_of_scope" | "refused";
  conclusionMode: "supported" | "qualified_lean" | "multiple_positions" | "insufficient_evidence";
  confidence: "high" | "medium" | "low" | "insufficient_evidence";
  confidenceScore: number;
  confidenceReasons: string[];
  leanPositionId: string | null;
  positionIds: string[];
  positions: TraceAnswerPosition[];
  competitions: Array<{
    leftPositionId: string;
    rightPositionId: string;
    relationships: string[];
  }>;
  evidenceIds: string[];
  claimIds: string[];
  assertionIds: string[];
  whatCouldChange: string[];
}

export interface TraceEditorialInput {
  taskType: "editorial";
  /** Explicit gateway-selected model. Providers must not choose a different tier. */
  model?: TraceModelId;
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
  /** ADR 0016 provenance fields; TRACE synthesis is context, never independent proof. */
  sourceKind: TraceSourceKind;
  sourceRole: TraceSourceRole;
  admissionState: TraceAdmissionState;
  freshnessState: TraceFreshnessState;
  independentEvidenceWeight: 0 | 1;
  /** Structured governed quality; display text must never be parsed for decisions. */
  evidenceQuality?: TraceEvidenceQuality;
  claimId?: string;
  text: string;
  sourceClassification: string;
  sourceName?: string;
  sourceUrl?: string;
  observedAt?: string;
  publishedAt?: string;
  trustNotes?: string;
  relationship?: string;
  isDisputed?: boolean;
  /** True only when a TRACE knowledge record's external assertion bundle is resolved. */
  externalEvidenceResolved?: boolean;
  /** KC-08G provenance locators retained for citation-resolution work. */
  assertionId?: string;
  sourceDocumentVersionId?: string;
  sourceChunkId?: string;
  startLocator?: string;
  endLocator?: string;
  knowledgeDocumentId?: string;
  /** KC-09F/G application-owned grouping metadata. */
  canonicalClaimId?: string;
  provenanceGroupIds?: string[];
  directness?: "direct" | "indirect" | "derivative" | "unknown";
}

// ============================================================
// Structured output types
// ============================================================

export interface TraceAnswerDraft {
  answer: string;
  /** KC-09H validated answer contract. */
  evidenceMode: "knowledge" | "researched" | "insufficient" | "out_of_scope" | "refused";
  conclusionMode: "supported" | "qualified_lean" | "multiple_positions" | "insufficient_evidence";
  directAnswer: string;
  lean: string | null;
  whyLean: string;
  positions: TraceAnswerPosition[];
  sourceSummaries: TraceAnswerSourceSummary[];
  confidence: "high" | "medium" | "low" | "insufficient_evidence";
  confidenceScore: number | null;
  confidenceReasons: string[];
  limitations: string[];
  unresolvedQuestions: string[];
  freshestEvidenceAt: string | null;
  keyPoints: string[];
  claims: TraceAnswerClaim[];
  citations: TraceAnswerCitation[];
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

export interface TraceAnswerClaim {
  text: string;
  evidenceSourceIds: string[];
  evidenceClaimIds: string[];
  claimId: string;
  statement: string;
  relationship: string;
  citationAssertionIds: string[];
}

export interface TraceAnswerPosition {
  positionId: string;
  label: string;
  summary: string;
  supportingClaimIds: string[];
  contradictingClaimIds: string[];
  sourceIds: string[];
}

export interface TraceAnswerCitation {
  assertionId: string;
  sourceDocumentVersionId: string;
  sourceChunkId: string;
  startLocator: string;
  endLocator: string;
}

export interface TraceAnswerSourceSummary {
  sourceId: string;
  sourceName: string;
  sourceRole: string;
  summary: string;
  materialClaims: string[];
  caveats: string[];
  publishedAt: string | null;
  retrievedAt: string | null;
}

export interface TraceEditorialDraft {
  headline?: string;
  summary: string;
  analysis: string;
  whyItMatters?: string;
  isNewsworthy?: boolean;
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
  generateAnswer(input: TraceAnswerInput): Promise<ProviderGeneration<TraceAnswerDraft>>;

  /** Generate editorial content from source material */
  generateEditorial(input: TraceEditorialInput): Promise<ProviderGeneration<TraceEditorialDraft>>;

  /** Generate prediction candidates from evidence */
  generatePredictions(input: TracePredictionInput): Promise<ProviderGeneration<TracePredictionCandidate[]>>;

  /** Check provider health/balance — never exposed publicly */
  healthCheck(): Promise<ProviderHealth>;
}

export interface ProviderTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
}

export interface ProviderGeneration<T> {
  output: T;
  usage: ProviderTokenUsage;
  providerStatus: number;
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
  /** Explicit opt-in for application-owned no-provider Ask TRACE responses. */
  askMode: "provider" | "deterministic";
  editorialAIEnabled: boolean;
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
  modelPricing: Record<TraceModelId, { inputPerMillionUsd: number; outputPerMillionUsd: number }>;
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
