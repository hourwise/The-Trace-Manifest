# TRACE V1 — INTEGRATION-04 acceptance manifest

Status: local integration candidate; not pushed, merged, deployed, or applied
to a remote database.

## Lineage

- Protected historical baseline: `0351df7e64d1faf9456042c468e97efecf934d87`.
- Integrated base: EDITORIAL-03D
  `c25b53e742a18464fccdf44ff57a515e63319f97`.
- FRONTEND-01 was a separate sibling rooted at the protected baseline:
  `6d8c2ef8cff2d3d96329b9aa215886aae166a7ec`.
- FRONTEND-01 was incorporated with `git cherry-pick`. The resulting local
  commit is `c6c7141a55aca195b27c1c63933b24cb7103ec27`.
- The expected 02A–02I and 03A–03D commits were verified as ancestors of the
  EDITORIAL-03D base in their stated order. FRONTEND-01 was not an ancestor
  before the cherry-pick.

The cherry-pick had one content conflict in `src/styles/global.css`. The
resolution retained the complete shared admin-shell rules from 03D, closed the
admin responsive rule before the ticker block, and retained the complete
FRONTEND-01 TRACE NOW ticker, reduced-motion, and mobile rules. No accepted
behavior was discarded and no other file conflicted.

## Integrated feature inventory

The candidate contains the accepted public TRACE NOW ticker; shared admin
navigation; Review Queue scope, batching, bounded projection, and canonical
evidence work; admission and reviewer governance; governance history; the
governed deterministic Extract Claims workflow; the 03B characterization;
durable extraction-run ledger; and the 03D extraction-audit reconciliation UX.

FRONTEND-01 uses the existing `getPublishedStories` result once, keeps the
ticker before the home hero, remains deterministic, has mobile and
`prefers-reduced-motion` behavior, and adds no API or AI dependency. Its CSS is
scoped to `.trace-now*`; the admin rules remain scoped to `.admin-shell*`.

## Migrations

The relevant migration files present in this tree are:

- `migration-0070-trace-v1-evidence-activation-compatibility.sql`
- `migration-0071-trace-v1-bounded-activation.sql`
- `migration-0073-assertion-governance.sql`
- `migration-0074-assertion-reviewer-governance.sql`
- `migration-0075-claim-extraction-run-ledger.sql`

There is no `0072` in this editorial integration tree and no `0076`.
0073–0075 depend on the canonical/evidence tables established by the existing
editorial schema, and the local migration validator explicitly applies 0073,
0074, and 0075 successfully without scheduler tables, leases, or Cron state.
Therefore the schema decision is:

`EDITORIAL_MIGRATIONS_INDEPENDENT_OF_0072`

The frozen scheduler candidate remains separate at
`a321156a2e085b5d9570e671bc2aa6d54f79d7ec` (tree
`706c8e72008c578a8fe187891976696d8dda9de0`). Scheduled runtime activation and
any eventual remote migration/deployment ordering remain separate promotion
concerns; scheduler 0072 was not imported or changed here.

## Route and authority inventory

All `/api/admin/*` browser calls use the Astro catch-all proxy
`src/pages/api/admin/[...path].ts`. The proxy authenticates Cloudflare Access,
enforces the route/role allowlist, signs the request, and forwards it to the
Worker. The Worker validates timestamp, nonce, signature, operator, and role,
records admin audit outcomes, then dispatches the route. There is no
browser-to-D1 path.

| Browser route | Method | Semantics | Authority |
| --- | --- | --- | --- |
| `/api/admin/clusters` | GET | Review Queue list (`pending` or `publishable`) | reader/publisher |
| `/api/admin/cluster-sources` | GET | Selected-cluster source metadata | reader/publisher |
| `/api/admin/cluster-evidence` | GET | Selected-cluster editorial evidence | reader/publisher |
| `/api/admin/assertion-governance-history` | GET | Lazy assertion governance history | reader/publisher |
| `/api/admin/assertion-review` | POST | Admission governance | publisher |
| `/api/admin/assertion-reviewer-decision` | POST | Editorial reviewer governance | publisher |
| `/api/admin/extract-claims` | POST | Durable deterministic extraction | publisher |
| `/api/admin/extraction-runs` | GET | Bounded recent run list | reader/publisher |
| `/api/admin/extraction-run` | GET | Bounded run detail | reader/publisher |

The HTML workflows are `/admin/review`, `/admin/extract-claims`, and
`/admin/knowledge`; the shared `AdminLayout` navigation links them without
duplicate TRACE V1 workflow entries or dynamic API-route collisions. The
Worker read allowlist contains the GET routes above; its write allowlist
contains only the two publisher governance POST routes and the publisher-only
extraction POST route among this mission's mutations.

## Regression and performance certification

- Review Queue keeps separate pending/publishable scopes, deterministic
  ordering, the 200 publishable bound, narrowed publishable projection, one
  cluster-list request, and one source/evidence request after selection.
- Governance keeps admission, editorial review, and freshness as separate
  axes, with shared CAS revision, idempotency, durable events, and
  recalculation jobs.
- Extraction remains deterministic and rule-based, uses one common runner,
  keeps the 50-item bound, preserves the manual signed Worker path and the
  scheduler caller, and does not auto-run from Review Queue.
- Governance history and extraction audit remain lazy. The extraction page
  loads the bounded recent list only when opened, loads one detail per expanded
  run, caches opened details in the page session, and does not poll or fan out.
- The public home build retains the ticker before the hero and the hero/card
  path remains intact.

## Validation record

- `npx.cmd tsx tests/trace-now-ticker.test.ts` — pass.
- `npm.cmd test` — pass; `119` passed, `0` failed.
- `npm.cmd run test:migrations` — pass; schema and legacy compatibility
  validators passed locally.
- `npm.cmd run typecheck` — pass; 0 errors, 0 warnings, 5 existing hints.
- `npm.cmd run build` — pass; Cloudflare API routing and TRACE gateway
  boundary verifier passed.
- `npm.cmd run test:diff` — pass.
- `git diff --check` — pass before certification commit.
- `npm.cmd audit --omit=dev --audit-level=critical` — existing audit report;
  15 vulnerabilities (1 low, 2 moderate, 11 high, 1 critical). No package
  manifest or lockfile change belongs to this integration.

Authenticated browser QA was unavailable naturally, so static, route, build,
and deterministic test certification is recorded as
`AUTHENTICATED_BROWSER_QA_UNAVAILABLE`. No authentication boundary was
weakened.

## Activation and scope boundary

This is a local candidate only. It has not accessed or mutated Preview or
Production D1, applied a migration remotely, changed Cloudflare configuration,
changed Cron or scheduler leases, deployed, pushed, merged, or tagged.

Deferred by design: extraction retry/recovery and stage reset; assertion
amendment/successor work; evidence revocation or reviewer restoration;
attachment/freshness governance; new extraction rules or AI behavior; and any
remote promotion or scheduler activation.

