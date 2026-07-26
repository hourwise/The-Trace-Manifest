import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DurableAIGovernance } from "../src/ai/durable-governance";
import { askTrace } from "../src/ai/trace-model-gateway";
import { validateAnswerDraft, validateAskTraceInput } from "../src/ai/schemas";
import { validateAnswerOutput } from "../src/ai/validation";
import { calculateDeterministicConfidence, isKnowledgeHardExpired, isKnowledgeReviewDue, retrieveApprovedKnowledge, retrievePublishedEvidence } from "../src/lib/server/ask-evidence";
import { independentEvidenceWeightFor, isAnswerEligibleEvidence, PUBLIC_ASK_TASK_POLICY, TRACE_POLICY_VERSION } from "../src/ai/task-policy";
import { GUIDE_CONTRACT_VERSION, guideFreshness, isGuideEligibleForProceduralRetrieval, validateGuideCommand, validateGuideMetadata } from "../src/guides/contract";
import { nodeWindowsVerificationCommands } from "../src/guides/drafts/install-node-js-and-npm-on-windows";
import { validateAskBody } from "../src/pages/api/trace/ask";
import { handleTriageRequest } from "../src/pages/api/admin/ai-triage";
import { extractTriageUrlSource, TriageUrlFetchError } from "../src/lib/server/triage-url-source";
import { retrieveRemoteSource, SourceRetrievalError } from "../src/lib/server/source-retrieval";
import { extractHtmlDocument } from "../src/lib/server/source-extraction";
import { extractStructuredSource } from "../src/lib/server/source-structured-extraction";
import { ExtractionReviewError, reviewKnowledgeExtraction } from "../src/lib/server/knowledge-extraction-review";
import { claimKnowledgeExtractionRun, failKnowledgeExtractionRun, settleKnowledgeExtractionRun } from "../src/lib/server/knowledge-extraction-cache";
import { generateClaimMatchCandidates } from "../src/lib/server/claim-match-candidates";
import { ClaimMatchReviewError, reviewClaimMatchCandidate } from "../src/lib/server/claim-match-review";
import { generateClaimProvenanceProposal } from "../src/lib/server/claim-provenance-proposals";
import { ClaimProvenanceReviewError, reviewClaimProvenanceProposal } from "../src/lib/server/claim-provenance-review";
import { generateProvenanceGroupProposals } from "../src/lib/server/provenance-group-proposals";
import { ProvenanceGroupReviewError, reviewProvenanceGroupProposal } from "../src/lib/server/provenance-group-review";
import { generateClaimRelationshipProposals } from "../src/lib/server/claim-relationship-proposals";
import { ClaimRelationshipReviewError, reviewClaimRelationshipProposal } from "../src/lib/server/claim-relationship-review";
import { generateClaimConflictCase } from "../src/lib/server/claim-conflict-cases";
import { ClaimConflictReviewError, reviewClaimConflictCase } from "../src/lib/server/claim-conflict-review";
import { writeCanonicalClaim } from "../src/lib/server/canonical-claim-write";
import { EVIDENCE_SCORE_POLICY_VERSION, scoreCanonicalClaim, scoreStory } from "../src/lib/server/evidence-scoring";
import { recalculateEvidenceScores } from "../src/lib/server/evidence-recalculation";
import { evaluateEvidencePolicy, PUBLIC_EVIDENCE_NUMERIC_SCORES_ENABLED } from "../src/lib/server/evidence-evaluation";
import { evidencePolicyEvaluationFixtures } from "../src/lib/server/evidence-evaluation-fixtures";
import { parseKnowledgeMarkdown } from "../src/lib/server/knowledge-markdown";
import { KNOWLEDGE_LINK_SUGGESTION_VERSION, suggestKnowledgeLinks } from "../src/lib/server/knowledge-link-suggestions";
import { KnowledgeDocumentMappingError, mapKnowledgeDocumentClaim } from "../src/lib/server/knowledge-document-mapping";
import { evaluateKnowledgeApproval } from "../src/lib/server/knowledge-approval";
import { triggerKnowledgeReview } from "../src/lib/server/knowledge-change-proposals";
import { captureAdmittedSource, SourceCaptureError } from "../src/lib/server/source-capture";
import { KC09_EMBEDDING_POLICY, embeddingRolloutFor, isAllowedKnowledgeVectorMetadataField } from "../src/lib/server/knowledge-embedding-policy";
import { resolveKnowledgeVectorMatches } from "../src/lib/server/knowledge-vector-resolution";
import { resolveAndValidateCitationReferences, resolveKnowledgeCitations, type KnowledgeCitationInput } from "../src/lib/server/knowledge-citation-resolution";
import { groupKnowledgePositions, groupResolvedKnowledgePositions, type KnowledgePositionEvidence } from "../src/lib/server/knowledge-position-grouping";
import { selectKnowledgeConclusion, type KnowledgePositionAssessment } from "../src/lib/server/knowledge-conclusion-policy";
import { estimateEmbeddingTokens, indexKnowledgeEmbeddings, normalizeEmbeddingText, type KnowledgeEmbeddingVector } from "../workers/ingestion/knowledge-embedding-index";
import { signInternalRequest, verifyInternalRequestSignature } from "../src/security/internal-signature";
import { publishBriefing, publishStory, upgradeClusterEvidence } from "../workers/ingestion/publish";
import { reconcileKnowledgeIndexOperations } from "../workers/ingestion/knowledge-reconciliation";
import { admitAndQueueFeedCapture, admitAndQueueKnowledgeDocumentCapture } from "../workers/ingestion/knowledge-capture-queue";
import { admitAndQueueManualCapture } from "../workers/ingestion/knowledge-capture-queue";
import { processKnowledgeCaptureMessage, consumeKnowledgeCaptureBatch, KnowledgeCaptureConsumerError } from "../workers/ingestion/knowledge-capture-consumer";
import worker from "../workers/ingestion/index";
import { SQLiteD1 } from "./sqlite-d1";
import type { EvidenceExcerpt } from "../src/ai/provider";

const controls = {
  dailyBudgetMicrousd: 100,
  monthlyBudgetMicrousd: 1_000,
  taskDailyBudgetMicrousd: 100,
  maxRequestMicrousd: 100,
  dailyQuestionsPerVisitor: 1,
};

async function governanceTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const governance = new DurableAIGovernance(database.asD1());
    const first = await governance.begin({
      requestId: "request-1", idempotencyKeyHash: "idem-1", visitorHash: "visitor-1",
      questionHash: "question-1", taskType: "ask_trace", evidenceIds: ["source-1"],
    });
    const duplicate = await governance.begin({
      requestId: "request-duplicate", idempotencyKeyHash: "idem-1", visitorHash: "visitor-1",
      questionHash: "question-1", taskType: "ask_trace", evidenceIds: ["source-1"],
    });
    assert.equal(first.status, "owned");
    assert.equal(duplicate.status, "duplicate_in_progress");
    assert.equal(await governance.consumeQuota("request-1", "visitor-1", "2026-07-14", 1), "accepted");
    await governance.validate("request-1");

    await governance.begin({
      requestId: "request-2", idempotencyKeyHash: "idem-2", visitorHash: "visitor-2",
      questionHash: "question-2", taskType: "ask_trace", evidenceIds: ["source-2"],
    });
    await governance.validate("request-2");

    const [reservation1, reservation2] = await Promise.all([
      governance.reserve("request-1", "ask_trace", 60, controls),
      governance.reserve("request-2", "ask_trace", 60, controls),
    ]);
    assert.equal([reservation1, reservation2].filter(Boolean).length, 1, "the atomic budget permits only one competing reservation");
    const accepted = reservation1 ? { requestId: "request-1", reservation: reservation1 } : { requestId: "request-2", reservation: reservation2! };
    assert.equal(await governance.startProvider(accepted.requestId, "deepseek", "deepseek-v4-flash"), true);
    assert.equal(await governance.startProvider(accepted.requestId, "deepseek", "deepseek-v4-flash"), false, "a request cannot start the provider twice");
  } finally {
    database.close();
  }
}

const evidence: EvidenceExcerpt[] = [
  {
    sourceId: "source-1", sourceKind: "external_primary", sourceRole: "evidence", admissionState: "admitted", freshnessState: "current", independentEvidenceWeight: 0,
    claimId: "claim-1", text: "Evidence one", sourceClassification: "Tier A; primary", trustNotes: "Evidence quality: strong", observedAt: "2026-07-13T10:00:00Z",
    assertionId: "assertion-1", sourceDocumentVersionId: "version-1", sourceChunkId: "chunk-1", startLocator: "p1:1", endLocator: "p1:2",
  },
  {
    sourceId: "source-2", sourceKind: "external_independent", sourceRole: "evidence", admissionState: "admitted", freshnessState: "current", independentEvidenceWeight: 0,
    claimId: "claim-2", text: "Evidence two", sourceClassification: "Tier B; independent", trustNotes: "Evidence quality: strong", observedAt: "2026-07-14T10:00:00Z",
    assertionId: "assertion-2", sourceDocumentVersionId: "version-2", sourceChunkId: "chunk-2", startLocator: "p2:1", endLocator: "p2:2",
  },
];

async function gatewayTests(): Promise<void> {
  const database = new SQLiteD1();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls++;
      return Response.json({
        choices: [{ message: { content: JSON.stringify({
          answer: "The supplied reviewed evidence supports this bounded answer.",
          evidence_mode: "researched", conclusion_mode: "supported",
          direct_answer: "The supplied reviewed evidence supports this bounded answer.", lean: null,
          why_lean: "No competing position was selected by the application policy.",
          positions: [{ position_id: "position-supported", label: "Supported position", summary: "Both sources support the answer.", supporting_claim_ids: ["claim-1", "claim-2"], contradicting_claim_ids: [], source_ids: ["source-1", "source-2"] }],
          source_summaries: [
            { source_id: "source-1", source_name: "source-1", source_role: "primary", summary: "Primary evidence.", material_claims: ["claim-1"], caveats: [], published_at: null, retrieved_at: "2026-07-13T10:00:00Z" },
            { source_id: "source-2", source_name: "source-2", source_role: "independent", summary: "Independent evidence.", material_claims: ["claim-2"], caveats: [], published_at: null, retrieved_at: "2026-07-14T10:00:00Z" },
          ],
          confidence: "medium", confidence_score: null, confidence_reasons: ["Two supplied eligible sources."], limitations: [], unresolved_questions: [], freshest_evidence_at: "2026-07-14T10:00:00Z",
          key_points: ["Two published sources were supplied."],
          claims: [{ text: "Two sources support the answer.", claim_id: "claim-1", statement: "Two sources support the answer.", relationship: "supports", evidence_source_ids: ["source-1", "source-2"], evidence_claim_ids: ["claim-1", "claim-2"], citation_assertion_ids: ["assertion-1", "assertion-2"] }],
          citations: [
            { assertion_id: "assertion-1", source_document_version_id: "version-1", source_chunk_id: "chunk-1", start_locator: "p1:1", end_locator: "p1:2" },
            { assertion_id: "assertion-2", source_document_version_id: "version-2", source_chunk_id: "chunk-2", start_locator: "p2:1", end_locator: "p2:2" },
          ],
          cited_source_ids: ["source-1", "source-2"], cited_claim_ids: ["claim-1", "claim-2"],
          confirmed_facts: [], reported_claims: [], analysis: "", disagreements: [], caveats: [],
          what_could_change: "New reviewed evidence.", proposed_confidence: "high",
        }) } }],
        usage: { prompt_tokens: 120, completion_tokens: 80, prompt_cache_hit_tokens: 0 },
      });
    };
    const env = {
      DB: database.asD1(), DEEPSEEK_API_KEY: "test-secret", TRACE_ENVIRONMENT: "development",
      TRACE_AI_PUBLIC_ENABLED: "true", TRACE_AI_DAILY_PUBLIC_BUDGET_USD: "1",
      TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD: "10", TRACE_AI_ASK_DAILY_BUDGET_USD: "1",
      TRACE_AI_MAX_COST_PER_REQUEST_USD: "0.10", TRACE_AI_DAILY_QUESTIONS: "3",
    };
    const context = {
      requestId: "ask-one", idempotencyKeyHash: "same-action", visitorHash: "visitor",
      questionHash: "question", question: "What does the evidence support?", evidenceExcerpts: evidence,
    };
    const staleOnly = await askTrace(env, {
      ...context,
      requestId: "ask-stale", idempotencyKeyHash: "stale-action", questionHash: "stale-question",
      evidenceExcerpts: [{ ...evidence[0], freshnessState: "stale" }],
    });
    assert.equal(staleOnly.status, "ok");
    assert.equal(staleOnly.payload?.nonAnswer, true, "stale evidence fails closed before a model call");
    assert.equal(staleOnly.payload?.confidenceScore, null, "public Ask TRACE does not expose an uncalibrated numeric confidence score");
    assert.equal(providerCalls, 0, "ineligible evidence cannot invoke the model");
    const unresolvedKnowledge = await askTrace(env, {
      ...context,
      requestId: "ask-knowledge-unresolved", idempotencyKeyHash: "knowledge-action", questionHash: "knowledge-question",
      evidenceExcerpts: [{
        ...evidence[0], sourceId: "knowledge:one", claimId: "knowledge:one",
        sourceKind: "trace_knowledge", sourceRole: "internal_synthesis", independentEvidenceWeight: 0,
        externalEvidenceResolved: false,
      }],
    });
    assert.equal(unresolvedKnowledge.status, "ok");
    assert.equal(unresolvedKnowledge.payload?.nonAnswer, true, "unresolved TRACE knowledge cannot answer directly");
    assert.ok(unresolvedKnowledge.payload?.caveats.some((caveat) => caveat.includes("external claim and source bundle are unresolved")),
      "Ask TRACE explains why unresolved internal knowledge was excluded");
    assert.equal(providerCalls, 0, "unresolved internal knowledge cannot invoke the model");
    const [owner, duplicate] = await Promise.all([
      askTrace(env, context),
      askTrace(env, { ...context, requestId: "ask-two" }),
    ]);
    assert.equal(providerCalls, 1, "concurrent idempotent requests produce exactly one provider call");
    assert.ok([owner.status, duplicate.status].includes("ok"));
    assert.ok([owner.status, duplicate.status].includes("in_progress"));

    const ledger = await database.prepare("SELECT COUNT(*) AS count, MAX(actual_microusd) AS cost FROM ai_usage_ledger").first<{ count: number; cost: number }>();
    assert.equal(ledger?.count, 1);
    assert.ok((ledger?.cost ?? 0) > 0, "usage and cost are durably settled");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
}

