# N4-OPS-R2 local evidence

Implementation: Claude Code. Independent reviewer: Codex. Everything here is local and SYNTHETIC. No program contacts Cloudflare, sends a maintenance request or records owner consent.

| File | What it is |
|---|---|
| `replay.mjs` | Replays Codex's DR2 evidence against the reviewed R1 code (rebuilt from Git blobs at `56ab1e3`) and against R2. |
| `replay-results.json` | The replay's outcomes at the final R2 code, one row per case and version. |
| `mutations.mjs` | The complete mutation runner, with three sets: 31 R2 mutations, each naming the regression that must fail; R1's 40 protections re-expressed against R2 code; and 4 unmasked variants of the R1 mutations that an R2 layer duplicates. |
| `mutations.json` | The runner's outcomes at the final R2 code commit. |
| `verification.json` | Commands, counts and SHA-256 of the raw local logs. |

Codex's DR2 evidence is only read. The replay uses:
- `prior-*.json`;
- the per-case `request-*`, `lookup-*`, `open`, `closure` and `final-*.json` files;
- `successor-package-stale-capture.json` and `stale-approval.SYNTHETIC.json`.

Those files are a `.2` reconciliation, a `.2` request and a `.1` inventory. R2 refuses Codex's `.2` prior files on their schema alone, so the replay also applies his exact edits to each version's own example prior. The request, lookup, readback, final-inventory and package files keep R1-compatible formats and are fed to R2 byte for byte. R2's example package, approval and profile bytes are identical to R1's.

## Reproduce

Use a D: checkout of `claude/trace-n4-ops-r2` with locked dependencies, and new external D: output folders. Set `TEMP`, `TMP` and `TMPDIR` to a D: folder, because the tools refuse to write evidence off D:.

```powershell
node docs/audit/trace-n4-ops-r2-evidence/replay.mjs D:\Users\fleur\trace-n4-ops-r1-dr2-evidence\probes <new D: folder>
node docs/audit/trace-n4-ops-r2-evidence/mutations.mjs <disposable LF clone at the code commit> <log.jsonl>
node node_modules/tsx/dist/cli.mjs --test tests/n4-ops-01.test.ts
npm run ci
```

Run the mutation runner only in a disposable clone (`core.autocrlf=false`). It rewrites source files one mutation at a time and restores them with `git checkout -- .`.
