# ADR 0016 — Governed Ask TRACE Research Evidence

**Date:** 19 July 2026  
**Commits:** `c3e2466` through `4f18a4f` (15 commits)  

## What was delivered

Publisher-only admin Ask TRACE research mode with evidence retrieval, AI-powered Q&A, citations, and confidence scoring. Plus the full evidence pipeline: claim extraction from feed items, evidence record creation, and knowledge base population.

### Changes — Ask TRACE

| File | Change |
|---|---|
| `src/pages/admin/ask.astro` | Admin Ask TRACE page: question form, result display, confidence badge, citations, caveats |
| `src/pages/api/admin/ask.ts` | POST/GET endpoint: auth via `authenticateAccessRequest`, calls `retrievePublishedEvidence` + `askTrace` |
| `src/pages/admin/index.astro` | "Ask TRACE Research" dashboard card |
| `src/ai/trace-model-gateway.ts` | Added `adminOverride?: boolean` to `AskTraceContext`; when true, gates on `editorialAIEnabled` instead of `publicAskTraceEnabled` |
| `src/pages/admin/extract-claims.astro` | Manual claim extraction trigger with diagnostic mode |

### Changes — Evidence Pipeline

| File | Change |
|---|---|
| `workers/ingestion/extract-claims.ts` | Major fixes: content requirement filter, placeholder cluster for unclustered items, valid `evidence_type`, batch size 50, claim quality filters |

### Bugs fixed

| Bug | Root cause | Fix |
|-----|-----------|-----|
| "Forbidden" on `/api/admin/ask` | `locals.operator` undefined in Astro API routes (Cloudflare adapter) | Use `authenticateAccessRequest(request, env)` directly |
| "Ask TRACE is not currently enabled" | `askTrace()` gates on `publicAskTraceEnabled` which is `false` in production | Added `adminOverride` flag; when true, checks `editorialAIEnabled` instead |
| "Request validation failed" | Empty evidence array (no published stories with claims) failed minimum-excerpt validation | Added early check: return helpful non-answer when evidence is empty |
| 0 claims from 500 items processed | Extraction query ordered by `fetched_at DESC`; most recent items were Hugging Face Blog with null content | Added `AND (summary IS NOT NULL OR content_excerpt IS NOT NULL)` filter |
| 0 claims despite content present | `claims.cluster_id` NOT NULL but 456/730 items unclustered | Created `ensureClusterId()` — auto-creates placeholder "Unclustered Items" cluster |
| Claims stored but 0 evidence records | `claim_evidence.evidence_type` CHECK constraint only allows 7 values; code used `'source'` (invalid) | Changed to `'vendor_claim'` (valid per CHECK constraint) |
| Error 1102 (CPU limit exceeded) | 500 items × multiple DB queries exceeded Pages Function CPU limit | Reduced batch to 50, cached placeholder cluster ID, optimized lookups |
| 10000% confidence display | `confidenceScore` is 0-100 scale but template multiplied by 100 | Changed `Math.round(score * 100)` to `Math.round(score)` |
| Published stories excluded from extraction | Query only processed `clustered`/`classified` items, not `published` | Added `'published'` to ingestion_status filter |
| Hugging Face RSS has no descriptions | Feed XML contains only `<title>`, `<link>`, `<pubDate>` — no `<description>` tags | Content filter naturally excludes these items |

### Architecture deviations

1. **Placeholder cluster published to enable Ask TRACE.** The 9 AM clustering pipeline is stuck (5 days in `running` status). To make Ask TRACE functional, 313 quality AI claims from the placeholder "Unclustered Items" cluster were published as `ai-evidence-index` (slug). This is a tactical workaround — the pipeline fix will make this unnecessary.

2. **Manual claim extraction page.** Claim extraction was designed to run in the Worker's 9 AM pipeline. The pipeline's failure required a manual trigger page (`/admin/extract-claims`) that imports the extraction engine directly into the Astro Pages Function.

3. **Server-rendered admin pattern continued.** Following the ADR 0015 pattern, the extraction page uses direct D1 access rather than API proxy.

### Verification

| Check | Result |
|---|---|
| Astro type-check (88 files) | ✅ 0 errors |
| Admin Ask TRACE loads | ✅ `/admin/ask` accessible |
| Publisher auth works | ✅ `authenticateAccessRequest` validates Cloudflare Access JWT |
| Evidence retrieval | ✅ 142 claims pass all filters on published stories |
| AI answers with citations | ✅ "What is Google DeepMind working on?" → 7 citations, 5 key points |
| Non-answer handling | ✅ "What new AI models released?" → proper non-answer with reasons |
| Confidence scoring | ✅ High/Medium/Low with percentage |
| Caveats and disagreements | ✅ Displayed when present |
| Claim extraction | ✅ 1,064 claims, 282 evidence records across 24 clusters |
| Quality filters | ✅ Skips URLs, file paths, version numbers, low-alpha claims |

### Knowledge base state (post-extraction)

| Resource | Count |
|----------|-------|
| Claims extracted | 1,064 |
| Evidence records | 282 |
| Claims on published stories | 142 |
| Sources covered | 27 |
| Clusters with claims | 24 |

### Known limitations

- Model release claims are low quality (GitHub download URLs partially matched before quality filters)
- Hugging Face Blog feed has no descriptions (RSS parser works correctly; source provides no content)
- 9 AM pipeline still stuck (monitoring tomorrow after Worker redeploy with fixes)
- 42 review-queue stories are consumer tech, not AI evidence
- Garbage claims from earlier extraction runs still exist in DB (not yet cleaned up)
