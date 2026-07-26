# KC-09F compatible and competing position grouping evidence

**Status:** Local implementation complete; this is a deterministic retrieval
stage and does not publish, score, or prefer a position.

`src/lib/server/knowledge-position-grouping.ts` consumes KC-09E's
D1-resolved Vectorize matches and produces:

- compatible `positions`, each containing claim IDs, evidence IDs, normalized
  statements, provenance-group IDs, and the strongest recall score; and
- explicit `competitions`, each linking two positions with the reviewed
  relationship(s) and the evidence IDs that establish the disagreement.

Exact claim identity is compatible by default. Reviewed `supports`,
`reproduces`, and `qualifies` relationships can merge distinct claims into one
position. Reviewed `contradicts`, `corrects`, `supersedes`, and
`temporal_change` relationships never merge positions; unresolved or
acknowledged D1 conflict cases are loaded as competing edges. Records without
a canonical claim remain standalone positions so later sufficiency logic can
decide whether they are usable. Duplicate evidence IDs retain the highest
score, and all output ordering/IDs are deterministic.

Validation:

- `npm.cmd test -- --run` passed (119 ingestion checks plus stabilisation,
  including compatible and competing grouping coverage).
- `npm.cmd run typecheck` passed with zero errors (four pre-existing hints).

No production database, Worker binding, Vectorize index, or live Preview
embedding state was changed by KC-09F.
