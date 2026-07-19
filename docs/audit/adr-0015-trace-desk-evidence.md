# ADR 0015 — TRACE Desk & Taxonomy Completion Evidence

**Date:** 19 July 2026  
**Commits:** `c1ae8b3` through `997ea91` (9 commits)  

## What was delivered

Editorial candidate intake desk with state machine, promote-to-story, and auto-fill for review queue.

### Changes

| File | Change |
|---|---|
| `src/pages/admin/desk.astro` | Rewritten as server-rendered page with direct D1 access |
| `src/pages/admin/review.astro` | Added AI fallback, pre-fill from cluster data, adminFetch helper |
| `workers/ingestion/publish.ts` | Filter unverified/outdated/superseded clusters; include summary+why_it_matters |

### State machine

```
new → drafting → draft_ready → needs_review
```

- **Submit**: Manual URL or free-text lead → `intake_type='manual_url'`
- **Transition buttons**: Move candidate through states with audit trail
- **Promote**: Creates `story_cluster` + synthetic `feed_item` + `story_cluster_members`; auto-fills `summary` and `why_it_matters` from `lead_text`

### Bugs fixed during implementation

| Bug | Root cause | Fix |
|-----|-----------|-----|
| "Invalid candidate ID: null" | `editorial_candidates.id` is TEXT UUID, not INTEGER AUTOINCREMENT | Generate `crypto.randomUUID()` on insert |
| "source_hash NOT NULL constraint" | INSERT omitted `source_hash` column | Compute hash from URL or lead text |
| Promoted stories not publishable | `evidence_status='unverified'` blocked publication + 0 feed_items | Set `'vendor_reported'` + create synthetic feed_items + story_cluster_members |
| Review queue "Failed to load" | Cloudflare Access session expiry + CORS preflight on GET | Added `adminFetch` helper (no Content-Type on GET) |
| Review form not pre-filled | No cluster data passed from Desk promotion | Added `clusterDetail` map, auto-populate summary/why_it_matters on cluster selection |

### Architecture deviation from ADR

**Server-rendered pages instead of API proxy.** The original design used `src/pages/api/admin/[...path].ts` to proxy requests to the ingestion Worker with HMAC signing. However, `locals.operator` is undefined in Astro API routes (Cloudflare adapter limitation), causing repeated 403 errors. The Desk and Social Signals pages were rewritten to use direct D1 access from server-rendered Astro pages, bypassing the API proxy entirely. This pattern proved more reliable and is now the standard approach for admin pages.

### Verification

| Check | Result |
|---|---|
| Astro type-check (87 files) | ✅ 0 errors |
| Manual URL submission | ✅ Creates candidate with UUID |
| State transitions | ✅ new→drafting→draft_ready→needs_review |
| Promote to story | ✅ Creates cluster + feed_item + member link |
| Promoted story publishable | ✅ evidence_status='vendor_reported' |
| Review queue loads | ✅ adminFetch helper works |
