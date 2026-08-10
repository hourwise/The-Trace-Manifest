# KC-11C bounded source backfill evidence

Status: migration 0061 and its Preview Worker deployment checkpoint completed;
the two-pass authenticated normalized-content-v2 smoke completed, but only the
GitHub source passed normalized-identity reconciliation. Anthropic produced a
different normalized-content-v2 identity whose diagnostic difference was
isolated to normalized links. Privacy-safe component diagnostics are now
implemented behind additive migration 0060, and migrations 0060 and 0061 are
now applied only to Preview. The migration-0061 Worker checkpoint and the
two-pass v2 result are recorded below; KC-11C remains open. Production and
Pages are untouched, no completed batch may be reused, and KC-11D has not
begun.

## Migration 0061 and Preview Worker checkpoint

This checkpoint resumed from the exact branch `agent/kc-11c-bounded-source-backfill`
at HEAD `1d496dc38ec160eafe5932f1c035800759098c63` with a clean working tree.
Preview operator authentication succeeded.

- Preview D1: `trace-manifest-db-preview`
  (`f312f662-2252-4005-8103-1a40d546e16b`)
- Immediate PRE-0061 Time Travel bookmark:
  `00000081-00000000-000050c3-521c1940f4ad87612b6b7c7033d2ed6f`
- Migration 0061 applied once to the explicit Preview D1 database; no
  production or migration-directory application was performed.
- Migration result: 38 queries executed, 21,421 rows read, 1,498 rows
  written, and final execution bookmark
  `00000081-00000008-000050c3-c98284cee7e4d651fd81e56b5a6f2cc0`.
- Post-0061 integrity: v2 policy expressions are present for source versions,
  observations, backfill items, inventory snapshots, and inventory authority;
  all migration-0060 observation diagnostics remain; the authority view,
  immutability triggers, and expected indexes exist; observed counts are
  `source_document_versions=9`, `source_document_version_observations=8`,
  `knowledge_source_backfill_items=10`, `inventory_snapshots=1`, and
  `inventory_authority=1`; `PRAGMA quick_check` returned `ok`; and
  `PRAGMA foreign_key_check` returned no rows.
- POST-0061 Time Travel bookmark:
  `00000081-00000008-000050c3-c98284cee7e4d651fd81e56b5a6f2cc0`.
- Preview binding safety: the canonical dry run resolved only
  `trace-manifest-ingestion-preview`, `trace-manifest-db-preview`,
  `trace-manifest-raw-preview`, and
  `trace-manifest-knowledge-preview-bge-m3-v1`; public/editorial/scheduled
  AI flags were false; Preview cron triggers were empty; no Pages deployment
  was involved.
- Preview Worker deployment: `trace-manifest-ingestion-preview`, version
  `15c2ea21-b031-478d-ab5d-9f2e858cda0a`, started at
  `2026-08-10T08:19:01.0864339Z`, URL
  `https://trace-manifest-ingestion-preview.philgeran.workers.dev`.
- Health/preflight: the deployed Worker root returned HTTP 200 with
  `The Trace Manifest — Ingestion Worker`; the remote schema checks recognized
  migration-0060 diagnostics and the migration-0061/v2 policy, with no missing
  schema error. After deployment, `cron_runs` remained `0`, and no source
  version or observation rows were added.
- Explicit non-actions: no production Worker, D1, R2, Vectorize, or Pages
  action; no Pages deployment; no backfill plan, approval, smoke pass, source
  fetch, source job enqueue, R2 write, Vectorize write, or KC-11D work.

## Normalized-content-v2 two-pass smoke result

The fresh two-pass smoke used the generation-2 Preview authority without
regenerating inventory or appending another authority decision:

- Authority: generation `2`, snapshot
  `59d7da80-2716-4bba-a6cf-93d66f89b9a2`, policy `kc-11c-v2`, inventory
  identity
  `9cdf7eb3be7e0debc3702da8caee39b266f4fefe47f6cc66f8f3647d5a198dec`.
- PASS 1 batch: `7ea3bad5-7265-4e06-b6ec-934663a24561`; attempt:
  `bbdc1718-2e75-48ea-895d-684ee50d645d`.
