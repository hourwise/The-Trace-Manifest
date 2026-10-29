# TRACE LOCAL-NEWS-P4-N4 — local implementation and review handoff

Disposition: **GO FOR INDEPENDENT N4 REVIEW**. This is a local code-readiness decision. It grants no remote operation, feature activation or deployment authority. No actual Preview identity inventory or maintenance has been performed.

## A. Starting identities and worktree integrity

Dedicated worktree: `D:\Users\fleur\The Trace Manifest\.worktrees\trace-local-news-p4-n4`, branch `codex/trace-local-news-p4-n4`, created directly from `70c75229c8f2013552ff4ec74a39c47a8891c365`. Code-bearing commit: **`8176502210b05f0ab21e0d5fb101c5bfee165283`**. The following documentation-only commit adds this report and the generated null-approval plan; the final handoff/validation receipt records its identity without a self-referential report hash.

Frozen PR #21 release branch remains at `70c75229c8f2013552ff4ec74a39c47a8891c365`. Original tooling remains `9ee94e5af61aa816716a50c91b1e1c63e226ef98`; corrected tooling remains `697e17d2c595d7f86fed70d72c859be5b326b34b`. Protected scheduler checkout remains `a321156a2e085b5d9570e671bc2aa6d54f79d7ec`, with no tracked changes. N4 does not update any existing PR or merge any branch.

The N4 tracked issue and relevant DR2 findings were read before implementation. The inventory contract in `docs/adr/TRACE-N4-INVENTORY-CONTRACT.md` was written before the remote-operation code. Existing application auth, service, schema, source identity and proposal boundaries were inspected locally.

## B. Exact nature of the 50-row blocker

The predicate is `source_url_hash IS NULL AND submitted_url IS NOT NULL AND source_url_identity_issue IS NULL`. Lead-only candidates, indexed candidates and already classified invalid/oversize rows do not count. Historical total candidate count is not a backlog measurement.

The importer combines a bounded indexed lookup for the package's canonical hashes with a bounded **global** unresolved lookup, sorts/caps its snapshot at 51 and refuses results above 50. Filtering unresolved rows by a guessed source would risk missing duplicates whose canonical identities are still unknown. N4 leaves this predicate and guard unchanged. A pending count below 51 is necessary in the overflow case but does not by itself prove that a particular package fits the combined lookup.

Empty URLs, oversized protected history and inconsistent sampled indexed peers are explicit conflicts. N4 does not choose a preferred identity, merge duplicates or rewrite original URLs to make an import pass.

## C. Inventory API and measured read bounds

Publisher-only Pages `POST /api/admin/identity-maintenance` signs the existing v1 internal contract for Worker `POST /admin/identity-maintenance`. Both refuse Production; the Worker independently verifies publisher/HMAC, timestamp, nonce, explicit target and separate flags. There is no browser D1 binding. All requests are manual.

Inventory has an independent default-disabled flag. Body limit 4,096 bytes; response limit 32,768 bytes; page at most 25 plus one lookahead; global unresolved probe at most 51; indexed duplicate sample at most two per selected row. IDs, URL prefixes and receipt reads are bounded before returning data. Responses expose IDs, fingerprints, canonical hashes, issue/conflict codes and estimates, rather than source URLs/leads/intake hashes.

Pending is an exact count only below 51, otherwise a lower bound. Already indexed is an existence lower bound; full processed/deferred counts remain unknown. `package_import_readiness` explicitly requires a specific package preflight. Ordinary denial-audit side effects are bypassed for this special route: unauthorised requests, inventory and receipt reads perform **zero database writes**. Read-only signed replay remains possible within the existing 60-second HMAC validity; mutation nonce consumption is atomic.

| Measurement | Result | Scope |
| --- | --- | --- |
| 25-row inventory at backlog 50 | 31 SQL statements, zero changes | isolated SQLite; indexed query-plan assertions |
| Same page at backlog 3,750 | 31 SQL statements, zero changes | isolated SQLite; no full candidate table scan |
| One-row real local workerd inventory | 7 statements / 7 round trips, 39 rows read, 0 written | local D1 metadata, not remote billing |

