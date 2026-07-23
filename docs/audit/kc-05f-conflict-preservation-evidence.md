# KC-05F conflict preservation evidence

**Date:** 23 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05F preserves unresolved claim conflicts rather than forcing consensus.
Contradiction, correction, supersession, and temporal-change relationships
become explicit conflict cases only after their relationship proposal is
accepted by a publisher.

## Implementation

- `db/migration-0042-claim-conflict-cases.sql` adds conflict cases and
  append-only review history. Cases retain both claim IDs, conflict kind,
  explanation, confidence, and status.
- `claim-conflict-cases.ts` creates idempotent cases with status `unresolved`.
- `/api/admin/knowledge/review-claim-conflict` and
  `/admin/knowledge/conflicts` provide publisher-only acknowledge, resolve,
  dismiss, and reopen decisions. Resolve/dismiss require an attributable note.
- Review actions never retire, supersede, prefer, or rewrite either claim and
  never recalculate evidence scores. Reopening returns the case to
  `unresolved` for further research.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0042 applies idempotently.
- `npm.cmd run typecheck` — passed (0 errors; four existing hints).
- `npm.cmd run build` — passed, including Cloudflare route verification.
- `npm.cmd run test:security` — passed across 156 source files and Git history.
- `git diff --check` — passed.
- Tests prove unresolved default state, idempotent generation, acknowledge and
  reopen transitions, required resolution notes, review history, and preserved
  claim state.

KC-05G is next: complete the legacy claims mapping and route cutover so
canonical tables receive new writes without an indefinite dual-write path.
