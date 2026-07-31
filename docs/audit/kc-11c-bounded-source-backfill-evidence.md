# KC-11C bounded source backfill evidence

Status: final integrity corrections are implemented and verified in Preview on
`agent/kc-11c-bounded-source-backfill`. KC-11C remains unchecked and
smoke-gated. One authenticated Preview smoke batch was approved and its
bounded initial execution reached `partial`; the corrective retry remains a
human-authenticated action. No production resource was modified, and KC-11D
has not begun.

## Boundary and integrity model

Migration 0056 adds the bounded source-backfill ledger. Migration 0057 adds
immutable inventory snapshots, execution attempts, deletion protection, and
forward-only state transitions. Additive migration 0058 keeps snapshot content
immutable while replacing the legacy `active` flag as the authority mechanism
with append-only `knowledge_source_backfill_inventory_authority` generations.
The greatest generation is the one current KC-11A authority decision.

Authorising a generation:

1. validates the fixed `kc-11a-v1` inventory schema and `kc-11c-v1` policy;
2. calculates the complete inventory identity server-side;
3. stores or reuses the immutable snapshot by identity;
4. appends an attributable, idempotent authority decision;
5. invalidates unexecuted approvals whose plan references an older snapshot.

Plan creation loads the current stored snapshot server-side. Approval,
execution, and stale recovery independently verify that the plan references the
current authority generation and exact inventory identity. The fully immutable
legacy `active` column is no longer treated as authority.

Migration 0058 also prevents mutation of batch plan/approval/audit identity,
item inventory/audit identity, and attempt identity. Attempt settlement fields
can be written once only when a running attempt becomes terminal. The recovery
policy locks recent attempts for 120 seconds; a stale compare-and-set winner
records the attempt as failed with `stale_execution_abandoned`, returns the
batch to `partial`, and leaves completed item outcomes unchanged. Recovery is
publisher-only, signed, audited, and Preview-only.

Execution ceilings are 25 records, concurrency 1, 3 redirects, 512 KiB per
record, 5 MiB per batch, 2 failed attempts before terminal failure, 30 seconds
per run, and a 120-second stale-execution threshold. The implementation does
not invoke AI, Vectorize, scoring, claims, provenance, relationships, or public
publication paths.

## Validation and Preview deployment

- Full `npm run ci`: passed, including diff checks, Astro and Worker
  typechecking, 119 ingestion tests, stabilisation tests, additive/legacy
  migration validation, security checks, evidence policy evaluation, knowledge
  Markdown checks, and the production build.
- Migration 0058 Preview bookmark:
  `0000003e-00000008-000050b7-8c5fe23768d389d1d94810a7d1d3d827`.
- Previous smoke-test Worker version:
  `12200d35-e16c-451b-94a1-19c73528fbc2`.
- Allowlisted Preview Pages deployment:
  previous smoke-test deployment `2ae1c2b2`; corrective deployment is
  `c605ad75` at
  `https://launch-05r-preview.the-trace-manifest.pages.dev`.
- Corrective Preview Worker version:
  `6c25fb6d-cb09-4526-a29c-9f3158f772f8`.
- Recovery-patch commit: `9aeb208` (`repair KC-11C retry and schema preflight`).
- Recovery-patch Preview Worker version:
  `ec69450d-f67d-4178-ac75-c8b81fbe93ab` at
  `https://trace-manifest-ingestion-preview.philgeran.workers.dev`.
- Pages was unchanged; no Pages deployment was performed.
- Production database, Worker, Pages deployment, indexing, backfill, and
  feature flags: untouched.

## Authenticated smoke-test failure and correction

On the previous authenticated Preview deployment, the dry-run plan endpoint
returned HTTP 200 and plan hash
`e24aa0d64ca5f0a66782379d0b9897ac4317ba6be1884be92122de98dbd82a35`. Sending
that exact response through `JSON.stringify()` and parsing it again before
`/approve` returned HTTP 409:

```json
{ "error": "Plan hash does not match the submitted plan." }
```

The cause was `selection.recordIds: undefined` in the in-memory plan. The
canonicaliser hashed that property as `null`, while JSON transport omitted it.
Commit `786a76e` fixes this by constructing one JSON-safe canonical selection,
rejecting undefined/sparse/non-finite canonical values, preserving explicit
null semantics, and making verification fail closed for malformed plans.

The corrective deterministic dry-run against the unchanged authoritative
snapshot now produces plan hash
`b6ebc48370fce5626c7c267c56ee918cf3788f54aaf4473af3c1546cdc289f28`.

Regression coverage proves JSON round-trip verification, exact transported-plan
approval, explicit and omitted record IDs, null/undefined rejection, key and
array canonicalisation, material-field tampering rejection, and modified
transported-plan approval failure. Full `npm run ci` passed before the
corrective Preview deployment.