Statement counts include nonce lookup, schema check, accepted classifier, snapshot, peer probes and summary. Candidate-row work is bounded independently of backlog growth. Schema-catalogue certification also occurs; remote billed reads, provider limits and actual schema sizes remain unmeasured. Missing provider metadata is reported as null, not a fabricated zero.

## D. Maintenance security and authority

Maintenance is separately default-disabled and never consults import approval. A finite server profile binds schema version, explicit owner/reference, publisher, Preview UUID, trusted target attestation, implementation/migration digests, canonical UTC window (maximum one hour with a 15-second closing margin), and at most ten fixed request selections. Each selection binds UUID, cursor, row limit, digest and two independent ceilings. The complete profile must also fit 4 KiB.

Each submitted request must match its exact approved slot. No automatic pagination, retries, schedules, provider calls or import activation exist. Each committed slot is durably unique through the audit event ID. A missing/expired profile, changed target/implementation, stale selection or insufficient precommit budget refuses before committing a batch.

D1 bindings cannot introspect their provider UUID. Trusted deployment fields and request equality are therefore **attestation checks**, not independent discovery. An owner-approved provider/binding/artifact verification must establish that attestation before activation. A deliberately incorrect trusted deployment configuration is outside the signed-request validation guarantee and remains a release gate.

## E. Preserved candidate invariants

Candidate updates set only `source_url_hash` and `source_url_identity_issue`, using the accepted `candidateUrlIdentity` classifier and refactored accepted backfill plan. Candidate ID, `source_hash`, submitted URL, lead, intake type, state, creator, timestamps and review/operator history are retained. Full bounded source/lead/state/history snapshots are rechecked inside the transaction, including lookahead. The update predicates and affected-row guards reject stale source material.

Invalid and oversize URLs receive existing issue codes and retain their original bytes. Consistent duplicate canonical identities remain independent candidates. Sampled conflicting peers refuse maintenance; the endpoint does not claim to perform a complete global duplicate integrity audit. No feed item, source membership, version, cluster, story, proposal, publication or canonical knowledge admission is created.

## F. Atomic writes, idempotence and audit

The reusable accepted backfill is prepared without execution, then composed with snapshot/index/clock guards, one nonce insertion and one attributed audit receipt in a single D1 batch. The accepted mutation-trigger certificate and an exact eleven-index certificate protect the cost proof before and during mutation. Unknown triggers or indexes fail closed. No migration is added.

For n selected rows, precommit reservation is **n+2 logical changes** and **5n+8 conservative storage write units**. The latter includes index/sequence effects; it is not a provider-side spending guarantee. Maximums are 25 candidates, 27 logical changes, 133 units and 56 atomic statements. At most 89 SQL statements are sent for a successful maximum batch, 91 including the aborted-batch reconciliation path. Ten distinct approved slots bound committed changes to at most 270 and reservations to 1,330; they do not authorise automatically traversing an archive. The three-item import retains its separate 40-change ceiling.

The receipt includes request/profile hash, actor, selection, target/implementation/migration identities, decisions, estimates, resulting cursor and SHA seal. A fresh-nonce duplicate within the same approved profile returns the original receipt with zero writes; a consumed original nonce is refused. Receipt lookup remains possible through inventory authority after maintenance closes. A SHA seal detects accidental corruption, not a privileged out-of-band database rewrite. This endpoint never edits/deletes receipts; N4 does not add a global audit immutability trigger.

On lost/inconsistent response accounting after commit, return a reconciliation stop. Do not automatically redispatch or release reserved cost. A fresh-nonce lookup/replay establishes the durable outcome without additional mutation. Atomic failure rolls back candidate updates, nonce and audit together. Sanitised failure codes are logged; operators must retain exact request/response records to correlate failures without adding denial writes.

