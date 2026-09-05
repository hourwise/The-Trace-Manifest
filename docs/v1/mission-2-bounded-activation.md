# TRACE V1 Mission 2 — Bounded Evidence Activation

This file is the authoritative implementation record for the Mission 2
candidate. It describes a local, fail-closed activation path. It does not
authorize migration execution, evidence activation, deployment, scheduler
changes, or any Production/Preview write.

## Candidate identity

- Base: `main` at `68baf510de47687759e1602dc517cd23ed3e2eb8`
- Branch: `codex/trace-v1-m2-bounded-activation`
- Manifest: `trace-v1-m2-bounded-activation-v1`
- Manifest ID: `trace-v1-m2-bounded-activation`
- Manifest hash: `c2c61aea6c96df411e7a30a1a17b84ade1f59c84f2a4b471c2a63d759675a0d7`
- Manifest identity: `trace-v1-m2-bounded-activation-v1:c2c61aea6c96df411e7a30a1a17b84ade1f59c84f2a4b471c2a63d759675a0d7`
- Machine-readable manifest: `docs/v1/mission-2-bounded-activation-manifest.json`

The launch set is immutable: 15 primary stories, 5 reserves, and 6
knowledge documents. Reserves cannot be promoted automatically. A future
reviewed manifest revision must perform that promotion explicitly.

## Source identity contract

The manifest records four assessment starting points: source 1 OpenAI News,
source 116 OpenAI Agents SDK Docs, source 17 Hugging Face Blog, and source 115
Model Context Protocol Docs. Each has a source ID, canonical starting URL,
connector, and `EXPECTED_UNVERIFIED` status.

Those values are not activation proof. Every item remains
`SOURCE_IDENTITY_UNRESOLVED` with null item-level URL, source ID, connector,
and URL-hash fields. Activation requires a governed proof containing all of:

1. a positive canonical source ID;
2. a normalized HTTP(S) canonical URL;
3. the accepted connector (`rss` or `github_api` for the launch knowledge set);
4. a SHA-256 hash of that normalized URL; and
5. a source-record basis for expected knowledge identities.

A URL by itself, an unverified script reference, an ambiguous mapping, a
connector mismatch, or a hash mismatch fails closed.

## Activation architecture

`src/lib/server/trace-v1-m2-executor.ts` is a pure coordinator around the
existing governed source/claim/provenance/freshness paths. It accepts only a
narrow `prepareItem` operations port and the immutable manifest. It does not
accept SQL, table names, arbitrary source URLs, provider calls, or scheduler
callbacks.

The existing `trace-v1-m2-planner.ts` remains the authoritative stage gate.
The executor supplies a verified source identity and a prepared evidence
fixture, then delegates the ordered checks:

`source identity → source document → immutable version → transport/content
hashes → capture/extraction/storage → locator-backed chunks → canonical claim
relationship → assertion → relationship/source-role/directness/evidence
treatment → provenance review → source admission → freshness review →
conflict/correction/supersession checks → publisher decision`

The executor is not imported by a Worker, Pages route, or cron path in this
candidate. `execute` is refused for `PREVIEW` and `PRODUCTION`; only
`LOCAL_TEST` can create local candidate receipts.

## Bounds and replay

The fixed per-invocation bounds are:

- 3 items;
- 3 source captures;
- 12 claims;
- 24 assertions;
- 24 chunks; and
- 3 knowledge mappings.

The receipt key is
`manifestHash:itemId:bounded-activation-v1`. Receipts are append-oriented,
one per operation key, and contain the manifest identity, item identity,
stage, environment, source/version identifiers, outcome, reason, and a
receipt fingerprint. A matching key replays without re-running preparation; a
conflicting receipt fingerprint fails closed. D1 access is fixed-key lookup
and insert only. There is no arbitrary SQL port or unbounded graph traversal.

The additive candidate table is `trace_v1_activation_receipts` in
`db/migration-0071-trace-v1-bounded-activation.sql`. The same candidate
migration makes the freshness review table/index/trigger contract explicit
with `IF NOT EXISTS`; it does not rewrite historical rows. Migration 0070
remains the earlier compatibility candidate for missing capture/hash fields
and is classified separately by the existing Mission 2 contract preflight.

## Compatibility preflight

`trace-v1-m2-activation-preflight.ts` composes the existing 19-field
compatibility contract with the minimum Mission 2 objects:

- `evidence_freshness_reviews`;
- `trace_v1_activation_receipts`;
- both freshness indexes and the receipt manifest index; and
- the append-only freshness triggers.

Missing additive fields or objects produce `MIGRATION_REQUIRED`; incompatible
or ambiguous schema identity produces `FAIL_CLOSED`. Only a complete local
catalog produces `ACTIVATION_ALLOWED`.

## Deterministic Ask TRACE mode

`TRACE_ASK_MODE=deterministic` is an explicit, opt-in public Ask TRACE mode.
The default remains `provider`. Deterministic mode:

- keeps D1 governance, idempotency, quota, and the application-owned decision
  packet;
- does not reserve provider budget or enter a provider circuit;
- does not require `DEEPSEEK_API_KEY` for public Ask TRACE;
- returns bounded application-owned summaries from reviewed evidence;
- preserves the existing Ask TRACE payload shape; and
- fails closed for competing positions, stale/disputed evidence, incomplete
  structured citation metadata, or a citation that does not resolve to the
  admitted assertion/version/chunk/locator relationship.

No frontend or Luna work is included. The existing Astro contract continues to
consume the same payload fields. Editorial/admin paths remain provider-gated.

## Validation and authorization ledger

The focused candidate test covers immutable manifest contents and hashing,
source identity proof, reserve blocking, bounds, schema objects, migration
replay of 0071, local receipt idempotency, production execution refusal, and
preflight blocking. The existing Mission 2, migration, security, evidence,
knowledge-markdown, inventory, backfill-cost, typecheck, and build checks are
run before handoff.

Remote Mutation Ledger: `NONE`.

This candidate performs no remote D1 migration, source capture, evidence
activation, Queue/R2/Vectorize write, Worker/Pages deployment, Access or
secret change, scheduler change, provider call, or Production mutation.
