# Cloudflare Control-Plane Repair Run Sheet

Use this run sheet after `docs/audit/launch-05-cloudflare-configuration-audit.md` when repairing the launch-blocking Cloudflare configuration findings.

Scope: Cloudflare dashboard configuration only. Do not paste secret values, Access JWTs, API tokens, deploy-hook URLs, or private allowlist contents into chat or committed files.

## Current blockers being repaired

- Zero Trust / Access is not set up for the admin routes.
- Pages does not evidence the required Access/admin proxy variables and secrets.
- Worker does not evidence `TRACE_INTERNAL_SERVICE_SECRET`.
- Pages and Worker still show the retired `ADMIN_API_TOKEN` secret name.
- Pages `DB` binding was not found in shared dashboard evidence.

## Safe order of work

1. Configure non-secret Pages bindings and plaintext variables.
2. Generate one local HMAC secret and set it as `TRACE_INTERNAL_SERVICE_SECRET` on both Pages and Worker.
3. Create the Cloudflare Access application and copy its non-secret team-domain plus encrypted AUD configuration into Pages.
4. Verify anonymous access is blocked and an allowed operator can reach admin routes.
5. Only after the current path is working, remove legacy `ADMIN_API_TOKEN` from Pages and Worker.

Do not remove `ADMIN_API_TOKEN` first unless you have separately confirmed there is no older deployed code path still depending on it.

## 1. Pages production binding

Cloudflare dashboard path:

```text
Workers & Pages -> the-trace-manifest -> Settings -> Bindings
```

Production binding to add or confirm:

```text
Type: D1 database
Variable name: DB
Database: trace-manifest-db
Database ID: 1625036a-ffe2-4103-bf9d-086bae150561
```

When Pages configuration is managed by `wrangler.toml`, bindings are non-inheritable. Define the production binding under `[[env.production.d1_databases]]`; keep the top-level `[[d1_databases]]` binding pointed at the preview database for preview deployments. Do not try to override these bindings in the dashboard.

Preview/staging binding to add or confirm, if using preview functions:

```text
Type: D1 database
Variable name: DB
Database: trace-manifest-db-preview
Database ID: f312f662-2252-4005-8103-1a40d546e16b
```

Never point preview deployments at the production database unless a later task explicitly approves that risk.

Cloudflare notes that Pages Functions bindings can be configured in the dashboard or Wrangler config, and that a redeploy is required for a new binding to take effect.

## 2. Pages production variables and secrets

Cloudflare dashboard path:

```text
Workers & Pages -> the-trace-manifest -> Settings -> Variables and secrets
```

Keep these existing plaintext values:

```text
TRACE_ENVIRONMENT=production
TRACE_ALLOWED_ORIGINS=https://thetracemanifest.com
TRACE_AI_PUBLIC_ENABLED=false
TRACE_AI_EDITORIAL_ENABLED=false
TRACE_AI_SCHEDULED_ENABLED=false
TRACE_AI_GLOBAL_KILL_SWITCH=false
```

Add or confirm these plaintext values:

```text
TRACE_INGESTION_WORKER_URL=https://trace-manifest-ingestion.philgeran.workers.dev
TRACE_ADMIN_READERS=<comma-separated lower-case operator email allowlist>
TRACE_ADMIN_PUBLISHERS=<comma-separated lower-case publisher email allowlist>
CF_ACCESS_TEAM_DOMAIN=<your-team-name>.cloudflareaccess.com
```

`TRACE_INGESTION_WORKER_URL` must be an HTTPS origin only. The code accepts the origin form with an implicit `/` path, for example:

```text
https://trace-manifest-ingestion.philgeran.workers.dev
```

Do not include a path, query string, username, password, or trailing route like `/admin`.

Add or confirm these secrets:

```text
TRACE_INTERNAL_SERVICE_SECRET=<same locally generated value used on the Worker>
CF_ACCESS_AUD=<comma-separated Cloudflare Access Application Audience AUD tags>
```

Optional / conditional secrets:

```text
TRACE_VISITOR_HASH_SECRET=<required before public Ask TRACE is enabled>
DEEPSEEK_API_KEY=<already present; required only before any AI path is enabled>
```

Cloudflare Pages secrets should be encrypted in the dashboard. The secret values are not visible after creation and must not be committed.

## 3. Generate the internal HMAC secret locally

