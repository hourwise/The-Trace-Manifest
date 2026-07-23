export const CLAIM_RELATIONSHIP_ALGORITHM_VERSION = "claim-relationship-v1";

type ClaimRelationship = "supports" | "qualifies" | "contradicts" | "reproduces" | "corrects" | "temporal_change" | "supersedes";

interface AssertionRow {
  id: string;
  canonical_claim_id: string;
  assertion_text: string;
}

interface ClaimRow {
  id: string;
  canonical_text: string;
}

export interface ClaimRelationshipProposalResult {
  candidatesConsidered: number;
  proposalsCreated: number;
}

/** Creates deterministic relationship proposals without changing claim state or scores. */
export async function generateClaimRelationshipProposals(
  db: D1Database,
  input: { sourceAssertionId: string; maxCandidates?: number },
): Promise<ClaimRelationshipProposalResult> {
  const source = await db.prepare(`
    SELECT id, canonical_claim_id, assertion_text FROM claim_assertions WHERE id = ?
  `).bind(input.sourceAssertionId).first<AssertionRow>();
  if (!source || !source.assertion_text.trim()) return { candidatesConsidered: 0, proposalsCreated: 0 };
  const targets = await db.prepare(`
    SELECT id, canonical_text FROM canonical_claims
    WHERE current_state <> 'retired' AND id <> ?
    ORDER BY updated_at DESC
    LIMIT 500
  `).bind(source.canonical_claim_id).all<ClaimRow>();
  const scored = (targets.results ?? [])
    .map((target) => ({ target, lexical: jaccard(tokens(source.assertion_text), tokens(target.canonical_text)) }))
    .filter(({ lexical }) => lexical >= 0.2)
    .sort((a, b) => b.lexical - a.lexical)
    .slice(0, Math.max(1, Math.min(input.maxCandidates ?? 10, 25)));
  let proposalsCreated = 0;
  for (const { target, lexical } of scored) {
    const relationship = classifyRelationship(source.assertion_text);
    const cueConfidence = relationship === "supports" ? 0.5 : 0.9;
    const confidence = Math.round(Math.min(1, lexical * 0.7 + cueConfidence * 0.3) * 10_000) / 10_000;
    if (confidence < 0.25) continue;
    const idempotencyKey = await sha256(`${CLAIM_RELATIONSHIP_ALGORITHM_VERSION}:${source.id}:${target.id}:${relationship}`);
    const inserted = await db.prepare(`
      INSERT OR IGNORE INTO knowledge_claim_relationship_proposals
        (id, source_assertion_id, source_canonical_claim_id, target_canonical_claim_id,
         relationship, confidence, rationale, determination_method, algorithm_version, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'rule_proposal', ?, ?)
    `).bind(
      `claim-relationship-${idempotencyKey}`, source.id, source.canonical_claim_id, target.id,
      relationship, confidence,
      `Rule proposal: lexical overlap ${(lexical * 100).toFixed(1)}%; relationship cue classified as ${relationship}. Publisher review is required before recording the relation.`,
      CLAIM_RELATIONSHIP_ALGORITHM_VERSION, idempotencyKey,
    ).run();
    proposalsCreated += Number(inserted.meta.changes ?? 0);
  }
  return { candidatesConsidered: scored.length, proposalsCreated };
}

function classifyRelationship(text: string): ClaimRelationship {
  const lower = text.toLowerCase();
  if (/\b(correct(?:ed|ion)?|incorrect|wrong|revis(?:e|ed)|fix(?:ed)?)\b/.test(lower)) return "corrects";
  if (/\b(contradict(?:s|ed|ion)?|refut(?:e|es|ed)|disput(?:e|es|ed)|den(?:y|ies|ied))\b|\bnot true\b|\bfalse\b/.test(lower)) return "contradicts";
  if (/\b(reproduc(?:e|es|ed|tion)|replicat(?:e|es|ed|ion)|same result|independent test)\b/.test(lower)) return "reproduces";
  if (/\b(supersed(?:e|es|ed)|replaced|new version|updated release)\b/.test(lower)) return "supersedes";
  if (/\b(previously|formerly|now|later|as of|changed|since)\b/.test(lower)) return "temporal_change";
  if (/\b(however|but|although|limitation|caveat|may|might|could|only)\b/.test(lower)) return "qualifies";
  return "supports";
}

function tokens(value: string): Set<string> {
  const stopWords = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "was", "with"]);
  return new Set(value.toLowerCase().match(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g)?.filter((token) => token.length > 1 && !stopWords.has(token)) ?? []);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  return intersection / new Set([...left, ...right]).size;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
