import assert from "node:assert/strict";
import { askTrace } from "../src/ai/trace-model-gateway";
import type {
  EvidenceExcerpt, ProviderGeneration, TraceAnswerDraft, TraceAnswerInput,
  TraceEditorialDraft, TraceModelProvider, TracePredictionCandidate,
} from "../src/ai/provider";
import { buildAskTraceDecisionPacket } from "../src/lib/server/ask-trace-decision";
import { selectKnowledgeConclusion } from "../src/lib/server/knowledge-conclusion-policy";
import { SQLiteD1 } from "./sqlite-d1";

const baseEnvironment = {
  DEEPSEEK_API_KEY: "test-secret",
  TRACE_ENVIRONMENT: "development",
  TRACE_AI_PUBLIC_ENABLED: "true",
  TRACE_AI_DAILY_PUBLIC_BUDGET_USD: "1",
  TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD: "10",
  TRACE_AI_ASK_DAILY_BUDGET_USD: "1",
  TRACE_AI_MAX_COST_PER_REQUEST_USD: "0.10",
  TRACE_AI_DAILY_QUESTIONS: "3",
};

function evidenceForClaim(claimId: string, sourceId: string, groupId: string, index: number): EvidenceExcerpt {
  return {
    sourceId,
    sourceKind: "external_primary",
    sourceRole: "evidence",
    admissionState: "admitted",
    freshnessState: "current",
    independentEvidenceWeight: 0,
    claimId: `claim:${claimId}:${index}`,
    canonicalClaimId: claimId,
    provenanceGroupIds: [groupId],
    evidenceQuality: "strong",
    text: `Reviewed evidence for ${claimId} from ${sourceId}.`,
    sourceClassification: "Tier A; primary",
    trustNotes: "Evidence quality: strong",
    observedAt: "2026-08-01T00:00:00Z",
    assertionId: `assertion-${sourceId}`,
    sourceDocumentVersionId: `version-${sourceId}`,
    sourceChunkId: `chunk-${sourceId}`,
    startLocator: "p1:1",
    endLocator: "p1:2",
    relationship: "supports",
    directness: "direct",
    externalEvidenceResolved: false,
  };
}

function supportedEvidence(): EvidenceExcerpt[] {
  return [
    evidenceForClaim("claim-supported", "source-a", "root-a", 1),
    evidenceForClaim("claim-supported", "source-b", "root-b", 2),
  ];
}

function fakeDraft(input: TraceAnswerInput): TraceAnswerDraft {
  const claims = [...new Map(input.evidenceExcerpts
    .filter((item): item is EvidenceExcerpt & { claimId: string } => Boolean(item.claimId))
    .map(item => [item.claimId, item]))]
    .map(([claimId, item]) => ({
      text: `The reviewed evidence supports ${claimId}.`,
      evidenceSourceIds: [item.sourceId],
      evidenceClaimIds: [claimId],
      claimId,
      statement: `The reviewed evidence supports ${claimId}.`,
      relationship: "supports",
      citationAssertionIds: [],
    }));
  return {
    answer: "The supplied reviewed evidence supports this bounded answer.",
    evidenceMode: input.decision.evidenceMode,
    conclusionMode: input.decision.conclusionMode,
    directAnswer: "The supplied reviewed evidence supports this bounded answer.",
    lean: input.decision.leanPositionId,
    whyLean: input.decision.leanPositionId ? "The application selected this position from the evidence packet." : "No defensible lean was selected.",
    positions: input.decision.positions,
    sourceSummaries: input.evidenceExcerpts.map(item => ({
      sourceId: item.sourceId,
      sourceName: item.sourceId,
      sourceRole: "primary",
      summary: "Reviewed evidence.",
      materialClaims: item.claimId ? [item.claimId] : [],
      caveats: [],
      publishedAt: null,
      retrievedAt: item.observedAt ?? null,
    })),
    confidence: input.decision.confidence,
    confidenceScore: input.decision.confidenceScore,
    confidenceReasons: input.decision.confidenceReasons,
    limitations: [],
    unresolvedQuestions: [],
    freshestEvidenceAt: "2026-08-01T00:00:00Z",
    keyPoints: ["The answer is bounded by the supplied evidence."],
    claims,
    citations: [],
    citedSourceIds: input.evidenceExcerpts.map(item => item.sourceId),
    citedClaimIds: claims.map(claim => claim.claimId),
    confirmedFacts: [],
    reportedClaims: [],
    analysis: "",
    disagreements: input.decision.conclusionMode === "multiple_positions" ? ["Competing positions remain."] : [],
    caveats: [],
    whatCouldChange: input.decision.whatCouldChange.join(" "),
    proposedConfidence: input.decision.confidence,
  };
}

