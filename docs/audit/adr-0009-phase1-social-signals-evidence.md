# ADR 0009 Phase 1 — Social Signal Intake Evidence

**Date:** 19 July 2026  
**Commit:** `2c8383e`  
**Preview Worker:** `7efbebe5` (`trace-manifest-ingestion-preview`)

## What was delivered

Phase 1 of ADR 0009: manual, governed social-signal intake (steps 1-3 of the ADR flow).

### Changes

| File | Change |
|---|---|
| `db/migration-0024-social-signals.sql` | `social_signals` table with full ADR data model |
| `workers/ingestion/index.ts` | `POST /admin/social-signals` (intake) + `GET /admin/social-signals` (list) |
| `src/pages/api/admin/[...path].ts` | `social-signals` added to READ and WRITE route sets |
| `src/pages/admin/social.astro` | Admin page: submission form + pending signals list |
| `src/pages/admin/index.astro` | "Social Signals" card on admin dashboard |

### Verification (Preview)

| Check | Result |
|---|---|
| Migration applied to Preview D1 | ✅ `social_signals` table exists |
| Preview Worker endpoint protected | ✅ 401 for unsigned requests |
| Astro type-check (84 files) | ✅ 0 errors, 0 warnings |
| Preview Worker deployed | ✅ `7efbebe5` |

### What the admin page does

1. **Submit**: Publisher selects platform, enters public URL, reason, optional author/notes → `POST /api/admin/social-signals`
2. **List**: "Load Signals" button → `GET /api/admin/social-signals` → shows all signals with platform badge, review status, evidence status
3. URL deduplication via `canonical_url_hash` UNIQUE constraint

### What is NOT yet delivered (future phases)

- Reviewer workflow (update evidence status, corroboration, notes)
- Linked material extraction and source candidate creation
- TRACE AI summary drafting
- Public social cards
- Approval/rejection workflow

These are deferred per the ADR's incremental delivery approach.

## Production deployment

Requires:
1. Run `migration-0024-social-signals.sql` on production D1
2. Deploy Worker to production
3. Pages deployment already triggered from `2c8383e` push
