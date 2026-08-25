# KC-12 remediation and D1 efficiency evidence

**Status:** Implemented locally on `codex/kc-12-remediation-d1-efficiency`; ready for targeted external verification after final validation.

## Governed decision corrections

- Ask TRACE relationship and conflict reads are deduplicated and chunked at 32 claim IDs per query, with a bounded 128-claim ceiling. Any missing table, D1 query failure, or bounded overflow returns an `insufficient` / `insufficient_evidence` packet with no synthesis; it is never treated as an empty relationship set.
- Only `directness = 'direct'` receives direct-evidence credit. Missing, NULL, `unknown`, and malformed values do not.
- Strong evidence is read from the structured `evidenceQuality` field (`strong` or `very_strong`). `trustNotes` remains presentation text and is not parsed.
- `feed_claim_compatibility` remains a legacy metadata-only bridge. Ask TRACE no longer admits it as evidence; the normal extraction-state rule is required. Public evidence remains stricter: reviewed, admitted, current, non-PDF, locator-backed assertions with `extraction_state = 'extracted'` and a source chunk. No migration is required for this decision; later historical continuity work can migrate or retire the bridge.

## Public projection corrections

- `getPublicStoryEvidence` now applies the same canonical published-story gate as `getPublishedStoryBySlug`, including publication state/time, review, summary, evidence status, and a published feed member. Draft, unreviewed, future, and otherwise ineligible stories return no public claims.
- Assertions are ranked with `ROW_NUMBER() OVER (PARTITION BY canonical_claim_id ...)` and capped at four per claim. The bounded 24-claim projection therefore has a 96-row ceiling without a global first-rows starvation effect.
- Unknown relationship values render as `Related`; known directional labels retain their reviewed inverse. Relationship confidence remains internal ordering metadata and is not returned or rendered publicly.

## D1 ingestion reductions

- Duplicate feed handling loads the existing `feed_items` row once through `deduplicateURL` and passes that row through capture admission and candidate-link checks. The prior duplicate path performed a boolean URL lookup, a second URL lookup, and another URL lookup inside candidate linking; it now performs one canonical-row lookup plus the distinct candidate-membership check.
- `source_documents.last_seen_at` is inserted on first observation and refreshed at most once per six hours for repeated deliveries. Material admission/source/storage changes remain immediate. The refresh update is predicate-bounded and affects zero rows inside the window.
- Per-source in-memory counters are included in existing job/cron detail and structured completion logs: items inspected, new/duplicate items, captures queued, candidates linked/created, and source-document timestamp refreshes. No per-query D1 writes or analytics subsystem were added.
- `workers/ingestion/semantic-dedup.ts` was unreachable: no import, dynamic import, test import, package script, Worker dispatch, scheduled job, or generated reference was found. It was removed; `cross-source-match.ts` is the canonical bounded lexical matcher.

## Validation boundary

The final command results are recorded in the handoff for this branch. No Worker, Pages, Preview, production D1, R2, Queue, Vectorize, AI, inference, or backfill operation was performed.
