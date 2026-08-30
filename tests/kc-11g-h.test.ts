import assert from "node:assert/strict";
import { SQLiteD1 } from "./sqlite-d1";
import {
  bootstrapHistoricalEvidenceScores,
  KC11G_INITIAL_TRIGGER,
  KC11G_INITIAL_SNAPSHOT_IDENTITY,
  KC11G_STORY_CLAIM_EDGE_CEILING,
} from "../src/lib/server/historical-evidence-scores";
import {
  deterministicScoreSnapshotId,
  persistCanonicalStoryScore,
} from "../src/lib/server/evidence-recalculation";
import {
  KC11G_PREVIEW_D1_RESOURCE_ID,
  runKc11GH,
} from "../workers/ingestion/kc-11g-h";
import worker from "../workers/ingestion/index";
import { signInternalRequest } from "../src/security/internal-signature";

async function establishRuntimeIdentity(
  database: SQLiteD1,
  environment: "preview" | "production",
  resourceId: string,
): Promise<void> {
  await database.prepare(`
    INSERT INTO trace_runtime_resource_identity
      (identity_key, identity_version, environment, resource_id, established_by)
    VALUES ('d1', 'trace-d1-resource-v1', ?, ?, 'test:kc-11g-h')
  `).bind(environment, resourceId).run();
}

async function seedApprovedHistory(database: SQLiteD1, suffix: string): Promise<void> {
  await database.prepare(`
    INSERT INTO story_clusters
      (id, title, summary, publication_status, published_at, reviewed_by, reviewed_at, evidence_status)
    VALUES (?, ?, ?, 'published', datetime('now'), 'publisher@example.com', datetime('now'), 'unverified')
  `).bind(1200, `Historical story ${suffix}`, `Published wording ${suffix}`).run();
  await database.prepare(`
    INSERT INTO canonical_claims
      (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES (?, ?, 'specification_defined', 'model_capability', 'active', 'standard')
  `).bind(`kc11gh-claim-${suffix}`, `The ${suffix} claim is supported.`).run();
  await database.prepare(`
    INSERT INTO story_claims
      (story_cluster_id, canonical_claim_id, role, materiality, display_order)
    VALUES (1200, ?, 'primary', 'standard', 1)
  `).bind(`kc11gh-claim-${suffix}`).run();
  await database.prepare(`
    INSERT INTO source_documents
      (id, canonical_url, canonical_url_hash, media_kind, copyright_storage_mode, admission_state)
    VALUES (?, ?, ?, 'html', 'short_excerpt', 'admitted')
  `).bind(
    `kc11gh-doc-${suffix}`,
    `https://example.test/kc11gh/${suffix}`,
    `kc11gh-url-${suffix}`,
  ).run();
  await database.prepare(`
    INSERT INTO source_document_versions
      (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, extraction_state, source_language)
    VALUES (?, ?, ?, ?, datetime('now'), 'extracted', 'extracted', 'en')
  `).bind(
    `kc11gh-version-${suffix}`,
    `kc11gh-doc-${suffix}`,
    `kc11gh-content-${suffix}`,
    `https://example.test/kc11gh/${suffix}`,
  ).run();
  await database.prepare(`
    INSERT INTO source_chunks
      (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
    VALUES (?, ?, 0, ?, ?, 'p1:1', 'p1:2')
  `).bind(
    `kc11gh-chunk-${suffix}`,
    `kc11gh-version-${suffix}`,
    `A bounded approved historical chunk for ${suffix}.`,
    `kc11gh-chunk-hash-${suffix}`,
  ).run();
  await database.prepare(`
    INSERT INTO provenance_groups
      (id, root_source_document_id, origin_type, explanation, determined_by, determination_method, reviewed_at)
    VALUES (?, ?, 'primary', 'Reviewed historical source.', 'publisher@example.com', 'editor_review', datetime('now'))
  `).bind(`kc11gh-provenance-${suffix}`, `kc11gh-doc-${suffix}`).run();
  await database.prepare(`
    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id,
       start_locator, end_locator, assertion_text, relationship, source_role,
       directness, evidence_treatment, admission_state, freshness_state,
       provenance_group_id, extraction_method, extraction_version, confidence,
       reviewer_state, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, 'p1:1', 'p1:2', ?, 'supports', 'evidence', 'direct',
            'factual_support', 'admitted', 'current', ?, 'historical_fixture',
            'kc11gh-test-v1', 0.95, 'accepted', 'publisher@example.com', datetime('now'))
  `).bind(
    `kc11gh-assertion-${suffix}`,
    `kc11gh-claim-${suffix}`,
    `kc11gh-version-${suffix}`,
    `kc11gh-chunk-${suffix}`,
    `The ${suffix} claim is supported by the reviewed source.`,
    `kc11gh-provenance-${suffix}`,
  ).run();
}

