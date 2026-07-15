# Roadmap

Status labels describe repository evidence, not assumed deployment state.

| Area | Status on 14 July 2026 | Next exit condition |
|---|---|---|
| Foundation and product policy | Implemented in repository | Keep the canonical ADR 0001–0014 set and operating documents current. |
| Astro product shell | Implemented in repository | Desktop CI/build and deployment smoke test pass. |
| Focused launch scope | Defined; implementation partial | Meet the revised-launch content and feature-gate criteria before exposing additional verticals or routes. |
| Source registry and ingestion | Partially implemented | Verify every configured connector; add or disable unsupported types; observe scheduled outcomes. Social links remain manual, separately evaluated source candidates under ADR 0009. |
| Curation and trust pipeline | Partially implemented | Expand golden datasets and review precision/recall before relying on automatic classifications. |
| Knowledge base and Guides | Partially implemented | Add durable editorial workflow; publish six reviewed Guides before a prominent Guides route and apply ADR 0013 freshness and retrieval controls. |
| Models, providers, benchmarks | Partially implemented | Catalogue rows now default to draft. Add reviewed admin publication workflow and publish verified records. |
| Live D1 publication wiring | Implemented in repository, deployment unverified | Apply migrations and verify D1 bindings, dynamic routes, public eligibility, 404s, RSS, and empty states. |
| Ask TRACE | Implemented behind a disabled feature flag | Pass CI/security/evaluation, configure reviewed pricing and limits, then run an admin-only pilot. |
| TRACE Predicts | Planned | Begin only after Ask/corpus stability and design immutable forecast review. |
| Newsletter and scorecard | Planned | Build consent, review, suppression, archive, and calibration contracts first. |
| Accounts and personalisation | Planned | Separate identity/privacy ADR and threat model required. |
| Monetisation expansion | Planned | Implement ADR 0011's audit, disclosure and editorial-firewall controls before enabling commercial features. |
| Context-preserving sharing | Planned | Implement ADR 0014's canonical, correction-aware sharing before public snapshots or social automation. |

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