- PASS 1 normalized v2 hashes: GitHub
  `f218f9c0b62eb22683ce1f28a6916f8918155deac0b89db132c2d1b3a2b5b809`;
  Anthropic
  `1853b967ef6055b1057524036e58b262915561e440c55714f7cbe882ba3c7e25`.
- PASS 2 batch: `d138e7b0-7c45-4a0e-97bd-7cf049a70d2a`; attempt:
  `3217457f-5e16-40df-a9d1-16b2c4de878a`; plan hash:
  `f37b8392e7d626c8810246ec7712147c98fe371f402370035f9dec84c53a2877`.
- PASS 2 normalized v2 hashes: GitHub unchanged at
  `f218f9c0b62eb22683ce1f28a6916f8918155deac0b89db132c2d1b3a2b5b809`;
  Anthropic changed to
  `80ee786f16e75bafd4b48b47c594b374026df601cc71c799226dd3b61b87abcd`.
- GitHub passed: its existing v2 version was reused and a second observation
  was added. Transport hash changed, but normalized identity and all measured
  diagnostics remained stable.
- Anthropic failed the v2 stability criterion: a new v2 version was created.
  Metadata, blocks, structure, counts, container, truncation, and policy were
  unchanged; only `normalized_links_hash` changed from
  `8355096a1b2821bd4ae7b239d55806dcabb16795ab81255944e250f464bd0262` to
  `326ed2f5b842b0f2313ded5478fbc325356e64e556905af6febe3a39e7d15dbc`.
- Count deltas from PASS 1 to PASS 2: source documents `+0`, source document
  versions `+1` (Anthropic), observations `+2`, batches `+1`, items `+2`, and
  attempts `+1`.
- POST-PASS-2 integrity: batch and attempt were terminal; `cron_runs` remained
  `0`; `knowledge_index_operations` remained `0`; `PRAGMA quick_check` was
  `ok`; and `PRAGMA foreign_key_check` returned no rows.
- POST-PASS-2 Time Travel bookmark:
  `0000008b-00000036-000050c3-e6d91eca4d8cb1a895b48bf0ceb3e6d1`.
- KC-11C remains open. The general bounded source backfill and a third smoke
  pass are not authorised. No normalization semantics were changed.

The initial PASS-2 dry run deterministically reproduced the PASS-1 plan hash,
as expected for an identical canonical plan. The later explicit
`newestFirst:false` field produced a distinct hash without changing the
effective selection. This was retained as procedural evidence only; future
runs must not manipulate semantically equivalent plan fields to force unique
plan hashes. Run distinctness should come from batch, approval, execution, and
idempotency identities while deterministic plan hashes may repeat.

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
  evaluation, knowledge Markdown checks, and the production build.
- Hash-semantics commit:
  `d010d8d258591d45d528c4b662c9d065785edd07`.
- Preview Worker: `trace-manifest-ingestion-preview`.
- Preview Worker version:
  `4452c10c-d619-432d-aeb9-0c3c8e5cad13`.
- Preview Worker URL:
  `https://trace-manifest-ingestion-preview.philgeran.workers.dev`.
- Preview D1: `trace-manifest-db-preview`.
- Preview R2: `trace-manifest-raw-preview`.
- Vectorize remained bound only to the Preview index. All public, editorial,
  and scheduled AI flags remained disabled.
- Preview cron triggers remained disabled by configuration.
- Migration 0059 pre-application recovery bookmark:
  `00000055-00000000-000050ba-37b1356fcdc5e0485218f3a7fc948e7a`.
- Migration 0059 post-application recovery bookmark:
  `00000056-00000006-000050ba-b3838886a3c8063377ce9f4ad70b647c`.
- Pages was unchanged for this deployment. Production D1, R2, Worker, Pages,
  Vectorize, flags, indexing, and backfill were untouched.
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

## Actual fresh two-pass smoke and diagnostic follow-up

The publisher completed the fresh smoke against Worker version
`4452c10c-d619-432d-aeb9-0c3c8e5cad13`. Pass 1 used batch
`fcccc69b-1974-4d53-a8ea-e1c6ee4a016a` and plan hash
`96db4d07088b90b47dabe49f2518a3ba792027777c4ab2cd7f8274d479a3e3e6`.
It completed in `initial` mode with `processed: 2`, `metadata_only: 2`,
`unchanged: 0`, no retryable or terminal failures, and `totalBytes: 521082`.
It established one `normalized_content_v1` version and one observation for
each selected source.

