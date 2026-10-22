# TRACE V1 — PRODUCTION-READINESS-07 report

Status: readiness assessment only. This document performs and authorizes no
merge, push, Production deployment, Production D1 mutation, migration, Cron
change, or scheduler activation. Observed 2026-10-22.

## 1. Disposition

| Track | Disposition |
| --- | --- |
| Editorial/web V1 | **Not ready.** Narrowest blocker: `PRODUCTION_SCHEMA_RECONCILIATION_REQUIRED` |
| Preview | `PREVIEW_CERTIFIED` on `2d70328` (reader-role QA pending, see §9) |
| Dependencies | Production exception accepted by the owner for the residual Astro 5 findings (§11); CI gate not yet encoded |
| Scheduler | `TRACE_V1_SCHEDULER_STOP_BURN_STILL_ACTIVE` |

`TRACE_V1_EDITORIAL_READY_FOR_PRODUCTION_PROMOTION` is **not** returned. The
blockers are listed in §14 in the order they must be cleared.

## 2. Candidate identities

| Role | Branch | Commit | Tree | Remote |
| --- | --- | --- | --- | --- |
| Protected `main` | `main` | `0351df7e64d1faf9456042c468e97efecf934d87` | — | yes |
| Certified integration | `codex/trace-v1-integration-04-editorial-frontend` | `236a2daeb705f8e4570165d674975a561313cdc6` | `62700abdaaf7c56b00e94ea3412ca96a5df2ffe4` | yes, unchanged |
| Preview defect remediation | `codex/trace-v1-remediation-05-preview-defects` | `950fb42595af6a02e904e8178b833577b0c3d179` → `658f68cace23bedc8aa8aa85ef4e62e078b06f3b` | `5cf4c4b4c050647f95f9a9bd4c8b2a333071ffaa` | not pushed |
| Dependency remediation (**recommended release candidate**) | `codex/trace-v1-deps-06-remediation` | `2d70328d2890ddcb795ff78e0e358371d2af5e58` | `701962fc46818f224eb72484168347979385cfd8` | not pushed |
| This report | `codex/trace-v1-production-readiness-07` | child of `2d70328` (docs only) | — | not pushed |
| Frozen scheduler | `codex/trace-v1-scheduler-lease-0072` | `a321156a2e085b5d9570e671bc2aa6d54f79d7ec` | `706c8e72008c578a8fe187891976696d8dda9de0` | local only, untouched |

Lineage: `0351df7` → 16 certified commits → `236a2da` → `950fb42` →
`658f68c` → `2d70328`. No history was rewritten, squashed, or force-pushed.
`main` is 0 commits ahead of the candidate chain. Scheduler 0072 is not an
ancestor of any candidate.

## 3. Preview state found at takeover

The earlier PREVIEW-06 attempt had stopped at `wrangler whoami` (`Invalid
access token`). At takeover the session was valid, and the actual state was
`PREVIEW_STATE_INCONSISTENT`:

- Cloudflare Pages is Git-integrated. The push of `236a2da` had already
  auto-built Pages Preview `eb75e133` on 2026-09-17.
- The Preview Worker was `6fcad8a2` (2026-08-31), which predates the candidate.
- Preview D1 `f312f662-2252-4005-8103-1a40d546e16b` was missing 22 canonical
  migrations, not 3: 0017, 0034–0040, 0043, 0044, 0048, 0049, 0062, 0064,
  0065, 0066, 0068, 0069, 0071, 0073, 0074, 0075. Each was wholly absent, none
  partial. They had been applied only locally by earlier KC missions.
- Preview Cron `[]`, Production Cron `[]`.

## 4. Remote actions performed (Preview only)

1. Preview D1 recovery points, captured before any mutation:
   - Time Travel bookmark `000000b0-00000000-0000510c-162a04fa2fc2a003082a2d7c98ae2eca`.
   - Logical backup `D:\Users\fleur\TraceManifestD1Backups\trace-manifest-db-preview-before-preview06-20261022-logical.json`
     (SHA-256 `fa8921bcd05fc32a05ff3278bd40fbf10514500e86bf4a8200356a10cdd61a34`,
     90 tables, 249 rows). `wrangler d1 export` refuses databases with FTS5
     tables, so this read-only logical backup was used instead.
2. The 22 migrations were rehearsed on the restored backup first. They then
   ran one at a time against Preview with `success: true` each. Final bookmark:
   `000000b0-00000095-0000510c-0eca30591bbc10b4e0732539aee081b0`.
3. Preview Worker deployments: `b6451bae` (236a2da) → `0b7776b2` (950fb42) →
   `ed9ecfcf` (658f68c) → **`09f02d71-4865-4859-aad9-391c2630e28b`** (2d70328).
