# KC-09A embedding policy evidence

**Status:** Complete locally; Preview index/filter setup is complete under
KC-09C, while embedding/vector insertion and production rollout remain disabled.

## Locked policy

- Provider and model: Cloudflare Workers AI `@cf/baai/bge-m3`.
- Dimensions and metric: 1024-dimensional dense embeddings with cosine distance.
- Language: multilingual retrieval over original-language source material.
- Input: existing KC-04 locator-backed chunks, capped at 2,000 characters, with
  no re-chunking or overlap introduced by this task.
- Budget: Preview daily 250,000 input tokens; Preview backfill 1,000,000 input
  tokens; maximum batch 16,000 input tokens.
- Version and Preview namespace: `kc09-bge-m3-v1`.
- Metadata indexes: `record_type`, `language`, `admission_state`,
  `publication_state`, and `embedding_version`.
- Production: disabled; no index name or binding is eligible for production in
  this policy.

## Safety properties

The policy module has no network calls and cannot create vectors. It exposes a
Preview rollout target only, returns no remote-index target for production or
development, and requires a new policy version plus a new Preview index for any
provider/model/dimension/chunk-policy change.

## Production migration evidence

A fresh recovery export was captured outside the repository immediately before
the retry. Production inspection confirmed migration 0016 was already present;
0017 was absent and the KC-02 continuity tables from 0032 were absent.

The approved sequence then completed successfully:

1. `db/migration-0017-multilingual-source-provenance.sql` - 15 queries,
   7,602 rows written.
2. `db/migration-0032-knowledge-continuity.sql` - 30 queries, 68 rows written.
3. `db/migration-0049-knowledge-change-proposal-index.sql` - 2 queries,
   2 rows written.

Post-migration verification found both 0049 indexes:

- `idx_knowledge_change_proposals_document_state`
- `idx_knowledge_change_proposals_trigger_claim`

The required 0017/0032 tables are present. `PRAGMA quick_check` returned `ok`
and `PRAGMA foreign_key_check` returned no rows.

The separately approved KC continuity sequence `0033-0048` was then applied in
order. All sixteen migrations completed successfully. The data-sensitive
`0043-legacy-claims-cutover.sql` step read 42,316 rows and wrote 11,142 rows;
the final `0048-source-link-audit.sql` step wrote 126 rows. A fresh recovery
export was captured immediately before that sequence at
`D:\Users\fleur\TraceManifestD1Backups\trace-manifest-db-before-0033-0048-20260726-124709.sql`.

Post-sequence verification found all KC-03-KC-08 tables present. Key live
counts are 3,510 feed items, 983 story clusters, 1,159 claims, 377 claim
evidence rows, 1,159 legacy cutover rows, 377 legacy evidence-map rows, and 30
source-link audit rows. `PRAGMA quick_check` returned `ok` and
`PRAGMA foreign_key_check` returned no rows.