async function publicationAndIngestionTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
        (101, 'Eligible source', 'https://example.com/feed', 'A', 'A', 'primary', 'rss'),
        (102, 'Unsupported source', 'https://example.com/unsupported', 'B', 'B', 'context', 'manual');
      INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status)
        VALUES (1, 101, 'https://example.com/item', 'hash-1', 'Stored evidence', 'clustered');
      INSERT INTO story_clusters (id, title, evidence_status, publication_status)
        VALUES (1, 'Unverified story', 'unverified', 'review'),
               (2, 'Reviewed supported story', 'strongly_supported', 'review');
      INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (1, 1, 1), (2, 1, 1);
    `);
    const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: "x".repeat(32) };
    const rejected = await publishStory(env, { clusterId: 1, summary: "This summary is long enough for review.", reviewedBy: "publisher@example.com" });
    assert.equal(rejected.success, false, "unverified content cannot become public");
    const published = await publishStory(env, { clusterId: 2, summary: "This reviewed summary is long enough for publication.", reviewedBy: "publisher@example.com" });
    assert.equal(published.success, true);
    const briefing = await publishBriefing(env, {
      briefingType: "daily", briefingDate: "2026-07-14", title: "Reviewed daily briefing",
      summary: "A reviewed summary of the eligible published story.",
      contentJson: JSON.stringify([{ storyId: 2, why: "It is backed by stored, reviewed evidence." }]),
      reviewedBy: "publisher@example.com",
    });
    assert.equal(briefing.success, true);
    const canonical = JSON.parse(briefing.briefing!.content_json)[0];
    assert.equal(canonical.headline, "Reviewed supported story", "briefing public fields come from the database");

    const body = JSON.stringify({ sourceId: 102 });
    const timestamp = String(Date.now());
    const nonce = crypto.randomUUID();
    const identity = { operator: "publisher@example.com", role: "publisher" as const, timestamp, nonce };
    const signature = await signInternalRequest(env.TRACE_INTERNAL_SERVICE_SECRET, "POST", "/admin/ingest", body, identity);
    const response = await worker.fetch(new Request("https://worker.example/admin/ingest", {
      method: "POST", body, headers: {
        "Content-Type": "application/json", "X-Trace-Internal-Version": "v1",
        "X-Trace-Operator": identity.operator, "X-Trace-Role": identity.role,
        "X-Trace-Timestamp": timestamp, "X-Trace-Nonce": nonce, "X-Trace-Signature": signature,
      },
    }), env, { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext);
    assert.equal(response.status, 422, "an unsupported connector is not reported as successful");
    const job = await database.prepare("SELECT result_status, items_skipped FROM ingestion_jobs WHERE source_id = 102").first<{ result_status: string; items_skipped: number }>();
    assert.equal(job?.result_status, "unsupported");
    assert.equal(job?.items_skipped, 1);
  } finally {
    database.close();
  }
}

async function deskBoundaryTests(): Promise<void> {
  const database = new SQLiteD1();
  const secret = "d".repeat(32);
  const queuedManualMessages: unknown[] = [];
  const env = {
    DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: secret,
    KNOWLEDGE_PROCESSING_QUEUE: { send: async (message: unknown) => { queuedManualMessages.push(message); } } as unknown as Queue,
  };
  const context = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

  const request = async (
    role: "reader" | "publisher",
    method: "GET" | "POST",
    path: string,
    body = "",
  ): Promise<Response> => {
    const timestamp = String(Date.now());
    const nonce = crypto.randomUUID();
    const identity = { operator: `${role}@example.com`, role, timestamp, nonce };
    const signature = await signInternalRequest(secret, method, path, body, identity);
    return worker.fetch(new Request(`https://worker.example${path}`, {
      method,
      body: method === "GET" ? undefined : body,
      headers: {
        "Content-Type": "application/json", "X-Trace-Internal-Version": "v1",
        "X-Trace-Operator": identity.operator, "X-Trace-Role": identity.role,
        "X-Trace-Timestamp": timestamp, "X-Trace-Nonce": nonce, "X-Trace-Signature": signature,
      },
    }), env, context);
  };

  try {
    database.sqlite.exec(readFileSync("db/migration-0015-editorial-desk.sql", "utf8"));

    const anonymous = await worker.fetch(new Request("https://worker.example/admin/candidates", {
      method: "POST", body: JSON.stringify({ intakeType: "lead", lead: "Unauthenticated intake" }),
    }), env, context);
    assert.equal(anonymous.status, 401, "unsigned candidate intake is rejected");

    const manualCaptureBody = JSON.stringify({ url: "https://manual.example/article" });
    assert.equal((await request("reader", "POST", "/admin/knowledge/capture-url", manualCaptureBody)).status, 403,
      "readers cannot trigger publisher source capture");
    const manualCapture = await request("publisher", "POST", "/admin/knowledge/capture-url", manualCaptureBody);
    assert.equal(manualCapture.status, 202, "publishers can queue a manual source capture");
    assert.equal(queuedManualMessages.length, 1);

    const candidateBody = JSON.stringify({ intakeType: "lead", lead: "A governed candidate for Desk boundary testing." });
    assert.equal((await request("reader", "GET", "/admin/candidates")).status, 403, "readers cannot view the Desk queue");
    assert.equal((await request("reader", "POST", "/admin/candidates", candidateBody)).status, 403, "readers cannot create candidates");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM editorial_candidates").first<{ count: number }>())?.count, 0);

    const created = await request("publisher", "POST", "/admin/candidates", candidateBody);
    assert.equal(created.status, 201, "a publisher can record a new candidate");
    assert.deepEqual(await created.json(), {
      id: (await database.prepare("SELECT id FROM editorial_candidates LIMIT 1").first<{ id: string }>())?.id,
      state: "new",
      message: "Candidate recorded. It has not been fetched, researched, or published.",
    });
    const stored = await database.prepare("SELECT state, lead_text, created_by FROM editorial_candidates").first<{
      state: string; lead_text: string; created_by: string;
    }>();
    assert.deepEqual({ ...stored }, {
      state: "new", lead_text: "A governed candidate for Desk boundary testing.", created_by: "publisher@example.com",
    }, "candidate intake remains an unpublished, attributable queue record");
    assert.equal(
      (await database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = '/admin/candidates' AND outcome = 'succeeded'").first<{ count: number }>())?.count,
      1,
      "a successful 201 candidate intake is recorded as succeeded",
    );

    const replayBody = JSON.stringify({ intakeType: "lead", lead: "A replay-protected candidate request." });
    const replayTimestamp = String(Date.now());
    const replayNonce = crypto.randomUUID();
    const replayIdentity = { operator: "publisher@example.com", role: "publisher" as const, timestamp: replayTimestamp, nonce: replayNonce };
    const replaySignature = await signInternalRequest(secret, "POST", "/admin/candidates", replayBody, replayIdentity);
    const replayRequest = () => new Request("https://worker.example/admin/candidates", {
      method: "POST",
      body: replayBody,
      headers: {
        "Content-Type": "application/json", "X-Trace-Internal-Version": "v1",
        "X-Trace-Operator": replayIdentity.operator, "X-Trace-Role": replayIdentity.role,
        "X-Trace-Timestamp": replayIdentity.timestamp, "X-Trace-Nonce": replayIdentity.nonce,
        "X-Trace-Signature": replaySignature,
      },
    });
    assert.equal((await worker.fetch(replayRequest(), env, context)).status, 201, "the first signed request is accepted");
    assert.equal((await worker.fetch(replayRequest(), env, context)).status, 401, "a replayed signed request is rejected");
    assert.equal(
      (await database.prepare("SELECT COUNT(*) AS count FROM editorial_candidates").first<{ count: number }>())?.count,
      2,
      "a replay cannot create a second candidate",
    );
    const queue = await request("publisher", "GET", "/admin/candidates");
    assert.equal(queue.status, 200, "publishers can view the Desk queue");
    assert.equal((await queue.json() as Array<{ state: string }>)[0]?.state, "new");

    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
        (301, 'Primary coverage', 'https://primary.example', 'A', 'A', 'primary-technical', 'rss'),
        (302, 'Independent coverage', 'https://independent.example', 'B', 'B', 'independent-reporting', 'rss');
      INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, fetched_at, ingestion_status) VALUES
        (301, 301, 'https://primary.example/helios', 'related-hash-301', 'OpenAI Helios model release', 'Initial coverage of the Helios model release.', datetime('now'), 'clustered'),
        (302, 302, 'https://independent.example/helios', 'related-hash-302', 'OpenAI Helios model release adds enterprise controls', 'Independent reporting on the Helios model release and its controls.', datetime('now'), 'classified');
      INSERT INTO story_clusters (id, title, topic, summary, publication_status, evidence_status, created_at, updated_at) VALUES
        (301, 'OpenAI Helios model release', 'ai-agents', 'A new OpenAI Helios model release.', 'draft', 'provisionally_supported', datetime('now'), datetime('now')),
        (302, 'Helios model release needs wider testing', 'ai-agents', 'A related cluster about testing the Helios model release.', 'review', 'provisionally_supported', datetime('now'), datetime('now')),
        (303, 'Published analysis of the Helios model release', 'ai-agents', 'Published TRACE coverage of the Helios model release.', 'published', 'strongly_supported', datetime('now'), datetime('now'));
      INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain)
        VALUES ('kc06-claim-helios', 'Helios is a newly released model.', 'specification_defined', 'model_release');
      INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
        VALUES (301, 'kc06-claim-helios', 'primary', 'standard', 1);
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type, status, visibility,
         evidence_status, direct_answer, document_json, policy_version, approved_by, approved_at, created_by)
        VALUES ('kc06-knowledge', 'What is the Helios release?', 'kc06-knowledge-hash', 'ai-agents',
                'current_status', 'approved', 'public_knowledge', 'provisionally_supported',
                'The Helios release is tracked here.', '{}', 'kc06-v1', 'publisher@example.com', datetime('now'), 'publisher@example.com');
      INSERT INTO knowledge_document_claims
        (knowledge_document_id, canonical_claim_id, section_key, relationship, reviewed_by, reviewed_at)
        VALUES ('kc06-knowledge', 'kc06-claim-helios', 'summary', 'supports', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_relationships
        (id, knowledge_document_id, related_type, related_id, relationship)
        VALUES ('kc06-knowledge-story', 'kc06-knowledge', 'story_cluster', '301', 'updates');
      UPDATE story_clusters SET slug = 'published-helios-analysis', published_at = datetime('now'), reviewed_by = 'publisher@example.com', reviewed_at = datetime('now') WHERE id = 303;
      INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (301, 301, 1);
    `);
    const related = await request("publisher", "GET", "/admin/related-items?clusterId=301");
    assert.equal(related.status, 200, "related coverage search is available to publishers");
    const relatedPayload = await related.json() as { items: Array<{ id: number; kind: string; url: string | null }> };
    assert.ok(relatedPayload.items.some((item) => item.kind === "ingested_coverage" && item.id === 302), "related ingested coverage is returned");
    assert.ok(relatedPayload.items.some((item) => item.kind === "cluster" && item.id === 302), "related unpublished clusters are returned");
    assert.ok(
      relatedPayload.items.some((item) => item.kind === "published_story" && item.id === 303 && item.url === "/stories/published-helios-analysis"),
      "related published stories are returned with their public URL",
    );

    const reviewBody = JSON.stringify({
      sourceStoryId: 301, targetStoryId: 302, action: "same_event", explanation: "Both records describe the same Helios release event.", confidence: 0.85,
    });
    assert.equal((await request("reader", "POST", "/admin/related-items", reviewBody)).status, 403,
      "readers cannot accept related-story actions");
    const acceptedReview = await request("publisher", "POST", "/admin/related-items", reviewBody);
    assert.equal(acceptedReview.status, 201, "publisher can accept a related-story action");
    assert.deepEqual(await acceptedReview.json(), {
      status: "accepted", action: "same_event", reviewId: (await database.prepare("SELECT id FROM story_related_item_reviews LIMIT 1").first<{ id: string }>())?.id,
      relationshipRecorded: true, attachmentRecorded: false, evidenceEligibility: null, evidenceEligibilityReason: null, evidenceScoreChanged: false,
    }, "accepted related-story review records its durable relationship and score boundary");
    assert.equal(
      (await database.prepare("SELECT relationship, created_by FROM story_relationships WHERE source_story_id = 301 AND target_story_id = 302").first<{ relationship: string; created_by: string }>())?.relationship,
      "same_event",
    );
    const reviewedRelated = await request("publisher", "GET", "/admin/related-items?clusterId=301");
    const reviewedPayload = await reviewedRelated.json() as { items: Array<{ id: number; kind: string; clusterId: number | null; affectedRecords: { knowledgePages: Array<{ id: string }> } }> };
    assert.ok(
      reviewedPayload.items.some((item) => item.kind === "cluster" && item.clusterId === 302 && item.affectedRecords.knowledgePages.some((page) => page.id === "kc06-knowledge")),
      "accepted related story surfaces affected public knowledge pages",
    );
    const replayedReview = await request("publisher", "POST", "/admin/related-items", reviewBody);
    assert.equal(replayedReview.status, 200, "repeating the same related action is idempotent");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM story_related_item_reviews").first<{ count: number }>())?.count, 1);

    const beforeEvidenceStatus = await database.prepare("SELECT evidence_status FROM story_clusters WHERE id = 301").first<{ evidence_status: string }>();
    const evidenceReview = await request("publisher", "POST", "/admin/related-items", JSON.stringify({
      sourceStoryId: 301, targetFeedItemId: 302, canonicalClaimId: "kc06-claim-helios", action: "attach_evidence", confidence: 1,
    }));
    assert.equal(evidenceReview.status, 201, "publisher can record an evidence attachment review");
    assert.equal((await database.prepare("SELECT state FROM story_related_item_reviews WHERE target_feed_item_id = 302").first<{ state: string }>())?.state, "accepted");
    assert.equal((await database.prepare("SELECT canonical_claim_id FROM story_claim_evidence_attachments WHERE feed_item_id = 302").first<{ canonical_claim_id: string }>())?.canonical_claim_id, "kc06-claim-helios");
    assert.equal((await database.prepare("SELECT eligibility_state FROM story_claim_evidence_attachments WHERE feed_item_id = 302").first<{ eligibility_state: string }>())?.eligibility_state, "eligible");
    assert.equal((await database.prepare("SELECT evidence_status FROM story_clusters WHERE id = 301").first<{ evidence_status: string }>())?.evidence_status, beforeEvidenceStatus?.evidence_status,
      "accepted eligible evidence recalculates the story without weakening its existing band");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots WHERE story_cluster_id = 301").first<{ count: number }>())?.count, 1,
      "accepted eligible evidence creates one recalculation snapshot");
    const explanationRows = await database.prepare(`
      SELECT snapshot_kind, before_score, before_component_json, after_score,
             after_component_json, triggering_event, explanation
      FROM evidence_score_snapshot_explanations
      WHERE subject_id IN ('kc06-claim-helios', '301')
      ORDER BY created_at ASC
    `).all<{ snapshot_kind: string; before_score: number | null; before_component_json: string | null; after_score: number; after_component_json: string; triggering_event: string; explanation: string }>();
    assert.equal(explanationRows.results?.length, 2, "claim and story snapshots each retain an explanation");
    assert.ok(explanationRows.results?.every((row) => row.before_score === null && row.before_component_json === null),
      "first snapshots retain an explicit empty before-state");
    assert.ok(explanationRows.results?.every((row) => row.after_component_json.length > 0 && row.explanation.includes("Initial")),
      "first snapshots retain after components and a deterministic explanation");
    const snapshotId = (await database.prepare("SELECT id FROM evidence_score_snapshots WHERE story_cluster_id = 301").first<{ id: string }>())?.id;
    assert.throws(() => database.sqlite.exec(`UPDATE evidence_score_snapshots SET score = 0 WHERE id = '${snapshotId}'`), /immutable/,
      "story score snapshots cannot be rewritten");
    assert.throws(() => database.sqlite.exec("DELETE FROM evidence_score_snapshot_explanations"), /immutable/,
      "score explanations cannot be deleted");
  } finally {
    database.close();
  }
}

async function kc01TrustTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
        (901, 'Derivative source one', 'https://one.example', 'A', 'A', 'primary', 'rss'),
        (902, 'Derivative source two', 'https://two.example', 'B', 'B', 'independent-reporting', 'rss');
      INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, ingestion_status)
        VALUES
        (901, 901, 'https://one.example/orion', 'kc01-one', 'Orion release', 'Vendor announcement.', 'clustered'),
        (902, 902, 'https://two.example/orion', 'kc01-two', 'Orion release repeated', 'Derivative report.', 'clustered');
      INSERT INTO story_clusters (id, title, evidence_status, publication_status)
        VALUES (901, 'Orion release', 'vendor_reported', 'draft');
      INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary)
        VALUES (901, 901, 1), (901, 902, 0);
    `);

    const upgrades = await upgradeClusterEvidence(database.asD1());
    assert.deepEqual(upgrades, [], "tier/source counts cannot trigger an evidence upgrade");
    const cluster = await database.prepare("SELECT evidence_status FROM story_clusters WHERE id = 901").first<{ evidence_status: string }>();
    assert.equal(cluster?.evidence_status, "vendor_reported", "count-only evidence upgrade remains disabled");

    const derivativeExcerpt: EvidenceExcerpt = {
      sourceId: "source:901",
      sourceKind: "external_independent",
      sourceRole: "evidence",
      admissionState: "admitted",
      freshnessState: "current",
      independentEvidenceWeight: 1,
      claimId: "claim:derivative-one",
      text: "Derivative coverage repeats the same originating report.",
      sourceClassification: "Tier B; independent",
      observedAt: "2026-07-22T00:00:00Z",
    };
    const derivativeConfidence = calculateDeterministicConfidence([
      derivativeExcerpt,
      { ...derivativeExcerpt, claimId: "claim:derivative-two", text: "A second derivative copy repeats the same report." },
    ]);
    assert.equal(derivativeConfidence.label, "insufficient_evidence", "repeated coverage from one source cannot create independent corroboration");

    assert.equal(independentEvidenceWeightFor("external_independent"), 0,
      "registry classification alone cannot grant independent-evidence credit before provenance groups exist");
    const crossOutletDerivativeConfidence = calculateDeterministicConfidence([
      { ...derivativeExcerpt, sourceId: "source:901", independentEvidenceWeight: 0 },
      { ...derivativeExcerpt, sourceId: "source:902", claimId: "claim:derivative-outlet-two", independentEvidenceWeight: 0 },
    ]);
    assert.equal(crossOutletDerivativeConfidence.label, "insufficient_evidence",
      "derivative coverage from two outlets cannot satisfy the independent-source gate before provenance is reviewed");

    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type, status, visibility,
         evidence_status, direct_answer, detailed_explanation, document_json, policy_version,
         created_by, approved_by, approved_at, review_after, hard_expiry)
      VALUES
        ('kc01-current', 'Orion current', 'kc01-current-hash', 'ai-agents', 'definition', 'approved', 'public_knowledge',
         'provisionally_supported', 'Current answer', 'Current explanation', '{}', 'kc01-test',
         'test-publisher', 'test-publisher', datetime('now'), '2099-01-01', '2099-12-31'),
        ('kc01-due', 'Orion due review', 'kc01-due-hash', 'ai-agents', 'definition', 'approved', 'public_knowledge',
         'provisionally_supported', 'Due answer', 'Due explanation', '{}', 'kc01-test',
         'test-publisher', 'test-publisher', datetime('now'), '2000-01-01', '2099-12-31'),
        ('kc01-expired', 'Orion expired', 'kc01-expired-hash', 'ai-agents', 'definition', 'approved', 'public_knowledge',
         'provisionally_supported', 'Expired answer', 'Expired explanation', '{}', 'kc01-test',
         'test-publisher', 'test-publisher', datetime('now'), '2099-01-01', '2000-01-01');
    `);

    const knowledge = await retrieveApprovedKnowledge(database.asD1(), "Orion", 8);
    assert.ok(knowledge.some((item) => item.sourceId === "knowledge:kc01-current"), "current approved knowledge remains retrievable");
    const due = knowledge.find((item) => item.sourceId === "knowledge:kc01-due");
    assert.ok(due, "review-due knowledge remains visible for a warning");
    assert.equal(due?.freshnessState, "stale", "review-due knowledge is not current evidence");
    assert.equal(due?.externalEvidenceResolved, false, "knowledge evidence inheritance remains explicitly unresolved");
    assert.ok(due?.trustNotes?.includes("review due"), "review-due knowledge carries a warning");
    assert.equal(knowledge.some((item) => item.sourceId === "knowledge:kc01-expired"), false, "hard-expired knowledge is excluded from retrieval");
    assert.equal(isKnowledgeReviewDue("2000-01-01", Date.parse("2026-07-22T00:00:00Z")), true);
    assert.equal(isKnowledgeHardExpired("2000-01-01", Date.parse("2026-07-22T00:00:00Z")), true);
    assert.equal(isKnowledgeHardExpired("2099-01-01", Date.parse("2026-07-22T00:00:00Z")), false);
  } finally {
    database.close();
  }
}

async function kc02SchemaTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const requiredTables = [
      "source_documents", "source_document_versions", "source_chunks",
      "provenance_groups", "source_provenance_memberships", "canonical_claims", "claim_assertions",
      "story_claims", "knowledge_document_claims", "knowledge_document_claim_assertions",
      "story_relationships", "knowledge_change_proposals", "evidence_score_snapshots",
      "canonical_claim_score_snapshots",
      "knowledge_processing_jobs", "knowledge_index_operations", "knowledge_index_operation_receipts",
      "knowledge_reconciliation_runs", "source_extractions", "source_summaries",
      "legacy_claim_cutover", "legacy_claim_evidence_map",
    ];
    const tables = await database.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredTables.map(() => "?").join(", ")})`,
    ).bind(...requiredTables).all<{ name: string }>();
    assert.deepEqual(new Set(tables.results.map((row) => row.name)), new Set(requiredTables),
      "KC-02 installs every canonical evidence, provenance, relationship, job, and outbox table");

    database.sqlite.exec(readFileSync("db/migration-0032-knowledge-continuity.sql", "utf8"));
    database.sqlite.exec(readFileSync("db/migration-0033-knowledge-reconciliation-state.sql", "utf8"));
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM claims").first<{ count: number }>())?.count, 0,
      "KC-02 duplicate reruns are additive and leave legacy claims readable");

    database.sqlite.exec("PRAGMA foreign_keys = ON");
    assert.throws(() => database.sqlite.exec(`
      INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at)
      VALUES ('kc02-orphan-version', 'missing-document', 'hash', 'https://example.test/source', datetime('now'));
    `), /FOREIGN KEY/, "source versions cannot outlive their source document");
    assert.throws(() => database.sqlite.exec(`
      INSERT INTO claim_assertions (id, canonical_claim_id, assertion_text, relationship, source_role, directness,
        evidence_treatment, admission_state, extraction_method)
      VALUES ('kc02-invalid-assertion', 'missing-claim', 'Unsupported assertion', 'supports', 'evidence', 'direct',
        'factual_support', 'admitted', 'rule');
    `), /FOREIGN KEY|CHECK/, "assertions require a canonical claim and a source-version or legacy-claim link");
  } finally {
    database.close();
  }
}

