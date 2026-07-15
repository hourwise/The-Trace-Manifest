# LAUNCH-05 Cloudflare Configuration Audit

Status: complete with launch-blocking configuration findings. This audit records repository evidence and the non-secret Cloudflare dashboard fields available from the operator.

Task: LAUNCH-05 - Audit Cloudflare Access, bindings, origins and role allowlists without exposing secrets.

## Non-secret dashboard evidence received

Production D1 database shown in repository and dashboard:

```text
Name: trace-manifest-db
ID: 1625036a-ffe2-4103-bf9d-086bae150561
Observed state: existing database with activity, 17 tables and 1.65 MB storage from metrics view; D1 list later showed 12.99k queries and 1.62 MB storage.
Created at: Jul 12 2026, 7:21PM
Latest metrics page observation: 4k total queries, 416k rows read, 6k rows written, 1.65 MB current storage, 17 tables.
Region shown: Western Europe (WEUR)
Latency shown: P50 0.19 ms
```

Production D1 workload evidence:

```text
The D1 metrics query table shows active ingestion, deduplication, cross-source matching, source-health, cron-run and classification SQL.
The highest-read query is the feed_items candidate scan used by cross-source matching / semantic comparison.
The query table is not a Cloudflare configuration checklist; it is runtime SQL telemetry from the application.
```

Source-code mapping for observed D1 queries:

- Feed item candidate scan with `title`, `summary` and `content_excerpt`: `workers/ingestion/cross-source-match.ts` and `workers/ingestion/semantic-dedup.ts`.
- URL hash lookup: `workers/ingestion/dedup.ts`.
- `ingestion_jobs` insert/update rows: `workers/ingestion/index.ts`.
- `cron_runs` insert rows and source cadence query: `workers/ingestion/index.ts`.
- `crossSourceMatch` JSON metadata update: `workers/ingestion/cross-source-match.ts`.
- `ingestion_status='classified'` updates: `workers/ingestion/classify.ts`.

Preview D1 database shown in dashboard:

```text
Name: trace-manifest-db-preview
ID: f312f662-2252-4005-8103-1a40d546e16b
Observed state: empty database, 0 tables, 0 queries and 12.29 kB storage from metrics view; D1 list later showed 0 tables and 8.19 kB storage.
Created at: Jul 15 2026, 1:32PM
```

Pages project dashboard evidence received:

```text
Project name: the-trace-manifest
Production branch: main
Production deployments: automatic deployments enabled
Production domains: thetracemanifest.com, www.thetracemanifest.com, the-trace-manifest.pages.dev
Latest observed production deployment: commit 26f01806ebf31d6a9e222486329935b116604d8c, f6296a5e.the-trace-manifest.pages.dev
Git repository: hourwise/The-Trace-Manifest
Build command: npm install && npm run build
Build output directory: dist
Root directory: unset
Build comments: enabled
Build cache: disabled
Build watch include paths: *
Build system version: 3
Deploy hook: production-deploy for main exists; full webhook URL was provided by the operator but is intentionally not recorded because deploy-hook URLs can trigger deployments.
Runtime compatibility date: Jul 12, 2026
Runtime compatibility flags: none
Runtime fail mode: fail open
```

Pages production variables and secrets observed:

```text
Secret names present: ADMIN_API_TOKEN, DEEPSEEK_API_KEY
Plaintext variables present:
  TRACE_AI_EDITORIAL_ENABLED=false
  TRACE_AI_GLOBAL_KILL_SWITCH=false
  TRACE_AI_PUBLIC_ENABLED=false
  TRACE_AI_SCHEDULED_ENABLED=false
  TRACE_ALLOWED_ORIGINS=https://thetracemanifest.com
  TRACE_ENVIRONMENT=production
```

Ingestion Worker dashboard evidence received:

```text
Worker name: trace-manifest-ingestion
Worker public origin: https://trace-manifest-ingestion.philgeran.workers.dev
Production D1 binding: DB -> trace-manifest-db / 1625036a-ffe2-4103-bf9d-086bae150561
R2 binding: RAW_STORE -> trace-manifest-raw
R2 observed state: 0 objects, 0 B
Cron triggers: 0 18 * * *; 0 */3 * * *; 0 6 * * *; 0 9 * * *; */30 * * * *
Email triggers: none
Workers Logs: disabled
Workers Traces: disabled
Worker exports: disabled
Worker sampling: disabled
Tail Worker: none connected
Worker runtime placement: default
Worker runtime compatibility date: Jul 12, 2026
Worker runtime compatibility flags: nodejs_compat
Worker cache: disabled
Worker secret names present: ADMIN_API_TOKEN
```

No Cloudflare API token, Access JWT, HMAC secret, provider key, or plaintext secret was provided.

Operator final dashboard statement:

```text
Zero Trust / Access: nothing set up.
Pages secrets, Pages bindings and Worker variables that the operator could find have been shared above.
```

## Repository evidence

Pages configuration:

- `wrangler.toml` binds `DB` to production-looking D1 database `trace-manifest-db` / `1625036a-ffe2-4103-bf9d-086bae150561`.
- `wrangler.toml` production variables set:
  - `TRACE_ENVIRONMENT=production`
  - `TRACE_ALLOWED_ORIGINS=https://thetracemanifest.com`
  - `TRACE_AI_PUBLIC_ENABLED=false`
  - `TRACE_AI_EDITORIAL_ENABLED=false`
  - `TRACE_AI_SCHEDULED_ENABLED=false`
  - `TRACE_AI_GLOBAL_KILL_SWITCH=false`
- `wrangler.toml` documents, but does not prove, required server-side secrets and dashboard variables:
  - `DEEPSEEK_API_KEY`
  - `TRACE_VISITOR_HASH_SECRET`
  - `TRACE_INTERNAL_SERVICE_SECRET`
  - `CF_ACCESS_AUD`
  - `CF_ACCESS_TEAM_DOMAIN`
  - `TRACE_ADMIN_READERS`
  - `TRACE_ADMIN_PUBLISHERS`
  - `TRACE_INGESTION_WORKER_URL`

Worker configuration:

- `wrangler.worker.toml` binds Worker `DB` to `trace-manifest-db` / `1625036a-ffe2-4103-bf9d-086bae150561`.
- `wrangler.worker.toml` binds `RAW_STORE` to `trace-manifest-raw`.
- `wrangler.worker.toml` documents required encrypted Worker secret `TRACE_INTERNAL_SERVICE_SECRET`.
- `wrangler.worker.toml` documents optional encrypted Worker secret `GITHUB_TOKEN`.

AI configuration location note:

- The AI launch controls are expected as Pages environment variables and secrets, not as a separate Cloudflare AI product panel.
- The repository requires explicit `TRACE_AI_*` flag and budget variables in the Pages environment before any governed model path is enabled.
- `DEEPSEEK_API_KEY` is the provider secret required only when an AI path is intentionally enabled; the value must never be pasted into this audit.
- The observed production dashboard state remains AI-off because `TRACE_AI_PUBLIC_ENABLED`, `TRACE_AI_EDITORIAL_ENABLED`, and `TRACE_AI_SCHEDULED_ENABLED` are all `false`.
- The missing explicit AI budget, pricing, model and limit variables are not a current runtime blocker while all AI paths are off; they must be reviewed and set before any AI path is enabled.
- `ADMIN_API_TOKEN` was observed as a Pages secret name. Current source code does not reference it, and `scripts/security-check.mjs` treats `ADMIN_API_TOKEN` as a retired authentication or quota-bypass contract. Confirm it is legacy, then remove it from Cloudflare after any needed rotation/rollback review.

Worker admin boundary note:

- The production Worker dashboard currently shows `ADMIN_API_TOKEN` as the only Worker secret name.
- Current Worker source code requires `TRACE_INTERNAL_SERVICE_SECRET` for signed `/admin/*` fetch requests.
- Scheduled cron handlers do not use the HMAC secret directly, but Pages-to-Worker admin proxy calls fail closed without a matching `TRACE_INTERNAL_SERVICE_SECRET`.
- `ADMIN_API_TOKEN` is not part of the current admin boundary and should be treated as a legacy secret pending removal.

Application boundary evidence:

- `src/security/access-auth.ts` verifies Cloudflare Access JWTs against a configured team-domain issuer and `CF_ACCESS_AUD`, then maps lower-case email allowlists to `reader` or `publisher`.
- `src/security/origin-policy.ts` hard-codes the production origin to `https://thetracemanifest.com` when `TRACE_ENVIRONMENT=production`.
- `src/pages/api/admin/[...path].ts` rejects unauthenticated requests, denies reader mutations, requires same-origin POSTs, validates `TRACE_INGESTION_WORKER_URL` as HTTPS origin-only, and signs Worker requests using `TRACE_INTERNAL_SERVICE_SECRET`.
- `workers/ingestion/index.ts` independently verifies internal signatures, timestamp, role, and nonce replay; then records allowed and outcome audit rows.
- `src/middleware.ts` protects `/admin*` routes with the same Access authentication path and disables caching.

## Dashboard checklist outcome

Copy only names, booleans, counts, domains and IDs. Do not copy secret values, JWTs, API tokens, private keys, provider keys, or raw authorisation headers.

### Pages project

```text
Project name: the-trace-manifest
Production branch: main
Production D1 binding DB name: not found in shared Pages Bindings; repository config says trace-manifest-db
Production D1 binding DB ID: not found in shared Pages Bindings; repository config says 1625036a-ffe2-4103-bf9d-086bae150561
Preview/staging D1 binding DB name: not found
Preview/staging D1 binding DB ID: not found
Production environment variable names present: TRACE_AI_EDITORIAL_ENABLED, TRACE_AI_GLOBAL_KILL_SWITCH, TRACE_AI_PUBLIC_ENABLED, TRACE_AI_SCHEDULED_ENABLED, TRACE_ALLOWED_ORIGINS, TRACE_ENVIRONMENT
Production secret names present: ADMIN_API_TOKEN, DEEPSEEK_API_KEY
Preview/staging environment variable names present: not found
Preview/staging secret names present: not found
TRACE_ENVIRONMENT production value: production
TRACE_ALLOWED_ORIGINS production value: https://thetracemanifest.com
TRACE_AI_PUBLIC_ENABLED production value: false
TRACE_AI_EDITORIAL_ENABLED production value: false
TRACE_AI_SCHEDULED_ENABLED production value: false
TRACE_AI_GLOBAL_KILL_SWITCH production value: false
```

