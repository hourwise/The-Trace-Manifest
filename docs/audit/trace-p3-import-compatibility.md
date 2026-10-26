# TRACE-LOCAL-NEWS-P3 compatibility with TRACE-EDITORIAL-DEDUPE-R1

**Prepared:** 2026-10-26, TRACE-RESTORE-02 Milestone F.
**Inspected read-only:** Codex branch `codex/trace-local-news-p3-import` at `e50825cf383040c7bd51edeee94384f51bfa62e3`, via `git show` only; no Codex worktree or file was modified.
**Not done:** no feed was fetched, no package was imported, and no Preview or Production database was read or written.

## How P3 binds to TRACE

P3 does **not** reimplement source identity. `local/acquisition/news/p3/reference.ts` mirrors TRACE's own files from two pinned commits and runs them locally:

- `EDITORIAL_COMMIT = 7dfff69` (the TRACE-RESTORE-01 integration head);
- `REVIEW_COMMIT = 331391a` (the #12 head).

The mirrored files are:
- `source-identity.ts` and `source-conflicts.ts`;
- `admin-page-writes.ts`;
- `cluster.ts` and `dedup.ts`;
- `tests/sqlite-d1.ts`;
- every `db/*.sql` file.

P3 refuses to run if the identity interface differs between the two pins.

**Status after TRACE-RESTORE-02:** the five runtime interface files are **byte-identical** at both pins and on the current heads of #11, #12 and the integration branch. TRACE-RESTORE-02 changed only tests, docs, `package.json` and the test adapter. The adapter (`tests/sqlite-d1.ts`) gained an optional **trailing** parameter (default unchanged) and the 0078/0079 tables, so re-pinning stays compatible. Both pinned commits remain reachable on remote branches (no history was rewritten).

**Versioned contract:** `tests/fixtures/p3-identity-contract.json`, checked by `tests/p3-import-contract.test.ts` on the integration branch (#15). It records:
- the P3 commit, pins, policy name and schemas;
- the SHA-256 of the five interface files at the pin (the test fails if any changes, forcing a coordinated re-pin);
- canonical URL vectors with hashes computed independently of TRACE code.

## Compatibility checks

| Check | Result |
|---|---|
| Canonical URL treatment | **Compatible.** P3 records `policy: trace-editorial-dedupe-r1/canonicalSourceUrl` and calls TRACE's own `canonicalSourceUrl`. The vectors pass in Desk (`sourceUrlHash`) and ingestion (`hashURL`). |
| URL-hash identity | **Compatible.** The importer rejects a candidate whose `duplicate_identity.url_hash` differs from TRACE's `sourceUrlHash(canonical_url)`, and re-verifies existing `feed_items` and `editorial_candidates` hashes before writing. |
| Source binding | **Compatible by design, unverified against live data.** It requires an exact `sources` row match (id, name, url, feed_url) and never auto-registers. Sources 7 and 20 have not been compared with Preview or Production; that is a pilot read. |
| Package and version identity | **Compatible.** Bundle, payload and snapshot hashes are verified; candidates are capped at 10 and bundles at 2 MiB; replaying the same `package_id` with the same hash performs zero writes, and a conflicting hash is refused by importer check and trigger. |
| Corrected source items | **Partial.** A new `content_hash` for the same item becomes a new immutable version proposal (`news_import_versions`, UNIQUE(item_id, content_hash)) linked to the same URL. Nothing in TRACE review surfaces "this version corrects an earlier one" yet. |
| Existing-cluster membership | **Compatible.** The importer never creates or links clusters. It sets the candidate to `held` when the URL already belongs to any cluster. TRACE then classifies it (new, exact, retired or ambiguous) in review (#12) and refuses retired and ambiguous promotion (#11). Tested in `p3-import-contract`. |
| Conflict states | **Compatible.** The importer's `reviewIntake` uses TRACE's `loadCandidateSourceRelationships` (the #12 interface). A source-identity conflict is reported, not resolved. |
| Review-required status | **Preserved.** Feed rows are `raw`, with `review_required: true` metadata; candidates are `needs_review` or `held`; versions are `needs_review` (CHECK-enforced); there are no publication or canonical-admission writes. |
| Import idempotency | **Compatible.** `INSERT OR IGNORE` on unique keys plus a package receipt; the replay test shows zero writes. TRACE's unique `feed_items.url_hash` independently prevents a second feed row. |
| Concurrent import and promotion | **Safe, with one gap.** The import and promotion batches are each atomic. Promotion re-checks membership at write time, and the unique `primary_source_key` stops a second cluster. The gap is below. |
| D1 cost | **Bounded.** The importer's reads are keyed (`url_hash`, `source_hash`), with LIMITs of 10, 11 and 21. P3 measured 36 statements per import (peak batch 32, at most 12 parameters). |

## Integration gaps (to resolve before a hosted import)

1. **Two candidate identities.** Desk submissions use `source_hash = url_hash`. The Worker capture route (`/admin/candidates`, used by TRACE Capture) uses `hash(intakeType, url, lead)`. The importer's existing-candidate check looks up `source_hash`, so it **will not see** a capture-route candidate for the same URL, and could create a second candidate. Review still shows the shared source by URL (tested), so nothing is published twice, but the queue can hold two candidates for one source.
   - **Fix options:** have the importer also match on the canonical `submitted_url`, or align the capture route's `source_hash` with `url_hash` (that would be a TRACE change, with its own review).
2. **`held` candidates have no Desk action.** The schema allows `held`, but Desk's `VALID_STATES`/`TRANSITIONS` don't include it, so a held import is listed with no way to release or reject it. Desk needs a small `held → needs_review | rejected` transition (publisher-only, audited) before imports reach Production.
3. **Imported feed rows enter automated clustering.** Raw rows are classified and clustered when ingestion runs, producing draft clusters with a `primary_source_key` (DEDUPE-R1 keeps this to one per source, and promotion then reuses it). If imports should wait for an editor first, they need a status clustering ignores; this is a product decision, not a defect.
4. **Sidecar schema.** The four `news_import_*` tables, the index and the triggers in `news/p3/import-schema.sql` are a provisional local schema. A hosted pilot needs them as a numbered, separately approved migration. **0080 is the next free number** (0072 reserved; 0077–0079 used by #11/#13/#14), but no number is reserved here.

## Smallest safe hosted interface (design, not built)

A **publisher-only, signed admin proxy route** on the existing Worker, for example `POST /api/admin/news-import` → Worker `/admin/news-import`, wrapping Codex's `importBundle` with the integrated identity functions. It would:
- **reuse existing controls:** Access, the signed proxy, the role matrix, origin check, nonce replay protection and admin audit (no new public endpoint);
- **verify the package:** the `bundle_sha256` must match the body, the size must be at most 2 MiB, there must be at most 10 candidates, and the snapshot provenance must check out (`validateBundle`);
- **verify sources:** an exact `sources` binding, with no auto-registration;
- **write only review intake:** `feed_items` (`raw`), `editorial_candidates` (`needs_review` or `held`) and the `news_import_*` receipts and versions, with one audit row per version. It never writes clusters, publication or knowledge;
- **quarantine conflicts:** `held`, plus a reported relationship (exact, retired or ambiguous) for an editor;
- **be idempotent:** the same package and hash gives zero writes, and a conflicting hash is refused;
- **stay bounded:** keyed reads only, under 40 statements per package, and one package per request.

It stays disabled behind a flag (for example `TRACE_NEWS_IMPORT_ENABLED`) until the Preview pilot passes.

## Preview pilot handoff (reconciled; not executed)

This reconciles Codex's `NEWS-P3-PREVIEW-PILOT.md` with the current migrations, **without widening its scope.** It stays one fixture package (`TRACE-NEWS-P3-000001`; payload SHA-256 `21752d18…636b`, bundle SHA-256 `f10d4c5c…44bad`) plus one identical replay, **at most 40 row writes**, Preview only, with no publication.

| Item | Requirement |
|---|---|
| **Merged PRs** | #11 (and its Worker deploy) and #12 merged; P3 re-pinned to the merged commits, with `p3-import-contract` passing. #13/#14 are **not** required. |
| **Migrations** | 0077 on Preview (verified by its postflight); the `news_import_*` sidecar as **its own numbered migration** with its own approval (the next free number at that time). 0078/0079 are not required; 0072 is untouched. |
| **Authentication** | The hosted route above, publisher-only, through Access and the signed proxy; or, for a one-off, an operator-run local executor bound to Preview by a remote binding. Either needs explicit approval; the local simulation actor is not authentication. |
| **Database identity** | Name `trace-manifest-db-preview` **and** its committed id must match `wrangler d1 info`; refuse any other target. |
| **Expected writes** | About 28 import writes and up to 6 approved fixture-source setup writes, 40 at most. The replay must write **0**. |
| **Query bounds** | 36 statements, peak batch 32, at most 12 parameters per statement; before/after reads limited to the 4 URL hashes, the candidate and version ids and the 5 audit events. |
| **Package identity** | Exact `package_id` and bundle hash; stop on any mismatch. |
| **Audit checks** | 5 `local_news_candidate_import` events attributed to the operator; none missing. |
| **Failure handling** | Stop on a hash, source or schema conflict, an identity ambiguity, the write cap, a missing audit row, a partial batch, an outside writer, or any publication change. D1 batch atomicity leaves no partial import. |
| **Verification** | Published, withdrawn and superseded rows byte-identical before and after; new feed rows `raw`; candidates `needs_review` or `held`; no cluster rows created by the import. |
| **Cleanup** | No automatic deletion of the immutable receipts. Cleanup is either a reviewed forward migration or a quiet-window Preview restore, each separately approved. |