function kc07aEvidenceScoringTests(): void {
  const primaryAssertion = {
    admissionState: "admitted" as const, reviewerState: "accepted" as const,
    freshnessState: "current" as const, relationship: "supports" as const,
    sourceRole: "evidence" as const, directness: "direct" as const,
    evidenceTreatment: "factual_support" as const, provenanceGroupId: "root-primary",
    provenanceOriginType: "primary" as const, confidence: 1,
  };
  const independentAssertion = {
    ...primaryAssertion,
    relationship: "reproduces" as const,
    provenanceGroupId: "root-independent",
    provenanceOriginType: "independent_test" as const,
    directness: "indirect" as const,
    confidence: 1,
  };
  const stronglySupported = scoreCanonicalClaim({
    id: "kc07-strong", currentState: "active", materiality: "high", claimClass: "observed_implementation_behaviour",
    assertions: [primaryAssertion, independentAssertion],
  });
  assert.equal(stronglySupported.policyVersion, EVIDENCE_SCORE_POLICY_VERSION);
  assert.equal(stronglySupported.evidenceStatus, "confirmed", "two current primary/independent roots can pass the confirmed gate");
  assert.equal(stronglySupported.score, 100, "the maximum component roll-up is capped at 100");
  assert.equal(stronglySupported.components.eligibleProvenanceRoots, 2);

  const vendor = scoreCanonicalClaim({
    id: "kc07-vendor", currentState: "active", materiality: "standard", claimClass: "official_vendor_claim",
    assertions: [{ ...primaryAssertion, provenanceGroupId: "vendor-root", provenanceOriginType: "vendor_statement" as const }],
  });
  assert.equal(vendor.evidenceStatus, "vendor_reported", "vendor-only factual claims retain the vendor status cap");

  const disputed = scoreCanonicalClaim({
    id: "kc07-disputed", currentState: "active", materiality: "critical", claimClass: "observed_implementation_behaviour",
    assertions: [primaryAssertion], conflicts: [{ unresolved: true, materiality: "critical" }],
  });
  assert.equal(disputed.evidenceStatus, "disputed", "an unresolved material conflict overrides the raw score");
  assert.equal(disputed.components.consistency, 0);

  const story = scoreStory([
    { id: "kc07-strong", currentState: "active", materiality: "critical", claimClass: "observed_implementation_behaviour", assertions: [primaryAssertion, independentAssertion] },
    { id: "kc07-vendor", currentState: "active", materiality: "standard", claimClass: "official_vendor_claim", assertions: [{ ...primaryAssertion, provenanceGroupId: "vendor-root", provenanceOriginType: "vendor_statement" as const }] },
  ]);
  assert.equal(story.policyVersion, EVIDENCE_SCORE_POLICY_VERSION);
  assert.equal(story.score, 88.5, "story score uses materiality-weighted claim scores");
  assert.equal(story.evidenceStatus, "confirmed", "story status rolls up the weighted claim policy");

  const evaluation = evaluateEvidencePolicy(evidencePolicyEvaluationFixtures());
  assert.equal(evaluation.pass, true, "fixed labelled evidence policy set passes status, decision, band, and change-direction checks");
  assert.equal(evaluation.publicNumericScoresEnabled, PUBLIC_EVIDENCE_NUMERIC_SCORES_ENABLED);
  assert.deepEqual(evaluation.failures, []);
}

async function kc05gLegacyCutoverTests(): Promise<void> {
  const database = new SQLiteD1(false);
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
      VALUES (901, 'Legacy source', 'https://legacy.example', 'A', 'A', 'primary-technical', 'manual');
      INSERT INTO feed_items (id, source_id, url, url_hash, title, summary, content_excerpt, ingestion_status)
      VALUES (901, 901, 'https://legacy.example/article', 'legacy-url-hash', 'Legacy article',
              'Legacy summary', 'Legacy content', 'published');
      INSERT INTO story_clusters
        (id, title, evidence_status, published_at, is_published, reviewed_by, reviewed_at)
      VALUES (901, 'Legacy story', 'confirmed', datetime('now'), 1, 'publisher@example.com', datetime('now'));
      INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (901, 901, 1);
      INSERT INTO claims
        (id, cluster_id, feed_item_id, claim_text, claim_class, claim_domain,
         severity, evidence_quality, confidence_score, extraction_method, extraction_version)
      VALUES (901, 901, 901, 'The legacy model shipped.', 'official_vendor_claim',
              'model_release', 'high', 'strong', 0.8, 'rule_based', 'legacy-test-v1');
      INSERT INTO claim_evidence
        (id, claim_id, feed_item_id, relationship, evidence_summary, source_tier, is_primary_source)
      VALUES (901, 901, 901, 'reports', 'Legacy source reported the release.', 'A', 1);
    `);
    database.sqlite.exec(readFileSync("db/migration-0043-legacy-claims-cutover.sql", "utf8"));
    database.sqlite.exec(readFileSync("db/migration-0043-legacy-claims-cutover.sql", "utf8"));

    assert.equal((await database.prepare("SELECT state FROM legacy_claim_cutover WHERE legacy_claim_id = 901").first<{ state: string }>())?.state, "mapped");
    assert.equal((await database.prepare("SELECT canonical_claim_id FROM legacy_claim_cutover WHERE legacy_claim_id = 901").first<{ canonical_claim_id: string }>())?.canonical_claim_id, "legacy-claim-901");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM claim_assertions WHERE legacy_claim_id = 901").first<{ count: number }>())?.count, 2,
      "legacy claim and accepted evidence each map to canonical assertions");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM legacy_claim_evidence_map WHERE legacy_claim_id = 901").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM story_claims WHERE story_cluster_id = 901").first<{ count: number }>())?.count, 1);
    assert.throws(() => database.sqlite.exec(`
      INSERT INTO claims (feed_item_id, claim_text, claim_class, claim_domain, extraction_version)
      VALUES (901, 'Must fail', 'community_report', 'general', 'test');
    `), /read-only/, "legacy claims reject post-cutover writes");
    assert.throws(() => database.sqlite.exec("DELETE FROM claim_evidence WHERE id = 901"), /read-only/, "legacy evidence rejects post-cutover writes");
  } finally {
    database.close();
  }

  const database2 = new SQLiteD1();
  try {
    database2.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
      VALUES (902, 'Canonical source', 'https://canonical.example', 'A', 'A', 'primary-technical', 'manual');
    `);
    const input = {
      feedItemId: 902, clusterId: null, sourceId: 902,
      sourceUrl: "https://canonical.example/article", title: "Canonical article",
      content: "Canonical content", claimText: "The canonical model shipped.",
      claimClass: "official_vendor_claim", claimDomain: "model_release",
      materiality: "high" as const, confidence: 0.8,
      extractionMethod: "rule_based", extractionVersion: "kc-05g-test-v1",
    };
    const first = await writeCanonicalClaim(database2.asD1(), input);
    const second = await writeCanonicalClaim(database2.asD1(), input);
    assert.equal(first.inserted, true, "new extraction writes a canonical assertion");
    assert.equal(second.inserted, false, "canonical extraction writes are idempotent");
    assert.equal((await database2.prepare("SELECT COUNT(*) AS count FROM canonical_claims").first<{ count: number }>())?.count, 1);
    assert.equal((await database2.prepare("SELECT COUNT(*) AS count FROM claims").first<{ count: number }>())?.count, 0,
      "new extraction does not dual-write the legacy claims table");
    assert.equal((await database2.prepare("SELECT COUNT(*) AS count FROM claim_evidence").first<{ count: number }>())?.count, 0,
      "new extraction does not dual-write legacy evidence");
    database2.sqlite.exec(`
      INSERT INTO story_clusters
        (id, title, slug, summary, evidence_status, publication_status, published_at,
         is_published, reviewed_by, reviewed_at)
      VALUES (902, 'Canonical story', 'canonical-story', 'Canonical summary',
              'confirmed', 'published', datetime('now'), 1, 'publisher@example.com', datetime('now'));
      INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality)
      VALUES (902, '${first.canonicalClaimId}', 'primary', 'high');
      UPDATE claim_assertions SET admission_state = 'admitted', reviewer_state = 'accepted',
        reviewed_by = 'publisher@example.com', reviewed_at = datetime('now')
      WHERE id = '${first.assertionId}';
    `);
    const evidence = await retrievePublishedEvidence(database2.asD1(), "canonical model shipped", 4);
    assert.equal(evidence.length, 1, "Ask TRACE retrieves the reviewed canonical assertion");
    assert.equal(evidence[0]?.claimId, `claim:${first.assertionId}`);
  } finally {
    database2.close();
  }
}

