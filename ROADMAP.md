# Roadmap

Status labels describe repository evidence, not assumed deployment state.

| Area | Status on 14 July 2026 | Next exit condition |
|---|---|---|
| Foundation and product policy | Implemented in repository | Keep ADR and operating documents current. |
| Astro product shell | Implemented in repository | Desktop CI/build and deployment smoke test pass. |
| Source registry and ingestion | Partially implemented | Verify every configured connector; add or disable unsupported types; observe scheduled outcomes. |
| Curation and trust pipeline | Partially implemented | Expand golden datasets and review precision/recall before relying on automatic classifications. |
| Knowledge base | Partially implemented | Five static entries are marked published; draft entries are hidden until reviewed. Add durable editorial workflow. |
| Models, providers, benchmarks | Partially implemented | Catalogue rows now default to draft. Add reviewed admin publication workflow and publish verified records. |
| Live D1 publication wiring | Implemented in repository, deployment unverified | Apply migrations and verify D1 bindings, dynamic routes, public eligibility, 404s, RSS, and empty states. |
| Ask TRACE | Implemented behind a disabled feature flag | Pass CI/security/evaluation, configure reviewed pricing and limits, then run an admin-only pilot. |
| TRACE Predicts | Planned | Begin only after Ask/corpus stability and design immutable forecast review. |
| Newsletter and scorecard | Planned | Build consent, review, suppression, archive, and calibration contracts first. |
| Accounts and personalisation | Planned | Separate identity/privacy ADR and threat model required. |
| Monetisation expansion | Planned | Preserve editorial-independence gates and auditable commercial labelling. |

## Immediate sequence

1. Run the desktop validation commands in `TESTING.md` from a clean checkout.
2. Fix every type, migration, boundary, audit, and build failure before deployment.
3. Back up D1 and apply the stabilisation migration to a non-production environment.
4. Configure Cloudflare Access, role allowlists, signed internal-service secrets, origins, and D1 bindings.
5. Smoke-test anonymous public routes, reader and publisher admin roles, denied mutations, ingestion outcomes, and audit records.
6. Review current provider documentation, model IDs, pricing, retention, and account spend controls.
7. Keep public AI disabled while running an authenticated evaluation set.
8. Enable a tightly bounded public beta only after explicit launch approval.

No future phase is considered complete merely because a page, schema, or placeholder exists.
