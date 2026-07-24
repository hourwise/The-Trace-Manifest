import { parseKnowledgeMarkdown, type KnowledgeMaterialClaim, type KnowledgeMarkdownEvidenceUrl } from "./knowledge-markdown";

export const KNOWLEDGE_LINK_SUGGESTION_VERSION = "kc-08b-v1";

export interface KnowledgeClaimSuggestion {
  sectionKey: string;
  claimText: string;
  canonicalClaimId: string;
  canonicalText: string;
  matchKind: "lexical" | "entity" | "value" | "date" | "semantic";
  matchScore: number;
  components: MatchSignals;
}

export interface KnowledgeSourceSuggestion {
  evidenceUrl: string;
  sourceDocumentId: string | null;
  registrySourceId: number | null;
  canonicalUrl: string;
  name: string;
  admissionState: string;
  matchKind: "exact_url" | "source_registry" | "domain";
  matchScore: number;
}

export interface KnowledgeLinkSuggestions {
  knowledgeDocumentId: string;
  algorithmVersion: string;
  claimSuggestions: KnowledgeClaimSuggestion[];
  sourceSuggestions: KnowledgeSourceSuggestion[];
  unresolvedClaimCount: number;
  unresolvedSourceCount: number;
}

export class KnowledgeLinkSuggestionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "KnowledgeLinkSuggestionError";
  }
}

interface CanonicalClaimRow {
  id: string;
  canonical_text: string;
}

interface SourceDocumentRow {
  id: string;
  canonical_url: string;
  admission_state: string;
  source_id: number | null;
}

interface RegistrySourceRow {
  id: number;
  name: string;
  url: string;
}

/**
 * Suggests existing claims and admitted source records without mutating D1.
 * Publisher review and foreign-key-backed mapping remain later KC-08 work.
 */
export async function suggestKnowledgeLinks(
  db: D1Database,
  input: { knowledgeDocumentId: string; maxClaims?: number; maxSources?: number },
): Promise<KnowledgeLinkSuggestions> {
  const document = await db.prepare(
    "SELECT id, document_json FROM knowledge_documents WHERE id = ?",
  ).bind(input.knowledgeDocumentId).first<{ id: string; document_json: string }>();
  if (!document) throw new KnowledgeLinkSuggestionError("document_not_found", "Knowledge document not found.", 404);

  const parsed = parseDocumentJson(document.document_json);
  const claims = parsed.materialClaims;
  const evidenceUrls = parsed.evidenceUrls;
  const maxClaims = boundedLimit(input.maxClaims, 10);
  const maxSources = boundedLimit(input.maxSources, 10);

  const canonicalClaims = await db.prepare(`
    SELECT id, canonical_text
    FROM canonical_claims
    WHERE current_state <> 'retired'
    ORDER BY updated_at DESC
    LIMIT 500
  `).all<CanonicalClaimRow>();
  const claimSuggestions: KnowledgeClaimSuggestion[] = [];
  let unresolvedClaimCount = 0;
  for (const claim of claims) {
    const ranked = (canonicalClaims.results ?? [])
      .map((target) => ({ target, signals: scoreClaimPair(claim.text, target.canonical_text) }))
      .filter(({ signals }) => isCandidate(signals))
      .sort((left, right) => scoreSignals(right.signals) - scoreSignals(left.signals))
      .slice(0, maxClaims);
    if (ranked.length === 0) unresolvedClaimCount++;
    for (const item of ranked) {
      claimSuggestions.push({
        sectionKey: claim.sectionKey,
        claimText: claim.text,
        canonicalClaimId: item.target.id,
        canonicalText: item.target.canonical_text,
        matchKind: strongestMatchKind(item.signals),
        matchScore: scoreSignals(item.signals),
        components: item.signals,
      });
    }
  }

  const [sourceDocuments, registrySources] = await Promise.all([
    db.prepare(`
      SELECT id, canonical_url, admission_state, source_id
      FROM source_documents
      WHERE admission_state <> 'rejected'
      ORDER BY updated_at DESC
      LIMIT 500
    `).all<SourceDocumentRow>(),
    db.prepare("SELECT id, name, url FROM sources WHERE active = 1 ORDER BY id LIMIT 500").all<RegistrySourceRow>(),
  ]);
  const sourceSuggestions: KnowledgeSourceSuggestion[] = [];
  let unresolvedSourceCount = 0;
  for (const evidence of evidenceUrls) {
    const suggestion = suggestSource(evidence, sourceDocuments.results ?? [], registrySources.results ?? []);
    if (suggestion.length === 0) unresolvedSourceCount++;
    sourceSuggestions.push(...suggestion.slice(0, maxSources));
  }

  return {
    knowledgeDocumentId: document.id,
    algorithmVersion: KNOWLEDGE_LINK_SUGGESTION_VERSION,
    claimSuggestions,
    sourceSuggestions,
    unresolvedClaimCount,
    unresolvedSourceCount,
  };
}

