import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { promoteCandidate } from "../src/lib/server/admin-page-writes";
import { loadCandidateSourceRelationships } from "../src/lib/server/source-conflicts";
import { canonicalSourceUrl, sourceUrlHash } from "../src/lib/server/source-identity";
import { runClustering } from "../workers/ingestion/cluster";
import { hashURL } from "../workers/ingestion/dedup";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE-RESTORE-02 Milestone F: the contract between TRACE-EDITORIAL-DEDUPE-R1
// and Codex's local news importer (TRACE-LOCAL-NEWS-P3, e50825c). This does not
// import, fetch or run the P3 code (Codex-owned); it pins what P3 relies on and
// checks how TRACE treats rows shaped exactly like P3's documented writes.

const fixture = JSON.parse(readFileSync("tests/fixtures/p3-identity-contract.json", "utf8")) as {
  interface_files: Record<string, string>;
  canonical_url_vectors: Array<{ input: string; canonical: string; url_hash: string }>;
};
const PUBLISHER = { email: "publisher@example.test", role: "publisher" as const };

// 1. The interface files P3 mirrors are byte-identical to its pinned editorial commit.
for (const [path, sha256] of Object.entries(fixture.interface_files)) {
  // Git blobs (and CI checkouts) use LF; a Windows working copy may use CRLF.
  const current = createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex");
  assert.equal(current, sha256, `${path} changed since the P3 pin: coordinate a new pin with Codex before merging`);
}

// 2. Canonical URL and url_hash: TRACE's two implementations agree with independently hashed vectors.
for (const vector of fixture.canonical_url_vectors) {
  assert.equal(canonicalSourceUrl(vector.input), vector.canonical, vector.input);
  assert.equal(createHash("sha256").update(vector.canonical).digest("hex"), vector.url_hash, "the fixture hash is SHA-256 of the canonical URL");
  assert.equal(await sourceUrlHash(vector.input), vector.url_hash, `Desk identity for ${vector.input}`);
  assert.equal(await hashURL(vector.input), vector.url_hash, `ingestion identity for ${vector.input}`);
}

// 3. Rows shaped like P3's writes (raw feed item + needs_review/held candidate, source_hash = url_hash).
const db = new SQLiteD1();
db.countTriggerChanges = true;
const d1 = db.asD1();
const classification = JSON.stringify({ classification: { topics: ["models"], models: [], providers: [], itemTypes: [], classificationConfidence: 60 }, importer: "trace-local-editorial-import-p3.1", review_required: true, untrusted_source_text: true });
async function p3Import(id: number, url: string, state: "needs_review" | "held"): Promise<string> {
  const urlHash = await sourceUrlHash(url);
  db.sqlite.prepare(`INSERT OR IGNORE INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, ingestion_status, fetched_at, raw_metadata) VALUES (?, 1, ?, ?, 'Imported', 'Excerpt', 'raw', datetime('now'), ?)`).run(id, canonicalSourceUrl(url), urlHash, classification);
  const candidateId = `local-news:${urlHash}`;
  db.sqlite.prepare(`INSERT OR IGNORE INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, urgency, created_by) VALUES (?, 'manual_url', ?, 'Imported title\n\nExcerpt', ?, ?, 'normal', ?)`).run(candidateId, canonicalSourceUrl(url), urlHash, state, PUBLISHER.email);
  return candidateId;
}
const promote = async (candidateId: string, url: string) => promoteCandidate(d1, PUBLISHER, {
  candidateId, submittedUrl: canonicalSourceUrl(url), urlHash: await sourceUrlHash(url), headline: "Imported headline", summary: "Imported summary", topic: "models", evidenceStatus: "unverified",
});

