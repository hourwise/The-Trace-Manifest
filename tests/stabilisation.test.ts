import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DurableAIGovernance } from "../src/ai/durable-governance";
import { askTrace } from "../src/ai/trace-model-gateway";
import { validateAnswerDraft, validateAskTraceInput } from "../src/ai/schemas";
import { validateAnswerOutput } from "../src/ai/validation";
import { calculateDeterministicConfidence } from "../src/lib/server/ask-evidence";
import { isAnswerEligibleEvidence, PUBLIC_ASK_TASK_POLICY, TRACE_POLICY_VERSION } from "../src/ai/task-policy";
import { GUIDE_CONTRACT_VERSION, guideFreshness, isGuideEligibleForProceduralRetrieval, validateGuideCommand, validateGuideMetadata } from "../src/guides/contract";
import { nodeWindowsVerificationCommands } from "../src/guides/drafts/install-node-js-and-npm-on-windows";
import { validateAskBody } from "../src/pages/api/trace/ask";
import { handleTriageRequest } from "../src/pages/api/admin/ai-triage";
import { signInternalRequest, verifyInternalRequestSignature } from "../src/security/internal-signature";
import { publishBriefing, publishStory } from "../workers/ingestion/publish";
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
    sourceId: "source-1", sourceKind: "external_primary", sourceRole: "evidence", admissionState: "admitted", freshnessState: "current", independentEvidenceWeight: 1,
    claimId: "claim-1", text: "Evidence one", sourceClassification: "Tier A; primary", trustNotes: "Evidence quality: strong", observedAt: "2026-07-13T10:00:00Z",
  },
  {
    sourceId: "source-2", sourceKind: "external_independent", sourceRole: "evidence", admissionState: "admitted", freshnessState: "current", independentEvidenceWeight: 1,
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
    assert.equal(providerCalls, 0, "ineligible evidence cannot invoke the model");
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

await boundaryTests();
await governanceTests();
await gatewayTests();
await publicationAndIngestionTests();
await deskBoundaryTests();
console.log("Stabilisation tests passed.");
