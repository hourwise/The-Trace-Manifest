# KC-05B claim-match review evidence

**Date:** 23 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05B gives a publisher an attributable decision for a proposed claim-match
candidate: merge the source assertion into the existing canonical claim,
accept the extraction's own canonical claim as a new claim, or reject the
match. Decisions are explicit and review-gated.

## Implementation

- `db/migration-0038-claim-match-review.sql` adds append-only
  `knowledge_claim_match_reviews` history with publisher identity, decision,
  optional resolved claim, note, and request id.
- `src/lib/server/claim-match-review.ts` validates proposed candidates and
  applies the decision atomically through D1 batch statements.
- `merge_existing` reassigns and accepts the source assertion, then marks its
  unused generated claim superseded. `create_new` accepts the generated claim
  without changing its identity. `reject` changes only the match candidate,
  leaving the source assertion pending.
- When a match is accepted, competing proposals for the same extraction are
  explicitly superseded and recorded in the same review history.
- `/api/admin/knowledge/review-claim-match` and
  `/admin/knowledge/claim-matches` are publisher-only and enforce same-origin
  and attributable audit logging.

No decision creates a provenance group, evidence score, public evidence, or
automatic publication.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0038 applies idempotently
  with required foreign-key and decision constraints.
- `npm.cmd run typecheck` — passed (0 errors; four existing hints).
- `npm.cmd run build` — passed, including Cloudflare route verification.
- `npm.cmd run test:security` — passed across 140 source files and Git history.
- `git diff --check` — passed.
- Stabilisation coverage proves merge-existing, create-new, reject, source
  assertion state changes, superseded generated claims, review history,
  admin audit rows, and duplicate-review conflict handling.

KC-05C is next: propose provenance relationships and claim-relative
directness, source role, and evidentiary treatment for review.
