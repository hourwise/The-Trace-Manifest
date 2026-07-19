# ADR 0017 — Phase 5 Audit Evidence: Knowledge Builder & Question-Gap Queue

**Date:** 2026-07-19
**Status:** Phase 5, Iteration 1 — Gap Recording deployed
**Commit:** `c004325`

## Scope delivered

This iteration implements the first checkbox of Phase 5: *"Record unanswered or weakly answered questions in a gap queue."*

### What was built

1. **Migration-0016 applied** (`db/migration-0016-knowledge-builder-foundation.sql`)
   - `question_gaps` table — canonical question, failure reason, priority, disposition, request count
   - `question_gap_examples` table — sanitised example phrasings per gap
   - `knowledge_documents` table — structured knowledge entries with full lifecycle
   - `knowledge_document_revisions` table — version history
   - `knowledge_document_sources` table — source-to-claim provenance
   - `knowledge_document_relationships` table — links between docs, guides, stories
   - `knowledge_generation_jobs` table — research job state machine
   - Applied to both Preview (`trace-manifest-db-preview`) and Production (`trace-manifest-db`)

2. **Gap recording in Admin Ask TRACE** (`src/pages/api/admin/ask.ts`)
   - `recordQuestionGap()` function deduplicates by SHA-256 canonical hash (lowercased + trimmed question)
   - Records gap on two triggers:
     - Zero evidence matches → `knowledge_missing`
     - Non-answer from AI → `insufficient`
     - Low confidence (<40%) → `low_confidence`
   - Upserts: increments `request_count` on repeat questions
   - Best-effort: wrapped in try/catch so gap recording never fails the Ask TRACE request

3. **Question Gaps admin page** (`src/pages/admin/knowledge/gaps.astro`)
   - Server-rendered with direct D1 access (established pattern)
   - Publisher-only (Cloudflare Access)
   - Lists open gaps ordered by priority (urgent → high → normal), then most recent
   - Shows: canonical question, failure reason, priority badge, request count, last asked date
   - Empty state with guidance on how gaps appear

4. **Admin index card** (`src/pages/admin/index.astro`)
   - "Knowledge Builder" card linking to `/admin/knowledge/gaps`

### Architecture decisions

- **Server-rendered with direct D1**: Continues the pattern established in Phase 3/4. No API proxy layer for admin pages; Astro pages access D1 directly.
- **Canonical dedup by hash**: Uses SHA-256 of lowercased+trimmed question text. Semantic grouping (as specified in ADR 0017) is deferred to a later iteration.
- **Best-effort recording**: Gap recording failures are logged but never surface to the user. The Ask TRACE response is unaffected.
- **Migration applied to both environments**: The schema is purely additive (CREATE TABLE IF NOT EXISTS), safe to apply to production alongside active traffic.

### What was NOT built (deferred)

- Knowledge document drafting UI (tables exist, no UI)
- Research-and-generation state machine (table exists, no worker logic)
- Knowledge approval, review, expiry workflows
- Guide synchronisation
- Knowledge promotion into Ask TRACE retrieval corpus
- Semantic canonical question grouping (currently exact-match only)
- Editor disposition actions (hold, merge, reject, etc.)

### Deployment

- **Preview D1**: Migration applied 2026-07-19 ~18:50 UTC
- **Production D1**: Migration applied 2026-07-19 ~18:55 UTC (with explicit approval)
- **Pages Production**: Deployed automatically from `main` at commit `c004325`, deployment `a5935e9a` — Active

### Verification

- [x] TypeScript check passes (`npx astro check`)
- [x] Migration validation passes (`node scripts/validate-migrations.mjs`)
- [x] `/admin/knowledge/gaps` route exists and is Cloudflare Access-protected
- [x] Admin index shows Knowledge Builder card
- [x] Migration-0016 tables exist on both Preview and Production D1 (17 queries, 35 rows written each)

### Known limitations

1. Gap recording only triggers from Admin Ask TRACE, not from any future public Ask TRACE (which is still disabled).
2. Canonical grouping is exact-match only; semantically equivalent questions with different wording will create separate gaps.
3. No editor disposition actions are wired up yet — gaps are view-only.
4. The `failure_reason` mapping is basic: `knowledge_missing` for no evidence, `insufficient` for insufficient evidence, `low_confidence` for score <40.
