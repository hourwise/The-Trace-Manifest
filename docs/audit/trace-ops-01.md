# TRACE-OPS-01 — release verification, deployment monitoring and migration preflight

**Executor:** Claude Code. **Date:** 2026-10-28. **Base:** `main` `9da92ece6d51d1bfeed9b7eb1289f891a548421c` (verified at start).
**Branch:** `claude/trace-ops-01-automation` in `D:\Users\fleur\trace-ops-01`. Not pushed, not merged.

**Result:** all three tools are built and tested offline.
- One command produces a release receipt.
- The proposed workflow detects every representative regression without credentials or writes.
- Migrations 0080, 0078 and 0079 were prepared locally without being applied.
- Missing verification is never classed as success.

No remote system was contacted or changed.

The operator guide is `docs/runbooks/trace-ops-release-verification.md`.

## A. Release smoke CLI

`scripts/ops/release-verify.mjs` (plain Node 24, no dependencies), with `lib/report.mjs`, `lib/http.mjs`, `lib/site-checks.mjs`, `lib/deployment.mjs`, `lib/snapshot.mjs`, `lib/manifest.mjs` and `release-snapshot.sql`.

```bash
node scripts/ops/release-verify.mjs --manifest <file> [--commit <sha>] [--github] [--cloudflare]
     [--before <json> --after <json> [--audit-delta <json>]] [--offline] [--out-dir <dir>]
node scripts/ops/release-verify.mjs --print-snapshot-sql | --print-audit-delta-sql <id>
```

| Milestone | Behaviour |
|---|---|
| A1 Identity | Release manifest (`trace-release-manifest-v1`): exact known fields only; target exactly `production` or `preview`; full 40-character commit; required approval reference (recorded, marked not verified); optional expected Pages deployment and Worker version and bindings; Cron must be `[]`; database scope. A merge is never treated as a deployment. |
| A2 Public routes | Homepage, `/feed`, `/rss/daily.xml`, a configured published story (no notice, no `noindex`) and a configured withdrawn story (the `data-retired-notice="withdrawn"` notice and `noindex`). Status, content type and markers are checked, so a generic 200 is not enough. Exact host allowlist, HTTPS only, 10 s timeout covering the body, 1.5 MB cap, at most 2 retries for transient 5xx or timeouts. |
| A3 Access | Anonymous **GET only** to `/admin`, `/admin/desk`, `/admin/review`, `/api/admin/candidates`. PASS only for a redirect to `*.cloudflareaccess.com/cdn-cgi/access/login/thetracemanifest.com`. A 2xx is `ADMIN_EXPOSED` (no retry); a 403, a foreign or look-alike redirect, or a 5xx fails. Redirects are never followed. No credentials are used. |
| A4 Worker and Cron | Manual `--cloudflare` mode, GET only, with operator-supplied `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`: Production Pages deployment, Worker version at 100%, bindings, and both Workers' schedules equal `[]`. Without credentials: NOT_VERIFIED (mandatory when the mode was requested). Credentials are never retrieved automatically, and the token never reaches a receipt (tested). |
| A5 Snapshots | Offline comparison of operator-supplied `wrangler --json` outputs of `release-snapshot.sql` (clusters by status, pending review, publishable, keyed, members, feed items, candidates by state, active sources, ingestion jobs, Cron runs, audit count and max id, schema fingerprint). Each metric is classed UNCHANGED, EXPECTED, UNEXPECTED or UNVERIFIED. Audit growth is EXPECTED only with an audit-delta file showing allowlisted `admin_route` rows and no editorial change, because signed Worker reads write audit rows and the method is not recorded. |
| A6 Receipts | JSON (`trace-release-receipt-v1`) and Markdown: target, identities, checks with mandatory flag, status, summary, evidence, attempts and timestamps, skipped checks, stop conditions, request budgets, evidence-file hashes, tool source hashes, verdict. Repository-relative paths only. |

## B. GitHub workflow

`.github/workflows/post-deploy-verify.yml`, new; `ci.yml` is unchanged.

