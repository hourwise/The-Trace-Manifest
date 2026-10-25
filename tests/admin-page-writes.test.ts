import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AdminPageWriteError,
  promoteCandidate,
  recordCandidate,
  recordSocialSignal,
  reviewSocialSignal,
  transitionCandidate,
} from "../src/lib/server/admin-page-writes";
import { SQLiteD1 } from "./sqlite-d1";

// Remediation of the D4 follow-up findings: /admin/desk and /admin/social write
// D1 from page frontmatter. Every write must be attributed to the signed-in
// publisher and committed with its admin_audit_log row, and approving a social
// signal must not create knowledge (ADR 0009).

const PUBLISHER = { email: "publisher@example.test", role: "publisher" as const };
const READER = { email: "reader@example.test", role: "reader" as const };

function database(): SQLiteD1 {
  const db = new SQLiteD1();
  db.sqlite.exec(readFileSync("db/migration-0024-social-signals.sql", "utf8"));
  return db;
}

const count = (db: SQLiteD1, sql: string, ...params: Array<string | number>) =>
  Number((db.sqlite.prepare(sql).get(...params) as { n: number }).n);
const audits = (db: SQLiteD1) => db.sqlite.prepare(
  "SELECT operator_email, operator_role, action, target_type, target_id, outcome, detail_code FROM admin_audit_log ORDER BY id",
).all().map((row) => ({ ...row })) as Array<Record<string, string | null>>;

/** The cluster id of a "created" promotion outcome. */
function createdCluster(outcome: Awaited<ReturnType<typeof promoteCandidate>>): number {
  assert.equal(outcome.kind, "created", JSON.stringify(outcome));
  return (outcome as { clusterId: number }).clusterId;
}

const candidateInput = {
  intakeType: "manual_url", submittedUrl: "https://news.example/a", leadText: "A lead about a model release",
  sourceHash: "hash-a", section: null, urgency: "normal", sourceLanguage: null,
};

// Desk: submission is attributed and audited in the same batch.
{
  const db = database();
  const id = await recordCandidate(db.asD1(), PUBLISHER, candidateInput);
  assert.equal(db.sqlite.prepare("SELECT created_by FROM editorial_candidates WHERE id = ?").get(id)?.created_by, PUBLISHER.email);
  assert.deepEqual(audits(db), [{
    operator_email: PUBLISHER.email, operator_role: "publisher", action: "submit_candidate",
    target_type: "candidate", target_id: id, outcome: "succeeded", detail_code: "intake:manual_url",
  }]);

  // Transition: guarded by the state that was read; a stale state writes nothing.
  assert.equal(await transitionCandidate(db.asD1(), PUBLISHER, id, "new", "drafting"), true);
  assert.equal(await transitionCandidate(db.asD1(), PUBLISHER, id, "new", "rejected"), false, "a stale transition is refused");
  assert.equal(db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(id)?.state, "drafting");
  const transitions = audits(db).filter((row) => row.action === "transition_candidate");
  assert.equal(transitions.length, 1, "a refused transition leaves no audit row");
  assert.equal(transitions[0].detail_code, "new->drafting");
  assert.equal(transitions[0].operator_email, PUBLISHER.email);
}

