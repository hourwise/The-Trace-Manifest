# TRACE-EDITORIAL-DEDUPE-R1: cross-pipeline story cluster identity

**Branch:** `claude/trace-editorial-dedupe-r1`, from `main` at `c41b6b1`.
**Release gate:** migration **0077** must be applied to Preview and Production D1 **before** this merges. Merging deploys Pages, whose Desk promotion writes `primary_source_key`. The clustering change also needs a Worker deploy. No remote migration, deploy or ingestion restart has been done.

## Observed duplicate causes (Production, read-only, 2026-10-25)

| Case | Cause | Fixed by |
|---|---|---|
| Re-promotion of one candidate (352/353/355, 354/356, 379/380/381) | Desk accepted **Promote** on published candidates. | PR #8 |
| Promoted cluster linked to an unrelated feed item (379–388, 824–827) | Stale `last_row_id` after `INSERT OR IGNORE`. | PR #8 |
| **Promotion, then ingestion** (pairs with 519, 520, 521, 536, 557, 621, 828, 831) | Promotion linked the feed item but left it `classified` (or inserted it `raw`, to be classified later). `runClustering` takes every `classified` item from the last 3 days and never checked membership, so it gave the item a second cluster. | **This PR** |
| **Ingestion, then promotion** | Promotion never checked whether the URL already had a cluster; the duplicate check ran only at Desk submission. | **This PR** |
| **Partial clustering write** (2146 has no members; 2150 has its item) | Cluster, member and status writes were separate statements. A failure part-way left an empty cluster and `classified` items, which the next run clustered again. | **This PR** |
| Concurrent promotion and clustering | No write-time guard. | **This PR** |

8 Production feed items currently belong to more than one cluster. They are historical: this PR prevents new ones, and the review UI (TRACE-RESTORE-01 Task C) surfaces them for editors.

## Identity rules

1. **Same source item** means the same `feed_items` row, keyed by `url_hash`: SHA-256 of the canonical URL. That canonical form drops the tracking parameters and a trailing slash, exactly as ingestion always did. Desk and ingestion now share one implementation (`src/lib/server/source-identity.ts`). The canonical form is deliberately **not** widened (for example to `www.` or `http`/`https`), because that would re-key existing rows and create duplicate feed items.
2. **A cluster's primary source** is stored as `story_clusters.primary_source_key = 'src:' || url_hash`. A **unique partial index** makes a second cluster with the same primary source fail at write time, whichever pipeline is second. Legacy rows keep `NULL` and are not backfilled, because historical duplicates would violate the index; membership checks cover them.
3. **Relationship of a source item to clusters** (`classifySourceRelationship`):
   - **new:** no cluster holds it, so a cluster may be created;
   - **exact:** exactly one current (draft, review or published) cluster holds it, so that cluster is reused and no new one is created;
   - **retired:** only withdrawn or superseded clusters hold it, so it is never resurrected silently and an editor decides;
   - **ambiguous:** two or more current clusters hold it (historical duplication), so an editor resolves it.
4. **What is not identity:** several items about one event, related events, follow-ups and different URLs for one release are **not** the same source item. Nothing merges them on identity or headline similarity. Clustering's existing within-run grouping (entity and title overlap) is unchanged.

## Behaviour changes

**Clustering (`workers/ingestion/cluster.ts`, Worker):**
- Considers at most **200** `classified` items per run; the rest wait for the next run.
- **Stage 0:** items that already belong to a cluster are marked `clustered` (guarded) and never clustered again. This happens in one indexed membership query per 90 ids.
- **Atomic writes:** each new cluster is **one D1 batch**:
  - the cluster with its `primary_source_key`;
  - members, each skipped if another cluster took the item meanwhile;
  - status updates that follow membership;
  - removal of the cluster if it ended up empty.