4. Pages direct uploads to Preview branch `launch-05r-preview`, the only
   admin-POST-allowed Preview origin: `07b61177` → `423c601b` → `81c87a2f` →
   **`bc771b94`** (2d70328).
5. Governance and extraction fixtures (owner-authorized, Preview only): two
   manual single-source ingests (source 1, source 2), classify, cluster,
   and governed extraction runs. No Cron, no scheduler, and `cron_runs` is still 0.

No Production resource was mutated. Production was read only through catalog
queries (`sqlite_master`, `pragma_table_info`; about 360–460 rows read each)
and Cron and Pages metadata.

## 5. D1 migration state

| Environment | State |
| --- | --- |
| Preview | Exact DDL parity with the canonical chain: 0 differences over 392 objects, CHECK and FK constraints included. Pre-existing rows unchanged (249 → 249). FK check clean. M2 gate `ACTIVATION_ALLOWED`. **0070 not required.** No 0072 objects. |
| Production | Missing 0050–0068 (0069 present), 0071, 0073–0075. Has none of the source capture/hash fields. See §14.1. |

## 6. Worker deployment

`trace-manifest-ingestion-preview` runs `09f02d71` (tag `2d70328`), with
Preview-only bindings: D1 preview, R2 `trace-manifest-raw-preview`, preview
queues, preview Vectorize, AI. Wrangler 4.151.3 dry-run bindings are identical
to 4.110.0. Cron schedules `[]`.

## 7. Pages deployment

Preview branch `launch-05r-preview`: `bc771b94` (commit `2d70328`). Every
Preview host is gated by Cloudflare Access. Production canonical deployment is
unchanged at `247d3b3a` (`0351df7`).

## 8. Validation (each candidate, fresh `npm ci`)

`test:diff`, `test:migrations`, `test:security`, `test:evidence-policy`,
`test:knowledge-markdown`, `typecheck` (0 errors, 0 warnings, 5 pre-existing
hints), `npm test` (119 ingestion tests plus 20 downstream suites), and `build`
with Cloudflare route verification: **all pass** on `236a2da`, `950fb42`,
`658f68c` and `2d70328`. Browser bundle secret scan: clean.

## 9. Authenticated QA (publisher `philgeran@gmail.com`, Access)

| Area | Result |
| --- | --- |
| Public `/` | Ticker before hero; only the stylesheet requested (no ticker data call); reduced-motion rules present; no admin CSS matches public DOM; no mobile overflow — PASS |
| RSS | 200, valid XML on the upgraded `fast-xml-parser` — PASS |
| Review Queue | Shared shell; one initial list request; selection = cluster evidence + cluster sources only; no source fan-out; governance history lazy; no polling over 25s idle; bounds enforced (limit 999 → 400) — PASS |
| Reader role | **PENDING** — no identity in `TRACE_ADMIN_READERS` was available |

## 10. Governance and extraction QA

| Check | Result |
| --- | --- |
| Three separate axes (Admission / Editorial review / Freshness) | PASS |
| Admit and Accept through the UI | PASS; events `b3377312`, `bd184ac4`, `9e417c76`, plus two more on `658f68c`/`2d70328`; each event has a completed recalculation job |
| Exact replay → original event | PASS (both axes) |
| Same key, different body → `idempotency_conflict` | PASS |
| Stale expected state → `state_conflict` | PASS (both axes) |
| Disallowed transitions → `invalid_transition` | PASS (both axes) |
| Wrong cluster → `assertion_not_associated` | PASS |
| No revoke / restore / amend controls | PASS |
| Diagnostic preview writes nothing (all counts identical) | PASS |
| First post-0075 run returns a run ID (`c4f6df26…`) | PASS |
| Ledger: exact membership, order, outcomes, effects; "Ledger reconciled" | PASS (`5fbad02b…`, `11896b64…`) |
| No retry, reset, reprocess or resume controls | PASS |

Defects found during QA and fixed in the remediation candidate:

- **D1** — `canonical_claim_inserted` was recorded as `0` for new canonical
  claims. D1 counts trigger-written rows in `meta.changes`, and
  `canonical_claims` has an FTS insert trigger. Fixed in `950fb42` and
  certified on run `11896b64` (6 of 6 inserted).
- **D2** — a closed governance-history disclosure reopened with stale
  pre-decision history. Fixed in `950fb42`; certified (fresh refetch after a decision).
- **D3** — the assertion row collapsed when a governance form opened, hiding
  the reason form. Fixed in `658f68c`; certified (row open, field focused).