// Desk: promotion writes cluster, source link, state and audit together.
{
  const db = database();
  const id = await recordCandidate(db.asD1(), PUBLISHER, candidateInput);
  db.sqlite.prepare("UPDATE editorial_candidates SET state = 'needs_review' WHERE id = ?").run(id);
  // The URL was already ingested: the cluster must link the existing feed item.
  db.sqlite.exec("INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES (77, 1, 'https://news.example/a', 'url-hash-a', 'Existing', 'raw')");
  const clusterId = createdCluster(await promoteCandidate(db.asD1(), PUBLISHER, {
    candidateId: id, submittedUrl: "https://news.example/a", urlHash: "url-hash-a",
    headline: "A lead about a model release", summary: "Summary", topic: "general", evidenceStatus: "vendor_reported",
  }));
  const cluster = db.sqlite.prepare("SELECT publication_status, needs_human_review, evidence_status FROM story_clusters WHERE id = ?").get(clusterId);
  assert.deepEqual({ ...cluster }, { publication_status: "review", needs_human_review: 1, evidence_status: "vendor_reported" });
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM story_cluster_members WHERE cluster_id = ? AND feed_item_id = 77", clusterId), 1,
    "the already-ingested feed item is linked to the new cluster");
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM feed_items"), 1, "no duplicate feed item");
  assert.equal(db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(id)?.state, "published");
  const promotion = audits(db).find((row) => row.action === "promote_candidate_to_cluster");
  assert.equal(promotion?.operator_email, PUBLISHER.email, "promotion is no longer attributed to 'Admin'");
  assert.equal(promotion?.target_id, id);
  assert.equal(promotion?.detail_code, `story_cluster:${clusterId}`, "the audit row records the cluster it created");

  // Repeating the promotion (double submit, second tab, or the old Promote button
  // on a published candidate) creates no second cluster, link, feed item or audit row.
  const snapshot = () => [
    count(db, "SELECT COUNT(*) AS n FROM story_clusters"),
    count(db, "SELECT COUNT(*) AS n FROM story_cluster_members"),
    count(db, "SELECT COUNT(*) AS n FROM feed_items"),
    count(db, "SELECT COUNT(*) AS n FROM admin_audit_log"),
  ];
  const beforeRepeat = snapshot();
  assert.deepEqual(await promoteCandidate(db.asD1(), PUBLISHER, {
    candidateId: id, submittedUrl: "https://news.example/a", urlHash: "url-hash-a",
    headline: "Again", summary: "Again", topic: "general", evidenceStatus: "vendor_reported",
  }), { kind: "not_promotable" }, "a published candidate cannot be promoted again");
  assert.deepEqual(snapshot(), beforeRepeat, "a repeated promotion writes nothing");

  // A candidate not in needs_review, with an unseen URL, is refused whole.
  const fresh = await recordCandidate(db.asD1(), PUBLISHER, { ...candidateInput, submittedUrl: "https://news.example/c", sourceHash: "hash-c" });
  const beforeFresh = snapshot();
  assert.deepEqual(await promoteCandidate(db.asD1(), PUBLISHER, {
    candidateId: fresh, submittedUrl: "https://news.example/c", urlHash: "url-hash-c",
    headline: "C", summary: "C", topic: "general", evidenceStatus: "unverified",
  }), { kind: "not_promotable" });
  assert.deepEqual(snapshot(), beforeFresh, "a refused promotion leaves no orphan cluster or feed item");
  assert.equal(db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(fresh)?.state, "new");

  // A new URL gets a new feed item and its link.
  const second = await recordCandidate(db.asD1(), PUBLISHER, { ...candidateInput, submittedUrl: "https://news.example/b", sourceHash: "hash-b" });
  db.sqlite.prepare("UPDATE editorial_candidates SET state = 'needs_review' WHERE id = ?").run(second);
  const secondCluster = createdCluster(await promoteCandidate(db.asD1(), PUBLISHER, {
    candidateId: second, submittedUrl: "https://news.example/b", urlHash: "url-hash-b",
    headline: "B", summary: "B summary", topic: "general", evidenceStatus: "unverified",
  }));
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM story_cluster_members m JOIN feed_items f ON f.id = m.feed_item_id WHERE m.cluster_id = ? AND f.url_hash = 'url-hash-b'", secondCluster), 1);
}

// Atomicity: if the audit row cannot be written, the write is rolled back too.
{
  const db = database();
  db.sqlite.exec("DROP TABLE admin_audit_log");
  await assert.rejects(recordCandidate(db.asD1(), PUBLISHER, candidateInput));
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM editorial_candidates"), 0, "no candidate without its audit row");
  await assert.rejects(recordSocialSignal(db.asD1(), PUBLISHER, {
    platform: "reddit", canonicalUrl: "https://reddit.example/x", canonicalUrlHash: "sig-x", reason: "Worth reviewing now", authorDisplayName: null, authorHandle: null, notes: "",
  }));
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM social_signals"), 0, "no signal without its audit row");
}

