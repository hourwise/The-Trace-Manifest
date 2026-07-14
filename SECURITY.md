# Security policy

## Security boundaries

- Browsers call only first-party Pages routes. They never receive provider or internal-service credentials.
- DeepSeek access exists only in `src/ai/providers/deepseek.ts` and is invoked through `src/ai/trace-model-gateway.ts`.
- `/admin` and `/api/admin/*` require a cryptographically verified Cloudflare Access assertion and a server-side email-to-role mapping.
- The Pages admin proxy signs the exact method, path, query, body hash, operator, role, timestamp, and nonce. The ingestion Worker rejects invalid, stale, or replayed requests.
- Public D1 queries require an explicit published state plus the applicable reviewer/evidence conditions.

## Secrets

Store `DEEPSEEK_API_KEY`, optional Worker `GITHUB_TOKEN`, `TRACE_VISITOR_HASH_SECRET`, `TRACE_INTERNAL_SERVICE_SECRET`, and `CF_ACCESS_AUD` in the platform secret facility. Never use a `PUBLIC_` prefix, browser storage, committed environment files, logs, screenshots, or support messages.

Use separate development and production values. Rotate a secret immediately after suspected disclosure, unexplained usage, accidental logging, or a personnel/access change. The Pages and ingestion Worker copies of `TRACE_INTERNAL_SERVICE_SECRET` must be rotated together.

## Administrative access

Cloudflare Access is the identity boundary. `TRACE_ADMIN_READERS` may use read routes. Only `TRACE_ADMIN_PUBLISHERS` may invoke mutations. A browser-supplied bearer/master token and a self-declared reviewer identity are not accepted.

Admin requests and outcomes are written to `admin_audit_log`. Mutations fail closed if the initial audit record cannot be written. Denied authenticated proxy actions are also audited.

## AI containment

Public, editorial, and scheduled AI switches are disabled independently by default. Accepted requests have durable D1 ownership, an idempotency record, a daily visitor quota where applicable, one concurrency lease, an atomic worst-case budget reservation, an attempt count capped at one, usage settlement, and durable circuit state. Ambiguous provider failures retain the estimate as billing-uncertain; clear pre-billing failures release it.

Provider output is untrusted. Unknown fields, invalid JSON, truncation, unsupplied citations, and unsupported claims cause a safe non-answer or rejection. The final confidence label is calculated from stored evidence, never accepted from the model.

## Origin and browser policy

The canonical API origin is `https://thetracemanifest.com`. Localhost origins are admitted only when `TRACE_ENVIRONMENT=development`. `https://thetracemanifest.uk` is redirect-only and must not be configured as an API origin.

## Reporting and response

Do not open a public issue containing a vulnerability or secret. Use the repository owner's private security channel. For active incidents follow [the operational runbook](docs/operations/runbook.md) and preserve request, audit, and usage identifiers without copying secrets or raw question text.