async function scoreBootstrapTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    await seedApprovedHistory(database, "bootstrap");
    const before = await database.prepare("SELECT title, summary FROM story_clusters WHERE id = 1200").first<{ title: string; summary: string }>();
    const first = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 25 });
    assert.equal(first.state, "completed");
    assert.equal(first.triggeringEvent, KC11G_INITIAL_TRIGGER);
    assert.equal(first.claimSnapshots, 1);
    assert.equal(first.storySnapshots, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshot_explanations").first<{ count: number }>())?.count, 2);
    const after = await database.prepare("SELECT title, summary FROM story_clusters WHERE id = 1200").first<{ title: string; summary: string }>();
    assert.deepEqual(after ? { ...after } : after, before ? { ...before } : before,
      "initial score calculation does not rewrite published wording");

    const replay = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 25 });
    assert.equal(replay.state, "completed");
    assert.equal(replay.selectedClaims, 0, "completed initial snapshots are not selected again");
    assert.equal(replay.claimSnapshots, 0);
    assert.equal(replay.storySnapshots, 0);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, 1,
      "exact replay keeps one canonical claim score snapshot");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots").first<{ count: number }>())?.count, 1,
      "exact replay keeps one canonical story score snapshot");
  } finally {
    database.close();
  }
}

async function gatedReindexTests(): Promise<void> {
  const database = new SQLiteD1();
  let aiCalls = 0;
  let upsertCalls = 0;
  try {
    await seedApprovedHistory(database, "reindex");
    await establishRuntimeIdentity(database, "preview", KC11G_PREVIEW_D1_RESOURCE_ID);
    const vectors = new Map<string, { id: string }>();
    const environment = {
      DB: database.asD1(),
      TRACE_ENVIRONMENT: "preview",
      AI: {
        async run(_model: string, input: { text: string[] }) {
          aiCalls++;
          return { data: input.text.map(() => new Array(1024).fill(0.01)) };
        },
      },
      KNOWLEDGE_VECTOR_INDEX: {
        async upsert(items: Array<{ id: string }>) {
          upsertCalls++;
          for (const item of items) vectors.set(item.id, item);
          return { ids: items.map(item => item.id), count: items.length };
        },
        async getByIds(ids: string[]) {
          return ids.filter(id => vectors.has(id)).map(id => ({ id }));
        },
      },
    };

    const first = await runKc11GH(environment, { scoreLimit: 25, indexLimit: 25 });
    assert.equal(first.state, "completed");
    assert.equal(first.evaluation.pass, true, "KC-07F fixed evaluation gates the run");
    assert.equal(first.scores?.claimSnapshots, 1);
    assert.ok(Number(first.indexing?.indexed ?? 0) > 0, "approved records are re-indexed through the existing bounded indexer");
    const firstAiCalls = aiCalls;
    const firstUpsertCalls = upsertCalls;
    const snapshotCounts = await database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM canonical_claim_score_snapshots) AS claims,
        (SELECT COUNT(*) FROM evidence_score_snapshots) AS stories
    `).first<{ claims: number; stories: number }>();

    const replay = await runKc11GH(environment, { scoreLimit: 25, indexLimit: 25 });
    assert.equal(replay.state, "completed");
    assert.equal(replay.scores?.claimSnapshots, 0);
    assert.equal(replay.scores?.storySnapshots, 0);
    assert.equal(aiCalls, firstAiCalls, "a durably confirmed replay does not call Workers AI again");
    assert.equal(upsertCalls, firstUpsertCalls, "a durably confirmed replay does not submit another Vectorize mutation");
    const replaySnapshotCounts = await database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM canonical_claim_score_snapshots) AS claims,
        (SELECT COUNT(*) FROM evidence_score_snapshots) AS stories
    `).first<{ claims: number; stories: number }>();
    assert.deepEqual(replaySnapshotCounts ? { ...replaySnapshotCounts } : replaySnapshotCounts,
      snapshotCounts ? { ...snapshotCounts } : snapshotCounts,
      "G/H replay keeps score snapshots singular");

    const disabled = await runKc11GH({ DB: database.asD1(), TRACE_ENVIRONMENT: "production" });
    assert.equal(disabled.state, "disabled");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count,
      snapshotCounts?.claims,
      "disabled production path does not write historical snapshots");
  } finally {
    database.close();
  }
}

