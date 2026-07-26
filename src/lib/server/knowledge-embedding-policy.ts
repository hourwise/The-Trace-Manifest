/**
 * KC-09A: versioned embedding and Vectorize rollout policy.
 *
 * This module is intentionally declarative. It locks the only Preview-safe
 * configuration that later indexing work may use; it does not call Workers AI,
 * create a Vectorize index, or permit a production binding.
 */

export type KnowledgeVectorRecordType =
  | "source_chunk"
  | "canonical_claim"
  | "published_story"
  | "knowledge_section"
  | "guide"
  | "correction";

export type KnowledgeVectorMetadataField =
  | "record_type"
  | "language"
  | "admission_state"
  | "publication_state"
  | "embedding_version";

export interface KnowledgeVectorMetadataIndex {
  field: KnowledgeVectorMetadataField;
  type: "string";
}

export interface KnowledgeEmbeddingPolicy {
  policyVersion: string;
  embeddingProvider: "workers_ai";
  embeddingModel: "@cf/baai/bge-m3";
  dimensions: 1024;
  metric: "cosine";
  languagePolicy: "multilingual_original_language";
  sourceChunkPolicy: {
    existingChunkTextMaxChars: 2_000;
    embeddingInputMaxChars: 2_000;
    overlapChars: 0;
    locatorRequirement: "required";
  };
  budget: {
    previewDailyInputTokenCeiling: 250_000;
    previewBackfillInputTokenCeiling: 1_000_000;
    maximumInputTokensPerBatch: 16_000;
    pricingVerifiedAt: "2026-07-26";
    inputUsdPerMillionTokens: 0.012;
  };
  metadataIndexes: readonly KnowledgeVectorMetadataIndex[];
  rollout: {
    previewIndexName: string;
    namespace: string;
    productionIndexEnabled: false;
    requiredBeforeInsert: readonly [
      "create_preview_index",
      "create_metadata_indexes",
      "verify_metadata_indexes",
      "verify_d1_eligibility_resolution",
    ];
  };
  reembedding: {
    trigger: "provider_model_dimension_or_chunk_policy_change";
    procedure: readonly [
      "create_new_policy_version_and_preview_index",
      "create_and_verify_metadata_indexes_before_upserts",
      "write_idempotent_d1_index_operations",
      "upsert_and_confirm_preview_vectors",
      "evaluate_d1_resolved_retrieval_and_citations",
      "request_separate_production_rollout_approval",
      "retain_old_namespace_until_rollback_window_closes",
    ];
  };
}

/**
 * BGE-M3 is selected because Workers AI hosts it and it supports multilingual
 * dense retrieval. The fixed dimension is part of the Vectorize contract and
 * may only change through the re-embedding procedure below.
 */
export const KC09_EMBEDDING_POLICY: KnowledgeEmbeddingPolicy = {
  policyVersion: "kc09-bge-m3-v1",
  embeddingProvider: "workers_ai",
  embeddingModel: "@cf/baai/bge-m3",
  dimensions: 1024,
  metric: "cosine",
  languagePolicy: "multilingual_original_language",
  sourceChunkPolicy: {
    // KC-04 persists one locator-backed HTML block per chunk, capped at 2,000
    // characters. KC-09 preserves those locators instead of re-chunking.
    existingChunkTextMaxChars: 2_000,
    embeddingInputMaxChars: 2_000,
    overlapChars: 0,
    locatorRequirement: "required",
  },
  budget: {
    // Token ceilings are conservative upper bounds, independent of a provider
    // price change. The live price must be re-checked before enabling a run.
    previewDailyInputTokenCeiling: 250_000,
    previewBackfillInputTokenCeiling: 1_000_000,
    maximumInputTokensPerBatch: 16_000,
    pricingVerifiedAt: "2026-07-26",
    inputUsdPerMillionTokens: 0.012,
  },
  metadataIndexes: [
    { field: "record_type", type: "string" },
    { field: "language", type: "string" },
    { field: "admission_state", type: "string" },
    { field: "publication_state", type: "string" },
    { field: "embedding_version", type: "string" },
  ],
  rollout: {
    previewIndexName: "trace-manifest-knowledge-preview-bge-m3-v1",
    namespace: "kc09-bge-m3-v1",
    productionIndexEnabled: false,
    requiredBeforeInsert: [
      "create_preview_index",
      "create_metadata_indexes",
      "verify_metadata_indexes",
      "verify_d1_eligibility_resolution",
    ],
  },
  reembedding: {
    trigger: "provider_model_dimension_or_chunk_policy_change",
    procedure: [
      "create_new_policy_version_and_preview_index",
      "create_and_verify_metadata_indexes_before_upserts",
      "write_idempotent_d1_index_operations",
      "upsert_and_confirm_preview_vectors",
      "evaluate_d1_resolved_retrieval_and_citations",
      "request_separate_production_rollout_approval",
      "retain_old_namespace_until_rollback_window_closes",
    ],
  },
};

export type KnowledgeEmbeddingEnvironment = "preview" | "production" | "development";

export type KnowledgeEmbeddingRollout =
  | { enabled: true; indexName: string; namespace: string; policy: KnowledgeEmbeddingPolicy }
  | { enabled: false; reason: "preview_only" | "development_uses_no_remote_index" };

/** Production deliberately has no eligible index target in KC-09A. */
export function embeddingRolloutFor(environment: KnowledgeEmbeddingEnvironment): KnowledgeEmbeddingRollout {
  if (environment === "preview") {
    return {
      enabled: true,
      indexName: KC09_EMBEDDING_POLICY.rollout.previewIndexName,
      namespace: KC09_EMBEDDING_POLICY.rollout.namespace,
      policy: KC09_EMBEDDING_POLICY,
    };
  }
  return {
    enabled: false,
    reason: environment === "production" ? "preview_only" : "development_uses_no_remote_index",
  };
}

/** Metadata remains intentionally small and stable so Vectorize is recall-only. */
export function isAllowedKnowledgeVectorMetadataField(value: string): value is KnowledgeVectorMetadataField {
  return KC09_EMBEDDING_POLICY.metadataIndexes.some((index) => index.field === value);
}
