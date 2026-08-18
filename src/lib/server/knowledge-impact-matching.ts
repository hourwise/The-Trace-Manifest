/** KC-10A: read-only impact matching for newly accepted canonical claims. */

export const KNOWLEDGE_IMPACT_MATCH_VERSION = "kc-10a-v1";

export type KnowledgeImpactTargetType = "knowledge_document" | "guide" | "model_profile" | "story";

export interface KnowledgeImpactMatch {
  acceptedClaimId: string;
  targetType: KnowledgeImpactTargetType;
  targetId: string;
  targetLabel: string;
  targetState: string;
  matchKind: "lexical" | "entity" | "value" | "date";
  matchScore: number;
  matchedTerms: string[];
}

export interface KnowledgeImpactMatchingResult {
  algorithmVersion: string;
  acceptedClaimIds: string[];
  ignoredClaimIds: string[];
  matches: KnowledgeImpactMatch[];
}

interface ClaimRow { id: string; canonical_text: string; subject_name: string | null; }
interface TargetRow { target_type: KnowledgeImpactTargetType; id: string | number; label: string; state: string; content: string; }

const STOP_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "was", "with", "that", "this", "are", "be", "can"]);

/**
 * Finds bounded, deterministic review candidates. It never writes to D1 and
 * deliberately only considers accepted, admitted, current/unknown evidence.
 */
export async function matchKnowledgeImpacts(
  db: D1Database,
  input: { claimIds: string[]; maxMatchesPerClaim?: number; now?: string },
): Promise<KnowledgeImpactMatchingResult> {
  const requested = unique(input.claimIds).slice(0, 100);
  const maxMatches = boundedLimit(input.maxMatchesPerClaim, 10);
  if (!requested.length) return { algorithmVersion: KNOWLEDGE_IMPACT_MATCH_VERSION, acceptedClaimIds: [], ignoredClaimIds: [], matches: [] };

  const placeholders = requested.map(() => "?").join(", ");
  const claims = await db.prepare(`
    SELECT claim.id, claim.canonical_text, entity.name AS subject_name
    FROM canonical_claims claim
    LEFT JOIN entities entity ON entity.id = claim.subject_entity_id
    WHERE claim.id IN (${placeholders})
      AND claim.current_state IN ('active', 'qualified')
      AND EXISTS (
        SELECT 1 FROM claim_assertions assertion
        JOIN source_document_versions version ON version.id = assertion.source_document_version_id
        JOIN source_documents source ON source.id = version.source_document_id
        WHERE assertion.canonical_claim_id = claim.id
          AND assertion.admission_state = 'admitted'
          AND assertion.reviewer_state IN ('accepted', 'amended')
          AND assertion.freshness_state IN ('current', 'unknown')
          AND assertion.relationship IN ('supports', 'partially_supports', 'reports', 'reproduces')
          AND assertion.source_role IN ('evidence', 'reported_claim')
          AND assertion.evidence_treatment IN ('factual_support', 'attributed_opinion')
          AND source.admission_state = 'admitted'
          AND version.extraction_status IN ('captured', 'extracted')
          AND ((version.extraction_status IN ('captured', 'extracted') AND version.extraction_state IN ('extracted', 'pending')) OR version.extraction_method = 'feed_claim_compatibility')
      )
    ORDER BY claim.id
  `).bind(...requested).all<ClaimRow>();
  const accepted = claims.results ?? [];
  const acceptedIds = accepted.map((claim) => claim.id);
  const acceptedSet = new Set(acceptedIds);
  const ignoredClaimIds = requested.filter((id) => !acceptedSet.has(id));
  if (!accepted.length) return { algorithmVersion: KNOWLEDGE_IMPACT_MATCH_VERSION, acceptedClaimIds: [], ignoredClaimIds, matches: [] };

  const now = input.now ?? new Date().toISOString();
  const targets = await loadEligibleTargets(db, now);
  const matches: KnowledgeImpactMatch[] = [];
  for (const claim of accepted) {
    const claimText = [claim.canonical_text, claim.subject_name ?? ""].join(" ");
    const ranked = targets
      .map((target) => ({ target, score: scorePair(claimText, target.content) }))
      .filter((item) => item.score.score >= 0.25 && item.score.overlap >= 0.2)
      .sort((left, right) => right.score.score - left.score.score || left.target.target_type.localeCompare(right.target.target_type) || String(left.target.id).localeCompare(String(right.target.id)))
      .slice(0, maxMatches);
    for (const item of ranked) {
      matches.push({
        acceptedClaimId: claim.id,
        targetType: item.target.target_type,
        targetId: String(item.target.id),
        targetLabel: item.target.label,
        targetState: item.target.state,
        matchKind: item.score.kind,
        matchScore: item.score.score,
        matchedTerms: item.score.matchedTerms,
      });
    }
  }
  return { algorithmVersion: KNOWLEDGE_IMPACT_MATCH_VERSION, acceptedClaimIds: acceptedIds, ignoredClaimIds, matches };
}

