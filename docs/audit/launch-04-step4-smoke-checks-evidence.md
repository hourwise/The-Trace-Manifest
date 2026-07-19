# LAUNCH-04 Step 4 — Anonymous No-Write Smoke Check Evidence

**Date:** 18 July 2026

**Commit:** `9c3d6f1`

## Results

| Check | Endpoint | Result | Required |
|---|---|---|---|
| Anonymous `/admin` | `https://thetracemanifest.com/admin` | **302** → Cloudflare Access login (`auth_status: NONE`) | ✅ Blocked |
| Anonymous `/api/admin/*` | `https://thetracemanifest.com/api/admin/sources` | **302** → Cloudflare Access login (`auth_status: NONE`) | ✅ Blocked |
| Direct unsigned Worker | `https://trace-manifest-ingestion.philgeran.workers.dev/admin/candidates` | **401** | ✅ Fails closed |
| Public home page | `https://thetracemanifest.com/` | **200** | ✅ Reachable |

## Access application identifiers (presence only)

- Admin app audience: `1cbe6a65...` (matches `/admin` path)
- API admin app audience: `a738716e...` (matches `/api/admin/*` path)
- Access team domain: `aged-lab-1677.cloudflareaccess.com`

## Remaining Step 4 items (require authenticated browser)

- Approved publisher loads `/admin`, `/admin/sources`, `/admin/jobs`, `/admin/review` — **human browser task**
- Confirm no AI feature accidentally exposed on public routes — **human browser task**
- No production Desk, ingest, publish, archive, or correction mutations — **confirmed, none performed**