class FakeProvider implements TraceModelProvider {
  readonly providerId = "fake";
  calls = 0;
  mutate?: (draft: TraceAnswerDraft) => TraceAnswerDraft;

  async generateAnswer(input: TraceAnswerInput): Promise<ProviderGeneration<TraceAnswerDraft>> {
    this.calls += 1;
    const output = this.mutate?.(fakeDraft(input)) ?? fakeDraft(input);
    return { output, usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, providerStatus: 200 };
  }

  async generateEditorial(_input: { instruction: string }): Promise<ProviderGeneration<TraceEditorialDraft>> {
    throw new Error("not used");
  }

  async generatePredictions(_input: { evidenceSummary: string }): Promise<ProviderGeneration<TracePredictionCandidate[]>> {
    throw new Error("not used");
  }

  async healthCheck(): Promise<{ available: boolean; checkedAt: string; models: [] }> {
    return { available: true, checkedAt: new Date().toISOString(), models: [] };
  }
}

function requestContext(requestId: string, evidenceExcerpts: EvidenceExcerpt[], decisionPacket: Awaited<ReturnType<typeof buildAskTraceDecisionPacket>>) {
  return {
    requestId,
    idempotencyKeyHash: `idempotency-${requestId}`,
    visitorHash: `visitor-${requestId}`,
    questionHash: `question-${requestId}`,
    question: "What does the reviewed evidence support?",
    evidenceExcerpts,
    decisionPacket,
  };
}

