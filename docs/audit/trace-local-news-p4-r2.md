# TRACE LOCAL-NEWS-P4-R2 — independent-review remediation

Disposition: **GO FOR INDEPENDENT RE-REVIEW**. This is a local release candidate, not Preview readiness or execution approval. No remote operation, public-feed request, paid inference, scheduling, publication, push or merge was performed. STOP-BURN and both configured Cron arrays remain `[]`.

## A. H1–H3 reproduction and remediation

The complete Claude DR1 report at commit `79eef0d53418ec54ae42111adde38f64ccd630fe` and its adversarial tests were read. The frozen R1 candidate is `2ad59cc998885f50411852a5dd5445bc24bd507e`. An independent D: worktree first integrated PR #19 and reproduced the DR1 attacks before changing the importer. `dr1-baseline.log` records 13 passing reproduction tests: those tests intentionally confirmed the defects, rather than proving safety.

| Finding | Reproduced behaviour | R2 correction and regression |
| --- | --- | --- |
| H1 reused candidate lifecycle | An independently owned Desk/Capture candidate could become frozen by an imported proposal that could not resolve. | Every immutable imported version owns a separate `local-news-p4:<version_id>` candidate. Existing leads are contextual references, never proposal owners. Their original lead, identity, hash, state and audit remain untouched. Independent release/rejection works without changing the external lead. CI ownership test and DR1-A3 cover this. |
| H2 multiple versions | Two versions sharing one candidate could each block the other's resolution. | Unique per-version ownership plus immutable `same_canonical_url_order_unverified` links. Each version retains its own decision, revision and review obligation. Tests cover both pending, earlier reviewed/rejected, concurrent decisions, duplicate delivery, rollback during correction and later cluster changes. Two eligible releases promote through PR #11 to one review cluster. |
| H3 tests absent from CI | Standard application CI omitted importer safety tests and depended on private D: captures. | `npm test` now includes `test:news-import:ci`; `npm run ci` also includes a built fictional Desk/Review test. Committed fictional RSS/Atom and in-memory SQLite exercise the real service, migration, Access/Pages/Worker signing and governance. No live captures are committed. |

The smallest ownership correction does create a separate review candidate when an ordinary lead already exists. It does not create a story cluster, duplicate publication or canonical evidence. An editor can reject that imported proposal independently. `candidates_reused` now means an already stored **same version**, not an external Desk candidate. Delivering an already reviewed version in a different package preserves its decision and records `import_existing` with attributed audit.

Version links preserve a relationship, not a claim of publisher update order or supersession. Corrected/reordered feed tests are simulations; no new publisher update was observed or fetched. History lookup is bounded to 20 previous versions per URL and 200 overall for a ten-item package. Overflow refuses before mutation and requires a separately reviewed continuation; it cannot leave an accepted proposal permanently unresolved.

## B. M1–M4 disposition

**M1 — rejected reopening closed.** Generic Desk transitions on import-owned candidates fail with a specific governed-review message, including `rejected → new` and later promotion attempts. Database guards reject direct state updates and `INSERT OR REPLACE`; owner identity, original lead/hash and source URL are immutable. Proposal resolution atomically synchronises its owner. A `needs_review → published` transition remains available only through the later normal promotion path with the proposal already released. No reopening capability has been invented or authorised. Newly clustered sources cannot undo a rejection.

**M2 — bounded discoverability.** `listNewsProposalPage` defaults to unresolved `held`, uses the `(review_state,version_id)` index and keyset navigation, and caps pages at 20 (default 10). Historical states have separate tabs; exact-version and related-version links preserve discoverability. Governance for queue rows is loaded by indexed candidate IDs independently of the visible proposal page, so an off-panel import cannot acquire generic controls. Tests use more than 15 proposals and 3,000 unrelated candidates. PR #19's single shared Desk filter module is unchanged.

**M3 — explicit identity maintenance.** The >50 missing-identity global fail-closed rule was reproduced. It can block unrelated legitimate imports because unseen legacy URLs might match. R2 does not ignore that ambiguity or repair it inside an import. New Desk, Capture and ingestion inserts compute PR #11-compatible canonical URL identity where revised 0080 exists; pre-0080 insert shape remains compatible. Historical `source_hash` is never rewritten.

