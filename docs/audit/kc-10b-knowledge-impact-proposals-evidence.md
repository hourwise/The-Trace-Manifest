# KC-10B knowledge-impact proposal evidence

**Status:** complete locally; review-gated and idempotent

KC-10B adds migration `0052` and `createKnowledgeImpactProposals` in `src/lib/server/knowledge-impact-proposals.ts`.

- KC-10A eligibility is re-run before proposal creation; callers cannot submit arbitrary targets or bypass publication/evidence checks.
- Proposals support `support`, `qualification`, `contradiction`, `correction`, `supersession`, `timeline_addition`, `comparison_update`, and `review_only` impact types.
- Every proposal stores the matcher/proposal versions, accepted claim, target identity/state, bounded match signals, rationale, and optional triggering story.
- Stable SHA-256 IDs plus a uniqueness constraint make retries idempotent.
- Targets are never rewritten, published, approved, or automatically revised. All rows enter `proposed` state for publisher review.

The stabilisation fixture proves four eligible target classes produce four pending proposals, explicit impact types are retained, retry creates zero duplicates, and proposal state remains `proposed`. Migration validation applies 0052 twice and checks the new table.

Validation:

```text
npm.cmd test -- --run       # 119 ingestion tests + stabilisation suite passed
npm.cmd run typecheck       # 0 errors; 4 pre-existing hints
npm.cmd run test:migrations # additive migrations and compatibility checks passed
```

No production or Preview proposal rows were created by this local implementation.
