# KC-09 embedding and Vectorize policy

**Status:** Locked for Preview only. The Preview Vectorize index and metadata
filters were provisioned by KC-09C; KC-09D supplies the bounded indexer and
KC-09E supplies D1-authoritative result resolution. No production binding
exists.

## Decision

KC-09 uses Cloudflare Workers AI's `@cf/baai/bge-m3` dense embedding model with
1024 dimensions and cosine distance. The model is Cloudflare-hosted and supports
multilingual retrieval; original-language source text remains canonical and no
translation is generated for indexing. The code-level policy is
[`knowledge-embedding-policy.ts`](../../src/lib/server/knowledge-embedding-policy.ts).

The first index will be Preview-only:

```text
index:     trace-manifest-knowledge-preview-bge-m3-v1
namespace: kc09-bge-m3-v1
```

Vectorize is a candidate-recall layer only. Each match must still resolve through
D1 and its existing admission, publication, freshness, provenance, review, and
locator rules before becoming evidence.

The resolver returns explicit rejection reasons and provenance handles for
source documents, assertions, chunks, and knowledge source references. A
publication, admission, expiry, correction, or change-proposal update therefore
invalidates an old vector match at query time, even if the remote vector has
not yet been reconciled.

## Input, costs, and identifiers

- KC-04's existing locator-backed source chunks are preserved, with a maximum
  2,000-character embedding input and no new overlap/re-chunking rule.
- Preview uses a 250,000 input-token daily ceiling, a 1,000,000-token backfill
  ceiling, and a 16,000-token maximum batch ceiling. These ceilings apply even
  if the provider price changes; current pricing must be rechecked before a run.
- Vector records contain only stable D1 identifiers and the minimum filter
  metadata. They never contain raw source text, retrieved URLs, publisher
  identity, or browser credentials.
- Vector IDs are stable D1 record IDs. `record_type` covers source chunks,
  canonical claims, published stories, knowledge sections, Guides, and
  corrections.

## Metadata filter contract

Create and verify these five string metadata indexes before any upsert:

1. `record_type`
2. `language`
3. `admission_state`
4. `publication_state`
5. `embedding_version`

The version is represented both in the namespace and metadata so stale vectors
remain observable and can be excluded during the re-embedding transition.

## Re-embedding

Any provider, model, dimensions, or chunk-policy change creates a new policy
version and a new Preview index. Create the new metadata indexes before inserting
vectors; record idempotent D1 index operations; upsert and confirm Preview
vectors; evaluate D1-resolved retrieval and citation integrity; then obtain a
separate approval before production rollout. Retain the old namespace through
the rollback window.

## Sources

- [Cloudflare Workers AI: BGE-M3](https://developers.cloudflare.com/workers-ai/models/bge-m3/)
  documents the hosted model, multilingual purpose, and current input price.
- [BAAI's BGE-M3 model card](https://huggingface.co/BAAI/bge-m3) specifies the
  1024-dimensional embedding output.
- [Cloudflare Vectorize index creation](https://developers.cloudflare.com/vectorize/best-practices/create-indexes/)
  documents fixed dimensions and distance metrics.
- [Cloudflare Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
  requires the metadata indexes before inserting vectors intended for filtering.
