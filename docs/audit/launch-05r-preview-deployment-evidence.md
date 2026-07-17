# LAUNCH-05R — Preview deployment evidence

**Date:** 17 July 2026  
**Scope:** Isolated non-production Pages, Worker, and D1 control-plane checks only
**Production impact:** None

## Deployment

- Temporary branch: `launch-05r-preview`
- Initial source commit: `f09f638` (`Fix dynamic admin home route`), based on production commit `a34afbb`
- Initial Pages deployment ID: `304ead44-633e-4bf4-bc5e-2d90a1b26112`
- Stable Preview branch URL: `https://launch-05r-preview.the-trace-manifest.pages.dev`
- Environment: Preview
- Status: Active

The branch exists solely to create a non-production Pages deployment. It has not been merged to `main`, and it has not changed the production deployment, Worker, D1 database, R2 bucket, secrets, Access applications, AI flags, or scheduled jobs.

## Source binding boundary

`wrangler.toml` declares the top-level Pages `DB` binding as the non-production database `trace-manifest-db-preview`. Its named production environment separately binds `DB` to `trace-manifest-db`.

The initial anonymous checks did not prove a successful Preview D1 query: anonymous requests are rejected before they can reach an admin data route. The later authenticated checks below provide that proof without changing production.

## Anonymous checks

The following cache-bypassed, unauthenticated GET checks returned `401 Unauthorized`:

```text
https://304ead44.the-trace-manifest.pages.dev/admin?check=20260717-0557
https://304ead44.the-trace-manifest.pages.dev/api/admin/sources?check=20260717-0557
```

The admin page response also included `Cache-Control: no-store`. This demonstrates fail-closed behaviour before any authenticated or mutating test.

The first direct deployment URL requests returned a transient `404`; the cache-bypassed checks above reached the deployed Pages Function and are the authoritative result.

## Authenticated Preview controls and checks — 17 July 2026

- Cloudflare Access protects the stable Preview branch URL. An approved operator authenticated with the configured Access session and reached `/admin`; a fresh private browsing session must still require Access authentication.
- The Preview Pages environment contains redacted `CF_ACCESS_AUD` and `TRACE_INTERNAL_SERVICE_SECRET` secrets, plus `CF_ACCESS_TEAM_DOMAIN`, reader, and publisher allowlists for the approved operator. Values and identity details are not recorded here.
- The checked-in Pages Preview configuration supplies `TRACE_ENVIRONMENT=preview`, the stable Preview origin, the Preview Worker origin, and all AI flags set to `false`.
- The Preview Worker has a separately generated `TRACE_INTERNAL_SERVICE_SECRET`; secret-name verification confirmed it is stored as a Worker secret. The successful publisher submission below proves the Pages and Worker secrets are paired for this route without disclosing their value.
- The authenticated `/admin/sources`, `/admin/jobs`, and `/admin/review` views loaded from the Preview environment. Sources displayed the Preview registry and the Job and Review views displayed honest empty states; no synthetic operational records were introduced.
- A publisher submitted one harmless manual candidate through `/admin/desk`. The success response stated that it had not been fetched, researched, or published. A read-only query to `trace-manifest-db-preview` confirmed the newest record is a `manual_url` candidate in `new` state; it made zero writes. This validates the Access role check, Pages-to-Worker signed proxy, and Preview D1 write path.

## Audit outcome repair — 17 July 2026

- A redacted, read-only query of the Preview `admin_audit_log` confirmed that the publisher candidate route emitted audit rows. It also exposed a classification defect: a successful candidate `POST` returns HTTP `201 Created`, while the Worker formerly classified only HTTP `200` as `succeeded`.
- The Worker now classifies every successful HTTP response (`response.ok`, including `201`) as `succeeded`. The stabilisation test proves this outcome and proves a second use of the exact same signed request is rejected with `401` before it can create another candidate.
- `npm test` passed with 47 Worker checks and the stabilisation suite; `npm run typecheck` passed with no diagnostics. A Preview-only dry run then deployed Worker version `5a30388e-f0ea-4e31-b24e-150211a942e6` to `trace-manifest-ingestion-preview`.
- One further harmless browser Desk submission is required to verify the deployed Worker records its successful `201` outcome as `succeeded` in the remote Preview audit log. No production request is needed or authorised.

## Preview Worker deployment

- Worker: `trace-manifest-ingestion-preview`
- Version: `0e5f0dce-1b86-43ab-98e9-501b0232f31a`
- Origin: `https://trace-manifest-ingestion-preview.philgeran.workers.dev`
- D1 binding: `trace-manifest-db-preview`
- R2 binding: `trace-manifest-raw-preview` (new, empty, preview-only bucket)
- Scheduled triggers: none
- AI feature flags: all `false`

The Worker and Pages Preview use a distinct pairing secret. Its value is not retained in this repository.

## Remaining checks and explicit limits

- no production D1 backup, migration, query, or write;
- no production Access, Pages secret, Worker secret, or role-allowlist assertion is made from these Preview checks;
- the initial Preview audit query found and the Preview deployment repaired the `201` success-classification defect; one redacted live recheck remains;
- no ingestion, source fetch, research, evidence creation, or publication was triggered; and
- no removal of the legacy secret.

The active bounded control-plane work remains LAUNCH-05R: perform the final harmless live audit-outcome recheck in Preview only. After that evidence is recorded, LAUNCH-06 can demonstrate the remaining allowed and denied reader/publisher cases and audit behaviour. Production migration and production smoke tests remain separate explicit approvals.
