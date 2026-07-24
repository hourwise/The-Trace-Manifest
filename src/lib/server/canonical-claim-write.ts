export interface CanonicalClaimWriteInput {
  feedItemId: number;
  clusterId: number | null;
  sourceId: number;
  sourceUrl: string;
  sourceUrlHash?: string | null;
  title: string;
  author?: string | null;
  publishedAt?: string | null;
  content?: string | null;
  claimText: string;
  claimClass: string;
  claimDomain: string;
  materiality: "low" | "standard" | "high" | "critical";
  confidence: number;
  extractionMethod: string;
  extractionVersion: string;
}

export interface CanonicalClaimWriteResult {
  canonicalClaimId: string;
  assertionId: string;
  sourceDocumentVersionId: string;
  inserted: boolean;
}

/**
 * Writes a newly extracted feed claim only to the canonical graph. Feed
 * ingestion has no immutable source version yet, so this creates a bounded
 * metadata-only version; a later KC-03 capture may replace it with a full
 * immutable version without changing the claim identifier.
 */
export async function writeCanonicalClaim(
  db: D1Database,
  input: CanonicalClaimWriteInput,
): Promise<CanonicalClaimWriteResult> {
  const sourceUrlHash = input.sourceUrlHash ?? await sha256(input.sourceUrl);
  const contentHash = await sha256(`${input.title}\n${input.author ?? ""}\n${input.publishedAt ?? ""}\n${input.content ?? ""}`);
  const sourceDocument = await db.prepare(
    "SELECT id FROM source_documents WHERE canonical_url_hash = ? LIMIT 1",
  ).bind(sourceUrlHash).first<{ id: string }>();
  const sourceDocumentId = sourceDocument?.id ?? `feed-source-${sourceUrlHash.slice(0, 32)}`;
  const sourceVersionId = `feed-source-version-${sourceUrlHash.slice(0, 20)}-${contentHash.slice(0, 20)}`;
  const claimHash = await sha256(`${input.claimClass}:${input.claimDomain}:${input.claimText}`);
  const canonicalClaimId = `feed-canonical-claim-${input.feedItemId}-${claimHash.slice(0, 24)}`;
  const assertionId = `feed-claim-assertion-${input.feedItemId}-${claimHash.slice(0, 24)}`;
  const admittedAt = new Date().toISOString();

  const existing = await db.prepare(
    "SELECT id FROM claim_assertions WHERE id = ?",
  ).bind(assertionId).first<{ id: string }>();
  if (existing) {
    return { canonicalClaimId, assertionId, sourceDocumentVersionId: sourceVersionId, inserted: false };
  }

  const statements = [
    db.prepare(`
      INSERT OR IGNORE INTO source_documents
        (id, canonical_url, canonical_url_hash, source_id, media_kind,
         admission_state, copyright_storage_mode)
      VALUES (?, ?, ?, ?, 'html', 'admitted', 'metadata_only')
    `).bind(sourceDocumentId, input.sourceUrl, sourceUrlHash, input.sourceId),
    db.prepare(`
      UPDATE source_documents
      SET source_id = COALESCE(?, source_id), admission_state = 'admitted',
          last_seen_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(input.sourceId, sourceDocumentId),
    db.prepare(`
      INSERT OR IGNORE INTO source_document_versions
        (id, source_document_id, content_hash, retrieved_url, retrieved_at,
         http_status, media_type, title, author, published_at, extraction_status,
         extraction_method, extraction_version)
      VALUES (?, ?, ?, ?, ?, 200, 'text/html', ?, ?, ?, 'metadata_only',
              'feed_claim_compatibility', ?)
    `).bind(
      sourceVersionId, sourceDocumentId, contentHash, input.sourceUrl, admittedAt,
      input.title, input.author ?? null, input.publishedAt ?? null, input.extractionVersion,
    ),
    db.prepare(`
      UPDATE source_documents SET current_version_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(sourceVersionId, sourceDocumentId),
    db.prepare(`
      INSERT OR IGNORE INTO canonical_claims
        (id, canonical_text, claim_class, claim_domain, current_state, materiality)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).bind(canonicalClaimId, input.claimText, input.claimClass, input.claimDomain, input.materiality),
    db.prepare(`
      INSERT OR IGNORE INTO claim_assertions
        (id, canonical_claim_id, source_document_version_id, assertion_text,
         relationship, source_role, directness, evidence_treatment,
         admission_state, freshness_state, extraction_method, extraction_version,
         confidence, reviewer_state)
      VALUES (?, ?, ?, ?, 'reports', 'reported_claim', 'direct',
              'factual_support', 'pending', 'current', ?, ?, ?, 'proposed')
    `).bind(
      assertionId, canonicalClaimId, sourceVersionId, input.claimText,
      input.extractionMethod, input.extractionVersion, Math.max(0, Math.min(1, input.confidence)),
    ),
  ];
  if (input.clusterId != null) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO story_claims
        (story_cluster_id, canonical_claim_id, role, materiality, display_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      input.clusterId, canonicalClaimId,
      input.materiality === "high" || input.materiality === "critical" ? "primary" : "supporting",
      input.materiality, input.feedItemId,
    ));
  }
  const results = await db.batch(statements);
  const assertionResult = results[results.length - (input.clusterId != null ? 1 : 0) - 1];
  return {
    canonicalClaimId,
    assertionId,
    sourceDocumentVersionId: sourceVersionId,
    inserted: Number(assertionResult?.meta.changes ?? 0) === 1,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