async function kc02ReconciliationTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode)
      VALUES ('doc-1', 'https://example.test/source', 'doc-hash-1', 'html', 'private_full_text');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, r2_original_key)
      VALUES ('version-1', 'doc-1', 'content-hash-1', 'https://example.test/source', datetime('now'),
        'sources/doc-1/content-hash-1/original');
      INSERT INTO source_chunks (id, source_document_version_id, chunk_index, text_excerpt, text_hash, embedding_state)
      VALUES ('chunk-1', 'version-1', 0, 'Bounded source excerpt.', 'chunk-hash-1', 'stale');
      INSERT INTO knowledge_index_operations
        (id, operation_kind, subject_type, subject_id, desired_content_hash, idempotency_key)
      VALUES ('r2-operation', 'r2_put', 'source_document_version', 'version-1', 'content-hash-1', 'r2-idempotency-1');
    `);

    const storedObjects = new Map<string, { customMetadata?: Record<string, string> }>([
      ["sources/doc-1/content-hash-1/original", { customMetadata: { content_hash: "content-hash-1" } }],
    ]);
    const rawStore = {
      head: async (key: string) => storedObjects.get(key) ?? null,
      delete: async (key: string | string[]) => { for (const item of Array.isArray(key) ? key : [key]) storedObjects.delete(item); },
    } as unknown as Pick<R2Bucket, "head" | "delete">;

    const r2Summary = await reconcileKnowledgeIndexOperations({ DB: database.asD1(), RAW_STORE: rawStore });
    assert.deepEqual(r2Summary, { completed: 1, deferred: 0, repairRequired: 0, failed: 0 },
      "a pending R2 operation attaches an already-written object to its matching source version");
    assert.equal((await database.prepare("SELECT state FROM knowledge_index_operations WHERE id = 'r2-operation'").first<{ state: string }>())?.state, "completed");
    assert.equal((await database.prepare("SELECT extraction_status FROM source_document_versions WHERE id = 'version-1'").first<{ extraction_status: string }>())?.extraction_status, "captured");

    database.sqlite.exec(`
      INSERT INTO knowledge_index_operations
        (id, operation_kind, subject_type, subject_id, idempotency_key)
      VALUES ('vector-operation', 'vector_delete', 'source_chunk', 'chunk-1', 'vector-idempotency-1');
    `);
    let processedMutation = "not-yet-confirmed";
    let deleteCalls = 0;
    const vectorIndex = {
      async deleteByIds(ids: string[]) {
        deleteCalls++;
        assert.deepEqual(ids, ["chunk-1"], "stale vector recovery deletes only the canonical chunk identifier");
        return { mutationId: "mutation-1" };
      },
      async getByIds(ids: string[]) {
        assert.deepEqual(ids, ["chunk-1"], "Vectorize confirmation checks only the canonical chunk identifier");
        return processedMutation === "mutation-1" ? [] : [{ id: "chunk-1" }];
      },
    };
    const vectorEnvironment = { DB: database.asD1(), RAW_STORE: rawStore, KNOWLEDGE_VECTOR_INDEX: vectorIndex };
    const submitted = await reconcileKnowledgeIndexOperations(vectorEnvironment);
    assert.deepEqual(submitted, { completed: 0, deferred: 1, repairRequired: 0, failed: 0 },
      "a Vectorize delete remains pending confirmation after its asynchronous mutation is submitted");
    assert.equal(deleteCalls, 1);
    assert.equal((await database.prepare("SELECT state FROM knowledge_index_operations WHERE id = 'vector-operation'").first<{ state: string }>())?.state, "running");
    assert.equal((await database.prepare("SELECT remote_operation_id FROM knowledge_index_operation_receipts WHERE operation_id = 'vector-operation'").first<{ remote_operation_id: string }>())?.remote_operation_id, "mutation-1");

    processedMutation = "mutation-1";
    const confirmed = await reconcileKnowledgeIndexOperations(vectorEnvironment);
    assert.deepEqual(confirmed, { completed: 1, deferred: 0, repairRequired: 0, failed: 0 },
      "a stale vector is marked deleted only after Vectorize confirms the recorded mutation");
    assert.equal(deleteCalls, 1, "retrying confirmation does not submit a duplicate Vectorize deletion");
    assert.equal((await database.prepare("SELECT embedding_state FROM source_chunks WHERE id = 'chunk-1'").first<{ embedding_state: string }>())?.embedding_state, "deleted");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_reconciliation_runs WHERE operation_id IN ('r2-operation', 'vector-operation')").first<{ count: number }>())?.count, 3,
      "every reconciliation outcome is recorded for administrator repair review");
  } finally {
    database.close();
  }
}

async function boundaryTests(): Promise<void> {
  assert.equal(TRACE_POLICY_VERSION, "adr-0016-2026-07-16.1");
  assert.equal(PUBLIC_ASK_TASK_POLICY.section, "ai-agents");
  assert.equal(PUBLIC_ASK_TASK_POLICY.researchPermitted, false, "ASK-01 does not grant live research");
  assert.equal(isAnswerEligibleEvidence({ ...evidence[0], sourceKind: "trace_story", sourceRole: "internal_synthesis", independentEvidenceWeight: 0 }), false, "TRACE stories are context, not independent evidence");
  assert.equal(isAnswerEligibleEvidence({ ...evidence[0], admissionState: "quarantined" }), false, "unadmitted evidence cannot answer Ask TRACE");
  assert.equal(isAnswerEligibleEvidence({ ...evidence[0], freshnessState: "stale" }), false, "stale evidence cannot answer Ask TRACE");
  const guide = {
    id: "guide-node-windows", slug: "install-node-js-windows", title: "Install Node.js on Windows",
    category: "development-tools" as const, difficulty: "beginner" as const, verificationStatus: "fully-tested" as const,
    version: 1, testedOperatingSystems: ["Windows 11"], testedVersions: { "Node.js": "22.0.0" },
    authorUserId: "phil-geran", reviewedByUserId: "phil-geran", reviewedAt: "2026-07-16T12:00:00Z",
    destructiveStepsPresent: false, networkExposurePresent: false, credentialsRequired: false,
    rootOrAdministratorAccessRequired: true, downloadsExecutableCode: true,
    commands: [{
      command: "node --version", operatingSystem: "Windows 11", shell: "PowerShell", workingDirectory: "Any directory",
      requiresAdministrator: false, writesOrDeletes: false, opensNetworkPort: false, downloadsExecutableCode: false,
      variablesToReplace: [], expectedOutput: "A Node.js version.", rollback: "None; this command is read-only.",
    }],
    sourceRelationships: [{
      sourceReference: "https://nodejs.org/en/download", sourceKind: "external_primary" as const,
      relationship: "instruction-source" as const, supportsSections: ["Installation"], lastCheckedAt: "2026-07-16T12:00:00Z",
    }],
    publicationStatus: "draft" as const, publicationMode: "manual_only" as const,
    lastVerifiedAt: "2026-07-16T12:00:00Z", reviewDueAt: "2026-08-16T12:00:00Z",
  };
  assert.equal(GUIDE_CONTRACT_VERSION, "adr-0013-2026-07-16.1");
  assert.equal(validateGuideMetadata(guide).valid, true, "complete guide metadata is review-ready");
  assert.equal(nodeWindowsVerificationCommands.every((command) => validateGuideCommand(command).valid), true,
    "GUIDE-02 records safety metadata for every reader command");
  assert.equal(validateGuideCommand({ ...nodeWindowsVerificationCommands[0], rollback: "" }).valid, false,
    "Guide commands require a rollback or explicit no-op rollback statement");
  assert.equal(validateGuideMetadata({ ...guide, authorUserId: "" }).valid, false, "guides require named accountable authorship");
  assert.equal(validateGuideMetadata({ ...guide, publicationMode: "automatic" }).valid, false, "guides cannot opt into auto-publication");
  const publishedGuide = {
    ...guide, publicationStatus: "published" as const, publicationApprovedByUserId: "phil-geran",
    publicationApprovedAt: "2026-07-16T13:00:00Z", publishedAt: "2026-07-16T13:00:00Z",
  };
  assert.equal(isGuideEligibleForProceduralRetrieval(publishedGuide, Date.parse("2026-07-17T00:00:00Z")), true);
  assert.equal(guideFreshness({ ...publishedGuide, verificationStatus: "outdated" }, Date.parse("2026-07-17T00:00:00Z")), "outdated");
  assert.equal(isGuideEligibleForProceduralRetrieval({ ...publishedGuide, verificationStatus: "outdated" }, Date.parse("2026-07-17T00:00:00Z")), false, "outdated guides are excluded from procedural retrieval");
  assert.equal(validateAskBody({ question: "  useful   question  " }).valid, true);
  assert.equal(validateAskBody({ question: "valid", extra: true }).valid, false);
  assert.equal(validateAskTraceInput({
    taskType: "ask_trace", question: "A bounded question?", evidenceExcerpts: evidence,
    maxOutputTokens: 300, unexpected: true,
  }).valid, false, "gateway inputs reject unknown fields");
  assert.equal(validateAnswerDraft({
    answer: "A structurally plausible answer.", evidenceMode: "researched", conclusionMode: "supported",
    directAnswer: "A bounded answer.", lean: null, whyLean: "No lean.", positions: [], sourceSummaries: [],
    confidence: "low", confidenceScore: null, confidenceReasons: ["Limited evidence."], limitations: [], unresolvedQuestions: [], freshestEvidenceAt: null,
    keyPoints: [], claims: [], citations: [], citedSourceIds: [], citedClaimIds: [], confirmedFacts: [], reportedClaims: [], disagreements: [], caveats: [],
    whatCouldChange: "New evidence.", proposedConfidence: "low", unexpected: true,
  }).valid, false, "provider outputs reject unknown fields");
  const unsuppliedCitation = validateAnswerOutput({
    answer: "A material statement backed by a fabricated citation.", evidenceMode: "researched", conclusionMode: "supported",
    directAnswer: "A material statement backed by a fabricated citation.", lean: "position-1", whyLean: "The supplied evidence is stronger.",
    positions: [{ positionId: "position-1", label: "Position", summary: "A position.", supportingClaimIds: ["claim-unknown"], contradictingClaimIds: [], sourceIds: ["source-unknown"] }],
    sourceSummaries: [], confidence: "low", confidenceScore: null, confidenceReasons: ["Low confidence."], limitations: [], unresolvedQuestions: [], freshestEvidenceAt: null,
    keyPoints: [], citations: [{ assertionId: "assertion-unknown", sourceDocumentVersionId: "version-unknown", sourceChunkId: "chunk-unknown", startLocator: "p1:1", endLocator: "p1:2" }],
    claims: [{ text: "Material statement.", claimId: "claim-unknown", statement: "Material statement.", relationship: "supports", evidenceSourceIds: ["source-unknown"], evidenceClaimIds: ["claim-unknown"], citationAssertionIds: ["assertion-unknown"] }],
    citedSourceIds: ["source-unknown"], citedClaimIds: ["claim-unknown"], confirmedFacts: [],
    reportedClaims: [], analysis: "", disagreements: [], caveats: [], whatCouldChange: "New evidence.",
    proposedConfidence: "low",
  }, evidence, 300);
  assert.equal(unsuppliedCitation.passed, false, "Ask cannot cite evidence that was not supplied");
  const validAnswerContract = {
    answer: "A bounded answer backed by the supplied evidence.", evidenceMode: "researched", conclusionMode: "supported",
    directAnswer: "The supplied evidence supports the bounded answer.", lean: "position-1", whyLean: "The supported position has the available evidence.",
    positions: [{ positionId: "position-1", label: "Supported", summary: "The supplied evidence supports this position.", supportingClaimIds: ["claim-1"], contradictingClaimIds: [], sourceIds: ["source-1"] }],
    sourceSummaries: [{ sourceId: "source-1", sourceName: "source-1", sourceRole: "primary", summary: "Primary source.", materialClaims: ["claim-1"], caveats: [], publishedAt: null, retrievedAt: "2026-07-13T10:00:00Z" }],
    confidence: "low", confidenceScore: null, confidenceReasons: ["Bounded evidence."], limitations: [], unresolvedQuestions: [], freshestEvidenceAt: "2026-07-13T10:00:00Z",
    keyPoints: ["Bounded point."], claims: [{ text: "Supported claim.", claimId: "claim-1", statement: "Supported claim.", relationship: "supports", evidenceSourceIds: ["source-1"], evidenceClaimIds: ["claim-1"], citationAssertionIds: ["assertion-1"] }],
    citations: [{ assertionId: "assertion-1", sourceDocumentVersionId: "version-1", sourceChunkId: "chunk-1", startLocator: "p1:1", endLocator: "p1:2" }],
    citedSourceIds: ["source-1"], citedClaimIds: ["claim-1"], confirmedFacts: [], reportedClaims: [], analysis: "", disagreements: [], caveats: [], whatCouldChange: "A new reviewed source.", proposedConfidence: "low",
  };
  const locatorMismatch = validateAnswerOutput({ ...validAnswerContract, citations: [{ ...validAnswerContract.citations[0], endLocator: "p9:9" }] }, evidence, 300);
  assert.equal(locatorMismatch.passed, false, "citation locators must match the supplied reviewed excerpt");
  const modeMismatch = validateAnswerOutput(validAnswerContract, evidence, 300, { evidenceMode: "knowledge", conclusionMode: "supported", confidence: "high" });
  assert.equal(modeMismatch.passed, false, "model cannot override application-selected evidence mode or confidence");
  assert.ok(modeMismatch.failures.some((failure) => failure.includes("application-selected")));
  assert.equal(calculateDeterministicConfidence([]).label, "insufficient_evidence");
  assert.notEqual(calculateDeterministicConfidence(evidence).label, "insufficient_evidence");

  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error("must not be called"); };
  try {
    const legacyBearer = await handleTriageRequest(new Request("https://thetracemanifest.com/api/admin/ai-triage", {
      method: "POST", headers: { Authorization: "Bearer legacy-browser-token", "Content-Type": "application/json", Origin: "https://thetracemanifest.com" },
      body: JSON.stringify({ sources: [{ title: "Source", excerpt: null }] }),
    }), {});
    assert.equal(legacyBearer.status, 401, "a browser bearer token cannot authenticate admin AI");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const secret = "s".repeat(32);
  const identity = { operator: "publisher@example.com", role: "publisher" as const, timestamp: String(Date.now()), nonce: crypto.randomUUID() };
  const signature = await signInternalRequest(secret, "POST", "/admin/publish-story", "{}", identity);
  assert.equal(await verifyInternalRequestSignature(secret, "POST", "/admin/publish-story", "{}", identity, signature), true);
  assert.equal(await verifyInternalRequestSignature(secret, "POST", "/admin/publish-story", "{\"clusterId\":1}", identity, signature), false);
}

async function triageUrlSourceTests(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const retrievalAuditCodes: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedUrls.push(url);
      assert.equal(init?.redirect, "manual", "URL triage validates redirects itself");
      assert.equal(new Headers(init?.headers).get("Accept"), "text/html,application/xhtml+xml;q=0.9");
      if (url === "https://example.test/redirect") {
        return new Response(null, { status: 302, headers: { Location: "/post" } });
      }
      return new Response(`
        <html><head>
          <title>Fallback title</title>
          <meta property="og:title" content="Alice reports an issue" />
          <meta property="og:description" content="A bounded public post description." />
          <meta name="author" content="Alice Example" />
          <meta name="twitter:creator" content="@alice" />
        </head><body><article>Visible post text with useful context.</article><script>ignore()</script></body></html>
      `, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }) as typeof fetch;

    const source = await extractTriageUrlSource("https://example.test/redirect", (event) => {
      retrievalAuditCodes.push(`${event.phase}:${event.code}`);
    });
    assert.deepEqual(requestedUrls, ["https://example.test/redirect", "https://example.test/post"]);
    assert.deepEqual(retrievalAuditCodes, ["admitted:retrieved", "redirected:retrieved", "retrieved:retrieved"],
      "shared retrieval emits non-sensitive audit events across admission, redirect, and completion");
    assert.equal(source.finalUrl, "https://example.test/post");
    assert.equal(source.title, "Alice reports an issue");
    assert.equal(source.authorDisplayName, "Alice Example");
    assert.equal(source.authorHandle, "@alice");
    assert.match(source.excerpt, /Visible post text with useful context/);
    assert.doesNotMatch(source.excerpt, /ignore\(\)/, "script content is excluded from AI triage material");

    await assert.rejects(
      () => extractTriageUrlSource("http://127.0.0.1/private"),
      (error: unknown) => error instanceof TriageUrlFetchError && error.status === 400,
      "private-network targets are rejected before any fetch",
    );
    assert.equal(requestedUrls.length, 2, "rejected private URLs never reach fetch");

    await assert.rejects(
      () => retrieveRemoteSource("https://example.test/stalled", {
        allowedContentTypes: ["text/html"], maximumBytes: 1_024, timeoutMs: 10, maxRedirects: 0,
        userAgent: "TRACE test", fetcher: (async () => new Response(new ReadableStream<Uint8Array>({ start() {} }), {
          headers: { "Content-Type": "text/html" },
        })) as typeof fetch,
      }),
      (error: unknown) => error instanceof SourceRetrievalError && error.code === "response_timeout" && error.status === 503,
      "the shared retrieval deadline also bounds a response body that stalls after headers",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function sourceExtractionTests(): void {
  const html = `<!doctype html><html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Structured report" />
    <meta name="author" content="Alice Example" />
    <meta property="article:published_time" content="2026-07-20T12:00:00Z" />
    <script type="application/ld+json">{"@type":"NewsArticle","headline":"JSON-LD headline","datePublished":"2026-07-19","author":{"name":"JSON Author"}}</script>
  </head><body><nav>navigation noise</nav><main>
    <h1>Structured report</h1><p>First paragraph with &amp; detail.</p>
    <h2>Evidence</h2><p>Second paragraph.</p><ul><li>One item</li></ul>
    <script>secret()</script>
  </main><footer>footer noise</footer></body></html>`;
  const extracted = extractHtmlDocument(html);
  assert.equal(extracted.extractionState, "extracted");
  assert.equal(extracted.title, "Structured report");
  assert.equal(extracted.author, "Alice Example");
  assert.equal(extracted.publishedAt, "2026-07-20T12:00:00Z");
  assert.deepEqual(extracted.headings.map((heading) => heading.level), [1, 2]);
  assert.match(extracted.text, /First paragraph with & detail/);
  assert.doesNotMatch(extracted.text, /navigation noise|secret|footer noise/);
  assert.equal(extracted.diagnostics.container, "main");
  assert.ok(extracted.diagnostics.removedElements.script >= 1);
  assert.ok(extracted.blocks.every((block) => /^html:\d+-\d+$/.test(block.locator)));

  const capped = extractHtmlDocument(html, { maxTextCharacters: 20 });
  assert.equal(capped.diagnostics.truncated, true);
  assert.ok(capped.text.length <= 20);

  const metadataOnly = extractHtmlDocument("<html><head><meta name='description' content='Only metadata'></head><body><script>x</script></body></html>");
  assert.equal(metadataOnly.extractionState, "metadata_only");
  assert.ok(metadataOnly.diagnostics.warnings.length > 0);
}

async function kc03cCaptureTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const stored = new Map<string, { body: string; customMetadata?: Record<string, string> }>();
    const rawStore = {
      put: async (key: string, body: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: R2PutOptions) => {
        const value = typeof body === "string" ? body : "binary";
        stored.set(key, { body: value, customMetadata: options?.customMetadata });
      },
      head: async (key: string) => stored.has(key) ? { customMetadata: stored.get(key)?.customMetadata } : null,
      delete: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key); },
    } as unknown as Pick<R2Bucket, "put" | "delete"> & { head: R2Bucket["head"] };
    const body = "<html><head><title>Captured source</title></head><body><article><h1>Captured source</h1><p>Immutable source body.</p></article></body></html>";
    const extraction = extractHtmlDocument(body);
    const input = {
      canonicalUrl: "https://example.test/captured#fragment",
      retrievedUrl: "https://example.test/captured",
      contentType: "text/html",
      body,
      extraction,
      mediaKind: "html" as const,
      admissionState: "admitted" as const,
      copyrightStorageMode: "private_full_text" as const,
      sourceId: null,
      httpStatus: 200,
      retrievedAt: "2026-07-23T10:00:00Z",
    };
    const first = await captureAdmittedSource({ DB: database.asD1(), RAW_STORE: rawStore }, input);
    const second = await captureAdmittedSource({ DB: database.asD1(), RAW_STORE: rawStore }, input);
    assert.deepEqual(second, first, "repeating a capture returns the same content-addressed identifiers");
    assert.equal(stored.size, 2, "the original and structured extraction are kept in private R2");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_documents").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_document_versions").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_index_operations").first<{ count: number }>())?.count, 1);
    const version = await database.prepare("SELECT r2_original_key, r2_extracted_key, extraction_status FROM source_document_versions").first<{ r2_original_key: string; r2_extracted_key: string; extraction_status: string }>();
    assert.equal(version?.r2_original_key, first.r2OriginalKey);
    assert.equal(version?.r2_extracted_key, first.r2ExtractedKey);
    assert.equal(version?.extraction_status, "captured");
    const reconciled = await reconcileKnowledgeIndexOperations({ DB: database.asD1(), RAW_STORE: rawStore });
    assert.deepEqual(reconciled, { completed: 1, deferred: 0, repairRequired: 0, failed: 0 },
      "the R2 outbox verifies both the immutable original and structured extraction before completion");

    const metadataOnly = await captureAdmittedSource({ DB: database.asD1(), RAW_STORE: rawStore }, {
      ...input, canonicalUrl: "https://example.test/metadata", copyrightStorageMode: "metadata_only",
    });
    assert.equal(metadataOnly.r2OriginalKey, null);
    assert.equal(metadataOnly.extractionStatus, "metadata_only");
    assert.equal(stored.size, 2, "metadata-only capture does not write an unpermitted original");

    await assert.rejects(
      () => captureAdmittedSource({ DB: database.asD1(), RAW_STORE: rawStore }, { ...input, admissionState: "admitted", body: "" }),
      (error: unknown) => error instanceof SourceCaptureError && error.code === "invalid_input",
    );
  } finally {
    database.close();
  }
}

async function kc03dQueueTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const messages: unknown[] = [];
    const queue = { send: async (message: unknown) => { messages.push(message); } };
    const environment = { DB: database.asD1(), KNOWLEDGE_PROCESSING_QUEUE: queue };
    const first = await admitAndQueueFeedCapture(environment, {
      feedItemId: 42, sourceId: 7, url: "https://example.test/story/?utm_source=feed#fragment",
    });
    const second = await admitAndQueueFeedCapture(environment, {
      feedItemId: 42, sourceId: 7, url: "https://example.test/story/?utm_source=feed#fragment",
    });
    assert.equal(first.queued, true);
    assert.equal(first.reason, "queued");
    assert.equal(second.reason, "already_queued", "repeated feed delivery does not enqueue duplicate capture jobs");
    assert.equal(messages.length, 1);
    assert.doesNotMatch(JSON.stringify(messages[0]), /article body|content_excerpt|summary/,
      "capture queue messages contain identifiers and policy metadata, never article bodies");
    assert.equal((await database.prepare("SELECT admission_state FROM source_documents").first<{ admission_state: string }>())?.admission_state, "admitted");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_processing_jobs").first<{ count: number }>())?.count, 1);

    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type, document_json, policy_version, created_by)
      VALUES (
        'knowledge-kc08c', 'Which sources need capture?', 'kc08c-hash', 'ai-agents', 'explainer',
        '{"body":"## Evidence\\n\\n- [Existing](https://example.test/story/)\\n- [Missing](https://missing.example/new)","evidenceUrls":[{"url":"https://example.test/story/","name":"Existing","description":"","sectionKey":"evidence","relationship":"supports","line":3},{"url":"https://missing.example/new","name":"Missing","description":"","sectionKey":"evidence","relationship":"supports","line":4}]}',
        'test-policy', 'test-editor'
      );
    `);
    const knowledgeCapture = await admitAndQueueKnowledgeDocumentCapture(environment, { knowledgeDocumentId: "knowledge-kc08c" });
    assert.equal(knowledgeCapture.urlsFound, 2);
    assert.equal(knowledgeCapture.alreadyQueued, 1, "existing source capture jobs are not duplicated");
    assert.equal(knowledgeCapture.queued, 1, "missing evidence URLs are admitted and queued for capture");
    assert.equal(messages.length, 2);
    const repeatedKnowledgeCapture = await admitAndQueueKnowledgeDocumentCapture(environment, { knowledgeDocumentId: "knowledge-kc08c" });
    assert.equal(repeatedKnowledgeCapture.queued, 0);
    assert.equal(repeatedKnowledgeCapture.alreadyQueued, 2, "repeating a knowledge capture request is idempotent");
    assert.equal(messages.length, 2);

    const failingDatabase = new SQLiteD1();
    try {
      let fail = true;
      const retryQueue = { send: async (message: unknown) => { if (fail) { fail = false; throw new Error("queue unavailable"); } messages.push(message); } };
      const retryEnvironment = { DB: failingDatabase.asD1(), KNOWLEDGE_PROCESSING_QUEUE: retryQueue };
      const failed = await admitAndQueueFeedCapture(retryEnvironment, { feedItemId: 43, sourceId: 7, url: "https://example.test/retry" });
      assert.equal(failed.reason, "queue_send_failed");
      const retried = await admitAndQueueFeedCapture(retryEnvironment, { feedItemId: 43, sourceId: 7, url: "https://example.test/retry" });
      assert.equal(retried.reason, "queued", "failed queue production remains retryable through the D1 job state");
    } finally {
      failingDatabase.close();
    }
  } finally {
    database.close();
  }
}

async function kc03eConsumerTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    const messages: any[] = [];
    const stored = new Map<string, { body: string; customMetadata?: Record<string, string> }>();
    const rawStore = {
      put: async (key: string, body: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: R2PutOptions) => {
        stored.set(key, { body: typeof body === "string" ? body : "binary", customMetadata: options?.customMetadata });
      },
      head: async (key: string) => stored.has(key) ? { customMetadata: stored.get(key)?.customMetadata } : null,
      delete: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key); },
    } as unknown as R2Bucket;
    const queue = { send: async (message: unknown) => { messages.push(message); } };
    const environment = { DB: database.asD1(), KNOWLEDGE_PROCESSING_QUEUE: queue };
    const admission = await admitAndQueueManualCapture(environment, {
      url: "https://example.test/consumer", copyrightStorageMode: "private_full_text", correlationId: "consumer-test",
    });
    const message = messages[0];
    const html = "<html><head><title>Consumer source</title></head><body><article><h1>Consumer source</h1><p>Retrieved article text.</p></article></body></html>";
    const fetcher = (async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } })) as typeof fetch;
    assert.equal(await processKnowledgeCaptureMessage({ DB: database.asD1(), RAW_STORE: rawStore }, message, fetcher), "completed");
    assert.equal((await database.prepare("SELECT state FROM knowledge_processing_jobs WHERE id = ?").bind(admission.jobId).first<{ state: string }>())?.state, "completed");
    assert.equal((await database.prepare("SELECT extraction_status FROM source_document_versions").first<{ extraction_status: string }>())?.extraction_status, "captured");
    assert.equal(await processKnowledgeCaptureMessage({ DB: database.asD1(), RAW_STORE: rawStore }, message, fetcher), "already_completed");

    const chunksBeforeMetadataOnly = (await database.prepare("SELECT COUNT(*) AS count FROM source_chunks").first<{ count: number }>())?.count ?? 0;
    const metadataAdmission = await admitAndQueueFeedCapture(environment, {
      feedItemId: 99, sourceId: 7, url: "https://example.test/metadata-only",
    });
    const metadataMessage = messages.find((item) => item.sourceDocumentId === metadataAdmission.sourceDocumentId);
    await processKnowledgeCaptureMessage({ DB: database.asD1(), RAW_STORE: rawStore }, metadataMessage, fetcher);
    assert.equal((await database.prepare("SELECT extraction_status FROM source_document_versions WHERE source_document_id = ?").bind(metadataAdmission.sourceDocumentId).first<{ extraction_status: string }>())?.extraction_status, "metadata_only");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_chunks").first<{ count: number }>())?.count, chunksBeforeMetadataOnly,
      "metadata-only sources do not leak retained text into D1 chunks");

    const failedAdmission = await admitAndQueueManualCapture(environment, {
      url: "https://example.test/restricted", copyrightStorageMode: "private_full_text", correlationId: "consumer-failure-test",
    });
    const restrictedFetcher = (async () => new Response(null, { status: 403, headers: { "Content-Type": "text/html" } })) as typeof fetch;
    await assert.rejects(
      () => processKnowledgeCaptureMessage({ DB: database.asD1(), RAW_STORE: rawStore }, messages.find((item) => item.sourceDocumentId === failedAdmission.sourceDocumentId), restrictedFetcher),
      (error: unknown) => error instanceof KnowledgeCaptureConsumerError && error.code === "response_status_rejected" && error.retryable === false,
      "permanent HTTP rejection is recorded as non-transient and bounded by the configured Queue retry/DLQ policy",
    );
    let retries = 0;
    let acknowledgements = 0;
    await consumeKnowledgeCaptureBatch({
      queue: "test", messages: [{ body: { ...messages.find((item) => item.sourceDocumentId === failedAdmission.sourceDocumentId), sourceDocumentId: "missing-source" },
        ack: () => { acknowledgements++; }, retry: () => { retries++; } }],
    } as unknown as MessageBatch<any>, { DB: database.asD1(), RAW_STORE: rawStore });
    assert.equal(retries, 1, "failed queue messages are retried for bounded DLQ handling");
    assert.equal(acknowledgements, 0);
  } finally {
    database.close();
  }
}

