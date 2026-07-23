# KC-05A claim-match candidate evidence

**Date:** 23 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05A adds a deterministic, review-gated candidate layer between structured
source extraction and the editor decision in KC-05B. It does not merge claims,
create provenance memberships, promote evidence, or change an evidence score.

## Implementation

- `db/migration-0037-claim-match-candidates.sql` adds
  `knowledge_claim_match_candidates`, with candidate state defaulting to
  `proposed`, bounded score/component metadata, review attribution fields,
  indexes, and a unique idempotency key.
- `src/lib/server/claim-match-candidates.ts` scores material and benchmark
  extractions against non-retired canonical claims using lexical, entity,
  value, date, and term-frequency cosine signals. The extraction's own
  canonical claim is excluded from the target set.
- `source-structured-extraction.ts` invokes the matcher only after a new
  canonical assertion is persisted and records the created candidate count in
  the extraction-run validation metadata.
- Candidate rows remain proposals. They do not write `provenance_groups`,
  `source_provenance_memberships`, claim state, or evidence scores.

The semantic signal is explicitly labelled `lexical_cosine_proxy_v1`; it is a
deterministic local proxy, not an embedding model or Vectorize retrieval.
Embedding-backed recall remains a later KC-09 decision.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0037 applies idempotently
  with required constraints.
- `npm.cmd run typecheck` — passed (0 errors; four existing hints).
- The stabilisation suite proves an existing canonical claim receives a
  proposed candidate, component signals and a positive score are persisted,
  the source's own claim is not selected, and rerunning the matcher creates no
  duplicate candidate.

## Boundary

This is a local build step only. No production D1 migration, Queue binding,
external AI call, Vectorize index, public route, or automatic claim merge is
enabled. KC-05B is the next task: editor accept/merge, create-new, or reject
decisions with attributable review history.
