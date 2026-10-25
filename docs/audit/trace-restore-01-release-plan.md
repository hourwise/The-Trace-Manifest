# TRACE-RESTORE-01: consolidated release plan

**Prepared:** 2026-10-25, from `main` at `c41b6b1`.
**Approvals:** none of the steps below has been approved. Every merge, migration, deploy, flag change and Production write needs explicit owner approval at its own step.

## Deliverables

| PR | Branch | Head | Base | State | CI |
|---|---|---|---|---|---|
| #10 Withdrawn and superseded story pages | `claude/trace-withdrawn-story-pages` | `b276580` | `main` | Ready for review | validate, secret-scan, Pages ✅ |
| #11 TRACE-EDITORIAL-DEDUPE-R1 | `claude/trace-editorial-dedupe-r1` | `f2ff849` | `main` | Draft (gated on 0077) | ✅ |
| #12 Review duplicate-source visibility | `claude/trace-review-source-visibility` | `331391a` | #11's branch | Draft, stacked | ✅ |
| #13 Newsletter signup and outbox | `claude/trace-newsletter-signup` | `4cf8ac2` | `main` | Draft (external prerequisites) | ✅ |
| #14 Weekly issue drafts | `claude/trace-weekly-issue-drafts` | `0c676b2` | #13's branch | Draft, stacked | ✅ |
| Integration (this branch) | `claude/trace-restore-01-integration` | see PR | `main` | Draft, **not for merge as is** | — |

`validate` runs the full `npm run ci`, including the post-build render tests.

**What the integration branch proves:** it merges #10 → #11 → #12 → #13/#14 into `main` in that order, and the full `npm run ci` passes on the combined tree. It also carries the end-to-end lifecycle test and these documents.

**Expected conflicts when merging the PRs one by one:**
- `package.json` `test`/`ci` lines: keep the union of both sides;
- the migration lists in `tests/sqlite-d1.ts` and `scripts/validate-migrations.mjs`: keep both sides, ordered 0077 → 0078 → 0079;
- `src/layouts/BaseLayout.astro` props: keep `noindex` and the newsletter lines.

A PR whose base branch has been merged must be retargeted to `main` and must pass CI again.

## Recommended order

| Step | Change | Deploys | Migration | Worker | Smoke checks | Rollback |
|---|---|---|---|---|---|---|
| 1 | **Merge #10** | Production Pages | none | no | `/stories/hugging-face-hub-migrates-from-git-lfs-to-xet-storage` returns 200 with the withdrawn notice, historical labels and `noindex`; it is absent from `/`, `/feed`, `/rss/daily.xml`; a current story is unchanged; Access and 401 checks; Cron `[]` | Previous Pages deployment (now `d98f8a84`) |
| 2 | **Cleanup:** withdraw 384–388 (separate approval) | none (audited proxy calls) | none | no | Each returns 200 with `allowed`/`succeeded` audit rows; then the baseline verification (pending 1779 − 10, published 98 − 6, other counts unchanged, public pages show the withdrawn notice) | Snapshot-based SQL (separate approval); bookmark `00003f20-…a82e030914` as a last resort |
| 3 | **Apply 0077** to Preview D1, then Production (bookmark first) | — | **0077** (additive) | — | Column `primary_source_key`; unique partial index; reverse membership index | Leave the column unused (additive) |
| 4 | **Merge #11** | Production Pages (Desk promotion) | needs 0077 first | **yes:** `wrangler deploy --config wrangler.worker.toml --env="" --strict --tag <sha>` | Desk loads; promoting a known URL shows a reuse notice (Preview `[QA]` only); Worker version, bindings and secrets; Cron `[]` | Pages: previous deployment; Worker: the version before the deploy (now `d0479d92`) |
| 5 | **Retarget #12 to `main`**, CI, merge | Production Pages | uses 0077's index | no | `/admin/review` loads for publisher and reader; categories and conflicts appear for the 8 known multi-cluster items | Previous Pages deployment |
| 6 | **Merge #13** (safe before 0078) | Production Pages | none needed while gated | no | The header shows **Daily Briefing**; the homepage panel says "in preparation"; `/newsletter` shows the closed state; `/admin/newsletter` shows "migration not applied" | Previous Pages deployment |
| 7 | **Retarget #14 to `main`**, CI, merge | Production Pages | none needed while unused | no | `/admin/newsletter/issues` publisher-only | Previous Pages deployment |
| 8 | **Enable TRACE Weekly** (later) | — | **0078**, then **0079** | no | Follow `docs/audit/trace-newsletter-signup.md` steps 1–8; a real confirmation delivered on Preview first | Set `TRACE_NEWSLETTER_SIGNUP_ENABLED`/`TRACE_EMAIL_DELIVERY_ENABLED` to `false` |

**Disabled after all merges:**
- email signup (`TRACE_NEWSLETTER_SIGNUP_ENABLED`);
- email delivery (`TRACE_EMAIL_DELIVERY_ENABLED`);
- issue dispatch (`TRACE_NEWSLETTER_DISPATCH_ENABLED`);
- public Ask;
- Cron and scheduled ingestion (STOP-BURN); scheduler 0072.

## Blocked on external items or human decisions

- **Owner approvals:** every merge, the three migrations, the Worker deploy, and the cleanup withdrawals.
- **Email:**
  - a provider account and API key;
  - a verified sending domain (SPF, DKIM and DMARC records);
  - approval of the consent and privacy text, or a fuller privacy policy;
  - a first real delivery test.
- **Reader browser QA** for #7 was deferred by the owner; reader rendering is covered by the render tests in #10 and #12.
- **Structured withdrawal reasons** would need a schema decision; today the reason is prose in the analysis (#10 audit note).

## Verification on the integrated tree

`npm run ci` passes on the integration branch:
- `test:diff` and typecheck (Astro and Worker);
- `npm test` (39 suites, including the new dedupe, review-source, newsletter, issue and lifecycle tests);
- `test:migrations` (0077 with and without 0069, plus 0078 and 0079);
- `test:security`, `test:evidence-policy`, `test:knowledge-markdown`;
- `npm run build` and four post-build render suites (story pages, review and Desk, newsletter, issue pages).

**`tests/trace-restore-01-lifecycle.test.ts` covers, on one D1-faithful database:**
- discovery → clustering with a source key → Desk promotion reusing it → idempotent re-run → pending queue without a false conflict → Worker publication → public page and listing;
- a legitimate follow-up as its own story; promotion-first then ingestion as one cluster;
- signup → confirm → weekly draft of the published story only → approve → ready → gated dispatch → outbox send with an issue link;
- withdrawal: the story stays public as withdrawn, leaves listings and future issues, and can't be re-ingested through a tracking-parameter variant;
- unsubscribe, which removes the address.

**Guardrails checked against `main`:**
- no change to `wrangler.worker.toml` or the Cron triggers; nothing new scheduled;
- no change to the public Ask or AI gateway code;
- the Worker diff is limited to `cluster.ts` and `dedup.ts`.

## Next development milestone

**TRACE-ACQUISITION-R1: fresh, evidence-backed news, safely.**
1. Release #11 (0077 and the Worker).
2. Measure Preview D1 consumption for a bounded manual ingestion cycle (feeds → classify → cluster with source identity → review queue), with the scheduler still off.
3. Connect the separately governed local news collector (Codex's local acquisition work) through the same source identity and outbox-style bounded writes.
4. Restore a reviewed daily publishing cadence through the D4 review workflow.
5. Only then consider scheduler 0072 under explicit approval.

This needs the Codex local-acquisition worktrees and Production resources, so it is **not started** here.