function seedEligibleClaimSet(database: SQLiteD1, count: number, prefix: string, storyBase: number): void {
  const story = database.sqlite.prepare(`
    INSERT INTO story_clusters
      (id, title, summary, publication_status, published_at, reviewed_by, reviewed_at, evidence_status)
    VALUES (?, ?, ?, 'published', datetime('now'), 'publisher@example.com', datetime('now'), 'unverified')
  `);
  const claim = database.sqlite.prepare(`
    INSERT INTO canonical_claims
      (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES (?, ?, 'specification_defined', 'model_capability', 'active', 'standard')
  `);
  const link = database.sqlite.prepare(`
    INSERT INTO story_claims
      (story_cluster_id, canonical_claim_id, role, materiality, display_order)
    VALUES (?, ?, 'primary', 'standard', 1)
  `);
  database.sqlite.exec("BEGIN");
  try {
    for (let index = 0; index < count; index++) {
      const claimId = `${prefix}-${String(index).padStart(3, "0")}`;
      const storyId = storyBase + index;
      story.run(storyId, `Story ${claimId}`, `Published ${claimId}`);
      claim.run(claimId, `Claim ${claimId}`);
      link.run(storyId, claimId);
    }
    database.sqlite.exec("COMMIT");
  } catch (error) {
    database.sqlite.exec("ROLLBACK");
    throw error;
  }
}

async function drainScores(database: SQLiteD1, limit: number, maximumRuns = 20) {
  const results = [];
  for (let run = 0; run < maximumRuns; run++) {
    const result = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit });
    results.push(result);
    if (result.state === "completed") return results;
  }
  assert.fail(`KC-11G did not complete within ${maximumRuns} bounded runs`);
}