The read-only probe selects at most 26 rows and reports a page/lower bound, not a total count. Explicit maintenance processes at most 25 records, with at most 52 batch statements and 26 writes including one attributed audit. Canonical URL results or `invalid_url`/`oversize_url` issues are stored without altering original URLs, leads or review state. Audits and CLI status use fingerprints rather than echoing private legacy URLs or raw original hashes. Stale snapshots, concurrent edits or unknown mutation triggers abort atomically. A local-file-only CLI provides status/apply/cursor resume; it cannot retrieve credentials, apply migrations or connect remotely.

The test indexed 3,750 valid records plus one malformed record in 151 batches and 3,902 writes; original hashes/leads/states survived. A 3,750-valid-row scope would need 150 batches and 3,900 writes. This is a representative **local** measurement, not a Preview inventory. Any future Preview maintenance needs separate scope, approval and D1 accounting outside the import's 40-write budget. The final disposable CLI test indexed one valid URL, deferred one invalid URL, wrote three rows including audit, and repeated with zero writes.

**M4 — approval instrument superseded.** R1 proposal `95ad03a6385a4517dfb5827a60cc2ccabb4616d08c0b03cd9efe75d7f17631b5` remains byte-identical historical evidence but cannot authorise R2. The replacement binds the revised implementation, migration and exact three-item package; owner approval and execution window are null. No earlier financial or time instrument grants authority.

Additional DR1 low findings addressed: owner replacement protection (L1), useful generic-POST error (L2), built Pages Node-import rejection (L3), removal of copied root npm policy (L6), and explicit warning that pushing may automatically deploy a Pages preview (L7). Read-only GET nonce replay within the existing 60-second signature validity remains unchanged (L4). Synthetic and real parent packages are separately pinned experiments despite both using the historical `000001` number (L5). PR #19's count scan and bounded-page sorting behaviour remains unchanged (L8).

## C. Independent DR1 regression results

Original Claude worktrees, tests and report were not edited. Copies in this branch retain DR1 attack identifiers with explicit R2 expectation changes. These are Codex regression ports, **not Claude approval**.

| Evidence | Result |
| --- | --- |
| Frozen-design attack reproduction, `dr1-baseline.log` | 13 pass; demonstrates original defects |
| R2 port, `dr1-release-evidence.log` | 13 pass; ownership, independent versions, rejected-state closure, paging, authority and replay |
| Compiled DR1 Desk probe, `render-release.log` | Three imported rows visible; three governed notes/forms; zero generic import transition forms; generic POST refused with zero writes; reader 403; GET writes zero |
| Compiled fictional/real Desk, DR1 and existing Review checks | Four test files pass |

The final DR1 port was initially invoked while the intentionally invalid CI evidence environment was still set; it failed with `ERR_MODULE_NOT_FOUND` for `Z:/NO_BASELINE/p1/storage.ts` before running tests (`dr1-release.log`). The explicit real-evidence invocation then passed all 13 (`dr1-release-evidence.log`). That optional acceptance suite requires its documented retained inputs; normal CI does not.

## D. CI integration and evidence independence

The complete `npm run ci` passed (`full-ci-final.log`): diff, Astro and Worker types, application tests, migration checks, security, evidence policy, Markdown policy, build/routes/role checks, story/review renders and new fictional importer render. Subsequent final small changes were covered by typecheck, all 14 portable importer cases, all 13 DR1 cases, four compiled page checks, security, generation checks and the real acceptance suite. Final Astro result: 302 files, zero errors, zero warnings, nine hints; Worker TypeScript passed.

Portable importer tests passed **14/14** with `TRACE_P4_EVIDENCE_ROOT=Z:/NO_EVIDENCE` and `TRACE_ACQUISITION_BASELINE=Z:/NO_BASELINE` (`ci-release.log`). They exercise publisher-only authenticated signing, invalid JWT/HMAC/origin/role, gates, provenance, malicious XML, exact receipt accounting, zero-write replay, immutable records, conflicts, races, old schemas and rollback. Generator `--check` rejects drift without updating generated code.

