# KNOW-01 — Knowledge Builder migration evidence

**Date:** 16 July 2026  
**Scope:** `KNOW-01` from the master build plan  
**Migration:** `db/migration-0016-knowledge-builder-foundation.sql`

## Added schema

The additive migration creates the private Knowledge Builder foundation:

- `question_gaps` and `question_gap_examples` for canonicalised, sanitised demand signals;
- `knowledge_documents` and `knowledge_document_revisions` for structured, versioned knowledge;
- `knowledge_document_sources` for source kind, role, admission, freshness, relationship, and independent-evidence weight;
- `knowledge_document_relationships` for future links to guides, stories, briefings, and question gaps; and
- `knowledge_generation_jobs` for the ADR 0017 lifecycle state machine.

Knowledge documents default to `status = 'draft'` and `visibility = 'internal'`. The database rejects an attempt to make a document `public_knowledge` or `public_guide` unless it is approved and has an approver identity and approval time. It also rejects recording any TRACE-originated record as independent evidence.

## Verification

- `npm run test:migrations` applies the full ordered migration chain in a clean SQLite database and checks the new tables and constraints.
- `npm test` passes, including the stabilisation suite with the complete migration chain.
- `npm run typecheck` completed without diagnostics.

## Explicitly not included

This task did **not** apply the migration to preview or production D1; create a TRACE Desk page; capture user questions; run research; invoke a model; approve knowledge; serve public knowledge or Guide pages; or change sitemap, robots, or crawler controls. Those are later bounded tasks under ADR 0016–0018.
