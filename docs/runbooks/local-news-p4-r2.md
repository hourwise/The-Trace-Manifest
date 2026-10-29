# Hosted news importer — release verification and Preview procedure

This release candidate remains unapproved for push, deployment, remote database operations, feature activation or import. STOP-BURN and Cron `[]` remain in force. Pushing can trigger an automatic Pages preview deployment; any future push approval must acknowledge that side effect.

## Portable verification

From the repository root, using the exact locked dependencies:

```sh
npm ci --offline
npm run test:news-import:ci
npm run ci
node scripts/generate-news-import-runtime.mjs --check
```

If an offline archive is missing, preserve the error; do not fetch packages, substitute versions or change the lockfile without authority. Distinguish dependency reuse from clean-install success. Disable Astro telemetry and Wrangler metrics; configure scratch storage according to the machine's approved policy.

Normal CI uses committed fictional XML, LF-derived fixed identities and in-memory SQLite. It needs no retained capture, local acquisition package, credential, PowerShell or machine-specific path. Templates are LF-normalised before hashing/parsing. Disposable database creation never rewrites identities. Tests exercise signed Worker authority, window/hash/budget checks, provenance, migration, generic Desk refusals, immutable identities, concurrency, replay and explicit identity-maintenance service functions. CI also builds/tests fictional Desk and Review pages.

Runtime inputs and their generator stay in the release. Use `npm run generate:news-import` only for an intentionally reviewed source/migration change; `--check` refuses drift without rewriting code. Pages builds reject Node-only imports; existing Worker compatibility settings, lockfile and SAX pin remain unchanged.

Workstation acquisition, retained-evidence acceptance tests, proposal generation and local operator commands live only on the separate local-tooling branch. Its final commit must have the final release as its parent, so acceptance tests exercise exactly the reviewed hosted code. That branch must not be pushed without a separate owner decision.

## Editorial lifecycle

Each immutable version owns `local-news-p4:<version_id>`. Ordinary Desk/Capture leads are contextual references; their original identity, content, hash, state and audit survive. Rejecting an import changes only its owner. Same-URL links record `same_canonical_url_order_unverified`, not publisher update order or approved supersession. Simulated corrections are not observed publisher updates.

Publisher resolution requires a reason, current revision and source/cluster checks, with atomic owner/proposal/event/audit consistency. Generic Desk transitions cannot bypass review. Indexed keyset pages expose pending proposals first, with historical-state tabs and related-version links. PR #19 remains the single shared queue-filter implementation.

N1 remains open: a released import cannot be withdrawn, rejected or archived; **release only what will be promoted**. Leave uncertainty held. A URL already in a cluster requires correction through that existing cluster's review rather than automatic release of a later imported version. No reopening capability is authorised here.

Closing `TRACE_NEWS_IMPORT_ENABLED` stops creation/preflight while signed-in Preview publishers retain review of existing proposals. Production refuses the route. No gate is enabled by this guide.

## Legacy identity gate

New compatible Desk/Capture/ingestion inserts populate revised 0080's canonical identity columns; old deployments retain their legacy insert shape. Historical hashes, leads and decisions remain intact. The importer refuses more than 50 unresolved legacy URL identities. The bounded read-only probe is in `docs/runbooks/local-news-p4-r2-checks.sql`; actual Preview state remains unknown and inspection requires separate approval.

Portable CI directly covers `inspectCandidateIdentities` and `backfillCandidateIdentities` with fictional data. Maintenance remains explicit, bounded and audited, outside import accounting. N4 remains open: there is no approved remote maintenance path. An excessive Preview backlog stops the pilot for a separate reviewed mission. Do not bypass this with raw ad hoc SQL. Migration and source setup also require separate approval and cost accounting.

## Preview gates — all unapproved

1. Independently review both exact branch identities, inventories, CI/mutation evidence and replacement proposal. Historical R1/R2 proposals stay preserved but cannot authorise the replacement.
2. Complete a clean integrity-checked locked installation and CI. Separately approve any push, acknowledging automatic Pages preview deployment.
3. Recheck migration allocation, recorded Preview target and not-yet-applied schema. Production is excluded. Revised 0080 needs 0077; 0078/0079 remain optional inert test fixtures. Keep 0072 reserved. If an older 0080 exists, stop for a forward migration.
4. Under separate release authority, deploy compatible Pages/Worker code before applying 0080 so new inserts index identities immediately after migration. Keep imports closed. Preserve Access, HMAC, origin checks, nonces and STOP-BURN.
5. Separately authorise read-only target/source 7/20/certified-trigger/backlog checks. Drift or an excessive backlog stops the pilot; source setup and N4 maintenance are separate missions.
6. Separately approve the exact migration, not-yet-applied checks and per-statement recovery. 0080 is not idempotent; interruptions require reviewed recovery. This guide does not authorise migration or changes to the operations PR.
7. Freeze/approve the replacement proposal, exact package/code/migration hashes, target, ceilings and canonical UTC window of at most one hour. Approval/window remain null. Keep the 15-second closing margin.
8. Separately approve Preview gate activation for that exact package/window. Signed preflight must match pristine expected accounting: 27 batch statements, 20 row changes. Any conflict/history/source/trigger/backlog deviation requires review.
9. Execute one bounded import with no automatic retry. Use scoped postflight SELECTs to verify three held owners/proposals, immutable provenance/receipt/events, attributed audit and nonce, and no feed/cluster/publication/canonical-admission changes.
10. One fresh-signed identical replay must add zero writes (two reads). A consumed nonce is refused. Uncertain transport/accounting requires read-only receipt reconciliation before further action.
11. Separately authorise closing creation and verify refusal of another import. Existing proposals remain reviewable; release/reject/promotion are separate editorial decisions.

The import ceiling is 40 row changes and at most 47 batch statements. The structural ten-item limit does not imply ten entirely new items fit: package/nonce plus six row changes per new item permits at most six before extra relationships. Billed database writes can include index updates; remote billing has not been measured. Stop on drift, stale state, unknown triggers, unexpected writes or missing accounting. Never reset a spent ledger or delete immutable receipts as cleanup.