Mutation proof: a disposable test database deliberately dropped the candidate-state guard. The governance tripwire failed with `Missing expected exception` and nonzero exit (`ci-mutation.log`). Application code was not weakened. This proves the CI assertion detects that broken database protection.

Separate real acceptance tests passed **41/41** (`real-final.log`). The preserved acquisition package passed **317/317** unchanged (`acquisition-regressions.log`) using fresh R2 scratch storage. It remains on accepted historical branches rather than being carried into this hosted-import release.

Clean locked installation was attempted offline with scripts disabled. It stopped with `ENOTCACHED` for `zwitch@2.0.4` (`locked-install.log`); no dependency was substituted or downloaded. Validation used the existing installed dependency tree. Direct SAX remains pinned/installed/locked at 1.6.0; the separate nested SVG dependency retains its lock requirement. A successful integrity-checked clean install and CI in an approved environment remain release gates. No claim of a clean-install success is made.

## E. Migration compatibility

Revised, unapplied migration: `db/migration-0080-local-news-import.sql`.

SHA-256 of UTF-8 source with CRLF normalised to LF:
`3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be`.

Local matrix covers the merged schema through 0077, optional inert 0078/0079 fixtures, pre-0080 ordinary Desk behaviour, published/withdrawn/ambiguous histories, independent legacy identities, multiple versions, rejected proposals, foreign keys, immutable identity, direct UPDATE/REPLACE, interruption and concurrent/repeated review. Sidecars, unordered links and owner consistency are enforced by reviewed triggers; the generated trigger certificate rejects unknown mutation triggers. R2 adds canonical-identity issue tracking and immutable version links. Migration 0072 is unchanged.

Local/remote refs available for inspection showed 0080 confined to P4-derived work, 0078/0079 in unrelated newsletter work and no 0081 allocation. No remote fetch or schema query was performed; allocation must be checked again before any release. No newsletter application or migration is included in this diff; 0078/0079 copies are test fixtures only.

There is no authority to rewrite an already deployed migration. If any older 0080 has been applied elsewhere, stop and design a forward migration; do not run these ALTER statements again or claim compatibility without inspection. Production without 0080 retains ordinary legacy transitions and submissions; disabled routes do not require new sidecars.

## F. Real-source offline import

No new network acquisition occurred. Retained XML and receipts from the approved 27 October pilot were validated offline. The spent acquisition ledger still shows four attempts (200, 200, 304, 304), 79,074 observed body bytes and no remaining attempts.

| Retained identity | SHA-256 |
| --- | --- |
| Original ten-candidate bundle file | `d88ecb6cdeec55508ce912ba5b244187a1a0b7f583794698f9ca97dc6582c38f` |
| DeepMind RSS, 69,055 bytes / 100 entries | `f8ff948e98d63b7201ae63315f44a3db1413f910230713affe6177b4208611b0` |
| Apple RSS, 10,019 bytes / 10 entries | `419e82fa7d2a4718ae04d50d6897001c855c0ba1ec418d91705115b4b1130621` |
| Selected bundle identity | `eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48` |
| Selected bundle file | `fb4359f6a6c9ef8ba3969af55e59b187c8b7fb3bd15c4bc1b311d3333554c673` |
| Selection manifest | `9fb0887b759ffbda62b923c17ded867c4204b2478716b809fcfb95e5534607b5` |
| Candidate inventory | `539d26df8fb6359c67c84dac0f240b16593f3ead277dfd97b438b36536374a7b` |
| Retained source state | `3720758ba98d557dae145eab36f0c9a3e73cc14cc85b0beb2421278b3038f8b2` |

Package `TRACE-NEWS-P3-000002` retains the same three selected records: DeepMind on-device scam detection collaboration; Apple Selection-Based Structured Reasoning; Apple Code-Switching Detection. Exact XML locators, source/content hashes, title, canonical URL and publication/retrieval dates recompute. These are **publisher claims, unverified and review-required**; article bodies were not fetched. Three of the ten parent candidates lack excerpts; all 110 historical entries lack item-update timestamps. The three selected summaries satisfy the existing 80-character minimum. No article-level factual verification is claimed.

