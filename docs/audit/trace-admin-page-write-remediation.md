# Admin page write remediation: Desk and Social attribution, audit and knowledge boundary

**Branch:** `claude/trace-admin-direct-write-remediation`, stacked on PR #7 (`claude/trace-editorial-d4-review-workflow` at `5d17e19`).
**Scope:** the two findings that PR #7 recorded but did not change. PR #7 made `/admin/desk` and `/admin/social` publisher-only for writes; this branch fixes what those writes record.
**Boundaries kept:** no migration, no Worker change, no deployment, no D1/R2 writes outside tests, no Cron or scheduler 0072 change, no model calls, public Ask unchanged.

## Findings and fixes

| Finding | Before | After |
|---|---|---|
| **1. Attribution and audit** | Desk and Social wrote D1 directly from page frontmatter and recorded `'Admin'` as `created_by`, `submitted_by` and `reviewed_by`. Only Desk promotion wrote an audit row, also as `'Admin'`, in a separate statement after the cluster was created. Transitions, Desk submissions and every Social write had no audit row. | Every write goes through `src/lib/server/admin-page-writes.ts`. Each write is attributed to the signed-in operator's email and committed in **one D1 batch with its `admin_audit_log` row**, so neither lands without the other. The helpers refuse anyone but a publisher before running any statement. |
| **2. Social approval created knowledge** | Approving a signal also ran `INSERT OR IGNORE INTO knowledge_documents (… 'social_signal', 'approved' …)` "so Ask TRACE can retrieve it", contrary to ADR 0009 (social posts are discovery signals, not proof). | Removed. Approval records the review decision only, and the message says linked sources still need their own assessment. No path from Social to `knowledge_documents` remains. |

**Audit actions:**
- `submit_candidate`
- `transition_candidate` (detail `from->to`)
- `promote_candidate_to_cluster`
- `submit_social_signal` (target = new signal id)
- `approve_social_signal`
- `reject_social_signal`

All are recorded with outcome `succeeded`.

## Behaviour changes beyond attribution

- **Desk transitions** are conditional on the state that was read (`WHERE id = ? AND state = ?`). A concurrent change now shows "The candidate changed before this update was saved" instead of overwriting. A refused transition writes no audit row.
- **Social decisions** apply only to `pending` signals. Re-deciding an approved or rejected signal, or a missing id, changes nothing and writes no audit row. The page already showed decision controls only for pending signals.
- **Desk promotion: duplicate fixed** (found in review; also present on `main`).
  - **Before:** the page offered and accepted **Promote** for both `needs_review` and `published` candidates, so promoting again created a second story cluster and audit row for the same candidate (reproduced: 2 clusters, 2 audit rows).
  - **Now:** promotion is accepted only from `needs_review`. The batch starts with `UPDATE … WHERE id = ? AND state = 'needs_review'`, and every later statement is conditional on it:
    - the cluster insert uses `WHERE changes() = 1`;
    - the audit row uses `WHERE changes() = 1` and records `story_cluster:<id>`;
    - the feed item and cluster link run only if that audit row exists.
  - **Result:** a repeated, double-submitted or concurrent promotion writes nothing and shows a "promoted or changed" message.
- **Desk promotion: one batch.** Candidate state, cluster, audit, feed item and cluster link are written together. The cluster link finds the feed item by URL hash. Previously, when the URL was already ingested, `INSERT OR IGNORE` could leave `last_row_id` pointing at an unrelated row, so the link was skipped or wrong.
- **Duplicate Social URL** shows "already submitted" instead of the raw constraint error.

## Not changed

- The pages still write from frontmatter rather than through the signed proxy. The proxy has intake routes for candidates and signals, but no transition, promotion or review routes. Moving them would need a Worker change and deploy, so this branch puts the proxy's guarantees (role, attribution, audit) on the page path instead.
- Refused (403) reader POSTs are not audited. The guard returns before any D1 access, as PR #7's boundary test requires.
- `/admin/ask` still shows readers a form that the server refuses (UX only).
- The promotion logic is otherwise unchanged: headline, evidence defaults, `source_id = 1`.
- Duplicate clusters that earlier re-promotions may already have created in Preview or Production D1 are not detected or cleaned up here.

## Tests and evidence

| Check | Result |
|---|---|
| `tests/admin-page-writes.test.ts` (new, in `npm test`) | Passes. Covers: operator attribution on every write; one audit row per write; stale transitions, repeat decisions and **repeated promotions** write nothing; promotion links an already-ingested feed item without duplicating it; **write rolled back when the audit row cannot be written**; approval creates no `knowledge_documents` row; readers and missing operators are refused before any statement; page frontmatter has no `'Admin'`, no direct `INSERT`/`UPDATE`/`DELETE`, and no `knowledge_documents`. **The page assertions fail on PR #7's pages** (red/green). |
| `npm test`, typecheck, `test:security`, `test:migrations`, `test:diff`, `npm run build` | All pass, including the D6 role-script check. |

**Unverified:**
- The `changes()` and `last_insert_rowid()` chaining is now **verified on real Preview D1** (see "Real D1 check on Preview").
- No browser QA.

## Real D1 check on Preview (2026-10-25, owner-approved)

**Scope:** Preview D1 only, with no deployment and no Production access.

**Method:** a local script loaded this branch's `admin-page-writes.ts` (at `dc934f8`) and called it against the real `trace-manifest-db-preview` binding, through wrangler 4.151 `getPlatformProxy` with a remote D1 binding.

**Read-only guard before any write:**
- the temporary config held only the Preview binding, and its id matched `wrangler d1 info`;
- the baseline matched the known Preview counts (21 candidates, 1 social signal);
- no `[QA-PR8…]` rows were present.

**Writes:** `[QA-PR8-…]` rows by operator `qa-pr8@example.test`.

**Result: 23/23 checks pass.**

| Area | Verified on real D1 |
|---|---|
| Candidate submission | `created_by` is the operator. Exactly one `submit_candidate` audit row, with operator and role. |
| Transitions | `new→drafting` applied. A stale repeat returned `false` and added **no** audit row (`WHERE changes() = 1`). Exactly one transition audit row, with `new->drafting`. |
| Promotion | A `review` cluster was created with `needs_human_review = 1`. The audit `detail_code` is `story_cluster:<id>`, matching the batch's `last_row_id`, so `last_insert_rowid()` survives `story_clusters`' FTS insert trigger. The feed item was created and linked, and the candidate became `published`. |
| Repeat promotion | Returned `null`. Cluster, link, feed item and audit counts were unchanged. |
| Social submission | `submitted_by` is the operator. The audit `target_id` equals the new signal id (`last_insert_rowid()`). |
| Social decision | Approve applied, with `reviewed_by` = the operator. A repeat approve was refused, leaving exactly one approve audit row. **No `knowledge_documents` row was created.** |
| Rollback | A batch of a valid candidate insert plus an audit insert breaking the `outcome` CHECK threw, and **the candidate insert was rolled back**. |

**Cleanup:**
- The QA cluster, its link, the feed item, the candidate and the social signal were deleted in one batch.
- Afterwards, counts equal the baseline: candidates 21, signals 1, clusters 127, links 238, feed items 129, knowledge documents 0.
- The only change is **7 kept QA audit rows**: 541 → 548, operator `qa-pr8@example.test`, kept as the record of this test.
