import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESK_QUEUE_DEFAULT_FILTER, DESK_QUEUE_FILTERS, DESK_QUEUE_PAGE_SIZE,
  decodeDeskQueueCursor, encodeDeskQueueCursor, loadDeskQueue, parseDeskQueueFilter,
} from "../src/lib/server/desk-queue";
import { DESK_STATE_LABELS } from "../src/lib/admin/desk-transitions";
import { SQLiteD1 } from "./sqlite-d1";

// TRACE Desk queue filter: candidates waiting on an editor (held, then
// needs_review) lead the default view and are never pushed off it by newer
// intake; every filter shows its count and pages by keyset without gaps or
// repeats; listing writes nothing.

// ---- Filter and cursor parsing ----
assert.equal(DESK_QUEUE_DEFAULT_FILTER, "decide");
assert.equal(DESK_QUEUE_FILTERS[0], "decide", "the decision filter comes first");
assert.equal(DESK_QUEUE_FILTERS[1], "held");
assert.equal(DESK_QUEUE_FILTERS[2], "needs_review");
for (const key of DESK_QUEUE_FILTERS) {
  if (key !== "decide" && key !== "all") assert.ok(key in DESK_STATE_LABELS, `${key} is a Desk state`);
}
assert.equal(parseDeskQueueFilter(null), "decide");
assert.equal(parseDeskQueueFilter("held"), "held");
assert.equal(parseDeskQueueFilter("new' OR 1=1 --"), "decide", "an unknown filter falls back to the default");
assert.equal(parseDeskQueueFilter("failed"), "decide", "states without a filter are reached through All");
const cursor = { rank: 1, createdAt: "2026-10-01 10:00:00", id: "c-1" };
assert.deepEqual(decodeDeskQueueCursor(encodeDeskQueueCursor(cursor)), cursor);
for (const bad of ["", "not base64!", "x".repeat(401), btoa("2\u0000a\u0000b"), btoa("0\u0000a"), btoa("0\u0000a\u0000b\u0000c")]) {
  assert.equal(decodeDeskQueueCursor(bad), null, `malformed cursor ${JSON.stringify(bad.slice(0, 20))} restarts`);
}

// ---- Listing against SQLite D1 ----
const db = new SQLiteD1();
const d1 = db.asD1();
const insert = db.sqlite.prepare("INSERT INTO editorial_candidates (id, intake_type, submitted_url, lead_text, source_hash, state, created_by, created_at) VALUES (?, 'manual_url', NULL, 'Lead', ?, ?, 'publisher@example.test', ?)");
const at = (minute: number) => `2026-10-01 ${String(10 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
// The oldest rows wait on an editor; 75 newer `new` candidates arrive after them.
insert.run("held-old", "h1", "held", at(0));
insert.run("held-newer", "h2", "held", at(5));
insert.run("review-old", "r1", "needs_review", at(1));
insert.run("review-newer", "r2", "needs_review", at(6));
for (let i = 0; i < 75; i += 1) insert.run(`new-${String(i).padStart(2, "0")}`, `n${i}`, "new", at(10 + Math.floor(i / 3)));
insert.run("done", "p1", "published", at(200));
insert.run("broken", "f1", "failed", at(201));
const tableCounts = () => ["editorial_candidates", "admin_audit_log"].map((table) => Number((db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n));
const before = tableCounts();

// Default: held newest-first, then needs_review newest-first; nothing else.
const decide = await loadDeskQueue(d1);
assert.equal(decide.filter, "decide");
assert.deepEqual(decide.items.map((c) => c.id), ["held-newer", "held-old", "review-newer", "review-old"]);
assert.equal(decide.nextCursor, null);
assert.equal(decide.continued, false);
assert.deepEqual(
  { decide: decide.counts.decide, held: decide.counts.held, needs_review: decide.counts.needs_review, new: decide.counts.new, published: decide.counts.published, rejected: decide.counts.rejected, all: decide.counts.all },
  { decide: 4, held: 2, needs_review: 2, new: 75, published: 1, rejected: 0, all: 81 },
  "counts per filter; All includes states without a filter",
);

// Keyset paging crosses the held → needs_review boundary without gaps or repeats.
const seen: string[] = [];
let next: string | null = null;
do {
  const page = await loadDeskQueue(d1, { filter: "decide", cursor: next, pageSize: 1 });
  assert.equal(page.continued, next !== null);
  seen.push(...page.items.map((c) => c.id));
  next = page.nextCursor;
} while (next);
assert.deepEqual(seen, ["held-newer", "held-old", "review-newer", "review-old"]);

// A single-state filter pages 50 at a time, newest first, with ties broken by id.
const first = await loadDeskQueue(d1, { filter: "new" });
assert.equal(first.items.length, DESK_QUEUE_PAGE_SIZE);
assert.ok(first.items.every((c) => c.state === "new"));
assert.ok(first.nextCursor);
const second = await loadDeskQueue(d1, { filter: "new", cursor: first.nextCursor });
assert.equal(second.items.length, 25);
assert.equal(second.nextCursor, null);
const newIds = [...first.items, ...second.items].map((c) => c.id);
assert.equal(new Set(newIds).size, 75, "no candidate repeats across pages");
const expected = [...newIds].sort((a, b) => {
  const ka = at(10 + Math.floor(Number(a.slice(4)) / 3)), kb = at(10 + Math.floor(Number(b.slice(4)) / 3));
  return ka === kb ? b.localeCompare(a) : kb.localeCompare(ka);
});
assert.deepEqual(newIds, expected, "ordered by created_at, then id, both descending");

// Held work stays reachable however much newer intake arrives.
const all = await loadDeskQueue(d1, { filter: "all" });
assert.equal(all.items.length, DESK_QUEUE_PAGE_SIZE);
assert.ok(!all.items.some((c) => c.state === "held"), "All is newest-first, so older held work drops off it");
assert.equal((await loadDeskQueue(d1, { filter: "held" })).items.length, 2, "…but its own filter and the default keep it in view");
assert.deepEqual((await loadDeskQueue(d1, { filter: "rejected" })).items, []);

// A malformed cursor restarts the filter instead of failing.
assert.deepEqual((await loadDeskQueue(d1, { cursor: "%%%" })).items.map((c) => c.id), decide.items.map((c) => c.id));

assert.deepEqual(tableCounts(), before, "listing the queue writes nothing");
db.close();

// The Desk lists through this module, not its own unbounded query.
const deskPage = readFileSync("src/pages/admin/desk.astro", "utf8");
assert.match(deskPage, /loadDeskQueue\(/);
assert.doesNotMatch(deskPage, /FROM editorial_candidates ORDER BY/);
assert.match(deskPage, /\.desk-filters \{[^}]*flex-wrap: wrap;/, "the filter row wraps on narrow screens");

console.log("Desk queue tests passed");
