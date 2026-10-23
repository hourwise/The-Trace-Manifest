import assert from "node:assert/strict";
import { approveFreshnessReview, requestFreshnessReview } from "../src/lib/server/evidence-freshness-review";
import { FRESHNESS_QUEUE_LIMIT, listFreshnessQueue } from "../src/lib/server/evidence-freshness-queue";
import { SQLiteD1 } from "./sqlite-d1";

// SEED-01: the freshness work queue lists what a publisher can review and why
// a "current" proposal would be refused, without changing any state.

function seed(database: SQLiteD1): void {
  // The legacy row references a pre-cutover claim; claims are read-only after
  // cutover, so the fixture skips that one foreign key instead of rebuilding it.
  database.sqlite.exec("PRAGMA foreign_keys = OFF");
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (960, 'Queue source', 'https://queue.example', 'A', 'A', 'primary-research', 'rss');
    INSERT INTO canonical_claims (id, canonical_text, claim_class) VALUES
      ('queue-claim-ready', 'A claim whose evidence is ready.', 'independent_research_finding'),
      ('queue-claim-legacy', 'A legacy claim without captured evidence.', 'official_vendor_claim'),
      ('queue-claim-proposed', 'A claim still awaiting review.', 'official_vendor_claim');
    INSERT INTO source_documents (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode, current_version_id)
      VALUES ('queue-document', 'https://queue.example/source', 'queue-url-hash', 960, 'html', 'admitted', 'metadata_only', 'queue-version');
    INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, extraction_state, storage_state)
      VALUES ('queue-version', 'queue-document', 'queue-content-hash', 'https://queue.example/source', '2026-10-20T00:00:00Z', 'extracted', 'extracted', 'metadata_only');
    INSERT INTO source_chunks (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
      VALUES ('queue-chunk', 'queue-version', 0, 'Reviewed excerpt.', 'queue-text-hash', 'p1', 'p2');
    INSERT INTO provenance_groups (id, origin_type, explanation, determined_by, determination_method, reviewed_at)
      VALUES ('queue-group', 'research', 'Independent provenance.', 'publisher', 'editor_review', '2026-10-20T00:00:00Z');
    INSERT INTO claim_assertions (id, canonical_claim_id, source_document_version_id, source_chunk_id, legacy_claim_id, assertion_text, relationship, source_role, directness, evidence_treatment, admission_state, freshness_state, provenance_group_id, extraction_method, reviewer_state, reviewed_by, reviewed_at) VALUES
      ('queue-ready', 'queue-claim-ready', 'queue-version', 'queue-chunk', NULL, 'Ready assertion.', 'supports', 'evidence', 'direct', 'factual_support', 'admitted', 'unknown', 'queue-group', 'test', 'accepted', 'publisher', '2026-10-20T00:00:00Z'),
      ('queue-legacy', 'queue-claim-legacy', NULL, NULL, 960, 'Legacy assertion.', 'reports', 'evidence', 'unknown', 'factual_support', 'admitted', 'unknown', NULL, 'legacy_claim_evidence', 'accepted', 'publisher', '2026-07-20T00:00:00Z'),
      ('queue-proposed', 'queue-claim-proposed', 'queue-version', 'queue-chunk', NULL, 'Proposed assertion.', 'supports', 'evidence', 'direct', 'factual_support', 'pending', 'unknown', 'queue-group', 'test', 'proposed', NULL, NULL);
  `);
  database.sqlite.exec("PRAGMA foreign_keys = ON");
}

const database = new SQLiteD1();
try {
  seed(database);
  const queue = await listFreshnessQueue(database.asD1());
  const ids = queue.candidates.map((candidate) => candidate.assertionId).sort();
  assert.deepEqual(ids, ["queue-legacy", "queue-ready"], "only admitted, accepted, non-current assertions are candidates");
  const ready = queue.candidates.find((candidate) => candidate.assertionId === "queue-ready")!;
  assert.deepEqual(ready.blockers, [], "a captured, located, provenance-backed assertion has no blockers");
  assert.equal(ready.reason, "never_reviewed");
  const legacy = queue.candidates.find((candidate) => candidate.assertionId === "queue-legacy")!;
  assert.deepEqual(legacy.blockers, [
    "relationship_blocks_current", "provenance_blocks_current", "source_blocks_current",
    "source_version_blocks_current", "source_extraction_blocks_current", "locator_blocks_current", "source_url_blocks_current",
  ], "the legacy shape fails the same gates as Production's 210 accepted assertions");
  assert.equal(queue.totals.candidates, 2);
  assert.equal(queue.totals.pendingReviews, 0);

  // The queue's "no blockers" verdict agrees with the authoritative request path.
  const pending = await requestFreshnessReview(database.asD1(), {
    claimAssertionId: "queue-ready", proposedState: "current", sourceDocumentVersionId: "queue-version",
    reason: "Publisher checked the current version and locator.", actor: "publisher@example.com", idempotencyKey: "queue-review-1",
  });
  const afterRequest = await listFreshnessQueue(database.asD1());
  assert.deepEqual(afterRequest.candidates.map((candidate) => candidate.assertionId), ["queue-legacy"], "an assertion with a pending review leaves the candidate list");
  assert.deepEqual(afterRequest.pendingReviews.map((review) => review.reviewId), [pending.reviewId]);
  assert.equal(afterRequest.pendingReviews[0].proposedState, "current");

  await approveFreshnessReview(database.asD1(), pending.reviewId, "publisher@example.com", "Approved.");
  const afterApproval = await listFreshnessQueue(database.asD1());
  assert.equal(afterApproval.pendingReviews.length, 0);
  assert.deepEqual(afterApproval.candidates.map((candidate) => candidate.assertionId), ["queue-legacy"]);

  // A newer captured version makes a current assertion a candidate again.
  database.sqlite.exec(`
    INSERT INTO source_document_versions (id, source_document_id, content_hash, retrieved_url, retrieved_at, extraction_status, extraction_state, storage_state)
      VALUES ('queue-version-2', 'queue-document', 'queue-content-hash-2', 'https://queue.example/source', '2026-10-22T00:00:00Z', 'extracted', 'extracted', 'metadata_only');
    UPDATE source_documents SET current_version_id = 'queue-version-2' WHERE id = 'queue-document';
  `);
  const changed = (await listFreshnessQueue(database.asD1())).candidates[0];
  assert.equal(changed.assertionId, "queue-ready", "changed-version candidates sort first");
  assert.equal(changed.reason, "source_version_changed");
  assert.ok(changed.blockers.includes("source_version_blocks_current"), "re-promotion needs re-extraction against the new version");

  assert.equal((await listFreshnessQueue(database.asD1(), 10_000)).limit, FRESHNESS_QUEUE_LIMIT, "the queue is bounded");
} finally {
  database.close();
}

// D1 counts trigger-written rows: approving a stale proposal fires the expiry
// requeue trigger, so the assertion update reports two changes. The approval
// must still be reported as a fresh, applied decision rather than a replay.
const d1Faithful = new SQLiteD1();
try {
  seed(d1Faithful);
  d1Faithful.countTriggerChanges = true;
  const request = await requestFreshnessReview(d1Faithful.asD1(), {
    claimAssertionId: "queue-ready", proposedState: "stale",
    reason: "Source superseded.", actor: "publisher@example.com", idempotencyKey: "queue-stale-1",
  });
  const approved = await approveFreshnessReview(d1Faithful.asD1(), request.reviewId, "publisher@example.com");
  assert.equal(approved.state, "approved");
  assert.equal(approved.inserted, true, "a trigger-counted stale approval is reported as applied");
  assert.equal(approved.replay, false);
} finally {
  d1Faithful.close();
}

console.log("evidence freshness queue tests passed");
