# LAUNCH-06 Step 5 — Editorial AI Enablement Evidence

**Date:** 18 July 2026

**Commit:** `422df8f` — "Enable TRACE_AI_EDITORIAL_ENABLED for production content preparation"

## Change

Single-line change in `wrangler.toml` under `[env.production.vars]`:
- `TRACE_AI_EDITORIAL_ENABLED`: `"false"` → `"true"`

## Pre-flight verification

| Check | Result |
|---|---|
| `astro check` (83 files) | 0 errors, 0 warnings, 0 hints |
| `git diff-check` | Whitespace clean |
| `DEEPSEEK_API_KEY` secret | Present (encrypted) |
| Other AI flags | All remain `false` (public, scheduled, kill switch) |
| Preview env | Unchanged — editorial AI stays disabled in preview |

## Effect

The "🤖 AI Analyze" button on `/admin/review` will become active when:
1. Pages deploys commit `422df8f`
2. User selects a cluster from the "Publish a Story" dropdown
3. Source material loads (≥1 source)

The button calls `POST /api/admin/ai-triage` → DeepSeek (`deepseek-v4-flash`, routine tier) → populates headline, summary, and why-it-matters fields.

## Remaining for LAUNCH-06

- Publisher performs one safe Preview Desk mutation → verify audit outcome
- Reader-denial tests (deferred — no separate reader identity)
- Replay-protection and audit log verification in Preview