async function kc04StructuredExtractionTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc04-doc', 'https://example.test/kc04', 'kc04-url-hash', 'html', 'private_full_text', 'admitted');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('kc04-version', 'kc04-doc', 'kc04-content-hash', 'https://example.test/kc04', datetime('now'), 'captured');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, predicate_key, object_json, current_state, materiality)
      VALUES ('canonical-existing', 'The Orion model achieved 91% accuracy on the benchmark.',
              'benchmark_result', 'benchmark', 'benchmark_result', '{"text":"The Orion model achieved 91% accuracy on the benchmark."}',
              'active', 'standard');
    `);
    const extraction = extractHtmlDocument(`<html><body><article>
      <h1>Model release</h1>
      <p>The Orion model was released on 2026-07-23 and achieved 91% accuracy on the benchmark.</p>
      <p>According to the authors, the release may reduce latency, but this result needs independent verification.</p>
    </article></body></html>`);
    const first = await extractStructuredSource(database.asD1(), {
      sourceDocumentVersionId: "kc04-version", sourceContentHash: "kc04-content-hash", extraction,
      correlationId: "kc04-metadata-test",
    });
    const second = await extractStructuredSource(database.asD1(), {
      sourceDocumentVersionId: "kc04-version", sourceContentHash: "kc04-content-hash", extraction,
      correlationId: "kc04-metadata-test",
    });
    assert.ok(first.chunksCreated >= 2, "deterministic extraction persists source chunks");
    assert.ok(first.candidatesCreated >= 2, "deterministic extraction emits typed candidates");
    assert.ok(first.claimsCreated >= 1, "material candidates produce proposed canonical claim assertions");
    assert.ok(first.matchCandidatesCreated >= 1, "material candidates produce review-gated match proposals");
    assert.equal(second.candidatesCreated, 0, "unchanged source extraction is idempotent");
    const match = await database.prepare(`
      SELECT candidate_canonical_claim_id, match_kind, match_score, component_json, state
      FROM knowledge_claim_match_candidates WHERE source_document_version_id = 'kc04-version'
    `).first<{ candidate_canonical_claim_id: string; match_kind: string; match_score: number; component_json: string; state: string }>();
    assert.equal(match?.candidate_canonical_claim_id, "canonical-existing", "match proposals target existing canonical claims");
    assert.ok(["lexical", "entity", "value", "date", "semantic"].includes(match?.match_kind ?? ""));
    assert.ok((match?.match_score ?? 0) > 0, "match proposals carry deterministic scores");
    assert.match(match?.component_json ?? "", /lexical/);
    assert.equal(match?.state, "proposed", "match proposals remain review-gated");
    const rerunMatches = await generateClaimMatchCandidates(database.asD1(), { sourceExtractionId: (await database.prepare(
      "SELECT id FROM source_extractions WHERE extraction_kind = 'benchmark_result' LIMIT 1",
    ).first<{ id: string }>())?.id ?? "" });
    assert.equal(rerunMatches.candidatesCreated, 0, "match proposal generation is idempotent");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_extractions WHERE start_locator IS NOT NULL AND end_locator IS NOT NULL").first<{ count: number }>())?.count, first.candidatesCreated);
    assert.equal((await database.prepare("SELECT reviewer_state, admission_state FROM claim_assertions LIMIT 1").first<{ reviewer_state: string; admission_state: string }>())?.reviewer_state, "proposed");
    assert.equal((await database.prepare("SELECT cost_microusd FROM source_summaries WHERE source_document_version_id = 'kc04-version'").first<{ cost_microusd: number }>())?.cost_microusd, 0,
      "deterministic extraction records zero external-AI cost");
    const run = await database.prepare(`
      SELECT source_document_version_id, source_content_hash, task_type, extraction_method,
             extraction_version, prompt_version, prompt_hash, policy_version, usage_json,
             cost_basis, validation_state, audit_json, correlation_id, state
      FROM knowledge_extraction_runs WHERE id = ?
    `).bind(first.extractionRunId).first<Record<string, string>>();
    assert.equal(run?.source_document_version_id, "kc04-version", "run records the source version");
    assert.equal(run?.source_content_hash, "kc04-content-hash", "run records the immutable source hash");
    assert.equal(run?.task_type, "extract_source_structure");
    assert.equal(run?.extraction_method, "deterministic");
    assert.equal(run?.prompt_version, "none");
    assert.ok(run?.prompt_hash, "run records a prompt identity hash even for deterministic work");
    assert.equal(run?.policy_version, "kc-04a-v1");
    assert.equal(run?.cost_basis, "none");
    assert.equal(run?.validation_state, "valid");
    assert.equal(run?.correlation_id, "kc04-metadata-test");
    assert.equal(run?.state, "completed");
    const linkedOutputs = (await database.prepare("SELECT COUNT(*) AS count FROM knowledge_extraction_run_outputs WHERE extraction_run_id = ?").bind(first.extractionRunId).first<{ count: number }>())?.count;
    assert.equal(linkedOutputs, first.candidatesCreated + 1, "run links every structured candidate and its summary");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_extraction_runs").first<{ count: number }>())?.count, 1,
      "unchanged source reuses the completed metadata envelope");

    const aiCacheInput = {
      sourceDocumentVersionId: "kc04-version",
      sourceContentHash: "kc04-content-hash",
      taskType: "extract_source_structure" as const,
      extractionMethod: "governed_ai" as const,
      extractionVersion: "governed_structure_v1",
      modelProvider: "deepseek",
      modelIdentifier: "deepseek-v4-flash",
      promptVersion: "kc04f-structure-prompt-v1",
      policyVersion: "kc-04f-v1",
      correlationId: "kc04f-cache-test",
    };
    let providerCalls = 0;
    const firstClaim = await claimKnowledgeExtractionRun(database.asD1(), aiCacheInput);
    if (firstClaim.status === "owned") {
      providerCalls++;
      await settleKnowledgeExtractionRun(database.asD1(), firstClaim.runId, {
        inputTokens: 120, outputTokens: 80, cachedTokens: 0,
        estimatedCostMicrousd: 150, actualCostMicrousd: 125,
        costBasis: "provider_usage", validationState: "valid", validation: { schema: "passed" },
      });
    }
    const cachedClaim = await claimKnowledgeExtractionRun(database.asD1(), aiCacheInput);
    if (cachedClaim.status === "owned") providerCalls++;
    assert.equal(cachedClaim.status, "cached", "completed governed extraction is returned from the cache gate");
    assert.equal(providerCalls, 1, "unchanged content does not invoke the provider a second time");
    assert.equal(cachedClaim.cachedCostMicrousd, 125, "cache hit exposes the original settled cost without charging again");
    assert.equal((await database.prepare(`
      SELECT COUNT(*) AS count, SUM(actual_cost_microusd) AS actual_cost
      FROM knowledge_extraction_runs WHERE extraction_method = 'governed_ai'
    `).first<{ count: number; actual_cost: number }>())?.count, 1, "one governed run is stored for one cache identity");
    assert.equal((await database.prepare(`
      SELECT SUM(actual_cost_microusd) AS actual_cost
      FROM knowledge_extraction_runs WHERE extraction_method = 'governed_ai'
    `).first<{ actual_cost: number }>())?.actual_cost, 125, "the unchanged retry adds no second external-AI cost");
    const inProgressInput = { ...aiCacheInput, promptVersion: "kc04f-in-progress-prompt-v1" };
    const ownedRun = await claimKnowledgeExtractionRun(database.asD1(), inProgressInput);
    const concurrentClaim = await claimKnowledgeExtractionRun(database.asD1(), inProgressInput);
    assert.equal(ownedRun.status, "owned");
    assert.equal(concurrentClaim.status, "in_progress", "a concurrent retry cannot claim a running provider job");
    await failKnowledgeExtractionRun(database.asD1(), ownedRun.runId, "provider_timeout");
    assert.equal((await claimKnowledgeExtractionRun(database.asD1(), inProgressInput)).status, "owned", "failed runs remain retryable");

    const candidateId = (await database.prepare("SELECT id FROM source_extractions LIMIT 1").first<{ id: string }>())?.id!;
    const review = async (targetType: "source_extraction" | "source_summary", targetId: string, nextState: any, amendedValueJson?: string) =>
      reviewKnowledgeExtraction(database.asD1(), {
        targetType, targetId, nextState, amendedValueJson,
        reviewerEmail: "publisher@example.com", reviewerRole: "publisher", requestId: crypto.randomUUID(),
      });
    await review("source_extraction", candidateId, "accepted");
    await review("source_extraction", candidateId, "amended", JSON.stringify({ text: "An amended reviewed candidate", deterministic: true }));
    await review("source_extraction", candidateId, "needs_research");
    await review("source_extraction", candidateId, "rejected");
    await review("source_extraction", candidateId, "proposed");
    await review("source_extraction", candidateId, "duplicate");
    await review("source_extraction", candidateId, "proposed");
    await review("source_extraction", candidateId, "unsupported");
    await review("source_extraction", candidateId, "proposed");
    assert.equal((await database.prepare("SELECT reviewer_state, reviewed_by, payload_json FROM source_extractions WHERE id = ?").bind(candidateId).first<{ reviewer_state: string; reviewed_by: string; payload_json: string }>())?.reviewer_state, "proposed");
    assert.equal(JSON.parse((await database.prepare("SELECT payload_json FROM source_extractions WHERE id = ?").bind(candidateId).first<{ payload_json: string }>())!.payload_json).text, "An amended reviewed candidate");

    const summaryId = `summary-kc04-version`;
    await review("source_summary", summaryId, "accepted");
    await review("source_summary", summaryId, "amended", JSON.stringify({ summaryText: "An amended source summary" }));
    await review("source_summary", summaryId, "rejected");
    await review("source_summary", summaryId, "proposed");
    await assert.rejects(
      () => review("source_summary", summaryId, "duplicate"),
      (error: unknown) => error instanceof ExtractionReviewError && error.code === "state_not_supported",
      "source summaries reject extraction-only review states",
    );
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_extraction_reviews").first<{ count: number }>())?.count, 13,
      "every review transition is retained in attributable history");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'review_knowledge_extraction' AND outcome = 'succeeded'").first<{ count: number }>())?.count, 13,
      "every successful review transition is audited");
  } finally {
    database.close();
  }
}

async function kc05bClaimMatchReviewTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc05b-doc', 'https://example.test/kc05b', 'kc05b-url-hash', 'html', 'private_full_text', 'admitted');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('kc05b-version', 'kc05b-doc', 'kc05b-content-hash', 'https://example.test/kc05b', datetime('now'), 'captured');
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('kc05b-chunk', 'kc05b-version', 0, 'KC05B test source claim.', 'kc05b-text-hash', 'html:1', 'html:1');

      INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain, predicate_key, object_json, current_state, materiality)
      VALUES
        ('kc05b-own-merge', 'Merge source claim', 'community_report', 'general', 'report', '{}', 'active', 'standard'),
        ('kc05b-target-merge', 'Existing target claim', 'community_report', 'general', 'report', '{}', 'active', 'standard'),
        ('kc05b-own-new', 'New source claim', 'community_report', 'general', 'report', '{}', 'active', 'standard'),
        ('kc05b-target-new', 'Unselected target claim', 'community_report', 'general', 'report', '{}', 'active', 'standard'),
        ('kc05b-own-reject', 'Rejected source claim', 'community_report', 'general', 'report', '{}', 'active', 'standard'),
        ('kc05b-target-reject', 'Rejected target claim', 'community_report', 'general', 'report', '{}', 'active', 'standard');

      INSERT INTO source_extractions
        (id, source_document_version_id, source_chunk_id, extraction_kind, payload_json,
         start_locator, end_locator, extraction_method, extraction_version, idempotency_key)
      VALUES
        ('kc05b-extraction-merge', 'kc05b-version', 'kc05b-chunk', 'material_claim', '{"text":"Merge source claim"}', 'html:1', 'html:1', 'deterministic', 'test', 'kc05b-idem-merge'),
        ('kc05b-extraction-new', 'kc05b-version', 'kc05b-chunk', 'material_claim', '{"text":"New source claim"}', 'html:1', 'html:1', 'deterministic', 'test', 'kc05b-idem-new'),
        ('kc05b-extraction-reject', 'kc05b-version', 'kc05b-chunk', 'material_claim', '{"text":"Rejected source claim"}', 'html:1', 'html:1', 'deterministic', 'test', 'kc05b-idem-reject');

      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
         assertion_text, relationship, source_role, directness, evidence_treatment, admission_state,
         extraction_method, extraction_version, confidence, reviewer_state)
      VALUES
        ('assertion-kc05b-extraction-merge', 'kc05b-own-merge', 'kc05b-version', 'kc05b-chunk', 'html:1', 'html:1', 'Merge source claim', 'reports', 'reported_claim', 'unknown', 'context_only', 'pending', 'deterministic', 'test', 0.35, 'proposed'),
        ('assertion-kc05b-extraction-new', 'kc05b-own-new', 'kc05b-version', 'kc05b-chunk', 'html:1', 'html:1', 'New source claim', 'reports', 'reported_claim', 'unknown', 'context_only', 'pending', 'deterministic', 'test', 0.35, 'proposed'),
        ('assertion-kc05b-extraction-reject', 'kc05b-own-reject', 'kc05b-version', 'kc05b-chunk', 'html:1', 'html:1', 'Rejected source claim', 'reports', 'reported_claim', 'unknown', 'context_only', 'pending', 'deterministic', 'test', 0.35, 'proposed');

      INSERT INTO knowledge_claim_match_candidates
        (id, source_extraction_id, source_document_version_id, candidate_canonical_claim_id,
         match_kind, match_score, component_json, algorithm_version, idempotency_key)
      VALUES
        ('kc05b-match-merge', 'kc05b-extraction-merge', 'kc05b-version', 'kc05b-target-merge', 'lexical', 0.9, '{"lexical":0.9}', 'test', 'kc05b-match-idem-merge'),
        ('kc05b-match-new', 'kc05b-extraction-new', 'kc05b-version', 'kc05b-target-new', 'lexical', 0.8, '{"lexical":0.8}', 'test', 'kc05b-match-idem-new'),
        ('kc05b-match-reject', 'kc05b-extraction-reject', 'kc05b-version', 'kc05b-target-reject', 'lexical', 0.7, '{"lexical":0.7}', 'test', 'kc05b-match-idem-reject');
    `);

    const reviewInput = (candidateId: string, decision: "merge_existing" | "create_new" | "reject") => ({
      candidateId, decision, reviewerEmail: "publisher@example.com", reviewerRole: "publisher" as const,
      reviewNote: `KC05B ${decision}`, requestId: crypto.randomUUID(),
    });
    const merge = await reviewClaimMatchCandidate(database.asD1(), reviewInput("kc05b-match-merge", "merge_existing"));
    assert.equal(merge.resolvedCanonicalClaimId, "kc05b-target-merge", "merge resolves to the selected canonical claim");
    assert.equal((await database.prepare("SELECT canonical_claim_id, reviewer_state FROM claim_assertions WHERE id = 'assertion-kc05b-extraction-merge'").first<{ canonical_claim_id: string; reviewer_state: string }>())?.canonical_claim_id, "kc05b-target-merge");
    assert.equal((await database.prepare("SELECT current_state FROM canonical_claims WHERE id = 'kc05b-own-merge'").first<{ current_state: string }>())?.current_state, "superseded");
    assert.ok(merge.provenanceProposalId, "accepted claim decisions create a provenance proposal");
    const duplicateProposal = await generateClaimProvenanceProposal(database.asD1(), { claimAssertionId: "assertion-kc05b-extraction-merge" });
    assert.equal(duplicateProposal.created, false, "provenance proposal generation is idempotent");
    const provenanceAccept = await reviewClaimProvenanceProposal(database.asD1(), {
      proposalId: merge.provenanceProposalId!, decision: "accept", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", reviewNote: "Confirmed source lineage.", requestId: crypto.randomUUID(),
    });
    assert.equal(provenanceAccept.decision, "accept");
    assert.equal((await database.prepare("SELECT directness, source_role, evidence_treatment FROM claim_assertions WHERE id = 'assertion-kc05b-extraction-merge'").first<{ directness: string; source_role: string; evidence_treatment: string }>())?.source_role, "reported_claim");

    const create = await reviewClaimMatchCandidate(database.asD1(), reviewInput("kc05b-match-new", "create_new"));
    assert.equal(create.resolvedCanonicalClaimId, "kc05b-own-new", "create-new keeps the extraction's canonical claim");
    assert.equal((await database.prepare("SELECT canonical_claim_id, reviewer_state FROM claim_assertions WHERE id = 'assertion-kc05b-extraction-new'").first<{ canonical_claim_id: string; reviewer_state: string }>())?.reviewer_state, "accepted");
    await reviewClaimProvenanceProposal(database.asD1(), {
      proposalId: create.provenanceProposalId!, decision: "reject", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", reviewNote: "Lineage needs more evidence.", requestId: crypto.randomUUID(),
    });

    await reviewClaimMatchCandidate(database.asD1(), reviewInput("kc05b-match-reject", "reject"));
    assert.equal((await database.prepare("SELECT state FROM knowledge_claim_match_candidates WHERE id = 'kc05b-match-reject'").first<{ state: string }>())?.state, "rejected");
    assert.equal((await database.prepare("SELECT reviewer_state FROM claim_assertions WHERE id = 'assertion-kc05b-extraction-reject'").first<{ reviewer_state: string }>())?.reviewer_state, "proposed", "reject leaves the source assertion pending");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_claim_match_reviews").first<{ count: number }>())?.count, 3, "every decision is retained in attributable history");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_claim_provenance_reviews").first<{ count: number }>())?.count, 2, "provenance review decisions are retained in attributable history");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM provenance_groups").first<{ count: number }>())?.count, 0, "provenance proposals do not create groups automatically");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_provenance_memberships").first<{ count: number }>())?.count, 0, "provenance proposals do not create memberships automatically");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'review_knowledge_claim_match' AND outcome = 'succeeded'").first<{ count: number }>())?.count, 3, "every claim-match decision is audited");
    await assert.rejects(
      () => reviewClaimMatchCandidate(database.asD1(), reviewInput("kc05b-match-reject", "reject")),
      (error: unknown) => error instanceof ClaimMatchReviewError && error.code === "candidate_already_reviewed",
      "reviewed candidates cannot be decided twice",
    );
    await assert.rejects(
      () => reviewClaimProvenanceProposal(database.asD1(), {
        proposalId: merge.provenanceProposalId!, decision: "accept", reviewerEmail: "publisher@example.com",
        reviewerRole: "publisher", requestId: crypto.randomUUID(),
      }),
      (error: unknown) => error instanceof ClaimProvenanceReviewError && error.code === "proposal_already_reviewed",
      "reviewed provenance proposals cannot be decided twice",
    );
  } finally {
    database.close();
  }
}

