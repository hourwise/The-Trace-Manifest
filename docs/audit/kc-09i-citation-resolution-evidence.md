# KC-09I D1-authoritative citation resolution evidence

**Status:** Local implementation complete; no production database, Worker
deployment, Vectorize index, or live Preview embedding state was changed.

`src/lib/server/knowledge-citation-resolution.ts` treats model-produced
citation fields as untrusted references. For each citation it re-reads the
assertion, canonical claim, source document, immutable source version, and
source chunk from D1. A citation is accepted only when:

- the assertion is admitted, reviewed (`accepted` or `amended`), current or
  unknown, and an external evidence/reported-claim assertion;
- the canonical claim is not retired, corrected, superseded, or disputed;
- the source document remains admitted and the version is captured/extracted;
- the assertion, version, and chunk IDs agree exactly; and
- the assertion and chunk start/end locators exactly match the supplied
  citation.

Resolved records return the canonical claim, assertion text, source URL/time,
bounded chunk excerpt, source language, and provenance-group handles. Duplicate
or malformed citations and every state, identity, or locator mismatch are
returned as explicit fail-closed rejections. The companion
`resolveAndValidateCitationReferences` helper verifies that every assertion
referenced by an answer claim survived D1 resolution.

The Ask TRACE gateway invokes this D1 check when a generated citation belongs
to an evidence excerpt explicitly marked `externalEvidenceResolved`; otherwise
the existing supplied-excerpt validator remains the boundary for non-knowledge
evidence bundles.

Validation coverage includes a valid reviewed citation, wrong version/chunk or
locator tampering, duplicate IDs, missing answer references, quarantined source
drift, and stale assertion drift.

Checks passed:

- `npm.cmd test -- --run` (119 ingestion checks plus stabilisation tests);
- `npm.cmd run typecheck` (zero errors; four pre-existing hints).
