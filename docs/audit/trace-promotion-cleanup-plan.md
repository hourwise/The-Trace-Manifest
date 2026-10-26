# Production cleanup plan: duplicate and mis-linked promoted clusters

## Result: COMPLETE (2026-10-26)

Executed under owner approval (option A), through the audited admin proxy only, from the publisher's session. There were no direct SQL writes, no deletes and no Time Travel restore.

| Step | Clusters | Outcome | Audit rows |
|---|---|---|---|
| Archive | 353 | Archived on 2026-10-25, but the old Worker reported **400** and audited `failed`: the D1 trigger-count bug fixed by PR #9. **Recorded as already archived and not repeated.** The misleading `failed` row (2896) is kept as history. | 2892 (denied preflight), 2895 allowed, 2896 failed |
| Archive | 354, 379, 380, 383, 824, 825, 826, 827, 352 | 200, `withdrawn`. 352 keeps its 3 claims and 3 `story_claims`. | 2899–2916, an allowed/succeeded pair each |
| Withdraw | 381 | 200, `withdrawn`, `is_published = 0`, reason appended. Public page 200 with the withdrawn notice and `noindex` once PR #10 was released (Pages `96624494`). | 2917/2918 |
| Withdraw | 384, 385, 386, 387, 388 (2026-10-26) | 200 each, `withdrawn`, `is_published = 0`, reason appended. Each public page returns 200 with the withdrawn notice. | 2919–2928, an allowed/succeeded pair each |

**Baseline verification (read-only, against the 2026-10-25 snapshot):**

