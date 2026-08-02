# Source identity normalization

New captures use `normalized_content_v2`. Historical `legacy_raw_v1` and
`normalized_content_v1` versions, observations, identifiers, and hashes remain
immutable evidence and are never relabelled or rewritten as v2.

## Why v2 exists

The KC-11C diagnostic smoke isolated repeat-retrieval volatility to the link
component: metadata, blocks, extraction structure, counts, and visible article
content remained stable. The v1 identity retained raw link order and raw `href`
details, so non-evidence fragments, tracking parameters, and source ordering
could create a new normalized identity.

## HTML canonical-link policy

`source-normalized-html-v2` represents links as a deterministic multiset. Each
record contains the canonical destination and whitespace-normalized visible
text. The admitted canonical source URL is used only as resolution context; it
is not added as an unrelated identity field.

For every link, v2:

1. trims and normalizes whitespace;
2. resolves relative destinations against the admitted canonical source URL;
3. parses destinations with the platform `URL` implementation, which
   lowercases HTTP(S) scheme/hostname and removes default ports;
4. removes fragments;
5. removes only `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
   `utm_content`, `ref`, `source`, `fbclid`, and `gclid`;
6. sorts remaining query parameters by key and then value while preserving
   substantive keys, values, paths, and duplicate parameters;
7. sorts canonical records by destination and then visible text; and
8. preserves duplicate link multiplicity.

Source order therefore does not affect identity. Adding or removing a
duplicate, changing a substantive destination, or changing visible link text
remains observable. Invalid destinations are retained in normalized textual
form rather than silently discarded.

All other supported media policies are explicitly versioned as
`source-normalized-<media-kind>-v2`. Metadata, blocks, and extraction structure
retain their previous evidence-bearing behavior.

## Version and observation identity

V2 lookup requires the same source document, normalized-content hash, and
`hash_semantics_version = 'normalized_content_v2'`. It has no legacy or v1
fallback. New version IDs are deterministic and semantics-qualified:

```text
source-version-{canonicalUrlHash}-normalized_content_v2-{normalizedContentHash}
```

The historical `source_document_versions` uniqueness key includes the legacy
`content_hash` column. New v2 rows store a deterministic semantics-qualified
compatibility digest there so an identical v1 transport cannot block the v2
row. The exact response-byte digest remains in `transport_hash` and in each
observation. Equivalent v2 captures reuse one version; different transports
produce distinct observations.

## Migration and backfill authority

Migration 0061 expands the three source-flow semantic domains to accept v2,
preserves the observation table's no-default contract, and expands inventory
snapshot/authority policy constraints to `kc-11c-v2`. It preserves historical
rows and recreates all affected indexes, triggers, and the current-authority
view.

Backfill plans now use `kc-11c-v2` and hash the active source semantics plus the
complete media-policy map. A v1 plan fails validation under the v2 runtime. An
immutable inventory snapshot may be reused as reviewed data, but its v1
authority decision is not accepted: a separately authorized v2 authority
decision is required.

KC-11C remains open. Preview migration/deployment, v2 authority establishment,
and a fresh two-pass smoke with new plan hashes and batch IDs require separate
authorization.
