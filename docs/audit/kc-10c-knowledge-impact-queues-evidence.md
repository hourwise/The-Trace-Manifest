# KC-10C knowledge-impact queue evidence

**Status:** complete locally; publisher-only and read-only

KC-10C adds `loadKnowledgeImpactQueues` (`kc-10c-v1`) and the publisher-only `/admin/knowledge/impact-queues` view. Four bounded lanes are produced from D1:

- affected knowledge: open KC-10B impact proposals plus legacy KC-08H knowledge-change proposals;
- expiring knowledge: public approved/needs-review documents at review or hard-expiry boundaries;
- unresolved contradictions: unresolved or acknowledged claim-conflict cases; and
- orphan accepted claims: active/qualified claims with admitted accepted evidence but no story or knowledge mapping.

Each lane has stable ordering, a bounded limit, priority/detail fields, and re-checks current D1 state. Queue loading performs no writes, review decisions, publication, or automatic revision.

The stabilisation fixture proves all four lanes, hard-expiry priority, contradiction visibility, orphan filtering, and read-only behaviour. The migration and compatibility suite remains green.

Validation:

```text
npm.cmd test -- --run       # 119 ingestion tests + stabilisation suite passed
npm.cmd run typecheck       # Astro check began cleanly; prior run had 0 errors and 4 hints
npm.cmd run test:migrations # additive migrations and compatibility checks passed
```
