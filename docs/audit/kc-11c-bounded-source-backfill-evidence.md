# KC-11C bounded source backfill evidence

Status: final integrity corrections are implemented and verified locally on
`agent/kc-11c-bounded-source-backfill`. KC-11C remains unchecked and
smoke-gated. The authenticated Preview retry completed, and exposed a second
raw-transport identity defect now covered by the additive migration 0059
design. Migration 0059 has not been applied and no new Preview deployment or
batch execution was performed in this work unit. No production resource was
modified, and KC-11D has not begun.

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

- Full `npm run ci` passed for this correction, including diff checks, Astro and
  Worker typechecking, 119 ingestion tests, stabilisation tests,
  additive/legacy migration validation, security checks, evidence policy
  evaluation, knowledge Markdown checks, and the production build. The code is
  intentionally not deployed before migration 0059 is applied to Preview.
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
Preview Worker deployment is recorded below. The authenticated retry was later
completed by the human operator; its result and the newly exposed hash defect
are recorded below.

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
recorded above. The corrective retry was subsequently completed by the human
operator and did not create terminal failures.

## Live retry result and hash-semantics investigation

The authenticated retry completed batch
`d0fb3d76-488d-4aa4-a431-3d6f9a282433` with attempt
`8c159641-5502-4579-8df5-781e1d2199cf`, idempotency key
`84198eca-e7e1-4cb4-8768-013a54fc6d65`, mode `retry`, state `completed`,
`processed: 2`, `metadata_only: 2`, `failed_retryable: 0`,
`failed_terminal: 0`, and `totalBytes: 521082`. Each item chronology was
`planned → failed_retryable → metadata_only`; retry count stayed at `1` and
the reconciled source IDs were retained. This was not an existing-identical-
version path: each URL received a second source version.

The GitHub body remained 394052 bytes with the same title, but its raw hash
changed from
`bc184ab75abebc8315cbde8c2b567b2d758b08a7f0ee758207841099a471926e` to
`606ed7e3643ff9c8cdeca781381a01a79bc32158ed54f70c1479663f588079a4`.
The Anthropic body remained 127030 bytes while its raw hash changed from
`992908daa70e5b54066061fd8243515304cf169184b7e8e9d435505c24a3ad9b` to
`ba8344b27d5a3207c28e28ec72c53de972d378354f75a554f4802f21af87646f`.
These observations expose transport-level HTML volatility rather than a
proven substantive evidence change.

The exact second versions were:

- GitHub retry version
  `source-version-f7fb7d70e0ff6a4e7a73f06ab6611f114f925c625fcbd6be38e12239d0145042-606ed7e3643ff9c8cdeca781381a01a79bc32158ed54f70c1479663f588079a4`;
- Anthropic retry version
  `source-version-e283b9c34207eff8e62a1618cc1a5bc63348e8c9e67ea2af1dda80b41b6b3d9b-ba8344b27d5a3207c28e28ec72c53de972d378354f75a554f4802f21af87646f`.

The final retry response therefore truthfully had `metadata_only: 2`,
`unchanged: 0`, `failed_retryable: 0`, and `failed_terminal: 0`. Those four
Preview source versions are immutable audit evidence and are not rewritten by
this correction.

For unambiguous audit text, each item chronology was `planned ->
failed_retryable -> metadata_only`.

### Current hash dependency map

Before this correction, `source_document_versions.content_hash` is the
SHA-256 of the complete retrieved body. It is simultaneously used as the
source-version ID suffix, the `(source_document_id, content_hash)` uniqueness
key, R2 object path/custom metadata and `knowledge_index_operations` desired
hash, exact-content provenance grouping input, backfill retry comparison, and
the source hash passed to deterministic extraction metadata. The embedding
tables use a separate normalized text hash and are not the source-version
identity. `canonical-claim-write.ts` also has a separate synthetic feed hash;
it is not interchangeable with source capture hashes.

The extraction representation already retains deterministic title, author,
published date, description, ordered blocks (including preformatted text),
and normalized main text. It currently drops anchor destinations, so the
identity correction must add stable extracted links. Retrieval timestamps,
request IDs, nonces, analytics/script hydration, and other transport shell
fields are not evidence identity. ETag and Last-Modified are useful metadata
only and must never be the sole identity.

### Forward-compatible design (not yet applied to Preview)

Migration 0059 will add explicit `transport_hash`,
`normalized_content_hash`, and `hash_semantics_version` fields to source
versions and backfill items, plus an append-only transport-observation table
for later fetches that match an existing normalized version. Existing rows,
IDs, and legacy raw `content_hash` values remain untouched; new rows retain
the raw hash in `content_hash` for R2/reconciliation compatibility while
storing the versioned normalized identity separately. Legacy rows are marked
`legacy_raw_v1` with no inferred normalized hash. A partial unique index will
deduplicate only rows with a populated normalized hash.

The normalized policy will be explicit and media-specific: HTML hashes stable
metadata, ordered evidence-bearing extracted blocks, stable links, media kind,
and the normalization version; Markdown/text preserve meaningful code,
numbers, quotations and links while normalizing line endings and non-evidence
whitespace; JSON uses deterministic key ordering; PDF uses a separate bounded
text policy. Extraction/normalization version changes produce a new identity
policy rather than silently aliasing old rows. This migration is additive and
will not rewrite the four smoke-test versions.

No Preview migration or deployment is authorized in this work unit. Local
migration validation and the complete CI suite must pass first; the eventual
human Preview repair must use the exact backup and application commands in the
follow-up deployment record. The implementation keeps `content_hash` as the
exact transport hash for compatibility, adds `transport_hash` explicitly,
deduplicates new versions by the versioned normalized hash, and appends every
later transport observation without mutating a version row. The unchanged
backfill path now goes through this observation write before replaying the
idempotent review trigger.

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

## Historical authenticated corrective retry command

The human operator used the following once from the browser console at the
allowlisted Preview origin while authenticated through Cloudflare Access as a
publisher. It is recorded for provenance only and must not be run again:

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

The actual response was `state: "completed"`, `processed: 2`,
`metadata_only: 2`, `unchanged: 0`, `failed_retryable: 0`,
`failed_terminal: 0`, and `totalBytes: 521082`. It created a second raw-hash
version for each URL because the pre-0059 implementation treated transport
hash as version identity. Do not retry this batch again.

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
