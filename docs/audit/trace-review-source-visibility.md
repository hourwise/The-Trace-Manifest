# Review queue and Desk: duplicate-source visibility (TRACE-RESTORE-01 Task C)

**Branch:** `claude/trace-review-source-visibility`, stacked on `claude/trace-editorial-dedupe-r1` (PR #11).
**Depends on PR #11:** it uses that PR's `source-identity.ts` rules, and the reverse membership index from migration 0077. Release it after #11 and its migration, never before.
This is a Pages-only change: no Worker change, no migration of its own, and no writes.

## Problem

Editors could not see, from the queue, that a pending cluster shared its source item with another cluster (a draft duplicate, a published story, or withdrawn history). They also could not see that a Desk candidate's URL already had a story. Production has 8 feed items in more than one cluster.

## Change

**Review queue** (`/admin/review`, both roles; Access-gated):
- **Text categories on each pending card:** Needs review, Blocked by evidence, Duplicate source (a draft/review cluster shares the source), Source already published, and Withdrawn or superseded history. They are derived from data the card already has, with no extra counts.
- **Summary line** above the queue with the count per category ("first 50 items" when the cap applies; the 50-item cap is unchanged).
- **A `role="note"` source-conflict list on affected cards.** Each line says the cluster shares the same source item ("not just a similar headline"), and names the other cluster's id, title and state. It links:
  - another pending cluster to `/admin/review?review=<id>` (the existing D4 review mode);
  - a published, withdrawn or superseded story to its public page;
  - anything else is shown as text only.
- **Guidance:** the card's "Why" reasons and "Next" action mention the shared source.

**TRACE Desk** (`/admin/desk`, publisher-only, unchanged):
- **Notices:** open candidates (new, drafting, draft ready, needs review) show how their URL relates to existing clusters, using exactly the rules promotion applies (PR #11):
  - **exact:** "Source already in story cluster #id … Promoting links this candidate to it"; the button reads **Link to existing story**;
  - **retired or ambiguous:** explains why promotion is refused, and the Promote button is disabled, with `aria-describedby` pointing at the explanation. The server refuses regardless.
- **Origin:** each candidate is labelled "Desk submission"; ingestion clusters appear in the Review queue.

**Unchanged:**
- warnings never merge, approve, archive or publish;
- the published-only eligibility rule and the D4 review-selection state;
- governance and the role boundaries (readers still get 403 on Desk and read-only Review).

## Cost

- **Review:** one extra statement for the at most 50 pending cards, using the members primary key on one side and the reverse membership index (0069/0077) on the other, `LIMIT` 6 rows per card.
- **Desk:** two extra statements for the at most 50 candidates (the `url_hash` unique index, then the indexed membership read).
- **No count queries per card and no polling.** A failure only hides the warnings.

## Tests

- **`tests/review-source-visibility.test.ts`** (in `npm test`):
  - category and wording rules; guidance;
  - the conflict loader: one statement, correct per-status results, and use of the reverse index;
  - candidate relationships: exact through tracking parameters, plus new, ambiguous and lead-only.
- **`tests/review-source-render.test.ts`** (`npm run test:review-render`, run by `npm run ci` after the build) **renders the built pages** through Astro's container API:
  - **Review, as publisher and as reader:** categories, the conflict note and its links, and the summary counts; readers keep "Inspect evidence and history".
  - **Desk, as publisher:** the exact notice, **Link to existing story**, and a disabled Promote button for an ambiguous source with `aria-describedby`; closed candidates have no notice.
  - **Desk, as reader:** 403.
  - **Rendering writes nothing:** table counts are unchanged.
  - **Mobile:** the new elements wrap.
- **`tests/review-pending-workflow.test.ts`:** one source-text assertion updated for the new `pendingReviewGuidance(item, conflicts)` call.
- **Full checks:** `npm test`, typecheck (Astro and Worker), `test:security`, `test:migrations`, `test:diff`, `npm run build` and `test:review-render` all pass.

**Keyboard and screen readers:** every new control is a native link or button; categories and warnings are text (not colour-only) in labelled lists and `role="note"` regions.

## Release

Merge after PR #11, once migration 0077 is applied. Merging deploys Pages. The rollback target is the previous Production Pages deployment.
