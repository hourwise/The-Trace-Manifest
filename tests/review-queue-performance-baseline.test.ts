import assert from "node:assert/strict";
import { getClusterSources } from "../workers/ingestion/publish";
import type { Env } from "../workers/ingestion/index";
import { listReviewQueueClusters } from "../src/lib/server/review-queue";
import type { ReviewQueuePublishableCluster } from "../src/lib/review-queue-contract";
import { SQLiteD1 } from "./sqlite-d1";

const encoder = new TextEncoder();

function bytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function sourceFieldBytes(rows: ReviewQueuePublishableCluster[], field: "source_names" | "summary" | "why_it_matters" | "created_at"): number {
  return bytes(rows.map((row) => row[field]));
}

function seedPerformanceFixtures(database: SQLiteD1): void {
  const sourceInsert = database.sqlite.prepare(
    "INSERT INTO sources (id, name, url, section, tier, treatment, ingestion_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const feedInsert = database.sqlite.prepare(
    "INSERT INTO feed_items (id, source_id, url, url_hash, title, content_excerpt, published_at, ingestion_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const memberInsert = database.sqlite.prepare(
    "INSERT INTO story_cluster_members (cluster_id, feed_item_id, is_primary) VALUES (?, ?, ?)",
  );
  const clusterInsert = database.sqlite.prepare(
    "INSERT INTO story_clusters (id, title, topic, evidence_status, publication_status, needs_human_review, summary, why_it_matters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  for (const [id, name, tier] of [[101, "Alpha source", "A"], [102, "Beta source", "B"], [103, "Gamma source", "C"]] as const) {
    sourceInsert.run(id, name, `https://${name.toLowerCase().replaceAll(" ", ".")}.example`, tier, tier, "performance fixture", "rss");
    feedInsert.run(id, id, `https://fixture.example/${id}`, `performance-feed-${id}`, `${name} item`, "Fixture source excerpt", "2026-08-01T00:00:00Z", "clustered");
  }

  const summary = "A representative bounded review queue summary. ".repeat(4);
  const whyItMatters = "A representative editorial significance field. ".repeat(2);
  for (let index = 1; index <= 200; index += 1) {
    const id = 1000 + index;
    clusterInsert.run(
      id,
      `Publishable fixture cluster ${String(index).padStart(3, "0")}`,
      index % 5 === 0 ? null : index % 2 === 0 ? "models" : "agents",
      "confirmed",
      "draft",
      0,
      summary,
      whyItMatters,
      `2026-08-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
      `2026-08-${String((index % 28) + 1).padStart(2, "0")}T01:00:00Z`,
    );

    const sourceCount = index % 4 === 0 ? 0 : index % 4 === 1 ? 1 : 3;
    for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex += 1) {
      memberInsert.run(id, 101 + sourceIndex, sourceIndex === 0 ? 1 : 0);
    }
  }

  for (let index = 1; index <= 50; index += 1) {
    const id = 3000 + index;
    clusterInsert.run(
      id,
      `Pending fixture cluster ${String(index).padStart(2, "0")}`,
      "models",
      "unverified",
      "review",
      1,
      summary,
      whyItMatters,
      "2026-07-01T00:00:00Z",
      "2026-07-01T01:00:00Z",
    );
  }

  clusterInsert.run(9000, "Small selected cluster", "models", "confirmed", "draft", 0, summary, whyItMatters, "2026-08-20T00:00:00Z", "2026-08-20T01:00:00Z");
  clusterInsert.run(9001, "Large selected cluster", "models", "confirmed", "draft", 0, summary, whyItMatters, "2026-08-21T00:00:00Z", "2026-08-21T01:00:00Z");
  for (let index = 0; index < 40; index += 1) {
    const sourceId = 500 + index;
    const name = `Detail source ${String(index + 1).padStart(2, "0")}`;
    sourceInsert.run(sourceId, name, `https://detail-${index}.example`, "A", "A", "detail fixture", "rss");
    feedInsert.run(
      sourceId,
      sourceId,
      `https://detail-${index}.example/story`,
      `detail-feed-${sourceId}`,
      `Detail source story ${index + 1}`,
      "Selected-cluster excerpt payload. ".repeat(25),
      "2026-08-15T00:00:00Z",
      "clustered",
    );
    memberInsert.run(9001, sourceId, index === 0 ? 1 : 0);
    if (index < 3) memberInsert.run(9000, sourceId, index === 0 ? 1 : 0);
  }
}

async function measurePerformanceBaseline(): Promise<void> {
  const database = new SQLiteD1();
  try {
    seedPerformanceFixtures(database);

    for (const limit of [10, 50, 200]) {
      const rows = await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit });
      const total = bytes(rows);
      console.log(JSON.stringify({
        kind: "publishable_payload",
        limit,
        rows: rows.length,
        totalBytes: total,
        sourceNamesBytes: sourceFieldBytes(rows, "source_names"),
        summaryBytes: sourceFieldBytes(rows, "summary"),
        whyItMattersBytes: sourceFieldBytes(rows, "why_it_matters"),
        createdAtBytes: sourceFieldBytes(rows, "created_at"),
        otherBytes: total - sourceFieldBytes(rows, "source_names") - sourceFieldBytes(rows, "summary") - sourceFieldBytes(rows, "why_it_matters") - sourceFieldBytes(rows, "created_at"),
      }));
    }

    const pending = await listReviewQueueClusters(database.asD1(), { scope: "pending-review", limit: 50 });
    console.log(JSON.stringify({ kind: "pending_payload", rows: pending.length, totalBytes: bytes(pending), sourceNamesBytes: bytes(pending.map((row) => row.source_names)) }));

    const env = { DB: database.asD1() } as Env;
    for (const clusterId of [9000, 9001]) {
      const rows = await getClusterSources(env, clusterId);
      const total = bytes(rows);
      console.log(JSON.stringify({
        kind: "selected_cluster_detail",
        clusterId,
        rows: rows.length,
        totalBytes: total,
        titleBytes: bytes(rows.map((row) => row.title)),
        urlBytes: bytes(rows.map((row) => row.url)),
        excerptBytes: bytes(rows.map((row) => row.excerpt)),
        sourceNameBytes: bytes(rows.map((row) => row.sourceName)),
        sourceTierBytes: bytes(rows.map((row) => row.sourceTier)),
        publishedAtBytes: bytes(rows.map((row) => row.publishedAt)),
      }));
    }

    assert.equal((await listReviewQueueClusters(database.asD1(), { scope: "publishable", limit: 200 })).length, 200);
    assert.equal((await listReviewQueueClusters(database.asD1(), { scope: "pending-review", limit: 50 })).length, 50);
  } finally {
    database.close();
  }
}

await measurePerformanceBaseline();
console.log("Review queue performance baseline measured.");
