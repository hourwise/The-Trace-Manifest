# KC-07F evidence-policy evaluation evidence

**Date:** 24 July 2026  
**Status:** Complete locally; enabling public numeric evidence scores remains a separate reviewed policy rollout.

## Implemented

- Added the versioned deterministic evaluator `kc-07f-v1` for policy `kc-07a-v1`.
- Added a checked-in labelled set covering vendor-only, derivative, independently
  reproduced, disputed, stale, and corrected claims. Labels include expected
  qualitative status, editorial decision, and score band.
- Added three labelled score-change comparisons: derivative → independent
  reproduction, supported → disputed, and current → stale. The evaluator checks
  score direction against the human editorial expectation rather than treating
  a raw numeric threshold as publication authority.
- Added `npm.cmd run test:evidence-policy` and included it in the CI script.
- Public numeric evidence scores remain disabled via the explicit
  `PUBLIC_EVIDENCE_NUMERIC_SCORES_ENABLED = false` gate. Public data contracts
  continue to expose qualitative evidence status only.

## Verification

- Six of six labels matched status, editorial decision, and score band.
- Three of three score-direction comparisons matched.
- `npm.cmd test -- --run` passed: 119 ingestion tests and stabilisation tests.
- `npm.cmd run typecheck` and `npm.cmd run test:security` passed.
- `npm.cmd run build` passed, including Cloudflare route verification.
