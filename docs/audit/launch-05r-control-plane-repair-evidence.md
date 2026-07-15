# LAUNCH-05R Control-Plane Repair Evidence

Status: partially completed on 15 July 2026. The shared internal HMAC secret is configured on the production Pages project and ingestion Worker. Cloudflare Access, its audience configuration, Pages deployment/binding verification, and preview control-plane work remain blocked.

Task: LAUNCH-05R - Repair the Access, D1 binding and Pages-to-Worker control plane only after explicit operator approval.

## Approved operator configuration

- One-time PIN email login is the intended Cloudflare Access identity method.
- One approved operator will hold both reader and publisher roles. The private allowlist value is intentionally not recorded in the repository.
- The checked Pages configuration now declares the HTTPS-only `TRACE_INGESTION_WORKER_URL`. Reader and publisher allowlists must be set only in the Cloudflare dashboard. All AI enablement flags remain `false`.

## Completed repair

- `TRACE_INTERNAL_SERVICE_SECRET` was generated with a cryptographically secure random generator in process memory and set through Wrangler standard input on both:
  - Pages project `the-trace-manifest`, production environment;
  - Worker `trace-manifest-ingestion`.
- Secret-name verification confirms the shared secret is present on both components. No value was printed, stored in this repository, or placed in a command argument.
- The pre-existing `ADMIN_API_TOKEN` remains on both components. It has not been removed before Access and HMAC validation, as the repair run sheet requires.

## Safety correction during secret setup

The initial PowerShell random-generator call was incompatible with the local shell. The failure was detected immediately from command output, before any validation or request used the value, and the attempted value was immediately replaced on both components with a new value from the compatible cryptographic API. The final verified secret name is the only secret state recorded here; no value is retained in this record.

## Remaining blockers

1. The currently authenticated Cloudflare CLI credential does not include `Access: Apps and Policies` permission. It cannot inspect or create the Access application, policy, team domain, or audience configuration.
2. No Access application, `CF_ACCESS_TEAM_DOMAIN`, or `CF_ACCESS_AUD` secret is evidenced. The admin surface must remain fail-closed until they exist.
3. The checked Pages source configuration has a production D1 binding, but the dashboard/deployed binding and a preview binding are not yet evidenced. A fresh deployment is required for a new Pages binding or source configuration to take effect.
4. No preview Pages/Worker control plane has been configured. Do not point preview traffic at the production D1 database.
5. Access role, signed proxy, replay, audit-row, and non-production mutation tests have not run; they belong to LAUNCH-06 after the remaining repair is complete.

## Required next authority and safe continuation

Create or provide a Cloudflare API token with `Access: Apps and Policies Write` for the account, or configure the following in the Zero Trust dashboard and return only the redacted evidence packet from the repair run sheet:

- a self-hosted Access application for `thetracemanifest.com` covering `/admin*` and `/api/admin/*`;
- one narrow One-time-PIN Allow policy for the approved operator, with no broad bypass;
- the Access team-domain host and application audience value, stored as `CF_ACCESS_TEAM_DOMAIN` and encrypted `CF_ACCESS_AUD` respectively;
- a confirmed production and preview Pages `DB` binding, followed by a fresh deployment.

This record does not authorise public AI, production migration, legacy-secret removal, or administrative mutation tests.
