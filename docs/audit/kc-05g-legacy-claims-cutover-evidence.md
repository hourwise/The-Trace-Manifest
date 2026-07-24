# KC-05G legacy claims cutover evidence

**Date:** 24 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05G maps governed legacy claims and evidence into the canonical claim graph,
retains legacy identifiers for audit/read compatibility, and prevents new writes
to the legacy `claims` and `claim_evidence` tables.

## Implementation

- `db/migration-0043-legacy-claims-cutover.sql` creates idempotent cutover and
  evidence-mapping tables, backfills canonical claims/assertions and story-claim
  links, records `legacy_unclassified` rows as quarantined, and installs
  fail-closed read-only triggers on the legacy tables.
- `canonical-claim-write.ts` gives feed extraction a canonical-only write path
  with a metadata-only source version and deterministic assertion IDs.
- `extract-claims.ts` writes canonical claims/assertions and emits reviewed
  relationship proposals instead of mutating legacy claims/conflicts.
- Corrections resolve the legacy identifier to a canonical claim and append a
  reviewed correction assertion; Ask TRACE reads canonical assertions and uses
  the retained legacy evidence map only for source compatibility.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0043 applies idempotently.
- `npx.cmd tsc --noEmit -p workers/tsconfig.json` — passed.
- `git diff --check` — passed.
- Astro `typecheck`/`build` were attempted but exceeded the 5-minute command
  limit while still in Astro diagnostics; no diagnostic output was produced.

The repository is currently on a laptop D: drive backed by an SD card. Rerun
the full CI/build/audit and required manual/deployment checks on the main
desktop from a clean checkout; the expensive Astro/build and deployment checks
are deferred until that environment is available.

Regression tests prove legacy claim/evidence mapping, story-link preservation,
idempotent rerun behaviour, read-only guards, canonical-only new extraction,
and no legacy dual-write.

KC-06A is next: replace the current Find Related list with review-gated
entity/lexical/claim/date/provenance/semantic candidates.
