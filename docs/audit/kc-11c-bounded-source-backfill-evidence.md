# KC-11C bounded source backfill evidence

Status: implemented and locally validated on `agent/kc-11c-bounded-source-backfill`; not merged, not production-enabled, and no real approved Preview batch has been executed.

## Boundary

`db/migration-0056-kc-11c-bounded-source-backfill.sql` adds an additive Preview-only batch, item, and append-only event ledger. `src/lib/server/knowledge-source-backfill.ts` provides the deterministic `kc-11c-v1` plan hash, explicit category/record-list/limit selection, exact-hash approval, bounded execution, retryable/terminal outcomes, and partial-settlement counters. The Worker and Pages admin proxy expose publisher-only plan, approve, execute/retry, and status routes. Dry-run planning performs zero fetches and zero writes.

Ceilings are 25 records, concurrency 2, 3 redirects, 512 KiB per record, 5 MiB per batch, 2 retries, and 30 seconds. Production fails closed on the environment guard. The implementation does not call AI, Vectorize, scoring, claims, provenance, relationships, or public routes.

## Validation state

- Local implementation: complete.
- Preview deployment: migration bookmark `0000003a-00000006-000050b6-58e7936e60a4668d41eb2b84b22847f5`; Worker version `83049b68-2743-4c7e-9de5-7bc70049fcaa`; Pages deployment `f5c22bf8` (`https://agent-kc-11c-bounded-source.the-trace-manifest.pages.dev`).
- Real authenticated Preview batch: intentionally not executed. A human publisher must approve the exact plan hash before execution.

## Proposed smoke batch (not executed)

Use a reviewed `kc-11a-v1` inventory and an explicit selection such as:

```json
{"selection":{"category":"source_url","limit":2,"newestFirst":true}}
```

The plan endpoint returns `writes: 0`, `fetches: 0`, selected/excluded records, ceilings, estimated request/storage bounds, and a stable `planHash`. Approval and execution must echo the exact plan/hash and a fresh idempotency key through the authenticated publisher/admin boundary.

Local static-inventory proposal (not approved or executed): plan hash `5d33338792822c6665abe97a3fbf89980b45d4dea9d7364becfa45b4a4c31cdf`; selected records are the Anthropic Model Context Protocol URL and the TypeScript SDK URL; remaining records are excluded by the explicit limit. The selected URLs are safe public `https` sources and remain subject to the live retrieval/admission boundary.

## Verification queries

```sql
SELECT id, state, plan_hash, approved_by, approved_at, executed_at
FROM knowledge_source_backfill_batches ORDER BY created_at DESC LIMIT 5;

SELECT batch_id, inventory_record_id, outcome, reason_code, retry_count,
       source_document_id, source_document_version_id
FROM knowledge_source_backfill_items WHERE batch_id = ? ORDER BY inventory_record_id;

SELECT item_id, outcome, reason_code, created_at
FROM knowledge_source_backfill_item_events WHERE batch_id = ? ORDER BY created_at;
```

Authenticated publisher command (do not paste secrets; Access supplies the session and the Pages proxy signs server-side):

```js
fetch("/api/admin/knowledge/backfill/plan", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ inventory: reviewedKc11aInventory, selection: { category: "source_url", limit: 2, newestFirst: true } })
})
```

Only after a human reviews that response should the exact returned `plan` and `planHash` be sent to `/api/admin/knowledge/backfill/approve`; execution is a separate explicit `/api/admin/knowledge/backfill/execute` request. No such approval or execution request has been made.