Local import produced three held candidates, three versions/proposals/deliveries/events, three attributed audit rows and one immutable package. Signed dispatch adds one consumed nonce. No feed item, story cluster, publication or canonical admission was written. Fresh-signed identical replay added zero rows; replay with the consumed nonce was refused. Source rows 7/20 were **simulated local registry bindings**, not remotely verified identities.

## G. Performance and D1 cost bounds

| Measurement | R2 local result |
| --- | --- |
| Three-real-item signed atomic batch | 27 statements, 20 trigger-inclusive row writes |
| Service preflight / signed preflight | 10 / 11 statements, zero writes |
| Signed import including checks | 38 total statements |
| Fresh-signed identical replay | Two read statements, zero writes |
| Maximum bound parameters observed | Nine |
| Stored real package record | 90,330 bytes |
| Five-item historical synthetic control | 40 signed batch statements, 33 writes; independent correction owner plus one version link |
| Import ceiling retained | 40 row writes; at most 47 batch statements (40 writing statements plus seven guards) |
| Direct-service lifecycle, no signed nonce | 26 batch statements / 19 writes / zero-write replay |
| Local lifecycle SQLite growth | 102,400 bytes (2,252,800 to 2,355,200); fixed local schema/seed |
| Sampled Node process RSS | 276,631,552 bytes; process-level observation, not Worker memory |
| Local full ingestion bundle | 438,455 bytes / 116,979 gzip; 62 input modules |
| Local importer service bundle | 64,353 bytes / 20,236 gzip; ten input modules |

Lifecycle receipt: `D:/TRACE/local-acquisition/news-p4-r2/reports/lifecycle-420126a2ce8b8e26f0c8877073a993c5bb54f63de865d42585865e10241a1a05.json`. Separate plan measurements include nonce accounting; the direct-service receipt intentionally does not. The original R1 26-statement/20-write signed result remains historical and is not reused as the R2 guarantee.

Lookup plans use canonical URL and missing-identity partial indexes, version URL indexes, proposal-state cursor indexes and unique candidate ownership. Some bounded result sorting uses temporary B-trees; PR #19's unchanged global state counts scan its covering index. These are not claims of zero scans or zero cost. History/legacy overflow fails closed. No remote D1 CPU, row-read billing, latency or actual invoice was measured; local statement/write counts cannot certify those quantities.

At the final disk observation D: had 34,125,852,672 bytes free. Generated logs, caches, temporary files, disposable SQLite and reports reside under `D:/TRACE/local-acquisition/news-p4-r2`; retained evidence is read from a D: copy. That free-space value is a point-in-time observation, not a reservation. No original evidence or uncommitted package is cleaned up automatically.

## H. Focused release candidate and Git history

Worktree: `D:/Users/fleur/The Trace Manifest/.worktrees/trace-local-news-p4-r2-remediation`.

Branch: `codex/trace-local-news-p4-r2-remediation`.

Accepted merged application: `9da92ece6d51d1bfeed9b7eb1289f891a548421c`, including PR #19 head `05b3ac07ecfa22ce9ad1052edd54020639b31ddc`. Integration onto the frozen R1 worktree made local PR #19 commit `cf3faeb5d86ee9877d599875f827679500cd5f52`. The sole `desk.astro` conflict was adjacent imports: both PR #19 queue/filter imports and P4 governance imports were retained. No second generic Desk state machine or filter was created.

Preparation implementation commit: `e0b82eeae870238dd0a553470e760c89712eb98f`, preserved on `codex/trace-local-news-p4-r2-preparation-history`. To produce the focused review ancestry without merging or changing old branches, an identical tested tree was committed with accepted main as its single parent. No reset was used.

Focused implementation commit: **`4e458905c41e89a685cfaa0bb2fcb28b489999b6`**; parent `9da92ece6d51d1bfeed9b7eb1289f891a548421c`; tested tree `44b0ea09601841248486bcf11397f9dd99ff8897`. Subsequent report/inventory commits contain documentation only. The exact final tip is returned in the handoff and recorded in the D: release receipt.

