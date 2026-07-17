# LAUNCH-05R — Preview deployment evidence

**Date:** 17 July 2026  
**Scope:** Non-production Pages deployment and anonymous fail-closed checks only  
**Production impact:** None

## Deployment

- Temporary branch: `launch-05r-preview`
- Source commit: `f09f638` (`Fix dynamic admin home route`), based on production commit `a34afbb`
- Pages deployment ID: `304ead44-633e-4bf4-bc5e-2d90a1b26112`
- Deployment URL: `https://304ead44.the-trace-manifest.pages.dev`
- Environment: Preview
- Status: Active

The branch exists solely to create a non-production Pages deployment. It has not been merged to `main`, and it has not changed the production deployment, Worker, D1 database, R2 bucket, secrets, Access applications, AI flags, or scheduled jobs.

## Source binding boundary

`wrangler.toml` declares the top-level Pages `DB` binding as the non-production database `trace-manifest-db-preview`. Its named production environment separately binds `DB` to `trace-manifest-db`.

This evidence does **not** prove a successful preview D1 query: anonymous requests are rejected before an authenticated request can reach an admin data route.

## Anonymous checks

The following cache-bypassed, unauthenticated GET checks returned `401 Unauthorized`:

```text
https://304ead44.the-trace-manifest.pages.dev/admin?check=20260717-0557
https://304ead44.the-trace-manifest.pages.dev/api/admin/sources?check=20260717-0557
```

The admin page response also included `Cache-Control: no-store`. This demonstrates fail-closed behaviour before any authenticated or mutating test.

The first direct deployment URL requests returned a transient `404`; the cache-bypassed checks above reached the deployed Pages Function and are the authoritative result.

## Remaining preview controls

The current preview does not yet have a complete authenticated control plane:

1. Configure a preview-specific Cloudflare Access application or Preview Access restriction before inviting an operator to sign in. Do not expose an authenticated admin test surface publicly.
2. The checked-in top-level Pages configuration now supplies these non-secret Preview values: `TRACE_ENVIRONMENT=preview`, the stable preview branch origin, the preview Worker origin, and all AI flags set to `false`. A fresh preview deployment must apply them. Add the remaining Pages variables and secrets through the dashboard, without copying production secrets into Git:
   - `CF_ACCESS_TEAM_DOMAIN`;
   - `CF_ACCESS_AUD` for the preview Access application;
   - `TRACE_ADMIN_READERS` and `TRACE_ADMIN_PUBLISHERS` for the approved operator;
   - `TRACE_INTERNAL_SERVICE_SECRET`.
3. Pair Pages to the already deployed preview Worker. It is bound to `trace-manifest-db-preview` and `trace-manifest-raw-preview`, has every AI flag set to `false`, and has no cron trigger. Generate and set a distinct `TRACE_INTERNAL_SERVICE_SECRET` on both Pages Preview and that Worker; then set Pages Preview `TRACE_INGESTION_WORKER_URL` to the preview Worker origin. Do not use a production secret or origin.
4. After those controls are present, run LAUNCH-06 only with the safe reader/publisher boundary cases. Keep all AI flags disabled and do not run a production mutation.

## Preview Worker deployment

- Worker: `trace-manifest-ingestion-preview`
- Version: `0e5f0dce-1b86-43ab-98e9-501b0232f31a`
- Origin: `https://trace-manifest-ingestion-preview.philgeran.workers.dev`
- D1 binding: `trace-manifest-db-preview`
- R2 binding: `trace-manifest-raw-preview` (new, empty, preview-only bucket)
- Scheduled triggers: none
- AI feature flags: all `false`

The Worker intentionally has no `TRACE_INTERNAL_SERVICE_SECRET` until the operator generates a distinct preview secret and places the same value in both the Worker and Pages Preview environment. It cannot successfully receive a signed Pages-to-Worker request before that pairing exists.

## Explicitly not done

- no production D1 backup, migration, query, or write;
- no Pages Preview variable or secret change, including no preview HMAC pairing;
- no Access policy or Pages variable/secret change;
- no authenticated request;
- no publisher mutation, replay test, audit-log query, ingestion, or publication; and
- no removal of the legacy secret.