- **Trigger:** `push` to `main`, plus `workflow_dispatch` with a full commit SHA. **Inert until merged.** No schedule.
- **Permissions:** `contents: read`, `checks: read`, `persist-credentials: false`. No secrets other than the job's own `GITHUB_TOKEN`; no `npm ci`, no Wrangler.
- **Behaviour:**
  1. Validate the commit.
  2. Poll Cloudflare's "Cloudflare Pages" check run (at most 20 × 30 s).
  3. Read whether `main` moved.
  4. Run the public and Access checks.
  5. Write the Markdown to the job summary and keep the receipts for 30 days.
- **Result:** fails on a regression (exit 1) **and** on unverified mandatory checks (exit 2), with distinct messages: a delayed deployment is never a pass.
- **Budget per run:** at most **19** GETs to `thetracemanifest.com` (5 routes × up to 3 attempts + 4 admin GETs; typically 9) and at most **21** GitHub API reads (typically 2). Timeout 20 minutes; typically about 2 minutes.

Mock-HTTP failure tests (B3, `tests/ops/release-verify.test.mjs`):
- homepage 5xx → FAIL after 3 bounded attempts; a transient 503 that recovers → PASS, reported as "recovered";
- RSS 404 or wrong content type → FAIL;
- an admin route returning 200 → FAIL `ADMIN_EXPOSED`, requested once;
- Access replaced by a 403, a foreign redirect, a non-login Access path or a look-alike host → FAIL;
- deployment not established within the window → NOT_VERIFIED, exit 2 (20 polls exactly); a deployment completing on poll 3 → PASS;
- malformed page or a withdrawn page without `noindex` → FAIL;
- a timeout aborts at the bound → FAIL;
- a redirect outside the allowlist → FAIL, not followed;
- body over the cap → truncated and refused.

## C. Migration preflight

`scripts/ops/migration-preflight.ts` (run with `tsx`) and `lib/sql.mjs`. It reuses the repository's SQLite D1 test harness as "the current schema"; no second migration framework.

**Checks:** target identity against `wrangler.toml` (including crossed environments); exact SHA-256 (CRLF-only differences accepted and reported); 0072 reserved; allocation across all local and remote-tracking refs; ordering after `origin/main`; prerequisites; D1 compatibility; additive-only; object conflicts (including silent `IF NOT EXISTS` skips); simulated apply on representative data; declared versus created objects; foreign keys and integrity; data preservation; re-application; interruption analysis per statement; postflight queries run locally.

**Output:**
- a receipt;
- a report;
- an execution manifest with `approval`, `approved_by`, `approved_at` and `execution_window_utc` all **null**;
- an 8-step command plan with per-statement recovery notes.

**Safety:**
- no remote access, and no executor;
- the only process started is `git` with `for-each-ref` and `ls-tree` (tested);
- a Time Travel restore is never a plan step.

**Demonstrated fail-closed** (`tests/ops/migration-preflight.test.ts`):
- wrong UUID, crossed environment, or a missing or implicit environment;
- non-null approval;
- SHA mismatch;
- 0072;
- a duplicate number on another branch;
- bad ordering;
- `DROP`, an unapproved `UPDATE` (also caught by data comparison);
- `BEGIN`, `PRAGMA`, `VACUUM`;
- index name conflicts, including a silent `IF NOT EXISTS` skip;
- undeclared or missing objects.

**Real local runs** (the files were read from Git into the worktree for the run and removed afterwards; nothing applied):

| Migration | Verdict | Statements | Notes |
|---|---|---|---|
| 0080 (Codex candidate `2ad59cc`, `7cff2245…`) | PASS, 17/17 | 31 | Not idempotent: no `IF NOT EXISTS`, so a full re-run after an interruption fails at all 30 points; running the remaining statements recovers at every point. Useful for Codex's P4-R2. |
| 0078 newsletter subscriptions (`57f99062…`) | PASS, 17/17 | 6 | Idempotent |
| 0079 newsletter issues (`ca75e558…`, after 0078) | PASS, 17/17 | 2 | Idempotent |

## D. Operational receipts

Examples are in `docs/audit/trace-ops-01-examples/`:
- `release-pass.{json,md}` and `release-fail-admin-exposed.{json,md}`, generated from **mocked** responses and labelled as such;
- `preflight-0080-preview.{md,execution-manifest.json}` and `preflight-0078-preview.*`, from the real local runs.

## E. Regression results

Full `npm run ci` on the branch: **passes** (exit 0).

