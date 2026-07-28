# KC-11C bounded source backfill evidence

Status: corrective implementation in progress on `agent/kc-11c-bounded-source-backfill`; not merged, not production-enabled, and no real approved Preview batch has been executed. KC-11C remains smoke-gated.

## Boundary

`db/migration-0056-kc-11c-bounded-source-backfill.sql` adds the base ledger. Forward migration 0057 adds immutable authoritative inventory snapshots, execution-attempt records, deletion protection, and forward-only state transitions. The corrective `src/lib/server/knowledge-source-backfill.ts` enforces exact execution leases/idempotency, retry exhaustion, strict byte/time ceilings, authoritative inventory identity, and durable settlement. Dry-run planning performs zero fetches and zero writes.

Ceilings are 25 records, concurrency 1 (the implemented sequential bound), 3 redirects, 512 KiB per record, 5 MiB per batch, 2 total failed attempts before terminal failure, and 30 seconds. Production fails closed on the environment guard. The implementation does not call AI, Vectorize, scoring, claims, provenance, relationships, or public routes.

## Validation state

- Local implementation: complete.
- Corrective Preview deployment: migration 0057 bookmark `0000003c-00000008-000050b6-372e2f4f5236d986f7e5c62a4d749120`; Worker version `b2641a01-2199-4d8f-b941-43386417efdd`; Pages deployment `dc268c0e` (`https://agent-kc-11c-bounded-source-cj1n.the-trace-manifest.pages.dev`).
- Full `npm run ci`: passed (diff, typecheck, tests, migrations, security, evidence policy, knowledge markdown, build).
- Real authenticated Preview batch: intentionally not executed. A human publisher must approve the exact plan hash before execution.

## Proposed smoke batch (not executed)

Use a reviewed `kc-11a-v1` inventory and an explicit selection such as:

```json
{"inventorySnapshotId":"<reviewed-snapshot-id>","selection":{"category":"source_url","limit":2,"newestFirst":true}}
```

The plan endpoint returns `writes: 0`, `fetches: 0`, selected/excluded records, ceilings, estimated request/storage bounds, and a stable `planHash`. Approval and execution must echo the exact plan/hash and a fresh idempotency key through the authenticated publisher/admin boundary.

Local static-inventory proposal (not approved or executed): plan hash `3401c94aec1b54d3f1467ad0f13e1fd9a012347eb2835f08510a7257c9556989`; selected records are the Anthropic Model Context Protocol URL and the TypeScript SDK URL; remaining records are excluded by the explicit limit. The selected URLs are safe public `https` sources and remain subject to the live retrieval/admission boundary. This hash includes the reviewed snapshot ID and the corrected concurrency ceiling.

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
  body: JSON.stringify({ inventorySnapshotId: "<reviewed-snapshot-id>", inventory: reviewedKc11aInventory, selection: { category: "source_url", limit: 2, newestFirst: true } })
})
```

Only after a human reviews that response should the exact returned `plan` and `planHash` be sent to `/api/admin/knowledge/backfill/approve`; execution is a separate explicit `/api/admin/knowledge/backfill/execute` request. No such approval or execution request has been made.
