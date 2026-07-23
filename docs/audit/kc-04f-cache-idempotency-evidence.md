# KC-04F extraction cache and idempotency evidence

**Date:** 23 July 2026
**Status:** Complete locally; no external-AI provider, production migration, Queue binding, or publication was used.

## Implemented boundary

- `src/lib/server/knowledge-extraction-cache.ts` claims a stable identity formed from source version/hash, task, extraction method/version, provider/model, prompt version/hash, and policy version before a governed-AI provider call.
- A completed identity returns `cached`; the provider path is not entered and no usage/cost settlement is written. Failed or skipped runs can be claimed again, while a changed source/model/prompt/policy produces a different run identity.
- A concurrent retry sees `in_progress` and cannot claim the provider job a second time; a failed run becomes claimable again for bounded retry.
- Settlement is the only path that records token usage and actual/estimated cost, and it requires an owned running run plus bounded non-negative usage values. Deterministic KC-04 extraction now uses the same gate and settles as zero-cost with no provider model.
- The cache stores identifiers, hashes, bounded usage/validation metadata, and audit context only. It does not store prompts, complete source bodies, or chain-of-thought.

## Evidence

- `tests/stabilisation.test.ts` simulates a governed-AI provider: the first claim is settled at 125 micro-USD, the identical second claim is cached, the provider-call counter remains one, and the stored governed-AI cost remains 125 micro-USD rather than doubling.
- `npm.cmd test -- --run` passes (119 ingestion tests plus stabilisation tests).
- `npm.cmd run test:migrations` passes, including duplicate application of migrations 0035 and 0036.
- `npm.cmd run typecheck` passes with zero errors and four existing hints.
- `npm.cmd run build` passes, including Cloudflare route verification.
- Security boundary checks and `git diff --check` pass.

KC-04F does not enable governed-AI extraction, production Queue processing, or public evidence promotion. KC-05A is the next permitted task.
