import assert from "node:assert/strict";
import { proposeKnowledgeRevision, reviewKnowledgeRevision } from "../src/lib/server/knowledge-revisions";
import { archiveCluster, publishStory } from "../workers/ingestion/publish";
import type { Env } from "../workers/ingestion/index";
import { SQLiteD1 } from "./sqlite-d1";

// D1 reports meta.changes including rows written by triggers. story_clusters and
// knowledge_documents carry search-index triggers (migration 0050), so a single
// guarded UPDATE reports more than one change on D1. Checks of the form
// `changes !== 1` therefore failed on Production after committing the write:
// archive returned 400 and audited "failed" (seen on cluster 353, 2026-10-25).
// These tests run with the adapter in D1-faithful mode.

const env = (db: SQLiteD1) => ({ DB: db.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: "s".repeat(32) }) as unknown as Env;

function database(): SQLiteD1 {
  const db = new SQLiteD1();
  db.countTriggerChanges = true;
  db.sqlite.exec(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, ingestion_status) VALUES
      (901, 1, 'https://trigger.example/a', 'trigger-hash-a', 'Trigger source', 'Excerpt', 'clustered');
    INSERT INTO story_clusters (id, title, topic, summary, evidence_status, publication_status, needs_human_review) VALUES
      (901, 'Review cluster for archive', 'models', 'Summary', 'vendor_reported', 'review', 1),
      (902, 'Draft cluster for publication', 'models', 'Summary', 'vendor_reported', 'draft', 0),
      (903, 'Already published cluster', 'models', 'Summary', 'vendor_reported', 'published', 0);
    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (902, 901, 1);
  `);
  return db;
}

// The adapter really is counting trigger rows for story_clusters, as D1 does.
{
  const db = database();
  const result = await db.prepare("UPDATE story_clusters SET publication_status = 'review' WHERE id = 901").run();
  assert.ok(Number(result.meta.changes) > 1, "a story_clusters status update reports trigger-written rows");
  db.close();
}

// Archive: succeeds once, refuses a repeat and a published story.
{
  const db = database();
  assert.deepEqual(await archiveCluster(env(db), 901), { success: true }, "archiving a review cluster succeeds under D1 change counting");
  assert.equal(db.sqlite.prepare("SELECT publication_status FROM story_clusters WHERE id = 901").get()?.publication_status, "withdrawn");
  const repeat = await archiveCluster(env(db), 901);
  assert.equal(repeat.success, false, "an already archived cluster is refused");
  const published = await archiveCluster(env(db), 903);
  assert.equal(published.success, false, "a published story cannot be archived");
  assert.equal(db.sqlite.prepare("SELECT publication_status FROM story_clusters WHERE id = 903").get()?.publication_status, "published");
  db.close();
}

// Publish: succeeds and records its audit row under D1 change counting.
{
  const db = database();
  const result = await publishStory(env(db), {
    clusterId: 902, summary: "A reviewed summary that is long enough to publish.", reviewedBy: "publisher@example.test",
  });
  assert.equal(result.success, true, result.error);
  assert.equal(db.sqlite.prepare("SELECT publication_status FROM story_clusters WHERE id = 902").get()?.publication_status, "published");
  assert.equal(Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'publish_story_to_homepage' AND target_id = '902'").get() as { n: number }).n), 1);
  assert.equal(db.sqlite.prepare("SELECT ingestion_status FROM feed_items WHERE id = 901").get()?.ingestion_status, "published");
  db.close();
}

// Knowledge revision approval: knowledge_documents has a search-index update trigger too.
{
  const db = database();
  db.sqlite.exec(`
    INSERT INTO knowledge_documents (id, canonical_question, canonical_hash, section_slug, knowledge_type, status, visibility, evidence_status, direct_answer, detailed_explanation, document_json, source_set_hash, policy_version, approved_by, approved_at, created_by)
      VALUES ('trigger-doc', 'Trigger revision policy', 'trigger-hash', 'ai-agents', 'explainer', 'approved', 'public_knowledge', 'confirmed', 'Original answer.', 'Original explanation.', '{"version":1}', 'sources-v1', 'test', 'publisher', '2026-07-26T00:00:00Z', 'tester');
  `);
  const draft = await proposeKnowledgeRevision(db.asD1(), {
    knowledgeDocumentId: "trigger-doc",
    payload: { directAnswer: "Reviewed answer.", detailedExplanation: "Reviewed explanation.", documentJson: '{"version":2}' },
    rationale: "Exercise D1 change counting.", changeSummary: "Update", createdBy: "publisher@example.test",
  });
  const approved = await reviewKnowledgeRevision(db.asD1(), { revisionId: draft.revisionId, decision: "approve", reviewer: "reviewer@example.test" });
  assert.equal(approved.status, "approved");
  assert.equal(db.sqlite.prepare("SELECT direct_answer FROM knowledge_documents WHERE id = 'trigger-doc'").get()?.direct_answer, "Reviewed answer.");
  db.close();
}

console.log("D1 trigger-counted changes tests passed");
