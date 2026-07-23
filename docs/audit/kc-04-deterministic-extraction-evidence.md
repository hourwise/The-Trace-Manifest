# KC-04A–C deterministic structured extraction evidence

**Date:** 23 July 2026
**Status:** Complete locally; no production migration, Queue binding, or AI provider call was made.

## Implemented boundary

- `db/migration-0034-structured-source-extraction.sql` adds `source_extractions` and `source_summaries` as additive, review-gated records. They reference the canonical KC-02 source-version/chunk tables and carry extraction, policy, model, usage, validation, reviewer, and cost fields.
- `src/lib/server/source-structured-extraction.ts` creates deterministic short excerpts (2,000 characters maximum per D1 chunk) from KC-03B blocks, preserves the existing HTML locator on every candidate, emits typed candidates for material claims, opinions, dates, model versions, benchmark results, and caveats, and creates proposed canonical claim assertions only for material/benchmark candidates.
- `workers/ingestion/knowledge-capture-consumer.ts` runs the deterministic structure pass after successful private capture and records an idempotent `extract_structure` processing job. A failure does not mark the capture job complete.
- Metadata-only and short-excerpt captures do not create D1 chunks, structured candidates, or summaries; this preserves the admitted copyright storage mode.
- Deterministic summaries are bounded to 2,000 characters, remain `proposed`, and record provider `none`, zero token usage, and zero `cost_microusd`. No candidate is admitted evidence or editor-accepted automatically.

## Evidence

- `tests/stabilisation.test.ts` verifies typed candidates, locator-backed source chunks, proposed assertion state, deterministic summary storage, zero external-AI cost, and unchanged-source idempotency.
- `npm test` passes (119 ingestion tests plus stabilisation tests).
- `npm run test:migrations` passes, including duplicate application of migration 0034 and legacy-row preservation.
- `npm run typecheck` passes with zero errors and four pre-existing hints.

## Deferred KC-04D–F work

Governed AI extraction, provider/model/prompt usage ledger integration, editor review UI/transitions, and proof that an unchanged source does not incur a second external-AI charge remain the next bounded slice. Deterministic candidates are intentionally not treated as corroboration until KC-05 review/provenance work is complete.
