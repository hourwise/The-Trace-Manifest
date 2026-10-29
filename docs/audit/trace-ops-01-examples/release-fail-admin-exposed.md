> Example generated from mocked responses for documentation; not a real verification.

# TRACE release verification: FAIL

FAIL: 1 check(s) failed (access.admin_desk).

- **Target:** production
- **Release:** post-merge-production
- **Approval reference (recorded, not verified):** Merged pull request on main; the PR's approval is the release decision and is recorded, not verified, by this check
- **Expected commit:** `9da92ece6d51d1bfeed9b7eb1289f891a548421c` (command line / CI event)
- **Pages deployment:** expected `not specified`, observed `a98c3f18`
- **Generated:** 2026-10-28T22:00:00.000Z by trace-ops-release-verify 1.0.0
- **Modes:** github on, cloudflare off, snapshots off, offline off
- **Requests used:** site 9/20, github 2/22, cloudflare 0/8

## Stop conditions raised

- **ADMIN_EXPOSED**

## Checks

| Check | Mandatory | Status | Result |
|---|---|---|---|
| `manifest.valid` | yes | **PASS** | manifest post-merge-production and profile production validated; commit from command line / CI event |
| `deployment.reported` | yes | **PASS** | Cloudflare Pages reported a successful deployment a98c3f18 for 9da92ec at 2026-10-28T21:21:18Z |
| `deployment.branch_head` | no | **PASS** | 9da92ec is still the head of main |
| `public.home` | yes | **PASS** | GET /: 200 text/html, 123 bytes, 2 marker(s) present, 1 absent |
| `public.feed` | yes | **PASS** | GET /feed: 200 text/html, 123 bytes, 2 marker(s) present, 1 absent |
| `public.rss` | yes | **PASS** | GET /rss/daily.xml: 200 application/xml, 30 bytes, 2 marker(s) present, 0 absent |
| `public.story.published` | yes | **PASS** | GET /stories/google-announces-fairwind-program-for-government-cyber-defense-tools: 200 text/html, 127 bytes, 2 marker(s) present, 2 absent |
| `public.story.withdrawn` | yes | **PASS** | GET /stories/hugging-face-hub-migrates-from-git-lfs-to-xet-storage: 200 text/html, 211 bytes, 2 marker(s) present, 0 absent |
| `access.admin` | yes | **PASS** | anonymous GET /admin: 302 to Cloudflare Access login (team.cloudflareaccess.com); redirect not followed |
| `access.admin_desk` | yes | **FAIL** | anonymous GET /admin/desk: anonymous request returned 200: protected route is publicly reachable |
| `access.admin_review` | yes | **PASS** | anonymous GET /admin/review: 302 to Cloudflare Access login (team.cloudflareaccess.com); redirect not followed |
| `access.api_admin` | yes | **PASS** | anonymous GET /api/admin/candidates: 302 to Cloudflare Access login (team.cloudflareaccess.com); redirect not followed |
| `deployment.serving` | no | **NOT_VERIFIED** | Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials); not verified |
| `cron.production` | no | **NOT_VERIFIED** | Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials); not verified |
| `cron.preview` | no | **NOT_VERIFIED** | Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials); not verified |
| `database.snapshot` | no | **NOT_RUN** | no snapshots supplied |

## Not run or not verified

- `deployment.serving` (NOT_VERIFIED): Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials); not verified
- `cron.production` (NOT_VERIFIED): Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials); not verified
- `cron.preview` (NOT_VERIFIED): Cloudflare API mode not requested (run with --cloudflare and operator-supplied credentials); not verified
- `database.snapshot` (NOT_RUN): no snapshots supplied

## Evidence files

| File | SHA-256 |
|---|---|
| scripts/ops/manifests/post-merge-production.json | `c2cfa73b7706f30687cc4f87cd7b4f5461e6f92450854ffa1131eb9289eee057` |
| scripts/ops/profiles/production.json | `750c86a7145bea3a42afc9e335809077a313e0695d8f2d558b551bfd2f9bc7b7` |

This report is read-only verification. It changes nothing and approves nothing.