| Step | Result |
|---|---|
| Diff check | Pass |
| Typecheck (`astro check`, Worker `tsc`) | 0 errors. A first run found 21 type errors in the new code (types inferred from `.mjs` defaults); fixed with JSDoc types. |
| `npm test` (all existing suites, including Capture's 119 checks, #18 and #19) | Pass |
| New `test:ops` (now part of `npm test`) | **32 of 32**: release verifier 22, migration preflight 10 |
| `test:migrations` (`validate-migrations`, legacy migration) | Pass |
| `test:security` (265 source files and Git history) | Pass |
| Evidence policy, knowledge markdown, build, route and role verification, story render, review render | Pass |

Skipped: none. Unverified:
- no live run against Production (not authorised);
- no Cloudflare API call;
- the workflow has not run on GitHub (it can only run after merge);
- the Cloudflare permission names for the drift monitor are unconfirmed.

The ops tests use only injected mock HTTP, temporary scratch roots and the local SQLite harness. They are independent of the P4 fixtures and of the `D:` evidence. The one test that reads Git (allocation of 0077) needs a checkout with `origin/main`, which `ci.yml` provides (`fetch-depth: 0`).

## F. Resource assessment

| Channel | Per workflow run | Per manual run | Notes |
|---|---|---|---|
| Public site GETs | at most 19 (typically 9) | the same | Admin GETs stop at Cloudflare Access at the edge; the 5 public pages are rendered by Pages Functions with D1 reads |
| GitHub API | at most 21 (typically 2) | the same with `--github` | Unauthenticated limit is 60 an hour, so pass `GITHUB_TOKEN` when running by hand |
| Cloudflare API | 0 | at most 5 (cap 8) with `--cloudflare` | GET only |
| Remote D1 | 0 | 0 (snapshots are operator-run) | Each snapshot is one SELECT over a few core tables (several thousand rows read on Production; not measured) |

**Cost:** about 5 Pages Function invocations per merge, plus the D1 reads of five page renders. Negligible against the free tiers. GitHub Actions: typically about 2 minutes per merge, at most 20.

## G. Changed files

32 files, +3,563/−1. Uncommitted at the time of writing; the commit is reported in the closing message.

- **Tools:** `scripts/ops/release-verify.mjs`, `scripts/ops/migration-preflight.ts`, `scripts/ops/lib/{report,http,site-checks,deployment,snapshot,manifest,sql}.mjs`, `scripts/ops/release-snapshot.sql`, `scripts/ops/fixtures/preflight-seed.sql`.
- **Configuration:** `scripts/ops/profiles/production.json`; `scripts/ops/manifests/{post-merge-production,example-pr19-production,migration-0080-preview,migration-0078-preview,migration-0079-preview}.json`.
- **Workflow:** `.github/workflows/post-deploy-verify.yml`, new.
- **Tests:** `tests/ops/release-verify.test.mjs`, `tests/ops/migration-preflight.test.ts`.
- **Docs:** `docs/runbooks/trace-ops-release-verification.md`, this report, `docs/audit/trace-ops-01-examples/` (8 files).
- **Modified:**
  - `package.json`: new `test:ops`, `verify:release` and `preflight:migration` scripts placed before `ci`, so the `ci` line is untouched; `npm test` ends with `&& npm run test:ops`;
  - `.gitignore`: `ops-receipts/`.

`ci.yml`, P4 code, migration 0080, Codex's branches and all other worktrees are untouched. No migration file was added to `db/`.

## H. Future drift monitor

Designed in the runbook, § 7; **not built**.
- **Cadence and budget:** daily, about 8 Cloudflare API reads a run.
- **Token:** read-only (Workers Scripts, Pages, Account Analytics). D1 schema queries go through a POST query endpoint that may need a write-capable token, so that part stays manual or uses a separately approved, database-scoped token.
- **Alerting:** the job's own failure notification; no issues or messages.

## I. Recommendation

The automation branch is ready for independent review and a Draft PR. Pushing it would not activate the workflow: it runs only after merge to `main`.

Before merging, the owner should approve introducing an automatic read-only check on every push to `main` (at most 19 site GETs and 21 GitHub reads a run). The first live use of the release tool on Production also needs approval (anonymous GETs); it was not run here.

For Codex's revised 0080, update `scripts/ops/manifests/migration-0080-preview.json` (SHA-256 and objects) and run the preflight before the separately approved Preview migration.