async function boundaryAndMutableEligibilityTests(): Promise<void> {
  for (const count of [25, 26, 100, 101]) {
    const database = new SQLiteD1();
    try {
      seedEligibleClaimSet(database, count, `boundary-${count}`, 10_000 + count * 200);
      const runs = await drainScores(database, count >= 100 ? 100 : 25);
      assert.equal(runs.at(-1)?.state, "completed", `${count} records drain to global completion`);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, count);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots").first<{ count: number }>())?.count, count);
      assert.ok(runs.every((run) => run.nextCursor === null), "the live queue never emits a client cursor");
    } finally {
      database.close();
    }
  }

  const dryRunDatabase = new SQLiteD1();
  try {
    seedEligibleClaimSet(dryRunDatabase, 25, "dry-exact", 40_000);
    const dryRun = await bootstrapHistoricalEvidenceScores(dryRunDatabase.asD1(), { limit: 25, dryRun: true });
    assert.equal(dryRun.state, "completed", "an exact final dry-run page is not reported partial");
    assert.equal(dryRun.nextCursor, null);
  } finally {
    dryRunDatabase.close();
  }

  const mutable = new SQLiteD1();
  try {
    seedEligibleClaimSet(mutable, 2, "mutable", 41_000);
    mutable.sqlite.prepare("UPDATE story_clusters SET publication_status = 'draft', published_at = NULL WHERE id = 41000").run();
    const first = await bootstrapHistoricalEvidenceScores(mutable.asD1(), { limit: 1 });
    assert.equal(first.claimIds[0], "mutable-001", "the initially eligible higher ID is processed");
    mutable.sqlite.prepare(`
      UPDATE story_clusters
      SET publication_status = 'published', published_at = datetime('now')
      WHERE id = 41000
    `).run();
    await drainScores(mutable, 1);
    assert.equal((await mutable.prepare(`
      SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots
      WHERE canonical_claim_id = 'mutable-000'
    `).first<{ count: number }>())?.count, 1, "a newly eligible lower ID remains reachable");

    seedEligibleClaimSet(mutable, 1, "zz-new-high", 41_100);
    await drainScores(mutable, 1);
    assert.equal((await mutable.prepare(`
      SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots
      WHERE canonical_claim_id = 'zz-new-high-000'
    `).first<{ count: number }>())?.count, 1, "a newly eligible higher ID remains reachable");
  } finally {
    mutable.close();
  }

  const ineligible = new SQLiteD1();
  try {
    seedEligibleClaimSet(ineligible, 26, "becomes-ineligible", 42_000);
    const first = await bootstrapHistoricalEvidenceScores(ineligible.asD1(), { limit: 25 });
    assert.equal(first.state, "partial");
    ineligible.sqlite.prepare("UPDATE story_clusters SET publication_status = 'draft', published_at = NULL WHERE id = 42025").run();
    const final = await bootstrapHistoricalEvidenceScores(ineligible.asD1(), { limit: 25 });
    assert.equal(final.state, "completed", "a record that becomes ineligible is not a false completion blocker");
    assert.equal((await ineligible.prepare(`
      SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots
      WHERE canonical_claim_id = 'becomes-ineligible-025'
    `).first<{ count: number }>())?.count, 0);
  } finally {
    ineligible.close();
  }

  const interspersed = new SQLiteD1();
  try {
    seedEligibleClaimSet(interspersed, 26, "interspersed", 43_000);
    for (const index of [0, 3, 7, 14, 25]) {
      const claimId = `interspersed-${String(index).padStart(3, "0")}`;
      interspersed.sqlite.prepare(`
        INSERT INTO canonical_claim_score_snapshots
          (id, canonical_claim_id, score, evidence_status, component_json, policy_version, triggering_event)
        VALUES (?, ?, 0, 'unverified', '{}', 'kc-07a-v1', 'historical_backfill_initial')
      `).run(deterministicScoreSnapshotId("claim", claimId, KC11G_INITIAL_SNAPSHOT_IDENTITY), claimId);
    }
    await drainScores(interspersed, 25);
    assert.equal((await interspersed.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, 26,
      "existing snapshots interspersed through the keyspace do not strand work");
  } finally {
    interspersed.close();
  }
}

function safeExternalMocks() {
  const vectors = new Set<string>();
  return {
    AI: {
      async run(_model: string, input: { text: string[] }) {
        return { data: input.text.map(() => new Array(1024).fill(0.01)) };
      },
    },
    KNOWLEDGE_VECTOR_INDEX: {
      async upsert(items: Array<{ id: string }>) {
        for (const item of items) vectors.add(item.id);
        return { ids: items.map((item) => item.id), count: items.length };
      },
      async getByIds(ids: string[]) {
        return ids.filter((id) => vectors.has(id)).map((id) => ({ id }));
      },
    },
  };
}

