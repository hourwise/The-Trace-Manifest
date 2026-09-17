import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getEditorialClusterEvidence } from "../src/lib/server/editorial-evidence";
import { signInternalRequest } from "../src/security/internal-signature";
import worker, { type Env } from "../workers/ingestion/index";
import { SQLiteD1 } from "./sqlite-d1";

const secret = "e".repeat(32);
const context = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

function countedD1(database: SQLiteD1): { db: D1Database; prepares: () => number } {
  const base = database.asD1();
  let prepareCount = 0;
  return {
    db: {
      prepare(query: string) {
        prepareCount += 1;
        return base.prepare(query);
      },
    } as unknown as D1Database,
    prepares: () => prepareCount,
  };
}

function seedEditorialEvidenceFixtures(database: SQLiteD1): void {
  database.sqlite.exec(`
    INSERT INTO story_clusters
      (id, title, evidence_status, publication_status, needs_human_review, created_at, updated_at)
    VALUES
      (701, 'Cluster without canonical claims', 'unverified', 'draft', 0, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'),
      (702, 'Cluster with canonical evidence', 'provisionally_supported', 'draft', 0, '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z'),
      (703, 'Cluster with a larger bounded claim set', 'provisionally_supported', 'draft', 0, '2026-09-03T00:00:00Z', '2026-09-03T00:00:00Z');

    INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES
      (301, 'Primary Lab', 'https://primary.example', 'A', 'A', 'primary technical', 'rss'),
      (302, 'Independent Review', 'https://independent.example', 'B', 'B', 'independent', 'rss');

    INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, published_at, fetched_at, ingestion_status) VALUES
      (301, 301, 'https://primary.example/report', 'editorial-feed-301', 'Primary report', 'Primary feed evidence.', '2026-09-01T01:00:00Z', '2026-09-01T02:00:00Z', 'clustered'),
      (302, 302, 'https://independent.example/review', 'editorial-feed-302', 'Independent review', 'Independent feed evidence.', '2026-09-02T01:00:00Z', '2026-09-02T02:00:00Z', 'clustered');

    INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES
      (702, 301, 1), (702, 302, 0);

    INSERT INTO source_documents
      (id, canonical_url, canonical_url_hash, source_id, media_kind, admission_state, copyright_storage_mode)
    VALUES
      ('editorial-doc-primary', 'https://primary.example/report', 'editorial-doc-primary-hash', 301, 'html', 'admitted', 'metadata_only'),
      ('editorial-doc-independent', 'https://independent.example/review', 'editorial-doc-independent-hash', 302, 'html', 'admitted', 'metadata_only');

    INSERT INTO source_document_versions
      (id, source_document_id, content_hash, retrieved_url, retrieved_at, published_at, extraction_status)
    VALUES
      ('editorial-version-primary', 'editorial-doc-primary', 'editorial-content-primary', 'https://primary.example/report', '2026-09-03T00:00:00Z', '2026-09-01T01:00:00Z', 'extracted'),
      ('editorial-version-independent', 'editorial-doc-independent', 'editorial-content-independent', 'https://independent.example/review', '2026-09-03T00:00:00Z', '2026-09-02T01:00:00Z', 'extracted');

    INSERT INTO source_chunks
      (id, source_document_version_id, chunk_index, text_excerpt, text_hash, start_locator, end_locator)
    VALUES
      ('editorial-chunk-primary', 'editorial-version-primary', 0, 'Primary source assertion text.', 'editorial-chunk-primary-hash', 'p1', 'p2'),
      ('editorial-chunk-independent', 'editorial-version-independent', 0, 'Independent source assertion text.', 'editorial-chunk-independent-hash', 'p3', 'p4');

    INSERT INTO provenance_groups
      (id, origin_type, explanation, determined_by, determination_method, reviewed_at)
    VALUES
      ('editorial-provenance-primary', 'primary', 'Primary source provenance reviewed by the editor.', 'publisher', 'editor_review', '2026-09-03T03:00:00Z'),
      ('editorial-provenance-independent', 'independent_test', 'Independent corroboration provenance reviewed by the editor.', 'publisher', 'editor_review', '2026-09-03T03:00:00Z');

    INSERT INTO canonical_claims
      (id, canonical_text, claim_class, claim_domain, current_state, materiality)
    VALUES
      ('editorial-claim-primary', 'The primary report describes the observed implementation.', 'observed_implementation_behaviour', 'model_capability', 'active', 'high'),
      ('editorial-claim-secondary', 'The independent review provides context for the implementation.', 'independent_research_finding', 'research', 'qualified', 'standard'),
      ('editorial-claim-empty', 'This claim has no assertions yet.', 'editorial_synthesis', 'general', 'active', 'low'),
      ('editorial-claim-nonadmitted', 'This claim currently has no admitted assertion.', 'community_report', 'general', 'disputed', 'critical');

    INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order) VALUES
      (702, 'editorial-claim-nonadmitted', 'caveat', 'critical', 1),
      (702, 'editorial-claim-primary', 'primary', 'high', 2),
      (702, 'editorial-claim-secondary', 'supporting', 'standard', 3),
      (702, 'editorial-claim-empty', 'context', 'low', 4);

    INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id, assertion_text,
       relationship, source_role, directness, evidence_treatment, admission_state,
       freshness_state, provenance_group_id, extraction_method, confidence,
       reviewer_state, reviewed_by, reviewed_at, created_at)
    VALUES
      ('editorial-assertion-primary-support', 'editorial-claim-primary', 'editorial-version-primary', 'editorial-chunk-primary', 'The primary report supports the implementation claim.', 'supports', 'evidence', 'direct', 'factual_support', 'admitted', 'current', 'editorial-provenance-primary', 'fixture', 0.92, 'accepted', 'publisher', '2026-09-03T04:00:00Z', '2026-09-03T04:00:00Z'),
      ('editorial-assertion-primary-support-2', 'editorial-claim-primary', 'editorial-version-independent', 'editorial-chunk-independent', 'The independent review also supports the implementation claim.', 'partially_supports', 'evidence', 'indirect', 'factual_support', 'admitted', 'current', 'editorial-provenance-independent', 'fixture', 0.78, 'amended', 'publisher', '2026-09-03T04:01:00Z', '2026-09-03T04:01:00Z'),
      ('editorial-assertion-primary-dispute', 'editorial-claim-primary', 'editorial-version-independent', 'editorial-chunk-independent', 'The independent review disputes one part of the implementation claim.', 'contradicts', 'evidence', 'direct', 'factual_support', 'admitted', 'current', 'editorial-provenance-independent', 'fixture', 0.61, 'accepted', 'publisher', '2026-09-03T04:02:00Z', '2026-09-03T04:02:00Z'),
      ('editorial-assertion-secondary-rejected', 'editorial-claim-secondary', 'editorial-version-primary', 'editorial-chunk-primary', 'A rejected assertion remains visible for editorial context.', 'supports', 'reported_claim', 'unknown', 'attributed_opinion', 'rejected', 'stale', NULL, 'fixture', 0.2, 'rejected', NULL, NULL, '2026-09-03T04:03:00Z'),
      ('editorial-assertion-nonadmitted', 'editorial-claim-nonadmitted', 'editorial-version-primary', 'editorial-chunk-primary', 'A pending assertion is not admitted evidence.', 'qualifies', 'evidence', 'indirect', 'factual_support', 'pending', 'unknown', NULL, 'fixture', 0.4, 'proposed', NULL, NULL, '2026-09-03T04:04:00Z');

    INSERT INTO canonical_claim_score_snapshots
      (id, canonical_claim_id, score, evidence_status, component_json, policy_version, triggering_event)
    VALUES
      ('editorial-score-primary', 'editorial-claim-primary', 74.5, 'provisionally_supported', '{}', 'fixture-v1', 'fixture'),
      ('editorial-score-secondary', 'editorial-claim-secondary', 12, 'unverified', '{}', 'fixture-v1', 'fixture');

    INSERT INTO story_claim_evidence_attachments
      (id, story_cluster_id, canonical_claim_id, feed_item_id, relationship, explanation, eligibility_state, eligibility_reason, reviewed_by, reviewed_at)
    VALUES
      ('editorial-attachment-primary-eligible', 702, 'editorial-claim-primary', 301, 'supports', 'Accepted as supporting feed coverage.', 'eligible', 'Reviewed feed coverage is eligible for this claim.', 'publisher', '2026-09-03T05:00:00Z'),
      ('editorial-attachment-primary-pending', 702, 'editorial-claim-primary', 302, 'contradicts', NULL, 'pending', 'Requires further editorial review.', 'reader@example.com', '2026-09-03T05:01:00Z'),
      ('editorial-attachment-nonadmitted', 702, 'editorial-claim-nonadmitted', 302, 'contextualises', 'Attachment is retained but not eligible.', 'ineligible', 'Source state does not satisfy the current evidence policy.', 'publisher', '2026-09-03T05:02:00Z');
  `);

  const claimInsert = database.sqlite.prepare(
    "INSERT INTO canonical_claims (id, canonical_text, claim_class, claim_domain, current_state, materiality) VALUES (?, ?, 'observed_implementation_behaviour', 'general', 'active', 'standard')",
  );
  const storyClaimInsert = database.sqlite.prepare(
    "INSERT INTO story_claims (story_cluster_id, canonical_claim_id, role, materiality, display_order) VALUES (703, ?, 'supporting', 'standard', ?)",
  );
  const assertionInsert = database.sqlite.prepare(
    `INSERT INTO claim_assertions
      (id, canonical_claim_id, source_document_version_id, source_chunk_id, assertion_text,
       relationship, source_role, directness, evidence_treatment, admission_state,
       freshness_state, extraction_method, confidence, reviewer_state, created_at)
     VALUES (?, ?, 'editorial-version-primary', 'editorial-chunk-primary', ?, 'supports', 'evidence', 'direct', 'factual_support', 'pending', 'unknown', 'fixture', 0.5, 'proposed', '2026-09-03T06:00:00Z')`,
  );
  for (let index = 1; index <= 55; index += 1) {
    const claimId = `editorial-claim-large-${String(index).padStart(2, "0")}`;
    claimInsert.run(claimId, `Bounded fixture claim ${index}.`);
    storyClaimInsert.run(claimId, index);
    assertionInsert.run(`editorial-assertion-large-${String(index).padStart(2, "0")}`, claimId, `Bounded fixture assertion ${index}.`);
  }
}

