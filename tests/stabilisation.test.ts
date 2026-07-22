import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DurableAIGovernance } from "../src/ai/durable-governance";
import { askTrace } from "../src/ai/trace-model-gateway";
import { validateAnswerDraft, validateAskTraceInput } from "../src/ai/schemas";
import { validateAnswerOutput } from "../src/ai/validation";
import { calculateDeterministicConfidence, isKnowledgeHardExpired, isKnowledgeReviewDue, retrieveApprovedKnowledge } from "../src/lib/server/ask-evidence";
import { independentEvidenceWeightFor, isAnswerEligibleEvidence, PUBLIC_ASK_TASK_POLICY, TRACE_POLICY_VERSION } from "../src/ai/task-policy";
import { GUIDE_CONTRACT_VERSION, guideFreshness, isGuideEligibleForProceduralRetrieval, validateGuideCommand, validateGuideMetadata } from "../src/guides/contract";
import { nodeWindowsVerificationCommands } from "../src/guides/drafts/install-node-js-and-npm-on-windows";
import { validateAskBody } from "../src/pages/api/trace/ask";
import { handleTriageRequest } from "../src/pages/api/admin/ai-triage";
import { extractTriageUrlSource, TriageUrlFetchError } from "../src/lib/server/triage-url-source";
import { retrieveRemoteSource, SourceRetrievalError } from "../src/lib/server/source-retrieval";
import { signInternalRequest, verifyInternalRequestSignature } from "../src/security/internal-signature";
import { publishBriefing, publishStory, upgradeClusterEvidence } from "../workers/ingestion/publish";
import { reconcileKnowledgeIndexOperations } from "../workers/ingestion/knowledge-reconciliation";
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
  },
  {
    sourceId: "source-2", sourceKind: "external_independent", sourceRole: "evidence", admissionState: "admitted", freshnessState: "current", independentEvidenceWeight: 0,
    claimId: "claim-2", text: "Evidence two", sourceClassification: "Tier B; independent", trustNotes: "Evidence quality: strong", observedAt: "2026-07-14T10:00:00Z",
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
          key_points: ["Two published sources were supplied."],
          claims: [{ text: "Two sources support the answer.", evidence_source_ids: ["source-1", "source-2"], evidence_claim_ids: ["claim-1", "claim-2"] }],
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
  const env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: secret };
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
      "knowledge_processing_jobs", "knowledge_index_operations", "knowledge_index_operation_receipts",
      "knowledge_reconciliation_runs",
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
    answer: "A structurally plausible answer.", keyPoints: [], claims: [], citedSourceIds: [],
    citedClaimIds: [], confirmedFacts: [], reportedClaims: [], disagreements: [], caveats: [],
    whatCouldChange: "New evidence.", proposedConfidence: "low", unexpected: true,
  }).valid, false, "provider outputs reject unknown fields");
  const unsuppliedCitation = validateAnswerOutput({
    answer: "A material statement backed by a fabricated citation.", keyPoints: [],
    claims: [{ text: "Material statement.", evidenceSourceIds: ["source-unknown"], evidenceClaimIds: ["claim-unknown"] }],
    citedSourceIds: ["source-unknown"], citedClaimIds: ["claim-unknown"], confirmedFacts: [],
    reportedClaims: [], analysis: "", disagreements: [], caveats: [], whatCouldChange: "New evidence.",
    proposedConfidence: "low",
  }, evidence, 300);
  assert.equal(unsuppliedCitation.passed, false, "Ask cannot cite evidence that was not supplied");
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

await boundaryTests();
await triageUrlSourceTests();
await governanceTests();
await gatewayTests();
await publicationAndIngestionTests();
await deskBoundaryTests();
await kc01TrustTests();
await kc02SchemaTests();
await kc02ReconciliationTests();
console.log("Stabilisation tests passed.");
