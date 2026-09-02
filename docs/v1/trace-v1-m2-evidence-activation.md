# TRACE V1 Mission 2 — Bounded Evidence Activation Foundation

This checkpoint contains local-only compatibility and planning code for the
initial TRACE V1 evidence corpus. The checked-in manifest is immutable and
source-identity conservative: a canonical URL or source ID is populated only
when the local checkout proves it. Unverified references from
`scripts/link-knowledge-sources.sql` remain candidates, not admitted sources.

## Compatibility gate

Run `npm run preflight:trace-v1-m2` against the local accepted schema before
considering `db/migration-0070-trace-v1-evidence-activation-compatibility.sql`.
The preflight distinguishes already-compatible, supported legacy, missing
additive, incompatible, and ambiguous field shapes. Missing capture/hash/state
fields require the one-time additive migration. An incompatible existing
runtime blocker stops the gate; it is never silently repaired.

The migration follows the repository's existing one-time `ALTER TABLE`
convention. It has no universal rollback claim: SQLite/D1 does not provide a
portable transactional rollback guarantee for every DDL/data combination in
this forward-only path. If a statement fails, stop and inspect the resulting
schema before any retry or activation work. No destructive table rebuild is
part of this mission.

## Dry-run boundary

`planTraceV1M2Activation` accepts the manifest, a successful local schema
preflight, and in-memory evidence fixtures. It validates the governed
source-document/version/hash/chunk/claim/assertion/provenance/freshness/
publisher chain without opening D1, R2, Queue, Vectorize, an AI/provider, or a
network connection. It does not create identities, send work, approve
reviews, or publish anything.

Every item receives a deterministic idempotency key derived from the manifest
hash and item ID. A source URL by itself cannot satisfy the locator-backed
claim assertion requirement.
