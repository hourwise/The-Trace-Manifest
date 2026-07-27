# KC-09D Preview indexing evidence

**Status:** Indexing flow and delayed-confirmation fix pass locally. The
confirmation migration and Worker fix are deployed to Preview. A follow-up
authenticated publisher run is still required to observe the recovered vector
settle through the deployed path; the internal-service secret is not exposed to
this execution environment.

## Implementation

- `workers/ingestion/knowledge-embedding-index.ts` enforces Preview-only
  execution, the locked `@cf/baai/bge-m3` model/version and namespace, 2,000-
  character input normalization, estimated token ceilings, 16,000-token batch
  limits, and the 250,000-token daily Preview ceiling.
- Eligibility is fail-closed: source chunks require an admitted source,
  extracted/captured version, and start/end locators; canonical claims require
  an admitted accepted current assertion; stories require published reviewed
  content; knowledge sections require approved public documents with no open
  change proposal; Guides are indexed only when their optional table exists and
  is published/public; corrections require `published = 1`.
- Vector IDs are stable (`record_type:record_id`) and carry only the five locked
  metadata fields. D1 records `knowledge_embedding_runs` and
  `knowledge_embedding_index_items` before AI/upsert work, skips identical
  indexed hashes, and records an unconfirmed Vectorize result as
  `confirmation_pending`, distinct from active embedding `running` work.
- The deployed Preview observation recovered an abandoned run with
  `state=partial`, `selected=1`, `submitted=1`, `indexed=0`, `deferred=1`, and
  `inputTokens=88`. Its D1 item was `record_type=published_story`,
  `record_id=1`, `state=running`, `attempt_count=1`,
  `last_error=vector_confirmation_pending`, and `vector_id=published_story:1`.
  Workers AI and Vectorize upsert had completed, but the immediate Vectorize
  `getByIds` confirmation did not yet return the vector. KC-09D now preserves
  that submitted vector as `confirmation_pending`, retries confirmation without
  regenerating the embedding, reconciles it when visible, and bounds misses
  before allowing one controlled upsert retry or a terminal failure.
- Publisher-only `POST /admin/knowledge/index-preview` supports bounded runs
  and a dry-run estimate. Production has no AI or Vectorize binding and fails
  closed.

## Validation and Preview state

- `npm.cmd run test` passed (119 ingestion checks plus stabilisation tests,
  including a 1024-dimensional mocked Preview indexing run and delayed
  confirmation/retry coverage).
- `npm.cmd run typecheck` passed with zero errors (five existing hints).
- `npm.cmd run test:migrations` passed, including repeat application of
  migrations 0050, 0051, and the idempotent KC-09D confirmation migration
  0055.
- Preview migration `db/migration-0051-knowledge-embedding-index-state.sql`
  completed successfully (5 queries, 11 rows written). Preview D1 integrity
  checks remain clean.
- Preview migration `db/migration-0055-knowledge-embedding-confirmation.sql`
  completed successfully and was safely replayed to recover the legacy
  `running`/`vector_confirmation_pending` row as `confirmation_pending` with
  `confirmation_attempt_count = 1`.
- Preview Worker deployment completed as version
  `7e349586-1d51-4e43-be62-d4ac6ae90274`; Wrangler confirmed the isolated D1,
  AI, Vectorize, R2, and queue bindings.
- Read-only Preview verification confirms the new state/counter columns and
  the recovered `published_story:1` item in `confirmation_pending`. No new
  indexing request was sent during this validation, and no production change
  was made. A publisher must still invoke `POST /admin/knowledge/index-preview`
  through the authenticated Preview admin boundary with a bounded limit (for
  example, 25) to complete the deployed delayed-confirmation smoke test; this
  environment cannot manufacture that HMAC without exposing or rotating the
  configured secret.
