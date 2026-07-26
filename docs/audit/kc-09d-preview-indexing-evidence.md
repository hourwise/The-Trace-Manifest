# KC-09D Preview indexing evidence

**Status:** Indexing flow complete locally and the Preview Worker is deployed.
No vector records have been generated yet because the signed admin trigger
requires the existing Preview internal-service secret, which is not exposed to
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
  indexed hashes, and leaves unconfirmed Vectorize results in `running` state.
- Publisher-only `POST /admin/knowledge/index-preview` supports bounded runs
  and a dry-run estimate. Production has no AI or Vectorize binding and fails
  closed.

## Validation and Preview state

- `npm.cmd run test` passed (119 ingestion checks plus stabilisation tests,
  including a 1024-dimensional mocked Preview indexing run).
- `npm.cmd run typecheck` passed with zero errors (four pre-existing hints).
- `npm.cmd run test:migrations` passed, including repeat application of
  migrations 0050 and 0051.
- Preview migration `db/migration-0051-knowledge-embedding-index-state.sql`
  completed successfully (5 queries, 11 rows written). Preview D1 integrity
  checks remain clean.
- Preview Worker deployment completed as version
  `ae6424a8-95da-4d0b-82c2-2165fdf27b49`; Wrangler confirmed the isolated D1,
  AI, Vectorize, R2, and queue bindings.
- Read-only Preview verification found both KC-09D state tables present, zero
  embedding runs, zero embedding items, and zero lexical records. `PRAGMA
  quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows.
- No Workers AI call, Vectorize upsert, or production change has occurred. A
  publisher can now invoke `POST /admin/knowledge/index-preview` through the
  authenticated Preview admin proxy with a bounded limit (for example, 25).
