# ADR 0018: Multilingual Source Ingestion, Translation Provenance, and Bilingual Publication

**Status:** Accepted  
**Date:** 16 July 2026

## Context

Important AI, technology, policy, and security reporting often appears first in languages other than English. TRACE needs to admit and assess such material without losing the original evidence, overstating machine-translation confidence, or treating an English translation as corroboration.

ADR 0015 governs the unified editorial intake and TRACE Desk. ADR 0016 governs source admission and controlled research. ADR 0017 governs Knowledge Builder and public knowledge publication. This decision defines the language and translation rules shared by all three.

## Decision

The original-language source is canonical. A TRACE translation is a derived representation of that same source and is never an independent source or corroborating item.

For each admitted non-English source, TRACE must retain where lawful and technically practical:

- source language and detected language;
- original title, URL, permitted source text or excerpt, and original-content hash;
- English title and summary;
- optional full translation and translation-content hash;
- translation model/provider, version, timestamp, and editor-review state;
- a translation status: `not_required`, `detected`, `translated_unreviewed`, `translated_editor_reviewed`, `translation_disputed`, or `translation_failed`.

Translation occurs during controlled ingestion and analysis, before cross-language clustering. The system must retain the original representation and join translated and original material to the same source identity. It must not claim that a Chinese announcement and its English TRACE translation are two confirmations.

For routine, low-impact product news, automated English metadata may support normal editorial review. Benchmark, licence, API, legal, regulatory, security, accusation, or other high-impact material requires enhanced review of the relevant original wording and must continue to obey ADR 0004.

TRACE Desk must present original and translated representations, their status, and review actions. Desktop may use a split view; mobile must remain usable through a compact view or tabs. The initial public product publishes the approved TRACE work in English while retaining attribution to the original source. Later publication translations must be generated from the approved English canonical TRACE version, use distinct language URLs, and declare their translation and review status. They must not be independently regenerated from raw source material.

## Consequences

- Earlier foreign-language discovery can enter the same governed evidence pipeline as English material.
- Translation provenance, hashes, review, retranslation, and language-aware clustering add schema and operational work.
- Automated translation helps discovery but cannot silently strengthen evidence or replace high-risk editorial judgement.
- The architecture supports later bilingual guides, language-specific feeds, and Ask TRACE responses without creating divergent factual versions.

## Implementation Requirements

- Language detection and source-language fields on admitted feed and manual-intake records.
- Original/translation provenance, hashes, statuses, provider/model metadata, and review audit records.
- Cross-language duplicate and cluster matching that preserves one evidence identity.
- TRACE Desk original/translation review affordances and enhanced-review rules for high-impact material.
- Public translation labels, language metadata, distinct URLs, canonical-language relation, and `hreflang` support when multilingual publication is enabled.
- Tests proving a translation cannot be counted as an independent source and high-impact untranslated or unreviewed material cannot bypass review.
