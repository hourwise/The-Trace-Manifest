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
2. Add the required preview Pages variables and secrets through the dashboard, without copying production secrets into Git:
   - `CF_ACCESS_TEAM_DOMAIN`;
   - `CF_ACCESS_AUD` for the preview Access application;
   - `TRACE_ADMIN_READERS` and `TRACE_ADMIN_PUBLISHERS` for the approved operator;
   - `TRACE_INTERNAL_SERVICE_SECRET`; and
   - a preview-only `TRACE_INGESTION_WORKER_URL`.
3. Deploy a separate preview ingestion Worker bound to `trace-manifest-db-preview`; it must not use production D1 or inherit production cron triggers. A separate preview R2 decision is required before enabling any ingestion route.
4. After those controls are present, run LAUNCH-06 only with the safe reader/publisher boundary cases. Keep all AI flags disabled and do not run a production mutation.

## Explicitly not done

- no production D1 backup, migration, query, or write;
- no Worker deployment or preview Worker creation;
- no Access policy or Pages variable/secret change;
- no authenticated request;
- no publisher mutation, replay test, audit-log query, ingestion, or publication; and
- no removal of the legacy secret.
