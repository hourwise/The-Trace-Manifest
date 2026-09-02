import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteD1 } from "./sqlite-d1";
import { deduplicateURL } from "../workers/ingestion/dedup";

const MIGRATION_PATH = "db/migration-0069-trace-d1-reverse-membership-index.sql";
const TARGET_INDEX = "idx_story_cluster_members_feed_item_primary_cluster";
const REVERSE_LOOKUP = "SELECT 1 FROM story_cluster_members WHERE feed_item_id = ? LIMIT 1";
const PRIMARY_LOOKUP = `
  SELECT scm.cluster_id
  FROM story_cluster_members scm
  WHERE scm.feed_item_id = ?
  ORDER BY scm.is_primary DESC
  LIMIT 1
`;
const RELATED_LOOKUP = `
  SELECT fi.id,
         (SELECT scm.cluster_id
          FROM story_cluster_members scm
          WHERE scm.feed_item_id = fi.id
          ORDER BY scm.is_primary DESC LIMIT 1) AS cluster_id
  FROM feed_items fi
  JOIN sources s ON fi.source_id = s.id
  WHERE fi.ingestion_status IN ('classified', 'clustered', 'published')
    AND fi.fetched_at >= datetime('now', '-30 days')
  ORDER BY fi.fetched_at DESC
  LIMIT 500
`;

type PlanRow = { id: number; parent: number; notused: number; detail: string };

function plan(database: SQLiteD1, sql: string, ...parameters: unknown[]): PlanRow[] {
  return database.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters as any[]) as unknown as PlanRow[];
}

function planText(rows: PlanRow[]): string {
  return rows.map((row) => row.detail).join(" | ");
}

function indexNames(database: SQLiteD1): string[] {
  return (database.sqlite.prepare("PRAGMA index_list('story_cluster_members')").all() as Array<{ name: string }>)
    .map((row) => row.name);
}

function reverseMembership(database: SQLiteD1, feedItemId: number): number | null {
  const row = database.sqlite.prepare(REVERSE_LOOKUP).get(feedItemId) as { 1?: number } | undefined;
  return row ? 1 : null;
}

function selectedCluster(database: SQLiteD1, feedItemId: number): number | null {
  const row = database.sqlite.prepare(PRIMARY_LOOKUP).get(feedItemId) as { cluster_id?: number } | undefined;
  return row?.cluster_id ?? null;
}

function seedFixture(database: SQLiteD1): void {
  database.sqlite.exec(`
    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
    VALUES (7001, 'R1 fixture source', 'https://r1.example', 'ai-agents', 'A', 'primary-technical', 'rss');

    INSERT INTO feed_items (id, source_id, url, url_hash, title, fetched_at, ingestion_status)
    VALUES
      (7001, 7001, 'https://r1.example/zero', 'r1-zero', 'Zero membership', datetime('now'), 'classified'),
      (7002, 7001, 'https://r1.example/one', 'r1-one', 'One membership', datetime('now'), 'classified'),
      (7003, 7001, 'https://r1.example/multiple', 'r1-multiple', 'Multiple memberships', datetime('now'), 'classified'),
      (7004, 7001, 'https://r1.example/new', 'r1-new', 'New item', datetime('now'), 'raw');

    INSERT INTO story_clusters (id, title) VALUES
      (7001, 'R1 non-primary cluster'),
      (7002, 'R1 primary cluster');

    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (7001, 7002, 0),
      (7001, 7003, 0),
      (7002, 7003, 1);
  `);

  // Make the scan-vs-probe cost visible using a bounded local cardinality.
  const insertCluster = database.sqlite.prepare("INSERT INTO story_clusters (id, title) VALUES (?, ?)");
  const insertMember = database.sqlite.prepare(
    "INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (?, ?, ?)",
  );
  database.sqlite.exec("BEGIN");
  try {
    for (let offset = 0; offset < 4_797; offset++) {
      const clusterId = 8_000 + offset;
      insertCluster.run(clusterId, `R1 cardinality cluster ${clusterId}`);
      insertMember.run(clusterId, 7003, offset === 0 ? 1 : 0);
    }
    database.sqlite.exec("COMMIT");
  } catch (error) {
    database.sqlite.exec("ROLLBACK");
    throw error;
  }

  const insertCandidate = database.sqlite.prepare(`
    INSERT INTO feed_items (id, source_id, url, url_hash, title, fetched_at, ingestion_status)
    VALUES (?, 7001, ?, ?, ?, datetime('now'), 'classified')
  `);
  database.sqlite.exec("BEGIN");
  try {
    for (let id = 7_100; id < 7_600; id++) {
      insertCandidate.run(id, `https://r1.example/candidate-${id}`, `r1-candidate-${id}`, `Candidate ${id}`);
    }
    database.sqlite.exec("COMMIT");
  } catch (error) {
    database.sqlite.exec("ROLLBACK");
    throw error;
  }
}

function assertIndexedReversePlans(database: SQLiteD1, label: string): void {
  const reverse = plan(database, REVERSE_LOOKUP, 7003);
  const primary = plan(database, PRIMARY_LOOKUP, 7003);
  const related = plan(database, RELATED_LOOKUP);
  const reverseText = planText(reverse);
  const primaryText = planText(primary);
  const relatedText = planText(related);

  console.log(`${label} reverse: ${reverseText}`);
  console.log(`${label} primary: ${primaryText}`);
  console.log(`${label} related: ${relatedText}`);

  assert.match(reverseText, new RegExp(`SEARCH .*${TARGET_INDEX}.*feed_item_id=\\?`), `${label} reverse lookup is indexed`);
  assert.match(primaryText, new RegExp(`SEARCH .*${TARGET_INDEX}.*feed_item_id=\\?`), `${label} primary lookup is indexed`);
  assert.doesNotMatch(relatedText, /SCAN scm/i, `${label} related lookup does not scan scm`);
  assert.match(relatedText, new RegExp(`SEARCH .*${TARGET_INDEX}.*feed_item_id=\\?`), `${label} related lookup uses reverse index`);
}

