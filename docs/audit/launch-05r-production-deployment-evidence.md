# LAUNCH-05R Production Deployment Evidence

**Date:** 17 July 2026

**Scope:** Approved release deployment and anonymous, no-write boundary checks after the recorded D1 migration. No business mutation, manual ingestion, or AI request was made.

## Released source and Pages deployment

- Reviewed release branch was fast-forwarded to `main` and pushed as commit `f6c8785` (`Record production D1 migration evidence`).
- Cloudflare Pages created Production deployment `5bbef9b6-6565-4ab0-a0b6-518a70061c7f` from that exact commit.
- The production custom-domain home request returned `200`.
- The immutable deployment hostname returned `302` without following redirects, which is consistent with the project's canonical/Access routing; the custom production domain is the availability evidence.

## Production Worker deployment

- Final no-change dry run used the top-level production configuration with `--env=` and `--keep-vars`.
- Confirmed bindings before upload: `DB -> trace-manifest-db`; `RAW_STORE -> trace-manifest-raw`.
- Dashboard-managed Worker variables were preserved. No secret value was read or recorded.
- Uploaded Worker version: `5954d7c4-dde2-4ac1-8110-d1dd6f2f8b81`.
- Production Worker endpoint: `https://trace-manifest-ingestion.philgeran.workers.dev`.
- Confirmed schedules: `*/30 * * * *`, `0 6 * * *`, `0 9 * * *`, `0 12 * * *`, and `0 18 * * *`.
- The Worker contains no AI/provider integration. No manual or test ingestion run was invoked by this deployment activity.

## Anonymous no-write smoke checks

All requests omitted credentials, did not follow redirects, and did not send a request body.

| Check | Result | Required outcome |
|---|---:|---|
| `https://thetracemanifest.com/` | `200` | Public site remains reachable. |
| `https://thetracemanifest.com/admin` | `302` | Cloudflare Access intercepts anonymous Admin access. |
| `https://thetracemanifest.com/api/admin/sources` | `302` | Cloudflare Access intercepts anonymous Admin API access. |
| Direct unsigned Worker `/admin/candidates` | `401` | Worker fails closed without a signed internal request. |

## Remaining completion boundary

The named publisher must sign in through Cloudflare Access and load `/admin`, `/admin/sources`, `/admin/jobs`, and `/admin/review` on production. Do not submit a Desk candidate or invoke any mutation. Reader-denial, audit-record, replay-protection, and mutation tests remain LAUNCH-06 work and require the separate reader-only identity.
