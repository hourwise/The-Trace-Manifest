# KC-05E claim relationship evidence

**Date:** 23 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05E detects possible claim-level support, qualification, contradiction,
reproduction, correction, temporal change, and supersession. Proposals are
review-gated. No claim state, provenance membership, or evidence score is
changed automatically.

## Implementation

- `db/migration-0041-claim-relationship-proposals.sql` adds constrained
  relationship proposal and append-only review-history tables.
- `claim-relationship-proposals.ts` compares extracted assertion text with
  other non-retired canonical claims using deterministic lexical overlap and
  explicit relationship cues. Proposal identity is idempotent by assertion,
  target, relationship, and algorithm version.
- Accepted KC-05B claim decisions generate relationship proposals. Publisher
  review is available through the protected API and
  `/admin/knowledge/claim-relationships` UI.
- Acceptance creates a separate reviewed relation assertion against the target
  claim, preserving the original assertion. Temporal-change proposals use the
  existing `qualifies` assertion relation as a storage-compatible fallback;
  the proposal retains the precise `temporal_change` classification.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0041 applies idempotently.
- `npm.cmd run typecheck` — passed (0 errors; four existing hints).
- `npm.cmd run build` — passed, including Cloudflare route verification.
- `npm.cmd run test:security` — passed across 152 source files and Git history.
- `git diff --check` — passed.
- Tests prove deterministic correction classification, idempotent proposal
  generation, accepted relation assertion creation, preserved target claim
  state, review history, and duplicate-review conflict handling.

KC-05F is next: preserve unresolved conflicts instead of forcing consensus.