Real local workerd one-row batch: 17 SQL statements / 10 round trips, 384 local rows read, **3 logical changes**, **10 rows written**, **13 units reserved**. Replay: two statements, one local row read, zero writes. Provider metadata and `meta.changes` are kept distinct. Earlier smoke-test counts were 37/383 reads; final-source measurements above supersede those development counts.

## G. Normal-CI security and failure results

`npm run test:identity-maintenance` is mandatory through `npm test` and therefore ordinary CI. **25 tests pass**, including all eighteen requested adversarial classes. Coverage includes Access/JWT and origin checks; signed reader/anonymous/Production refusal; default gates and approval separation; invalid/missing target; HMAC/nonce; canonical finite windows; oversized requests/cursors/pages; stale source/lead/state; conflicts; both precommit ceilings; rollback; concurrent selections; durable duplicate/reconciliation; protected fields; and no automatic importer activation.

Additional cases verify redacted inventories, unknown trigger/index refusal, missing-0080 refusal, postcommit accounting loss without redispatch, indexed query bounds and optional newsletter schemas. Denial helpers compare protected rows and table counts. The accepted importer still operates through its own authority and preserves zero-write identical replay; its synthetic package has 19 direct service changes without a transport nonce. This is distinct from the frozen real three-item signed-import measurement of 20 changes.

The complete application `npm run ci` passes: diff checks, Astro/Worker typecheck, all existing application tests (including 119 ingestion checks), 20 portable importer tests, the 25 mandatory N4 tests, migrations, security, evidence/markdown evaluations, production build, story/review renders and the portable importer render suite. Astro reports zero errors/warnings, with ten existing/advisory hints. The optional real workerd test also passes. Logs are under `D:\TRACE\local-acquisition\news-p4-n4\logs\ci-final.log` and `runtime-final-source.log`; earlier failed development runs remain retained, not presented as successful checks.

## H. Representative mixed 3,750-candidate simulation

Fixture: 3,750 eligible URL candidates plus twelve excluded lead-only records, total 3,762. It includes a malformed URL, an oversize URL and two owners of one consistent canonical hash. Test code submits 150 explicitly constructed batch requests; there is no production loop or scheduler.

Results: 3,748 hashes, two deferred issue records, twelve unchanged lead-only rows, **4,050 total logical changes** (3,750 identity updates + 150 nonces + 150 audits), maximum 56 atomic statements and 89 request statements. Every batch's fresh-nonce replay changes zero rows. Original source/hash/lead/state/history snapshots remain identical, foreign keys pass and integrity check returns `ok`.

This is a synthetic capacity/failure demonstration, not a claim about Preview's actual backlog or permission to perform 150 remote batches. The historical 3,900-change estimate excluded the new durable nonce write; it remains in the old proposal as historical evidence. N4 uses the explicit new 4,050 logical-change simulation result and separately accounts storage write units.

## I. Migration and operations compatibility

Migration 0080 remains byte-identical at SHA-256 **`3d6d09275d5188281a63a2f944f02b022d14685cabe1efaf253d969be7c9d9be`**. Migration 0072, both Wrangler configurations and the lockfile are unchanged. No new migration number or table is needed; existing audit event uniqueness and request nonces provide the receipt/transport contract.

The current local TRACE-OPS-01 checkout was read at `4250ab1fa01981d59378f60d83f8f6ea38283d0a`, with no changes made by N4. Its 0080 manifest now binds the same migration digest, all 26 triggers, the version-link table and bounded 51-row backlog postflight; approval remains null. The manifest's raw local file SHA-256 was `c023b45e6be37683dd9a46fbfbc5e8f37c5e82745d6528a2cfcf4e61615beaef`. This is a local compatibility observation, not remote PR status verification or authority to run its operations.

Production without 0080 refuses this endpoint; existing portable importer regressions preserve ordinary legacy behaviour. Optional newsletter 0078/0079 schemas also pass N4 maintenance locally. The actual target's trigger/index catalogue and query/account limits remain preflight requirements.

