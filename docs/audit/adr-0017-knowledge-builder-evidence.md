# ADR 0017 — Phase 5 Audit Evidence: Knowledge Builder & Question-Gap Queue

**Date:** 2026-07-19
**Status:** Phase 5, Iterations 1-2 deployed
**Commits:** `c004325` (gaps), `d60a04e` (drag-drop docs)

## Scope delivered

### Iteration 1 — Gap Recording (`c004325`)
Implements checkbox 1: *"Record unanswered or weakly answered questions in a gap queue."*

### Iteration 2 — Drag-and-Drop Document Ingestion (`d60a04e`)
Implements checkbox 3: *"Draft knowledge documents with source links, version, owner, freshness, and review state."*

---

## Iteration 2: Knowledge Document Drag-and-Drop

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

---

## Iteration 2: Knowledge Document Drag-and-Drop

### What was built

1. **Template download endpoint** (`src/pages/api/admin/knowledge/template.ts`)
   - GET endpoint returns the canonical Markdown template with YAML frontmatter
   - `Content-Disposition: attachment` triggers browser download as `.md` file
   - Template includes all required sections per ADR 0017

2. **Document ingest endpoint** (`src/pages/api/admin/knowledge/ingest.ts`)
   - POST endpoint accepts raw Markdown text (sent by client-side `FileReader`)
   - **Minimal YAML frontmatter parser** — no external dependencies. Parses key-value pairs and list items (`-`) from between `---` delimiters. Handles quoted values, placeholders, and empty fields.
   - **Validation pipeline:**
     - `canonical_question` required (min 5 chars)
     - `section` must match an existing `editorial_sections.slug`
     - `knowledge_type` must be one of 11 valid types
     - `evidence_status` defaults to `unverified` if invalid
     - Topic slugs validated against `editorial_topics`
   - **Duplicate detection**: SHA-256 canonical hash check before insert (returns 409 with existing ID)
   - **Body parsing**: Extracts `## Direct answer` and `## Detailed explanation` sections from Markdown body into dedicated columns
   - All body sections stored in `document_json` for full preservation
   - Document ID generated as `knowledge-{slug}-{hash8}`
   - Sets `status = 'draft'`, `visibility = 'internal'`, `created_by = identity.email`

3. **Knowledge Builder main page** (`src/pages/admin/knowledge/index.astro`)
   - Server-rendered with direct D1, publisher-only
   - **Navigation tabs**: Documents (active) | Gaps (with count badge) | Admin
   - **Template download card**: One-click download of `.md` template
   - **Drag-and-drop zone**:
     - Visual feedback on dragover (border highlight, background change)
     - Accepts `.md` and `.markdown` files
     - Click-to-browse fallback via hidden `<input type="file">`
     - Client-side validation: checks for `---` frontmatter delimiter
     - Sends raw text to ingest API via `fetch()`
     - Success: green card with document ID, type, section — auto-reloads after 1.5s
     - Error: red card with API error message
   - **Recent documents table**: Last 20 documents across all statuses, showing question, type, status badge, evidence, section, created date
   - **Format reference**: Collapsible details section showing the exact accepted format

4. **Updated navigation**
   - Admin index: Knowledge Builder card now links to `/admin/knowledge` (main page)
   - Gaps page: breadcrumb updated to `← Knowledge Builder | Admin`

### Architecture decisions

- **Minimal YAML parser**: No external dependency. Regex-free approach using line-by-line parsing. Handles the controlled template format only — not a general-purpose YAML parser. This is intentional: the template defines the contract, and the parser validates adherence to it.
- **Frontmatter as contract**: The Markdown template is the API. Editors download it, fill it in with any tool, and drop it back. TRACE validates the frontmatter fields match the schema.
- **Draft-first**: All ingested documents start as `draft` with `visibility = 'internal'`. They cannot be retrieved by Ask TRACE until explicitly approved (approval UI deferred).
- **Duplicate prevention**: SHA-256 hash of canonical question prevents accidental duplicates. Returns 409 with the existing document ID so editors can find and update it.
- **No file upload**: The drag-and-drop reads the file client-side with `FileReader` and sends the text content. No multipart/form-data, no R2 storage. Keeps the architecture simple.

### What was NOT built (deferred)

- Document update/edit flow (ingest is create-only; 409 on duplicate)
- Approval workflow UI (approve as knowledge, publish as guide, etc.)
- Structured source link parsing from the Evidence section into `knowledge_document_sources`
- Version history population (table exists but not written to on create)
- Knowledge promotion into Ask TRACE retrieval corpus
- Guide synchronisation
- Research-and-generation state machine (table exists, no worker logic)

### Deployment

- **Pages Production**: Deployed automatically from `main` at commit `d60a04e`, deployment `4e94f3af` — Active
- No migration changes needed (tables already existed from iteration 1)

### Verification

- [x] TypeScript check passes (`npx astro check`) — 0 errors, 0 warnings
- [x] `/admin/knowledge` route exists and is Cloudflare Access-protected
- [x] `/api/admin/knowledge/template` returns downloadable `.md` file
- [x] `/api/admin/knowledge/ingest` accepts and validates Markdown with frontmatter
- [x] Admin index Knowledge Builder card points to `/admin/knowledge`
- [x] Gaps page has breadcrumb navigation to Knowledge Builder main page
- [x] Template download button present on main page
- [x] Drag-and-drop zone renders with visual feedback
