# KC-01 — Trust Hotfix Evidence

**Date:** 22 July 2026  
**Status:** Complete; local exit verification passed
**Scope:** Local code and regression-test changes only  
**Remote deployment/D1 mutation:** None

## Implemented controls

- `workers/ingestion/publish.ts` no longer promotes story clusters from source counts or registry tiers. `workers/ingestion/index.ts` records the scheduled step as skipped until claim-level provenance exists.
- Ask TRACE no longer grants independent-evidence credit from a registry source classification. Until KC-05 persists reviewed provenance groups, different Tier-A/B source IDs cannot satisfy the independent-source gate merely by being distinct outlets.
- `src/pages/stories/[slug].astro` no longer derives reproducibility, corroboration, independent verification, or source tier from the number of feed items. `RatingExplanation` shows `Not assessed` until reviewed claim-level evidence is available.
- Public story source rows no longer display registry tiers as if they were claim-level evidence.
- `retrieveApprovedKnowledge` excludes hard-expired/invalid-expiry documents, marks review-due documents stale, and carries the review warning.
- `/knowledge` excludes hard-expired documents; individual public knowledge pages return not found for hard-expired documents and show a review-due warning.
- Ask TRACE reports unresolved TRACE knowledge when its external claim/source bundle is absent. Public Ask TRACE no longer exposes the uncalibrated numeric confidence score; admin Ask retains internal numeric diagnostics.
- The strict evidence validator accepts the unresolved-bundle marker without allowing arbitrary evidence fields.
- Regression coverage was added for count-only evidence upgrades, repeated coverage from one source, review-due and hard-expired knowledge, unresolved knowledge warnings, and public numeric-score suppression.

## Verification attempted

- `npm.cmd test` — passed: 119 ingestion/stabilisation tests, including the KC-01 cases.
- Worker TypeScript check (`tsc --noEmit -p workers/tsconfig.json`) — passed.
- Focused TypeScript check for the changed AI/evidence modules — passed with Cloudflare and Node types.
- Full `npm.cmd run typecheck` / `npm.cmd run build` — blocked by an incomplete local npm package tree (`@astrojs/telemetry` and Cloudflare adapter files are missing generated modules); no application error was reached.
- `git diff --check` — passed.
- `node scripts/diff-check.mjs` — passed after the KC-01 code edits.

## Exit conditions still required

1. Repair or reinstall the complete declared dependency tree.
2. Run the full `npm run typecheck` and `npm run build` checks.
3. Review the Preview diff and execute the no-write Preview smoke checks.
4. Only then mark KC-01 complete and consider the Worker deployment gate.

Until those checks pass, do not deploy or enable source capture, extraction, scoring, or indexing work.
