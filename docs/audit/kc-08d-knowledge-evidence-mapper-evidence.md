# KC-08D Knowledge Evidence Mapper Evidence

**Status:** Complete locally  
**Date:** 24 July 2026  
**Scope:** publisher review of section → canonical claim → source assertion mappings

## Implemented

- Added the publisher-only `/admin/knowledge/mappings` Astro page with document selection, KC-08B suggestions, eligible assertion choices, and reviewed mapping submission.
- Added `POST /api/admin/knowledge/map` with same-origin and publisher authentication.
- Added `mapKnowledgeDocumentClaim` to validate material sections, non-retired canonical claims, and accepted/current/admitted assertions whose treatment is not `internal_synthesis`.
- Writes are attributable through `reviewed_by`, `reviewed_at`, and an `admin_audit_log` event. The mapper does not publish documents, recalculate scores, or accept TRACE prose as external evidence.

## Verification

Stabilisation tests confirm that an eligible assertion is mapped to both foreign-key-backed knowledge join tables and that an accepted internal-synthesis assertion is rejected. `npm test` passed with 119 ingestion tests plus stabilisation tests, `npm run typecheck` passed with 0 errors, and the Astro/Cloudflare production build with route verification passed.

KC-08E adds the reviewed population policy and migration/audit treatment of legacy string references; see [`kc-08e-knowledge-source-link-migration-evidence.md`](kc-08e-knowledge-source-link-migration-evidence.md).
