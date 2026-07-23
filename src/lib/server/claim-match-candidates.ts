export const CLAIM_MATCH_ALGORITHM_VERSION = "claim-match-v1";

type MatchKind = "lexical" | "entity" | "value" | "date" | "semantic";

interface SourceExtractionRow {
  id: string;
  source_document_version_id: string;
  extraction_kind: string;
  payload_json: string;
}

interface CanonicalClaimRow {
  id: string;
  canonical_text: string;
}

export interface ClaimMatchResult {
  candidatesConsidered: number;
  candidatesCreated: number;
}

interface MatchSignals {
  lexical: number;
  entity: number;
  value: number;
  date: number;
  semantic: number;
}

/** Creates deterministic, review-gated candidates for one extracted claim. */
export async function generateClaimMatchCandidates(
  db: D1Database,
  input: { sourceExtractionId: string; maxCandidates?: number },
): Promise<ClaimMatchResult> {
  const extraction = await db.prepare(`
    SELECT id, source_document_version_id, extraction_kind, payload_json
    FROM source_extractions WHERE id = ?
  `).bind(input.sourceExtractionId).first<SourceExtractionRow>();
  if (!extraction || !["material_claim", "benchmark_result"].includes(extraction.extraction_kind)) {
    return { candidatesConsidered: 0, candidatesCreated: 0 };
  }
  const extractedText = extractText(extraction.payload_json);
  if (!extractedText) return { candidatesConsidered: 0, candidatesCreated: 0 };
  const ownClaim = await db.prepare("SELECT canonical_claim_id FROM claim_assertions WHERE id = ?")
    .bind(`assertion-${extraction.id}`).first<{ canonical_claim_id: string }>();
  const targets = await db.prepare(`
    SELECT id, canonical_text FROM canonical_claims
    WHERE current_state <> 'retired' AND id <> ?
    ORDER BY updated_at DESC
    LIMIT 500
  `).bind(ownClaim?.canonical_claim_id ?? "").all<CanonicalClaimRow>();
  const scored = (targets.results ?? [])
    .map((target) => ({ target, signals: scoreClaimPair(extractedText, target.canonical_text) }))
    .filter(({ signals }) => isCandidate(signals))
    .sort((a, b) => scoreSignals(b.signals) - scoreSignals(a.signals))
    .slice(0, Math.max(1, Math.min(input.maxCandidates ?? 10, 25)));

  let candidatesCreated = 0;
  for (const { target, signals } of scored) {
    const matchKind = strongestMatchKind(signals);
    const idempotencyKey = await sha256(`${CLAIM_MATCH_ALGORITHM_VERSION}:${extraction.id}:${target.id}`);
    const inserted = await db.prepare(`
      INSERT OR IGNORE INTO knowledge_claim_match_candidates
        (id, source_extraction_id, source_document_version_id, candidate_canonical_claim_id,
         match_kind, match_score, component_json, algorithm_version, semantic_method, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `claim-match-${idempotencyKey}`, extraction.id, extraction.source_document_version_id,
      target.id, matchKind, scoreSignals(signals), JSON.stringify(signals),
      CLAIM_MATCH_ALGORITHM_VERSION,
      matchKind === "semantic" ? "lexical_cosine_proxy_v1" : null,
      idempotencyKey,
    ).run();
    candidatesCreated += Number(inserted.meta.changes ?? 0);
  }
  return { candidatesConsidered: scored.length, candidatesCreated };
}

function extractText(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson) as { text?: unknown };
    return typeof payload.text === "string" ? payload.text.trim().slice(0, 2_000) : null;
  } catch {
    return null;
  }
}

function scoreClaimPair(source: string, target: string): MatchSignals {
  const sourceTokens = tokens(source);
  const targetTokens = tokens(target);
  return {
    lexical: jaccard(sourceTokens, targetTokens),
    entity: jaccard(entities(source), entities(target)),
    value: jaccard(values(source), values(target)),
    date: jaccard(dates(source), dates(target)),
    semantic: cosine(sourceTokens, targetTokens),
  };
}

function scoreSignals(signals: MatchSignals): number {
  return Math.round(Math.min(1,
    signals.lexical * 0.45
      + signals.entity * 0.2
      + signals.value * 0.2
      + signals.date * 0.1
      + signals.semantic * 0.05,
  ) * 10_000) / 10_000;
}

function isCandidate(signals: MatchSignals): boolean {
  return scoreSignals(signals) >= 0.35
    && (signals.lexical >= 0.2 || signals.entity >= 0.5 || signals.value >= 0.5 || signals.date >= 0.5 || signals.semantic >= 0.35);
}

function strongestMatchKind(signals: MatchSignals): MatchKind {
  if (signals.value >= 0.8) return "value";
  if (signals.date >= 0.8) return "date";
  if (signals.entity >= 0.8) return "entity";
  if (signals.lexical >= 0.55) return "lexical";
  return "semantic";
}

function tokens(value: string): string[] {
  const stopWords = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "was", "with"]);
  return value.toLowerCase().match(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g)?.filter((token) => token.length > 1 && !stopWords.has(token)) ?? [];
}

function entities(value: string): Set<string> {
  return new Set(value.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b/g)?.map((item) => item.toLowerCase()) ?? []);
}

function values(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/\b\d+(?:\.\d+)?(?:%|[bmk])?\b/g) ?? []);
}

function dates(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/\b(?:19|20)\d{2}(?:-\d{2}-\d{2})?\b/g) ?? []);
}

function jaccard(left: Iterable<string>, right: Iterable<string>): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / new Set([...a, ...b]).size;
}

function cosine(left: string[], right: string[]): number {
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  left.forEach((token) => a.set(token, (a.get(token) ?? 0) + 1));
  right.forEach((token) => b.set(token, (b.get(token) ?? 0) + 1));
  if (a.size === 0 || b.size === 0) return 0;
  const dot = [...a].reduce((sum, [token, count]) => sum + count * (b.get(token) ?? 0), 0);
  const normA = Math.sqrt([...a.values()].reduce((sum, count) => sum + count * count, 0));
  const normB = Math.sqrt([...b.values()].reduce((sum, count) => sum + count * count, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
