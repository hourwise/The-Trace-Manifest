# ADR-0012: Durable controls, Access-based administration, and publication boundaries

- **Status:** Accepted; production rollout pending
- **Date:** 2026-07-14
- **Decision owners:** The Trace Manifest maintainers
- **Supersedes:** ADR-0008 implementation structure for in-memory ledger/budget/circuit modules and its permissive bounded-retry option

## Context

The repository contained runtime APIs and admin controls whose effective state was process-local, a browser-held administrator token, caller-selected quota identity, ungrounded Ask input, optimistic ingestion outcomes, and public demo data that looked operational. Those properties could not safely survive concurrent Cloudflare isolates or public traffic.

## Decision

1. Astro runs with the Cloudflare server adapter for runtime D1 and API routes.
2. D1 owns AI request idempotency, state, daily quota, visitor concurrency, budget reservation, usage settlement, and circuit state.
3. Public and editorial model actions permit one provider attempt and zero automatic retries. Ambiguous failure reserves estimated cost as billing-uncertain.
4. The browser calls only first-party TRACE routes. Provider access remains in the server adapter behind the TRACE gateway.
5. Cloudflare Access assertions are verified cryptographically. Server configuration maps identities to `reader` or `publisher`; browser master tokens and self-declared reviewer names are rejected.
6. Pages forwards approved admin operations through an exact HMAC-signed request with timestamp and one-use nonce. The Worker enforces its own method/route/role matrix.
7. Authenticated denials, allowed actions, and outcomes are durably audited with operator, role, action, target, request/event ID, and result.
8. Public stories require published state, reviewer identity/time, non-empty summary, eligible evidence status, slug, and a published member item. Briefings are reconstructed from eligible story rows. Catalogue entities and results have independent draft/review/published states.
9. Ask retrieves only eligible published claims/evidence and returns structural citations plus deterministic confidence. Insufficient or invalid evidence produces a safe non-answer without regeneration.
10. Production AI stays disabled until migrations, Access, origins, current provider model/pricing/terms, edge abuse controls, CI, evaluation, and deployment tests pass.

## Consequences

Security and financial controls remain effective across isolates and concurrent requests. Administrative identities and publication decisions are attributable. Public empty states may be more visible because unreviewed seeded/demo rows no longer appear. D1 becomes a required runtime dependency, and migration/backup discipline becomes launch-critical.

Availability is deliberately reduced when control state, audit storage, Access verification, budget, or evidence is unavailable. The architecture does not promise that a timed-out provider request was unbilled; it records the uncertainty.

## Rejected alternatives

- Process memory for enforcement: not shared or durable.
- Browser bearer/master token: reusable and exposed to client code.
- Automatic provider retries/fallback: duplicate cost and inconsistent trust/privacy behaviour.
- Publishing extracted rows by default: ingestion is not editorial approval.
- Model-selected confidence or unrestricted web retrieval: bypasses TRACE evidence governance.

## Verification

The required checks are defined in `TESTING.md`, `DEPLOYMENT.md`, and the stabilisation matrix. The ADR is accepted as a code/design decision; public production readiness remains pending until those external and executable checks pass.
