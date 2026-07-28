# KC-09H validated answer schema evidence

**Status:** Local implementation complete; production and Preview retrieval
behaviour remain unchanged until later rollout work.

The provider-neutral Ask TRACE contract now includes the locked KC-09H fields:

- independent `evidenceMode` and `conclusionMode`;
- `directAnswer`, nullable `lean`, and `whyLean`;
- bounded `positions` with supporting/contradicting claim IDs and source IDs;
- claims with canonical claim IDs, relationships, and reviewed assertion IDs;
- locator-backed citations (`assertionId`, source version/chunk, start/end
  locator);
- bounded source summaries, confidence reasons, limitations, unresolved
  questions, and freshness; and
- `whatCouldChange`.

`validateAnswerOutput` performs structural checks, rejects unknown fields,
requires bounded arrays, resolves every cited source/claim/assertion against the
supplied evidence packet, and verifies citation locators match the supplied
reviewed excerpt. When KC-09G supplies an application policy expectation, the
validator rejects any model attempt to change `evidenceMode`,
`conclusionMode`, confidence, or the selected lean. The gateway passes this
expectation and uses application-selected values in the public payload; model
prose is explanatory only.

The DeepSeek adapter accepts the snake_case/camelCase wire aliases but maps
them into the single provider-neutral contract. Safe non-answers and the admin
no-evidence response emit the same fields with an explicit insufficient mode.

Validation:

- `npm.cmd test -- --run` passed (119 ingestion checks plus stabilisation,
  including schema, citation-locator, and gateway mode checks).
- `npm.cmd run typecheck` passed with zero errors (four pre-existing hints).
- `git diff --check` passed; only existing CRLF normalization warnings remain.

No production database, Worker deployment, Vectorize index, or live Preview
embedding state was changed by KC-09H.