- **Write-time conflict:** a unique-key conflict rolls the batch back and is counted as `identityConflicts`; the next run settles the items. Other errors still fail the run.
- **Return value** gains `alreadyClustered` and `identityConflicts`.

**Desk promotion (`promoteCandidate`, Pages):**
- Resolves the candidate URL's source item first:
  - **new:** creates the review cluster, recording its `primary_source_key`. The candidate's state change is also guarded on no cluster having taken the source meanwhile. A unique-key conflict rolls the whole promotion back (`source_changed`).
  - **exact:** links the candidate to the existing cluster. The candidate becomes `published`, and the audit `detail_code` reads `reused_story_cluster:<id>`. This is guarded on the cluster still being current, and nothing about the existing cluster changes.
  - **retired or ambiguous:** nothing is written and the Desk explains the conflict. The candidate stays `needs_review`.
- Lead-only candidates (no URL) have no source identity and behave as before.

**Desk submission:** uses the shared canonical form and hash (same values as before).

**Never done:** clusters are not merged, items are not moved out of published stories, and editorial decisions are not overwritten. The published-only eligibility rule is unchanged.

## Database and cost

- **`db/migration-0077-editorial-source-identity.sql`:** the `primary_source_key` column, a unique partial index, and the reverse membership index `story_cluster_members(feed_item_id, is_primary DESC, cluster_id)`. The index uses the same definition as 0069, which Production does not have; `IF NOT EXISTS` makes it a no-op where 0069 exists. Forward-only and additive; 0072 untouched.
- **Query cost:** every new lookup is indexed. The membership read is one statement per 90 ids, capped at 4 rows per id; `primary_source_key` lookups use the unique index; `url_hash` uses the existing unique index. Every statement stays at or under 100 bound parameters. No polling, no new scheduled work.

## Tests

`tests/editorial-dedupe.test.ts` (in `npm test`). **It fails on the previous code**: on the pre-change implementation, case 1 gives the item 2 clusters, case 2 gives 2, and case 6 leaves 2 clusters, one of them empty. The cases:

1. Promotion, then ingestion: no second cluster, and the item is settled as `clustered`.
2. Ingestion, then promotion: the existing cluster is reused, with an audit row and no new membership.
3. Withdrawn material: promotion returns a `retired` conflict and writes nothing; re-classification creates nothing.
4. An item in two current clusters gives an `ambiguous` conflict.
5. Repeated clustering is idempotent.
6. A write failure part-way leaves no cluster, and the retry creates exactly one.
7. Promotion during clustering's write: the unique key keeps one cluster, and the next run settles the item.
8. Clustering during promotion's write: `source_changed`, nothing written, and a retry reuses the cluster.
9. **Controls:** distinct articles from one publisher, a follow-up on a new URL, and different URLs for one release all stay separate; lead-only promotions are independent.
10. A published story gains no members.
11. **Bounds:** 250 items give 200 processed, every statement stays at or under 100 parameters, and membership lookups use the reverse index.

`tests/admin-page-writes.test.ts` is updated for promotion outcomes. Migration validation checks the column and the unique partial index, and applies 0077 both with and without 0069.

**Full checks:** `npm test`, typecheck (Astro and Worker), `test:security`, `test:migrations`, `test:diff`, `test:evidence-policy`, `test:knowledge-markdown` and `npm run build` all pass.

## Release order (each step needs owner approval)

1. **Preview D1:** apply 0077, run a bounded `[QA-…]` check, and confirm `PRAGMA index_list(story_clusters)` shows the unique index.
2. **Production D1:** take a Time Travel bookmark, apply 0077, and verify the column and both indexes. The migration is additive; to roll back, leave the column unused.
3. **Merge:** this deploys Pages (Desk promotion).
4. **Production Worker:** deploy from the merge commit with `--env="" --strict`, then verify Cron `[]`. Clustering only runs when ingestion is restarted; STOP-BURN remains.
5. **Before restarting automated ingestion:** confirm this is live.
