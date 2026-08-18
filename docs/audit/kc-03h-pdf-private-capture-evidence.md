# KC-03H — PDF private capture evidence

Status: locally implemented and validated on `codex/kc-03h-pdf-private-capture`.

## Boundary

KC-03H treats a permitted PDF as an opaque source artifact. Capture proves only
that TRACE received, minimally validated, hashed, privately retained, and
audited the original bytes. It does not assert that TRACE read, understood,
verified, cited, or published anything in the PDF.

No PDF parser, page extraction, heading extraction, OCR, PDF service, external
AI call, embedding, Vectorize write, or public artifact URL was added.

## Intake paths and limits

- Publisher upload uses the existing publisher authentication, same-origin,
  multipart, filename, idempotency, audit, and private-storage controls.
- Admitted remote capture uses the existing URL admission, redirect
  revalidation, SSRF/private-address protections, timeout, response-size, and
  content-type retrieval service. The existing Queue consumer detects
  `application/pdf` after retrieval and routes the bytes to opaque capture.
- Publisher uploads use the existing 2 MiB governed document ceiling. Remote
  Queue capture retains the existing 512 KiB source-fetch ceiling for both
  HTML and PDF, below the capture abstraction's 10 MiB hard cap.
- Other arbitrary binary formats remain unsupported.

PDF validation is deliberately not parsing: the byte sequence must begin with
`%PDF-` and contain `%%EOF` in its final 1,024 bytes. Filename and MIME are
required to agree with the PDF path, but neither is trusted as proof of content.
Malformed, truncated, fake-extension, MIME-mismatched, and oversized inputs
fail closed without repair or capture.

## Canonical identity and storage

PDFs use the existing `source_documents` → `source_document_versions` lifecycle.
The exact original-byte SHA-256 is stored as `transport_hash` and the upload
intake digest; it is also the normalized identity for the opaque PDF media kind.
Identical bytes at the same canonical source reuse the immutable version and
the existing R2 operation. Changed bytes create a new immutable version while
the earlier version remains intact. Filename alone never creates identity.

The original is written to the existing private content-addressed namespace:

`knowledge/{canonical_url_hash}/versions/{transport_hash}/original`

D1 stores only bounded identifiers, metadata, hashes, byte length, state,
policy diagnostics, timestamps, and the private object key. No PDF binary or
decoded PDF stream is stored in D1. No extracted JSON object is created.

The capture seeds `knowledge_index_operations` with an idempotent `r2_put`
operation before writing R2. Reconciliation verifies the object metadata hash,
source-version linkage, and operation hash. A failed write leaves the version
in `reconciliation_required` with `processing_retryable = 1`; a retry is
idempotent. Reconciliation does not turn a PDF's pending extraction state into
an extracted state.

## Deterministic state policy

The existing storage policy selects the state; no model or publisher toggle is
involved:

- `private_full_text` or `editor_supplied_document` → `extraction_state =
  pending`, recorded as `pdf_extraction_pending`. This is the durable
  extraction-pending state: the original is retained, but no approved parser
  exists and no automatic parser retry is scheduled.
- `metadata_only` or `short_excerpt` → `extraction_state = metadata_only`,
  recorded as `pdf_metadata_only`. This is terminal metadata-only handling and
  does not enter a future extraction queue.
- `prohibited` → capture is rejected.

The existing `pending` schema value is intentionally retained for compatibility
with KC-03G and legacy rows; the bounded reason/diagnostic contract gives PDF
pending its explicit meaning without rewriting prior hashes or states.

## Downstream gates and Queue behavior

PDF capture creates zero source chunks, source extractions, summaries, claims,
claim assertions, embeddings, Vectorize work, Ask TRACE evidence, body
citations, knowledge inheritance, knowledge-impact matches, or publication
work. Structured extraction rejects PDF versions directly. Ask TRACE, citation,
vector, embedding, and impact eligibility exclude PDF media even where a
legacy compatibility state would otherwise admit `pending`.

The Queue consumer acknowledges a successfully captured pending PDF and does
not create an extraction job. Metadata-only PDFs are terminal. Retrieval or
storage failures use the existing bounded retry classification and remain
visible in D1; no infinite retry exists for parser absence.

The admin source page labels the outcome as “PDF stored privately — text
extraction not enabled”, “PDF metadata only”, or a storage/unsupported state.
It provides no viewer and no public R2 URL.

## Test evidence

The focused KC-03H suite covers publisher capture, replay and changed-byte
identity, authentication boundary contracts, signature/MIME/size rejection,
private R2 bytes and hash metadata, no D1 binary, pending and metadata-only
policy, zero downstream artifacts, hostile instruction-like bytes remaining
inert, remote Queue capture, reconciliation completion, and durable storage
failure. The existing KC-03F/G, source identity, reconciliation, Ask TRACE,
embedding, citation, migration, and build/typecheck suites remain part of the
repository validation commands.

## Future handoff

KC-03I may separately assess an approved PDF parser for accuracy, memory,
security, and cost. Any future parser must be separately approved before
turning pending PDF bytes into text, chunks, claims, citations, or embeddings.
