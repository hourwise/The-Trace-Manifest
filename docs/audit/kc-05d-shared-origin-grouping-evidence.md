# KC-05D shared-origin grouping evidence

**Date:** 23 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05D groups derivative coverage under a shared origin only after explicit
publisher review. The local proposal rule is deliberately conservative: it
uses an exact immutable source content hash across distinct admitted source
documents. It does not infer origin from URL similarity or wording alone.

## Implementation

- `db/migration-0040-provenance-group-proposals.sql` adds proposal and
  append-only review-history tables with constrained root/derivative
  relationships, confidence, mandatory review, and idempotency metadata.
- `provenance-group-proposals.ts` creates one root (`original`) and derivative
  (`syndicated_from`) proposal per source document sharing an exact content
  hash. Proposals remain `proposed` and are mandatory for publisher review.
- Publisher acceptance through the protected API and
  `/admin/knowledge/provenance-groups` creates the reviewed
  `provenance_groups` row, root and derivative
  `source_provenance_memberships`, and links assertions from the reviewed
  source document to that group.
- Rejection changes only the proposal state. Neither path recalculates an
  evidence score or publishes content automatically.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0040 applies idempotently.
- `npm.cmd run typecheck` — passed (0 errors; four existing hints).
- `npm.cmd run build` — passed, including Cloudflare route verification.
- `npm.cmd run test:security` — passed across 148 source files and Git history.
- `git diff --check` — passed.
- Tests prove exact-content proposal generation and idempotency, accepted root
  and derivative memberships, assertion linkage, rejection, and duplicate
  review conflict handling.

KC-05E is next: detect support, qualification, contradiction, reproduction,
correction, temporal change, and supersession at claim level.
