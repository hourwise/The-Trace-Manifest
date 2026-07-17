# TRACE Desk 02 — route-boundary evidence

**Date:** 16–17 July 2026
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

## Authenticated Preview verification — 17 July 2026

- The approved operator opened the Cloudflare Access-protected Preview TRACE Desk and submitted one harmless manual URL candidate.
- The Desk returned: `Candidate recorded. It has not been fetched, researched, or published.`
- A read-only Wrangler query against `trace-manifest-db-preview` confirmed the newest `editorial_candidates` record is a `manual_url` candidate in `new` state, with normal urgency. The query returned zero writes. The candidate URL, operator identity, and identifier are deliberately not retained in this evidence file.
- A successful browser submission proves the allowed publisher flow crossed the intended boundaries: Cloudflare Access session and Pages role mapping, same-origin POST, signed and nonce-protected Pages-to-Worker proxy, then the isolated Preview Worker and Preview D1. It does not prove any production boundary.

## Completion and limits

**DESK-02 is complete in non-production.** The route and role checks, publisher-only manual intake, attributable `new` state, and no-fetch/no-publication behaviour are now evidenced in the isolated Preview environment.

This task did not fetch the submitted URL, create evidence, run ingestion, research a source, alter a public route, or publish a story. The production D1 has not received `migration-0015-editorial-desk.sql`; any production migration remains subject to a separate backup and explicit approval.