async function signedAdminRequest(
  database: SQLiteD1,
  path: string,
  method: "GET" | "POST" = "GET",
  body = "",
  role: "reader" | "publisher" = "reader",
): Promise<Response> {
  const timestamp = String(Date.now());
  const identity = { operator: `${role}@example.com`, role, timestamp, nonce: crypto.randomUUID() };
  const signature = await signInternalRequest(secret, method, path, body, identity);
  const env: Env = { DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: secret };
  return worker.fetch(new Request(`https://worker.example${path}`, {
    method,
    body: method === "GET" ? undefined : body,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Internal-Version": "v1",
      "X-Trace-Operator": identity.operator,
      "X-Trace-Role": identity.role,
      "X-Trace-Timestamp": timestamp,
      "X-Trace-Nonce": identity.nonce,
      "X-Trace-Signature": signature,
    },
  }), env, context);
}

async function editorialEvidenceTests(): Promise<void> {
  const database = new SQLiteD1();
  const encoder = new TextEncoder();
  try {
    seedEditorialEvidenceFixtures(database);

    const countedRich = countedD1(database);
    const rich = await getEditorialClusterEvidence(countedRich.db, 702);
    assert.equal(countedRich.prepares(), 4, "rich evidence uses one cluster query plus two set-based detail queries");
    assert.ok(rich);
    assert.equal(rich.claimCount, 4);
    assert.deepEqual(rich.claims.map((claim) => claim.canonicalClaimId), [
      "editorial-claim-nonadmitted", "editorial-claim-primary", "editorial-claim-secondary", "editorial-claim-empty",
    ], "claims use materiality, display order, and ID as deterministic ordering keys");
    assert.equal(rich.assertionCount, 5);
    assert.equal(rich.admittedAssertionCount, 3);
    assert.equal(rich.attachmentCount, 3);
    assert.equal(rich.eligibleAttachmentCount, 1);

    const primary = rich.claims.find((claim) => claim.canonicalClaimId === "editorial-claim-primary");
    assert.ok(primary);
    assert.equal(primary.score, 74.5);
    assert.equal(primary.evidenceStatus, "provisionally_supported");
    assert.equal(primary.assertionCount, 3);
    assert.equal(primary.admittedAssertionCount, 3);
    assert.equal(primary.currentReviewedAssertionCount, 3);
    assert.deepEqual(primary.assertions.map((assertion) => assertion.relationship), ["contradicts", "partially_supports", "supports"]);
    assert.equal(primary.assertions[0]?.source?.name, "Independent Review");
    assert.equal(primary.assertions[0]?.source?.url, "https://independent.example/review");
    assert.equal(primary.assertions[0]?.provenance?.originType, "independent_test");
    assert.equal(primary.assertions[0]?.sourceDocument?.admissionState, "admitted");
    assert.deepEqual(primary.attachments.map((attachment) => attachment.eligibilityState), ["pending", "eligible"]);

    const nonadmitted = rich.claims.find((claim) => claim.canonicalClaimId === "editorial-claim-nonadmitted");
    assert.ok(nonadmitted);
    assert.equal(nonadmitted.admittedAssertionCount, 0, "pending assertions are not reported as admitted");
    assert.equal(nonadmitted.assertions[0]?.admissionState, "pending");
    assert.equal(nonadmitted.attachments[0]?.eligibilityState, "ineligible");
    assert.equal(rich.claims.find((claim) => claim.canonicalClaimId === "editorial-claim-empty")?.assertionCount, 0, "claims without assertions remain visible");
    console.log(JSON.stringify({ kind: "editorial_evidence_payload", clusterId: 702, claims: rich.claimCount, assertions: rich.assertionCount, bytes: encoder.encode(JSON.stringify(rich)).byteLength, d1Queries: countedRich.prepares() }));

    const countedEmpty = countedD1(database);
    const empty = await getEditorialClusterEvidence(countedEmpty.db, 701);
    assert.equal(countedEmpty.prepares(), 2, "no-claim evidence uses a bounded existence plus claims read");
    assert.deepEqual(empty, {
      clusterId: 701,
      claims: [],
      claimCount: 0,
      claimsTruncated: false,
      assertionCount: 0,
      admittedAssertionCount: 0,
      attachmentCount: 0,
      eligibleAttachmentCount: 0,
    });
    console.log(JSON.stringify({ kind: "editorial_evidence_payload", clusterId: 701, claims: 0, assertions: 0, bytes: encoder.encode(JSON.stringify(empty)).byteLength, d1Queries: countedEmpty.prepares() }));
    assert.equal(await getEditorialClusterEvidence(database.asD1(), 0), null);
    assert.equal(await getEditorialClusterEvidence(database.asD1(), 999999), null);

    const countedLarge = countedD1(database);
    const large = await getEditorialClusterEvidence(countedLarge.db, 703);
    assert.equal(countedLarge.prepares(), 4, "larger evidence uses the same fixed query bundle rather than N+1 reads");
    assert.ok(large);
    assert.equal(large.claimCount, 55);
    assert.equal(large.claims.length, 50);
    assert.equal(large.claimsTruncated, true, "claim bounds are explicit");
    assert.equal(large.assertionCount, 50, "assertion totals cover the visible bounded claim set");
    assert.equal(large.claims.every((claim) => claim.assertions.length === 1), true);
    console.log(JSON.stringify({ kind: "editorial_evidence_payload", clusterId: 703, claims: large.claimCount, visibleClaims: large.claims.length, assertions: large.assertionCount, bytes: encoder.encode(JSON.stringify(large)).byteLength, d1Queries: countedLarge.prepares() }));

    const unsigned = await worker.fetch(new Request("https://worker.example/admin/cluster-evidence?clusterId=702"), {
      DB: database.asD1(), RAW_STORE: {} as R2Bucket, TRACE_INTERNAL_SERVICE_SECRET: secret,
    }, context);
    assert.equal(unsigned.status, 401, "evidence reads remain behind signed internal authentication");
    assert.equal((await signedAdminRequest(database, "/admin/cluster-evidence?clusterId=0")).status, 400, "invalid cluster IDs fail closed");
    assert.equal((await signedAdminRequest(database, "/admin/cluster-evidence?clusterId=999999")).status, 404, "unknown clusters do not permit arbitrary graph traversal");
    assert.equal((await signedAdminRequest(database, "/admin/cluster-evidence?clusterId=702", "POST")).status, 403, "the evidence route has no write path");

    const apiEmpty = await signedAdminRequest(database, "/admin/cluster-evidence?clusterId=701");
    assert.equal(apiEmpty.status, 200);
    assert.deepEqual(await apiEmpty.json(), {
      clusterId: 701,
      claims: [],
      claimCount: 0,
      claimsTruncated: false,
      assertionCount: 0,
      admittedAssertionCount: 0,
      attachmentCount: 0,
      eligibleAttachmentCount: 0,
    });
    const apiRich = await signedAdminRequest(database, "/admin/cluster-evidence?clusterId=702");
    assert.equal(apiRich.status, 200);
    assert.equal((await apiRich.json() as { claims: unknown[] }).claims.length, 4, "reader role can inspect editorial evidence");

    const reviewPage = readFileSync("src/pages/admin/review.astro", "utf8");
    assert.match(reviewPage, /id="claims-evidence-panel"/, "claims panel is part of selected-cluster detail");
    assert.match(reviewPage, /cluster-evidence\?clusterId=/, "evidence loads by the selected cluster ID");
    assert.match(reviewPage, /No canonical claims are currently mapped to this story/, "no-claim state is explicit");
    assert.match(reviewPage, /<details open/, "claims use keyboard-accessible native disclosure");
    assert.match(reviewPage, /Supporting|Disputing/, "supporting and disputing assertions remain visibly distinct");
    assert.equal((reviewPage.match(/\/api\/admin\/cluster-evidence\?clusterId=/g) ?? []).length, 1, "one selected-cluster evidence request is declared");
    assert.match(reviewPage, /Open deterministic claim extraction/, "no-claim state offers the bounded extraction handoff");
    assert.doesNotMatch(reviewPage, /runClaimExtraction|fetch\(["']\/api\/admin\/extract-claims/, "selection does not trigger extraction");
  } finally {
    database.close();
  }
}

await editorialEvidenceTests();
console.log("Editorial evidence tests passed.");
