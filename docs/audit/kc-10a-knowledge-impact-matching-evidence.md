# KC-10A knowledge-impact matching evidence

**Status:** complete locally; read-only and review-safe

KC-10A adds `matchKnowledgeImpacts` in `src/lib/server/knowledge-impact-matching.ts`. Given bounded canonical-claim IDs, it:

- accepts only active/qualified claims with an admitted source, captured/extracted version, and an accepted/amended current or unknown assertion;
- loads only approved public knowledge documents, published public Guides, published model profiles, and published stories;
- excludes hard-expired knowledge and knowledge with an open change proposal, and excludes draft, withdrawn, outdated, or superseded targets;
- ranks lexical/entity/value/date overlap with the versioned deterministic algorithm `kc-10a-v1`, with stable tie-breaking and bounded results; and
- performs no D1 writes, proposal creation, revision, embedding, or publication.

The stabilisation suite fixture creates one accepted Orion claim and eligible records in all four target classes. It proves the clean approved document, Guide, model profile, and earlier story are returned; an approved document with an open proposal and all draft/unpublished targets are excluded; missing claim IDs are reported as ignored; and the proposal row count is unchanged.

Validation:

```text
npm.cmd test -- --run       # 119 ingestion tests + stabilisation suite passed
npm.cmd run typecheck       # 0 errors; 4 pre-existing hints
```

No production or Preview data was mutated by KC-10A.
