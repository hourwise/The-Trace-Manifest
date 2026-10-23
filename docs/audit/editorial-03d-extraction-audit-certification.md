# EDITORIAL-03D — extraction audit UX certification

## Outcome

`AUDIT_UX_CERTIFIED_WITH_BROWSER_QA_UNAVAILABLE`

EDITORIAL-03D certifies and polishes the read-only audit presentation added by
EDITORIAL-03C. It does not add a migration, alter the ledger schema, change
extraction semantics, or mutate observed audit state.

## Lifecycle wording

The audit surface keeps the stored lifecycle as the source of truth and uses
distinct operator wording:

- `running`: “Running — Run did not record normal completion. It may have been interrupted.”
- `completed`: “Completed normally — all selected items reached a terminal outcome.”
- `completed_with_failures`: “Completed with failures — successful effects remain durable.”
- `failed`: “Failed — the runner did not complete normally; any recorded items and effects remain durable.”
- `interrupted`: “Interrupted — the interruption was recorded and no normal completion was recorded.”

A stale `running` row is never relabelled as failed or interrupted. A completed
run is not described as having found claims: it may contain only `no_claims`
items.

## Reconciliation

Run detail presents a prominent `Ledger reconciled`, `Ledger mismatch`, or
`Ledger reconciliation unavailable` state. Matching means the stored summary
equals counters derived from the returned durable item/effect rows. A mismatch
is displayed as an audit finding and is not repaired by the UI. If bounded
detail is truncated, reconciliation is explicitly uncertifiable and the
stored-versus-derived comparison remains available under a native disclosure.

The comparison uses the precise durable labels:

- Selected items
- Processed items
- No-claim items
- Failed items
- Extracted claim candidates
- New assertions
- Successful canonical writes

The legacy `evidenceCreated` field is not presented as “Evidence created”. It
remains an API compatibility field whose existing meaning is successful
canonical-writer calls, including reuse/no-op calls.

## Trigger, items, and effects

Manual runs are labelled `Manual` and show the recorded administrator/request
metadata when available. Scheduler runs are labelled `Scheduler` and show
`System scheduler`, never a fabricated human operator.

Run detail shows the full authoritative run UUID, a short ID in list summaries,
formatted started/completed timestamps, and the persisted selection ordinal.
Items remain in ordinal order and use the exact stored outcomes: `Extracted`,
`No claims`, `Failed`, and `Pending`. Failed items retain every effect already
recorded; a partial-success note makes durable successful effects visible.

Effects are labelled `Inserted`, `Reused`, or `Failed`, with bounded claim text,
canonical claim/assertion IDs, failure details, and optional technical
insertion flags under a nested disclosure. Reused effects are never called
created.

## Lazy loading and accessibility

The recent-run list loads only when its disclosure is opened. A run detail loads
only when that run is expanded, is cached for the current page session, and is
never polled or prefetched. The manual result link carries `auditRunId`; opening
it expands the recent-run disclosure and the matching run detail when the run
is within the bounded recent list.

The list remains limited to 50 runs. Detail remains limited to 50 items and
1,000 effects. Truncation is stated rather than hidden. Native `details` and
`summary` controls remain in use; loading/status text uses polite live regions,
errors use an alert role, and counter comparisons use captioned, scoped table
headers. The comparison is wrapped in horizontal overflow for narrow layouts.

No authenticated browser session was naturally available for this local
certification, so browser QA result is `AUTHENTICATED_BROWSER_QA_UNAVAILABLE`.
Authentication, Access, signed proxy, and Worker route tests remain unchanged.

## Known limitations and deferred work

- Pre-0075 runs have no ledger membership and are not reconstructed
  from pipeline stages or canonical timestamps.
- A process crash may leave a truthful stale `running` row because the UI does
  not invent an interruption or mutate lifecycle state.
- The audit surface has no Retry, recovery, stage-reset, resume, or counter-fix
  controls.
- The legacy `evidenceCreated` API field remains for compatibility.
- No deterministic real concurrent interleaving test was added in this UX-only
  certification.
- No migration 0076, extraction semantic change, scheduler change, deployment,
  remote D1 access, or high-risk evidence-governance work is included.
