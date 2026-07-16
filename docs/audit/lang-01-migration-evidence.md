# LANG-01 — multilingual provenance migration evidence

**Date:** 16 July 2026  
**Scope:** `LANG-01` from the master build plan  
**Migration:** `db/migration-0017-multilingual-source-provenance.sql`

## Added metadata and provenance

The migration adds:

- a default language to source records;
- source language, detected language, original title/summary/excerpt/hash, and translation status to feed items;
- detected language and translation status to manual TRACE Desk candidates; and
- `feed_item_translations`, a derived representation attached to exactly one original feed item per target language.

Each translation stores its original-content hash, translated metadata/content hash, provider and model metadata, timestamps, status, and optional editorial review identity. It is deliberately not a source record: the foreign key points to the original `feed_items` identity and `independent_evidence_weight` is constrained to zero.

## Enforced limits

- A translation-content hash cannot equal its original-content hash.
- An `translated_editor_reviewed` record requires both reviewer identity and review time.
- One original item can have only one translation for a given target language.
- No translation, cross-language clustering, automatic source admission, model call, public route, public content, or `hreflang` output is created by this migration.

## Verification

- `npm run test:migrations` applies the complete ordered migration chain in SQLite and confirms a valid derived translation defaults to independent-evidence weight zero.
- The same test proves that an equal original/translation hash is rejected.
- `npm test` and `npm run typecheck` pass.

## Deployment state

The migration has not been applied to preview or production D1. Production remains unchanged. A later bounded task must add controlled language detection, translation execution, review controls, language-aware clustering, and public multilingual rendering before any bilingual publication is considered.
