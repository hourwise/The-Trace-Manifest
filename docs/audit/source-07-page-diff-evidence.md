# SOURCE-07 — Page-Diff Connector Evidence

**Date:** 19 July 2026  
**Commits:** `2b27bf2` (connector), `e2f5a77` (512KB bump)  
**Worker:** `f2f8b447` (trace-manifest-ingestion)

## What was delivered

A safe `page_diff` connector using HTMLRewriter (built into the Workers runtime) for two named Anthropic sources.

### Changes

| File | Change |
|---|---|
| `workers/ingestion/fetchers/page-diff.ts` | New connector: HTMLRewriter-based, CSS selector extraction |
| `workers/ingestion/index.ts` | Added `page_diff` case in `processSource()` |
| `workers/ingestion/types.ts` | Exported `FetchedFeedItem` interface for page-diff use |

### Sources configured

| ID | Name | URL | Selector | Cadence |
|----|------|-----|----------|---------|
| 4 | Anthropic Newsroom | https://www.anthropic.com/news | `/news/` links | 60 min (Tier A) |
| 5 | Anthropic Research | https://www.anthropic.com/research | `/research/` links | 360 min (Tier A) |

### Bounds & safety

- 512KB max page size (bumped from 256KB after Anthropic Newsroom exceeded original limit)
- 15-second fetch timeout
- HTML content-type check before processing
- Redirect-safe fetch (follows up to 3 redirects)
- Only extracts URLs matching the configured path prefix

### Verification

| Check | Result |
|---|---|
| Astro type-check (87 files) | ✅ 0 errors |
| Worker deployed to production | ✅ `f2f8b447` |
| Source 4 retry with 512KB limit | Pending (next scheduled run) |
| Source 5 first run | Pending (next scheduled run ~16:00 UTC) |

### Deviation from plan

None. Connector implemented as specified in SOURCE-07 with documented selectors and change policy.
