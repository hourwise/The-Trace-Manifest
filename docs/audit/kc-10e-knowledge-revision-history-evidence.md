# KC-10E immutable revision-history evidence

**Status:** complete locally; append-only audit history

KC-10E adds migration `0054` and extends the KC-10D revision service with bounded history retrieval.

- Every proposed revision snapshots the complete prior evidence set: knowledge claim links, assertion links, and document-level source links.
- Prior document JSON, source-set hash, evidence status, latest claim-score snapshots, rationale, proposal ID, reviewer decision, reviewer identity, timestamp, and note remain addressable through the revision history endpoint.
- Finalized revisions and decisions are protected by SQLite triggers against update/delete; evidence snapshots are append-only as well.
- `GET /api/admin/knowledge/revisions?documentId=...` is publisher-only and returns bounded immutable history; it cannot mutate content.

Tests prove evidence-link snapshots survive approval, history returns the prior version and reviewer decision, finalized rows reject tampering, and rejected revisions leave the approved document unchanged. Migration validation applies 0054 twice.

Validation:

```text
npm.cmd test -- --run       # 119 ingestion tests + stabilisation suite passed
npm.cmd run typecheck       # 0 errors; 4 pre-existing hints
npm.cmd run test:migrations # additive migrations and compatibility checks passed
```
