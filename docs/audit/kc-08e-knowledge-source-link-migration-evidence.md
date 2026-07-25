# KC-08E — legacy knowledge source-link migration evidence

**Status:** Complete locally

**Scope:** Replace string-only knowledge source links with reviewed foreign-key-backed section, claim, and assertion joins without silently promoting old references.

## Implementation

- Added `db/migration-0048-knowledge-source-link-audit.sql`.
- Existing `knowledge_document_sources` rows are snapshotted into `knowledge_source_link_migration_audit`; an insert trigger captures future compatibility rows.
- The audit ledger retains the old `source_reference` and `claim_reference` strings for migration history only. It does not make them retrieval-eligible evidence.
- `mapKnowledgeDocumentClaim` accepts an optional legacy-link identifier. When supplied, it requires a reviewed external assertion whose source URL resolves to the legacy URL, writes the canonical joins, and records the reviewed migration target in one D1 batch.
- The publisher mapper now exposes pending legacy links and makes the migration association explicit. Rejected or retained-legacy links cannot be silently reused.

## Verification

- Stabilisation tests verify that a reviewed mapping closes the audit record and creates both canonical join rows.
- Migration validation applies migration 0048 twice and checks the audit table is present.
- `npm.cmd test -- --run` passed (119 ingestion tests plus stabilisation tests).
- `npm.cmd run typecheck` passed with the four existing hints.
- `npm.cmd run test:migrations` passed.
- `npm.cmd run build` passed with route verification.

KC-08F remains responsible for making public knowledge approval fail closed unless every material section has reviewed evidence or an explicit inference/synthesis label.
