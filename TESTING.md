# Testing

Run from a clean desktop checkout with Node 24:

```text
npm ci
npm run test:diff
npm run typecheck
npm test
npm run test:migrations
npm run test:security
npm run audit:production
npm run build
```

`npm run ci` runs typechecking, regression tests, migration validation, security boundary checks, and the production build. The production dependency audit is a separate required gate so its network/reporting failure is distinguishable.

## Coverage added by the stabilisation pass

- Classification golden fixtures.
- Strict public request input and legacy bearer-token rejection.
- Internal HMAC signing and body-tamper rejection.
- Fresh D1 schema/migration application and constraints.
- Durable request ownership, idempotency, quota, concurrency, atomic competing budget reservations, and one provider start.
- Concurrent identical Ask actions producing at most one provider call.
- Durable token/cost settlement.
- Unverified story publication rejection and canonical briefing reconstruction.
- Unsupported ingestion connector outcomes.
- Static checks for direct provider access, retired browser/admin token contracts, wildcard CORS, in-memory control files, secret-shaped values, and required durable tables.
- Cloudflare build route/bundle boundary verification.
- Working-tree, staged, and CI event-range whitespace validation.

## Required manual/deployment tests

- Cloudflare Access valid, expired, wrong-audience, wrong-issuer, reader, publisher, removed-user, and signing-key rotation cases.
- Admin CSRF/origin rejection and audit log completeness.
- D1 concurrency under the deployed platform, not only SQLite emulation.
- Real provider `401`, `402`, `429`, `5xx`, timeout, malformed JSON, token usage, and price reconciliation using a non-production key and bounded balance.
- Browser bundle inspection for secrets and provider URLs.
- `.com` canonical and `.uk` redirect behaviour.
- Dynamic page, RSS, 404, empty-state, and cache behaviour against a migrated preview database.

## Current validation status

The laptop run on 14 July 2026 was intentionally stopped before a clean dependency install and full test/build run. Treat all executable checks as pending until rerun on the desktop. `git diff --check` passed during the source pass, but it is not a substitute for CI.
