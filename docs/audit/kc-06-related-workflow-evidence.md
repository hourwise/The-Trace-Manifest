# KC-06 related-story workflow evidence

**Date:** 24 July 2026  
**Status:** KC-06A–E complete locally; eligible attachments now hand off to KC-07B recalculation.

## Implemented

- Find Related ranks coverage, clusters, and published stories with lexical,
  entity, canonical-claim, date, provenance-group, and deterministic semantic
  proxy signals.
- Migration 0044 records publisher decisions for all supported actions:
  same event, attach evidence, follow-up, related context, contradiction,
  correction, supersession, comparison, and reject.
- Accepted story actions create `story_relationships` records with reviewer
  identity, explanation, confidence, and review time.
- Evidence review requires a canonical claim from the source story and persists
  a `story_claim_evidence_attachments` record linked to the reviewed feed item.
- Evidence review records `eligible`, `pending`, or `ineligible` with a reason.
  Eligible attachments trigger KC-07B recalculation; pending and ineligible
  attachments do not. Corrected/superseded/retired claims plus
  archived/rejected/duplicate feed items cannot be score inputs.
- The admin review page exposes publisher-only action controls and requires an
  explanation for contradiction, correction, and supersession.
- Accepted related story reviews surface affected published stories and
  approved, non-expired knowledge pages linked through story relationships or
  canonical claims, including stable admin links.

## Verification

- `npm.cmd test` passed: 119 ingestion tests and stabilisation tests.
- `npm.cmd run test:migrations` passed, including repeat application of
  migration 0044.
- `npx.cmd tsc --noEmit -p workers/tsconfig.json` passed.
- `git diff --check` passed.
- Full Astro typecheck/build and deployment checks remain deferred to the main
  desktop because the current laptop checkout is on an SD-card-backed D: drive.