## Authenticated Preview smoke chronology and migration drift repair

The corrected transported plan was approved by the authenticated publisher as
batch `d0fb3d76-488d-4aa4-a431-3d6f9a282433` with the unchanged plan hash
`b6ebc48370fce5626c7c267c56ee918cf3788f54aaf4473af3c1546cdc289f28`. Its
initial execution attempt was `fcc36ada-0ad3-4e5d-922d-434a9670d1f4`, using
idempotency key `d90b224f-7d7b-490b-aa06-e931e72009c8`. Both selected URLs
returned HTTP 200 and `521082` bytes were downloaded in total. The attempt
settled two `failed_retryable` items and moved the batch to `partial`.

The downstream failure was the real Preview error
`D1_ERROR: no such table: knowledge_claim_conflict_cases: SQLITE_ERROR`.
Despite that failure, both deterministic source writes committed before the
review trigger failed. The two valid records were:

- GitHub document
  `source-f7fb7d70e0ff6a4e7a73f06ab6611f114f925c625fcbd6be38e12239d0145042`
  and version
  `source-version-f7fb7d70e0ff6a4e7a73f06ab6611f114f925c625fcbd6be38e12239d0145042-bc184ab75abebc8315cbde8c2b567b2d758b08a7f0ee758207841099a471926e`;
- Anthropic document
  `source-e283b9c34207eff8e62a1618cc1a5bc63348e8c9e67ea2af1dda80b41b6b3d9b`
  and version
  `source-version-e283b9c34207eff8e62a1618cc1a5bc63348e8c9e67ea2af1dda80b41b6b3d9b-992908daa70e5b54066061fd8243515304cf169184b7e8e9d435505c24a3ad9b`.

Both source documents remain admitted, `metadata_only`, HTTP 200 current
versions. The backfill item rows still have null source IDs because the old
Worker did not reconcile post-commit failures.

Preview migration drift was then confirmed: migrations 0041 and 0042 were
absent even though the rest of the KC schema was present. The operator applied
`db/migration-0041-claim-relationship-proposals.sql` followed by
`db/migration-0042-claim-conflict-cases.sql` manually to the named Preview
database. The four resulting tables contain zero rows. `PRAGMA quick_check`
returned `ok`, and `PRAGMA foreign_key_check` returned no rows. A SQL export
was attempted but could not be produced because the D1 database contains FTS5
virtual tables; those virtual tables were not removed or altered. The
pre-repair Time Travel bookmark was
`0000004e-00000000-000050b9-cc4ee4210d9cd5d290c29690bfed04f8`; the
post-migration bookmark was
`0000004f-0000000e-000050b9-2a301a841fc633bf99a1ce65b3f5a108`.

The recovery patch adds a fail-closed `sqlite_master` preflight, preserves
committed source identifiers and content hashes after downstream failure,
replays `evidence_changed` for an existing version before settling
`unchanged`, and keeps the prior retry count unchanged on successful retry.
Regression tests cover missing-schema refusal before fetch/attempt creation,
post-commit failure and identifier retention, existing-version replay,
deterministic proposal idempotency, and bounded retry settlement. A new
Preview Worker deployment is recorded below. The authenticated retry has not
been run by Codex and remains smoke-gated for the human operator.

Tests cover superseded snapshot invalidation; rejection of non-current
approval and execution; snapshot, batch, item, authority, and attempt
immutability; one-time attempt settlement; recent running locks; stale
recovery; one winner across competing recoveries; preservation of completed
items; unsigned route rejection; reader-role rejection; and production
recovery fail-closed behaviour.

## Authoritative Preview inventory

The reviewed inventory was generated read-only from the explicit Preview
database with:

```powershell
node scripts/inventory-backfill.mjs --remote --database trace-manifest-db-preview --output .tmp-kc11c-preview-inventory.json
```

It contains 262 records: 16 static knowledge pages, 30 knowledge-authoring
inputs, 23 guides, and 193 unique source URLs. The publisher submitted the
105,926-byte inventory through the Access-protected Pages proxy. Pages signed
the server-to-server request; no HMAC secret entered browser code, logs, or the
request body.

- Snapshot ID: `df94ae62-92c7-408d-9ae8-13b5b8cae10f`
- Inventory identity:
  `31fbe93edafa8e5902e6b5cb915c2345f1be449b9263b8a586b8a1f2440a3ece`
- Authority decision ID: `7e11c232-c1ec-4f9a-9230-36af3b845ca3`
- Authority generation: `1`
- Actor: `philgeran@gmail.com`
- Correlation ID: `9083f50d-7b07-4e15-aae3-849a7a7d2ba1`
- Snapshot created: `2026-07-30 20:42:00` UTC
- Authorised: `2026-07-30 20:42:00` UTC
- Authority idempotency key:
  `kc11c-preview-authority-20260729T213437187Z`

