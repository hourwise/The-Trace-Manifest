# KC-11A historical backfill inventory evidence

**Date:** 27 July 2026
**Status:** Complete locally; the inventory is read-only and KC-11B is next.

## Implemented

- `scripts/inventory-backfill.mjs` produces a versioned `kc-11a-v1` JSON
  inventory without enqueueing, capturing, extracting, mapping, scoring,
  revising, or publishing any record.
- The collector reads published stories, approved canonical knowledge,
  published legacy pages, corrections, catalogue records, and source URLs from
  D1, then adds repository-owned static knowledge pages, Markdown authoring
  inputs, Guide files, and source references.
- Preview and remote execution are explicit: local/Preview is the default,
  while production-style remote access requires `--remote` and an explicit
  database target. SQL is split into bounded read-only batches for D1's
  compound-select limit.
- Missing legacy Guide tables in the current Preview schema are not silently
  treated as published Guides; Guide files remain inventoried separately.

## Remote Preview baseline

The read-only command below completed on 27 July 2026:

```text
node scripts/inventory-backfill.mjs --remote --summary
```

| Category | Count |
|---|---:|
| Published stories | 0 |
| Approved canonical knowledge documents | 0 |
| Static legacy knowledge pages | 16 |
| Markdown authoring inputs | 30 |
| Guide-related files | 23 |
| Corrections | 0 |
| Published models | 0 |
| Published providers | 0 |
| Published benchmarks | 0 |
| Unique source URLs/references | 193 |
| **Total inventory items** | **262** |

The zero D1 content counts describe the current empty Preview corpus; they do
not imply that the production corpus is empty. The full JSON report can be
regenerated with `--output <path>` for a reviewed database target.

## Verification

- `npm.cmd run test:inventory` passed against the repository static inventory.
- `npm.cmd run test:diff` passed.
- `npx.cmd tsc --noEmit -p workers/tsconfig.json` passed.
- The remote Preview query returned `changed_db: false` and `rows_written: 0`.
- No full Astro/build/deployment checks were run on this SD-card-backed laptop.
