# KC-08B Knowledge Link Suggestions Evidence

**Status:** Complete locally  
**Date:** 24 July 2026  
**Scope:** deterministic suggestions for existing canonical claims and source records

## Implemented

- Added `src/lib/server/knowledge-link-suggestions.ts` with version `kc-08b-v1`.
- Material claims are ranked against active, non-retired canonical claims using lexical, entity, numeric-value, date, and cosine-proxy signals.
- Evidence URLs are matched to existing `source_documents` by canonical URL, then to active source-registry entries or same-domain source documents.
- Added publisher-only `GET /api/admin/knowledge/suggestions?id=...`.
- The endpoint is read-only: it does not create `knowledge_document_claims`, assertion joins, source admissions, canonical claims, or evidence-score changes.

## Verification

The stabilisation suite confirms that a matching canonical claim and exact source document are suggested and that no knowledge mapping is created. `npm test` passed with 119 ingestion tests plus stabilisation tests, `npm run typecheck` passed with 0 errors, and the Astro/Cloudflare production build plus route verification passed.

KC-08C remains responsible for queueing missing admitted source URLs; KC-08D onward handles publisher mapping and review.
