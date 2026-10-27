import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DESK_OPEN_STATES, DESK_STATE_LABELS, DESK_TARGET_STATES, DESK_TRANSITIONS, deskTransitionAllowed } from "../src/lib/admin/desk-transitions";
import { AdminPageWriteError, promoteCandidate, transitionCandidate } from "../src/lib/server/admin-page-writes";
import { sourceUrlHash } from "../src/lib/server/source-identity";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE Desk `held` candidates (integration gap 2 in
// docs/audit/trace-p3-import-compatibility.md): intake such as the local news
// importer holds a candidate whose URL already belongs to a story cluster. A
// publisher releases it to needs_review or rejects it; each move is
// state-guarded and audited, and release never bypasses the source-identity
// rules promotion applies.

const PUBLISHER = { email: "publisher@example.test", role: "publisher" as const };
const READER = { email: "reader@example.test", role: "reader" as const };

// ---- The state machine ----
assert.equal(deskTransitionAllowed("held", "needs_review"), true);
assert.equal(deskTransitionAllowed("held", "rejected"), true);
for (const target of ["published", "new", "drafting", "draft_ready", "archived", "held"]) {
  assert.equal(deskTransitionAllowed("held", target), false, `held → ${target} is refused`);
}
assert.ok(!(DESK_TARGET_STATES as readonly string[]).includes("held"), "the Desk never moves a candidate into held");
for (const [from, targets] of Object.entries(DESK_TRANSITIONS)) {
  for (const target of targets) {
    assert.ok((DESK_TARGET_STATES as readonly string[]).includes(target), `${from} → ${target} is a valid target`);
    assert.notEqual(target, "published", `${from} cannot publish by transition; only promotion publishes`);
  }
}
assert.equal(deskTransitionAllowed("unknown", "needs_review"), false);
assert.equal(deskTransitionAllowed("needs_review", "bogus"), false);
assert.ok(DESK_OPEN_STATES.has("held"), "held candidates get their source notice");
assert.equal(DESK_STATE_LABELS.held, "Held");
// Every state the schema allows that the Desk lists has a rule (no silent dead ends).
const schemaStates = /state TEXT NOT NULL DEFAULT 'new' CHECK\(state IN \(([^)]+)\)\)/.exec(readFileSync("db/schema.sql", "utf8"))![1]
  .split(",").map((state) => state.trim().replace(/'/g, ""));
for (const state of Object.keys(DESK_TRANSITIONS)) assert.ok(schemaStates.includes(state), `${state} is a schema state`);
// The page checks transitions with the shared rules, not a private copy.
const deskPage = readFileSync("src/pages/admin/desk.astro", "utf8");
assert.match(deskPage, /deskTransitionAllowed\(current\.state, newState\)/);
assert.doesNotMatch(deskPage, /const TRANSITIONS|const VALID_STATES/);

// ---- Audited, publisher-only writes on held candidates ----
const db = new SQLiteD1();
db.countTriggerChanges = true;
const d1 = db.asD1();
const n = (sql: string, ...params: Array<string | number>) => Number((db.sqlite.prepare(sql).get(...params) as { n: number }).n);
const audits = () => db.sqlite.prepare("SELECT operator_email, operator_role, action, target_id, outcome, detail_code FROM admin_audit_log ORDER BY id")
  .all().map((row) => ({ ...row })) as Array<Record<string, string | null>>;
const stateOf = (id: string) => (db.sqlite.prepare("SELECT state FROM editorial_candidates WHERE id = ?").get(id) as { state: string }).state;

// A source item already clustered (ingestion), a withdrawn story's source, and held candidates for both.
const CLUSTERED = "https://wire.example/lab-release";
const WITHDRAWN = "https://wire.example/withdrawn-paper";
db.sqlite.exec(`
  INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
    (801, 1, '${CLUSTERED}', '${await sourceUrlHash(CLUSTERED)}', 'Lab release', 'clustered'),
    (802, 1, '${WITHDRAWN}', '${await sourceUrlHash(WITHDRAWN)}', 'Withdrawn paper', 'published');
  INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status) VALUES
    (811, 'lab-release', 'Lab release', 'models', 'S', 'vendor_reported', 'draft');
  INSERT INTO story_clusters (id, slug, title, topic, summary, evidence_status, publication_status, published_at, reviewed_by, reviewed_at) VALUES
    (812, 'withdrawn-paper', 'Withdrawn paper', 'models', 'S', 'vendor_reported', 'withdrawn', '2026-07-01T00:00:00Z', 'p', '2026-07-01T00:00:00Z');
  INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (811, 801, 1), (812, 802, 1);
`);
for (const [id, url] of [["held-release", CLUSTERED], ["held-reject", CLUSTERED], ["held-retired", WITHDRAWN]] as const) {
  db.sqlite.prepare("INSERT INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, created_by) VALUES (?, 'manual_url', ?, 'Imported lead', ?, 'held', 'importer@example.test')")
    .run(id, url, await sourceUrlHash(url));
}
const promote = async (candidateId: string, url: string) => promoteCandidate(d1, PUBLISHER, {
  candidateId, submittedUrl: url, urlHash: await sourceUrlHash(url), headline: "Imported headline", summary: "Imported summary", topic: "models", evidenceStatus: "vendor_reported",
});
const clustersBefore = n("SELECT COUNT(*) AS n FROM story_clusters");

// A held candidate cannot be promoted until it is released.
assert.equal((await promote("held-release", CLUSTERED)).kind, "not_promotable");
assert.equal(stateOf("held-release"), "held");
assert.equal(audits().length, 0, "a refused promotion writes nothing");

// Readers cannot release or reject.
await assert.rejects(transitionCandidate(d1, READER, "held-release", "held", "needs_review"), AdminPageWriteError);
await assert.rejects(transitionCandidate(d1, undefined, "held-release", "held", "needs_review"), AdminPageWriteError);
assert.equal(stateOf("held-release"), "held");
assert.equal(audits().length, 0);

// Release: one state change and one attributed audit row.
assert.equal(await transitionCandidate(d1, PUBLISHER, "held-release", "held", "needs_review"), true);
assert.equal(stateOf("held-release"), "needs_review");
assert.deepEqual(audits(), [{
  operator_email: PUBLISHER.email, operator_role: "publisher", action: "transition_candidate",
  target_id: "held-release", outcome: "succeeded", detail_code: "held->needs_review",
}]);
// A repeated or concurrent release is refused without a second audit row.
assert.equal(await transitionCandidate(d1, PUBLISHER, "held-release", "held", "needs_review"), false);
assert.equal(audits().length, 1);

// Once released, promotion applies the source-identity rules: it reuses the existing cluster.
const reused = await promote("held-release", CLUSTERED);
assert.equal(reused.kind, "reused");
assert.equal((reused as { clusterId: number }).clusterId, 811);
assert.equal(n("SELECT COUNT(*) AS n FROM story_clusters"), clustersBefore, "release never creates a duplicate cluster");

// Reject: audited, and the rejected candidate leaves the open states.
assert.equal(await transitionCandidate(d1, PUBLISHER, "held-reject", "held", "rejected"), true);
assert.equal(stateOf("held-reject"), "rejected");
assert.equal(audits().at(-1)!.detail_code, "held->rejected");
assert.equal(DESK_OPEN_STATES.has(stateOf("held-reject")), false);

// A held candidate whose source is only in a withdrawn story: release is allowed, republication is not.
assert.equal(await transitionCandidate(d1, PUBLISHER, "held-retired", "held", "needs_review"), true);
const refused = await promote("held-retired", WITHDRAWN);
assert.equal(refused.kind, "conflict");
assert.equal((refused as { reason: string }).reason, "retired");
assert.equal(stateOf("held-retired"), "needs_review", "a refused promotion leaves the candidate for an editor");
assert.equal((db.sqlite.prepare("SELECT publication_status FROM story_clusters WHERE id = 812").get() as { publication_status: string }).publication_status, "withdrawn");
assert.equal(n("SELECT COUNT(*) AS n FROM story_clusters"), clustersBefore);

db.close();
console.log("Desk held transition tests passed");
