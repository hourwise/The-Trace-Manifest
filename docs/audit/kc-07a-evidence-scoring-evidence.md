# KC-07A evidence scoring policy evidence

**Date:** 24 July 2026  
**Status:** KC-07A complete locally; automatic recalculation is implemented in KC-07B.

## Implemented

- Migration 0045 adds immutable `canonical_claim_score_snapshots` records with
  score, status, component JSON, policy version, triggering event, and time.
- `evidence-scoring.ts` implements policy version `kc-07a-v1` as a pure,
  deterministic evaluator. It does not read D1 or mutate story/claim state.
- Claim scoring covers the documented six components: source
  admission/directness (25), independent provenance (25), primary evidence
  (15), reproduction/methodological support (15), freshness (10), and
  consistency/conflict handling (10).
- Status gates cover confirmed, strongly supported, provisionally supported,
  vendor-reported, community-reported, disputed, outdated, corrected, and
  superseded outcomes.
- Story scores use materiality weights: low 1, standard 2, high 3, critical 4.
  Disputed, corrected, superseded, vendor-only, and community-only claims cap
  the roll-up as required by policy.

## Verification

- Regression tests cover the confirmed gate, vendor-only cap, unresolved
  conflict override, maximum component score, and materiality-weighted story
  roll-up.
- `npm.cmd test` passed: 119 ingestion tests and stabilisation tests.
- `npm.cmd run test:migrations` passed, including repeat application of
  migration 0045.
- `npx.cmd tsc --noEmit -p workers/tsconfig.json` passed.
- `git diff --check` passed.
- Automatic recalculation is implemented in [`kc-07b-automatic-recalculation-evidence.md`](kc-07b-automatic-recalculation-evidence.md).
- Production deployment verification remains deferred to the main desktop.
