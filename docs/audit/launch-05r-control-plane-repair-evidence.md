# LAUNCH-05R Control-Plane Repair Evidence

Status: partially completed on 15 July 2026. The shared internal HMAC secret is configured on the production Pages project and ingestion Worker. Cloudflare Access is configured manually in the dashboard for both admin path scopes, and the Access team domain plus a two-audience allowlist are configured as encrypted Pages secrets. Pages role allowlists, a fresh Pages deployment/binding verification, and preview control-plane work remain blocked.

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
- The operator manually configured two narrow, path-specific self-hosted Access applications: one for `/admin*` and one for `/api/admin/*`. Both use the same narrow Allow policy. A safe unauthenticated live check confirmed that the `/admin` route is intercepted by Cloudflare Access before it reaches Pages.
- The two distinct Access audiences were recovered from the protected-route redirects without displaying their values. Their comma-separated allowlist was stored as the encrypted Pages `CF_ACCESS_AUD` secret. The associated Access team-domain host was stored as the encrypted Pages `CF_ACCESS_TEAM_DOMAIN` secret.
- Pages secret-name verification confirms `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`, and `TRACE_INTERNAL_SERVICE_SECRET` are present. Secret values are not retained in this record.
- The pre-existing `ADMIN_API_TOKEN` remains on both components. It has not been removed before Access and HMAC validation, as the repair run sheet requires.

## Safety correction during secret setup

The initial PowerShell random-generator call was incompatible with the local shell. The failure was detected immediately from command output, before any validation or request used the value, and the attempted value was immediately replaced on both components with a new value from the compatible cryptographic API. The final verified secret name is the only secret state recorded here; no value is retained in this record.

## Remaining blockers

1. The currently authenticated Cloudflare CLI credential does not include `Access: Apps and Policies` permission. Manual dashboard configuration was required and the CLI still cannot independently inspect those resources.
2. The Pages `TRACE_ADMIN_READERS` and `TRACE_ADMIN_PUBLISHERS` allowlists are not yet evidenced. They must each contain the approved operator in the Pages production environment, without recording the private address in this repository.
3. The Access applications currently permit all configured identity providers unless the operator restricts each application's Login methods to One-time PIN. That restriction and any chosen session duration need redacted evidence.
4. The checked Pages source configuration has a production D1 binding, but the dashboard/deployed binding and a preview binding are not yet evidenced. A fresh deployment is required for new Pages secrets or bindings to take effect.
5. No preview Pages/Worker control plane has been configured. Do not point preview traffic at the production D1 database.
6. Access role, signed proxy, replay, audit-row, and non-production mutation tests have not run; they belong to LAUNCH-06 after the remaining repair is complete.

## Required next authority and safe continuation

Complete the following in the Cloudflare dashboard and return only the redacted evidence packet from the repair run sheet:

- restrict each Access application's Login methods to One-time PIN and retain the narrow Allow policy with no broad bypass;
- configure the Pages reader and publisher allowlists with the approved operator;
- confirm production and preview Pages `DB` bindings, followed by a fresh deployment.

This record does not authorise public AI, production migration, legacy-secret removal, or administrative mutation tests.
