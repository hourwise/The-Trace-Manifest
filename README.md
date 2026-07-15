# The Trace Manifest

The Trace Manifest is an evidence-governed AI intelligence platform built with Astro, Cloudflare Pages/Workers, and D1.

Repository state on 14 July 2026: the stabilisation and security controls are implemented in source, but production rollout is not complete. Public Ask TRACE is disabled by default. The new D1 migration, Cloudflare Access policy, secrets, reviewed pricing, deployment bindings, and the full CI suite must all be verified before enabling it.

## Implemented in this repository

- Server-rendered public routes backed by explicit D1 publication queries.
- Reviewed publication gates for stories, briefings, models, providers, benchmarks, and benchmark runs.
- Grounded Ask TRACE retrieval from eligible published claims and feed items only.
- A single server-side model gateway with one provider attempt, strict output/citation validation, deterministic confidence, and safe non-answers.
- Durable D1 request ownership, idempotency, visitor quota, concurrency lease, budget reservation, usage ledger, and circuit-breaker state.
- Cloudflare Access JWT verification, server-side reader/publisher roles, a first-party admin proxy, HMAC-signed internal requests, replay protection, and audit records.
- Truthful ingestion outcomes for supported, failed, rejected, and unsupported connectors.
- CI definitions, migration validation, secret/boundary scanning, and regression tests.

## Not yet complete

- Applying `db/migration-stabilisation-security.sql` to each environment.
- Configuring and testing the Cloudflare Access application and role allowlists.
- Reviewing current provider model availability, prices, terms, and data handling.
- Publishing reviewed catalogue records; extracted/seeded records default to `draft` and therefore do not appear publicly.
- Running the clean install, typecheck, tests, production dependency audit, build, and deployment smoke tests on a fully working Node environment.
- Adding Turnstile/WAF rules and external alert delivery where required by the launch policy.

## Local setup

```text
npm ci
npm run typecheck
npm test
npm run test:migrations
npm run test:security
npm run audit:production
npm run build
```

Copy `.dev.vars.example` to `.dev.vars` and replace every placeholder. Public, editorial, and scheduled AI remain independently off unless their canonical feature switches are set to `true` intentionally.

Migration order for a new database:

```text
db/schema.sql
db/migration-5e-publication.sql
db/migration-stabilisation-security.sql
```

Do not reapply `ALTER TABLE` migrations blindly. Record applied migrations per environment and take a D1 backup before production changes.

## Documentation

- [Deployment](DEPLOYMENT.md)
- [Security](SECURITY.md)
- [Testing](TESTING.md)
- [Operational runbook](docs/operations/runbook.md)
- [Environment variables](docs/configuration/environment-variables.md)
- [Threat model](docs/security/threat-model.md)
- [Stabilisation matrix](docs/audit/stabilisation-matrix.md)
- [Roadmap](ROADMAP.md)
- [Architecture decisions](docs/adr/README.md)
- [Revised launch scope](<docs/The Trace Manifest — Revised Launch.md>)
- [Evidence-linked knowledge base build plan](docs/the_trace_manifest_evidence_linked_knowledge_base_build_plan.md)

Canonical public origin: `https://thetracemanifest.com`. The `.uk` domain is a redirect-only domain and is not an API origin.
