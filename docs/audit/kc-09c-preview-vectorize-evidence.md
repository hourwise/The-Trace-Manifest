# KC-09C Preview Vectorize evidence

**Status:** Preview resource and schema setup complete. No vectors have been
inserted and production remains untouched.

## Preview D1

- Target: `trace-manifest-db-preview` (`f312f662-2252-4005-8103-1a40d546e16b`).
- Recovery export captured before the write:
  `D:\Users\fleur\TraceManifestD1Backups\trace-manifest-db-preview-before-0050-kc09c-20260726-1316.sql`.
- `db/migration-0050-knowledge-retrieval-indexes.sql` completed successfully
  (36 queries, 35 rows written). `knowledge_search_records` and the external
  content `knowledge_search_fts` table are present.
- The Preview database currently contains zero lexical records, so the
  migration performed no embedding/vector work.
- `PRAGMA quick_check` returned `ok`; `PRAGMA foreign_key_check` returned no
  rows.

## Preview Vectorize

- Index: `trace-manifest-knowledge-preview-bge-m3-v1`.
- Configuration: 1024 dimensions, cosine distance.
- Metadata filters verified as string indexes:
  `record_type`, `language`, `admission_state`, `publication_state`, and
  `embedding_version`.
- The index is empty. No Workers AI invocation, vector upsert, production
  index, or production binding was created.

The Worker binding is declared only under `env.preview` in
`wrangler.worker.toml`; activating it still requires a Preview Worker deploy.
