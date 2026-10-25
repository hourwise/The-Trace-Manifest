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
- **Desk promotion** is now one atomic batch: feed item, cluster, cluster link, candidate state and audit. The cluster link now finds the feed item by URL hash. Previously, when the URL was already ingested, `INSERT OR IGNORE` could leave `last_row_id` pointing at an unrelated row, so the link was skipped or wrong.
- **Duplicate Social URL** shows "already submitted" instead of the raw constraint error.

## Not changed

- The pages still write from frontmatter rather than through the signed proxy. The proxy has intake routes for candidates and signals, but no transition, promotion or review routes. Moving them would need a Worker change and deploy, so this branch puts the proxy's guarantees (role, attribution, audit) on the page path instead.
- Refused (403) reader POSTs are not audited. The guard returns before any D1 access, as PR #7's boundary test requires.
- `/admin/ask` still shows readers a form that the server refuses (UX only).
- The promotion logic is otherwise unchanged: headline, evidence defaults, `source_id = 1` and re-promotion of a `published` candidate.

## Tests and evidence

| Check | Result |
|---|---|
| `tests/admin-page-writes.test.ts` (new, in `npm test`) | Passes. Covers: operator attribution on every write; one audit row per write; stale transitions and repeat decisions write nothing; promotion links an already-ingested feed item without duplicating it; **write rolled back when the audit row cannot be written**; approval creates no `knowledge_documents` row; readers and missing operators are refused before any statement; page frontmatter has no `'Admin'`, no direct `INSERT`/`UPDATE`/`DELETE`, and no `knowledge_documents`. **The page assertions fail on PR #7's pages** (red/green). |
| `npm test`, typecheck, `test:security`, `test:migrations`, `test:diff`, `npm run build` | All pass, including the D6 role-script check. |

**Unverified:**
- The conditional audit insert (`WHERE changes() = 1`) relies on D1 running a batch's statements in order on one connection, which the local SQLite adapter mirrors. It has not been exercised against real D1. A Preview check with a `[QA-…]` candidate would confirm it, but needs deployment approval.
- No browser QA.