// 3a. A new imported source: reviewable, promotable once, never published by import; a replay creates nothing.
{
  const url = "https://deepmind.google/blog/new-model/?utm_source=rss";
  const candidate = await p3Import(9601, url, "needs_review");
  assert.equal((await loadCandidateSourceRelationships(d1, [{ id: candidate, submittedUrl: canonicalSourceUrl(url) }])).get(candidate)?.kind, "new");
  const before = Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM feed_items").get() as { n: number }).n);
  await p3Import(9699, url, "needs_review");
  assert.equal(Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM feed_items").get() as { n: number }).n), before, "a replay cannot add a second feed item (unique url_hash)");
  const outcome = await promote(candidate, url);
  assert.equal(outcome.kind, "created");
  const cluster = db.sqlite.prepare("SELECT publication_status, primary_source_key FROM story_clusters WHERE id = ?").get((outcome as { clusterId: number }).clusterId) as { publication_status: string; primary_source_key: string };
  assert.equal(cluster.publication_status, "review", "promotion yields a review cluster, never a published story");
  assert.equal(cluster.primary_source_key, `src:${await sourceUrlHash(url)}`);
  // When ingestion later classifies the imported item, clustering settles it instead of duplicating it.
  db.sqlite.prepare("UPDATE feed_items SET ingestion_status = 'classified' WHERE id = 9601").run();
  const run = await runClustering(d1);
  assert.deepEqual([run.clusters, run.alreadyClustered], [0, 1]);
}

// 3b. An imported URL whose story was withdrawn: held, refused on promotion, never re-clustered.
{
  const url = "https://machinelearning.apple.com/research/withdrawn-paper";
  db.sqlite.prepare(`INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (9610, 1, ?, ?, 'Old', 'published')`).run(url, await sourceUrlHash(url));
  db.sqlite.exec(`INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, published_at, reviewed_by, reviewed_at) VALUES (9611, 'withdrawn-paper', 'Withdrawn paper', 'models', 'S', 'vendor_reported', 'withdrawn', '2026-07-01T00:00:00Z', 'p', '2026-07-01T00:00:00Z'); INSERT INTO story_cluster_members VALUES (9611, 9610, 1);`);
  const candidate = await p3Import(9612, url, "held");
  assert.equal(Number((db.sqlite.prepare("SELECT COUNT(*) AS n FROM feed_items WHERE url_hash = ?").get(await sourceUrlHash(url)) as { n: number }).n), 1, "the import reuses the existing feed item");
  assert.equal((await loadCandidateSourceRelationships(d1, [{ id: candidate, submittedUrl: url }])).get(candidate)?.kind, "retired");
  db.sqlite.prepare("UPDATE editorial_candidates SET state = 'needs_review' WHERE id = ?").run(candidate);
  const outcome = await promote(candidate, url);
  assert.equal(outcome.kind, "conflict", "a withdrawn source cannot be silently republished through promotion");
  db.sqlite.prepare("UPDATE feed_items SET ingestion_status = 'classified', fetched_at = datetime('now'), raw_metadata = ? WHERE id = 9610").run(classification);
  assert.equal((await runClustering(d1)).clusters, 0, "nor through clustering");
  assert.equal((db.sqlite.prepare("SELECT publication_status FROM story_clusters WHERE id = 9611").get() as { publication_status: string }).publication_status, "withdrawn");
}

// 3c. A candidate from the Worker capture route uses a different source_hash, but review still sees the shared URL.
{
  const url = "https://github.com/huggingface/transformers/releases/tag/v5.0.0";
  const candidate = await p3Import(9620, url, "needs_review");
  assert.equal((await promote(candidate, url)).kind, "created");
  db.sqlite.prepare(`INSERT INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, urgency, created_by) VALUES ('capture-x', 'manual_url', ?, 'Captured', 'capture-route-hash-not-url-hash', 'needs_review', 'normal', 'p')`).run(url);
  assert.equal((await loadCandidateSourceRelationships(d1, [{ id: "capture-x", submittedUrl: url }])).get("capture-x")?.kind, "exact", "review identifies the shared source by URL even when source_hash differs");
}

db.close();
console.log("P3 import contract tests passed");
