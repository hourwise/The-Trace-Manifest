---
title: "Install Cloudflare Wrangler locally and store login credentials securely"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 11
tested_versions:
  node: "24.18.0 LTS"
  wrangler: "4.x"
estimated_cost: "Free to install; Cloudflare plan limits may apply"
destructive_steps: false
network_exposure: true
credentials_required: true
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Install and update Wrangler"
    url: "https://developers.cloudflare.com/workers/wrangler/install-and-update/"
    relationship: instruction-source
  - name: "Wrangler general commands"
    url: "https://developers.cloudflare.com/workers/wrangler/commands/general/"
    relationship: instruction-source
  - name: "Wrangler commands"
    url: "https://developers.cloudflare.com/workers/wrangler/commands/"
    relationship: instruction-source
  - name: "Cloudflare Workers changelog — keychain credentials"
    url: "https://developers.cloudflare.com/changelog/product/workers/"
    relationship: security-source
---

# Install Cloudflare Wrangler locally and store login credentials securely

**Status:** Draft — not published or indexed.

## What you will achieve

You will install Wrangler as a project dependency, authenticate through Cloudflare OAuth, store the credential encryption key in Windows Credential Manager, and verify the account without deploying anything.

## Who this is for

This guide is for developers working with Cloudflare Workers, Pages, D1, KV, R2, Queues, or other supported developer-platform services.

It assumes an existing Node project. It does not create or deploy a Worker.

## Requirements and expected cost

- Windows 11. Cloudflare's current Wrangler documentation lists Windows 11 as the supported Windows platform.
- Node.js 24 LTS and npm.
- A Cloudflare account.
- A project directory containing `package.json`.
- Internet access.
- Cost: Wrangler is free; deployed resources are subject to Cloudflare plan limits.

## Tested environment and version scope

The guide targets current Wrangler 4.x. Cloudflare recommends local, per-project installation so teams can control versions and roll back.

## Before you begin

Commit or back up `package.json` and the lockfile. Review which Cloudflare account you intend to authorise.

The OAuth login normally opens a temporary loopback callback listener on `localhost:8976`. This is not a public application endpoint, but local security software may prompt about it.

Cloudflare documents that plaintext credential storage remains the default unless `--use-keyring` is selected. This guide explicitly opts into the encrypted/keychain path.

## Step-by-step instructions

### Step 1: Confirm the project and runtime

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root containing package.json
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
node --version
npm --version
Test-Path .\package.json
git status --short --branch
```

Expected output: Node 24.x, npm 11.x, `True` for `package.json`, and the expected Git branch.

### Step 2: Install Wrangler locally

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Adds Wrangler to node_modules, package.json devDependencies, and the lockfile
# Network/ports: Outbound HTTPS to npm registry; no listening port opened
# Downloads code: Yes, npm packages and executable tooling
# Replace: Nothing
npm install --save-dev wrangler@latest
```

Expected output: Wrangler added as a development dependency.

Review the resulting `package.json` and lockfile changes before committing.

### Step 3: Verify the project-local version

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: May write npm cache data; project files unchanged
# Network/ports: Normally none when the local package is installed
# Downloads code: No additional package expected
# Replace: Nothing
npx wrangler --version
```

Expected output: a Wrangler 4.x version.

If Wrangler was not installed locally, `npx wrangler` may fetch the latest package dynamically. Confirm `npm ls wrangler` before accepting that behaviour.

### Step 4: Authenticate using the Windows keychain option

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Stores encrypted OAuth data in Wrangler config and an encryption key in Windows Credential Manager
# Network/ports: Outbound HTTPS to Cloudflare; temporary loopback callback on localhost:8976
# Downloads code: May download the Windows keyring binding on first use
# Replace: Nothing
npx wrangler login --use-keyring
```

Expected result: a browser opens to Cloudflare. Review the account and scopes, authorise the login, then return to the terminal.

Do not paste a global API key into source files as an alternative.

### Step 5: Verify the authenticated identity and credential storage

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Network/ports: Outbound HTTPS to Cloudflare; no listening port expected
# Downloads code: No
# Replace: Nothing
npx wrangler whoami
```

Expected output:

- the authenticated account or user;
- OAuth authentication;
- a message indicating encrypted credential storage with the key in Windows Credential Manager.

Stop if the displayed account is not the intended one.

### Step 6: Inspect changes before committing

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git status --short
git diff -- package.json package-lock.json
```

Expected result: only the intended Wrangler dependency and lockfile changes. Wrangler's user credentials must not appear in the repository.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `npm ls wrangler` | Shows one project-local Wrangler version. | Inspection only. |
| `npx wrangler --version` | Wrangler 4.x. | Executes local CLI. |
| `npx wrangler whoami` | Intended Cloudflare identity and encrypted/keychain storage. | Outbound authenticated read. |
| `git status --short` | Only intentional dependency changes. | Inspection only. |

## Security checks

- Prefer project-local Wrangler rather than a mutable global install.
- Use `--use-keyring` for interactive OAuth credentials.
- Use narrowly scoped API tokens for CI rather than copying interactive credentials.
- Never commit `CLOUDFLARE_API_TOKEN`, account keys, or Wrangler credential files.
- Review the target account before any deployment.
- Do not run `npx wrangler deploy` from an unfamiliar project without inspecting configuration, build scripts, bindings, routes, and generated changes.
- Use separate Cloudflare accounts or scoped tokens for development and production where practical.
- Treat `wrangler dev` as code execution; it may open a local port and access configured bindings.

## Common errors

### Browser login succeeds but the terminal hangs

The callback to `localhost:8976` may be blocked by a firewall, browser isolation, container, or remote-session boundary. Keep the command open and follow Cloudflare's remote-machine callback instructions.

### `wrangler` is not found

Use `npx wrangler`, not a bare global command, and verify `npm ls wrangler`.

### `whoami` shows plaintext credential storage

Log out and repeat login with `--use-keyring`. Confirm the current Wrangler version supports the option and that Windows Credential Manager is available.

### Node version is unsupported

Use a Node release classified by Cloudflare as Current, Active, or Maintenance, and use Windows 11 for current supported Wrangler operation.

## How to undo or remove it

Log out first:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Removes Wrangler's stored OAuth session for the current profile
# Network/ports: May contact Cloudflare to revoke or end the session
# Downloads code: No
# Replace: Nothing
npx wrangler logout
```

Then remove the project dependency:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Removes Wrangler from node_modules and updates package.json and lockfile
# Network/ports: npm may contact the configured registry
# Downloads code: No
# Replace: Nothing
npm uninstall --save-dev wrangler
```

Review the Git diff before committing the rollback.

## What to do next

Create a separate guide-driven Worker project or add a reviewed `wrangler.jsonc`, then use `wrangler dev` locally before considering deployment.

## Sources

- [Install and update Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — Supported platforms, Node support, and local installation.
- [Wrangler general commands](https://developers.cloudflare.com/workers/wrangler/commands/general/) — OAuth login, callback port, keychain option, `whoami`, and credential storage.
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/) — Project-local command execution.
- [Cloudflare Workers changelog](https://developers.cloudflare.com/changelog/product/workers/) — Windows Credential Manager support and encrypted credential storage.
