# KC-04E publisher extraction review evidence

**Date:** 23 July 2026
**Status:** Complete locally; no external-AI request, production migration, Queue binding, or publication was made.

## Implemented boundary

- `db/migration-0036-extraction-review-history.sql` adds an append-only review history for source candidates and summaries, including previous/next state, publisher identity, note, bounded amendment value, request ID, and extraction-run link.
- `/api/admin/knowledge/review-extraction` is publisher-only, same-origin protected, validates target IDs, target-specific states, amendment size/content, and returns conflict errors for invalid transitions.
- `/admin/knowledge/extractions` provides the publisher review queue for locator-backed candidates and source summaries. Accepted, amended, rejected, duplicate, unsupported, and needs-more-research outcomes are explicit; summaries intentionally do not accept extraction-only duplicate/unsupported states.
- Every successful transition updates the review-gated record, appends review history, and records `review_knowledge_extraction` in `admin_audit_log`. No transition admits public evidence or changes evidence scores.

## Evidence

- `tests/stabilisation.test.ts` exercises the full candidate transition set, bounded amendments, summary-specific state restrictions, review history, and successful admin audit rows.
- `npm.cmd test -- --run` passes (119 ingestion tests plus stabilisation tests).
- `npm.cmd run test:migrations` passes, including duplicate application of migration 0036 and legacy-row preservation.
- `npm.cmd run typecheck` passes with zero errors and four existing hints.

## Deferred KC-04F work

Explicit unchanged-content external-AI cache/cost tests remain. KC-04E does not invoke an AI provider or enable production Queue processing.