Open product decision:

- **D4** — the evidence and governance panel opens only from the publishable
  selector, which excludes `unverified`. The Pending Review list has no control
  that opens a cluster, so auto-flagged clusters cannot reach the admission or
  reviewer controls in the UI. QA reached them through a labelled harness
  option. Not a safety defect; it decides whether V1 governance is usable for
  flagged items.

## 11. Security QA

- Unsigned, invalid-signature, unknown-route and wrong-method Worker requests → 401.
- Admin POST accepted only from the configured Preview origin; the Pages proxy
  is the only path to the Worker.
- No browser-to-D1 or browser-to-Cloudflare-API requests.
- No secret, D1 identifier or HMAC material in the served browser assets (11
  scanned).
- `/_image` with a remote AVIF URL → 403.
- Reader mutation rejection: covered by unit tests; **live check pending** (§9).

## 12. Dependency remediation and accepted exception

`2d70328` applies a lockfile-only `npm audit fix` (no `--force`,
`package.json` unchanged) and sets the Cloudflare adapter
`imageService: "passthrough"`.

| | before | after |
| --- | --- | --- |
| npm audit (all / `--omit=dev`) | 19: 1C / 15H / 2M / 1L | 8: 1C / 4H / 2M / 1L |
| Deployed-runtime highs (`fast-xml-parser`, `devalue`) | present | fixed |
| Sharp references in server bundle | 4 | 0 |
| Sharp image-service entrypoint / image-endpoint chunks | 1 / 5 | 0 / 0 |

**Owner-accepted Production exception (2026-10-22).** The residual findings
are accepted on the reachability evidence below, until the Astro 7 / Workers
migration (§13) lands.

| Package | Advisory | Exploit requirement | TRACE on `2d70328` | Class |
| --- | --- | --- | --- | --- |
| astro 5.18.2 | GHSA-26w7-cxv4-gfx2 (critical, AVIF RCE) | default Sharp service processing untrusted AVIF | Sharp service removed from bundle; no `astro:assets`; remote `/_image` 403 | not reachable |
| astro | GHSA-2pvr-wf23-7pc7 (high) | prerendered error-page fetch | `output: "server"`, no prerendered pages | not reachable |
| astro | GHSA-8hv8-536x-4wqp (high) | attacker-controlled slot names | static, unnamed slots | not reachable |
| astro | GHSA-j687-52p2-xcff | attacker data in `define:vars` | only a server boolean (admin desk/social) | not reachable |
| astro | GHSA-jrpj-wcv7-9fh9, GHSA-f48w-9m4c-m7f5 | attacker-controlled attribute names | only `<KnowledgePage {...page}>` with keys fixed in code | not reachable |
| astro | GHSA-7pw4-f3q4-r2p2, GHSA-4g3v-8h47-v7g6 | `transition:*` directives | unused | not reachable |
| astro | GHSA-xr5h-phrj-8vxv | server islands | unused | not reachable |
| astro | GHSA-376h-93r7-7g6f | non-root `base` | no `base` | not reachable |
| @astrojs/cloudflare 12 | GHSA-88gm-j2wx-58h6 (CVSS 2.2) | `cloudflare-binding` image service + allow-listed remotes | passthrough, no remotes | not reachable |
| sharp, miniflare, undici, ws, wrangler 4.59.2 | various | local dev server | nested in the adapter's dev tooling; deploys use root wrangler 4.151.3 | dev tooling only |
| esbuild | GHSA-g7r4-m6w7-qqqr (low) | dev server | build only | build only |

Conditions of the exception:

- (a) `imageService` stays `"passthrough"`, and no `astro:assets`, server
  islands, transitions, `base`, remote image patterns, or `define:vars` with
  request data may be introduced.
- (b) Re-run the audit before each Production promotion; any new advisory
  voids the exception for that package.
- (c) The CI gate must encode the exception explicitly (§14.2).
- (d) It expires when §13 lands.

## 13. Scheduled later mission — Astro 7 / Cloudflare Workers migration

Not started. Brief:

- **Why:** GHSA-26w7 is fixed only in Astro ≥ 7.2.8, with no 5.x or 6.x
  backport. Astro 7 requires `@astrojs/cloudflare` ≥ 14, and adapter 13/14 are
  Workers-only (static assets plus `wrangler.json`), with no Pages
  `_worker.js` output. Astro 7 requires Node ≥ 22.23.4; CI uses Node 24.
