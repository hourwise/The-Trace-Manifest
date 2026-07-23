export const PROVENANCE_GROUP_ALGORITHM_VERSION = "provenance-group-v1";

interface SourceOriginRow {
  source_document_id: string;
  content_hash: string;
  earliest_retrieved_at: string;
}

export interface ProvenanceGroupProposalResult {
  proposalsConsidered: number;
  proposalsCreated: number;
}

/** Creates exact-content shared-origin proposals; no group or membership is written. */
export async function generateProvenanceGroupProposals(
  db: D1Database,
  input: { sourceDocumentVersionId?: string; maxGroups?: number } = {},
): Promise<ProvenanceGroupProposalResult> {
  const hashes = input.sourceDocumentVersionId
    ? await db.prepare("SELECT content_hash FROM source_document_versions WHERE id = ?")
      .bind(input.sourceDocumentVersionId).all<{ content_hash: string }>()
    : await db.prepare(`
        SELECT content_hash FROM source_document_versions
        WHERE content_hash IS NOT NULL AND content_hash <> ''
        GROUP BY content_hash HAVING COUNT(DISTINCT source_document_id) > 1
        LIMIT 100
      `).all<{ content_hash: string }>();
  const candidates: SourceOriginRow[] = [];
  for (const hashRow of hashes.results ?? []) {
    const rows = await db.prepare(`
      SELECT source_document_id, content_hash, MIN(retrieved_at) AS earliest_retrieved_at
      FROM source_document_versions
      WHERE content_hash = ?
      GROUP BY source_document_id, content_hash
      HAVING COUNT(*) >= 1
      ORDER BY earliest_retrieved_at ASC, source_document_id ASC
    `).bind(hashRow.content_hash).all<SourceOriginRow>();
    if ((rows.results ?? []).length > 1) candidates.push(...(rows.results ?? []));
  }

  const groups = new Map<string, SourceOriginRow[]>();
  for (const row of candidates) {
    const entries = groups.get(row.content_hash) ?? [];
    entries.push(row);
    groups.set(row.content_hash, entries);
  }
  const maxGroups = Math.max(1, Math.min(input.maxGroups ?? 25, 100));
  let proposalsCreated = 0;
  let proposalsConsidered = 0;
  for (const [contentHash, sources] of [...groups.entries()].slice(0, maxGroups)) {
    const root = sources[0];
    const originKey = await sha256(`exact-content:${contentHash}`);
    for (const source of sources) {
      proposalsConsidered++;
      const idempotencyKey = await sha256(`${PROVENANCE_GROUP_ALGORITHM_VERSION}:${originKey}:${source.source_document_id}`);
      const inserted = await db.prepare(`
        INSERT OR IGNORE INTO knowledge_provenance_group_proposals
          (id, source_document_id, root_source_document_id, origin_key,
           proposed_relationship, origin_type, explanation, confidence,
           review_requirement, determination_method, algorithm_version, idempotency_key)
        VALUES (?, ?, ?, ?, ?, 'unknown', ?, 0.98, 'mandatory', 'rule_proposal', ?, ?)
      `).bind(
        `provenance-group-${idempotencyKey}`, source.source_document_id, root.source_document_id,
        originKey, source.source_document_id === root.source_document_id ? "original" : "syndicated_from",
        "Rule proposal: distinct admitted source documents share an exact immutable content hash; publisher review is mandatory before grouping.",
        PROVENANCE_GROUP_ALGORITHM_VERSION, idempotencyKey,
      ).run();
      proposalsCreated += Number(inserted.meta.changes ?? 0);
    }
  }
  return { proposalsConsidered, proposalsCreated };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
