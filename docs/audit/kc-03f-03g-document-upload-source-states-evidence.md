# KC-03F/G — Governed ordinary-document upload and explicit source states

**Status:** Complete — local implementation and validation only.
**Scope:** Publisher-only upload of UTF-8 plain text, Markdown, and ordinary HTML through the existing canonical source/version, private-artifact, deterministic-extraction, chunk, and reconciliation contracts. Additive explicit retrieval, capture, extraction, and storage state dimensions are included. No deployment or remote mutation occurred.

## Upload boundary

- `src/pages/api/admin/source-upload.ts` requires Cloudflare Access authentication with the `publisher` role and a same-origin mutation request. The browser receives neither an R2 binding nor Queue credentials.
- The request accepts one multipart file and enforces a 2 MiB byte limit, a 255-character safe filename, allowed media types, matching supported extensions, non-empty UTF-8 text, and rejection of embedded null bytes. `application/pdf`, binary formats, unknown media types, and extension mismatches are recorded as `unsupported` metadata-only outcomes without parsing or R2 writes.
- Supported media types are `text/plain`, `text/markdown`, `text/x-markdown`, `text/html`, and `application/xhtml+xml`; supported extensions are `.txt`/`.text`, `.md`/`.markdown`, and `.html`/`.htm` respectively.
- Upload identity is derived from uploader identity, normalized display filename, and media type. Request idempotency is explicit through `Idempotency-Key`, with a deterministic content-addressed fallback. The same identity and bytes reuse the immutable version; changed bytes under the same upload identity create a new immutable version.
- Upload intake rows contain only attribution, safe filename/media metadata, byte length, digest, canonical source/version identifiers, state, and bounded diagnostics. Raw bodies are never written to D1 or the audit log.

## Canonical lifecycle

```text
publisher request
-> Access publisher role + same-origin check
-> bounded multipart/type/UTF-8 validation
-> deterministic upload identity and idempotency lookup
-> source_documents (admitted, editor_supplied_document)
-> source_document_versions (immutable content/transport/normalized hashes)
-> private R2 original + deterministic extraction JSON
-> knowledge_index_operations r2_put reconciliation record
-> deterministic chunks/locators and proposed extraction candidates
-> source_upload_intakes + admin audit outcome
```

Supported uploads reuse `captureAdmittedSource` and `extractStructuredSource`. They never auto-publish, create accepted assertions, establish evidentiary trust, call an AI provider, index Vectorize, or enqueue live work. Unsupported files receive a quarantined canonical source/version metadata record with `extraction_state = unsupported` and `storage_state = metadata_only`; no original artifact or parser is created.

## Explicit source states

The additive migration `0063-kc-03f-upload-source-states.sql` preserves the old `admission_state` and `extraction_status` contracts while making dimensions durable:

- `source_documents.retrieval_state`: `available`, `unavailable`, `paywalled`, `policy_restricted`.
- `source_documents.capture_state`: `not_attempted`, `captured`, `metadata_only`, `unsupported`, `extraction_failed`.
- `source_document_versions.extraction_state`: `pending`, `extracted`, `metadata_only`, `unsupported`, `extraction_failed`.
- `source_document_versions.storage_state`: `not_stored`, `private_pending`, `private_stored`, `metadata_only`, `reconciliation_required`.
- Each state dimension has a reason/diagnostic JSON envelope and a retryability flag where processing can be retried.

HTTP 404/410 is recorded as `unavailable`; HTTP 402 is `paywalled`; HTTP 451 is `policy_restricted`. Other failed retrievals remain unavailable/retryable only when transient. No paywall or policy state is inferred from an ambiguous response. Permanent Queue outcomes are acknowledged rather than retried indefinitely; transient retrieval and extraction failures remain retryable and visible.

`metadata_only`, `unsupported`, `extraction_failed`, unavailable, paywalled, and policy-restricted records are excluded from claim extraction, external evidence, citations, embedding candidates, and publication. A narrow `feed_claim_compatibility` exception preserves the existing legacy canonical-claim compatibility path without treating uploaded metadata as evidence.

## Security and privacy

Plain text and Markdown are extracted as inert text. Markdown raw HTML, scripts, forms, and executable constructs are neutralized; links remain untrusted metadata. HTML scripts, forms, remote assets, event handlers, and redirects are never executed or followed. Prompt-like source text remains ordinary quoted source material and cannot modify TRACE controls.

## Validation evidence

- `npm test` passed: 119 ingestion tests, stabilisation, Ask TRACE deterministic-first, normalized-content identity preservation, and focused KC-03F/G tests.
- Focused tests cover supported formats, auth role gates, origin rejection, empty/oversized/binary/PDF handling, private artifacts, deterministic locators, Markdown/HTML inertness, prompt-like content, duplicate/new-version behavior, zero external calls, durable unavailable/paywalled/policy states, retryability, and downstream eligibility.
- `npm run typecheck` passed with 0 errors and only pre-existing repository hints.
- `npm run build` passed, including Cloudflare route verification.
- `npm run test:migrations` and `npm run test:diff` passed.
- No live AI, R2, Queue, Vectorize, Preview D1, production D1, deployment, backfill, PASS 3, PDF parser, or PDF extraction occurred.
