# LAUNCH-03 Step 3 — Production Worker Deployment Evidence

**Date:** 18 July 2026

**Approved commit:** `9c3d6f1`

## Dry-run (passed before deploy)

| Binding | Resource |
|---|---|
| `env.DB` | D1 Database `trace-manifest-db` (1625036a-...) |
| `env.RAW_STORE` | R2 Bucket `trace-manifest-raw` |

## Production deploy

| Item | Value |
|---|---|
| Command | `npx wrangler deploy --config wrangler.worker.toml --keep-vars --env=` |
| Upload size | 141.91 KiB / gzip: 33.16 KiB |
| Startup time | 5 ms |
| Deploy time | 13.45 sec |
| Trigger deploy time | 8.58 sec |
| Version ID | `b1d46da4-8aaf-48be-9d97-9d5496256060` |
| Endpoint | `https://trace-manifest-ingestion.philgeran.workers.dev` |

## Confirmed cron schedules

- `*/30 * * * *`
- `0 6 * * *`
- `0 9 * * *`
- `0 12 * * *`
- `0 18 * * *`

## Pages deployment

The Git-connected Pages production deployment for commit `9c3d6f1` should be verified in the Cloudflare dashboard (Workers & Pages → the-trace-manifest → Deployments).
