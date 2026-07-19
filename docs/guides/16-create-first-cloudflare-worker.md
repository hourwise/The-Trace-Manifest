---
title: "Create, test, and deliberately deploy a minimal Cloudflare Worker"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 11
tested_versions:
  node: "24.x LTS"
  wrangler: "4.x"
  create_cloudflare: "Current release"
estimated_cost: "Free-tier use available; usage limits and charges may apply"
destructive_steps: false
network_exposure: true
credentials_required: true
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Cloudflare Workers CLI guide"
    url: "https://developers.cloudflare.com/workers/get-started/guide/"
    relationship: instruction-source
  - name: "Wrangler Workers commands"
    url: "https://developers.cloudflare.com/workers/wrangler/commands/workers/"
    relationship: instruction-source
  - name: "Workers limits"
    url: "https://developers.cloudflare.com/workers/platform/limits/"
    relationship: requirements-source
  - name: "Wrangler authentication commands"
    url: "https://developers.cloudflare.com/workers/wrangler/commands/general/"
    relationship: security-source
---

# Create, test, and deliberately deploy a minimal Cloudflare Worker

**Status:** Draft — not published or indexed.

## What you will achieve

You will generate a TypeScript Worker, decline automatic deployment, test it on loopback, inspect the project configuration, authenticate with secure credential storage, and deploy only after an explicit final review.

## Who this is for

This guide is for developers with Node.js, Git, and a Cloudflare account.

It creates a publicly reachable `workers.dev` endpoint at the deployment step. It does not configure a custom domain, secrets, databases, scheduled jobs, or production CI.

## Requirements and expected cost

- Windows 11.
- Node.js 24 LTS.
- A Cloudflare account.
- Internet access.
- Cost: Workers has a free tier; review current limits and billing before deployment.

## Tested environment and version scope

The guide uses Cloudflare's current `create-cloudflare` wizard and project-local Wrangler 4.x.

## Before you begin

Confirm the intended Cloudflare account and review account-level billing controls.

Choose a unique Worker name that does not reveal private project or customer information.

The generated development server opens a loopback port. The deployed Worker is public unless access controls are added separately.

## Step-by-step instructions

### Step 1: Generate the project without deploying

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-worker-demo, installs dependencies, and may initialise Git
# Port exposure: None during creation
# Downloads code: Yes, create-cloudflare and project dependencies
# Variables to replace: Replace trace-worker-demo with a unique project name if desired
npm create cloudflare@latest -- trace-worker-demo
```

Choose:

- **Hello World example**.
- **Worker only**.
- **TypeScript**.
- Git: **Yes**.
- Deploy now: **No**.

Expected output: local project created.

### Step 2: Inspect configuration and scripts

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: trace-worker-demo
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: Update project folder if changed
Set-Location .\trace-worker-demo
npm pkg get scripts
Get-Content .\wrangler.jsonc
Get-Content .\src\index.ts
git status --short --branch
```

Expected result: local Wrangler dependency, Worker entry point, name, compatibility date, and expected source-control state.

### Step 3: Run project validation

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Tests and generated types may write caches or generated files
# Port exposure: None
# Downloads code: No additional package expected
# Variables to replace: None
npm test --if-present
npm run check --if-present
npm run cf-typegen --if-present
```

Expected result: available checks complete successfully.

### Step 4: Start local development

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Writes local Wrangler state under project or user cache
# Port exposure: Opens a loopback development server, normally localhost:8787
# Downloads code: May download Workers runtime components
# Variables to replace: None
npx wrangler dev --ip 127.0.0.1
```

Expected output: local Worker URL.

Visit the URL and confirm the Hello World response. Stop with `Ctrl+C`.

### Step 5: Test the local endpoint from another terminal

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Connects only to local loopback port 8787
# Downloads code: No
# Variables to replace: Change the port if Wrangler selected another one
Invoke-WebRequest "http://127.0.0.1:8787/" |
  Select-Object StatusCode, Content
```

Expected output: HTTP 200 and the Worker response.

### Step 6: Authenticate and verify the target account

If Wrangler is not already authenticated, use the secure keychain option:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Stores encrypted OAuth data and a key in Windows Credential Manager
# Port exposure: Temporary loopback OAuth callback; outbound HTTPS to Cloudflare
# Downloads code: May download keyring support
# Variables to replace: None
npx wrangler login --use-keyring
npx wrangler whoami
```

Expected output: the intended Cloudflare account and secure credential-storage status.

### Step 7: Review the deployment configuration

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-Content .\wrangler.jsonc
git diff
git status --short
```

Confirm:

- Worker name is correct.
- No secrets are in code or configuration.
- No unexpected routes or bindings exist.
- The compatibility date is intentional.
- Local tests passed.
- The Cloudflare account is correct.

### Step 8: Deploy deliberately

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates or updates a remote Cloudflare Worker deployment
# Port exposure: Publishes a public HTTPS workers.dev endpoint
# Downloads code: Uploads built project code to Cloudflare
# Variables to replace: None
npx wrangler deploy
```

Expected output: deployment URL and version information.

### Step 9: Verify the remote endpoint

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS to the public Worker
# Downloads code: No
# Variables to replace: Replace the URL with the exact deployment URL
Invoke-WebRequest "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/" |
  Select-Object StatusCode, Content
```

Expected output: HTTP 200 and the expected response.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `npx wrangler dev --ip 127.0.0.1` | Loopback Worker preview. | Opens local port only. |
| Local `Invoke-WebRequest` | HTTP 200. | Loopback request. |
| `npx wrangler whoami` | Intended account. | Authenticated read. |
| `npx wrangler deploy` | New remote version and public URL. | Creates public cloud deployment. |
| Remote `Invoke-WebRequest` | HTTP 200 and expected content. | Public HTTPS request. |

## Security checks

- Decline automatic deployment during scaffolding.
- Keep development bound to loopback.
- Never put API tokens or secrets in source code or `wrangler.jsonc`.
- Verify account, routes, bindings, and name before every first deployment.
- Use Cloudflare secrets for sensitive values.
- Add authentication before exposing private operations.
- Set budget alerts and review Workers limits.
- Use a separate deployment workflow and scoped token for CI.
- Keep preview and production resources distinct where practical.
- Log and test failure paths without exposing sensitive data.

## Common errors

### `wrangler whoami` shows the wrong account

Log out, authenticate again, and verify before deploying.

### Local development works but deployment fails

Review the compatibility date, account permissions, Worker name, build output, and unsupported local-only APIs.

### Public URL returns an unexpected response

Confirm the deployed version, route, and account. Use Wrangler deployment history before overwriting again.

## How to undo or remove it

Cloudflare's dashboard can delete the demonstration Worker under **Workers & Pages**.

Deleting a Worker removes the remote endpoint and is destructive. Confirm that the name belongs only to the demonstration.

Delete the local project separately after stopping local processes:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Parent of trace-worker-demo
# Admin: Not required
# Writes/deletes: Permanently deletes the local demonstration project only
# Port exposure: None
# Downloads code: No
# Variables to replace: Replace folder name if changed
Remove-Item -LiteralPath .\trace-worker-demo -Recurse -Force
```

## What to do next

Add request validation and tests, then connect a separate D1 development database through versioned migrations.

## Sources

- [Cloudflare Workers CLI guide](https://developers.cloudflare.com/workers/get-started/guide/) — Current C3 choices, local development, and deployment flow.
- [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/) — Current Worker lifecycle commands.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) — Runtime and account limits.
- [Wrangler authentication commands](https://developers.cloudflare.com/workers/wrangler/commands/general/) — OAuth login, keychain option, and identity verification.