- **Scope:** upgrade `astro` 7.4.x, `@astrojs/cloudflare` 14.x, root wrangler
  ≥ 4.125; migrate binding access from `Astro.locals.runtime` to the adapter-14
  API; move the site from Pages to a Workers deployment with equivalent
  Preview and Production environments, D1 bindings, vars and secrets
  (`CF_ACCESS_*`, `TRACE_ADMIN_*`, `TRACE_INTERNAL_SERVICE_SECRET`,
  `TRACE_VISITOR_HASH_SECRET`); recreate Access applications for the new
  hostnames; replace Pages Git integration (auto Preview/Production) with an
  explicit deploy procedure; keep `thetracemanifest.com` routing; remove the
  `imageService` exception.
- **Out of scope:** business logic, schema, scheduler 0072, Cron.
- **Gates:** full suite; identical Review Queue, governance and extraction
  certification; Access verified on every new host; `npm run audit:production`
  green without exceptions; Pages project retired only after Production cutover
  verification.

## 14. Remaining blockers (clear in this order)

1. **`PRODUCTION_SCHEMA_RECONCILIATION_REQUIRED`** (narrowest). A schema-only
   rehearsal on Production's exact DDL (read 2026-10-22) applies 0050–0068,
   0069 (no-op), 0071, 0073–0075 cleanly. However:
   - The M2 gate fails closed on Production: `sources.ingestion_type` has
     legacy default `'manual'` (`INCOMPATIBLE_SHAPE`). `corrections` fields are
     an accepted legacy shape.
   - 29 DDL differences remain after the chain: the LAUNCH-05R legacy shapes
     of `claims`, `claim_evidence`, `corrections`, `sources`, `ingestion_jobs`
     and `claim_conflicts`; several legacy-table indexes; and the
     `knowledge_page*` tables (used only by `trace-v1-m1.ts`).
   - The rehearsal had no rows. Table-rebuilding migrations (0061, 0062, 0064,
     0074) still need a data-level rehearsal on a Production export.
   - The choice between applying 0059/0063 and the 0070 compatibility recipe
     must be made explicitly. Applying both would fail on duplicate columns.
   - Backup note: Production has 0 virtual tables today, so
     `wrangler d1 export` works now but will stop working once 0050 creates
     `knowledge_search_fts`. Export before 0050 and record a Time Travel
     bookmark.
2. **`CI_AUDIT_EXCEPTION_NOT_ENCODED`** — `.github/workflows/ci.yml` runs
   `npm run audit:production` (`--audit-level=critical`), which fails on
   `2d70328` because Astro 5 is version-flagged critical. Every PR to `main`
   will fail until the accepted exception is encoded as an explicit,
   advisory-ID-scoped allowlist with an expiry. Changing a security gate needs
   owner approval of the exact mechanism.
3. **`PRODUCTION_CRON_CONFIG_HAZARD`** — `wrangler.worker.toml` declares five
   top-level crons. A plain Production `wrangler deploy` would re-enable them
   and end STOP-BURN. The Production Worker must be released with a procedure
   that leaves schedules untouched (for example `wrangler versions upload`
   followed by `wrangler versions deploy`, which do not deploy triggers — verify
   before use), or with a reviewed config change. Recheck schedules after
   deploying.
4. **`PRODUCTION_DEPLOY_ORDER_HAZARD`** — merging to `main` auto-deploys
   Production Pages. The order must be: Production D1 backup and schema →
   Production Worker (Cron-safe) → merge to `main` (Pages) → smoke and
   authenticated QA. Merging first would serve the new UI against the old
   schema.
5. **`READER_ROLE_QA_PENDING`** — live reader checks: can read the Review
   Queue, evidence, history and audit; sees no mutation controls; POST rejected.
6. **`GIT_PUBLICATION_PENDING`** — `950fb42`, `658f68c`, `2d70328` and this
   report are unpushed; no PR; CI has not run on any candidate.
7. **D4 product decision** (§10) — not a safety blocker.

Separately: `TRACE_V1_SCHEDULER_STOP_BURN_STILL_ACTIVE`. Editorial promotion
does not close the incident; 0072 activation remains its own mission
(0072 → scheduler Worker → two or more `*/30` observations → no overlap, no
stale accumulation, bounded D1 reads).

## 15. Evidence locations

- Session checkpoint log (operator-local, not in the repository).
- Preview backups and post-migration snapshot: `D:\Users\fleur\TraceManifestD1Backups\`
  (`…-before-preview06-20261022-logical.json`,
  `…-after-preview06-migrations-20261022-logical.json`, SHA-256
  `4aa0dbfe1f33f266db4dda4598be243189692f7382f48966e66681a9278937b4`).
- Commits `950fb42`, `658f68c`, `2d70328` carry the defect and dependency
  rationale in their messages.