The same authority request and idempotency key return the recorded decision
without adding a duplicate snapshot or decision.

## Recorded smoke plan and initial execution

The exact current snapshot and selection
`{"category":"source_url","limit":2,"newestFirst":true}` deterministically
produce:

- Plan hash:
  `b6ebc48370fce5626c7c267c56ee918cf3788f54aaf4473af3c1546cdc289f28`
- Estimated requests: `2`
- Estimated maximum stored bytes: `1048576`
- Anthropic MCP source:
  `https://www.anthropic.com/news/model-context-protocol`
- Model Context Protocol TypeScript SDK:
  `https://github.com/modelcontextprotocol/typescript-sdk`

Planning performed zero fetches and zero writes. The publisher then reviewed
and approved the exact transported plan before the bounded initial execution
recorded above. The corrective retry remains a separate human action.

## Historical authenticated commands

Run these only from the browser console at the allowlisted Preview origin while
authenticated through Cloudflare Access as a publisher. The Pages proxy signs
upstream requests server-side.

Create the dry-run plan:

```js
const planResponse = await fetch("/api/admin/knowledge/backfill/plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inventorySnapshotId: "df94ae62-92c7-408d-9ae8-13b5b8cae10f",
    selection: { category: "source_url", limit: 2, newestFirst: true }
  })
});
const planResult = await planResponse.json();
console.log(planResponse.status, planResult);
```

After confirming that `planResult.plan.planHash` exactly equals
`b6ebc48370fce5626c7c267c56ee918cf3788f54aaf4473af3c1546cdc289f28`,
approve that exact reviewed plan:

```js
const approvalResponse = await fetch("/api/admin/knowledge/backfill/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    plan: planResult.plan,
    planHash: planResult.plan.planHash,
    idempotencyKey: crypto.randomUUID()
  })
});
const approvalResult = await approvalResponse.json();
console.log(approvalResponse.status, approvalResult);
```

Only after separately reviewing the approval result, execute the exact approved
batch:

```js
const executionResponse = await fetch("/api/admin/knowledge/backfill/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    batchId: approvalResult.batchId,
    planHash: planResult.plan.planHash,
    idempotencyKey: crypto.randomUUID()
  })
});
const executionResult = await executionResponse.json();
console.log(executionResponse.status, executionResult);
```

The plan, approval, and initial execution commands above document the human
smoke chronology; they were not run by Codex for this evidence update.

## Exact authenticated corrective retry command

After confirming the deployed Worker and the repaired Preview schema, run this
once from the browser console at the allowlisted Preview origin while
authenticated through Cloudflare Access as a publisher. Do not reuse the
initial execution idempotency key:

```js
const retryResponse = await fetch("/api/admin/knowledge/backfill/retry", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    batchId: "d0fb3d76-488d-4aa4-a431-3d6f9a282433",
    planHash: "b6ebc48370fce5626c7c267c56ee918cf3788f54aaf4473af3c1546cdc289f28",
    idempotencyKey: crypto.randomUUID()
  })
});
const retryResult = await retryResponse.json();
console.log(retryResponse.status, retryResult);
```

The expected successful retry is `state: "completed"`, with the two items
settled as `unchanged`, `submitted: 0`/no new source version writes, and the
existing source document/version IDs populated on the backfill items. If the
response is not a bounded success, stop and preserve the response for review;
do not retry repeatedly.

## D1 verification queries

```sql
SELECT generation, authority_decision_id, snapshot_id, inventory_identity,
       actor, snapshot_created_at, authorised_at
FROM knowledge_source_backfill_current_inventory_authority;

SELECT id, snapshot_id, decision, actor, idempotency_key, correlation_id,
       created_at
FROM knowledge_source_backfill_inventory_authority
ORDER BY generation;

SELECT id, json_extract(plan_json, '$.inventorySnapshotId') AS inventory_snapshot_id,
       inventory_identity, state, plan_hash, approved_by, approved_at, executed_at
FROM knowledge_source_backfill_batches
ORDER BY created_at DESC;

SELECT batch_id, inventory_record_id, outcome, reason_code, retry_count,
       source_document_id, source_document_version_id
FROM knowledge_source_backfill_items
WHERE batch_id = ?
ORDER BY inventory_record_id;

SELECT id, batch_id, state, started_at, completed_at, result_json
FROM knowledge_source_backfill_attempts
WHERE batch_id = ?
ORDER BY started_at;

SELECT item_id, outcome, reason_code, created_at
FROM knowledge_source_backfill_item_events
WHERE batch_id = ?
ORDER BY created_at;
```

Post-repair Preview verification returned one current authority generation and
the smoke batch above in `partial`, with one completed initial execution
attempt and two failed-retryable items retaining retry count `1`. KC-11C
therefore remains unchecked until the authenticated corrective retry and its
remote ledger outcomes are reviewed.
