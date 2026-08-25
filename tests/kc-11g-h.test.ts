import assert from "node:assert/strict";
import { SQLiteD1 } from "./sqlite-d1";
import {
  bootstrapHistoricalEvidenceScores,
  KC11G_INITIAL_TRIGGER,
} from "../src/lib/server/historical-evidence-scores";
import { runKc11GH } from "../workers/ingestion/kc-11g-h";

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
    assert.equal(aiCalls, firstAiCalls, "re-index replay does not call Workers AI again");
    assert.equal(upsertCalls, firstUpsertCalls, "re-index replay does not submit another Vectorize mutation");
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

await scoreBootstrapTests();
await gatedReindexTests();
console.log("KC-11G/H tests passed");
