# LAUNCH-01 Repository-State and Launch-Gap Audit

Status: complete with launch-blocking findings. This is a local repository audit performed on 15 July 2026. It does not assert deployed Cloudflare state and contains no secret values.

Task: LAUNCH-01 - Produce a repository-state and launch-gap audit against ADR 0012 and the revised launch scope.

## Scope and repository state

- Branch observed: `main`.
- The working tree contained planned ADR/build-plan documentation changes when the audit began. The validation work also made a narrow correction to the security checker so it does not flag its own policy strings or the route verifier's forbidden-marker fixtures as runtime violations. The checker continues to scan all source files for plaintext secret-shaped values.
- No deploy, remote D1 command, secret update, Cloudflare dashboard change, feature enablement, or production data change was made for this audit.
- The canonical ADR index contains ADR 0001 through ADR 0014. ADR 0012 is accepted but explicitly has production rollout pending.

## Durable controls and migration state

`DEPLOYMENT.md` specifies the required D1 order:

1. `db/schema.sql`
2. `db/migration-5e-publication.sql`
3. `db/migration-stabilisation-security.sql`

The repository contains all three files. The local migration validation passed, but no remote migration history or preview schema was read during this audit. LAUNCH-04 therefore remains blocked on the explicit human approval and non-production run sheet required by ADR 0012.

The ingestion Worker configuration declares the production D1 `DB` binding and R2 `RAW_STORE` binding. The Pages-side binding and the preview binding are not proven by repository configuration. The separate LAUNCH-05 audit records the resulting Cloudflare control-plane gaps.

## Feature and publication boundaries

- `TRACE_AI_PUBLIC_ENABLED`, `TRACE_AI_EDITORIAL_ENABLED`, and `TRACE_AI_SCHEDULED_ENABLED` evaluate to enabled only when explicitly set to `"true"`; the checked source therefore fails closed by default.
- The production dashboard evidence recorded in LAUNCH-05 showed all three AI flags as `false`. This audit does not treat that past observation as a substitute for a future deployment check.
- Ask TRACE permits one model call and zero automatic retries in the checked configuration; it must operate only over eligible published evidence.
- Public story, briefing, catalogue, and correction routes query reviewed/published data rather than exposing draft rows.
- There are 16 static knowledge modules under `src/data/knowledge`; the knowledge index explicitly exposes five reviewed slugs. The remaining material is not a substitute for the six reviewed TRACE Guides required by ADR 0013.
- Published D1 story, briefing, model, provider, and benchmark counts are unknown locally. They require a non-production or production read performed under the relevant approval and audit controls; no count is invented here.

## Local validation evidence

On Node `v24.12.0`, after `npm ci`, `npm run ci` completed successfully:

- whitespace validation passed;
- Astro and Worker typecheck: 0 errors, 0 warnings, 0 hints;
- 45 ingestion tests and the stabilisation tests passed;
- schema and additive migrations applied with required constraints;
- security boundary checks passed across 92 source files and Git history;
- production build and Cloudflare route/gateway boundary verifier passed.

The build retained one non-blocking Astro router warning: `getStaticPaths()` is ignored for the dynamic server route `src/pages/knowledge/[slug].astro`.

The separate required command `npm run audit:production` completed but failed its high-severity threshold. It reports three high-severity production dependency findings in the Astro/Cloudflare dependency chain, including Astro, `undici`, and `ws`; the offered automatic remediation is a breaking upgrade to Astro 7 / `@astrojs/cloudflare` 14. This is a launch blocker until a deliberate compatibility-reviewed dependency upgrade and repeat validation are complete. Do not use `npm audit fix --force` as an unreviewed remediation.

## Launch gaps and permitted next actions

| Gap | Evidence | Permitted next action |
|---|---|---|
| Production dependency vulnerabilities | Required production audit has three high findings. | Plan and review a compatible Astro/Cloudflare dependency upgrade; repeat all validation. |
| Access, roles, Pages bindings and internal HMAC | LAUNCH-05 found the Access application, required configuration, and preview binding evidence absent. | LAUNCH-05R only with explicit operator approval and the repair run sheet. |
| Non-production D1 migration | Run sheet exists; no remote command has run. | LAUNCH-04 only after explicit human approval. |
| Authenticated role and Ask evaluation | Depends on repaired non-production control plane and current provider review. | LAUNCH-06, LAUNCH-07 and LAUNCH-08 in that order, without enabling public AI. |
| Editorial launch corpus | Live published counts are unverified and the 15-20 reviewed-story target is not evidenced. | Complete STORY-01, then repeat STORY-02 one reviewed record at a time. |
| TRACE Guides | Six launch guides have not been evidenced as completed and reviewed. | GUIDE-01, then GUIDE-02 through GUIDE-07 in order. |

This audit completes LAUNCH-01. It does not authorise launch, deployment, secret configuration, migration, or public AI enablement.
