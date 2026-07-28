# KC-08A Knowledge Markdown Evidence

**Status:** Complete locally
**Date:** 24 July 2026
**Scope:** deterministic parsing of material claims and evidence URLs from new and existing TRACE knowledge Markdown

## Implemented

- Added `src/lib/server/knowledge-markdown.ts` as the shared parser for the documented YAML frontmatter and Markdown sections.
- Material claims are extracted from the answer, explanation, limitation, uncertainty, and related-knowledge sections with a relationship and deterministic `markdown:<section>:<line-range>` locator.
- Evidence links and bare URLs are extracted from Evidence/Sources/References sections with section, relationship, and line metadata.
- New admin-ingested documents persist the derived `materialClaims` and `evidenceUrls` metadata inside `document_json` and return extraction counts.
- `scripts/check-knowledge-markdown.ts` scans the existing `docs/Knowledge Input/` corpus without admitting sources or creating claims.

## Verification

```text
30 Markdown documents scanned
967 material claims parsed
146 evidence URLs parsed
0 parser or format failures
```

`npm run test:knowledge-markdown`, the ingestion/stabilisation suite, and `npm run typecheck` passed. This task does not match claims to canonical claims, admit sources, or make knowledge public; those remain review-gated KC-08B onward work.
