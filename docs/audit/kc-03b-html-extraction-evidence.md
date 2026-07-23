# KC-03B — Deterministic HTML extraction evidence

**Date:** 23 July 2026  
**Status:** Complete — local implementation and validation only.  
**Scope:** Add a bounded, deterministic parser for already-admitted HTML. This task does not fetch, persist, enqueue, call an AI provider, create claims, or promote evidence.

## Implemented

- `src/lib/server/source-extraction.ts` exposes one structured extraction contract for title, author, author handle, publication date, description, headings, block-level text, source offsets, and `html:start-end` locators.
- Main content is selected in the order `article`, `main`, `body`, then the whole document. Navigation, footer, header, aside, form, script, style, iframe, and other untrusted/non-content elements are removed before block extraction.
- Metadata comes from Open Graph/Twitter/standard meta fields, JSON-LD article records, `<title>`, and `<time datetime>`. Invalid JSON-LD is ignored as untrusted page content rather than treated as a parser failure.
- Text and block output are bounded by configurable maximums. Diagnostics record the extraction method, byte count, output size, block/heading counts, selected container, truncation, removed elements, and warnings.
- `src/lib/server/triage-url-source.ts` now uses this shared extractor, preserving the existing triage title/excerpt/author contract while removing the duplicate parser.

## Validation

- `npm test` passed: 119 ingestion tests and the stabilisation suite, including extraction metadata, heading/locator output, removal of navigation/scripts, metadata-only handling, truncation, and triage compatibility.
- `git diff --check` passed.
- `npm run typecheck` remains blocked before application checking by the existing incomplete local dependency tree: `@astrojs/telemetry/dist/post.js` is missing from `node_modules`.

## Deliberately deferred

- KC-03C will store permitted immutable originals/extractions in private R2 and metadata/hashes in D1.
- KC-03D will connect admitted feed items to capture production and reconciliation. KC-04 will turn extracted blocks into reviewable claims and source summaries.
- No extracted text is currently durable, searchable, AI-processed, or eligible as public evidence solely because KC-03B completed.
