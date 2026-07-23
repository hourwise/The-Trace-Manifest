# KC-03E — Capture consumer and manual URL evidence

**Date:** 23 July 2026
**Status:** Complete — local implementation and Preview configuration validation only.
**Scope:** Consume admitted capture messages and add publisher-only manual URL admission through the same KC-03A/B/C pipeline. No production Queue binding, production consumer, claim extraction, public evidence promotion, or automatic publication is enabled.

## Implemented

- `workers/ingestion/knowledge-capture-consumer.ts` validates the D1-admitted source identity, retrieves only bounded public HTML/XHTML through KC-03A, extracts through KC-03B, and persists through KC-03C using the D1 storage policy as authority.
- Successful jobs become `completed` with the captured content hash. Retrieval, R2, and D1 failures remain visible as failed jobs. Permanent source-policy/status failures are retried only through the configured bounded Queue retry count so Wrangler can route them to the dead-letter queue.
- `workers/ingestion/index.ts` exposes the Worker Queue handler and publisher-only signed `/admin/knowledge/capture-url` route. The route accepts only a public HTTP(S) URL and the two permitted manual storage modes; readers and unauthenticated callers fail closed.
- Preview Wrangler configuration attaches the consumer to `trace-manifest-kc-processing-preview`, with batch size 5, 10-second batching, three retries, and `trace-manifest-kc-processing-preview-dlq`. Production remains unbound.

## Validation

- `npm test` passed: 119 ingestion tests and the stabilisation suite, including successful capture, already-completed idempotency, permanent HTTP rejection, Queue retry behavior, publisher-only route access, and manual admission.
- `npx tsc --noEmit -p workers/tsconfig.json` passed.
- `npm run typecheck` passed: Astro check reported 0 errors and 4 existing hints; Worker TypeScript compilation passed.
- `npx wrangler deploy --dry-run --env preview --config wrangler.worker.toml` passed and reported both Preview Queue bindings, Preview D1, and Preview R2. Wrangler emitted only the environment's existing log-file `EPERM` diagnostic after the successful dry-run; no deployment occurred.
- `git diff --check` passed.

## Deliberately deferred

- Full-text feed storage remains policy-controlled: feed admission defaults to `metadata_only`; publisher/manual capture can explicitly select private full-text storage.
- PDF, Markdown/plain-text uploads, claim extraction, source summaries, provenance, embeddings, and evidence scoring remain later KC tasks.
