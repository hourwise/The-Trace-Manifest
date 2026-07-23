# KC-03D — Feed source admission and capture queue evidence

**Date:** 23 July 2026  
**Status:** Complete — local implementation and validation only.  
**Scope:** Connect accepted feed items to admitted `source_documents` and produce bounded, idempotent capture jobs after feed-item admission. The current Worker has a Preview Queue producer only; no Queue consumer, production Queue binding, source fetch, R2 write, claim extraction, or public evidence promotion is enabled by this task.

## Implemented

- `workers/ingestion/knowledge-capture-queue.ts` normalises an accepted feed URL with the same tracking-parameter rules as feed deduplication, creates or reuses its admitted `source_document`, and records a `capture_source` D1 job only after admission.
- Queue messages use the versioned `capture_source_document` contract and contain only source/feed identifiers, canonical URL/hash, media kind, storage policy, and correlation ID. Article bodies, summaries, excerpts, and raw metadata are excluded.
- `knowledge_processing_jobs.idempotency_key` prevents duplicate delivery for repeated feed observations. A queued job is not resent; failed/dead-lettered jobs are retryable, and a failed Queue send remains visible in D1.
- The ingestion Worker invokes the admission/producer after a new feed row is inserted and also retries a previously failed capture job when a duplicate feed URL is observed. If the optional Queue binding is absent (the current production configuration), admission remains recorded but no unbound Queue call is attempted.
- Preview retains the existing isolated `KNOWLEDGE_PROCESSING_QUEUE` and DLQ producer bindings. A consumer is deliberately deferred until a capture handler and retry policy are implemented.

## Validation

- `npm test` passed: 119 ingestion tests and the stabilisation suite.
- `npx tsc --noEmit -p workers/tsconfig.json` passed.
- `npm run typecheck` passed after dependency reinstall: Astro check reported 0 errors and 4 existing hints; Worker TypeScript compilation passed.
- Queue tests cover source admission, message body exclusion, repeated-delivery idempotency, and retry after a failed Queue send.
- `git diff --check` passed.

## Deliberately deferred

- A Queue consumer will retrieve through KC-03A, extract through KC-03B, and call KC-03C with the admitted storage policy in the next capture-handler task.
- External feed captures default to `metadata_only` until source-specific retention/licence policy permits private full-text storage. Publisher/editor captures can use the KC-03C full-storage modes in later KC-03E/F work.
- No feed item becomes a claim, corroborating source, searchable knowledge result, or score upgrade merely because it was admitted or queued.