Pass 2 used batch `b46c744e-4eab-4fbe-9bef-0da96b0927a5` and plan hash
`fa0b559cb7adfb5dbbf59d94633d601d76348b6454f1112d61583f6a9ce2fb64`.
It completed in `initial` mode with `processed: 2`, `unchanged: 1`,
`metadata_only: 1`, no retryable or terminal failures, and
`totalBytes: 521082`. Neither batch was retried and neither may be rerun.

The GitHub source at
`https://github.com/modelcontextprotocol/typescript-sdk` fully passed. Both
passes produced normalized hash
`3aceb4be8440a2e828961459f87d004f007c8f0796fb0abd07d47ceee6e54013`.
Its transport hash changed, but its version ID remained the same; pass 2
settled `unchanged` with reason `normalized_content_hash_unchanged`. It has one
normalized version, two observations, and two distinct transport hashes in
addition to its two immutable legacy versions.

The Anthropic source at
`https://www.anthropic.com/news/model-context-protocol` did not pass identity
stability. Pass 1 at `2026-08-01T09:20:06.921Z` produced transport hash
`42fca0766c2567be23e57d5359d7645cbfcb7c9b3982feec35bc5e66ca4382dc`
and normalized hash
`c81af465df02f492798fe3c71334b5a808af7be86f592029bb885c14e40563a7`.
Pass 2 at `2026-08-01T09:25:26.577Z` produced transport hash
`753a66d2056def7e16f252cdf6ffc95cc65f7d943e97d65441d35dbffac5779d`
and normalized hash
`876ea848145a19bb35da63b339435ac21b1be41912901d489fd5206ded282bf7`.
The corresponding immutable normalized version IDs end in those normalized
hashes. Both retrievals were 127030 bytes and had title
`Introducing the Model Context Protocol`, null author, and null published
date. Anthropic therefore has two legacy and two normalized versions, each
normalized version with one observation. The visible fields do not explain
the change, and the historical observations do not contain enough information
to identify its component safely.

Migration 0060 adds nullable, per-observation component digests for canonical
metadata, blocks, links, and structure; block, link, and heading counts;
container and truncation state; and normalization policy version. Existing
observations remain null and are not inferred or rewritten. New observations
store only SHA-256 digests, counts, enums, and the policy identifier--never
page text, descriptions, link text, or hrefs. Runtime execution fails closed
before fetching or acquiring an attempt when any diagnostic column is absent.

Deterministic local fixtures show that `normalized_content_v1` is sensitive to
full link query strings, fragments, link order, and duplicate links, and that
the link component isolates those changes. They also separately isolate
metadata, block text/order, structure/count, container selection, and
truncation boundaries. This establishes link volatility as a plausible class,
but does not prove that it caused either historical Anthropic change. No link
normalization rule or identity policy was changed. Any future canonical-link
correction must use an explicit new semantics version after a diagnostic-
enabled Anthropic retrieval identifies the changed component.

Preview integrity checks passed after the smoke. No rollback, record deletion,
record rewrite, batch retry, production action, or Pages change occurred.
Migration 0060 must be reviewed and applied to Preview before a Worker built
from this implementation can be deployed. KC-11C stays open pending that
deployment and a future authenticated retrieval proving component-level and
normalized-identity stability.

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

### Forward-compatible design deployed to Preview

Migration 0059 adds explicit `transport_hash`,
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

Migration 0059 was applied only to Preview after local migration validation and
the complete CI suite passed. The pre- and post-application Time Travel
bookmarks and deployed Worker version are recorded above. The implementation
keeps `content_hash` as the exact transport hash for compatibility, adds
`transport_hash` explicitly, deduplicates new versions by the versioned
normalized hash, and appends every later transport observation without
mutating a version row. The unchanged backfill path goes through this
observation write before replaying the idempotent review trigger.

## Final fresh two-pass Preview smoke runbook

These commands are prepared but were not run for this deployment record. Run
them only in one browser-console session at the allowlisted Preview Pages
origin while authenticated through Cloudflare Access as a publisher. Pages
performs server-side signing. Never call the Worker directly and never reuse
completed batch `d0fb3d76-488d-4aa4-a431-3d6f9a282433`.