| Measure | Before | After | Expected |
|---|---|---|---|
| Pending review (`needs_human_review = 1`, draft or review) | 1779 | **1769** | −10 ✅ |
| Published stories | 98 | **92** | −6 ✅ |
| `story_clusters` / `story_cluster_members` / `claims` / `feed_items` | 2755 / 3819 / 1159 / 6765 | **unchanged** | unchanged ✅ |
| Members of the 16 affected clusters | 21 | **21** | unchanged ✅ |
| `evidence_score_snapshots` | 0 | **1** (cluster 352's archive recalculation) | recalculation side effect ✅ |
| Cleanup audit rows | — | 10 archive allowed, 9 archive succeeded, 1 archive failed (353), 6 withdraw allowed, 6 withdraw succeeded, 1 denied preflight; one operator, `publisher` | ✅ |

**Public checks:**
- the six withdrawn slugs appear on none of `/`, `/feed` and `/rss/daily.xml`;
- the correct stories 355 and 356 still load as published, with no notice.

**Rollback:** if ever needed, use the per-row snapshots in the session scratchpad (`cleanup/clusters.json`, `members.json` and the claims files), with targeted SQL under separate approval. Bookmark `00003f20-00000000-0000510f-d8fbda98ab0b52ca587f88a82e030914` is a whole-database last resort only.

**Not done here, and not part of this cleanup:**
- the 11 mis-linked candidates in TRACE Desk stay `published` (the optional step was skipped);
- the ingestion drafts that hold the intended stories (519, 520, 521, 536, 557, 621, 828, 831) await editorial review;
- historical multi-cluster items are surfaced by PR #12.

---

**Status update (2026-10-25, after PR #9 and Worker `d0479d92`):**
- **All 10 archives are done and verified.** 353 was recorded as already archived and not repeated. 354, 379, 380, 383, 824–827 and 352 were archived through the fixed Worker, each with an `allowed`/`succeeded` audit pair (2899–2916). 352 keeps its 3 claims, and its archive wrote 1 evidence-score snapshot.
- **Withdrawals: 381 is done** (audit 2917/2918, reason appended). However, its public page returned 404, because the story page served only `published` stories, so the withdrawn banner never rendered.
- **Withdrawals of 384–388 are paused** until PR #10 (withdrawn and superseded pages stay public with their banner) is released.
- **Final baseline verification is still to do.**

**Earlier status: PAUSED after 1 of 10 archives.** The owner approved option A, and the backup was taken first: Time Travel bookmark `00003f20-00000000-0000510f-d8fbda98ab0b52ca587f88a82e030914`, with row snapshots saved locally.
- **Cluster 353** is archived (`withdrawn`), but the Worker returned 400 and audited `failed` (audit rows 2895 and 2896): `archiveCluster` checked `changes !== 1`, and D1 counts the search-index trigger's rows. The evidence-score recalculation was skipped (353 has no claims).
- **A denied proxy row (2892)** came from a first attempt that the browser tool sent as a cross-origin preflight; nothing changed.
- **Resume** only after PR #9 is merged and the Production Worker is deployed, both owner-approved: archive the remaining 9 (352 last), then withdraw 381 and 384–388, then verify against the baseline (pending 1779, published 98, last audit id 2891 before the cleanup).
**Source:** read-only Production D1 check on 2026-10-25 (SELECT only; every query reported `changes: 0`). The code faults are fixed by PR #8 (`3955419`), so this plan only repairs data that the old Desk promote code left behind.

## What is wrong

1. **Re-promotion duplicates.** Repeated clicks on **Promote** created extra `review` clusters for 3 candidates.
2. **Mis-linked promotions.** For URLs that ingestion had already stored, the old code linked each new cluster to the feed item whose **id equalled the cluster id**: an unrelated Hugging Face blog post ingested on 07-13. The headline and summary were then generated from that wrong source. Six of these clusters were published as stories about the Hugging Face posts.
3. **The intended stories already exist.** Every intended candidate URL has a correctly linked feed item that nightly ingestion clustered into its own `draft` cluster. Cleanup therefore needs no re-promotion; it only retires the wrong clusters.

## Per-cluster findings and proposed action

Every affected cluster has `needs_human_review = 1`, `evidence_status = vendor_reported`, and no related reviews, relationships, entities, corrections, score snapshots or governance rows. **Cluster 352 is the only exception:** it holds 3 claims and 3 `story_claims`.

| Cluster | State | Problem | Candidate | Intended story is in | Proposed action |
|---|---|---|---|---|---|
| 352 | review | Duplicate of 355 (Linus Torvalds). Holds 3 claims, all the same fragment ("AI, even if it 'isn't perfect'.") | `92d943cd` | 355 (published, correct) | **Archive.** Leave the claims attached: they are fragments, and moving them would change the published story 355. |
| 353 | review | Duplicate of 355 | `92d943cd` | 355 | **Archive** |
| 354 | review | Duplicate of 356 (Anthropic acquisition rumour) | `24e41a5d` | 356 (published, correct) | **Archive** |
| 379 | review | Duplicate, and linked to an unrelated feed item (379) | `9d9becc2` (Ollama v0.32.2-rc2) | 557 (draft) | **Archive** |
| 380 | review | Duplicate, and linked to an unrelated feed item (380) | `9d9becc2` | 557 | **Archive** |
| 383 | review | Linked to an unrelated feed item (383) | `3df4ab2d` | 521 (draft) | **Archive** |
| 824 | review | Linked to an unrelated feed item (824) | `4ee6e8e0` | 828 (draft) | **Archive** |
| 825 | review | Linked to an unrelated feed item (825) | `8f789082` | 831 (draft) | **Archive** |
| 826 | review | Linked to an unrelated feed item (826) | `923e0533` | 828 (draft) | **Archive** |
| 827 | review | Linked to an unrelated feed item (827) | `95133a2a` | 828 (draft) | **Archive** |
| 381 | **published** | Story "Hugging Face Hub Migrates from Git LFS to Xet Storage" (HF post) for an Ollama release candidate | `9d9becc2` | 557 | **Owner decision.** Recommended: withdraw. |
| 384 | **published** | Story "ScreenEnv…" (HF post) for a Databricks release note | `eb2cda3e` | 621 | **Owner decision.** Recommended: withdraw. |
| 385 | **published** | Story "Hugging Face MCP Server…" (HF post) for OpenAI's small business program | `1f83ad3e` | 520 | **Owner decision.** Recommended: withdraw. |
| 386 | **published** | Story "Reachy Mini…" (HF post) for Gemini 3.5 Flash Cyber | `a956c0be` | 519 | **Owner decision.** Recommended: withdraw. |
| 387 | **published** | Story "AMD MI300 Custom Kernel…" (HF post) for Gemini 3.6 Flash | `5140e72f` | 519 | **Owner decision.** Recommended: withdraw. |
| 388 | **published** | Story "Gradio MCP Servers…" (HF post) for a Qwen Code release | `af77d6ba` | 536 | **Owner decision.** Recommended: withdraw. |

**Not touched:**
- the correct published stories 355, 356, 357 and 382;
- every feed item: the HF items 381 and 384–388 keep `ingestion_status = published`, because they are the actual sources of stories that remain visible with a withdrawn banner;
- the ingestion drafts 519, 520, 521, 536, 557, 621, 828 and 831. These are editorial follow-ups: All eight are `draft` with `needs_human_review = 0`. Ingestion grouped them imperfectly:
  - 519 mixes Gemini 3.6, Gemini 3.5 Flash Cyber and a Databricks item;
  - 828 holds three Qwen Code releases;
  - 536 is titled after a Qwen Code nightly but holds the v0.20.1 item;
  - 557 is titled "ollama v0.32.2" but holds the rc2 item.

### The six published stories: options

The live pages are internally consistent: each cites the Hugging Face post it describes, and none shows the intended candidate URL. But they were not the intended stories, they present 07-13 backlog posts as 07-21 news, and their stored `canonical_url` contradicts their content.

- **A. Withdraw (recommended).** Uses the audited app route. The page stays live with "⚠ This story has been withdrawn…" and the reason is appended to `editorial_analysis` (shown publicly). It can be reversed from the snapshot.
- **B. Keep published, and fix only `canonical_url` to the HF URL.** There is no app route for this, so it means a direct SQL write plus a hand-written audit row. Not recommended.
- **C. Leave them as they are.** Records stay inconsistent and stale posts stay presented as news.

**Proposed withdrawal reason** (public, at most 1,000 characters): `Published in error: a since-fixed Desk promotion fault generated this story from the wrong source item.`

## Method: audited app routes, no hand-written SQL writes

Every write goes through the signed admin proxy from the owner's publisher session on `https://thetracemanifest.com`, in the browser pane, one cluster per call. This is the same route the Review page's **Archive (not news)** button uses. The Worker:
- records `admin_audit_log` rows (`allowed`, then `succeeded` or `failed`) with the operator's email and `target_id = clusterId`;
- applies the state change with its own guard;
- recalculates evidence scores (`story_archived` / `story_withdrawn`).

| Step | Call (from a page on thetracemanifest.com) | SQL the Worker runs |
|---|---|---|
| Archive | `fetch("/api/admin/archive-cluster", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clusterId }) })` | `UPDATE story_clusters SET publication_status = 'withdrawn', updated_at = datetime('now') WHERE id = ? AND publication_status IN ('draft','review')` |
| Withdraw (option A) | `fetch("/api/admin/withdraw-story", { …same…, body: JSON.stringify({ clusterId, status: "withdrawn", reason }) })` | `UPDATE story_clusters SET publication_status = 'withdrawn', is_published = 0, editorial_analysis = COALESCE(editorial_analysis,'') \|\| ' [Withdrawn: ' \|\| reason \|\| ']', updated_at = ? WHERE id = ?` (after checking that the cluster is `published`) |

Expected response: HTTP 200 `{"status":"ok"}`. **Stop at the first non-200 response** and report.

## Execution steps

0. **Preconditions:**
   - owner approval for steps 2 and 3 (and for option A);
   - Cron is `[]` on both Workers;
   - Production Pages is `5d5b3c90`;
   - no other editorial work in progress;
   - the browser pane is signed in as the publisher on the apex domain.
1. **Backup (read-only):**
   - `npx wrangler d1 time-travel info trace-manifest-db --env production`: record the bookmark.
   - Save these to a local JSON file, keeping the full rows:
     ```sql
     SELECT * FROM story_clusters WHERE id IN (352,353,354,355,356,379,380,381,383,384,385,386,387,388,824,825,826,827);
     SELECT * FROM story_cluster_members WHERE cluster_id IN (352,353,354,379,380,381,383,384,385,386,387,388,824,825,826,827);
     SELECT * FROM claims WHERE cluster_id = 352;
     SELECT * FROM story_claims WHERE story_cluster_id = 352;
     SELECT * FROM evidence_score_snapshots WHERE story_cluster_id IN (352,353,354,379,380,381,383,384,385,386,387,388,824,825,826,827);
     SELECT COUNT(*) AS clusters FROM story_clusters;
     SELECT COUNT(*) AS members FROM story_cluster_members;
     SELECT COUNT(*) AS claims FROM claims;
     SELECT COUNT(*) AS feed_items FROM feed_items;
     SELECT COUNT(*) AS pending FROM story_clusters WHERE needs_human_review = 1 AND publication_status IN ('draft','review');
     SELECT MAX(id) AS last_audit_id FROM admin_audit_log;
     ```
2. **Archive the 10 review clusters**, in this order: 353, 354, 379, 380, 383, 824, 825, 826, 827, 352. (352 goes last because it holds claims; its archive triggers an evidence-score recalculation for them.)
3. **Option A:** withdraw 381, 384, 385, 386, 387 and 388 with the reason above.
4. **Optional, in the Desk UI** (audited since PR #8): move the 11 mis-linked candidates (`9d9becc2`, `3df4ab2d`, `eb2cda3e`, `1f83ad3e`, `a956c0be`, `5140e72f`, `af77d6ba`, `4ee6e8e0`, `8f789082`, `923e0533`, `95133a2a`) from `published` to `archived`, since their story is now the ingestion draft. The Desk only allows `published → draft_ready | archived`.

## Verification (read-only, immediately after)

```sql
-- V1: target states
SELECT id, publication_status, is_published FROM story_clusters
WHERE id IN (352,353,354,355,356,379,380,381,383,384,385,386,387,388,824,825,826,827) ORDER BY id;
-- expect 'withdrawn' for the 10 archived and (option A) the 6 withdrawn with is_published = 0;
-- 355 and 356 still 'published'.

-- V2: one allowed + one succeeded audit row per call, by the owner's operator email
SELECT action, target_id, outcome, operator_role FROM admin_audit_log
WHERE id > :last_audit_id AND action IN ('/admin/archive-cluster','/admin/withdraw-story') ORDER BY id;
-- expect 20 rows for step 2 and 12 for step 3, none 'failed'.

-- V3: pending queue shrinks by exactly 10
SELECT COUNT(*) AS pending FROM story_clusters WHERE needs_human_review = 1 AND publication_status IN ('draft','review');

-- V4: nothing else moved
SELECT COUNT(*) FROM story_clusters;
SELECT COUNT(*) FROM story_cluster_members;
SELECT COUNT(*) FROM claims;
SELECT COUNT(*) FROM feed_items;
-- all equal to the backup counts

-- V5: side effects of the evidence-score recalculation, reported rather than assumed
SELECT story_cluster_id, COUNT(*) FROM evidence_score_snapshots
WHERE story_cluster_id IN (352,353,354,379,380,381,383,384,385,386,387,388,824,825,826,827) GROUP BY story_cluster_id;
```

**Public checks (option A):**
- each of the six story URLs returns 200 with the withdrawn banner;
- the homepage, `/feed` and `/rss/daily.xml` no longer list them;
- 355 and 356 are unchanged.

## Rollback

- **Archived clusters, targeted:**
  ```sql
  UPDATE story_clusters SET publication_status = 'review'
  WHERE id IN (352,353,354,379,380,383,824,825,826,827) AND publication_status = 'withdrawn';
  ```
- **Withdrawn stories, per cluster, from the snapshot:**
  ```sql
  UPDATE story_clusters SET publication_status = 'published', is_published = 1, editorial_analysis = :snapshot_editorial_analysis
  WHERE id = :id AND publication_status = 'withdrawn';
  ```
- Both rollbacks are direct SQL writes and need their own approval. Evidence-score snapshots written by the recalculation stay as history.
- **Last resort:** `wrangler d1 time-travel restore trace-manifest-db --env production --bookmark <step-1 bookmark>`. This rewinds the **whole** database, so only use it with no other writes since the bookmark.

## Out of scope (separate follow-ups)

- **TRACE-EDITORIAL-DEDUPE-R1: cross-pipeline cluster identity and duplicate prevention.** Promotion and ingestion don't check each other, so a promoted URL can still be clustered again when ingestion resumes; PR #8 does not prevent that. The fix should:
  - use one shared, deterministic source identity;
  - check existing candidate, feed-item and cluster links before creating a cluster;
  - still allow legitimate follow-up coverage rather than treating separate developments as duplicates.

  **This must land before automated news acquisition restarts or the local news collector is reconnected.**
- **Ingestion duplicate pair 2146 / 2150** for candidate `88f1bef6` (state `new`).
- **Three published candidates have no promotion audit row** (`92d943cd`, `24e41a5d`, `9ca11e81`; promoted 07-19, before audit logging). This plan leaves them as history.