## J. Preview plan and proposed ordering

See `docs/runbooks/local-news-p4-n4.md` and the frozen plan `docs/audit/local-news-p4-n4-preview-plan.json`. Correct proposed sequence is **A0 → C → B → A1 → D → E → F**:

1. Separately approved provider/binding/schema verification, without querying a missing backlog index.
2. Separately approved compatible code deployment with all gates closed, before 0080.
3. Separately approved single migration under TRACE-OPS-01 recovery controls.
4. Separately approved bounded inventory, then freeze real selections and attestation.
5. Separately approved finite maintenance profile; every batch submitted manually.
6. Separately approved receipt/backlog and specific-package reconciliation.
7. A new combined-code three-item import instrument and separate finite approval.

Every phase has null approval. The runbook contains explicit Preview CLI command shapes and authenticated Pages request examples, not an executing launcher. It warns against bulk migrations, implicit Pages deployment through a push, secret disclosure, assumptions of file-level migration atomicity and automatic recovery/retry.

## K. Source changes and release identities

Code-bearing commit: `8176502210b05f0ab21e0d5fb101c5bfee165283` (one commit directly above the frozen release). Fifteen source/test/documentation paths changed:

- `.gitattributes`, `package.json`.
- `src/lib/server/identity-maintenance/{contract,index-certificate,meter,service,worker}.ts`.
- `src/lib/server/news-import/service.ts` (prepare/execute split; accepted classifier retained).
- `src/pages/api/admin/[...path].ts`, `workers/ingestion/index.ts`.
- `tests/identity-maintenance.test.ts`, `tests/identity-maintenance-runtime.test.ts`.
- `scripts/prepare-identity-n4.mjs`.
- `docs/adr/TRACE-N4-INVENTORY-CONTRACT.md`, `docs/runbooks/local-news-p4-n4.md`.

The documentation-only handoff adds this report and `docs/audit/local-news-p4-n4-preview-plan.json`, for seventeen paths total relative to the frozen base. The plan inventories **63 exact committed file hashes**, including every code-bearing changed file and the retained hosted/importer dependencies. Source identity is **`a28ac65ede01bafe44057283c3563a6bb94790937e11b3bfdb6247ffdfc76a8a`**. Frozen plan file SHA-256 is **`31e2b670264dd73b631cd74a82d8c5d25e200cf47e4171e669468dddcade1545`**. Two independent offline generations are byte-identical. Approval and execution window remain null.

The old `021a9577…` proposal and real package/source/bundle identities remain preserved. The new plan copies their exact evidence identities and original measurements without claiming another real import was run in N4. No historical acquisition directories are input/output dependencies of the portable N4 suite. All generated logs, runtime state and reports are beneath the N4 D: root or this D: worktree. D: free space was approximately 31.7 GB at final local validation; no large dataset or model was acquired.

## L. Remaining gates and recommended next approval

Recommended next step is independent N4 code/security/operations review of the exact code and plan identities. **Do not approve maintenance yet**: the actual Preview UUID/bindings, account limits, schema/index/trigger catalogue, deployed artifact attestation, publisher and bounded selection remain unverified remotely. The first remote decision should authorise a precisely bounded A0 inspection only after review, not combine all phases.

N1's released-proposal withdrawal policy is unchanged and remains a separate governance decision. A genuinely clean offline locked install is still unproven because the previously identified cached `sax-1.6.0.tgz` archive is missing; dependency versions were not changed or substituted. Validation reused the existing verified locked dependency tree on D: and kept N4 build/cache outputs separate.

No push, PR, merge, deployment, remote database query/write, account/credential retrieval, publisher feed request, actual maintenance/import, paid inference or scheduled operation occurred. Official public D1 documentation was consulted for atomic batch and accounting semantics; no Cloudflare account API was accessed. PR #20/#21, the frozen tooling and scheduler, historical evidence and both empty Cron configurations remain untouched.