First define a response helper:

```js
async function kc11cJson(response, label) {
  const value = await response.json();
  console.log(label, response.status, value);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  return value;
}
```

Discover the same two reviewed inventory records without approving or fetching
anything. This dry-run may reproduce the historical plan hash and must not be
approved:

```js
const kc11cDiscoveryResponse = await fetch("/api/admin/knowledge/backfill/plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inventorySnapshotId: "df94ae62-92c7-408d-9ae8-13b5b8cae10f",
    selection: { category: "source_url", limit: 2, newestFirst: true }
  })
});
const kc11cDiscovery = await kc11cJson(kc11cDiscoveryResponse, "selection discovery");
const kc11cRecordIds = kc11cDiscovery.plan.selected.map((item) => String(item.id));
const kc11cExpectedUrls = kc11cDiscovery.plan.selected.map((item) => item.canonicalUrl).sort();
if (kc11cRecordIds.length !== 2 || new Set(kc11cRecordIds).size !== 2) {
  throw new Error("Expected exactly two distinct inventory records.");
}
console.log({ kc11cRecordIds, kc11cExpectedUrls, writes: kc11cDiscovery.writes, fetches: kc11cDiscovery.fetches });
```

Create pass 1 with an explicit record-ID selection. This produces a fresh plan
hash while retaining the same two source URLs:

```js
const kc11cPass1PlanResponse = await fetch("/api/admin/knowledge/backfill/plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inventorySnapshotId: "df94ae62-92c7-408d-9ae8-13b5b8cae10f",
    selection: { recordIds: kc11cRecordIds, limit: 2 }
  })
});
const kc11cPass1Plan = await kc11cJson(kc11cPass1PlanResponse, "pass 1 plan");
const kc11cPass1Urls = kc11cPass1Plan.plan.selected.map((item) => item.canonicalUrl).sort();
if (JSON.stringify(kc11cPass1Urls) !== JSON.stringify(kc11cExpectedUrls)) {
  throw new Error("Pass 1 did not resolve to the reviewed source pair.");
}
if (kc11cPass1Plan.plan.planHash === "b6ebc48370fce5626c7c267c56ee918cf3788f54aaf4473af3c1546cdc289f28") {
  throw new Error("Pass 1 unexpectedly reused the historical plan hash.");
}
console.log(kc11cPass1Plan.plan.planHash, kc11cPass1Plan.plan.selected);
```

After reviewing the complete returned plan, approve and execute pass 1:

```js
const kc11cPass1ApprovalKey = `kc11c-pass1-approve-${crypto.randomUUID()}`;
const kc11cPass1ApprovalResponse = await fetch("/api/admin/knowledge/backfill/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    plan: kc11cPass1Plan.plan,
    planHash: kc11cPass1Plan.plan.planHash,
    idempotencyKey: kc11cPass1ApprovalKey
  })
});
const kc11cPass1Approval = await kc11cJson(kc11cPass1ApprovalResponse, "pass 1 approval");
```

```js
const kc11cPass1ExecutionKey = `kc11c-pass1-execute-${crypto.randomUUID()}`;
const kc11cPass1ExecutionResponse = await fetch("/api/admin/knowledge/backfill/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    batchId: kc11cPass1Approval.batchId,
    planHash: kc11cPass1Plan.plan.planHash,
    idempotencyKey: kc11cPass1ExecutionKey
  })
});
const kc11cPass1Execution = await kc11cJson(kc11cPass1ExecutionResponse, "pass 1 execution");
console.log({
  batchId: kc11cPass1Approval.batchId,
  planHash: kc11cPass1Plan.plan.planHash,
  approvalKey: kc11cPass1ApprovalKey,
  executionKey: kc11cPass1ExecutionKey,
  result: kc11cPass1Execution
});
```

Stop before pass 2 unless D1 verification confirms that both pass-1 items link
to `normalized_content_v1` versions and the batch completed without a
retryable or terminal failure.

Create pass 2 over the same records with the record-ID order reversed. The
selected URLs must match pass 1 while the plan hash must differ:

