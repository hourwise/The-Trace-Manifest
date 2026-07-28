# KC-09B retrieval index evidence

**Status:** Complete locally. Preview D1/resource rollout is pending explicit
control-plane authorization. Production remains unchanged and has no AI or
Vectorize binding.

## Local implementation

- `db/migration-0050-knowledge-retrieval-indexes.sql` adds deterministic entity
  and relationship indexes for candidate discovery.
- The migration adds `knowledge_search_records` and an external-content FTS5
  table, `knowledge_search_fts`, covering source chunks, canonical claims,
  knowledge documents, published stories, and corrections. Every FTS hit joins
  back to the D1 record row; the FTS table is never evidence authority.
- Insert/update/delete triggers keep the lexical surface synchronized. The
  migration backfills existing records and is idempotent on repeat application.
- `wrangler.worker.toml` declares `AI` and
  `KNOWLEDGE_VECTOR_INDEX` only under `env.preview`, targeting the locked
  `trace-manifest-knowledge-preview-bge-m3-v1` index. No production binding is
  present.

## Validation

- `npm.cmd run test:migrations` passed, including FTS lexical-hit resolution
  back to a canonical D1 claim and the legacy compatibility check.
- `npm.cmd run typecheck` passed with zero errors (four pre-existing hints).
- `npm.cmd test` passed (119 ingestion checks plus stabilisation tests).
- At KC-09B completion, no Preview control-plane write had been performed. The
  subsequent KC-09C task separately applied migration 0050 and provisioned the
  isolated Preview Vectorize index and metadata filters; its evidence is in
  [`kc-09c-preview-vectorize-evidence.md`](kc-09c-preview-vectorize-evidence.md).
