# EDITORIAL-03C — durable extraction run ledger

## Decision

`EXTRACTION_AUDIT_DURABLE_AND_UI_READY`

EDITORIAL-03C adds the smallest additive persistence model needed to make the
deterministic feed-claim extraction runner auditable by invocation. It does not
change extraction rules, selection predicates, canonical identifiers, evidence
policy, scheduler leases, or retry behavior.

## Schema

Migration `0075` adds three append-only audit tables:

- `claim_extraction_runs` is the run identity and mutable lifecycle summary.
  Its UUID is generated before selection. It records `manual_admin` or
  `scheduler`, `rule-extraction-v1`, safe manual request metadata when present,
  timestamps, lifecycle status, and reconciled counters.
- `claim_extraction_run_items` stores the exact selected `feed_item_id` set and
  zero-based selection ordinal before any canonical processing begins. It keeps
  the final item outcome, pipeline-stage identity when available, item counters,
  and a bounded failure code/message.
- `claim_extraction_run_effects` stores one deterministic claim attempt per
  selected item and claim ordinal. It records the canonical identifiers returned
  by the writer and insertion/no-op flags that the writer authoritatively knows.

Identity fields have immutable update/delete triggers. Run lifecycle and summary
counters are updated while the runner is active. No application edit/delete
route exists for ledger facts.

The migration adds only the indexes required by the bounded recent-run list and
run/item/effect detail reads. It is local-only in this candidate and has not
been applied to Preview or Production.

## Selection and lifecycle

The selection query is unchanged: `feed_items` joined to `sources`, ingestion
status `clustered`, `classified`, or `published`, no existing
`pipeline_stages.stage = 'claim_extracted'`, `fetched_at` within seven days,
non-null summary or content excerpt, newest `fetched_at` first, and `LIMIT 50`.

The runner creates a UUID run row, executes that query, and persists every
selected item with its ordinal before calling the pure extractor or canonical
writer. The two callers use the same runner: the manual signed admin route uses
`manual_admin`; the scheduled pipeline passes `scheduler`.

Statuses are:

- `running`: selection and/or item processing is still in progress;
- `completed`: all selected items reached a terminal non-failure outcome;
- `completed_with_failures`: at least one selected item failed, even if other
  items and effects succeeded;
- `failed`: the runner caught a run-level failure before normal finalization;
- `interrupted`: reserved for an explicitly recorded interruption; a process
  crash cannot reliably update D1, so a stale `running` row remains honest and
  is displayed as not having recorded normal completion.

The existing `claim_extracted` stage remains the pipeline/idempotency marker.
In particular, a failed stage still prevents ordinary future selection; 03C
does not add retries, stage reset, or recovery behavior.

## Outcomes and effect attribution

Run-item outcomes are:

- `pending`: selected and durably recorded, but not terminal yet;
- `extracted`: one or more claim candidates were produced and every writer call
  completed successfully;
- `no_claims`: the deterministic extractor completed with zero candidates;
- `failed`: extraction or at least one canonical writer call failed.

An effect is `inserted` only when `writeCanonicalClaim` returns
`inserted: true`; it is `reused` when the writer returns the existing assertion
path; and it is `failed` when the writer throws for that claim candidate. The
ledger records canonical claim/assertion/source document identifiers and the
writer's insertion flags. It does not infer creation from timestamps and does
not claim to attribute fields that the writer cannot prove.

If an earlier effect succeeds and a later claim write fails, the earlier effect
remains attributed to the run and the item is `failed`. The run therefore
exposes partial canonical effects without deleting them to make counters look
clean.

Overlapping runs may both persist the same selected feed item. Each run records
its own writer result: one may contain `inserted`, another `reused`. No global
lock or new idempotency subsystem is introduced.

## Reconciled counters

Counters are recalculated from ledger rows, not from in-memory increments:

| Counter | Definition |
| --- | --- |
| `selected_count` | Number of persisted run-item rows |
| `processed_count` | Run-item rows whose outcome is not `pending` |
| `no_claim_count` | Run-item rows with outcome `no_claims` |
| `failed_count` | Run-item rows with outcome `failed` |
| `extracted_claim_count` | Sum of each run item's deterministic candidate count |
| `new_assertion_count` | Effect rows with `assertion_inserted = 1` |
| `canonical_write_success_count` | Effect rows with outcome `inserted` or `reused` |

The read helper independently derives the same values from bounded run detail
rows and reports whether they match the stored run summary. Current extraction
limits (50 selected items and at most 20 candidates per item) keep normal detail
within 50 items and 1,000 effects; truncation flags are still exposed.

The legacy response fields remain for compatibility:

- `processed` maps to the durable terminal-item count;
- `claimsExtracted` maps to newly inserted assertions;
- `evidenceCreated` remains the legacy count of successful canonical-writer
  calls, including assertion reuse. It is not a `claim_evidence` row count and
  is not renamed silently.

## Attribution and security

Manual runs store a separate generated request UUID plus the authenticated
operator email and role. The signed HMAC nonce remains only replay-protection
and admin-audit metadata; it is not copied into the ledger. Scheduler runs have
trigger `scheduler` and no fabricated human identity.

`GET /api/admin/extraction-runs` and
`GET /api/admin/extraction-run?runId=...` use the existing Astro signed admin
proxy and Worker route allowlist. Authenticated readers and publishers may read;
only publishers may execute extraction. The browser never accesses D1 directly.
The list is limited to 50 recent runs and detail is limited to 50 items and
1,000 effects, with deterministic ordering and explicit truncation fields.

## UI and known limits

`/admin/extract-claims` keeps the pure diagnostic preview separate from durable
execution. The new Recent extraction runs disclosure loads the list only when
opened and loads one run detail only when that run is expanded. It does not
poll, preload on Review Queue selection, or offer retry/reset controls. Manual
results link to the durable run ID and display the precise counters.

Runs created before 0075 have no run ledger history and cannot be reconstructed.
If D1 becomes unavailable after a run starts, finalization can remain
`running`; the UI reports that normal completion was not recorded rather than
inventing completion. The legacy pipeline stage still stores failure text in its
existing `result_summary` convention. Later canonical governance changes do not
rewrite extraction effects.