async function run(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedFixture(database);
    const membershipCount = (database.sqlite.prepare("SELECT COUNT(*) AS count FROM story_cluster_members").get() as { count: number }).count;
    assert.equal(membershipCount, 4_800, "fixture contains 4,800 membership rows");

    const beforeReverse = plan(database, REVERSE_LOOKUP, 7003);
    const beforePrimary = plan(database, PRIMARY_LOOKUP, 7003);
    const beforeRelated = plan(database, RELATED_LOOKUP);
    console.log(`BEFORE reverse: ${planText(beforeReverse)}`);
    console.log(`BEFORE primary: ${planText(beforePrimary)}`);
    console.log(`BEFORE related: ${planText(beforeRelated)}`);
    assert.match(planText(beforeReverse), /SCAN .*story_cluster_members|SCAN scm/i, "before reverse lookup scans membership index");
    assert.match(planText(beforeRelated), /SCAN scm/i, "before related lookup scans scm");

    const beforeResults = {
      zero: reverseMembership(database, 7001),
      one: reverseMembership(database, 7002),
      multiple: reverseMembership(database, 7003),
      primary: selectedCluster(database, 7003),
    };
    assert.equal(beforeResults.zero, null, "zero-membership reverse lookup returns no row before migration");
    assert.equal(beforeResults.one, 1, "one-membership reverse lookup returns a row before migration");
    assert.equal(beforeResults.multiple, 1, "multiple-membership reverse lookup returns a row before migration");
    assert.equal(beforeResults.primary, 7002, "primary membership wins before migration");

    database.sqlite.exec(readFileSync(MIGRATION_PATH, "utf8"));
    database.sqlite.exec(readFileSync(MIGRATION_PATH, "utf8"));
    assert.equal(indexNames(database).filter((name) => name === TARGET_INDEX).length, 1, "repeated migration application creates one index");
    assertIndexedReversePlans(database, "AFTER");

    const afterResults = {
      zero: reverseMembership(database, 7001),
      one: reverseMembership(database, 7002),
      multiple: reverseMembership(database, 7003),
      primary: selectedCluster(database, 7003),
    };
    assert.deepEqual(afterResults, beforeResults, "reverse and primary results are unchanged after migration");

    // The duplicate branch continues to use the existing URL-hash lookup and
    // reverse membership result. The newly inserted branch has no membership
    // query after INSERT and therefore cannot accidentally change duplicate
    // semantics.
    const duplicate = await deduplicateURL(database.asD1(), "r1-one");
    assert.equal(duplicate?.id, 7002, "duplicate path still identifies the existing feed item");
    assert.equal(reverseMembership(database, duplicate!.id), 1, "duplicate path still sees existing membership");
    const newItem = await deduplicateURL(database.asD1(), "r1-new");
    assert.equal(newItem?.id, 7004, "new-item fixture is present after insertion");
    assert.equal(reverseMembership(database, newItem!.id), null, "new-item path starts without membership");
    const ingestionSource = readFileSync("workers/ingestion/index.ts", "utf8");
    const candidateStart = ingestionSource.indexOf("async function createCandidateFromItem");
    const candidateEnd = ingestionSource.indexOf("Find an existing open editorial candidate", candidateStart);
    assert.ok(candidateStart >= 0 && candidateEnd > candidateStart, "candidate function boundaries are present");
    const candidateFunction = ingestionSource.slice(candidateStart, candidateEnd);
    assert.doesNotMatch(candidateFunction, /story_cluster_members/, "new-item candidate path no longer performs membership query");
    assert.match(ingestionSource.slice(ingestionSource.indexOf("async function linkItemToExistingCandidate"), candidateStart), /story_cluster_members/, "duplicate path retains membership query");

    const estimates = {
      membershipRows: membershipCount,
      oneReverseLookup: { before: membershipCount, after: 1 },
      fiftyClaimExtractionItems: { before: membershipCount * 50, after: 50 },
      fiveHundredRelatedCandidates: { before: membershipCount * 500, after: 500 },
      representativeIngestionBatch: {
        duplicateItems: 50,
        newItems: 50,
        before: membershipCount * 100,
        after: 50,
      },
    };
    console.log(`ESTIMATED_REVERSE_READS ${JSON.stringify(estimates)}`);
    assert.equal(estimates.fiftyClaimExtractionItems.before, 240_000, "claim-extraction estimate uses fixture cardinality");
    assert.equal(estimates.fiveHundredRelatedCandidates.before, 2_400_000, "related-candidate estimate uses fixture cardinality");
    assert.equal(estimates.representativeIngestionBatch.before, 480_000, "ingestion-batch estimate includes duplicate and removed new-item scans");
    assert.equal(estimates.representativeIngestionBatch.after, 50, "ingestion-batch estimate leaves one indexed probe per duplicate");

    console.log("TRACE D1 R1 tests: PASS");
  } finally {
    database.close();
  }
}

await run();