async function kc05dProvenanceGroupTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES
        ('kc05d-root', 'https://example.test/root', 'kc05d-root-hash', 'html', 'private_full_text', 'admitted'),
        ('kc05d-derivative', 'https://example.test/derivative', 'kc05d-derivative-hash', 'html', 'private_full_text', 'admitted');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES
        ('kc05d-root-version', 'kc05d-root', 'kc05d-shared-content', 'https://example.test/root', '2026-07-20T00:00:00Z', 'captured'),
        ('kc05d-derivative-version', 'kc05d-derivative', 'kc05d-shared-content', 'https://example.test/derivative', '2026-07-21T00:00:00Z', 'captured');
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('kc05d-chunk', 'kc05d-derivative-version', 0, 'Shared derivative source.', 'kc05d-chunk-hash', 'html:1', 'html:1');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, predicate_key, object_json, current_state, materiality)
      VALUES ('kc05d-claim', 'Shared derivative claim', 'community_report', 'general', 'report', '{}', 'active', 'standard');
      INSERT INTO source_extractions
        (id, source_document_version_id, source_chunk_id, extraction_kind, payload_json,
         start_locator, end_locator, extraction_method, extraction_version, idempotency_key)
      VALUES ('kc05d-extraction', 'kc05d-derivative-version', 'kc05d-chunk', 'material_claim', '{"text":"Shared derivative claim"}', 'html:1', 'html:1', 'deterministic', 'test', 'kc05d-extraction-idem');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
         assertion_text, relationship, source_role, directness, evidence_treatment, admission_state,
         extraction_method, extraction_version, confidence, reviewer_state)
      VALUES ('assertion-kc05d-extraction', 'kc05d-claim', 'kc05d-derivative-version', 'kc05d-chunk', 'html:1', 'html:1', 'Shared derivative claim', 'reports', 'reported_claim', 'unknown', 'context_only', 'pending', 'deterministic', 'test', 0.35, 'proposed');
    `);
    const generated = await generateProvenanceGroupProposals(database.asD1(), { sourceDocumentVersionId: "kc05d-derivative-version" });
    assert.equal(generated.proposalsCreated, 2, "exact-content duplicates produce root and derivative group proposals");
    const rerun = await generateProvenanceGroupProposals(database.asD1(), { sourceDocumentVersionId: "kc05d-derivative-version" });
    assert.equal(rerun.proposalsCreated, 0, "shared-origin proposal generation is idempotent");
    const derivativeProposal = await database.prepare("SELECT id FROM knowledge_provenance_group_proposals WHERE source_document_id = 'kc05d-derivative'").first<{ id: string }>();
    const rootProposal = await database.prepare("SELECT id FROM knowledge_provenance_group_proposals WHERE source_document_id = 'kc05d-root'").first<{ id: string }>();
    const accepted = await reviewProvenanceGroupProposal(database.asD1(), {
      proposalId: derivativeProposal!.id, decision: "accept", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", reviewNote: "Exact content confirms shared origin.", requestId: crypto.randomUUID(),
    });
    assert.ok(accepted.provenanceGroupId, "accepted grouping creates a provenance group");
    assert.equal(accepted.membershipCreated, true, "accepted grouping creates the derivative membership");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM source_provenance_memberships WHERE provenance_group_id = ?").bind(accepted.provenanceGroupId).first<{ count: number }>())?.count, 2, "accepted grouping includes root and derivative memberships");
    assert.equal((await database.prepare("SELECT provenance_group_id FROM claim_assertions WHERE id = 'assertion-kc05d-extraction'").first<{ provenance_group_id: string }>())?.provenance_group_id, accepted.provenanceGroupId, "accepted grouping links source assertions");
    await reviewProvenanceGroupProposal(database.asD1(), {
      proposalId: rootProposal!.id, decision: "reject", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", requestId: crypto.randomUUID(),
    });
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_provenance_group_reviews").first<{ count: number }>())?.count, 2, "group decisions are retained in review history");
    await assert.rejects(
      () => reviewProvenanceGroupProposal(database.asD1(), {
        proposalId: rootProposal!.id, decision: "accept", reviewerEmail: "publisher@example.com",
        reviewerRole: "publisher", requestId: crypto.randomUUID(),
      }),
      (error: unknown) => error instanceof ProvenanceGroupReviewError && error.code === "proposal_already_reviewed",
      "reviewed grouping proposals cannot be decided twice",
    );
  } finally {
    database.close();
  }
}

async function kc05eClaimRelationshipTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO source_documents (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc05e-doc', 'https://example.test/kc05e', 'kc05e-url-hash', 'html', 'private_full_text', 'admitted');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('kc05e-version', 'kc05e-doc', 'kc05e-content-hash', 'https://example.test/kc05e', datetime('now'), 'captured');
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('kc05e-chunk', 'kc05e-version', 0, 'The Orion benchmark result was corrected and now reaches 91 percent accuracy.', 'kc05e-chunk-hash', 'html:1', 'html:1');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, predicate_key, object_json, current_state, materiality)
      VALUES
        ('kc05e-source-claim', 'The Orion benchmark result was corrected and now reaches 91 percent accuracy.', 'community_report', 'benchmark', 'benchmark_result', '{}', 'active', 'standard'),
        ('kc05e-target-claim', 'The Orion benchmark result reaches 91 percent accuracy.', 'benchmark_result', 'benchmark', 'benchmark_result', '{}', 'active', 'standard');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
         assertion_text, relationship, source_role, directness, evidence_treatment, admission_state,
         extraction_method, extraction_version, confidence, reviewer_state)
      VALUES ('kc05e-source-assertion', 'kc05e-source-claim', 'kc05e-version', 'kc05e-chunk', 'html:1', 'html:1', 'The Orion benchmark result was corrected and now reaches 91 percent accuracy.', 'reports', 'reported_claim', 'direct', 'context_only', 'pending', 'deterministic', 'test', 0.35, 'proposed');
    `);
    const generated = await generateClaimRelationshipProposals(database.asD1(), { sourceAssertionId: "kc05e-source-assertion" });
    assert.equal(generated.proposalsCreated, 1, "similar claims produce a relationship proposal");
    const proposal = await database.prepare("SELECT id, relationship, confidence FROM knowledge_claim_relationship_proposals LIMIT 1").first<{ id: string; relationship: string; confidence: number }>();
    assert.equal(proposal?.relationship, "corrects", "correction language is classified deterministically");
    assert.ok((proposal?.confidence ?? 0) > 0.25);
    const rerun = await generateClaimRelationshipProposals(database.asD1(), { sourceAssertionId: "kc05e-source-assertion" });
    assert.equal(rerun.proposalsCreated, 0, "relationship proposal generation is idempotent");
    const review = await reviewClaimRelationshipProposal(database.asD1(), {
      proposalId: proposal!.id, decision: "accept", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", reviewNote: "Confirmed correction relationship.", requestId: crypto.randomUUID(),
    });
    assert.ok(review.createdAssertionId, "accepted relationship creates a reviewed assertion");
    assert.equal((await database.prepare("SELECT canonical_claim_id, relationship, reviewer_state FROM claim_assertions WHERE id = ?").bind(review.createdAssertionId).first<{ canonical_claim_id: string; relationship: string; reviewer_state: string }>())?.canonical_claim_id, "kc05e-target-claim");
    assert.equal((await database.prepare("SELECT relationship FROM claim_assertions WHERE id = ?").bind(review.createdAssertionId).first<{ relationship: string }>())?.relationship, "corrects");
    assert.equal((await database.prepare("SELECT current_state FROM canonical_claims WHERE id = 'kc05e-target-claim'").first<{ current_state: string }>())?.current_state, "active", "relationship review does not mutate claim state");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_claim_relationship_reviews").first<{ count: number }>())?.count, 1);
    assert.ok(review.conflictCaseId, "conflicting relationship creates an explicit conflict case");
    assert.equal((await database.prepare("SELECT status FROM knowledge_claim_conflict_cases WHERE id = ?").bind(review.conflictCaseId).first<{ status: string }>())?.status, "unresolved", "conflicts remain unresolved by default");
    const duplicateConflict = await generateClaimConflictCase(database.asD1(), { relationshipProposalId: proposal!.id });
    assert.equal(duplicateConflict.created, false, "conflict case generation is idempotent");
    await reviewClaimConflictCase(database.asD1(), {
      conflictCaseId: review.conflictCaseId!, decision: "acknowledge", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", reviewNote: "Both claims remain visible.", requestId: crypto.randomUUID(),
    });
    assert.equal((await database.prepare("SELECT status FROM knowledge_claim_conflict_cases WHERE id = ?").bind(review.conflictCaseId).first<{ status: string }>())?.status, "acknowledged");
    await reviewClaimConflictCase(database.asD1(), {
      conflictCaseId: review.conflictCaseId!, decision: "reopen", reviewerEmail: "publisher@example.com",
      reviewerRole: "publisher", reviewNote: "Keep unresolved for further research.", requestId: crypto.randomUUID(),
    });
    assert.equal((await database.prepare("SELECT status FROM knowledge_claim_conflict_cases WHERE id = ?").bind(review.conflictCaseId).first<{ status: string }>())?.status, "unresolved");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_claim_conflict_reviews").first<{ count: number }>())?.count, 2, "conflict review history is retained");
    await assert.rejects(
      () => reviewClaimRelationshipProposal(database.asD1(), {
        proposalId: proposal!.id, decision: "reject", reviewerEmail: "publisher@example.com",
        reviewerRole: "publisher", requestId: crypto.randomUUID(),
      }),
      (error: unknown) => error instanceof ClaimRelationshipReviewError && error.code === "proposal_already_reviewed",
      "reviewed relationship proposals cannot be decided twice",
    );
    await assert.rejects(
      () => reviewClaimConflictCase(database.asD1(), {
        conflictCaseId: review.conflictCaseId!, decision: "resolve", reviewerEmail: "publisher@example.com",
        reviewerRole: "publisher", requestId: crypto.randomUUID(),
      }),
      (error: unknown) => error instanceof ClaimConflictReviewError && error.code === "resolution_note_required",
      "conflict resolution requires an attributable explanation",
    );
  } finally {
    database.close();
  }
}

async function kc07eApprovalTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO story_clusters (id, title, evidence_status, publication_status)
        VALUES (707, 'Approval-gated status change', 'vendor_reported', 'draft');
      INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality)
        VALUES ('kc07e-claim', 'The approval-gated claim is disputed.', 'editorial_synthesis', 'general', 'disputed', 'critical');
      INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order)
        VALUES (707, 'kc07e-claim', 'primary', 'critical', 1);
    `);
    const result = await recalculateEvidenceScores(database.asD1(), {
      storyIds: [707], triggeringEvent: "conflict_created",
    });
    assert.equal(result.approvalRequests, 1, "high-impact score transitions create an approval request");
    assert.equal((await database.prepare("SELECT evidence_status FROM story_clusters WHERE id = 707").first<{ evidence_status: string }>())?.evidence_status, "vendor_reported",
      "high-impact status transitions do not mutate the story before approval");
    const approval = await database.prepare(`
      SELECT change_kind, target_type, previous_status, proposed_status, state, requested_by
      FROM evidence_change_approvals WHERE target_id = '707'
    `).first<{ change_kind: string; target_type: string; previous_status: string; proposed_status: string; state: string; requested_by: string }>();
    assert.deepEqual(approval ? { ...approval } : approval, {
      change_kind: "status_change", target_type: "story_cluster", previous_status: "vendor_reported",
      proposed_status: "disputed", state: "pending", requested_by: "system:recalculation",
    }, "approval queue records the proposed status and trigger owner");
  } finally {
    database.close();
  }
}

function kc08aKnowledgeMarkdownTests(): void {
  const parsed = parseKnowledgeMarkdown(`---
canonical_question: "How should a knowledge page be reviewed?"
section: ai-agents
knowledge_type: explainer
---

## Direct answer

Knowledge pages should keep material statements separate from supporting evidence.

## Detailed explanation

Each material statement should resolve to a reviewed canonical claim before publication.

## Evidence

- [TRACE policy](https://example.com/policy) — defines the review boundary.
- https://example.com/secondary

## Important limitations

Unresolved evidence must keep the page out of the public retrieval corpus.
`);
  assert.ok(!("error" in parsed), "knowledge Markdown parser accepts the documented frontmatter format");
  if ("error" in parsed) return;
  assert.equal(parsed.evidenceUrls.length, 2, "evidence Markdown yields both linked and bare URLs");
  assert.equal(parsed.evidenceUrls[0]?.sectionKey, "evidence");
  assert.equal(parsed.evidenceUrls[0]?.relationship, "supports");
  assert.equal(parsed.materialClaims.length, 3, "material claims are extracted from answer, explanation, and limitations");
  assert.ok(parsed.materialClaims.some((claim) => claim.relationship === "answers"));
  assert.ok(parsed.materialClaims.some((claim) => claim.relationship === "qualifies"));
  assert.ok(parsed.materialClaims.every((claim) => claim.locator.startsWith("markdown:")), "claims retain deterministic Markdown locators");
}

async function kc08bKnowledgeLinkSuggestionTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         direct_answer, document_json, policy_version, created_by)
      VALUES (
        'knowledge-kc08b', 'How should a reviewed claim be linked?', 'kc08b-hash',
        'ai-agents', 'explainer', 'A reviewed claim needs a source.',
        '{"body":"## Direct answer\\n\\nA reviewed claim needs a source.","materialClaims":[{"text":"A reviewed claim needs a source.","sectionKey":"direct_answer","relationship":"answers"}],"evidenceUrls":[{"url":"https://example.com/review","name":"Review source","description":"","sectionKey":"evidence","relationship":"supports","line":4}]}',
        'test-policy', 'test-editor'
      );
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
        VALUES (808, 'Review source', 'https://example.com/feed', 'A', 'A', 'primary', 'manual');
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode)
        VALUES ('source-doc-kc08b', 'https://example.com/review', 'kc08b-source-hash', 808, 'html', 'admitted', 'metadata_only');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
        VALUES ('canonical-kc08b', 'A reviewed claim needs a source.', 'editorial_synthesis', 'general', 'active', 'standard');
    `);
    const result = await suggestKnowledgeLinks(database.asD1(), { knowledgeDocumentId: "knowledge-kc08b" });
    assert.equal(result.algorithmVersion, KNOWLEDGE_LINK_SUGGESTION_VERSION);
    assert.equal(result.claimSuggestions[0]?.canonicalClaimId, "canonical-kc08b", "matching canonical claims are suggested");
    assert.equal(result.sourceSuggestions[0]?.sourceDocumentId, "source-doc-kc08b", "exact evidence URLs suggest existing source documents");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_document_claims").first<{ count: number }>())?.count, 0,
      "suggestions do not create reviewed knowledge mappings");
  } finally {
    database.close();
  }
}

async function kc08dKnowledgeDocumentMappingTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type, document_json, policy_version, created_by)
      VALUES (
        'knowledge-kc08d', 'How is a reviewed mapping saved?', 'kc08d-hash', 'ai-agents', 'explainer',
        '{"body":"## Direct answer\\n\\nA reviewed mapping needs an accepted assertion.","materialClaims":[{"text":"A reviewed mapping needs an accepted assertion.","sectionKey":"direct_answer","relationship":"answers"}]}',
        'test-policy', 'test-editor'
      );
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode)
        VALUES ('source-doc-kc08d', 'https://example.com/kc08d', 'kc08d-source-hash', 'html', 'admitted', 'metadata_only');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
        VALUES ('source-version-kc08d', 'source-doc-kc08d', 'kc08d-content-hash', 'https://example.com/kc08d', datetime('now'), 'captured');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
        VALUES ('canonical-kc08d', 'A reviewed mapping needs an accepted assertion.', 'editorial_synthesis', 'general', 'active', 'standard');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, assertion_text, relationship,
         source_role, directness, evidence_treatment, admission_state, freshness_state,
         extraction_method, extraction_version, confidence, reviewer_state, reviewed_by, reviewed_at)
        VALUES ('assertion-kc08d', 'canonical-kc08d', 'source-version-kc08d',
                'A reviewed mapping needs an accepted assertion.', 'supports', 'evidence', 'direct',
                'factual_support', 'admitted', 'current', 'test', 'test-v1', 0.9,
                'accepted', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_sources
        (id, knowledge_document_id, source_reference, claim_reference, source_kind,
         source_role, admission_state, freshness_state, independent_evidence_weight, relationship)
        VALUES ('legacy-source-kc08e', 'knowledge-kc08d', 'https://example.com/kc08d',
                'source:kc08d', 'external_independent', 'evidence', 'admitted', 'current', 1, 'supports');
    `);
    const mapped = await mapKnowledgeDocumentClaim(database.asD1(), {
      knowledgeDocumentId: "knowledge-kc08d", sectionKey: "direct_answer",
      canonicalClaimId: "canonical-kc08d", claimRelationship: "answers",
      assertions: [{ claimAssertionId: "assertion-kc08d", relationship: "supports" }],
      reviewerEmail: "publisher@example.com", requestId: "kc08d-request",
      legacySourceLinkId: "legacy-source-kc08e",
    });
    assert.equal(mapped.assertionsMapped, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_document_claims").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_document_claim_assertions").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'map_knowledge_document_claim'").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT state FROM knowledge_source_link_migration_audit WHERE legacy_source_link_id = 'legacy-source-kc08e'").first<{ state: string }>())?.state, "migrated",
      "reviewed mapping closes the legacy source audit record");

    database.sqlite.exec(`
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, assertion_text, relationship,
         source_role, directness, evidence_treatment, admission_state, freshness_state,
         extraction_method, extraction_version, confidence, reviewer_state, reviewed_by, reviewed_at)
        VALUES ('assertion-kc08d-internal', 'canonical-kc08d', 'source-version-kc08d',
                'Internal synthesis only.', 'contextualises', 'internal_synthesis', 'unknown',
                'internal_synthesis', 'admitted', 'current', 'test', 'test-v1', 0.9,
                'accepted', 'publisher@example.com', datetime('now'));
    `);
    await assert.rejects(
      () => mapKnowledgeDocumentClaim(database.asD1(), {
        knowledgeDocumentId: "knowledge-kc08d", sectionKey: "direct_answer",
        canonicalClaimId: "canonical-kc08d", claimRelationship: "answers",
        assertions: [{ claimAssertionId: "assertion-kc08d-internal", relationship: "supports" }],
        reviewerEmail: "publisher@example.com", requestId: "kc08d-request-2",
      }),
      (error: unknown) => error instanceof KnowledgeDocumentMappingError && error.code === "assertion_not_eligible",
      "internal TRACE synthesis cannot be mapped as external evidence",
    );
  } finally {
    database.close();
  }
}

async function kc08fKnowledgeApprovalGateTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         document_json, policy_version, created_by)
      VALUES ('knowledge-kc08f', 'When is public knowledge eligible?', 'kc08f-hash',
              'ai-agents', 'explainer',
              '{"materialClaims":[{"text":"A public answer needs reviewed evidence.","sectionKey":"direct_answer","relationship":"answers"}],"body":""}',
              'test-policy', 'test-editor');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('canonical-kc08f', 'A public answer needs reviewed evidence.', 'specification_defined', 'general', 'active', 'standard');
    `);
    const blocked = await evaluateKnowledgeApproval(database.asD1(), "knowledge-kc08f");
    assert.equal(blocked.eligible, false, "unmapped material knowledge cannot pass the public gate");
    assert.deepEqual(blocked.unresolvedSections, ["direct_answer"]);

    database.sqlite.exec(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode)
      VALUES ('source-doc-kc08f', 'https://example.com/kc08f', 'kc08f-source-hash', 'html', 'admitted', 'metadata_only');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('source-version-kc08f', 'source-doc-kc08f', 'kc08f-content-hash', 'https://example.com/kc08f', datetime('now'), 'captured');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, assertion_text, relationship,
         source_role, directness, evidence_treatment, admission_state, freshness_state,
         extraction_method, extraction_version, confidence, reviewer_state, reviewed_by, reviewed_at)
      VALUES ('assertion-kc08f', 'canonical-kc08f', 'source-version-kc08f',
              'A public answer needs reviewed evidence.', 'supports', 'evidence', 'direct',
              'factual_support', 'admitted', 'current', 'test', 'test-v1', 0.9,
              'accepted', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_claims
        (knowledge_document_id, canonical_claim_id, section_key, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08f', 'canonical-kc08f', 'direct_answer', 'answers', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_claim_assertions
        (knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08f', 'direct_answer', 'canonical-kc08f', 'assertion-kc08f', 'supports', 'publisher@example.com', datetime('now'));
    `);
    const eligible = await evaluateKnowledgeApproval(database.asD1(), "knowledge-kc08f");
    assert.equal(eligible.eligible, true, "a reviewed current external assertion satisfies the public gate");

    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         document_json, policy_version, created_by)
      VALUES ('knowledge-kc08f-inference', 'What is this inference?', 'kc08f-inference-hash',
              'ai-agents', 'explainer',
              '{"materialClaims":[{"text":"This is an explicitly labelled editorial inference.","sectionKey":"direct_answer","relationship":"answers"}],"body":""}',
              'test-policy', 'test-editor');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('canonical-kc08f-inference', 'This is an explicitly labelled editorial inference.', 'editorial_synthesis', 'general', 'active', 'standard');
      INSERT INTO knowledge_document_claims
        (knowledge_document_id, canonical_claim_id, section_key, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08f-inference', 'canonical-kc08f-inference', 'direct_answer', 'inference_basis', 'publisher@example.com', datetime('now'));
    `);
    const inference = await evaluateKnowledgeApproval(database.asD1(), "knowledge-kc08f-inference");
    assert.equal(inference.eligible, true, "explicitly reviewed editorial synthesis can pass as inference basis");
    assert.deepEqual(inference.inferenceSections, ["direct_answer"]);
  } finally {
    database.close();
  }
}

