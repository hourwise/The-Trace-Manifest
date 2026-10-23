import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInventory, databaseQueries } from "../scripts/inventory-backfill.mjs";
import { SQLiteD1 } from "./sqlite-d1";

// KNOWLEDGE-10 C1: the KC-11A collector must run on the current schema (which
// has no knowledge_pages table), expose legacy evidence URLs for re-capture,
// and carry owner-curated seed lists with their approval state.

const tablesOf = (database: SQLiteD1) =>
  (database.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name);

// Every query the collector would send is valid SQL on the current schema.
{
  const database = new SQLiteD1();
  try {
    const tables = tablesOf(database);
    const queries = databaseQueries(tables);
    assert.ok(queries.some((query: string) => query.includes("'evidence_url'")), "the evidence URL query runs on the cutover schema");
    for (const query of queries) database.sqlite.prepare(query).all();
    // Production has no knowledge_pages table (an accepted legacy divergence);
    // a query naming it would fail the whole inventory file there.
    const productionShape = databaseQueries(tables.filter((table) => table !== "knowledge_pages"));
    assert.equal(productionShape.some((query: string) => query.includes("knowledge_pages")), false, "knowledge_pages is only queried when present");
    database.sqlite.exec("DROP TABLE knowledge_pages");
    for (const query of productionShape) database.sqlite.prepare(query).all();
  } finally {
    database.close();
  }
  assert.ok(databaseQueries(["knowledge_pages"]).some((query: string) => query.includes("FROM knowledge_pages")), "legacy databases keep their pages");
  assert.equal(databaseQueries([]).some((query: string) => query.includes("'evidence_url'")), false, "pre-cutover databases skip evidence URLs");
}

// Legacy evidence URLs: one per URL, ranked by the best reviewer state, and no
// editorial-synthesis-only URLs.
{
  const database = new SQLiteD1(false);
  try {
    database.sqlite.exec(`
      INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type)
      VALUES (950, 'Evidence source', 'https://evidence.example', 'A', 'A', 'primary-technical', 'manual');
      INSERT INTO feed_items (id, source_id, url, url_hash, title, ingestion_status) VALUES
        (950, 950, 'https://evidence.example/accepted', 'h950', 'Accepted article', 'published'),
        (951, 950, 'https://evidence.example/proposed', 'h951', 'Proposed article', 'clustered'),
        (952, 950, 'https://evidence.example/claim-only', 'h952', 'Claim-only article', 'clustered'),
        (953, 950, 'https://evidence.example/synthesis', 'h953', 'Synthesis article', 'clustered');
      INSERT INTO story_clusters (id, title, evidence_status) VALUES (950, 'Evidence story', 'confirmed');
      INSERT INTO claims (id, cluster_id, feed_item_id, claim_text, claim_class, claim_domain, severity, evidence_quality, confidence_score, extraction_method, extraction_version) VALUES
        (950, 950, 950, 'Accepted claim.', 'official_vendor_claim', 'model_release', 'high', 'strong', 0.8, 'rule_based', 't'),
        (951, 950, 951, 'Proposed claim.', 'official_vendor_claim', 'model_release', 'high', 'strong', 0.8, 'rule_based', 't'),
        (952, 950, 952, 'Claim with no evidence row.', 'official_vendor_claim', 'product', 'standard', 'moderate', 0.6, 'rule_based', 't'),
        (953, 950, 953, 'TRACE synthesis.', 'editorial_synthesis', 'general', 'low', 'moderate', 0.5, 'rule_based', 't');
      INSERT INTO claim_evidence (id, claim_id, feed_item_id, relationship, evidence_summary, source_tier, is_primary_source) VALUES
        (950, 950, 950, 'reports', 'Reported.', 'A', 1),
        (951, 951, 951, 'reports', 'Reported.', 'A', 1);
    `);
    database.sqlite.exec(readFileSync("db/migration-0043-legacy-claims-cutover.sql", "utf8"));
    database.sqlite.exec(`
      UPDATE claim_assertions SET admission_state = 'admitted', reviewer_state = 'accepted',
        reviewed_by = 'publisher@example.com', reviewed_at = datetime('now')
      WHERE id IN (SELECT assertion_id FROM legacy_claim_evidence_map WHERE legacy_evidence_id = 950);
    `);
    const evidenceQuery = databaseQueries(tablesOf(database)).find((query: string) => query.includes("'evidence_url'"))!;
    const rows = database.sqlite.prepare(evidenceQuery).all() as Array<{ id: string; state: string; url: string }>;
    const byUrl = new Map(rows.map((row) => [row.url, row.state]));
    assert.equal(byUrl.get("https://evidence.example/accepted"), "legacy_accepted");
    assert.equal(byUrl.get("https://evidence.example/proposed"), "legacy_proposed");
    assert.equal(byUrl.get("https://evidence.example/claim-only"), "legacy_claim_only");
    assert.equal(byUrl.has("https://evidence.example/synthesis"), false, "editorial synthesis claims are never evidence");
    assert.equal(new Set(rows.map((row) => row.url)).size, rows.length, "one inventory item per URL");
  } finally {
    database.close();
  }
}

// Inventory assembly: URL-keyed categories merge origins; curated seeds carry
// their approval state and resolve to http(s) URLs.
{
  const inventory = buildInventory({
    generatedAt: "2026-10-23T00:00:00.000Z",
    databaseRows: [
      { category: "evidence_url", id: "evidence:https://a.example/x", label: "x", state: "legacy_accepted", url: "https://a.example/x", origin: "legacy_claim_evidence" },
      { category: "evidence_url", id: "evidence:https://a.example/x", label: "x", state: "legacy_accepted", url: "https://a.example/x", origin: "other_origin" },
      { category: "evidence_url", id: "evidence:not-a-url", label: "bad", state: "legacy_proposed", url: "javascript:alert(1)", origin: "legacy_claim_evidence" },
    ],
  });
  assert.equal(inventory.categories.evidence_url.length, 1, "duplicate evidence URLs merge and invalid URLs are dropped");
  assert.deepEqual(inventory.categories.evidence_url[0].origin, ["legacy_claim_evidence", "other_origin"]);
  const seeds = inventory.categories.curated_seed;
  const seedList = JSON.parse(readFileSync("docs/knowledge-seed/pilot-01.json", "utf8"));
  assert.equal(seeds.length, seedList.sources.length, "every pilot-01 seed is inventoried");
  assert.ok(seeds.every((seed: { id: string; state: string; url: string }) => seed.id.startsWith("seed:pilot-01:S") && seed.state === `seed_${seedList.approval}` && /^https:\/\//.test(seed.url)));
  assert.equal(inventory.schemaVersion, "kc-11a-v1");
}

console.log("KC-11A inventory collector tests passed");
