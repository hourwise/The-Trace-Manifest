import assert from "node:assert/strict";
import { promoteCandidate, recordCandidate } from "../src/lib/server/admin-page-writes";
import { getPublishedStories, getPublishedStoryBySlug } from "../src/lib/server/d1";
import { MockEmailTransport, processEmailOutbox } from "../src/lib/server/email-outbox";
import { confirmNewsletterSubscription, requestNewsletterSignup, unsubscribeNewsletter } from "../src/lib/server/newsletter";
import {
  approveIssue, dispatchedIssueRenderer, generateIssueDraft, markIssueReady, queueIssueDispatch, selectWeeklyStories, weeklyWindow,
} from "../src/lib/server/newsletter-issues";
import { listReviewQueueClusters } from "../src/lib/server/review-queue";
import { loadClusterSourceConflicts } from "../src/lib/server/source-conflicts";
import { sourceUrlHash } from "../src/lib/server/source-identity";
import { runClustering } from "../workers/ingestion/cluster";
import { deduplicateURL, hashURL } from "../workers/ingestion/dedup";
import type { Env } from "../workers/ingestion/index";
import { publishStory, updateStoryStatus } from "../workers/ingestion/publish";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-01 Task F: the integrated lifecycle across #10 (retired pages),
// #11 (cross-pipeline identity), #12 (review conflicts), #13 (signup and
// outbox) and #14 (weekly issues), on one D1-faithful database (trigger-counted
// changes, as on Production). Synthetic data and a mock transport only.