### Ingestion Worker

```text
Worker name: trace-manifest-ingestion
Production D1 binding DB name: trace-manifest-db
Production D1 binding DB ID: 1625036a-ffe2-4103-bf9d-086bae150561
Preview/staging D1 binding DB name, if any:
Preview/staging D1 binding DB ID, if any:
R2 binding name: RAW_STORE
R2 bucket name: trace-manifest-raw
Secret names present: ADMIN_API_TOKEN
Required secret names missing from dashboard evidence: TRACE_INTERNAL_SERVICE_SECRET
Cron triggers enabled: 0 18 * * *; 0 */3 * * *; 0 6 * * *; 0 9 * * *; */30 * * * *
Worker public route/origin: https://trace-manifest-ingestion.philgeran.workers.dev
```

### Cloudflare Access

```text
Access app name: not set up
Access app domain/path coverage: none
Does it cover /admin*: no
Does it cover /api/admin/*: no
Session duration: not applicable
Identity provider type: not applicable
Policy count: 0
Allow policy summary, redacted: none
Block/bypass policy summary, redacted: none
Application audience present in Pages secret names, yes/no: no
Team domain present in Pages variables, yes/no: no
```

### TRACE role allowlists

Use counts or redacted addresses only.

```text
TRACE_ADMIN_READERS present, yes/no: no
TRACE_ADMIN_READERS count: 0
TRACE_ADMIN_PUBLISHERS present, yes/no: no
TRACE_ADMIN_PUBLISHERS count: 0
Any address in both lists, yes/no: no
Publisher list limited to intended operators, yes/no: no publisher list configured
Removed users absent, yes/no: not verifiable because no allowlists are configured
```

### Origin and admin proxy

```text
TRACE_INGESTION_WORKER_URL present, yes/no: no
TRACE_INGESTION_WORKER_URL shape: missing
TRACE_INTERNAL_SERVICE_SECRET present on Pages, yes/no: no
TRACE_INTERNAL_SERVICE_SECRET present on Worker, yes/no: no
Pages and Worker internal secret confirmed same by rotation record or operator check, yes/no: no
```

## Final findings

- Zero Trust / Access is not set up, so `/admin*` and `/api/admin/*` do not have the required Cloudflare Access application coverage.
- The Pages production environment does not evidence `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`, `TRACE_ADMIN_READERS`, or `TRACE_ADMIN_PUBLISHERS`; current admin authentication cannot admit an operator.
- The Pages production environment does not evidence `TRACE_INGESTION_WORKER_URL` or `TRACE_INTERNAL_SERVICE_SECRET`; current Pages-to-Worker admin proxy calls cannot be signed or routed.
- The Worker production environment does not evidence `TRACE_INTERNAL_SERVICE_SECRET`; signed `/admin/*` fetch requests to the Worker fail closed.
- The preview D1 database exists, but no Pages or Worker preview binding to `trace-manifest-db-preview` was found.
- Production Worker dashboard binding confirms `DB` points to `trace-manifest-db`; Production Pages dashboard binding to `DB` was not found in shared Pages Bindings even though repository config declares it.
- Production D1 dashboard metrics confirm active workload, 17 tables, Western Europe placement, and expected ingestion/cross-source/classification query shapes.
- Pages project identity, production branch, automatic production deployments, and public domains are evidenced.
- Pages production variables confirm AI is off and production origin/environment are set.
- Pages has `DEEPSEEK_API_KEY` present as an encrypted secret, but AI budget/pricing/model/limit variables are not currently evidenced. This is acceptable while AI flags remain off; review before enabling AI.
- Pages has `ADMIN_API_TOKEN` present as an encrypted secret even though current repository policy treats that name as a retired auth contract; verify it is legacy and remove if unused.
- Worker has `ADMIN_API_TOKEN` present as an encrypted secret and does not currently evidence `TRACE_INTERNAL_SERVICE_SECRET`; this blocks the current signed Pages-to-Worker admin proxy boundary until corrected.
- AI controls are not found as a separate Cloudflare section; their evidence comes from Pages environment variable and secret names.
- R2 production Worker binding to `trace-manifest-raw` is evidenced; any preview/staging R2 binding state is not yet evidenced.

## Completion rule

LAUNCH-05 audit is complete because available dashboard fields have been filled or explicitly marked absent, with no plaintext secrets or private credentials recorded. The findings above must be resolved before the Access-protected admin and signed Pages-to-Worker control plane can be considered launch-ready.

Use `docs/operations/cloudflare-control-plane-repair-run-sheet.md` for the safe dashboard repair order.