function parseDocumentJson(documentJson: string): {
  materialClaims: KnowledgeMaterialClaim[];
  evidenceUrls: KnowledgeMarkdownEvidenceUrl[];
} {
  try {
    const document = JSON.parse(documentJson) as {
      body?: unknown;
      materialClaims?: unknown;
      evidenceUrls?: unknown;
    };
    const parsed = typeof document.body === "string" ? parseKnowledgeMarkdown(`---\nplaceholder: true\n---\n${document.body}`) : null;
    const materialClaims = Array.isArray(document.materialClaims)
      ? document.materialClaims.filter(isMaterialClaim)
      : [];
    const evidenceUrls = Array.isArray(document.evidenceUrls)
      ? document.evidenceUrls.filter(isEvidenceUrl)
      : [];
    if (materialClaims.length || evidenceUrls.length) return { materialClaims, evidenceUrls };
    if (parsed && !("error" in parsed)) return { materialClaims: parsed.materialClaims, evidenceUrls: parsed.evidenceUrls };
  } catch {
    // Invalid document JSON is reported as an empty suggestion set; ingestion
    // validation remains responsible for rejecting malformed new documents.
  }
  return { materialClaims: [], evidenceUrls: [] };
}

function isMaterialClaim(value: unknown): value is KnowledgeMaterialClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<KnowledgeMaterialClaim>;
  return typeof claim.text === "string" && typeof claim.sectionKey === "string"
    && typeof claim.relationship === "string";
}

function isEvidenceUrl(value: unknown): value is KnowledgeMarkdownEvidenceUrl {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<KnowledgeMarkdownEvidenceUrl>;
  return typeof source.url === "string" && typeof source.name === "string";
}

function suggestSource(
  evidence: KnowledgeMarkdownEvidenceUrl,
  documents: SourceDocumentRow[],
  registrySources: RegistrySourceRow[],
): KnowledgeSourceSuggestion[] {
  const exact = documents.filter((document) => normaliseUrl(document.canonical_url) === normaliseUrl(evidence.url));
  if (exact.length) {
    return exact.map((document) => ({
      evidenceUrl: evidence.url,
      sourceDocumentId: document.id,
      registrySourceId: document.source_id,
      canonicalUrl: document.canonical_url,
      name: evidence.name,
      admissionState: document.admission_state,
      matchKind: "exact_url",
      matchScore: 1,
    }));
  }

  const hostname = sourceHostname(evidence.url);
  const registry = registrySources.find((source) => sourceHostname(source.url) === hostname);
  const sameDomain = documents.filter((document) => sourceHostname(document.canonical_url) === hostname);
  if (registry) {
    const registryDocument = sameDomain.find((document) => document.source_id === registry.id) ?? sameDomain[0];
    return [{
      evidenceUrl: evidence.url,
      sourceDocumentId: registryDocument?.id ?? null,
      registrySourceId: registry.id,
      canonicalUrl: registryDocument?.canonical_url ?? registry.url,
      name: registry.name,
      admissionState: registryDocument?.admission_state ?? "registry_only",
      matchKind: "source_registry",
      matchScore: 0.75,
    }];
  }
  return sameDomain.slice(0, 3).map((document) => ({
    evidenceUrl: evidence.url,
    sourceDocumentId: document.id,
    registrySourceId: document.source_id,
    canonicalUrl: document.canonical_url,
    name: evidence.name,
    admissionState: document.admission_state,
    matchKind: "domain",
    matchScore: 0.5,
  }));
}

interface MatchSignals {
  lexical: number;
  entity: number;
  value: number;
  date: number;
  semantic: number;
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
    signals.lexical * 0.45 + signals.entity * 0.2 + signals.value * 0.2
      + signals.date * 0.1 + signals.semantic * 0.05,
  ) * 10_000) / 10_000;
}

function isCandidate(signals: MatchSignals): boolean {
  return scoreSignals(signals) >= 0.35
    && (signals.lexical >= 0.2 || signals.entity >= 0.5 || signals.value >= 0.5
      || signals.date >= 0.5 || signals.semantic >= 0.35);
}

function strongestMatchKind(signals: MatchSignals): KnowledgeClaimSuggestion["matchKind"] {
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
  return [...a].filter((item) => b.has(item)).length / new Set([...a, ...b]).size;
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

function normaliseUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
}

function sourceHostname(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function boundedLimit(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 25) : fallback;
}
