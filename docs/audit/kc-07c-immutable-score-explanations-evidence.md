# KC-07C immutable score and explanation evidence

**Date:** 24 July 2026
**Status:** Complete locally; production migration/deployment remains pending the normal release approval.

## Implemented

- Migration `0046-score-snapshot-explanations.sql` adds the append-only
  `evidence_score_snapshot_explanations` table for both claim and story score
  snapshots. Each row keeps the nullable prior score/status/components,
  recalculated score/status/components, policy version, triggering event, and a
  deterministic human-readable explanation.
- Recalculation now reads the latest prior snapshot before inserting the new
  claim/story snapshot and writes its matching before/after explanation in the
  same D1 batch. The first snapshot explicitly records an empty before-state;
  subsequent snapshots describe score/status/component changes.
- Database triggers reject updates and deletes for both score snapshot tables
  and their explanations. Recalculation remains append-only and policy-versioned.
- Migration validation and the stabilisation suite cover repeat application,
  explanation contents, and immutability failures.

## Verification

- `npm.cmd test -- --run` passed: 119 ingestion tests and stabilisation tests.
- `npm.cmd run test:migrations` passed, including repeat application of
  migration 0046.
- `npx.cmd tsc --noEmit -p workers/tsconfig.json` passed.
- Full Astro typecheck/build and route verification passed.
- `npm.cmd run test:security` passed across 159 source files and Git history.