async function run(): Promise<void> {
  {
    const db = new SQLiteD1();
    try {
      const decision = await buildAskTraceDecisionPacket(db.asD1(), supportedEvidence());
      assert.equal(decision.conclusionMode, "supported");
      assert.equal(decision.synthesisMode, "model");
      assert.equal(decision.leanPositionId, decision.positions[0]?.id);

      const vendorOnly = supportedEvidence().map(item => ({
        ...item,
        sourceKind: "external_vendor" as const,
        sourceRole: "reported_claim" as const,
        sourceClassification: "Vendor; reported claim",
        directness: "direct" as const,
      }));
      const vendorDecision = await buildAskTraceDecisionPacket(db.asD1(), vendorOnly);
      assert.equal(vendorDecision.conclusionMode, "insufficient_evidence", "vendor-only evidence cannot establish a supported factual answer");

      const missingDirectness = await buildAskTraceDecisionPacket(db.asD1(), supportedEvidence().map(item => ({
        ...item,
        directness: undefined,
      })));
      assert.equal(missingDirectness.conclusionMode, "insufficient_evidence",
        "missing directness cannot be counted as direct evidence");

      const displayWordingOnly = await buildAskTraceDecisionPacket(db.asD1(), supportedEvidence().map(item => ({
        ...item,
        evidenceQuality: "unrated" as const,
        trustNotes: "Evidence quality: very_strong",
      })));
      const differentDisplayWording = await buildAskTraceDecisionPacket(db.asD1(), supportedEvidence().map(item => ({
        ...item,
        evidenceQuality: "unrated" as const,
        trustNotes: "Evidence quality: weak",
      })));
      assert.equal(displayWordingOnly.confidenceScore, differentDisplayWording.confidenceScore,
        "display wording changes cannot alter the governed decision");
      assert.ok(decision.confidenceScore > displayWordingOnly.confidenceScore,
        "structured strong evidence quality, not display text, increases the governed score");
    } finally {
      db.close();
    }
  }

  {
    const db = new SQLiteD1();
    try {
      db.sqlite.exec("DROP TABLE knowledge_claim_relationship_proposals");
      const evidence = supportedEvidence();
      const decision = await buildAskTraceDecisionPacket(db.asD1(), evidence);
      assert.equal(decision.conclusionMode, "insufficient_evidence",
        "relationship query failure degrades to insufficient evidence");
      assert.equal(decision.confidence, "insufficient_evidence");
      assert.equal(decision.confidenceScore, 0);
      assert.equal(decision.synthesisMode, "none");

      const result = await askTrace(
        { ...baseEnvironment, TRACE_AI_EDITORIAL_ENABLED: "true", DB: db.asD1(), TRACE_MODEL_PROVIDER: new FakeProvider() },
        { ...requestContext("relationship-failure", evidence, decision), adminOverride: true },
      );
      assert.equal(result.status, "ok");
      assert.equal(result.payload?.conclusionMode, "insufficient_evidence");
      assert.equal(result.payload?.confidenceScore, 0,
        "a relationship failure cannot expose a more confident diagnostic score");
    } finally {
      db.close();
    }
  }

  {
    const db = new SQLiteD1();
    const provider = new FakeProvider();
    try {
      const stale = supportedEvidence().map(item => ({ ...item, freshnessState: "stale" as const }));
      const decision = await buildAskTraceDecisionPacket(db.asD1(), stale);
      const env = { ...baseEnvironment, DB: db.asD1(), TRACE_MODEL_PROVIDER: provider };
      const first = await askTrace(env, {
        ...requestContext("insufficient-1", stale, decision),
        idempotencyKeyHash: "idempotency-insufficient-stable",
      });
      const duplicate = await askTrace(env, {
        ...requestContext("insufficient-2", stale, decision),
        idempotencyKeyHash: "idempotency-insufficient-stable",
      });
      assert.equal(first.status, "ok");
      assert.equal(first.payload?.nonAnswer, true);
      assert.equal(provider.calls, 0, "insufficient evidence never calls the provider");
      assert.equal(duplicate.status, "ok");
      assert.equal(duplicate.payload?.nonAnswer, true, "deterministic completion is replayable");
      const usage = await db.prepare("SELECT COUNT(*) AS count FROM ai_usage_ledger").first<{ count: number }>();
      assert.equal(usage?.count, 0, "model-free answers consume zero provider cost");
    } finally {
      db.close();
    }
  }

  {
    const db = new SQLiteD1();
    const provider = new FakeProvider();
    try {
      const evidence = supportedEvidence();
      const decision = await buildAskTraceDecisionPacket(db.asD1(), evidence, "refused");
      const result = await askTrace({ ...baseEnvironment, DB: db.asD1(), TRACE_MODEL_PROVIDER: provider }, {
        ...requestContext("refused-1", evidence, decision),
        requestedEvidenceMode: "refused",
      });
      assert.equal(result.status, "ok");
      assert.equal(result.payload?.evidenceMode, "refused");
      assert.equal(provider.calls, 0, "application-selected refusal never calls the provider");
    } finally {
      db.close();
    }
  }

  {
    const db = new SQLiteD1();
    const provider = new FakeProvider();
    try {
      const evidence = supportedEvidence();
      const decision = await buildAskTraceDecisionPacket(db.asD1(), evidence);
      const result = await askTrace({ ...baseEnvironment, DB: db.asD1(), TRACE_MODEL_PROVIDER: provider }, requestContext("synthesis-1", evidence, decision));
      assert.equal(result.status, "ok");
      assert.equal(provider.calls, 1, "synthesis-required answers call the provider exactly once");
      assert.equal(decision.synthesisMode, "model");
      const usage = await db.prepare("SELECT COUNT(*) AS count FROM ai_usage_ledger").first<{ count: number }>();
      assert.equal(usage?.count, 1, "the synthesis path records one provider usage row");
    } finally {
      db.close();
    }
  }

  {
    const qualified = selectKnowledgeConclusion({
      evidenceMode: "researched",
      positions: [
        { positionId: "position-a", evidenceCount: 3, currentEvidenceCount: 3, directEvidenceCount: 2, independentProvenanceGroupCount: 2, strongEvidenceCount: 2 },
        { positionId: "position-b", evidenceCount: 2, currentEvidenceCount: 2, directEvidenceCount: 1, independentProvenanceGroupCount: 1, strongEvidenceCount: 0 },
      ],
      competitions: [{ leftPositionId: "position-a", rightPositionId: "position-b" }],
    });
    assert.equal(qualified.conclusionMode, "qualified_lean");
    assert.equal(qualified.leanPositionId, "position-a");

    const multiple = selectKnowledgeConclusion({
      evidenceMode: "researched",
      positions: [
        { positionId: "position-a", evidenceCount: 2, currentEvidenceCount: 2, directEvidenceCount: 1, independentProvenanceGroupCount: 1 },
        { positionId: "position-b", evidenceCount: 2, currentEvidenceCount: 2, directEvidenceCount: 1, independentProvenanceGroupCount: 1 },
      ],
      competitions: [{ leftPositionId: "position-a", rightPositionId: "position-b" }],
    });
    assert.equal(multiple.conclusionMode, "multiple_positions");
    assert.equal(multiple.leanPositionId, null);
  }

  {
    const db = new SQLiteD1();
    const provider = new FakeProvider();
    provider.mutate = (draft) => ({ ...draft, lean: "position:invented" });
    try {
      const evidence = supportedEvidence();
      const decision = await buildAskTraceDecisionPacket(db.asD1(), evidence);
      const result = await askTrace({ ...baseEnvironment, DB: db.asD1(), TRACE_MODEL_PROVIDER: provider }, requestContext("tampered-lean", evidence, decision));
      assert.equal(provider.calls, 1);
      assert.equal(result.status, "ok");
      assert.equal(result.payload?.nonAnswer, true, "a model-selected lean is rejected fail-closed");
      assert.equal(result.payload?.lean, decision.leanPositionId, "the safe result retains the application-selected lean");
    } finally {
      db.close();
    }
  }

  {
    const db = new SQLiteD1();
    const provider = new FakeProvider();
    provider.mutate = (draft) => ({ ...draft, confidence: "low", confidenceScore: 1 });
    try {
      const evidence = supportedEvidence();
      const decision = await buildAskTraceDecisionPacket(db.asD1(), evidence);
      const result = await askTrace({ ...baseEnvironment, DB: db.asD1(), TRACE_MODEL_PROVIDER: provider }, requestContext("tampered-confidence", evidence, decision));
      assert.equal(provider.calls, 1);
      assert.equal(result.payload?.nonAnswer, true, "a model-selected confidence is rejected fail-closed");
    } finally {
      db.close();
    }
  }

  {
    const db = new SQLiteD1();
    const provider = new FakeProvider();
    provider.mutate = (draft) => ({ ...draft, citedSourceIds: [...draft.citedSourceIds, "source-invented"] });
    try {
      const evidence = supportedEvidence();
      const decision = await buildAskTraceDecisionPacket(db.asD1(), evidence);
      const result = await askTrace({ ...baseEnvironment, DB: db.asD1(), TRACE_MODEL_PROVIDER: provider }, requestContext("invented-citation", evidence, decision));
      assert.equal(provider.calls, 1);
      assert.equal(result.payload?.nonAnswer, true, "a citation outside the supplied evidence packet is rejected");
    } finally {
      db.close();
    }
  }
}

await run();
console.log("Ask TRACE deterministic-first tests passed.");
