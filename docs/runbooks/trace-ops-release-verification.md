# TRACE operations: release verification and migration preflight

Operator guide for the TRACE-OPS-01 tools. They **only read and report**. None of them deploys, migrates, rolls back, enables Cron, imports, sends email or sends a POST. Every action they describe still needs the owner's approval for that exact action.

| Tool | What it does | Needs |
|---|---|---|
| `scripts/ops/release-verify.mjs` | Checks a release: deployment identity, public routes, anonymous Access protection, optionally Worker, bindings and Cron, and before/after database snapshots. | Node 24. Optional: `GITHUB_TOKEN` (`--github`), Cloudflare read token (`--cloudflare`). |
| `.github/workflows/post-deploy-verify.yml` | Runs the anonymous part automatically after a push to `main`. | Nothing beyond the workflow's own read-only `GITHUB_TOKEN`. Inert until merged. |
| `scripts/ops/migration-preflight.ts` | Checks a D1 migration locally and writes a plan for a person to run. | Node 24, `npm ci` (uses `tsx` and the repository's SQLite test harness). |

Statuses everywhere are **PASS**, **FAIL**, **NOT_VERIFIED** (could not be confirmed) and **NOT_RUN** (not attempted). A verdict is PASS only when every *mandatory* check passed. A mandatory check that could not run makes the verdict NOT_VERIFIED, never PASS.

Exit codes: `0` PASS, `1` a check failed, `2` mandatory verification incomplete, `3` usage or manifest refused.

## 1. Run the release check by hand

```bash
node scripts/ops/release-verify.mjs --manifest scripts/ops/manifests/example-pr19-production.json --github
```

- **Manifest** (`scripts/ops/manifests/*.json`):
  - the target (`production` or `preview`, never implied) and the full expected commit;
  - the approval reference (recorded, not verified), the expected Pages deployment and Worker version if known;
  - expected bindings, the expected Cron (`[]` while STOP-BURN holds), and whether a database comparison is mandatory;
  - copy an example and edit it for each release.
- **Profile** (`scripts/ops/profiles/production.json`): the allowlisted host, the routes and their expected content, and the request limits. Change a route only when the site really changed (for example if the configured story is withdrawn).
- **Flags:**
  - `--commit <sha>` fills a manifest whose `expected_commit` is `null`, which is how the workflow uses it;
  - `--github` reads Cloudflare's "Cloudflare Pages" check run on the commit, polling for at most 20 × 30 s, plus whether `main` has since moved;
  - `--cloudflare` is manual mode (§ 4);
  - `--offline` runs no network checks;
  - `--out-dir <dir>` sets where receipts are written (default `ops-receipts/`, git-ignored).

Each run writes `release-<target>-<commit>-<time>.json` (the receipt) and a matching `.md` report, and prints the receipt's SHA-256. Keep both with the release record.

## 2. Read the receipt

- **`verdict`:** the one-line result. `stop_conditions` lists what was raised, for example `ADMIN_EXPOSED`, `PUBLIC_ROUTE_UNAVAILABLE`, `PUBLIC_CONTENT_UNEXPECTED`, `ACCESS_BEHAVIOUR_CHANGED`, `DEPLOYMENT_FAILED`, `WORKER_VERSION_MISMATCH`, `CRON_NOT_EXPECTED` or `UNEXPECTED_DATABASE_CHANGE`. Any stop condition means: **stop, do not continue the release, investigate**. None of them is fixed automatically.
- **`checks[]`:** per check, `mandatory`, `status`, a one-line `summary`, `evidence` (status codes, observed ids, attempts) and timestamps.
- **`identities`:** the expected and observed commit, Pages deployment and Worker version.
- **`request_budget`:** how many requests each channel used, against its cap.
- **`evidence_files`:** SHA-256 of the manifest, profile and any snapshot files used.

**Missing deployment identity.** A merge is not a deployment.
- **`deployment.reported` PASS:** Cloudflare's GitHub app reported a successful deployment for exactly this commit, with its deployment id.
- **`deployment.reported` NOT_VERIFIED:** no completed report within the window. Wait, then rerun or check the Cloudflare dashboard.
- **`deployment.branch_head` NOT_VERIFIED:** `main` moved on, so the site may be serving a later commit.
- **`deployment.serving`:** whether Production is *actually serving* that deployment. It is only confirmed in Cloudflare mode; otherwise it stays NOT_VERIFIED.

Public routes are checked either way. They show what is served now, which may not be the expected commit when the deployment is unverified.

## 3. Compare database snapshots

The tool never queries a database. You run the snapshot SQL yourself before and after the release, then give it the two files:

```bash
npx wrangler d1 execute trace-manifest-db --env production --remote --json --file scripts/ops/release-snapshot.sql
```

Run that once before the release and save the output as `before.json`, and once after as `after.json`. Then:

```bash
node scripts/ops/release-verify.mjs --manifest <manifest> --offline --before before.json --after after.json
```

Every metric is classed UNCHANGED, EXPECTED (approved in `database.approved_changes`), UNEXPECTED or UNVERIFIED.

Signed Worker admin requests write audit rows even for reads, and the method is not recorded. Audit growth is therefore UNVERIFIED until you supply the delta:

```bash
node scripts/ops/release-verify.mjs --print-audit-delta-sql <audit.max_id from before.json>
```

Run the printed query, save it as `audit-delta.json`, and add `--audit-delta audit-delta.json`. Audit growth becomes EXPECTED only if every new row is an allowlisted `admin_route` row and no editorial metric changed. An editorial write hiding inside audit growth is UNEXPECTED.

## 4. Cloudflare manual mode (additional authority)

`--cloudflare` reads, with GET only:
- the latest Production Pages deployment;
- the Worker's active version and its bindings;
- the Cron schedules of both Workers.

It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` **in the environment of that shell**, supplied by you. The tool never reads Wrangler's stored login or any other credential store, and never prints the token.

Without them, the checks are NOT_VERIFIED. Because you asked for this mode, that keeps the verdict from passing. Use a token restricted to read permissions (§ 7).

## 5. The GitHub workflow

**Trigger:** once `.github/workflows/post-deploy-verify.yml` is on `main`, every push to `main` starts it. To rerun for a commit: Actions → "Post-deploy verification (read-only)" → Run workflow → the full commit SHA (this works only once the file is on `main`).

**It:**
- validates the commit;
- waits for the Cloudflare Pages report;
- checks the public routes and the Access protection;
- writes the report to the job summary and keeps the receipts as an artifact for 30 days.

**Result:**
- **Regression (exit 1):** the job fails with "Regression detected".
- **Deployment never established (exit 2):** the job also fails, with "Not verified": a delay is never a pass.

**Bounds:**
- read-only permissions (`contents: read`, `checks: read`) and no Cloudflare secrets;
- a 20-minute timeout and no schedule;
- redirects are never followed and only `thetracemanifest.com` is contacted;
- at most 19 site GETs and 21 GitHub API reads per run.

## 6. Prepare a migration

```bash
npx tsx scripts/ops/migration-preflight.ts --manifest scripts/ops/manifests/migration-0080-preview.json
```

Run it from the repository root, with the migration file present in `db/`.

**The manifest names:**
- the environment (no default), the database name and UUID, and the file with its exact SHA-256 (the Git blob bytes; a CRLF checkout is accepted and reported);
- prerequisites, any migrations to simulate first, and every object the migration creates;
- approved non-additive statements, and postflight queries;
- `approval` must be `null`.

**Checks, all local:**

| Check | What it verifies |
|---|---|
| Target identity | The manifest's database matches `wrangler.toml` for that environment, and is not the other environment's database |
| Migration identity | The file's exact SHA-256 matches the manifest |
| Reserved numbers | 0072 is refused |
| Allocation | The number is not used by a different file on any local or remote-tracking branch |
| Ordering | The number is after the highest migration on `origin/main` |
| Prerequisites | Each is present and earlier |
| D1 compatibility | No transaction control, PRAGMA, ATTACH or VACUUM |
| Additive only | Unless an exception is approved |
| Conflicts | No created object collides with an existing one, including different definitions that `IF NOT EXISTS` would silently skip |
| Simulated apply | The migration applies to the current schema with representative published, withdrawn, held and audit data |
| Expected objects | Every declared object exists, and nothing undeclared was created |
| Integrity | `foreign_key_check` and `integrity_check` |
| Data preservation | Existing rows in their original columns are unchanged |
| Re-application | What happens if the file is run twice |
| Interruption | For every statement: if application stopped there, does re-running the whole file work, and does running the remainder work? |
| Postflight | The plan's queries run as declared |

**Output:**
- a receipt (`.json`) and a report (`.md`);
- an **execution manifest** with `approval`, `approved_by`, `approved_at` and `execution_window_utc` all `null`;
- an 8-step plan:
  1. identity;
  2. not-yet-applied check;
  3. Time Travel bookmark;
  4. baseline counts and snapshot;
  5. apply;
  6. schema check;
  7. preservation check (`foreign_key_check`; never `quick_check`, which fails with SQLITE_NOMEM on D1);
  8. receipt.

  It includes per-statement recovery notes if application is interrupted.

**The plan is text.** No mode of the tool executes it. A whole-database Time Travel restore is never a plan step; it is a separately approved last resort.

## 7. Future: daily drift monitor (design only, not built)

Not created by TRACE-OPS-01. It needs the owner's approval of a token, a schedule and a request budget.

- **Watches:**
  - the Production and Preview Worker active versions against the last recorded release receipt;
  - Cron schedules equal `[]` on both Workers;
  - the Pages Production deployment against `main`;
  - the D1 schema fingerprint (`schema.objects` and `schema.object_count` from `release-snapshot.sql`) against the last approved migration receipt;
  - daily Workers, Pages Functions and D1 read volume against a ceiling.
- **Cadence:** once a day; a manual dispatch for spot checks.
- **Requests per run (estimate):** Worker deployments 2, schedules 2, Pages deployments 1, D1 schema query 2 (Preview and Production), analytics 1, giving **about 8 Cloudflare API requests a day**. The D1 queries read only `sqlite_master`, so a few hundred rows.
- **Minimum token (read):** Account › Workers Scripts: Read; Account › Cloudflare Pages: Read; Account › Account Analytics: Read.
  - **D1 is the exception.** Running a schema query uses D1's query endpoint (a POST), which a read-only token may not be allowed to call. If it needs D1 edit permission, that token can also write. Keep the D1 part manual, or use a separate token limited to the two databases, approved on its own.
  - Verify the exact permission names in the Cloudflare dashboard before creating anything.
- **Where it runs:** a scheduled GitHub Action holding the read token as a repository secret, or a local scheduled task. Either way it is a new standing configuration that needs explicit approval.
- **Alerting:** fail the job; GitHub's own failure notification is the alert. It does not open issues or post messages, which would be writes. The job summary carries the receipt.
- **Never:** deploy, roll back, change Cron, run SQL other than the fixed SELECTs, or retry indefinitely.

## 8. What needs additional authority

| Check | Why | Authority needed |
|---|---|---|
| `deployment.serving`, `worker.*`, `cron.*` | Cloudflare API | A read token supplied by the owner for a manual run |
| Database snapshots | Remote D1 query | An owner-run `wrangler d1 execute` (or an approved token) |
| Live database identity (migration plan step 1) | Remote D1 metadata | A person, after approval |
| Applying any migration | Changes the database | Separate owner approval of the exact execution manifest |
