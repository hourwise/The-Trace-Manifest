# KC-11B historical backfill cost evidence

**Date:** 27 July 2026
**Status:** Complete locally as a read-only dry-run; explicit batch approval is still required before any capture, model call, embedding call, or D1 mutation.

## Result

The KC-11B estimator consumes the versioned KC-11A inventory and produces a
machine-readable cost ceiling with no provider call and no budget reservation.
The current repository static baseline is:

| Measure | Ceiling |
| --- | ---: |
| Inventory items | 262 |
| Backfill content items | 69 |
| Unique source URLs/references | 193 |
| Deterministic fetchability/admission checks | 193 |
| Governed routine-AI calls | 2,316 |
| Embedding batches in the KC-09 envelope | 63 |
| Maximum extraction input tokens | 10,036,000 |
| Maximum extraction output tokens | 1,679,100 |
| KC-09 embedding input-token envelope | 1,000,000 |
| Maximum extraction cost | $18.4315 |
| Maximum embedding cost | $0.0120 |
| Recommended total backfill budget | **$18.4435** |

The maximum is intentionally conservative. It assumes every unique source is
admitted and fetchable, every governed task runs, and deterministic extraction
produces the maximum four canonical-claim candidates per source. Cached,
unchanged, unavailable, rejected, or deterministic-only records cost less.

## Governed assumptions

- Routine extraction uses `deepseek-v4-flash` and the repository defaults of
  $1/M input tokens and $5/M output tokens from `src/ai/config.ts`. Production
  execution must confirm the reviewed runtime pricing variables before approval.
- The output ceilings are the continuity-plan ceilings: 800 tokens for source
  structure/summary, 1,500 for claims/opinions, 600 for canonicalisation and
  provenance, 800 for knowledge impact, and 1,200 for answer synthesis.
- Input ceilings are explicit KC-11B dry-run bounds: 12,000 tokens for source
  tasks, 1,500 for claim/provenance proposals, and 4,000 for impact proposals.
  They are maximums, not targets.
- The report includes no multi-position answer synthesis and no stronger-model
  escalation. Contradiction and high-impact exceptions require a separate
  reviewed estimate.
- Embeddings are not estimated as one invented vector per inventory row. KC-11A
  has no captured source-body or chunk counts, so KC-09's separate BGE-M3
  backfill envelope is applied: 1,000,000 input tokens at $0.012/M, in batches
  of at most 16,000 tokens.

## Reproduction

```powershell
node scripts/inventory-backfill.mjs --static-only --output $env:TEMP\trace-kc11a-static-inventory.json
node scripts/backfill-cost-report.mjs --inventory $env:TEMP\trace-kc11a-static-inventory.json --output $env:TEMP\trace-kc11b-cost-report.json --summary
```

The estimator also accepts `--input-rate`, `--output-rate`,
`--max-claims-per-source`, and `--embedding-input-token-ceiling` for a reviewed
batch-specific estimate. It is deliberately separate from execution: the
report has `budgetReserved: false`, `providerCalled: false`, and
`approvalRequired: true`.

## Validation

- `npm.cmd run test:backfill-cost` passed.
- `npm.cmd run test:inventory` passed before this task and remains the KC-11A
  static inventory check.
- No full Astro build, deployment, or remote mutation was run on this laptop.

## Approval gate

Before a batch starts, a named reviewer must confirm the inventory target,
source admission scope, runtime pricing, four-claim fan-out ceiling, and the
recommended `$18.4435` total budget (or record a lower batch budget). The
approval must be recorded separately from this dry-run; KC-11B does not grant
execution authority.
