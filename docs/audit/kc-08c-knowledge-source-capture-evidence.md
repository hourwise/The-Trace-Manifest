# KC-08C Knowledge Source Capture Evidence

**Status:** Complete locally  
**Date:** 24 July 2026  
**Scope:** queue unresolved evidence URLs from knowledge Markdown for admitted source capture and extraction

## Implemented

- Added `admitAndQueueKnowledgeDocumentCapture` to the existing Worker source-capture queue path.
- Added publisher-only `POST /api/admin/knowledge/capture-missing`, proxied through the authenticated admin boundary to `/admin/knowledge/capture-missing`.
- Stored evidence URLs are used when available; legacy document bodies are parsed through the KC-08A Markdown parser.
- Existing capture jobs are reused by the existing D1 idempotency key. Rejected source documents are skipped rather than silently re-admitted.
- Queue messages remain bounded metadata (`sourceDocumentId`, URL hash, source ID, policy/storage metadata, and correlation ID); document bodies never enter the Queue.

## Verification

Stabilisation tests confirm that an existing capture job is not duplicated, a missing URL is admitted and queued, and a repeated request produces no additional Queue message. `npm test` passed with 119 ingestion tests plus stabilisation tests, `npm run typecheck` passed with 0 errors, and the production Astro/Cloudflare build with route verification passed.

This task queues capture only. Source admission review, canonical-claim mapping, and public evidence eligibility remain review-gated KC-08D onward work.