Before reporting, the implementation diff was 56 files, 2,357 insertions and 27 deletions against main. The final name/status inventory is `trace-local-news-p4-r2-files.tsv`, including the report, PR draft and inventory itself. It distinguishes new files from the small existing integration changes.

The hosted importer carries five pure parser inputs, generated projections, relevant tests, pending migration, integration and release documentation. The 150-file historical acquisition baseline is excluded from this diff; original accepted worktrees and D: datasets remain intact. There are no `local/acquisition` or root `.npmrc` changes against main. The real acceptance helper can load its preserved baseline through `TRACE_ACQUISITION_BASELINE`; ordinary CI cannot load it and does not need it. Historical R1 proposal bytes remain committed for audit.

Protected heads reverified unchanged and clean: scheduler `a321156a2e085b5d9570e671bc2aa6d54f79d7ec`; R1 `2ad59cc998885f50411852a5dd5445bc24bd507e`; Claude integration `055a2938e6a503c9c747f1e0eb7ad7460ba03281`; Claude report `79eef0d53418ec54ae42111adde38f64ccd630fe`. No original approval, financial ledger, raw response or frozen source identity was edited.

## I. Reissued Preview proposal

Committed instrument: `local-news-p4-r2-preview-proposal.json`, schema `trace-news-preview-pilot-p4-r2.1`.

* Proposal SHA-256: **`faf4a5c0fb05bafd58c31e2f463e4a3665538c2161ad95ebb108f4d0672ae4da`**.
* Implementation-list digest: **`eba491e1ff02c7bd325e669a9f2dae4c6772354ead659bb25b03efe35906f174`**, covering 38 individually hashed files with UTF-8 CRLF-to-LF source normalisation.
* Exact migration hash: `3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be`.
* Exact three-item bundle: `eeb728a1eaffdcdca0e9ac23f6a1f7a5655f1c97d8710cfe593d2f48ca03eb48`.
* Recorded target only: Preview `trace-manifest-db-preview`, UUID `f312f662-2252-4005-8103-1a40d546e16b`; identity/source binding checks must occur later under separate authority.
* Maximum import writes 40, batch statements 47, pristine expected signed batch 27/20. Migration, source setup and maintenance are outside that budget and separately unapproved.
* `owner_approval: null`, `execution_window: null`, imports disabled. Any future window must be finite, canonical UTC and at most one hour, retaining the 15-second closing margin.

Two executions of offline plan preparation generated identical proposal bytes (`plans-release.log`, `plans-replay-release.log`). All 38 file hashes, the migration and historical R1 instrument were checked again. The proposal includes source bindings, fresh-signed zero-write replay, read-only reconciliation, stop conditions and forward recovery. Closing the creation gate does not remove signed-in Preview publisher review authority over existing proposals; Production remains refused.

## J. Remaining blockers and disposition

**GO FOR INDEPENDENT RE-REVIEW.** H1–H3 and M1–M4 have local remediation and behavioural evidence. PR #18's generic transition cannot bypass P4 governance in the tested application/service/database paths. Reopening remains refused; no canonical admission occurs automatically.

Next gate: Claude independently reviews this exact release commit/tree, portable CI, DR1 regression ports and changed migration/proposal. Remaining release gates are clean locked installation/CI, refreshed allocation review, verified Preview target/schema/source identities and backlog, separately approved maintenance if necessary, and separate push/deployment/migration/feature/window/import authority. A push can trigger an automatic Pages preview deployment and therefore needs approval acknowledging that side effect. No Preview operation is authorised by this report.

Logs and measurements: `D:/TRACE/local-acquisition/news-p4-r2/logs`. Operator steps and scoped read-only SQL are in `docs/runbooks/local-news-p4-r2.md` and `docs/runbooks/local-news-p4-r2-checks.sql`. No inference, source expansion, cloud ingestion, newsletter activation, remote mutation, scheduling or publication is needed for re-review.
