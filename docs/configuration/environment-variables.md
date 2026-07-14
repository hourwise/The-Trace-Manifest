# Environment variables

All values are server-side. No variable in this contract may use a browser/public prefix.

## Core Pages variables

| Name | Required | Purpose |
|---|---|---|
| `TRACE_ENVIRONMENT` | Yes | `production` or `development`; controls fail-closed origin/development behaviour. |
| `TRACE_ALLOWED_ORIGINS` | Yes | Comma-separated exact origins. Production value is `https://thetracemanifest.com`. |
| `TRACE_VISITOR_HASH_SECRET` | For public Ask | At least 32 random characters; keys rotating visitor/question digests. |

## Cloudflare Access and admin proxy

| Name | Required | Purpose |
|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | For admin | Host such as `team.cloudflareaccess.com`; no scheme/path. |
| `CF_ACCESS_AUD` | For admin | Access application audience; store as a secret. |
| `TRACE_ADMIN_READERS` | For admin reads | Comma-separated lower-case email allowlist. |
| `TRACE_ADMIN_PUBLISHERS` | For mutations | Comma-separated lower-case email allowlist. Publisher wins if listed in both. |
| `TRACE_INGESTION_WORKER_URL` | For proxy | HTTPS Worker origin only; no path or credentials. |
| `TRACE_INTERNAL_SERVICE_SECRET` | Yes on Pages and Worker | Matching HMAC secret, at least 32 random characters. |

## AI feature and model selection

| Name | Default/requirement |
|---|---|
| `DEEPSEEK_API_KEY` | Secret; required only for an enabled AI path. |
| `TRACE_AI_PUBLIC_ENABLED` | `false`; explicit `true` only after launch approval. |
| `TRACE_AI_EDITORIAL_ENABLED` | `false`; enables Access-protected editorial drafting only after launch approval. |
| `TRACE_AI_SCHEDULED_ENABLED` | `false`; reserved for governed scheduled model jobs. |
| `TRACE_AI_GLOBAL_KILL_SWITCH` | `false`; set `true` to reject all model paths. |
| `TRACE_AI_PUBLIC_MODEL` | Allowlisted model ID; current code default `deepseek-v4-flash`, which must be reverified before use. |
| `TRACE_AI_EDITORIAL_MODEL` | Allowlisted model ID; current code default `deepseek-v4-pro`, which must be reverified before use. |

## AI budgets and limits

| Name | Development fallback | Production rule |
|---|---:|---|
| `TRACE_AI_DAILY_PUBLIC_BUDGET_USD` | `1.00` | Set explicitly and review. |
| `TRACE_AI_MONTHLY_PUBLIC_BUDGET_USD` | `10.00` | Set explicitly and review. |
| `TRACE_AI_ASK_DAILY_BUDGET_USD` | daily budget | Set task ceiling. |
| `TRACE_AI_EDITORIAL_DAILY_BUDGET_USD` | daily budget | Set task ceiling. |
| `TRACE_AI_MAX_COST_PER_REQUEST_USD` | `0.02` | Set explicit worst-case ceiling. |
| `TRACE_AI_MAX_QUESTION_LENGTH` | `1000` | 1-4,000. |
| `TRACE_AI_MAX_EVIDENCE_EXCERPTS` | `8` | 1-16. |
| `TRACE_AI_MAX_INPUT_TOKENS` | `12000` | 100-64,000. |
| `TRACE_AI_MAX_OUTPUT_TOKENS` | `1500` | 50-8,000. |
| `TRACE_AI_REQUEST_TIMEOUT_MS` | `25000` | 1,000-55,000. |
| `TRACE_AI_DAILY_QUESTIONS` | `3` | 1-100. |
| `TRACE_AI_MAX_CONCURRENT` | `1` | Must remain `1` in the current implementation. |

## Reviewed pricing

All four are required when any public, editorial, or scheduled AI path is enabled in production:

- `TRACE_AI_FLASH_INPUT_USD_PER_MILLION`
- `TRACE_AI_FLASH_OUTPUT_USD_PER_MILLION`
- `TRACE_AI_PRO_INPUT_USD_PER_MILLION`
- `TRACE_AI_PRO_OUTPUT_USD_PER_MILLION`

Values must come from a dated provider/account review. Do not copy the non-authoritative placeholders from `.dev.vars.example`.

## Bindings

Pages and the ingestion Worker require a D1 binding named `DB`. The ingestion Worker also requires `RAW_STORE`. Binding identifiers in tracked Wrangler files are identifiers, not credentials; still review them per environment.

The Worker may use an optional encrypted `GITHUB_TOKEN` for authenticated GitHub API limits. It is passed explicitly to the GitHub connector and must never be a global or tracked value.
