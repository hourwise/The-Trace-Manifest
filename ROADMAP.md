# Roadmap

Status labels describe repository evidence, not assumed deployment state.

## Status on 25 October 2026 (TRACE-RESTORE-01)

Nothing below is live unless it says so. The release order and gates are in `docs/audit/trace-restore-01-release-plan.md`.

| Area | Status | Next exit condition |
|---|---|---|
| Editorial integrity (PRs #7–#9) | **Live in Production.** Publisher-only Desk and Social writes, attributed and audited; one promotion per candidate; D1 trigger-counted changes handled by archive, publish and revision approval. | None. |
| Withdrawn and superseded story pages | **PR #10, ready for review; not released.** Retired pages keep their URL with a "not current reporting" notice, historical evidence labels and `noindex`, and stay out of listings, feeds and the sitemap. | Merge (Pages), then verify story 381 publicly. |
| Production promotion cleanup | **Paused.** 10 duplicate or mis-linked review clusters archived; story 381 withdrawn; stories 384–388 still published, pending PR #10. | Release #10, then run the separately approved withdrawals of 384–388 and the baseline verification. |
| Cross-pipeline duplicate prevention (TRACE-EDITORIAL-DEDUPE-R1) | **PR #11, draft; release-gated.** One source identity for Desk and ingestion, unique `primary_source_key`, atomic clustering writes. | Apply migration 0077 (Preview, then Production), merge, deploy the Worker. **Required before automated news acquisition restarts.** |
| Reviewer duplicate-source visibility | **PR #12, draft, stacked on #11.** Queue categories and conflict notes in Review; source relationships and safe promotion labels in Desk. | After #11 and 0077. |
| Newsletter signup and email infrastructure | **PR #13, draft; disabled by default.** Consent, confirmation, unsubscribe, suppression, rate limits, and an outbox with mock and Resend adapters. The header no longer advertises a subscription that does not exist. | Owner approval of privacy text; provider account; verified sending domain (SPF, DKIM, DMARC); migration 0078; secrets; Preview test with a real confirmation. **Not operational until a real confirmation email is delivered.** |
| Weekly newsletter preparation | **PR #14, draft, stacked on #13; dispatch disabled.** Deterministic drafts from published stories, publisher approval of exact content, once-only gated dispatch. No Cron, no AI. | After #13 and migration 0079; enable dispatch only after delivery is proven. |
| Ask TRACE | Public Ask **off in Production** (API 503); editorial AI on. | Answer-eligible, reviewed evidence (KNOWLEDGE-10) and an authenticated evaluation pass before any public beta. |
| Automated news acquisition and the local news collector | **Paused (STOP-BURN; Cron `[]`; scheduler 0072 not activated).** The local DeepSeek pilot is separately governed (Codex worktrees). | DEDUPE-R1 live (#11 with 0077 and the Worker); measured Preview D1 consumption; owner approval. |

The table below is the historical baseline.

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
| TRACE Desk and discovery intake | Pre-launch foundation implemented | Apply and verify ADR 0015's candidate migration and parser health checks; manual intake remains publisher-only and non-publishing. |
| Governed research, Knowledge Builder and multilingual provenance | Planned | Deliver ADR 0016–0018 in bounded migrations after launch-control verification; no unrestricted research, unreviewed knowledge, or bilingual publication. |

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
