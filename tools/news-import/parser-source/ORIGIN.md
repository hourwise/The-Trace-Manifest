# Parser-source provenance

These five pure modules are the accepted P2/P3 parser/validator projection already used by P4-R1. Their algorithmic bodies are unchanged. They were separated from the larger local acquisition package so hosted-import CI and generation have no dependency on provider code, ledgers, SQLite catalogues or D: evidence.

Original accepted acquisition reference: `a6b2b4844bb96e8d77d8c7702c82e48bcd8708a4`. Projection reference: `2ad59cc998885f50411852a5dd5445bc24bd507e`, under `src/lib/server/news-import/runtime/`. The frozen R1 worktree retains the full acquisition package and its 317 offline regressions. No accepted tooling or acquired evidence is removed from those branches or data roots.

`scripts/generate-news-import-runtime.mjs` copies these pure sources with source SHA metadata and regenerates the migration-trigger certificate. Changes must pass deterministic fixture, hostile XML and real retained-evidence parity tests. This relocates the existing validator; it introduces no replacement acquisition system, source endpoint or new extraction identity.
