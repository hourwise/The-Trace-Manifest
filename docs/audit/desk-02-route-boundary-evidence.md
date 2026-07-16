# TRACE Desk 02 — route-boundary evidence

**Date:** 16 July 2026  
**Scope:** `DESK-02` from the master build plan

## Evidence collected

- Cloudflare Pages deployed commit `c4c204c` to production as deployment `21a1efb8-0adb-47ec-bc58-9ce6e7647fe5`.
- An unauthenticated request to `https://thetracemanifest.com/admin/desk` received an HTTP `302` from Cloudflare Access, rather than the Desk page.
- An unauthenticated request to the production Pages deployment's `/admin/desk` path received HTTP `401`.
- An unauthenticated `POST` to `https://thetracemanifest.com/api/admin/candidates` received HTTP `302` from Cloudflare Access before it could reach the intake handler. The request used a harmless lead and was not written to D1.
- `npm test` runs a migrated local-D1 Desk boundary test. It proves all of the following:
  - an unsigned candidate submission returns `401`;
  - a signed reader cannot list or create candidates (`403`) and produces no candidate record;
  - a signed publisher can create one attributable candidate, whose state is `new`;
  - the created record is not fetched, researched, or published, and the publisher can list it.
- `npm run typecheck` completed with no diagnostics.

## Deliberate limit

There is no current Cloudflare Pages preview deployment with the migrated preview D1 binding. The production D1 has not received `migration-0015-editorial-desk.sql`, by design. Therefore an authenticated live publisher submission has **not** been attempted: it would correctly return the migration-unavailable response and would not be meaningful evidence.

## Completion step

Create or use an Access-protected non-production Pages deployment that binds to `trace-manifest-db-preview`, then perform one publisher submission and confirm that the saved candidate is `new` and remains absent from public routes. Apply the production migration only after an explicit backup-and-approval step.
