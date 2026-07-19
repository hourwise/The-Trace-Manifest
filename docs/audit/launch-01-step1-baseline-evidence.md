# LAUNCH-01 Step 1 — Baseline Synchronisation Evidence

**Date:** 18 July 2026

**Approved commit:** `9c3d6f1` ("Refresh handoff baseline") on `main` and `origin/main`.

## Git baseline

| Check | Result |
|---|---|
| `git pull --ff-only` | Already up to date |
| Worktree clean | Confirmed — nothing to commit |
| Branch | `main` |
| HEAD commit | `9c3d6f1` |
| Origin sync | `origin/main` at same commit |

## Documents reviewed

- [The Trace Manifest — Revised Launch Scope](../The%20Trace%20Manifest%20%E2%80%94%20Revised%20Launch.md)
- [ADR 0012 — Durable controls, Access-based administration, and publication boundaries](../adr/0012-durable-controls-access-admin-and-publication-boundaries.md)
- [Cloudflare Control-Plane Repair Run Sheet](../operations/cloudflare-control-plane-repair-run-sheet.md)
- [Production Stabilisation Release Plan](../operations/production-stabilisation-release-plan.md)
- [Stabilisation Findings Matrix](stabilisation-matrix.md)

## Commit lineage from plan baseline

```
9c3d6f1 Refresh handoff baseline        ← Approved / HEAD
cc22b63 Add build to launch handoff plan  ← Original plan reference
21978bf Stabilize source health and feed admission
```

The approved commit `9c3d6f1` is one commit ahead of the plan's original reference `cc22b63`. Explicit human approval confirmed `9c3d6f1` as the launch baseline.

## Prior evidence referenced

- LAUNCH-05R control-plane repair (secrets, Access apps, bindings) — partially complete
- LAUNCH-05R production deployment (D1 migration, Worker deploy, anonymous smoke) — complete
- Remaining blockers: reader/publisher allowlist evidence, One-time PIN restriction, ADMIN_API_TOKEN removal, authenticated publisher smoke check
