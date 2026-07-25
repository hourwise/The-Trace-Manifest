# KC-08H — knowledge change review evidence

**Status:** Complete locally

**Scope:** Trigger an attributable publisher-review signal when evidence inherited by an approved knowledge page changes or becomes unsafe to rely on.

## Implementation

- Added migration 0049 indexes for the existing `knowledge_change_proposals` queue.
- Added `triggerKnowledgeReview` with detector version `kc-08h-v1`. Proposal IDs are deterministic and idempotent for each knowledge document, proposal type, and evidence event.
- Source capture, accepted claim matching/provenance/relationship reviews, conflict review, mapping of an already-approved page, and scheduled expiry now call the detector.
- The detector covers source-version changes, stale assertions, review/hard-expiry boundaries, unresolved conflicts, corrected claims, and superseded claims. It records the linked claim/assertion/source/conflict identifiers in `proposed_change_json` without rewriting approved prose.
- Ask TRACE excludes knowledge documents with an open proposal. Public pages remain visible with an evidence-review warning, and publishers can inspect the queue at `/admin/knowledge/changes`.

## Verification

- Stabilisation tests cover proposal creation, idempotency, conflict/correction/supersession/freshness kinds, and Ask TRACE exclusion while a proposal is open.
- `npm.cmd test -- --run` passed (119 ingestion tests plus stabilisation tests).
- `npm.cmd run typecheck` passed with the four existing hints.
- `npm.cmd run test:migrations` passed.

KC-09 remains responsible for hybrid retrieval, multi-position evidence grouping, and assertion-level answer citations.
