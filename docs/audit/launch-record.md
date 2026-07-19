# Launch Record — The Trace Manifest

**Launch date:** 19 July 2026  
**Approved by:** philgeran@gmail.com (publisher)

---

## Release Identity

| Item | Value |
|---|---|
| Launch commit | `bbde0ce` |
| Pages production deployment | `e8291a0a` |
| Worker version | `c0e0e06d` |
| Worker endpoint | `trace-manifest-ingestion.philgeran.workers.dev` |
| Custom domain | `https://thetracemanifest.com` |

## Launch Metrics

| Metric | Value |
|---|---|
| Published stories | 22 |
| Drafts eligible | 281 |
| Healthy sources | 42 |
| Feed items indexed | 2,823 |
| Ingestion jobs completed | 2,480 |
| Ingestion jobs failed | 1,200 |

## Security Posture

- Cloudflare Access: Two admin apps, OTP-only, narrow Allow policy
- Internal HMAC: Pages → Worker signed requests, 60s window, nonce replay protection
- Audit log: Allowed/denied/succeeded/failed events, no secrets
- AI flags: Public `false`, Scheduled `false`, Global kill switch `false`
- Editorial AI: Enabled for content preparation (DeepSeek, $0.50/day budget)

## Known Limitations (8)

1. No separate reader-only identity
2. `ADMIN_API_TOKEN` still present
3. 1,009 failed ingestion jobs (mostly unsupported sources correctly failing)
4. Dual Access app sessions (admin workaround exists)
5. TRACE Desk no publication flow (post-launch ADR 0015)
6. Story topic diversity weak (17/22 "general")
7. No WAF/Turnstile
8. Old story dates mixed in feed

## Post-Launch Roadmap

1. ADR 0009 — Governed social discovery
2. SOURCE-07 — Safe page-diff connectors
3. ADR 0015 — TRACE Desk taxonomy and workflow
4. ADR 0016 — Governed Ask TRACE research
5. ADR 0017 — Knowledge builder and question-gap queue
6. ADR 0013 — Guides Lab
7. ADR 0018 — Multilingual ingestion and publication
8. ADR 0014 — Versioned sharing and snapshots
9. ADR 0010 — Curated products and governed auto-publication
10. ADR 0011 — Commercial features

## Evidence Trail

- `launch-01-step1-baseline-evidence.md`
- `launch-03-step3-worker-deploy-evidence.md`
- `launch-04-step4-smoke-checks-evidence.md`
- `launch-06-step5-editorial-ai-evidence.md`
- `launch-06-role-replay-audit-evidence.md`
- `launch-05r-control-plane-repair-evidence.md`
- `launch-05r-production-deployment-evidence.md`
- `launch-07-decision-summary.md`
