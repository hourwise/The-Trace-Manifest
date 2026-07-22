# KC-02 — Canonical Schema Foundation Evidence

**Date:** 22 July 2026
**Status:** Complete — KC-02A–H complete.
**Scope:** Local migration/regression validation plus isolated Preview resources only.
**Remote deployment/D1 mutation:** Preview only. No production resource, Worker or database was changed.

## Implemented

- `migration-0032-knowledge-continuity.sql` adds canonical source documents, immutable source versions, chunks, provenance groups, canonical claims/assertions, story/knowledge links, relationship/proposal/score snapshots, idempotent processing jobs, and R2/Vectorize outbox records. It uses the next free migration number because `0018` is already allocated to verified RSS source feeds.
- Existing `claims`, `claim_evidence`, `knowledge_documents`, and public routes remain intact. New canonical assertions can retain a nullable `legacy_claim_id`; no route has been cut over and no dual write is introduced.
- Foreign keys, uniqueness constraints, status checks, and idempotency keys are declared in the migration. The current-version pointer remains nullable until a captured version is accepted.
- The local SQLite D1 adapter applies the migration with all test databases. Stabilisation coverage verifies table presence, duplicate application, legacy claim compatibility, and representative foreign-key/check failures.
- `wrangler.worker.toml` declares Preview-only producer bindings for a source-capture processing queue and its reserved dead-letter queue. There is deliberately no consumer or production binding until KC-03 implements a handler.
- Created `trace-manifest-kc-processing-preview` and `trace-manifest-kc-processing-preview-dlq` as separate Cloudflare Preview queues. A Preview dry run and deployment validated both producer bindings, the Preview D1/R2 bindings, no cron trigger, and all AI flags set to `false`.
- Applied `migration-0032-knowledge-continuity.sql` to `trace-manifest-db-preview` only. All 15 KC-02 tables are present; a second application ran 30 `IF NOT EXISTS` statements with zero rows written. Preview Worker version: `fef5c9cb-8406-48ba-a7f8-3ac463a4388c`.
- Exported the Preview D1 schema with `wrangler d1 export --remote --no-data`. The resulting schema-only SQL was restored into a clean local SQLite database, where all 15 KC-02 tables were present, `PRAGMA integrity_check` returned `ok`, and `PRAGMA foreign_key_check` returned no violations. This validates the export/import recovery path for this additive, schema-only migration without restoring or changing a remote database.
- `npm run test:migrations` passed locally, including the existing legacy-production compatibility fixture and the KC-02 migration's duplicate-application validation.
- `migration-0033-knowledge-reconciliation-state.sql` adds one immutable receipt per asynchronous Vectorize operation plus an append-only reconciliation-run audit trail. It was applied to Preview D1 only; `knowledge_index_operation_receipts` and `knowledge_reconciliation_runs` were verified there. No production database was changed.
- `workers/ingestion/knowledge-reconciliation.ts` implements the retry-safe reconciliation primitive. A pending R2 put completes only when its matching source version, content hash, R2 key, and optional stored hash agree. A Vectorize delete records the returned mutation ID, remains running, and is completed only once `getByIds` confirms that the canonical chunk vector is absent. Failures are limited to stable error codes and become visible repair records rather than silently changing evidence state.
- Stabilisation tests prove the two recovery paths: an R2 object written before its D1 operation completed is attached to its matching source version, and a stale vector is not marked deleted until the asynchronous deletion is observable. Retrying confirmation does not submit a second delete. Publisher-only `/admin/knowledge/recovery` lists pending, failed, running, and repair-required operations.

## Deliberately deferred

- The queues have no consumer yet. KC-03 must implement and test the capture handler before a consumer/dead-letter policy is attached.
- No source capture, R2 writes, Vectorize writes, extraction, embedding, public evidence use, or automatic publication is enabled by these migrations. The reconciliation module is a tested primitive only; KC-03 and KC-09 must call it only after their respective source-admission and embedding-policy gates.

## Validation note

- A direct read-only Preview command containing `PRAGMA integrity_check; PRAGMA foreign_key_check;` was denied by Cloudflare D1 with `SQLITE_AUTH`, although the Preview schema query, migration and duplicate migration application all succeeded. It was not retried. The approved schema-only D1 export and clean local import/SQLite checks above provide the recovery validation for KC-02G; the direct D1 `PRAGMA` permission can be revisited separately if operational monitoring requires it.
