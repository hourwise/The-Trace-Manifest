# KC-12A–C — Public evidence presentation evidence

Status: locally implemented on `codex/kc-12-public-evidence`. No Worker,
Pages, D1, R2, Queue, Vectorize, Workers AI, or paid-provider deployment was
performed for this batch.

## Batch outcome

Public story pages now show reviewed graph relationships instead of treating
same-topic recency as a relationship. They also show a bounded claim-level
evidence projection: only admitted, current, accepted/amended assertions with
source chunks and locators are eligible. Source bodies remain private and are
not returned by the projection. PDF and metadata-only versions cannot qualify
because the query requires a non-PDF extracted source chunk.

Approved D1 knowledge pages now show the same evidence projection for reviewed
claim/assertion mappings, including section relationship, source role, source
link, provenance origin, and locator. Unresolved mappings are counted and
disclosed but not rendered as supported evidence. Public numeric score values
remain disabled; only the existing qualitative status is surfaced when it is
available.

## Cloudflare usage assessment

Finding: `NO EVIDENCE LOCAL DEVELOPMENT CAUSED IT`.

- Normal repository tests use the in-memory SQLite D1 adapter and mocks.
- The inventory tool defaults to the Preview database/local static inventory;
  production remote access requires explicit `--remote` and database flags.
- Wrangler configuration contains production D1 IDs and five production cron
  schedules, so deployed scheduled ingestion and its connector/pipeline scans
  are the highest-probability ongoing D1 consumers. Explicit remote backfill or
  admin operations are the other high-volume paths.
- Local `wrangler dev` does not use a `remote = true` D1 binding. Preview AI and
  Vectorize bindings are explicitly remote but are only selected with the
  Preview environment and are not used by the normal test scripts.

Recommended later work is to measure scheduled connector row counts and add
per-stage batch ceilings/index review before the 1 September 2026 enforcement
date. That work was not performed here, and no production query was run.

## Validation

The focused public projection test seeds only local SQLite fixtures and proves
that reviewed HTML evidence is visible, unresolved/PDF evidence is excluded,
private chunk text is not projected, and only reviewed graph relationships are
returned. Migration validation and the normal end-of-batch suite remain the
authoritative follow-up checks.

## External verification targets

1. Verify the public story and knowledge routes are always backed by the
   publication/approval gates before calling the read helpers.
2. Attack assertion eligibility with stale, corrected, superseded, disputed,
   `internal_synthesis`, unreviewed, and missing-locator rows.
3. Confirm PDF, metadata-only, prohibited, and legacy compatibility versions
   cannot appear through alternate joins.
4. Check that source URLs are safe and that assertion text truncation does not
   create misleading sentence fragments.
5. Check duplicate assertions and provenance memberships for stable counts.
6. Check concurrent review/mutation timing while a public page is rendering.
7. Review query plans and worst-case claim/assertion cardinalities against D1
   read limits.
8. Confirm reviewed relationship direction and labels for every relationship
   enum, including correction and supersession.
9. Check hard-expiry and open-change-proposal behaviour on knowledge pages.
10. Confirm the public projection never leaks R2 object keys, private chunks,
    reviewer emails, or internal synthesis text as external evidence.
