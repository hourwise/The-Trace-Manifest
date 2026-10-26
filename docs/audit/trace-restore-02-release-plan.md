# TRACE-RESTORE-02: consolidated implementation and release-readiness plan

**Prepared:** 2026-10-26, against `main` at `5a89059` (PR #10 merged; Production Pages `96624494`).
**Supersedes:** `docs/audit/trace-restore-01-release-plan.md` (held on PR #15 until now).
**Approvals:** nothing below is approved. Every merge, migration, deploy, flag change, import and email needs explicit owner approval at its own step. Local test success does not authorise any remote change.

## Current state (verified 2026-10-26)

| Item | Value |
|---|---|
| `main` | `5a8905966907a242520d56576e3e28c4215317e6` |
| Production Pages | `96624494` (`5a89059`); rollback `d98f8a84` |
| Production Worker | `d0479d92-8d8c-4f74-8869-4f1a5d747342` (tag `c41b6b1`); rollback `44a2d49d` |
| Preview Worker | `d8e4d10c-209f-45b5-9d0f-d30c46a0d4a3` |
| Cron | `[]` on both Workers (read-only API check); tracked `wrangler.worker.toml` declares `crons = []` for the top level and `env.preview` |
| Public Ask / editorial AI | Off (`TRACE_AI_PUBLIC_ENABLED = "false"`, both environments) / on |
| Production cleanup | Complete (PR #16 records it): 10 archived, 6 withdrawn; pending 1779 → 1769, published 98 → 92, other counts unchanged |

## Pull requests

| PR | Head | Base | State | Purpose |
|---|---|---|---|---|
| #11 | `6b7010c` | `main` | Draft, mergeable, CI green | TRACE-EDITORIAL-DEDUPE-R1, migration 0077 |
| #12 | `761b773` | #11's branch | Draft, stacked | Reviewer duplicate-source visibility |
| #13 | `bb93ced` | `main` | Draft, mergeable, CI green | TRACE Weekly signup and outbox, migration 0078 (off) |
| #14 | `3983843` | #13's branch | Draft, stacked | TRACE Weekly drafts and approval, migration 0079 (dispatch off) |
| #15 | `4385cd9` | `main` | Draft, **not for merge as is** | Combined tree plus integration tests |
| #16 | `d100105` | `main` | Ready, docs only | Production cleanup record |
| This PR | — | `main` | Draft, docs only | Release plan, P3 compatibility, roadmap |

**What changed in TRACE-RESTORE-02:**
- **Conflicts with `main` (caused by #10) resolved** in #11 (`package.json`) and #13 (`package.json` and `BaseLayout.astro`), by ordinary merges. No commits were rewritten.
- **#12 and #14 synchronised** with their repaired parents; each diff still shows only its own work.
- **One real defect fixed** in #13 and #14: outbox rows were due from the database clock rather than the request or dispatch time.
- **New verification:**
  - migration tests for 0077, 0078, 0079 and all three together;
  - newsletter hardening (tampered tokens, per-request statement bounds, exact Resend request);
  - review UX for retired-only and ambiguous sources and keyboard-native controls;
  - dedupe cost per run and published-source reuse;
  - the Codex P3 contract.

## Release order

The order follows the code. Merging to `main` deploys Production Pages immediately, so any column or table that merged code **writes or reads unconditionally** must exist first. Disabled-by-default features may merge before their migrations.

| # | Step | Pages deploy | Worker deploy | Migration | Feature after the step | Owner approves | Smoke checks | Stop if | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Review and merge **#16** (docs) | Yes (no functional change) | No | No | — | Merge | Site 200s | Pages build fails | Previous Pages deployment |
| 1 | **0077 on Preview D1** | No | No | **0077** | Unused until code ships | The Preview migration | Postflight below | Preflight returns rows; any error | Re-run the two idempotent `CREATE INDEX` statements; otherwise leave unused (additive) |
| 2 | **0077 on Production D1** | No | No | **0077** | Unused until code ships | The Production migration (after step 1) | Postflight below | Same | Same; Time Travel only as a last resort (it rewinds unrelated writes) |
| 3 | **Merge #11** | **Yes:** Desk promotion now writes `primary_source_key` | No (yet) | Needs step 2 | Desk dedupe live | Merge | Desk loads; promoting a known URL on Preview shows the reuse notice (QA candidate); review queue unchanged; Access and 401 checks | 5xx on `/admin/desk`; promotion errors | Previous Pages deployment; the column stays harmless |
| 4 | **Production Worker deploy** from #11's merge commit | No | **Yes** | Needs step 2 | Clustering dedupe live (dormant: STOP-BURN) | The Worker deploy | Version tag = merge SHA; bindings (DB id, RAW_STORE); 4 secrets present; Cron `[]` | Cron not `[]`; a binding or secret missing | Roll back to `d0479d92` |
| 5 | Retarget **#12** to `main`, CI, merge | Yes | No | Uses 0077's index | Reviewer conflict view live | Merge | `/admin/review` publisher and reader; categories render; GET writes nothing; Desk notices | 5xx; any write on GET | Previous Pages deployment |
| 6 | **Merge #13** | Yes | No | **None needed while off** | Signup **off**; header shows **Daily Briefing** | Merge | Header and homepage honest; `/newsletter` closed; `/admin/newsletter` reports the migration as not applied | A Subscribe button appears; a form appears | Previous Pages deployment |
| 7 | Retarget **#14** to `main`, CI, merge | Yes | No | None needed while unused | Issue pages exist; dispatch off | Merge | `/admin/newsletter/issues` publisher-only; reader 403 | Reader access | Previous Pages deployment |
| 8 | Reduce **#15** to tests, CI, merge | Yes (tests only) | No | No | — | Merge | CI green | CI fails | Revert the PR |
| 9 | **Newsletter activation** | — | No | **0078, then 0079** | See the activation sequence | Each step separately | See below | Any failed confirmation or unsubscribe | Turn the flags off; addresses stay suppressed |

The editorial stream (steps 1–5) and the newsletter stream (steps 6–7) are independent; either may go first. Within each stream the order above is required.

## Migration release checks

All three are additive and forward-only. Each was verified locally:
- on a schema shaped like Production before it (through 0076, without 0069 or 0072);
- in both release orders;
- with and without 0069 (`tests/migration-0077.test.ts`, `migration-0078.test.ts`, `migration-0079.test.ts`, `migrations-0077-0079.test.ts`).

That is **local verification only.**
- **A Preview migration** needs its own approval and the Preview database identity check.
- **A Production migration** needs its own approval after a successful Preview run, a fresh Time Travel bookmark, and a quiet window.

**Target identity.** For Preview, `trace-manifest-db-preview`, whose id must equal `wrangler d1 info trace-manifest-db-preview`. For Production, `trace-manifest-db` (`--env production`), whose id must equal `wrangler d1 info trace-manifest-db --env production`. Refuse any mismatch.

| | 0077 editorial source identity | 0078 newsletter subscriptions | 0079 newsletter issues |
|---|---|---|---|
| File | `db/migration-0077-editorial-source-identity.sql` (PR #11) | `db/migration-0078-newsletter-subscriptions.sql` (PR #13) | `db/migration-0079-newsletter-issues.sql` (PR #14) |
| SHA-256 (LF, Git blob) | `9f59608442521d0789dc8ab93e9cd5f9e65df3555efb2604e681c857b6310bbb` | `57f990622190f3463df2f9aacd7cfc5d7867cc095f3dcf5f8d1fedd10d968799` | `ca75e5580025a1db35a112a27f356ff49659edfe49821e6494b2baeb79a17bed` |
| Changes | Adds `story_clusters.primary_source_key`; adds `UNIQUE INDEX idx_story_clusters_primary_source_key … WHERE primary_source_key IS NOT NULL`; adds `idx_story_cluster_members_feed_item_primary_cluster` (no-op where 0069 exists) | Adds tables `newsletter_subscribers`, `newsletter_signup_attempts`, `email_outbox`, and 3 indexes | Adds table `newsletter_issues`, and 1 index |
| Preflight (must return no rows) | `SELECT 'column', name FROM pragma_table_info('story_clusters') WHERE name='primary_source_key' UNION ALL SELECT 'index', name FROM sqlite_master WHERE type='index' AND name='idx_story_clusters_primary_source_key'` | `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('newsletter_subscribers','newsletter_signup_attempts','email_outbox')` | `SELECT name FROM sqlite_master WHERE name='newsletter_issues'` |
| Backup | `wrangler d1 time-travel info <db> [--env production]`: record the bookmark, plus `SELECT COUNT(*)` of `story_clusters` and `story_cluster_members` | Bookmark | Bookmark |
| Forward | `npx wrangler d1 execute <db> [--env production] --remote --file <file>` | Same | Same |
| Postflight | The column exists; `sqlite_master` shows the unique partial index **and** the reverse index; cluster and member counts unchanged; `EXPLAIN QUERY PLAN SELECT cluster_id FROM story_cluster_members WHERE feed_item_id IN (1,2)` uses the reverse index | The 3 tables and their indexes exist; all row counts 0 | The table and index exist; row count 0 |
| Stop criteria | Preflight rows; any error; counts changed | Any error | Any error |
| Recovery | **Interrupted after the `ALTER`:** re-run only the two `CREATE INDEX IF NOT EXISTS` statements (tested). **Otherwise:** the column is additive and unused by old code, so leave it. A whole-database Time Travel restore is a last resort that can erase unrelated writes, and needs its own approval. | Tables are unused while signup is off; leave them | Leave unused |

### Execution record

**Step 1: 0077 on Preview D1, applied 2026-10-26 (owner-approved, Preview only).**

| Check | Result |
|---|---|
| File | `git show 6b7010c:db/migration-0077-editorial-source-identity.sql`; SHA-256 `9f596084…bbb` (matches) |
| Target | `trace-manifest-db-preview`: `wrangler d1 info` id equals the committed id in `wrangler.toml` and `wrangler.worker.toml`; zero reads or writes in the preceding 24 h |
| Preflight | No rows. The reverse index from 0069 already existed on Preview, so the third statement was a no-op. |
| Bookmark | `000000d2-00000000-00005110-564688cff7d51ef30303c40b32a5b7d7` |
| Before | 127 clusters (126 draft, 1 published), 238 members, 129 feed items, 21 candidates, max cluster id 90201 |
| Forward | One `wrangler d1 execute --remote --file`: success, 1 attempt, 2 rows written (schema) |
| Postflight | `primary_source_key TEXT` (nullable) exists, with 0 keyed rows; `idx_story_clusters_primary_source_key` is unique and partial; the reverse index is present; all counts identical to before; both lookups use covering indexes; the 3 FTS triggers are intact; `PRAGMA foreign_key_check` returns 0 rows |
| Note | `PRAGMA quick_check` fails on D1 with `SQLITE_NOMEM` (code 7500): a platform limit, not part of this postflight. Use `foreign_key_check` and the explicit checks above. |

Production is unchanged. Nothing was merged or deployed.

## Worker deployment (#11)

- **Configuration:** tracked `wrangler.worker.toml` declares `crons = []` (top level and `env.preview`), so STOP-BURN stays in force on deploy. The dry run on the current Worker matches bindings `DB` (Production D1) and `RAW_STORE`, with 4 secrets.
- **Command:**
  - from a clean checkout of the merge commit: `npx wrangler deploy --config wrangler.worker.toml --env="" --strict --tag <merge-sha>`;
  - `--env=""` targets Production explicitly.
- **Check after deploying:**
  - `wrangler versions view <id>`: the tag, handlers, the D1 binding id, `RAW_STORE`, and the secrets `ADMIN_API_TOKEN`, `GITHUB_TOKEN`, `TRACE_AI_SCHEDULED_ENABLED`, `TRACE_INTERNAL_SERVICE_SECRET`;
  - the Cloudflare schedules API shows `[]`;
  - a signed admin read through the proxy returns 200.
- **Currently deployed:** `d0479d92` (read-only API, 2026-10-26). The operator must re-confirm it immediately before deploying and record it as the rollback target.

## Newsletter activation sequence (later; each step separately approved)

1. Approved privacy notice and consent wording (`docs/audit/trace-newsletter-privacy-review.md`, items 1–3).
2. Migration 0078: Preview first, then Production.
3. Email provider account and API key (owner-created), with a processor agreement.
4. Verified sending domain: SPF, DKIM and DMARC records exactly as the provider shows.
5. Pages secrets `TRACE_NEWSLETTER_SECRET` and `TRACE_EMAIL_API_KEY`; variables `TRACE_EMAIL_PROVIDER`, `TRACE_EMAIL_FROM`. Never committed.
6. **Preview smoke:**
   - turn on `TRACE_EMAIL_DELIVERY_ENABLED` and `TRACE_NEWSLETTER_SIGNUP_ENABLED` on Preview only;
   - sign up an owner address; receive and confirm; unsubscribe; re-subscribe;
   - check the outbox and admin counts.
7. Owner approval of Production activation; the same smoke with an owner address.
8. Migration 0079 and the issue workflow on Preview, then Production; generate, approve and mark ready a draft. **Dispatch stays off.**
9. An approved test issue to owner addresses only (`TRACE_NEWSLETTER_DISPATCH_ENABLED` on Preview), with delivery verified.
10. **Explicit approval before the first real issue to subscribers.**

No subscriber is collected and no email is sent before the step that allows it.

## Production cleanup record (#16)

PR #16's document agrees with the executed cleanup:
- 10 review clusters archived; 353's misleading `failed` audit row (2896) preserved;
- stories 381 and 384–388 withdrawn (audit 2917–2928), with public withdrawal pages under #10 (Pages `96624494`);
- pending review 1779 → 1769, published 98 → 92, other counts unchanged.

The 11 mis-linked Desk candidates (still `published`) and the ingestion drafts holding the intended stories are a **separate editorial reconciliation task**; nothing here deletes or re-promotes them.

## Codex P3 news import

See `docs/audit/trace-p3-import-compatibility.md`:
- **Contract intact:** the identity contract is unchanged, and pinned in a versioned fixture.
- **Four integration gaps:** two candidate identities; no Desk action for `held`; imported rows entering clustering; the sidecar schema needing its own migration.
- **Next interface:** the smallest safe hosted interface, a publisher-only signed proxy route.
- **Preview pilot handoff:** reconciled with Codex's proposal, without widening its scope.

## Blockers and external prerequisites

- **Owner approvals:** every merge; migrations 0077–0079 (Preview, then Production); the #11 Worker deploy; any Preview import pilot.
- **Newsletter:**
  - privacy notice and sender identity;
  - approved consent wording;
  - a provider account and processor agreement;
  - a verified sending domain;
  - the ICO fee;
  - a real confirmation test.
- **P3 hosted import:**
  - the gaps above (candidate identity alignment and a Desk `held` transition);
  - a numbered sidecar migration;
  - an authenticated route.
- **Reader browser QA** for #7 was deferred by the owner; reader rendering is covered by the render tests.

## Recommended next operational decision

Step 1 (0077 on Preview) is done; see the execution record. The next decision is **a Preview Desk smoke of #11's Access-gated preview build**, which binds Preview D1. It is one approved test promotion of a known URL: confirm the reuse notice, a single cluster, and an unchanged review queue. This is a Preview write and needs its own approval.

After that, in order:
1. 0077 on Production, then the #11 merge and Worker deploy;
2. the Codex P3 Preview fixture pilot. It needs #11/#12 and Preview 0077, and puts its first newly acquired, review-required candidates into the editorial review queue on Preview, with no publication.
