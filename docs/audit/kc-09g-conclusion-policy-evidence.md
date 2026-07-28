# KC-09G deterministic conclusion policy evidence

**Status:** Local implementation complete; the policy is ready for the
validated answer-schema work in KC-09H.

`src/lib/server/knowledge-conclusion-policy.ts` selects conclusion mode and
confidence from D1-derived position quality only. Its inputs distinguish:

- current and direct evidence;
- independent provenance-group count;
- strong, stale, and disputed evidence; and
- reviewed unresolved competition pairs.

Similarity scores and model-generated prose are not inputs and cannot change
the result. The policy preserves the application-selected `evidenceMode`
(`knowledge`, `researched`, `insufficient`, `out_of_scope`, or `refused`) as a
separate dimension.

The deterministic outcomes are:

- `supported` for a sufficiently corroborated strongest position;
- `qualified_lean` when competing positions remain but one has a material
  evidence-quality margin;
- `multiple_positions` when competing positions are balanced; and
- `insufficient_evidence` when evidence is absent, derivative-only, stale,
  below corroboration/directness thresholds, or the evidence mode forbids a
  conclusion.

The result includes an internal confidence band/score, reasons, optional lean
position, and bounded `whatCouldChange` guidance for the next answer-schema
stage. No public numeric evidence score is enabled by this module.

Validation:

- `npm.cmd test -- --run` passed (119 ingestion checks plus stabilisation,
  including supported, qualified-lean, multiple-position, and insufficient
  policy fixtures).
- `npm.cmd run typecheck` passed with zero errors (four pre-existing hints).

No production database, Worker deployment, Vectorize index, or live Preview
embedding state was changed by KC-09G.
