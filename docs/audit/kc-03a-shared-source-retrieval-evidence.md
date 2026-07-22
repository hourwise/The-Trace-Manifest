# KC-03A — Shared source retrieval evidence

**Date:** 22 July 2026
**Status:** Complete — local implementation and validation only.
**Scope:** Refactor the existing administrator-only triage fetch into the reusable retrieval boundary. No source capture, R2 write, Queue consumer, external-AI call, public evidence promotion, Preview deployment, or production mutation is included.

## Implemented

- `src/lib/server/source-retrieval.ts` is the shared, server-side-only retrieval service. It admits only public HTTP(S) hostnames; rejects credentials, non-standard ports, numeric/IPv6 literals, and local/internal hostnames; and does not traverse links in a response.
- Every redirect uses `redirect: 'manual'`; the target is resolved relative to the current URL and passed through the same admission check before it is fetched.
- The service requires an explicit content-type allowlist before reading a body, checks declared and streamed byte limits, and enforces one deadline across request headers and the response stream. It uses no cookies or application credentials.
- It emits structured, non-sensitive audit events for admission, redirect, retrieval, rejection, and failure. The existing `/api/admin/ai-triage` route records the final retrieval code in its required `admin_audit_log` outcome; it does not store the submitted URL in that audit detail.
- `src/lib/server/triage-url-source.ts` remains a compatibility wrapper for title, author, and visible-text extraction, so Social Signals and TRACE Desk retain their existing triage behaviour while using the shared boundary.

## Validation

- Stabilisation tests cover public redirect revalidation, the preserved HTML/XHTML request preference, structured audit-event sequence, private-target rejection before `fetch`, HTML/script extraction, and a response body that stalls after headers. The stalled stream fails with `response_timeout` rather than exceeding the configured deadline.
- `npm test` and `npm run typecheck` passed. Existing Astro hints remain unchanged.

## Deliberately deferred

- KC-03B adds structured main-content extraction and diagnostics.
- KC-03C stores admitted immutable originals/extractions in private R2 and metadata/hashes in D1.
- KC-03D connects only admitted RSS/feed items to capture Queue production. Until then this service has no capture caller, persistence capability, Queue consumer, or authority to make retrieved material evidence.
