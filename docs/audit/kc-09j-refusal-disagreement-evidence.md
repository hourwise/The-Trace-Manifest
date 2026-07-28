# KC-09J refusal, disagreement, and qualified-lean evidence

**Status:** Local implementation complete; no production database, Worker
deployment, Vectorize index, or live Preview embedding state was changed.

KC-09J closes the answer-policy test boundary:

- `refused`, `out_of_scope`, and `insufficient` answers can safely contain no
  factual claims or citations, while retaining an explicit reason, limitation,
  and bounded next step;
- if supplied evidence is disputed or contradictory, an answer that omits the
  material disagreement fails validation; and
- a `qualified_lean` packet preserves both positions, the application-selected
  lean, confidence expectation, and deterministic `whatCouldChange` guidance.

The fixtures exercise both successful and fail-closed paths. The qualified-lean
case uses the KC-09G policy inputs (strong position versus moderate competing
position), and validation rejects any model attempt to change the selected mode,
confidence, or lean.

Checks passed:

- `npm.cmd test -- --run` (119 ingestion checks plus stabilisation tests);
- `npm.cmd run typecheck` (zero errors; four pre-existing hints);
- `npm.cmd run test:migrations`;
- `git diff --check` (only existing line-ending normalization warnings).
