# KC-07B automatic evidence recalculation evidence

**Date:** 24 July 2026  
**Status:** Complete locally; desktop Astro/build and deployment verification remain deferred.

## Implemented

- `src/lib/server/evidence-recalculation.ts` loads the current canonical
  claim, reviewed assertion, provenance, conflict, story-claim, and eligible
  related-evidence records before invoking the pure `kc-07a-v1` scorer.
- Eligible Find Related evidence is represented as a reviewed direct assertion
  without a provenance root, so it can improve direct support but cannot create
  independent corroboration before provenance review.
- Recalculation writes immutable claim and story score snapshots and updates the
  story qualitative evidence status from the materiality-weighted roll-up.
- Trigger integrations cover accepted evidence, claim-match acceptance,
  provenance assertion/group changes, conflict creation/review, corrections,
  stale-evidence expiry sweeps, withdrawal, supersession, and archive changes.
- The 09:00 scheduled pipeline runs the stale-assertion expiry recalculation
  after conflict detection. Repeated review decisions remain idempotent before
  recalculation is reached.

## Verification

- `npm.cmd test` passed: 119 ingestion tests and stabilisation tests.
- `npm.cmd run test:migrations` passed, including repeat application of
  migrations 0044 and 0045.
- `npx.cmd tsc --noEmit -p workers/tsconfig.json` passed.
- `git diff --check` passed.
- Full Astro typecheck/build, deployment, and remote D1 verification remain
  deferred to the main desktop because this checkout is on an SD-card-backed
  D: drive.
