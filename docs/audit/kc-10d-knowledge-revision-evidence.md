# KC-10D immutable knowledge revision evidence

**Status:** complete locally; publisher review required

KC-10D adds migration `0053`, `knowledge-revisions.ts`, and publisher-only `POST/PATCH /api/admin/knowledge/revisions` routes.

- An approved document cannot be overwritten through the Markdown ingest `overwrite=true` path; ingestion creates a draft revision instead.
- Draft revisions store a versioned proposed payload and immutable prior document context.
- `knowledge_revision_decisions` preserves the prior evidence status, source-set hash, latest linked claim score snapshots, proposal/rationale context, reviewer, decision, timestamp, and review note.
- Approval requires the current document to remain approved and applies the revision in one D1 batch; rejection changes only revision/decision state and leaves public text untouched.
- Same-origin and Cloudflare Access publisher checks protect both mutation routes; no client or model can self-approve a revision.

The stabilisation fixture proves draft creation is non-mutating, approval updates public fields and records the reviewer, rejection preserves the approved answer, and prior evidence context is retained. Migration validation applies 0053 twice.

Validation:

```text
npm.cmd test -- --run       # 119 ingestion tests + stabilisation suite passed
npm.cmd run typecheck       # 0 errors; 4 pre-existing hints
npm.cmd run test:migrations # additive migrations and compatibility checks passed
```