async function resourceIdentityTests(): Promise<void> {
  for (const fixture of [
    { label: "missing", environment: null, resourceId: null },
    { label: "production", environment: "production" as const, resourceId: "1625036a-ffe2-4103-bf9d-086bae150561" },
    { label: "malformed", environment: "preview" as const, resourceId: "not-a-d1-resource-id" },
  ]) {
    const database = new SQLiteD1();
    try {
      await seedApprovedHistory(database, `identity-${fixture.label}`);
      if (fixture.environment && fixture.resourceId) {
        await establishRuntimeIdentity(database, fixture.environment, fixture.resourceId);
      }
      const result = await runKc11GH({
        DB: database.asD1(), TRACE_ENVIRONMENT: "preview", ...safeExternalMocks(),
      });
      assert.equal(result.state, "disabled", `${fixture.label} D1 identity fails closed`);
      assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM canonical_claim_score_snapshots").first<{ count: number }>())?.count, 0,
        `${fixture.label} identity cannot reach score mutation`);
    } finally {
      database.close();
    }
  }

  const permitted = new SQLiteD1();
  try {
    await seedApprovedHistory(permitted, "identity-preview");
    await establishRuntimeIdentity(permitted, "preview", KC11G_PREVIEW_D1_RESOURCE_ID);
    const result = await runKc11GH({
      DB: permitted.asD1(), TRACE_ENVIRONMENT: "preview", ...safeExternalMocks(),
    });
    assert.equal(result.state, "completed", "the exact attested Preview D1 and safe bindings are permitted");
    assert.equal(result.scores?.claimSnapshots, 1);
  } finally {
    permitted.close();
  }
}

function pausingBatchDatabase(database: SQLiteD1) {
  let release!: () => void;
  let reached!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const atBatch = new Promise<void>((resolve) => { reached = resolve; });
  const base = database.asD1();
  const wrapped = {
    prepare: base.prepare.bind(base),
    exec: base.exec.bind(base),
    async batch(statements: D1PreparedStatement[]) {
      reached();
      await released;
      return base.batch(statements);
    },
  } as D1Database;
  return { db: wrapped, atBatch, release };
}

async function concurrentApprovalScenario(
  winnerStatus: "confirmed" | "disputed",
  loserStatus: "confirmed" | "disputed",
): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.prepare(`
      INSERT INTO story_clusters
        (id, title, summary, publication_status, published_at, reviewed_by, reviewed_at, evidence_status)
      VALUES (50000, 'Concurrent story', 'Immutable wording', 'published', datetime('now'),
              'publisher@example.com', datetime('now'), 'unverified')
    `).run();
    const paused = pausingBatchDatabase(database);
    const losingWrite = persistCanonicalStoryScore(paused.db, {
      storyId: 50000, score: loserStatus === "confirmed" ? 90 : 20,
      evidenceStatus: loserStatus, componentJson: JSON.stringify({ source: "loser" }),
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      snapshotIdentity: KC11G_INITIAL_SNAPSHOT_IDENTITY,
    });
    await paused.atBatch;
    await persistCanonicalStoryScore(database.asD1(), {
      storyId: 50000, score: winnerStatus === "confirmed" ? 90 : 20,
      evidenceStatus: winnerStatus, componentJson: JSON.stringify({ source: "winner" }),
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      snapshotIdentity: KC11G_INITIAL_SNAPSHOT_IDENTITY,
    });
    paused.release();
    await losingWrite;

    const snapshot = await database.prepare(`
      SELECT id, evidence_status FROM evidence_score_snapshots WHERE story_cluster_id = 50000
    `).first<{ id: string; evidence_status: string }>();
    const approvals = await database.prepare(`
      SELECT id, snapshot_id, proposed_status FROM evidence_change_approvals WHERE target_id = '50000'
    `).all<{ id: string; snapshot_id: string; proposed_status: string }>();
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots WHERE story_cluster_id = 50000").first<{ count: number }>())?.count, 1);
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshot_explanations WHERE subject_id = '50000'").first<{ count: number }>())?.count, 1);
    assert.equal(approvals.results.length, 1, "one canonical snapshot creates at most one pending approval");
    assert.equal(approvals.results[0].proposed_status, snapshot?.evidence_status);
    assert.equal(approvals.results[0].snapshot_id, snapshot?.id);
    assert.match(approvals.results[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    await persistCanonicalStoryScore(database.asD1(), {
      storyId: 50000, score: 50, evidenceStatus: loserStatus,
      componentJson: JSON.stringify({ source: "replay" }),
      triggeringEvent: KC11G_INITIAL_TRIGGER,
      snapshotIdentity: KC11G_INITIAL_SNAPSHOT_IDENTITY,
    });
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_change_approvals WHERE target_id = '50000'").first<{ count: number }>())?.count, 1,
      "replay cannot add a contradictory canonical proposal");
  } finally {
    database.close();
  }
}

