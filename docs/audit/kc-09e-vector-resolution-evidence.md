# KC-09E D1-authoritative vector resolution evidence

**Status:** Local implementation complete; no production retrieval path or
production Vectorize binding is enabled.

`src/lib/server/knowledge-vector-resolution.ts` resolves Vectorize candidates
only after re-reading the canonical record from D1. It accepts the locked
stable ID format (`record_type:record_id`), requires the KC-09 embedding
version, and treats Vectorize metadata as a consistency check rather than an
authority. The resolver supports source chunks, canonical claims, published
stories, knowledge sections, optional published Guides, and published
corrections.

Eligibility is fail-closed. Source chunks must still belong to an admitted
source document and captured/extracted version, retain both locators, and be
indexed with the current model/version. Claims must have a non-retired current
state and an admitted, accepted, current/unknown assertion backed by an
admitted extracted/captured source; discovery-only and internal-synthesis
assertions are excluded. Stories, knowledge sections, Guides, and corrections
are rechecked against their current publication, approval, expiry, review,
change-proposal, or published-ledger state. Source document memberships,
assertion IDs, and knowledge source references are returned as provenance
handles for later citation resolution.

The resolver sorts by score, de-duplicates IDs, bounds accepted results, and
returns explicit rejection reasons for stale policy versions, state drift,
missing records, malformed IDs, and unavailable optional tables. A D1 state
change after indexing therefore invalidates an old vector match without a
Vectorize delete or metadata mutation.

Validation:

- `npm.cmd test -- --run` passed (119 ingestion checks plus stabilisation,
  including KC-09E resolution and quarantine tests).
- `npm.cmd run typecheck` passed with zero errors (four pre-existing hints).
