# EDITORIAL-03B — deterministic extraction audit finding

## Decision

`OUTCOME_B_SCHEMA_GAP_IDENTIFIED`

TRACE currently stores useful per-item extraction state, but it does not store
an extraction-run identity or the request's selected input set. The current
data can therefore support a bounded view of *current durable pipeline state*,
but not a truthful historical answer to “what did this extraction request do?”
or an exact reconciliation of the request counters after the response has
ended. This mission deliberately adds no route, UI, migration, or persistence
model that could imply otherwise.

## Existing execution model

The deterministic path is:

```text
eligible feed_item + source metadata
  -> runClaimExtraction (transient counters)
  -> extractClaimsFromItem (pure rule-based extraction)
  -> writeCanonicalClaim (canonical graph writes)
  -> pipeline_stages(stage = 'claim_extracted')
  -> transient admin response / scheduler log
```

The runner selects at most 50 recent eligible `feed_items` joined to
`sources`, requiring `ingestion_status` in `clustered`, `classified`, or
`published`, no existing `pipeline_stages` row for `claim_extracted`, and a
non-null `summary` or `content_excerpt`. Results are ordered by
`feed_items.fetched_at DESC`.

For an item with no extracted claims, the runner writes a completed
`pipeline_stages` row with a no-claims summary. For an item with claims,
`writeCanonicalClaim` can write `source_documents`,
`source_document_versions`, `canonical_claims`, `claim_assertions`, and
optionally `story_claims`. The runner then writes a completed stage summary,
unless a claim write failed. A failed claim write produces a stage with
`status = 'failed'` and the failure text in `result_summary`; the runner's
failure call does not populate `error_message`.

The canonical graph has no relational `feed_item_id` on
`canonical_claims` or `claim_assertions`. The deterministic IDs encode the
feed-item ID, but that is an implementation convention rather than a durable
run/effect relationship. The legacy `claim_evidence` table is frozen and the
canonical writer does not insert into it.

The scheduler caller logs the runner result to Worker logs. The EDITORIAL-03A
manual route returns the same three runner fields. Neither caller persists the
returned counters or a run ID. `admin_audit_log` records the signed admin
request and its outcome, but does not record the returned counters, selected
items, or canonical effect IDs. `knowledge_extraction_runs` is a separate
source-document/knowledge extraction model and is not a record of this feed
item claim-extraction runner.

## Durable facts and limitations

Durably available after a request:

- the input item, source, timestamps, ingestion status, and content fields;
- whether a `claim_extracted` pipeline row exists for an item;
- that row's `algorithm_version`, `status`, `started_at`, `completed_at`,
  `created_at`, `result_summary`, and `error_message`;
- current canonical claims, assertions, source-document versions, and story
  mappings that remain in the graph;
- the existence and outcome of the signed manual admin request in
  `admin_audit_log`.

Not durably reconstructable as a request-level fact:

- which exact items were selected by one run;
- a run ID or correlation between one request and its stage rows;
- the exact `processed` count returned by that request;
- the exact number of newly inserted claims returned by that request when
  pre-existing canonical rows or concurrent activity are possible;
- the exact `evidenceCreated` count; the counter increments after every
  successful `writeCanonicalClaim`, including an existing-assertion no-op,
  while no `claim_evidence` row is written;
- skipped/already-processed counts, per-request failure counts, and the
  sequence of effects in a partial failure.

## Counter reconciliation matrix

| Field | Meaning in the current response | Durable source | Classification |
| --- | --- | --- | --- |
| `processed` | Items selected and handled by this invocation, including no-claim and failed items | `pipeline_stages` can show current per-item outcomes, but has no run boundary or request ID | `PARTIALLY_RECONCILABLE` |
| `claimsExtracted` | Successful canonical assertion insertions (`inserted: true`) in this invocation | Current `canonical_claims`/`claim_assertions` and deterministic IDs show some effects, but no run snapshot distinguishes new effects from existing/concurrent rows | `PARTIALLY_RECONCILABLE` |
| `evidenceCreated` | Successful canonical-writer calls, including assertion no-ops; despite its name, not durable `claim_evidence` creation | No equivalent durable counter; `claim_evidence` is not written by this path | `TRANSIENT_ONLY` |

The progress callback is also transient and is not part of the response or a
durable audit record.

## Failure and idempotency semantics

The presence of a `claim_extracted` row allows an operator to distinguish a
currently completed, failed, or skipped stage from an item with no recorded
stage. It does not distinguish all of “never attempted” from “eligible but
not selected by this particular bounded run”, because the selection itself is
not persisted. A failed stage is excluded by the same `LEFT JOIN ... ps.id IS
NULL` selection on later runs, so current behavior is safe no-op/idempotent
with respect to the existing stage marker, not a retry workflow.

A partial canonical write can leave graph rows while the pipeline stage is
failed. The existing tables can expose that combination, but cannot prove the
exact number or order of claim effects from the failed request. No failure
record is inferred where one was not written.

## Diagnostic mode

The EDITORIAL-03A diagnostic mode remains a bounded pure preview: it reads a
small sample of eligible feed items and calls `extractClaimsFromItem`. It does
not call `runClaimExtraction`, `writeCanonicalClaim`, or pipeline-stage
recording, and it creates no canonical claims, assertions, evidence, or audit
mutation. Its output must not be described as extraction history.

## Why no read surface was added

A list of `pipeline_stages` rows could be implemented as a current durable
state report, but without a run boundary it could not reconcile the last
manual POST or distinguish its counters from another manual or scheduled
invocation. Adding that list under an “extraction audit” label would invite an
operator to overread partial facts as a request ledger. EDITORIAL-03B therefore
adds characterization coverage and this finding only. Review Queue loading is
unchanged: extraction state is not preloaded, polled, or joined into cluster
selection.

## Smallest future persistence addition

If request-level extraction audit becomes a requirement, the smallest safe
addition is a durable run ledger with a unique run ID, invocation source,
bounded limit, start/end/status, and returned counters, plus per-run item
outcomes linking that run ID to each selected `feed_item_id` and recording
processed/no-claim/inserted/no-op/failed outcome and canonical effect IDs.
That addition would need an explicit future migration and design review; it is
not part of EDITORIAL-03B.