async function signedWorkerPost(
  database: SQLiteD1,
  path: string,
  bodyValue: Record<string, unknown>,
): Promise<Response> {
  const secret = "kc11gh-test-internal-secret-0000000000000000";
  const body = JSON.stringify(bodyValue);
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const identity = { operator: "publisher@example.com", role: "publisher" as const, timestamp, nonce };
  const signature = await signInternalRequest(secret, "POST", path, body, identity);
  const request = new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": identity.operator,
      "X-Trace-Role": identity.role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": nonce,
      "X-Trace-Signature": signature,
    },
    body,
  });
  return worker.fetch(request, {
    DB: database.asD1(), TRACE_INTERNAL_SERVICE_SECRET: secret,
  } as never, { waitUntil() {}, passThroughOnException() {} } as never);
}

async function approvalApiCompatibilityTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    await seedApprovedHistory(database, "approval-api");
    const initial = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 25 });
    assert.equal(initial.state, "completed");
    const approval = await database.prepare(`
      SELECT id, state FROM evidence_change_approvals WHERE target_id = '1200'
    `).first<{ id: string; state: string }>();
    assert.ok(approval);
    assert.match(approval.id, /^[0-9a-f-]{36}$/i);
    const response = await signedWorkerPost(database, "/admin/approve-evidence-status", {
      approvalId: approval.id, decision: "approve", reviewNote: "Reviewed initial historical score.",
    });
    assert.equal(response.status, 200, await response.text());
    assert.equal((await database.prepare("SELECT state FROM evidence_change_approvals WHERE id = ?").bind(approval.id).first<{ state: string }>())?.state, "approved");
    const replay = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 25 });
    assert.equal(replay.state, "completed");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_change_approvals WHERE target_id = '1200'").first<{ count: number }>())?.count, 1);

    const cursorResponse = await signedWorkerPost(database, "/admin/knowledge/kc-11g-h", {
      scoreLimit: 25, scoreCursor: "zzzz", indexLimit: 25,
    });
    assert.equal(cursorResponse.status, 400, "unknown traversal fields cannot skip live work");
  } finally {
    database.close();
  }
}

