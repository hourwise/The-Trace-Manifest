# KC-04D extraction metadata evidence

**Date:** 23 July 2026
**Status:** Complete locally; no external-AI request, production migration, Queue binding, or publication was made.

## Implemented boundary

- `db/migration-0035-extraction-run-metadata.sql` adds `knowledge_extraction_runs` and `knowledge_extraction_run_outputs`.
- Each run records the immutable source-version and content hash, task, extraction method/version, model identity, prompt version/hash, policy version, usage and token fields, cost basis, validation outcome, stable idempotency key, correlation ID, audit metadata, state, and failure code.
- Structured candidates and summaries are linked to the run through output records. The existing per-output metadata remains review-gated; no candidate is admitted as evidence by this task.
- The deterministic structure pass creates one completed, valid, zero-cost run envelope. Reprocessing an unchanged source returns the completed run and does not create another run or output.
- The run envelope is designed for future governed-AI extraction, but this task does not invoke a provider, store prompts or source bodies, or store chain-of-thought.

## Evidence

- `tests/stabilisation.test.ts` verifies source-version/hash, task, method, prompt identity, policy, zero-cost basis, validation state, correlation/audit metadata, output links, and completed-run idempotency.
- `npm.cmd test -- --run` passes (119 ingestion tests plus stabilisation tests).
- `npm.cmd run test:migrations` passes, including duplicate application of migration 0035 and legacy-row preservation.
- `npm.cmd run typecheck` passes with zero errors and four existing hints.

## Deferred KC-04E–F work

Explicit unchanged-content external-AI cache/cost tests remain the next bounded task. Publisher review transitions are evidenced separately in `kc-04e-review-workflow-evidence.md`. No external-AI spend or public evidence promotion is implied by KC-04D.
