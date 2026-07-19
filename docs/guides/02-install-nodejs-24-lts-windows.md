---
title: "Install Node.js 24 LTS on Windows and verify npm"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  node: "24.18.0 LTS"
  npm: "11.16.x"
  winget: "1.x"
estimated_cost: "Free"
destructive_steps: false
network_exposure: false
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Node.js 24 release archive"
    url: "https://nodejs.org/en/download/archive/v24"
    relationship: version-source
  - name: "Node.js 24.18.0 release"
    url: "https://nodejs.org/en/blog/release/v24.18.0"
    relationship: instruction-source
  - name: "Microsoft WinGet install command"
    url: "https://learn.microsoft.com/en-us/windows/package-manager/winget/install"
    relationship: instruction-source
  - name: "npm audit documentation"
    url: "https://docs.npmjs.com/cli/audit/"
    relationship: security-source
---

# Install Node.js 24 LTS on Windows and verify npm

**Status:** Draft — not published or indexed.

## What you will achieve

You will install the Node.js 24 long-term-support release on Windows, confirm that Node and npm resolve from the expected location, and check the npm registry configuration before using third-party packages.

## Who this is for

This guide is for beginners setting up JavaScript, TypeScript, Astro, React, Cloudflare Workers, or agent-tooling projects on Windows.

It installs one system Node version. Developers who regularly switch between incompatible Node versions may prefer a version manager, which should be covered by a separate guide.

## Requirements and expected cost

- Windows 10 22H2 or Windows 11.
- WinGet.
- Internet access.
- About 200 MB of free space for Node and npm, plus space for future project dependencies.
- Cost: free.

## Tested environment and version scope

Node.js 24.18.0 was the current Node 24 LTS maintenance release reviewed for this guide. Node 24 ships with npm 11.x. The exact npm patch version may differ after an update.

## Before you begin

Check whether Node is already installed. Replacing an existing installation can affect global npm packages and projects that depend on another major version.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
node --version
npm --version
where.exe node
```

If these commands work, record the output before installing another version.

## Step-by-step instructions

### Step 1: Inspect the Node.js LTS package

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May refresh local WinGet metadata; no Node installation
# Network/ports: Outbound HTTPS to WinGet; no listening port opened
# Downloads code: Package metadata only
# Replace: Nothing
winget show --id OpenJS.NodeJS.LTS --exact --source winget
```

Expected output: package details for **Node.js (LTS)**. Confirm that the publisher and installer URL point to the Node.js distribution.

### Step 2: Install the reviewed Node 24 release

Pinning the version makes this dated guide reproducible. A later guide review may update the patch release.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Windows may request elevation for the MSI installer
# Writes/deletes: Installs Node.js, npm, and PATH entries
# Network/ports: Outbound HTTPS for the installer; no listening port opened
# Downloads code: Yes, an executable MSI package
# Replace: Nothing
winget install --id OpenJS.NodeJS.LTS --exact --version 24.18.0 --source winget
```

Expected output: installation succeeded.

Close PowerShell and open a new window before continuing.

### Step 3: Verify Node, npm, and executable paths

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
node --version
npm --version
where.exe node
where.exe npm
```

Expected output:

- `v24.18.0` for Node.
- npm 11.x.
- Paths under the expected Node.js installation, normally `C:\Program Files\nodejs\`.

Multiple unrelated Node paths can cause inconsistent builds. Resolve duplicate installations before relying on this setup.

### Step 4: Confirm the npm registry

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None for this local configuration read
# Downloads code: No
# Replace: Nothing
npm config get registry
```

Expected output: `https://registry.npmjs.org/` unless your organisation intentionally uses an approved private registry.

An unfamiliar registry can serve modified packages. Confirm organisation-specific registries with your administrator.

### Step 5: Run a local JavaScript check

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
node -e "console.log(process.version); console.log('Node is working')"
```

Expected output: the Node version followed by `Node is working`.

Do not install random global npm packages as a verification step. Global packages add executable code to your user environment.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `node --version` | `v24.18.0` or the approved Node 24 patch. | Windows; PowerShell; inspection only. |
| `npm --version` | npm 11.x. | Windows; PowerShell; inspection only. |
| `where.exe node` | Expected Node installation path. | Windows; PowerShell; inspection only. |
| `npm config get registry` | Approved npm registry URL. | Windows; PowerShell; reads configuration only. |

## Security checks

- Prefer projects with committed lockfiles.
- Inspect `package.json`, `.npmrc`, and install scripts before installing dependencies from an unfamiliar repository.
- `npm install` and `npm ci` can execute dependency lifecycle scripts unless scripts are disabled or restricted.
- Run `npm audit` inside a project to identify known dependency vulnerabilities. Do not automatically use `npm audit fix --force`; it can introduce breaking dependency changes.
- Avoid running package commands from an elevated terminal.
- Do not store npm access tokens in a committed `.npmrc`.

## Common errors

### `No package found matching input criteria`

Refresh WinGet sources and inspect the package again:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Refreshes local WinGet source metadata
# Network/ports: Outbound HTTPS; no listening port opened
# Downloads code: Metadata only
# Replace: Nothing
winget source update
winget show --id OpenJS.NodeJS.LTS --exact --source winget
```

### `node` still shows an older version

Close all terminals, reopen PowerShell, and run `where.exe node`. Remove or reorder obsolete Node installations rather than copying executables between folders.

### PowerShell blocks `npm.ps1`

Do not weaken the machine-wide execution policy as a first response. Try `npm.cmd --version`, use Command Prompt, or review your organisation's PowerShell policy.

## How to undo or remove it

Before uninstalling, record any global packages you still need:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
npm list --global --depth=0
```

Then uninstall through Windows Settings or WinGet:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Windows may request elevation
# Writes/deletes: Uninstalls Node.js and npm; global packages may become unavailable
# Network/ports: May contact WinGet metadata services
# Downloads code: No
# Replace: Nothing
winget uninstall --id OpenJS.NodeJS.LTS --exact
```

Project source files remain, but each project's `node_modules` directory is independent and may remain on disk.

## What to do next

Install Git and VS Code, then follow the safe-cloning guide before running an unfamiliar Node project.

## Sources

- [Node.js 24 release archive](https://nodejs.org/en/download/archive/v24) — Node 24 LTS status and release line.
- [Node.js 24.18.0 release](https://nodejs.org/en/blog/release/v24.18.0) — Reviewed Windows installer and bundled npm version.
- [Microsoft WinGet install command](https://learn.microsoft.com/en-us/windows/package-manager/winget/install) — Exact package and version installation syntax.
- [npm audit documentation](https://docs.npmjs.com/cli/audit/) — Dependency audit behaviour and cautions.