async function highDegreeFanoutTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    database.sqlite.prepare(`
      INSERT INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES ('fanout-claim', 'One claim linked to many stories.', 'specification_defined',
              'model_capability', 'active', 'standard')
    `).run();
    const story = database.sqlite.prepare(`
      INSERT INTO story_clusters
        (id, title, summary, publication_status, published_at, reviewed_by, reviewed_at, evidence_status)
      VALUES (?, ?, 'Bounded fanout', 'published', datetime('now'), 'publisher@example.com', datetime('now'), 'unverified')
    `);
    const link = database.sqlite.prepare(`
      INSERT INTO story_claims
        (story_cluster_id, canonical_claim_id, role, materiality, display_order)
      VALUES (?, 'fanout-claim', 'primary', 'standard', 1)
    `);
    database.sqlite.exec("BEGIN");
    try {
      for (let index = 0; index < 101; index++) {
        story.run(60_000 + index, `Fanout story ${index}`);
        link.run(60_000 + index);
      }
      database.sqlite.exec("COMMIT");
    } catch (error) {
      database.sqlite.exec("ROLLBACK");
      throw error;
    }

    const first = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 1 });
    assert.equal(first.state, "partial", "high fan-out returns resumable state");
    const partialDryRun = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 1, dryRun: true });
    assert.equal(partialDryRun.state, "partial", "dry-run reports existing continuation work");
    const runs = [first, ...await drainScores(database, 1, 10)];
    assert.ok(runs.every((run) => run.work.storyClaimEdgesProcessed <= KC11G_STORY_CLAIM_EDGE_CEILING));
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM kc11g_story_claim_score_work").first<{ count: number }>())?.count, 101,
      "every linked story/claim edge is retained");
    assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM evidence_score_snapshots").first<{ count: number }>())?.count, 101,
      "repeated bounded continuation eventually snapshots every linked story");
    const replay = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 1 });
    assert.equal(replay.state, "completed");
    assert.equal(replay.storySnapshots, 0, "fan-out replay remains singular");
  } finally {
    database.close();
  }
}

async function oversizedSingleUnitDeferralTests(): Promise<void> {
  const database = new SQLiteD1();
  try {
    await seedApprovedHistory(database, "oversized");
    const insert = database.sqlite.prepare(`
      INSERT INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, source_chunk_id,
         start_locator, end_locator, assertion_text, relationship, source_role,
         directness, evidence_treatment, admission_state, freshness_state,
         provenance_group_id, extraction_method, extraction_version, confidence,
         reviewer_state, reviewed_by, reviewed_at)
      VALUES (?, 'kc11gh-claim-oversized', 'kc11gh-version-oversized', 'kc11gh-chunk-oversized',
              ?, ?, ?, 'supports', 'evidence', 'direct', 'factual_support', 'admitted',
              'current', 'kc11gh-provenance-oversized', 'oversized_fixture', 'v1', 0.9,
              'accepted', 'publisher@example.com', datetime('now'))
    `);
    database.sqlite.exec("BEGIN");
    try {
      for (let index = 0; index < 400; index++) {
        insert.run(`oversized-extra-${index}`, `p${index + 2}:1`, `p${index + 2}:2`, `Evidence ${index}`);
      }
      database.sqlite.exec("COMMIT");
    } catch (error) {
      database.sqlite.exec("ROLLBACK");
      throw error;
    }
    const first = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 1 });
    assert.equal(first.state, "partial");
    assert.equal(first.work.deferredItems, 1);
    assert.equal(first.claimSnapshots, 0, "oversized evidence is not silently truncated into a score");
    const replay = await bootstrapHistoricalEvidenceScores(database.asD1(), { limit: 1 });
    assert.equal(replay.state, "partial");
    assert.equal(replay.selectedClaims, 0, "the same impossible unit is not retried indefinitely");
    assert.equal(replay.work.deferredItems, 1, "durable deferred work remains visible");
  } finally {
    database.close();
  }
}

await scoreBootstrapTests();
await gatedReindexTests();
await boundaryAndMutableEligibilityTests();
await resourceIdentityTests();
await concurrentApprovalScenario("disputed", "confirmed");
await concurrentApprovalScenario("confirmed", "disputed");
await approvalApiCompatibilityTests();
await highDegreeFanoutTests();
await oversizedSingleUnitDeferralTests();
console.log("KC-11G/H tests passed");
