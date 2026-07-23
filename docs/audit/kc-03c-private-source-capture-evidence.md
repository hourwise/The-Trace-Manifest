# KC-03C — Private source capture evidence

**Date:** 23 July 2026  
**Status:** Complete — local implementation and validation only.  
**Scope:** Persist an already-admitted source version and its deterministic extraction in private R2, with D1 metadata, hashes, content-addressed keys, and an idempotent reconciliation operation. This task does not connect feed ingestion, publish content, run AI extraction, or promote public evidence.

## Implemented

- `src/lib/server/source-capture.ts` accepts only an admitted, non-empty source and normalises the canonical URL before deriving a SHA-256 URL identity and content-addressed version identity.
- Permitted `private_full_text` and `editor_supplied_document` captures write the immutable original and structured extraction JSON to private R2. `metadata_only` and `short_excerpt` modes do not write an unpermitted full original; `prohibited` fails closed.
- D1 stores source/version metadata, hashes, byte length, extraction method/status, and R2 keys. Large bodies do not enter D1. Repeated capture of the same URL/content is stable through deterministic identifiers and `INSERT OR IGNORE` outbox state.
- `knowledge_index_operations` records one retry-safe `r2_put` operation per version. KC-02 reconciliation now verifies both the original and extraction objects, including their content-hash metadata, before marking the operation complete.

## Validation

- `npm test` passed: 119 ingestion tests and the stabilisation suite.
- Worker TypeScript compilation passed with `npx tsc --noEmit -p workers/tsconfig.json`.
- Capture tests cover content-addressed idempotency, private original/extraction writes, D1 metadata and outbox rows, metadata-only refusal to write R2, validation failure, and reconciliation of both R2 artefacts.
- `git diff --check` passed.

## Deliberately deferred

- KC-03D will connect admitted RSS/feed items to this capture path and Queue production. Manual URL capture and document upload remain KC-03E/F.
- No R2 object is public, and no capture operation makes a source a claim, corroborating evidence, searchable knowledge result, or score upgrade.