```js
const kc11cPass2PlanResponse = await fetch("/api/admin/knowledge/backfill/plan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    inventorySnapshotId: "df94ae62-92c7-408d-9ae8-13b5b8cae10f",
    selection: { recordIds: [...kc11cRecordIds].reverse(), limit: 2 }
  })
});
const kc11cPass2Plan = await kc11cJson(kc11cPass2PlanResponse, "pass 2 plan");
const kc11cPass2Urls = kc11cPass2Plan.plan.selected.map((item) => item.canonicalUrl).sort();
if (JSON.stringify(kc11cPass2Urls) !== JSON.stringify(kc11cPass1Urls)) {
  throw new Error("Pass 2 did not resolve to the pass-1 source pair.");
}
if (kc11cPass2Plan.plan.planHash === kc11cPass1Plan.plan.planHash) {
  throw new Error("Pass 2 must have a distinct approved plan hash.");
}
console.log(kc11cPass2Plan.plan.planHash, kc11cPass2Plan.plan.selected);
```

After reviewing the complete second plan, approve and execute pass 2:

```js
const kc11cPass2ApprovalKey = `kc11c-pass2-approve-${crypto.randomUUID()}`;
const kc11cPass2ApprovalResponse = await fetch("/api/admin/knowledge/backfill/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    plan: kc11cPass2Plan.plan,
    planHash: kc11cPass2Plan.plan.planHash,
    idempotencyKey: kc11cPass2ApprovalKey
  })
});
const kc11cPass2Approval = await kc11cJson(kc11cPass2ApprovalResponse, "pass 2 approval");
```

```js
const kc11cPass2ExecutionKey = `kc11c-pass2-execute-${crypto.randomUUID()}`;
const kc11cPass2ExecutionResponse = await fetch("/api/admin/knowledge/backfill/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    batchId: kc11cPass2Approval.batchId,
    planHash: kc11cPass2Plan.plan.planHash,
    idempotencyKey: kc11cPass2ExecutionKey
  })
});
const kc11cPass2Execution = await kc11cJson(kc11cPass2ExecutionResponse, "pass 2 execution");
console.log({
  batchId: kc11cPass2Approval.batchId,
  planHash: kc11cPass2Plan.plan.planHash,
  approvalKey: kc11cPass2ApprovalKey,
  executionKey: kc11cPass2ExecutionKey,
  result: kc11cPass2Execution
});
```

Pass 2 is successful only if it completes with `processed: 2`, `unchanged: 2`,
no retryable or terminal failures, and the D1 checks below prove identical
normalized version IDs with no additional source-version rows. If either
transport hash did not change, its idempotent observation row may remain at
one; transport-only reconciliation requires `transport_changed = 1` and two
distinct observations for that source.

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

## Historical fresh-smoke D1 verification runbook

This runbook is retained to show how the completed two-pass evidence was
verified. It is not an instruction to create, approve, execute, or retry a
batch. The actual immutable IDs and outcomes are recorded above.

Before pass 1, record the immutable baseline. This is read-only and should show
two legacy source versions per document and no `normalized_content_v1` version:

```powershell
npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT source_document_id, COUNT(*) AS total_versions, SUM(CASE WHEN hash_semantics_version = 'legacy_raw_v1' THEN 1 ELSE 0 END) AS legacy_versions, SUM(CASE WHEN hash_semantics_version = 'normalized_content_v1' THEN 1 ELSE 0 END) AS normalized_versions FROM source_document_versions WHERE source_document_id IN ('source-f7fb7d70e0ff6a4e7a73f06ab6611f114f925c625fcbd6be38e12239d0145042','source-e283b9c34207eff8e62a1618cc1a5bc63348e8c9e67ea2af1dda80b41b6b3d9b') GROUP BY source_document_id ORDER BY source_document_id;"
```

After pass 1, copy the fresh `batchId` printed by the browser and run:

```powershell
$Pass1BatchId = "PASTE_FRESH_PASS_1_BATCH_ID"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT batch_id, inventory_record_id, outcome, reason_code, retry_count, source_document_id, source_document_version_id, content_hash, transport_hash, normalized_content_hash, hash_semantics_version FROM knowledge_source_backfill_items WHERE batch_id = '$Pass1BatchId' ORDER BY inventory_record_id;"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT version.id, version.source_document_id, version.content_hash, version.transport_hash, version.normalized_content_hash, version.hash_semantics_version, version.created_at FROM source_document_versions AS version JOIN knowledge_source_backfill_items AS item ON item.source_document_version_id = version.id WHERE item.batch_id = '$Pass1BatchId' ORDER BY version.source_document_id;"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT source_document_version_id, COUNT(*) AS observation_count, COUNT(DISTINCT transport_hash) AS distinct_transport_count, MIN(retrieved_at) AS first_observed_at, MAX(retrieved_at) AS last_observed_at FROM source_document_version_observations WHERE source_document_version_id IN (SELECT source_document_version_id FROM knowledge_source_backfill_items WHERE batch_id = '$Pass1BatchId') GROUP BY source_document_version_id ORDER BY source_document_version_id;"
```

Proceed to pass 2 only when both item rows are terminal successes linked to two
distinct versions whose `hash_semantics_version` is
`normalized_content_v1`, and each normalized version has one observation.

After pass 2, copy its fresh batch ID and run the final reconciliation proof:

```powershell
$Pass2BatchId = "PASTE_FRESH_PASS_2_BATCH_ID"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT id, plan_hash, state, approved_by, approved_at, executed_at FROM knowledge_source_backfill_batches WHERE id IN ('$Pass1BatchId','$Pass2BatchId') ORDER BY created_at; SELECT batch_id, state, started_at, completed_at, result_json FROM knowledge_source_backfill_attempts WHERE batch_id IN ('$Pass1BatchId','$Pass2BatchId') ORDER BY started_at;"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "WITH paired AS (SELECT first.inventory_record_id, first.source_document_id, first.source_document_version_id AS pass1_version_id, second.source_document_version_id AS pass2_version_id, first.transport_hash AS pass1_transport_hash, second.transport_hash AS pass2_transport_hash, first.normalized_content_hash AS pass1_normalized_hash, second.normalized_content_hash AS pass2_normalized_hash, second.outcome AS pass2_outcome FROM knowledge_source_backfill_items AS first JOIN knowledge_source_backfill_items AS second ON second.inventory_record_id = first.inventory_record_id WHERE first.batch_id = '$Pass1BatchId' AND second.batch_id = '$Pass2BatchId') SELECT *, pass1_version_id = pass2_version_id AS same_version, pass1_transport_hash <> pass2_transport_hash AS transport_changed, pass1_normalized_hash = pass2_normalized_hash AS normalized_unchanged FROM paired ORDER BY inventory_record_id;"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT source_document_id, COUNT(*) AS total_versions, SUM(CASE WHEN hash_semantics_version = 'legacy_raw_v1' THEN 1 ELSE 0 END) AS legacy_versions, SUM(CASE WHEN hash_semantics_version = 'normalized_content_v1' THEN 1 ELSE 0 END) AS normalized_versions FROM source_document_versions WHERE source_document_id IN (SELECT source_document_id FROM knowledge_source_backfill_items WHERE batch_id = '$Pass1BatchId') GROUP BY source_document_id ORDER BY source_document_id;"

npx wrangler d1 execute trace-manifest-db-preview --remote --command "SELECT source_document_version_id, COUNT(*) AS observation_count, COUNT(DISTINCT transport_hash) AS distinct_transport_count, MIN(retrieved_at) AS first_observed_at, MAX(retrieved_at) AS last_observed_at FROM source_document_version_observations WHERE source_document_version_id IN (SELECT source_document_version_id FROM knowledge_source_backfill_items WHERE batch_id = '$Pass1BatchId') GROUP BY source_document_version_id ORDER BY source_document_version_id; PRAGMA quick_check; PRAGMA foreign_key_check;"
```

The intended gate required both pass-2 items to be `unchanged`. GitHub met that
gate; Anthropic did not, so the operator stopped without retrying either fresh
batch. The component-diagnostic correction above is the follow-up.

## General D1 verification queries

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

Historical post-repair verification initially found the prior smoke batch in
`partial`; the authenticated human recovery retry later completed it with the
outcomes recorded above. It and both fresh batches are immutable historical
evidence and must not be reused. KC-11C remains unchecked pending migration
0060 review, Preview-only application and deployment, and a later component-
diagnostic stability proof.