// Social: submission and review are attributed; approval creates no knowledge.
{
  const db = database();
  await recordSocialSignal(db.asD1(), PUBLISHER, {
    platform: "reddit", canonicalUrl: "https://reddit.example/x", canonicalUrlHash: "sig-x", reason: "Worth reviewing now", authorDisplayName: "A", authorHandle: "@a", notes: "",
  });
  const signal = db.sqlite.prepare("SELECT id, submitted_by FROM social_signals").get() as { id: number; submitted_by: string };
  assert.equal(signal.submitted_by, PUBLISHER.email);
  assert.deepEqual(audits(db).map((row) => [row.action, row.target_id, row.operator_email]), [["submit_social_signal", String(signal.id), PUBLISHER.email]]);

  const knowledgeBefore = count(db, "SELECT COUNT(*) AS n FROM knowledge_documents");
  assert.equal(await reviewSocialSignal(db.asD1(), PUBLISHER, signal.id, "approve", "TRACE summary"), true);
  const reviewed = db.sqlite.prepare("SELECT review_status, reviewed_by, trace_summary FROM social_signals WHERE id = ?").get(signal.id);
  assert.deepEqual({ ...reviewed }, { review_status: "approved", reviewed_by: PUBLISHER.email, trace_summary: "TRACE summary" });
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM knowledge_documents"), knowledgeBefore, "approval creates no knowledge document");

  // An already-reviewed signal is not re-decided, and no audit row is added.
  assert.equal(await reviewSocialSignal(db.asD1(), PUBLISHER, signal.id, "reject", null), false);
  assert.equal(await reviewSocialSignal(db.asD1(), PUBLISHER, 9999, "approve", null), false, "a missing signal changes nothing");
  assert.equal(db.sqlite.prepare("SELECT review_status FROM social_signals WHERE id = ?").get(signal.id)?.review_status, "approved");
  assert.deepEqual(audits(db).map((row) => row.action), ["submit_social_signal", "approve_social_signal"]);
}

// Defence in depth: the helpers refuse anyone but a publisher, before any statement.
{
  const db = database();
  const before = db.statementLog.length;
  for (const operator of [READER, undefined]) {
    await assert.rejects(recordCandidate(db.asD1(), operator, candidateInput), AdminPageWriteError);
    await assert.rejects(transitionCandidate(db.asD1(), operator, "x", "new", "drafting"), AdminPageWriteError);
    await assert.rejects(reviewSocialSignal(db.asD1(), operator, 1, "approve", null), AdminPageWriteError);
  }
  assert.equal(db.statementLog.length, before, "a refused operator runs no statement");
}

// The pages use these helpers: no 'Admin' attribution, no direct writes, no knowledge insert.
{
  const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const frontmatter = (source: string) => source.slice(0, source.indexOf("\n---", 4));
  for (const page of ["src/pages/admin/desk.astro", "src/pages/admin/social.astro"]) {
    const fm = frontmatter(read(page));
    assert.doesNotMatch(fm, /'Admin'/, `${page} attributes writes to the operator`);
    assert.doesNotMatch(fm, /\b(INSERT|UPDATE|DELETE)\b/, `${page} writes only through admin-page-writes`);
    assert.match(fm, /from "\.\.\/\.\.\/lib\/server\/admin-page-writes"/);
  }
  assert.doesNotMatch(read("src/pages/admin/social.astro"), /knowledge_documents/, "Social approval does not touch knowledge_documents");

  // Desk offers and accepts promotion only from needs_review.
  const desk = read("src/pages/admin/desk.astro");
  assert.match(desk, /const isPromotable = c\.state === "needs_review";/);
  assert.match(frontmatter(desk), /SELECT \* FROM editorial_candidates WHERE id=\? AND state='needs_review'/);
  assert.match(frontmatter(desk), /if \(outcome\.kind === "not_promotable"\) throw new Error/);
}

console.log("admin page write attribution tests passed");