async function loadEligibleTargets(db: D1Database, now: string): Promise<TargetRow[]> {
  const [documents, guides, models, stories] = await Promise.all([
    db.prepare(`
      SELECT id, canonical_question AS label, status AS state,
        canonical_question || ' ' || COALESCE(direct_answer, '') || ' ' || COALESCE(detailed_explanation, '') || ' ' || document_json AS content
      FROM knowledge_documents
      WHERE status = 'approved' AND visibility IN ('public_knowledge', 'public_guide')
        AND approved_by IS NOT NULL AND approved_at IS NOT NULL
        AND (hard_expiry IS NULL OR hard_expiry > ?)
        AND NOT EXISTS (SELECT 1 FROM knowledge_change_proposals proposal WHERE proposal.knowledge_document_id = knowledge_documents.id AND proposal.state = 'proposed')
      ORDER BY id LIMIT 500
    `).bind(now).all<TargetRow>(),
    db.prepare(`
      SELECT id, title AS label, status AS state, title || ' ' || slug || ' ' || body_markdown || ' ' || document_json AS content
      FROM guides
      WHERE status = 'published' AND visibility = 'public' AND reviewed_by IS NOT NULL AND published_at IS NOT NULL
        AND verification_status NOT IN ('outdated', 'withdrawn')
      ORDER BY id LIMIT 500
    `).all<TargetRow>(),
    db.prepare(`
      SELECT CAST(id AS TEXT) AS id, name AS label, publication_status AS state,
        name || ' ' || slug || ' ' || provider || ' ' || COALESCE(model_family, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(best_use_cases, '') AS content
      FROM models
      WHERE publication_status = 'published' AND status NOT IN ('archived', 'superseded')
      ORDER BY id LIMIT 500
    `).all<TargetRow>(),
    db.prepare(`
      SELECT CAST(id AS TEXT) AS id, title AS label, publication_status AS state,
        title || ' ' || COALESCE(topic, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(why_it_matters, '') || ' ' || COALESCE(editorial_analysis, '') AS content
      FROM story_clusters
      WHERE publication_status = 'published' AND is_published = 1
      ORDER BY id LIMIT 500
    `).all<TargetRow>(),
  ]);
  return [
    ...(documents.results ?? []).map((row) => ({ ...row, target_type: "knowledge_document" as const })),
    ...(guides.results ?? []).map((row) => ({ ...row, target_type: "guide" as const })),
    ...(models.results ?? []).map((row) => ({ ...row, target_type: "model_profile" as const })),
    ...(stories.results ?? []).map((row) => ({ ...row, target_type: "story" as const })),
  ];
}

function scorePair(left: string, right: string): { score: number; overlap: number; kind: KnowledgeImpactMatch["matchKind"]; matchedTerms: string[] } {
  const a = tokens(left); const b = new Set(tokens(right));
  const matchedTerms = [...new Set(a.filter((token) => b.has(token)))].sort();
  const overlap = a.length ? matchedTerms.length / new Set(a).size : 0;
  const entityOverlap = overlapSet(entities(left), entities(right));
  const valueOverlap = overlapSet(values(left), values(right));
  const dateOverlap = overlapSet(dates(left), dates(right));
  const score = Math.round(Math.min(1, overlap * 0.6 + entityOverlap * 0.2 + valueOverlap * 0.15 + dateOverlap * 0.05) * 10_000) / 10_000;
  const kind = valueOverlap >= 0.5 ? "value" : dateOverlap >= 0.5 ? "date" : entityOverlap >= 0.5 ? "entity" : "lexical";
  return { score, overlap, kind, matchedTerms: matchedTerms.slice(0, 20) };
}

function tokens(value: string): string[] { return value.toLowerCase().match(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g)?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? []; }
function entities(value: string): Set<string> { return new Set(value.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b/g)?.map((item) => item.toLowerCase()) ?? []); }
function values(value: string): Set<string> { return new Set(value.toLowerCase().match(/\b\d+(?:\.\d+)?(?:%|[bmk])?\b/g) ?? []); }
function dates(value: string): Set<string> { return new Set(value.match(/\b(?:19|20)\d{2}(?:-\d{2}-\d{2})?\b/g) ?? []); }
function overlapSet(left: Set<string>, right: Set<string>): number { if (!left.size || !right.size) return 0; return [...left].filter((item) => right.has(item)).length / new Set([...left, ...right]).size; }
function unique(values: string[]): string[] { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function boundedLimit(value: number | undefined, fallback: number): number { return Number.isInteger(value) && (value as number) > 0 ? Math.min(value as number, 25) : fallback; }