Run this in a local PowerShell window that you control. It copies the generated value to your clipboard and prints no secret value.

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$secret = [Convert]::ToBase64String($bytes)
Set-Clipboard -Value $secret
Write-Host "TRACE_INTERNAL_SERVICE_SECRET copied to clipboard. Paste it into Cloudflare Pages and Worker secrets. Do not paste it into chat or commit it."
```

Paste the same clipboard value into:

```text
Pages secret: TRACE_INTERNAL_SERVICE_SECRET
Worker secret: TRACE_INTERNAL_SERVICE_SECRET
```

After both are saved, clear the clipboard:

```powershell
Set-Clipboard -Value ""
```

## 4. Worker production secret

Cloudflare dashboard path:

```text
Workers & Pages -> trace-manifest-ingestion -> Settings -> Variables and Secrets
```

Add or confirm:

```text
Type: Secret
Name: TRACE_INTERNAL_SERVICE_SECRET
Value: same generated value used on Pages
```

Cloudflare Worker secret changes create/deploy a new Worker version when applied. Confirm the Worker still shows:

```text
D1 binding: DB -> trace-manifest-db
R2 binding: RAW_STORE -> trace-manifest-raw
```

## 5. Cloudflare Access application

Cloudflare dashboard path:

```text
Zero Trust -> Access controls -> Applications -> Add an application -> Self-hosted
```

Create Access coverage for the production admin surface:

```text
Suggested name: The Trace Manifest Admin
Domain: thetracemanifest.com
Path coverage: /admin* and /api/admin/*
Session duration: choose a short operator-friendly duration, then record it in the audit.
Identity provider: use the account's intended IdP.
Policies: at least one Allow policy for intended operators; no broad public bypass.
```

Cloudflare Access applications are deny-by-default: a user must match an Allow policy before access is granted.

Prefer one self-hosted application with both destinations. If the dashboard configuration only exposes one destination per application, create two path-specific applications with the same narrow Allow policy. Both forms are supported by the Pages verifier.

After saving the application or applications:

1. Go to the Access application configuration.
2. Copy each Application Audience (AUD) tag from Additional settings.
3. Store one or both values as the encrypted Pages secret `CF_ACCESS_AUD`, comma-separated with no other values.
4. Store the team domain host as the plaintext Pages variable `CF_ACCESS_TEAM_DOMAIN`.

The code expects the team domain host only, for example:

```text
<your-team-name>.cloudflareaccess.com
```

No scheme, no path.

## 6. Legacy secret cleanup

Do not remove the legacy `ADMIN_API_TOKEN` secret until the Access + HMAC setup has been saved and smoke-tested.

After verification, remove `ADMIN_API_TOKEN` from:

```text
Pages -> Variables and secrets
Worker -> Variables and Secrets
```

Reason: current source code does not reference `ADMIN_API_TOKEN`, and `scripts/security-check.mjs` treats that name as a retired authentication or quota-bypass contract.

## 7. Redeploy and verification stop

After dashboard changes, trigger or wait for a fresh deployment so Pages bindings and secrets are available to the running Functions.

Minimum verification before moving to LAUNCH-06:

```text
Anonymous /admin request: blocked by Cloudflare Access
Anonymous /api/admin/* request: blocked by Cloudflare Access or application fail-closed
Allowed reader operator: can reach read-only admin routes
Reader mutation attempt: 403
Allowed publisher operator: can perform a controlled non-production mutation during LAUNCH-06 only
Worker /admin/* without valid internal signature: 401
Replay of one signed request: rejected
admin_audit_log records allowed/denied/outcome events
```

Stop before testing mutating admin routes against production data unless a later task gives explicit approval.

## 8. Evidence to paste back

Paste only this safe summary back into the audit:

```text
Pages DB binding present, yes/no:
Pages DB binding target:
TRACE_INGESTION_WORKER_URL present, yes/no:
TRACE_INTERNAL_SERVICE_SECRET present on Pages, yes/no:
TRACE_INTERNAL_SERVICE_SECRET present on Worker, yes/no:
CF_ACCESS_TEAM_DOMAIN present, yes/no:
CF_ACCESS_AUD present as secret, yes/no:
TRACE_ADMIN_READERS present, yes/no:
TRACE_ADMIN_READERS count:
TRACE_ADMIN_PUBLISHERS present, yes/no:
TRACE_ADMIN_PUBLISHERS count:
Access application name:
Access domain/path coverage:
Access policy count:
Identity provider type:
ADMIN_API_TOKEN removed from Pages, yes/no:
ADMIN_API_TOKEN removed from Worker, yes/no:
Fresh Pages deployment after config change, yes/no:
Fresh Worker deployment/version after config change, yes/no:
```

Do not paste the values of `TRACE_INTERNAL_SERVICE_SECRET`, `CF_ACCESS_AUD`, `DEEPSEEK_API_KEY`, `TRACE_VISITOR_HASH_SECRET`, deploy hooks, API tokens, JWTs, or private full email lists.
