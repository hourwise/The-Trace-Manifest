# KC-08G — knowledge evidence resolution evidence

**Status:** Complete locally

**Scope:** Resolve reviewed knowledge mappings to eligible external assertions, source versions, chunks, and locators at retrieval time while preserving TRACE prose as zero-weight synthesis.

## Implementation

- Extended `EvidenceExcerpt` with assertion, source-version, source-chunk, locator, and knowledge-document provenance metadata.
- `retrieveApprovedKnowledge` now resolves `knowledge_document_claim_assertions` through accepted/current/admitted `claim_assertions`, non-retired canonical claims, admitted source documents, source versions, and source chunks with both start/end locators.
- Resolved assertion excerpts are supplied separately as external evidence; the knowledge page itself remains `trace_knowledge`, `internal_synthesis`, and independent-evidence weight zero.
- An internal knowledge excerpt is marked `externalEvidenceResolved` only when every mapped assertion resolves. Missing chunks/locators or invalidated assertions remain unresolved and are not supplied as external evidence.

## Verification

- Stabilisation tests verify resolved source URL, assertion ID, source chunk, start/end locators, source role, and fail-closed behaviour when a chunk is missing.
- `npm.cmd test -- --run` passed (119 ingestion tests plus stabilisation tests).
- `npm.cmd run typecheck` passed with the four existing hints.
- `npm.cmd run test:migrations` passed.
- `npm.cmd run build` passed with Cloudflare route verification.

KC-08H remains responsible for triggering review when linked evidence changes, expires, conflicts, corrects, or supersedes the knowledge page.
