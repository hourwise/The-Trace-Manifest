# Step 7 — Launch Decision Summary

**Date:** 19 July 2026  
**Prepared for:** Explicit human launch approval

---

## Release Identity

| Item | Value |
|---|---|
| Launch commit | `bbde0ce` — "Exclude published and withdrawn clusters from admin cluster list" |
| Branch | `main` |
| Pages production deployment | `e8291a0a` (from `4d21ad2`, CORS fix pending from `c63d706` and `b8f9ef9`) |
| Worker version | `c0e0e06d` (`trace-manifest-ingestion`) |
| Worker endpoint | `https://trace-manifest-ingestion.philgeran.workers.dev` |
| Custom domain | `https://thetracemanifest.com` |

---

## Content Readiness

| Metric | Value | Threshold |
|---|---|---|
| Published stories | **22** | ≥15 ✅ |
| Eligible drafts remaining | 281 | — |
| Earliest published date | 2021-03-23 | — |
| Latest published date | 2026-07-17 | — |

**Topic distribution:**
| Topic | Count |
|---|---|
| general | 17 |
| mcp-and-agents | 1 |
| local-ai | 1 |
| hardware | 1 |
| developer-tools | 1 |
| ai-business | 1 |

⚠️ 17/22 stories are "general" — weak topical diversity.

---

## Source & Ingestion Health

| Metric | Value |
|---|---|
| Healthy sources (RSS + API) | **42** |
| Degraded sources (page_diff + manual, correctly unsupported) | 29 |
| Unknown health | 3 |
| Feed items indexed | 2,823 |
| Ingestion jobs completed | 2,474 |
| Ingestion jobs failed | 1,009 |
| Stuck running jobs (since July 13–17) | 191 |

⚠️ 191 stuck running jobs and 1,009 failures need investigation.

---

## Control Plane Verification

| Check | Status |
|---|---|
| Cloudflare Access blocks anonymous `/admin` | ✅ 302 to login |
| Cloudflare Access blocks anonymous `/api/admin/*` | ✅ 302 to login |
| Direct unsigned Worker → 401 | ✅ |
| Publisher can access admin routes | ✅ |
| Internal HMAC signature enforced | ✅ |
| Replay protection (nonce table) | ✅ |
| Audit log records without secrets | ✅ |
| AI kill switches safe | ✅ Public/scheduled/kill-switch all `false` |
| Editorial AI enabled (content prep) | ✅ `TRACE_AI_EDITORIAL_ENABLED=true` |

---

## Known Limitations

| # | Limitation | Severity | Status |
|---|---|---|---|
| 1 | No separate reader-only identity | Low | Deferred |
| 2 | `ADMIN_API_TOKEN` still present | Medium | Deferred |
| 3 | 1,009 failed ingestion jobs | Medium | Deferred (mostly unsupported sources correctly failing) |
| 4 | Two separate Access apps cause dual-session issues | Medium | Deferred (admin-only, workaround exists) |
| 5 | TRACE Desk has no publication/promotion flow | Low | Post-launch (ADR 0015) |
| 6 | 17/22 stories uncategorized as "general" | Low | Improves with more publishing |
| 7 | No WAF/Turnstile protection | High | Deferred (low abuse surface at launch) |
| 8 | Story dates include old content (2021–2023) | Medium | Deferred |

### Resolved pre-launch

| # | Item | Resolution |
|---|---|---|
| ~~3~~ | 191 stuck running ingestion jobs | Reset to `failed` — queue cleared |
| ~~10~~ | One-time PIN on Access apps | Confirmed: both admin apps restricted to OTP only |

---

## Evidence Pack

| Document | Content |
|---|---|
| `launch-01-step1-baseline-evidence.md` | Git baseline, commit lineage, docs reviewed |
| `launch-03-step3-worker-deploy-evidence.md` | Worker dry-run, deploy, bindings, cron |
| `launch-04-step4-smoke-checks-evidence.md` | Anonymous smoke checks, Access verification |
| `launch-06-step5-editorial-ai-evidence.md` | Editorial AI enablement and pricing config |
| `launch-06-role-replay-audit-evidence.md` | LAUNCH-06: signature, replay, audit verification |
| `launch-05r-control-plane-repair-evidence.md` | Access app config, secrets, Preview Desk verification |

---

## Decision Required

> **Do you approve public launch of The Trace Manifest at `https://thetracemanifest.com` on commit `bbde0ce` with the 10 known limitations recorded above?**

Per the plan: "Keep automation and AI flags disabled unless the approval explicitly includes the relevant flag." Public AI (`TRACE_AI_PUBLIC_ENABLED`) and scheduled AI (`TRACE_AI_SCHEDULED_ENABLED`) remain `false`. Only editorial AI is enabled for content preparation.
