# KC-11D+ historical continuity implementation evidence

Status: implementation checkpoint on `codex/kc-11d-historical-continuity`.
This document records the bounded machinery added in this batch; it does not
claim that a Preview or production historical run has occurred.

## KC mapping

- KC-11C: the existing Preview-only source backfill ledger now has a bounded
  continuation result and can opt an explicitly approved item into private
  full-text capture. It remains gated on the separately required Preview
  smoke run and remote ledger verification.
- KC-11D: deterministic historical extraction is wired to the canonical source
  version, chunk, extraction-run, proposed assertion, canonical-claim, and
  match-candidate records. Exact shared-content provenance proposals are also
  generated through the existing review queue.
- KC-11E: material unresolved historical cases can settle as
  `held_for_review`, including weak content after a redirect, and all
  extraction/assertion outputs remain proposed or pending. Publisher review
  surfaces are reused; this batch does not claim completion of the review
  corpus.
- KC-11F: the machinery preserves canonical story/knowledge linkage context
  and creates the existing provenance and knowledge-impact proposal inputs,
  but it does not silently attach historical claims to published stories or
  approved knowledge. Full reviewed linking remains a subsequent execution
  and review stage.
- KC-11G/11H: not completed by this implementation checkpoint. Score snapshots
  and approved-record re-index/evaluation still require bounded reviewed
  execution.

## Bounded historical flow

An approved KC-11A inventory and exact plan hash still establish the immutable
batch. Each item is selected in deterministic ID order, acquired under the
existing source retrieval policy, and captured through `source_documents` and
`source_document_versions`. HTML, Markdown, and plain text can be explicitly
approved for `private_full_text` or `editor_supplied_document` storage; the
default remains `metadata_only`.

For extractable private content, the existing deterministic extraction module
creates locator-backed chunks, proposed source extractions, proposed canonical
claims/assertions, deterministic match candidates, and a zero-cost extraction
run/summary. Assertions remain pending/proposed and therefore cannot become
Ask TRACE or public evidence without the normal review/admission/provenance
gates. Exact shared-content observations create review-gated provenance-group
proposals only.

Redirected historical content is represented by the existing retrieved URL and
observation fields. A redirect that yields metadata-only or very short content
settles as `held_for_review` with `historical_source_drift_unresolved`; the
original body is never fabricated. A retrieved PDF is passed only to the
opaque private PDF capture path and never to structured extraction.

## Replay and operational bounds

The existing content-addressed source/version identity, exact plan hash,
execution lease, item idempotency key, retry limit, stale-run recovery, and
terminal outcomes remain authoritative. The execution query is capped at 25
items, with 1 concurrent retrieval path, 512 KiB per item, 5 MiB per run,
30-second elapsed execution, three redirects, and two retries. Historical
structured work is capped at 200 extracted blocks, 100 candidate outputs per
record, and 10 provenance groups per record. The result reports processed,
remaining, `hasMore`, and the next item ID.

## Operational consumers

The morning Worker schedule now invokes the existing reconciliation primitive
with a 20-operation ceiling. Pending, failed, `reconciliation_required`, and
stale running operations are claimed deterministically; Vectorize deletions
with a receipt may be polled immediately, while other running operations are
age-gated. D1 remains canonical truth, and R2/Vectorize state is confirmed
through the existing receipt/outbox records. `reconciliation_required` now has
an operational consumer and remains visible in the existing admin recovery
surface.

Stale evidence recalculation now selects at most 25 canonical claims by
deterministic ID order per scheduled invocation (with a hard maximum of 100),
marks successfully processed stale assertions, and supports a claim-ID cursor.
Migration 0066 adds the additive `(freshness_state, expiry_recalculated_at,
canonical_claim_id, id)` index and clears the marker when an assertion newly
transitions into `stale`.

Cross-source matching now processes at most 50 driver items per invocation and
at most 300 deterministic candidates per driver. Its cursor is ordered by
`fetched_at, id`; similarity still creates candidate metadata only and never
creates reviewed/public story relationships.

## Legacy evidence quality decision

Local migration/history review found `claims.evidence_quality` was legacy
ingestion metadata carried through the KC-05G compatibility cutover. The
current repository does not prove that those historical values passed the
canonical reviewed assertion/provenance lifecycle. Ask TRACE therefore no
longer reads that column.

Ask TRACE derives a qualitative label from current canonical assertion fields:
an accepted, admitted, current, direct, factual-support evidence assertion
with a reviewed provenance group may be `strong`; known-directness reviewed
supporting assertions may be `moderate`; otherwise the result is `unrated` or
`disputed` from canonical claim state. No opaque legacy value can upgrade a
conclusion.

## Observability

Historical execution aggregates records considered/admitted, unchanged and
changed versions, extraction outputs, claims, match candidates, provenance
proposals, review holds, story/knowledge references, retries, and outstanding
reconciliation operations in the existing batch result. Worker expiry,
cross-source, and reconciliation summaries are emitted as one structured log
per stage. No metric event creates a D1 write, and no production or Preview
backfill was run for this checkpoint.

## Local verification boundary

Focused coverage proves historical private-text replay/idempotency, proposed
extraction, opaque PDF containment, deterministic cross-source continuation,
stale-evidence continuation/requeue, legacy evidence-quality fail-closed
behavior, and existing KC-11C/reconciliation behavior. The required Preview
smoke, remote ledger checks, approved review decisions, score snapshots, and
re-index/evaluation remain external execution gates.