async function kc08gKnowledgeEvidenceResolutionTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         status, visibility, evidence_status, direct_answer, document_json,
         policy_version, approved_by, approved_at, created_by)
      VALUES ('knowledge-kc08g', 'How does inherited evidence resolve?', 'kc08g-hash',
              'ai-agents', 'explainer', 'approved', 'public_knowledge',
              'strongly_supported', 'The mapped source is available.',
              '{"materialClaims":[{"text":"The mapped source is available.","sectionKey":"direct_answer","relationship":"answers"}],"body":""}',
              'test-policy', 'publisher@example.com', datetime('now'), 'test-editor');
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode)
      VALUES ('source-doc-kc08g', 'https://example.com/kc08g', 'kc08g-source-hash', 'html', 'admitted', 'metadata_only');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, published_at, extraction_status)
      VALUES ('source-version-kc08g', 'source-doc-kc08g', 'kc08g-content-hash', 'https://example.com/kc08g', datetime('now'), datetime('now'), 'extracted');
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('source-chunk-kc08g', 'source-version-kc08g', 0, 'The mapped source is available.', 'kc08g-chunk-hash', 'html:12', 'html:13');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('canonical-kc08g', 'The mapped source is available.', 'specification_defined', 'general', 'active', 'standard');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id,
         start_locator, end_locator, assertion_text, relationship, source_role,
         directness, evidence_treatment, admission_state, freshness_state,
         extraction_method, extraction_version, confidence, reviewer_state,
         reviewed_by, reviewed_at)
      VALUES ('assertion-kc08g', 'canonical-kc08g', 'source-version-kc08g', 'source-chunk-kc08g',
              'html:12', 'html:13', 'The mapped source is available.', 'supports', 'evidence',
              'direct', 'factual_support', 'admitted', 'current', 'test', 'test-v1', 0.9,
              'accepted', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_claims
        (knowledge_document_id, canonical_claim_id, section_key, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08g', 'canonical-kc08g', 'direct_answer', 'answers', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_claim_assertions
        (knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08g', 'direct_answer', 'canonical-kc08g', 'assertion-kc08g', 'supports', 'publisher@example.com', datetime('now'));
    `);
    const resolved = await retrieveApprovedKnowledge(database.asD1(), "mapped source", 4);
    const internal = resolved.find((item) => item.sourceId === "knowledge:knowledge-kc08g");
    const assertion = resolved.find((item) => item.assertionId === "assertion-kc08g");
    assert.equal(internal?.externalEvidenceResolved, true, "knowledge marks its inherited bundle resolved");
    assert.equal(assertion?.sourceUrl, "https://example.com/kc08g");
    assert.equal(assertion?.sourceChunkId, "source-chunk-kc08g");
    assert.equal(assertion?.startLocator, "html:12");
    assert.equal(assertion?.endLocator, "html:13");
    assert.equal(assertion?.sourceRole, "evidence");

    database.sqlite.exec("UPDATE claim_assertions SET source_chunk_id = NULL WHERE id = 'assertion-kc08g'");
    const unresolved = await retrieveApprovedKnowledge(database.asD1(), "mapped source", 4);
    assert.equal(unresolved.find((item) => item.sourceId === "knowledge:knowledge-kc08g")?.externalEvidenceResolved, false,
      "missing chunk/locator fails inherited evidence resolution");
    assert.equal(unresolved.some((item) => item.assertionId === "assertion-kc08g"), false,
      "unresolved assertions are not supplied as external evidence");
  } finally {
    database.close();
  }
}

async function kc08hKnowledgeChangeProposalTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.exec(`
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         status, visibility, evidence_status, direct_answer, document_json,
         policy_version, approved_by, approved_at, created_by)
      VALUES ('knowledge-kc08h', 'What changed in the linked evidence?', 'kc08h-hash',
              'ai-agents', 'explainer', 'approved', 'public_knowledge',
              'strongly_supported', 'The linked evidence is current.',
              '{"materialClaims":[{"text":"The linked evidence is current.","sectionKey":"direct_answer","relationship":"answers"}],"body":""}',
              'test-policy', 'publisher@example.com', datetime('now'), 'test-editor');
      INSERT INTO knowledge_documents
        (id, canonical_question, canonical_hash, section_slug, knowledge_type,
         status, visibility, evidence_status, direct_answer, document_json,
         review_after, policy_version, approved_by, approved_at, created_by)
      VALUES ('knowledge-kc08h-expiry', 'What has expired?', 'kc08h-expiry-hash',
              'ai-agents', 'explainer', 'approved', 'public_knowledge',
              'strongly_supported', 'This entry is due for review.',
              '{"materialClaims":[],"body":""}', datetime('now', '-1 day'),
              'test-policy', 'publisher@example.com', datetime('now'), 'test-editor');
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, admission_state, copyright_storage_mode, current_version_id)
      VALUES ('source-doc-kc08h', 'https://example.com/kc08h', 'kc08h-source-hash', 'html', 'admitted', 'metadata_only', 'source-version-kc08h');
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('source-version-kc08h', 'source-doc-kc08h', 'kc08h-content-hash', 'https://example.com/kc08h', datetime('now'), 'extracted');
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('canonical-kc08h', 'The linked evidence is current.', 'specification_defined', 'general', 'active', 'standard'),
             ('canonical-kc08h-other', 'The linked evidence is not current.', 'specification_defined', 'general', 'active', 'standard');
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, assertion_text, relationship,
         source_role, directness, evidence_treatment, admission_state, freshness_state,
         extraction_method, extraction_version, confidence, reviewer_state, reviewed_by, reviewed_at)
      VALUES ('assertion-kc08h', 'canonical-kc08h', 'source-version-kc08h',
              'The linked evidence is current.', 'supports', 'evidence', 'direct',
              'factual_support', 'admitted', 'current', 'test', 'test-v1', 0.9,
              'accepted', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_claims
        (knowledge_document_id, canonical_claim_id, section_key, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08h', 'canonical-kc08h', 'direct_answer', 'answers', 'publisher@example.com', datetime('now'));
      INSERT INTO knowledge_document_claim_assertions
        (knowledge_document_id, section_key, canonical_claim_id, claim_assertion_id, relationship, reviewed_by, reviewed_at)
      VALUES ('knowledge-kc08h', 'direct_answer', 'canonical-kc08h', 'assertion-kc08h', 'supports', 'publisher@example.com', datetime('now'));
    `);

    const changed = await triggerKnowledgeReview(database.asD1(), {
      kind: "evidence_changed", claimIds: ["canonical-kc08h"], eventId: "kc08h-evidence-event",
    });
    assert.equal(changed.proposalsCreated, 1);
    assert.equal(changed.affectedDocumentIds.includes("knowledge-kc08h"), true);
    const repeated = await triggerKnowledgeReview(database.asD1(), {
      kind: "evidence_changed", claimIds: ["canonical-kc08h"], eventId: "kc08h-evidence-event",
    });
    assert.equal(repeated.proposalsCreated, 0, "the same evidence event is idempotent");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM knowledge_change_proposals WHERE knowledge_document_id = 'knowledge-kc08h'").first<{ count: number }>())?.count, 1);
    assert.equal((await retrieveApprovedKnowledge(database.asD1(), "linked evidence", 4)).length, 0,
      "open review proposals exclude the knowledge page from Ask TRACE retrieval");

    database.sqlite.exec(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('source-version-kc08h-new', 'source-doc-kc08h', 'kc08h-content-hash-new', 'https://example.com/kc08h', datetime('now'), 'extracted');
      UPDATE source_documents SET current_version_id = 'source-version-kc08h-new' WHERE id = 'source-doc-kc08h';
    `);
    const sourceChanged = await triggerKnowledgeReview(database.asD1(), {
      kind: "evidence_changed", sourceDocumentVersionId: "source-version-kc08h-new", eventId: "source-version-kc08h-new",
    });
    assert.equal(sourceChanged.proposalsCreated, 1, "a newer source version creates a review proposal");

    database.sqlite.exec(`
      INSERT INTO knowledge_claim_conflict_cases
        (id, source_claim_id, target_claim_id, conflict_kind, explanation, confidence, status, idempotency_key)
      VALUES ('conflict-kc08h', 'canonical-kc08h', 'canonical-kc08h-other', 'contradiction',
              'The linked evidence conflicts.', 0.9, 'unresolved', 'kc08h-conflict-key');
    `);
    const conflict = await triggerKnowledgeReview(database.asD1(), {
      kind: "conflict_created", claimIds: ["canonical-kc08h"], eventId: "conflict-kc08h",
    });
    assert.equal(conflict.proposalsCreated, 1, "unresolved conflicts create a separate review proposal");

    const correction = await triggerKnowledgeReview(database.asD1(), {
      kind: "correction_recorded", claimIds: ["canonical-kc08h"], eventId: "correction-kc08h",
    });
    assert.equal(correction.proposalsCreated, 1);
    const supersession = await triggerKnowledgeReview(database.asD1(), {
      kind: "supersession_recorded", claimIds: ["canonical-kc08h"], eventId: "supersession-kc08h",
    });
    assert.equal(supersession.proposalsCreated, 1);

    const expiry = await triggerKnowledgeReview(database.asD1(), {
      kind: "expiry_reached", now: new Date().toISOString(), eventId: "scheduled-expiry",
    });
    assert.equal(expiry.proposalsCreated, 1, "due knowledge creates a freshness review proposal");
    assert.equal((await database.prepare("SELECT proposal_type FROM knowledge_change_proposals WHERE knowledge_document_id = 'knowledge-kc08h-expiry'").first<{ proposal_type: string }>())?.proposal_type, "freshness_review");
  } finally {
    database.close();
  }
}

function kc09EmbeddingPolicyTests(): void {
  assert.equal(KC09_EMBEDDING_POLICY.embeddingProvider, "workers_ai");
  assert.equal(KC09_EMBEDDING_POLICY.embeddingModel, "@cf/baai/bge-m3");
  assert.equal(KC09_EMBEDDING_POLICY.dimensions, 1024);
  assert.equal(KC09_EMBEDDING_POLICY.metric, "cosine");
  assert.equal(KC09_EMBEDDING_POLICY.languagePolicy, "multilingual_original_language");
  assert.equal(KC09_EMBEDDING_POLICY.sourceChunkPolicy.embeddingInputMaxChars, 2_000);
  assert.equal(KC09_EMBEDDING_POLICY.rollout.productionIndexEnabled, false);
  assert.equal(KC09_EMBEDDING_POLICY.metadataIndexes.length, 5);
  assert.equal(isAllowedKnowledgeVectorMetadataField("publication_state"), true);
  assert.equal(isAllowedKnowledgeVectorMetadataField("source_url"), false, "Vector metadata must not carry source URLs.");

  const preview = embeddingRolloutFor("preview");
  assert.equal(preview.enabled, true);
  if (preview.enabled) {
    assert.equal(preview.indexName, "trace-manifest-knowledge-preview-bge-m3-v1");
    assert.equal(preview.namespace, "kc09-bge-m3-v1");
  }
  assert.deepEqual(embeddingRolloutFor("production"), { enabled: false, reason: "preview_only" },
    "KC-09A must not expose a production vector target.");
  assert.deepEqual(embeddingRolloutFor("development"), { enabled: false, reason: "development_uses_no_remote_index" });
}

async function kc09dEmbeddingIndexTests(): Promise<void> {
  assert.equal(normalizeEmbeddingText("  bounded\nsource\ttext  "), "bounded source text");
  assert.equal(estimateEmbeddingTokens("1234"), 1);
  const database = new SQLiteD1();
  let upserted: KnowledgeEmbeddingVector[] = [];
  try {
    await database.prepare(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc09d-doc', 'https://example.test/kc09d', 'kc09d-url-hash', 'html', 'short_excerpt', 'admitted')
    `).run();
    await database.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, source_language)
      VALUES ('kc09d-version', 'kc09d-doc', 'kc09d-content-hash', 'https://example.test/kc09d', datetime('now'), 'extracted', 'en')
    `).run();
    await database.prepare(`
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('kc09d-chunk', 'kc09d-version', 0, 'A bounded multilingual retrieval chunk.', 'kc09d-chunk-hash', 'p1:1', 'p1:2')
    `).run();
    const ai = {
      async run(_model: string, input: { text: string[] }) {
        return { data: input.text.map(() => new Array(1024).fill(0.01)) };
      },
    };
    const index = {
      async upsert(vectors: KnowledgeEmbeddingVector[]) {
        upserted = vectors;
        return { ids: vectors.map(vector => vector.id), count: vectors.length };
      },
      async getByIds(ids: string[]) {
        return ids.map(id => ({ id }));
      },
    };
    const environment = {
      DB: database.asD1(), AI: ai, KNOWLEDGE_VECTOR_INDEX: index, TRACE_ENVIRONMENT: "preview",
    };
    const dryRun = await indexKnowledgeEmbeddings(environment, { limit: 5, dryRun: true });
    assert.equal(dryRun.selected, 1, "only the admitted locator-backed chunk is selected");
    assert.equal(dryRun.inputTokens > 0, true);
    const result = await indexKnowledgeEmbeddings(environment, { limit: 5 });
    assert.equal(result.state, "completed");
    assert.equal(result.indexed, 1);
    assert.equal(upserted[0]?.id, "source_chunk:kc09d-chunk");
    assert.equal(upserted[0]?.namespace, "kc09-bge-m3-v1");
    assert.equal(upserted[0]?.metadata.embedding_version, "kc09-bge-m3-v1");
    assert.equal((await database.prepare("SELECT state FROM knowledge_embedding_index_items WHERE record_id = 'kc09d-chunk'").first<{ state: string }>())?.state, "indexed");
    assert.equal((await database.prepare("SELECT embedding_state FROM source_chunks WHERE id = 'kc09d-chunk'").first<{ embedding_state: string }>())?.embedding_state, "indexed");
  } finally {
    database.close();
  }
}

async function kc09eVectorResolutionTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    await database.prepare(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc09e-doc', 'https://example.test/kc09e', 'kc09e-url-hash', 'html', 'short_excerpt', 'admitted')
    `).run();
    await database.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, source_language)
      VALUES ('kc09e-version', 'kc09e-doc', 'kc09e-content-hash', 'https://example.test/kc09e', datetime('now'), 'extracted', 'fr')
    `).run();
    await database.prepare(`
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator,
         embedding_state, embedding_model, embedding_version)
      VALUES ('kc09e-chunk', 'kc09e-version', 0, 'A D1-authoritative source chunk.', 'kc09e-chunk-hash', 'p1:1', 'p1:2',
         'indexed', ?, ?)
    `).bind(KC09_EMBEDDING_POLICY.embeddingModel, KC09_EMBEDDING_POLICY.policyVersion).run();
    await database.prepare(`
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('kc09e-claim', 'The source documents a bounded retrieval policy.', 'specification_defined', 'general', 'active', 'standard')
    `).run();
    await database.prepare(`
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
         assertion_text, relationship, source_role, directness, evidence_treatment, admission_state,
         freshness_state, extraction_method, extraction_version, confidence, reviewer_state, reviewed_by, reviewed_at)
      VALUES ('kc09e-assertion', 'kc09e-claim', 'kc09e-version', 'kc09e-chunk', 'p1:1', 'p1:2',
         'The source documents a bounded retrieval policy.', 'supports', 'evidence', 'direct', 'factual_support',
         'admitted', 'current', 'test', 'kc09e-test-v1', 0.95, 'accepted', 'reviewer@example.test', datetime('now'))
    `).run();
    await database.prepare(`
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator,
         embedding_state, embedding_model, embedding_version)
      VALUES ('kc09e-chunk-old', 'kc09e-version', 1, 'An old-policy source chunk.', 'kc09e-old-chunk-hash', 'p2:1', 'p2:2',
         'indexed', ?, ?)
    `).bind(KC09_EMBEDDING_POLICY.embeddingModel, KC09_EMBEDDING_POLICY.policyVersion).run();

    const metadata = {
      record_type: "source_chunk",
      language: "fr",
      admission_state: "admitted",
      publication_state: "not_applicable",
      embedding_version: KC09_EMBEDDING_POLICY.policyVersion,
    };
    const resolved = await resolveKnowledgeVectorMatches(database.asD1(), [
      { id: "source_chunk:kc09e-chunk", score: 0.91, metadata },
      { id: "canonical_claim:kc09e-claim", score: 0.905, metadata: { ...metadata, record_type: "canonical_claim" } },
      { id: "source_chunk:kc09e-chunk", score: 0.90, metadata },
      { id: "source_chunk:missing", score: 0.89, metadata: { ...metadata, record_type: "source_chunk" } },
      { id: "source_chunk:kc09e-chunk-old", score: 0.88, metadata: { ...metadata, embedding_version: "old-policy" } },
      { id: "not-a-vector-id", score: 0.87, metadata },
    ]);
    assert.equal(resolved.accepted.length, 2, "only D1-eligible source and claim matches are accepted");
    const acceptedSource = resolved.accepted.find(item => item.recordType === "source_chunk");
    const acceptedClaim = resolved.accepted.find(item => item.recordType === "canonical_claim");
    assert.equal(acceptedSource?.language, "fr");
    assert.deepEqual(acceptedSource?.provenance.sourceDocumentIds, ["kc09e-doc"]);
    assert.equal(acceptedClaim?.language, "fr", "canonical claim inherits the reviewed source language");
    assert.deepEqual(acceptedClaim?.provenance.assertionIds, ["kc09e-assertion"]);
    assert.ok(resolved.rejected.some(item => item.reason === "duplicate_candidate"));
    assert.ok(resolved.rejected.some(item => item.reason === "record_not_found"));
    assert.ok(resolved.rejected.some(item => item.reason === "embedding_version_mismatch"));
    assert.ok(resolved.rejected.some(item => item.reason === "invalid_vector_id"));

    await database.prepare("UPDATE source_documents SET admission_state = 'quarantined' WHERE id = 'kc09e-doc'").run();
    const quarantined = await resolveKnowledgeVectorMatches(database.asD1(), [
      { id: "source_chunk:kc09e-chunk", score: 1, metadata },
      { id: "canonical_claim:kc09e-claim", score: 0.99, metadata: { ...metadata, record_type: "canonical_claim" } },
    ]);
    assert.equal(quarantined.accepted.length, 0, "D1 admission changes invalidate old vector matches");
    assert.equal(quarantined.rejected[0]?.reason, "source_not_eligible");
    assert.equal(quarantined.rejected[1]?.reason, "claim_not_eligible");
  } finally {
    database.close();
  }
}

