# Deployment

Deployment is blocked until the clean validation sequence in `TESTING.md` passes.

## 1. Prepare

1. Use Node 24 and a clean checkout.
2. Run `npm ci` and the full CI command set.
3. Confirm no production secret is available to pull-request builds.
4. Review current Cloudflare and provider configuration; do not assume repository examples are current account settings.

## 2. Database migration

For a new D1 database apply, in order:

1. `db/schema.sql`
2. `db/migration-5e-publication.sql`
3. `db/migration-stabilisation-security.sql`

For an existing database, take a backup/export first and confirm which migrations are already recorded. The stabilisation migration contains one-time `ALTER TABLE` statements and must not be blindly replayed. Apply it to a non-production database, run the migration tests and smoke queries, then schedule the production change.

The migration defaults catalogue records to `draft`; it does not silently publish extracted rows.

## 3. Pages configuration

Configure the D1 `DB` binding and the canonical variables from `docs/configuration/environment-variables.md`. Add secrets with the Cloudflare secret facility, not `wrangler.toml`.

Keep `TRACE_AI_PUBLIC_ENABLED=false`, `TRACE_AI_EDITORIAL_ENABLED=false`, and `TRACE_AI_SCHEDULED_ENABLED=false` through deployment. Confirm `TRACE_ENVIRONMENT=production` and `TRACE_ALLOWED_ORIGINS=https://thetracemanifest.com`.

## 4. Access and Worker configuration

Create a Cloudflare Access application covering `/admin*` and `/api/admin/*`. Set its audience and team domain on Pages, then configure explicit reader and publisher email allowlists.

Set the same 32-byte-or-longer `TRACE_INTERNAL_SERVICE_SECRET` on Pages and the ingestion Worker. Configure `TRACE_INGESTION_WORKER_URL` as an HTTPS origin with no path or credentials. The Worker accepts no browser bearer token and no CORS admin flow.

## 5. Domains

- `thetracemanifest.com` is canonical.
- `thetracemanifest.uk` redirects to the matching `.com` URL and is not an allowed API origin.
- Verify HTTPS, redirect status, canonical tags, and no redirect loop.

## 6. Smoke tests

- Anonymous requests cannot access admin pages or proxy routes.
- A reader can view admin data but receives `403` for mutations.
- A publisher can perform a reviewed mutation and both `allowed` and outcome audit rows exist.
- Replaying the same signed internal request is rejected.
- Public routes return only reviewed/published rows; draft and invalid slugs return 404/empty states.
- Unsupported connectors produce `unsupported`/skipped job outcomes, not success.
- Ask TRACE remains disabled and makes no provider call.

## 7. AI pilot and launch

After reviewing actual model IDs, prices, terms, and data retention, configure explicit pricing and budgets. Run an authenticated evaluation set, reconcile D1 usage with the provider account, and test kill switches, `401`, `402`, `429`, timeout, invalid output, concurrent duplicate, and budget exhaustion paths.

Public enablement is a separate manual approval and configuration change.

## Rollback

Disable public AI first. Stop scheduled/mutating traffic if integrity is uncertain. Roll application code back without deleting audit or usage rows. D1 column removal requires a planned table-rebuild migration; do not attempt an ad-hoc destructive rollback. Restore from the pre-migration export only when data loss and recovery point are explicitly accepted.