const PUBLISHER = { email: "publisher@example.test", role: "publisher" as const };
const db = new SQLiteD1();
db.countTriggerChanges = true;
const d1 = db.asD1();
const workerEnv = { DB: d1, RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: "s".repeat(32) } as unknown as Env;
const n = (sql: string, ...params: Array<string | number>) => Number((db.sqlite.prepare(sql).get(...params) as { n: number }).n);
const classification = JSON.stringify({ classification: { topics: ["models"], models: [], providers: ["lab"], itemTypes: [], classificationConfidence: 60 } });
db.sqlite.exec(`INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (901, 'Lifecycle Wire', 'https://wire.example', 'B', 'B', 'vendor-reported', 'rss')`);
async function discover(id: number, url: string, title: string, fetchedAt = "now"): Promise<void> {
  db.sqlite.prepare(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, ingestion_status, fetched_at, published_at, raw_metadata)
    VALUES (?, 901, ?, ?, ?, 'Excerpt', 'classified', datetime(?), datetime(?), ?)
  `).run(id, url, await hashURL(url), title, fetchedAt, fetchedAt, classification);
}
const clustersOf = (feedItemId: number) => (db.sqlite.prepare("SELECT cluster_id FROM story_cluster_members WHERE feed_item_id = ?").all(feedItemId) as Array<{ cluster_id: number }>).map((row) => row.cluster_id);
const candidate = async (url: string) => {
  const id = await recordCandidate(d1, PUBLISHER, { intakeType: "manual_url", submittedUrl: url, leadText: "A lead about the lab release", sourceHash: await sourceUrlHash(url), section: null, urgency: "normal", sourceLanguage: null });
  db.sqlite.prepare("UPDATE editorial_candidates SET state = 'needs_review' WHERE id = ?").run(id);
  return id;
};
const promote = async (candidateId: string, url: string) => promoteCandidate(d1, PUBLISHER, {
  candidateId, submittedUrl: url, urlHash: await sourceUrlHash(url), headline: "Lab release", summary: "Lab release summary", topic: "models", evidenceStatus: "vendor_reported",
});

// ---- F1: story lifecycle with competing intake paths ----
// Discovery → feed item → cluster identity.
const RELEASE = "https://wire.example/lab-release";
await discover(5001, RELEASE, "Lab releases its reasoning model");
assert.equal((await runClustering(d1)).clusters, 1);
const [storyId] = clustersOf(5001);
assert.equal(n("SELECT COUNT(*) AS n FROM story_clusters WHERE id = ? AND primary_source_key = ?", storyId, `src:${await sourceUrlHash(RELEASE)}`), 1);

// Competing intake: Desk promotion of the same URL reuses the ingestion cluster.
const reused = await promote(await candidate(RELEASE), RELEASE);
assert.equal(reused.kind, "reused");
assert.deepEqual(clustersOf(5001), [storyId], "one source item, one cluster");
assert.equal((await runClustering(d1)).clusters, 0, "re-running ingestion is idempotent");

// Review queue: pending, single-source, no duplicate warning.
const pending = await listReviewQueueClusters(d1, { scope: "pending-review", limit: 50 });
assert.ok(pending.some((item) => item.id === storyId), "the single-source vendor story waits for review");
assert.equal((await loadClusterSourceConflicts(d1, [storyId])).has(storyId), false);

// Evidence review and publication (Worker publish under D1 change counting).
const published = await publishStory(workerEnv, { clusterId: storyId, summary: "The lab released a reasoning model; details are vendor-reported.", reviewedBy: PUBLISHER.email });
assert.equal(published.success, true, published.error);
const slug = published.story!.slug;
assert.equal((await getPublishedStoryBySlug(d1, slug))?.publicationStatus, "published");
assert.ok((await getPublishedStories(d1, { limit: 50 })).some((story) => story.slug === slug), "the public listing shows it");

// A legitimate follow-up on a new URL becomes its own story, with no false conflict.
await discover(5002, "https://wire.example/lab-release-benchmarks", "Benchmarks for the lab model arrive");
assert.equal((await runClustering(d1)).clusters, 1);
const [followUpId] = clustersOf(5002);
assert.notEqual(followUpId, storyId);
assert.equal((await loadClusterSourceConflicts(d1, [followUpId])).has(followUpId), false, "different source items are not flagged as duplicates");

// Promotion first, then ingestion of the same URL: still one cluster.
const PROMOTED_FIRST = "https://wire.example/desk-first";
const created = await promote(await candidate(PROMOTED_FIRST), PROMOTED_FIRST);
assert.equal(created.kind, "created");
const promotedItem = Number((db.sqlite.prepare("SELECT id FROM feed_items WHERE url_hash = ?").get(await sourceUrlHash(PROMOTED_FIRST)) as { id: number }).id);
db.sqlite.prepare("UPDATE feed_items SET ingestion_status = 'classified', fetched_at = datetime('now'), raw_metadata = ? WHERE id = ?").run(classification, promotedItem);
assert.equal((await runClustering(d1)).alreadyClustered, 1);
assert.equal(clustersOf(promotedItem).length, 1);

// ---- F2: newsletter lifecycle on the same data ----
const ENV = { DB: d1, TRACE_ENVIRONMENT: "test", TRACE_NEWSLETTER_SIGNUP_ENABLED: "true", TRACE_NEWSLETTER_SECRET: "n".repeat(40), TRACE_VISITOR_HASH_SECRET: "v".repeat(40) };
const transport = new MockEmailTransport();
const outbox = (now: Date) => processEmailOutbox({ db: d1, transport, secret: ENV.TRACE_NEWSLETTER_SECRET, from: "TRACE Weekly <weekly@thetracemanifest.com>", siteUrl: "https://thetracemanifest.com", now, renderIssue: dispatchedIssueRenderer(d1, "https://thetracemanifest.com") });
const today = new Date();
const issueDate = today.toISOString().slice(0, 10);
assert.equal((await requestNewsletterSignup(ENV, { email: "reader@example.test", networkIdentity: "198.51.100.90" }, today)).status, "accepted");
await outbox(today);
const confirmToken = decodeURIComponent(/token=([^\s]+)/.exec(transport.sent[0].text)![1]);
assert.equal(await confirmNewsletterSubscription(ENV, confirmToken, today), "confirmed");

// The weekly draft contains the published story only (not the unpublished follow-up or the review cluster).
const window = weeklyWindow(issueDate);
assert.deepEqual((await selectWeeklyStories(d1, window)).map((story) => story.id), [storyId]);
const issue = (await generateIssueDraft(d1, PUBLISHER, { issueDate }) as { issue: { id: string; contentHash: string } }).issue;
assert.equal((await approveIssue(d1, PUBLISHER, issue.id, issue.contentHash)).status, "approved");
assert.equal((await markIssueReady(d1, PUBLISHER, issue.id)).status, "ready");
assert.deepEqual(await queueIssueDispatch(d1, PUBLISHER, issue.id, { dispatchEnabled: false }), { status: "disabled" }, "dispatch stays off by default");
assert.deepEqual(await queueIssueDispatch(d1, PUBLISHER, issue.id, { dispatchEnabled: true }), { status: "queued", recipients: 1 });
assert.equal((await outbox(today)).sent, 1);
const issueEmail = transport.sent.at(-1)!;
assert.match(issueEmail.html, new RegExp(`/stories/${slug}`), "the issue links the published story");
const unsubscribeToken = decodeURIComponent(/\/newsletter\/unsubscribe\?token=([^\s>]+)/.exec(issueEmail.text)![1]);

// ---- Correction/withdrawal flows through every surface ----
assert.equal((await updateStoryStatus(workerEnv, storyId, "withdrawn", "Published in error during lifecycle test.")).success, true);
assert.equal(await getPublishedStoryBySlug(d1, slug), null, "listings and the published-only loader drop it");
assert.equal((await getPublishedStoryBySlug(d1, slug, { includeRetired: true }))?.publicationStatus, "withdrawn", "its page stays public as withdrawn (#10)");
assert.deepEqual(await selectWeeklyStories(d1, window), [], "a withdrawn story never enters a new issue");
// Ingestion meeting the same URL again (with tracking parameters) finds the existing item, so the withdrawn source cannot return as a new story.
assert.equal((await deduplicateURL(d1, await hashURL(RELEASE + "?utm_source=again")))?.id, 5001);

// Unsubscribe and suppression end the subscription for future issues.
assert.equal(await unsubscribeNewsletter(ENV, unsubscribeToken, today), "unsubscribed");
assert.equal(n("SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE email IS NOT NULL"), 0);

db.close();
console.log("TRACE-RESTORE-01 lifecycle tests passed");
