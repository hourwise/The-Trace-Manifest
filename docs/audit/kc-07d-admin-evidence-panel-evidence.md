# KC-07D admin evidence panel evidence

**Date:** 24 July 2026
**Status:** Complete locally; production deployment remains pending the normal release approval.

## Implemented

- Added the publisher-only `/admin/knowledge/evidence` page and a Knowledge
  Builder navigation link.
- The panel reads the latest immutable story and claim score snapshots and
  their KC-07C explanations, then displays current versus proposed status,
  policy/event, score components, materiality, claim role, and snapshot time.
- Each claim expands to show assertion text, source URL, admission/reviewer and
  freshness state, directness, evidence treatment, provenance group and origin,
  confidence, distinct root count, active penalties/caps, and recorded claim
  conflicts with the competing claim.
- The page is inspection-only: it has no score mutation, publication, or
  editorial decision endpoint and requires publisher authentication before any
  D1 query runs.

## Verification

- `npm.cmd run typecheck` passed with zero errors.
- `npm.cmd run build` passed, including Cloudflare route verification.
- `npm.cmd test -- --run` passed: 119 ingestion tests and stabilisation tests.
- `npm.cmd run test:security` passed across 160 source files and Git history.
