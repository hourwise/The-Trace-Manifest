# Stabilisation findings matrix

Audit date: 14 July 2026. “Implemented” means present in source; it does not mean deployed or executable validation passed.

| Finding | Severity | Disposition | Evidence/change |
|---|---|---|---|
| Browser-held reusable admin token and direct Worker calls | Critical | Implemented | Cloudflare Access verification, first-party proxy, server role map, signed internal requests; legacy token UI removed. |
| Provider key/direct-call boundary insufficiently enforced | Critical | Implemented | DeepSeek adapter is behind one gateway; CI scan rejects other provider URLs/imports. |
| In-memory budget, usage, quota, and circuit state | Critical | Implemented | Replaced by D1 requests, reservations, ledger, quota, concurrency lease, and circuit tables. |
| Caller-controlled `X-Session-Id` bypass | High | Implemented | Header removed; visitor scope is derived at the edge and keyed by a server secret/day. |
| Duplicate/retry cost amplification | Critical | Implemented | Unique idempotency owner, attempt count 0-1, one provider call, zero automatic retries, ambiguous billing settlement. |
| Ask used no eligible evidence | Critical | Implemented | Retrieval joins published/reviewed stories, published feed items, claims, evidence, and sources with bounded terms/excerpts. |
| Model-supplied confidence/citations could appear authoritative | High | Implemented | Supplied-ID/claim validation and deterministic evidence confidence; safe non-answer on failure. |
| Static Astro output with runtime Pages APIs/D1 | High | Implemented | Cloudflare server output and D1 binding contract. Deployment verification pending. |
| Raw/draft content and hard-coded future catalogue/Ask claims | Critical | Implemented | Fabricated Ask/catalogue data removed; story/briefing/catalogue/knowledge gates and honest empty states added. |
| Publication transition lacked evidence/reviewer invariants | High | Implemented | Story transaction requires reviewer, summary, eligible evidence, stored member and conditional state; briefing fields rebuilt from eligible stories. |
| Admin and public operational pages used fake counts/examples | High | Implemented | Jobs, sources, corrections, review, and admin landing use D1 or explicit unavailable/empty states. |
| Unsupported/malformed connector output reported as completion/success | High | Implemented | Unsupported sources are degraded and return `unsupported`/422; bounded connector output records rejected items and partial 207 outcomes. |
| Cron did not await source work / partial failure looked complete | High | Implemented | Bounded awaited batches and failed cron status when any source job fails. |
| Audit lacked denial/outcome/target completeness | High | Implemented | Authenticated denials, allowed actions, outcomes, operator/role, route target and record target are stored with idempotent event IDs. |
| CORS/domain policy was broad or implicit | High | Partially implemented | Production API origin is code-pinned to canonical `.com`; localhost is development-only. The `.uk` redirect itself remains a deployment rule to configure and verify. |
| Environment names/defaults conflicted | Medium | Implemented | Canonical `TRACE_AI_*` contract and fail-closed example/config documentation. |
| CI, migration, security, and concurrency regression coverage absent | High | Implemented, unexecuted here | Workflow, SQLite migration checks, security/history scan, durable-control tests, build route verifier. Desktop run pending. |
| Node/npm dependency installation on laptop | Environment blocker | Deferred by owner | Full validation intentionally moved to desktop; no pass claim is made. |
| Turnstile/WAF and external alerts | High before broad launch | Planned | Must be configured/tested at the edge before public beta. |
| Deployed Access, D1, provider, backup/restore tests | High before launch | Planned | Covered by `DEPLOYMENT.md` and `TESTING.md`; requires external environment. |
| Catalogue admin publication workflow | Medium | Planned | Catalogue records safely default to draft; a reviewed publisher UI/route remains to be built. |

## Secret review

The manual working-tree scan performed during the audit found no actual provider/API secret. The old example contained only a placeholder shape and was replaced. The full Git-history and gitleaks scans remain pending in desktop CI; platform secrets and external logs also require separate review.