async function kc09iCitationResolutionTests(): Promise<void> {
  const database = new SQLiteD1();
  const validCitation: KnowledgeCitationInput = {
    assertionId: "kc09i-assertion",
    sourceDocumentVersionId: "kc09i-version",
    sourceChunkId: "kc09i-chunk",
    startLocator: "p1:1",
    endLocator: "p1:2",
  };
  try {
    await database.prepare(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc09i-doc', 'https://example.test/kc09i', 'kc09i-url-hash', 'html', 'short_excerpt', 'admitted')
    `).run();
    await database.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, source_language)
      VALUES ('kc09i-version', 'kc09i-doc', 'kc09i-content-hash', 'https://example.test/kc09i', datetime('now'), 'extracted', 'en')
    `).run();
    await database.prepare(`
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('kc09i-chunk', 'kc09i-version', 0, 'A reviewed citation chunk.', 'kc09i-chunk-hash', 'p1:1', 'p1:2')
    `).run();
    await database.prepare(`
      INSERT INTO provenance_groups (id, origin_type, explanation, determined_by, determination_method)
      VALUES ('kc09i-group', 'primary', 'A reviewed primary source.', 'kc09i-test', 'editor_review')
    `).run();
    await database.prepare(`
      INSERT INTO source_provenance_memberships (id, source_document_id, provenance_group_id, relationship, confidence)
      VALUES ('kc09i-membership', 'kc09i-doc', 'kc09i-group', 'original', 1)
    `).run();
    await database.prepare(`
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('kc09i-claim', 'The reviewed source supports citation resolution.', 'specification_defined', 'general', 'active', 'standard')
    `).run();
    await database.prepare(`
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id, start_locator, end_locator,
         assertion_text, relationship, source_role, directness, evidence_treatment, admission_state,
         freshness_state, provenance_group_id, extraction_method, extraction_version, confidence,
         reviewer_state, reviewed_by, reviewed_at)
      VALUES ('kc09i-assertion', 'kc09i-claim', 'kc09i-version', 'kc09i-chunk', 'p1:1', 'p1:2',
         'The reviewed source supports citation resolution.', 'supports', 'evidence', 'direct', 'factual_support',
         'admitted', 'current', 'kc09i-group', 'test', 'kc09i-test-v1', 0.95,
         'accepted', 'reviewer@example.test', datetime('now'))
    `).run();

    const resolved = await resolveKnowledgeCitations(database.asD1(), [validCitation]);
    assert.equal(resolved.rejected.length, 0, "reviewed citation resolves from D1");
    assert.equal(resolved.resolved[0]?.canonicalClaimId, "kc09i-claim");
    assert.deepEqual(resolved.resolved[0]?.provenanceGroupIds, ["kc09i-group"]);
    assert.equal(resolved.resolved[0]?.chunkText, "A reviewed citation chunk.");

    const wrongVersion = await resolveKnowledgeCitations(database.asD1(), [{ ...validCitation, sourceDocumentVersionId: "wrong-version" }]);
    assert.equal(wrongVersion.rejected[0]?.reason, "source_version_mismatch");
    const wrongChunk = await resolveKnowledgeCitations(database.asD1(), [{ ...validCitation, sourceChunkId: "wrong-chunk" }]);
    assert.equal(wrongChunk.rejected[0]?.reason, "source_chunk_mismatch");
    const wrongLocator = await resolveKnowledgeCitations(database.asD1(), [{ ...validCitation, endLocator: "p1:999" }]);
    assert.equal(wrongLocator.rejected[0]?.reason, "locator_mismatch");
    const malformed = await resolveKnowledgeCitations(database.asD1(), [{ ...validCitation, startLocator: " p1:1" }]);
    assert.equal(malformed.rejected[0]?.reason, "invalid_citation");
    const duplicate = await resolveKnowledgeCitations(database.asD1(), [validCitation, validCitation]);
    assert.equal(duplicate.resolved.length, 1);
    assert.equal(duplicate.rejected[0]?.reason, "duplicate_citation");

    const linked = await resolveAndValidateCitationReferences(database.asD1(), [validCitation], [validCitation.assertionId]);
    assert.equal(linked.passed, true, "answer assertion references require a D1-resolved citation");
    const missingReference = await resolveAndValidateCitationReferences(database.asD1(), [validCitation], ["not-resolved"]);
    assert.equal(missingReference.passed, false);

    await database.prepare("UPDATE source_documents SET admission_state = 'quarantined' WHERE id = 'kc09i-doc'").run();
    const quarantined = await resolveKnowledgeCitations(database.asD1(), [validCitation]);
    assert.equal(quarantined.rejected[0]?.reason, "source_not_admitted");
    await database.prepare("UPDATE source_documents SET admission_state = 'admitted'").run();
    await database.prepare("UPDATE claim_assertions SET freshness_state = 'stale' WHERE id = 'kc09i-assertion'").run();
    const stale = await resolveKnowledgeCitations(database.asD1(), [validCitation]);
    assert.equal(stale.rejected[0]?.reason, "stale_or_disputed");
  } finally {
    database.close();
  }
}

function kc09fPositionGroupingTests(): void {
  const evidence: KnowledgePositionEvidence[] = [
    {
      id: "match-a", recordType: "canonical_claim", recordId: "claim-a", claimId: "claim-a",
      statement: "Model X supports image inputs.", score: 0.92, provenanceGroupIds: ["group-a"],
      relationships: [{ targetClaimId: "claim-b", relationship: "supports" }],
    },
    {
      id: "match-b", recordType: "canonical_claim", recordId: "claim-b", claimId: "claim-b",
      statement: "Model X accepts image inputs.", score: 0.87, provenanceGroupIds: ["group-b"],
      relationships: [{ targetClaimId: "claim-c", relationship: "contradicts" }],
    },
    {
      id: "match-c", recordType: "canonical_claim", recordId: "claim-c", claimId: "claim-c",
      statement: "Model X does not accept image inputs.", score: 0.81, provenanceGroupIds: ["group-c"],
    },
    {
      id: "match-a", recordType: "canonical_claim", recordId: "claim-a", claimId: "claim-a",
      statement: "Model X supports image inputs.", score: 0.10,
    },
  ];
  const grouped = groupKnowledgePositions(evidence);
  assert.equal(grouped.positions.length, 2, "supporting claims form one compatible position");
  assert.equal(grouped.positions[0]?.evidenceIds.length, 2);
  assert.deepEqual(grouped.positions[0]?.provenanceGroupIds, ["group-a", "group-b"]);
  assert.equal(grouped.competitions.length, 1, "reviewed contradiction remains a competing position pair");
  assert.deepEqual(grouped.competitions[0]?.relationships, ["contradicts"]);
  assert.deepEqual(grouped.ignoredEvidenceIds, ["match-a"]);
}

async function kc09fD1RelationshipGroupingTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    await database.prepare(`
      INSERT INTO source_documents
        (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
      VALUES ('kc09f-doc', 'https://example.test/kc09f', 'kc09f-url-hash', 'html', 'short_excerpt', 'admitted')
    `).run();
    await database.prepare(`
      INSERT INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status)
      VALUES ('kc09f-version', 'kc09f-doc', 'kc09f-content-hash', 'https://example.test/kc09f', datetime('now'), 'extracted')
    `).run();
    await database.prepare(`
      INSERT INTO source_chunks
        (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('kc09f-chunk', 'kc09f-version', 0, 'Reviewed relationship evidence.', 'kc09f-chunk-hash', 'p1:1', 'p1:2')
    `).run();
    await database.prepare(`
      INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain)
      VALUES ('kc09f-claim-a', 'The system supports images.', 'specification_defined', 'general'),
             ('kc09f-claim-b', 'The system accepts images.', 'specification_defined', 'general')
    `).run();
    await database.prepare(`
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id, assertion_text,
         relationship, source_role, directness, evidence_treatment, admission_state,
         freshness_state, extraction_method, reviewer_state, reviewed_by, reviewed_at)
      VALUES ('kc09f-assertion', 'kc09f-claim-a', 'kc09f-version', 'kc09f-chunk', 'The system supports images.',
         'supports', 'evidence', 'direct', 'factual_support', 'admitted', 'current', 'test', 'accepted', 'reviewer@example.test', datetime('now'))
    `).run();
    await database.prepare(`
      INSERT INTO knowledge_claim_relationship_proposals
        (id, source_assertion_id, source_canonical_claim_id, target_canonical_claim_id,
         relationship, confidence, rationale, determination_method, algorithm_version,
         state, reviewed_by, reviewed_at, idempotency_key)
      VALUES ('kc09f-proposal', 'kc09f-assertion', 'kc09f-claim-a', 'kc09f-claim-b',
         'supports', 0.9, 'Reviewed support relation.', 'rule_proposal', 'kc09f-test-v1',
         'accepted', 'reviewer@example.test', datetime('now'), 'kc09f-idempotency')
    `).run();
    const base = { language: "en", admissionState: "admitted", publicationState: "not_applicable", provenance: { sourceDocumentIds: ["kc09f-doc"], sourceDocumentVersionIds: ["kc09f-version"], sourceChunkIds: ["kc09f-chunk"], provenanceGroupIds: [], assertionIds: ["kc09f-assertion"] }, metadata: {} };
    const grouping = await groupResolvedKnowledgePositions(database.asD1(), [
      { ...base, id: "canonical_claim:kc09f-claim-a", score: 0.9, recordType: "canonical_claim", recordId: "kc09f-claim-a" },
      { ...base, id: "canonical_claim:kc09f-claim-b", score: 0.8, recordType: "canonical_claim", recordId: "kc09f-claim-b" },
    ]);
    assert.equal(grouping.positions.length, 1, "accepted D1 support relationships merge claim positions");
    assert.deepEqual(grouping.positions[0]?.claimIds, ["kc09f-claim-a", "kc09f-claim-b"]);
  } finally {
    database.close();
  }
}

function kc09gConclusionPolicyTests(): void {
  const strong: KnowledgePositionAssessment = {
    positionId: "position-strong", evidenceCount: 3, currentEvidenceCount: 3,
    directEvidenceCount: 2, independentProvenanceGroupCount: 2, strongEvidenceCount: 2,
  };
  const moderate: KnowledgePositionAssessment = {
    positionId: "position-moderate", evidenceCount: 2, currentEvidenceCount: 2,
    directEvidenceCount: 1, independentProvenanceGroupCount: 1, strongEvidenceCount: 0,
  };
  const supported = selectKnowledgeConclusion({ evidenceMode: "knowledge", positions: [strong] });
  assert.equal(supported.conclusionMode, "supported");
  assert.equal(supported.confidence, "high");
  assert.equal(supported.leanPositionId, "position-strong");

  const qualified = selectKnowledgeConclusion({
    evidenceMode: "researched", positions: [strong, moderate],
    competitions: [{ leftPositionId: strong.positionId, rightPositionId: moderate.positionId }],
  });
  assert.equal(qualified.conclusionMode, "qualified_lean");
  assert.equal(qualified.leanPositionId, "position-strong");
  assert.ok(qualified.whatCouldChange.length > 0);

  const multiple = selectKnowledgeConclusion({
    evidenceMode: "knowledge", positions: [strong, { ...strong, positionId: "position-peer" }],
    competitions: [{ leftPositionId: strong.positionId, rightPositionId: "position-peer" }],
  });
  assert.equal(multiple.conclusionMode, "multiple_positions");
  assert.equal(multiple.leanPositionId, null);

  const insufficient = selectKnowledgeConclusion({ evidenceMode: "knowledge", positions: [moderate] });
  assert.equal(insufficient.conclusionMode, "insufficient_evidence");
  assert.equal(insufficient.confidence, "insufficient_evidence");
  assert.equal(selectKnowledgeConclusion({ evidenceMode: "insufficient", positions: [strong] }).conclusionMode, "insufficient_evidence");
}

function kc09jRefusalDisagreementTests(): void {
  const refusal = {
    answer: "TRACE cannot answer this reliably from the eligible evidence.",
    evidenceMode: "refused", conclusionMode: "insufficient_evidence",
    directAnswer: "TRACE cannot answer this reliably.", lean: null,
    whyLean: "No defensible position was selected.", positions: [], sourceSummaries: [],
    confidence: "insufficient_evidence", confidenceScore: null,
    confidenceReasons: ["The request is outside the permitted answer scope."],
    limitations: ["No eligible conclusion was produced."], unresolvedQuestions: ["A narrower question is required."],
    freshestEvidenceAt: null, keyPoints: [], claims: [], citations: [], citedSourceIds: [], citedClaimIds: [],
    confirmedFacts: [], reportedClaims: [], disagreements: [], caveats: ["The request was refused."],
    whatCouldChange: "A bounded, in-scope question with reviewed evidence.", proposedConfidence: "insufficient_evidence",
  };
  const refusalResult = validateAnswerOutput(refusal, [], 300, {
    evidenceMode: "refused", conclusionMode: "insufficient_evidence", confidence: "insufficient_evidence", leanPositionId: null,
  });
  assert.equal(refusalResult.passed, true, "a refusal may safely contain no factual claims or citations");

  const disagreementEvidence: EvidenceExcerpt[] = [
    { ...evidence[0], sourceId: "disagreement-source-a", claimId: "disagreement-claim-a", assertionId: "disagreement-assertion-a", relationship: "supports" },
    { ...evidence[1], sourceId: "disagreement-source-b", claimId: "disagreement-claim-b", assertionId: "disagreement-assertion-b", relationship: "contradicts", isDisputed: true },
  ];
  const disagreementDraft = {
    answer: "The supplied sources support competing positions, so TRACE will not collapse them into one claim.",
    evidenceMode: "researched", conclusionMode: "multiple_positions",
    directAnswer: "The evidence remains divided between two positions.", lean: null,
    whyLean: "No position has a defensible application-selected lean.",
    positions: [
      { positionId: "position-a", label: "Position A", summary: "The first source supports the claim.", supportingClaimIds: ["disagreement-claim-a"], contradictingClaimIds: [], sourceIds: ["disagreement-source-a"] },
      { positionId: "position-b", label: "Position B", summary: "The second source contradicts the claim.", supportingClaimIds: ["disagreement-claim-b"], contradictingClaimIds: [], sourceIds: ["disagreement-source-b"] },
    ],
    sourceSummaries: [], confidence: "low", confidenceScore: null, confidenceReasons: ["Material disagreement remains."],
    limitations: ["The competing sources were not reconciled."], unresolvedQuestions: [], freshestEvidenceAt: null,
    keyPoints: ["The evidence is disputed."],
    claims: [
      { text: "Position A is supported.", claimId: "disagreement-claim-a", statement: "Position A is supported.", relationship: "supports", evidenceSourceIds: ["disagreement-source-a"], evidenceClaimIds: ["disagreement-claim-a"], citationAssertionIds: ["disagreement-assertion-a"] },
      { text: "Position B is reported.", claimId: "disagreement-claim-b", statement: "Position B is reported.", relationship: "contradicts", evidenceSourceIds: ["disagreement-source-b"], evidenceClaimIds: ["disagreement-claim-b"], citationAssertionIds: ["disagreement-assertion-b"] },
    ],
    citations: [
      { assertionId: "disagreement-assertion-a", sourceDocumentVersionId: "version-1", sourceChunkId: "chunk-1", startLocator: "p1:1", endLocator: "p1:2" },
      { assertionId: "disagreement-assertion-b", sourceDocumentVersionId: "version-2", sourceChunkId: "chunk-2", startLocator: "p2:1", endLocator: "p2:2" },
    ],
    citedSourceIds: ["disagreement-source-a", "disagreement-source-b"], citedClaimIds: ["disagreement-claim-a", "disagreement-claim-b"],
    confirmedFacts: [], reportedClaims: [], analysis: "", disagreements: ["The sources materially disagree."], caveats: [],
    whatCouldChange: "A reviewed source resolving the contradiction.", proposedConfidence: "low",
  };
  assert.equal(validateAnswerOutput(disagreementDraft, disagreementEvidence, 300).passed, true,
    "a disagreement-aware answer must preserve explicit disagreement evidence");
  assert.equal(validateAnswerOutput({ ...disagreementDraft, disagreements: [] }, disagreementEvidence, 300).passed, false,
    "omitting a supplied material disagreement fails closed");

  const qualifiedPolicy = selectKnowledgeConclusion({
    evidenceMode: "researched",
    positions: [
      { positionId: "position-strong", evidenceCount: 3, currentEvidenceCount: 3, directEvidenceCount: 2, independentProvenanceGroupCount: 2, strongEvidenceCount: 2 },
      { positionId: "position-moderate", evidenceCount: 2, currentEvidenceCount: 2, directEvidenceCount: 1, independentProvenanceGroupCount: 1, strongEvidenceCount: 0 },
    ],
    competitions: [{ leftPositionId: "position-strong", rightPositionId: "position-moderate" }],
  });
  assert.equal(qualifiedPolicy.conclusionMode, "qualified_lean");
  const qualifiedDraft = {
    ...disagreementDraft,
    answer: "The evidence leans toward Position A, although Position B remains plausible.",
    directAnswer: "The evidence supports a qualified lean toward Position A.",
    conclusionMode: "qualified_lean", lean: "position-strong",
    whyLean: "Position A has the stronger independent and direct evidence, but a competing position remains.",
    positions: [
      { positionId: "position-strong", label: "Position A", summary: "Stronger evidence position.", supportingClaimIds: ["disagreement-claim-a"], contradictingClaimIds: [], sourceIds: ["disagreement-source-a"] },
      { positionId: "position-moderate", label: "Position B", summary: "Competing evidence position.", supportingClaimIds: ["disagreement-claim-b"], contradictingClaimIds: [], sourceIds: ["disagreement-source-b"] },
    ],
    disagreements: [], confidence: qualifiedPolicy.confidence, proposedConfidence: qualifiedPolicy.confidence,
    confidenceScore: null, confidenceReasons: qualifiedPolicy.confidenceReasons,
    whatCouldChange: qualifiedPolicy.whatCouldChange.join(" "),
  };
  const qualifiedResult = validateAnswerOutput(qualifiedDraft, disagreementEvidence.map((item) => ({ ...item, isDisputed: false, relationship: undefined })), 300, {
    evidenceMode: qualifiedPolicy.evidenceMode, conclusionMode: qualifiedPolicy.conclusionMode,
    confidence: qualifiedPolicy.confidence, leanPositionId: qualifiedPolicy.leanPositionId,
  });
  assert.equal(qualifiedResult.passed, true, "the target qualified_lean answer preserves the selected lean and change guidance");
}

await boundaryTests();
await triageUrlSourceTests();
sourceExtractionTests();
await kc03cCaptureTests();
await kc03dQueueTests();
await kc03eConsumerTests();
await kc04StructuredExtractionTests();
await kc05bClaimMatchReviewTests();
await kc05dProvenanceGroupTests();
await kc05eClaimRelationshipTests();
await governanceTests();
await gatewayTests();
await publicationAndIngestionTests();
await deskBoundaryTests();
await kc01TrustTests();
await kc02SchemaTests();
kc07aEvidenceScoringTests();
await kc05gLegacyCutoverTests();
await kc02ReconciliationTests();
await kc07eApprovalTests();
kc08aKnowledgeMarkdownTests();
await kc08bKnowledgeLinkSuggestionTests();
await kc08dKnowledgeDocumentMappingTests();
await kc08fKnowledgeApprovalGateTests();
await kc08gKnowledgeEvidenceResolutionTests();
await kc08hKnowledgeChangeProposalTests();
kc09EmbeddingPolicyTests();
await kc09dEmbeddingIndexTests();
await kc09eVectorResolutionTests();
await kc09iCitationResolutionTests();
kc09fPositionGroupingTests();
await kc09fD1RelationshipGroupingTests();
kc09gConclusionPolicyTests();
kc09jRefusalDisagreementTests();
console.log("Stabilisation tests passed.");
