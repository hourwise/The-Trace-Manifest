import { parseKnowledgeMarkdown, type KnowledgeMaterialClaim } from "./knowledge-markdown";

export interface KnowledgeApprovalGateResult {
  eligible: boolean;
  code: "eligible" | "material_claims_missing" | "material_claim_unmapped";
  materialClaimCount: number;
  eligibleSectionCount: number;
  unresolvedSections: string[];
  inferenceSections: string[];
}

interface StoredMaterialClaim {
  sectionKey?: unknown;
  relationship?: unknown;
}

interface MappingCandidate {
  section_key: string;
  relationship: string;
  claim_class: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  eligible_assertion_count: number;
}

const EXPLICIT_SYNTHESIS_CLASSES = new Set(["editorial_synthesis", "trace_manifest_inference"]);

/**
 * Public knowledge approval gate. This is deliberately independent of model
 * confidence and of document-level source-link counts: every material section
 * needs an attributable accepted assertion, or a reviewed explicit inference
 * basis. Legacy string links alone never satisfy the gate.
 */
export async function evaluateKnowledgeApproval(
  db: D1Database,
  knowledgeDocumentId: string,
): Promise<KnowledgeApprovalGateResult> {
  const document = await db.prepare(
    "SELECT document_json FROM knowledge_documents WHERE id = ?",
  ).bind(knowledgeDocumentId).first<{ document_json: string }>();
  if (!document) {
    return {
      eligible: false,
      code: "material_claims_missing",
      materialClaimCount: 0,
      eligibleSectionCount: 0,
      unresolvedSections: [],
      inferenceSections: [],
    };
  }

  const materialClaims = materialClaimsFromDocument(document.document_json);
  const sectionKeys = [...new Set(materialClaims.map((claim) => claim.sectionKey).filter(Boolean))];
  if (sectionKeys.length === 0) {
    return {
      eligible: false,
      code: "material_claims_missing",
      materialClaimCount: 0,
      eligibleSectionCount: 0,
      unresolvedSections: [],
      inferenceSections: [],
    };
  }

  const mappings = await db.prepare(`
    SELECT kdc.section_key, kdc.relationship, cc.claim_class,
           kdc.reviewed_by, kdc.reviewed_at,
           COUNT(CASE WHEN ca.id IS NOT NULL THEN 1 END) AS eligible_assertion_count
    FROM knowledge_document_claims kdc
    JOIN canonical_claims cc ON cc.id = kdc.canonical_claim_id
    LEFT JOIN knowledge_document_claim_assertions kda
      ON kda.knowledge_document_id = kdc.knowledge_document_id
     AND kda.section_key = kdc.section_key
     AND kda.canonical_claim_id = kdc.canonical_claim_id
    LEFT JOIN claim_assertions ca
      ON ca.id = kda.claim_assertion_id
     AND ca.canonical_claim_id = kda.canonical_claim_id
     AND ca.reviewer_state = 'accepted'
     AND ca.admission_state = 'admitted'
     AND ca.freshness_state = 'current'
     AND ca.evidence_treatment <> 'internal_synthesis'
    WHERE kdc.knowledge_document_id = ?
    GROUP BY kdc.section_key, kdc.canonical_claim_id, kdc.relationship,
             cc.claim_class, kdc.reviewed_by, kdc.reviewed_at
  `).bind(knowledgeDocumentId).all<MappingCandidate>();

  const bySection = new Map<string, MappingCandidate[]>();
  for (const mapping of mappings.results ?? []) {
    const list = bySection.get(mapping.section_key) ?? [];
    list.push(mapping);
    bySection.set(mapping.section_key, list);
  }

  const unresolvedSections: string[] = [];
  const inferenceSections: string[] = [];
  for (const sectionKey of sectionKeys) {
    const candidates = bySection.get(sectionKey) ?? [];
    const eligible = candidates.some((candidate) =>
      candidate.reviewed_by && candidate.reviewed_at && candidate.eligible_assertion_count > 0,
    );
    const explicitInference = candidates.some((candidate) =>
      candidate.reviewed_by && candidate.reviewed_at
      && candidate.relationship === "inference_basis"
      && EXPLICIT_SYNTHESIS_CLASSES.has(candidate.claim_class),
    );
    if (explicitInference) inferenceSections.push(sectionKey);
    if (!eligible && !explicitInference) unresolvedSections.push(sectionKey);
  }

  return {
    eligible: unresolvedSections.length === 0,
    code: unresolvedSections.length === 0 ? "eligible" : "material_claim_unmapped",
    materialClaimCount: materialClaims.length,
    eligibleSectionCount: sectionKeys.length - unresolvedSections.length,
    unresolvedSections,
    inferenceSections,
  };
}

function materialClaimsFromDocument(documentJson: string): Array<{ sectionKey: string; relationship: string }> {
  try {
    const document = JSON.parse(documentJson) as {
      body?: unknown;
      materialClaims?: unknown;
    };
    if (Array.isArray(document.materialClaims)) {
      const claims = document.materialClaims
        .map((claim) => claim as StoredMaterialClaim)
        .filter((claim): claim is StoredMaterialClaim & { sectionKey: string } =>
          typeof claim.sectionKey === "string" && claim.sectionKey.length > 0,
        )
        .map((claim) => ({ sectionKey: claim.sectionKey, relationship: typeof claim.relationship === "string" ? claim.relationship : "" }));
      if (claims.length > 0) return claims;
    }
    if (typeof document.body === "string") {
      const parsed = parseKnowledgeMarkdown(`---\nplaceholder: true\n---\n${document.body}`);
      if (!("error" in parsed)) return parsed.materialClaims.map((claim: KnowledgeMaterialClaim) => ({
        sectionKey: claim.sectionKey,
        relationship: claim.relationship,
      }));
    }
  } catch {
    // Malformed document JSON fails closed below.
  }
  return [];
}
