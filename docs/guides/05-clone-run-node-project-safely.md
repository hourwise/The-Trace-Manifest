---
title: "Clone and run an unfamiliar Node.js project more safely"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  node: "24.18.0 LTS"
  npm: "11.16.x"
  git: "2.55.0"
estimated_cost: "Free, excluding any services the project uses"
destructive_steps: true
network_exposure: true
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "npm ci"
    url: "https://docs.npmjs.com/cli/commands/npm-ci/"
    relationship: instruction-source
  - name: "npm install"
    url: "https://docs.npmjs.com/cli/install/"
    relationship: security-source
  - name: "npm audit"
    url: "https://docs.npmjs.com/cli/audit/"
    relationship: security-source
  - name: "VS Code Workspace Trust"
    url: "https://code.visualstudio.com/docs/editing/workspaces/workspace-trust"
    relationship: security-source
  - name: "GitHub removing sensitive data"
    url: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository"
    relationship: security-source
---

# Clone and run an unfamiliar Node.js project more safely

**Status:** Draft — not published or indexed.

## What you will achieve

You will clone a Node.js repository without automatically initialising submodules, inspect its executable configuration, install dependencies in a reduced-risk first pass, and run its checks before starting a development server.

## Who this is for

This guide is for developers evaluating a repository from GitHub or another Git host.

It does not prove that a repository or dependency is safe. It reduces avoidable execution and credential risks during the first inspection.

## Requirements and expected cost

- Git for Windows.
- Node.js 24 LTS and npm 11.
- VS Code with Workspace Trust enabled.
- Enough disk space for the repository and dependencies.
- Internet access.
- Cost: normally free, but the project may integrate paid APIs or services.

## Tested environment and version scope

The guide was reviewed against Git 2.55.0, Node 24.18.0, npm 11.x, and current npm lifecycle-script controls.

## Before you begin

Use a non-administrator terminal. Do not clone into a folder containing secrets or unrelated projects. Do not provide API keys until you understand how the project uses them.

A clone can contain malicious instructions and configuration even though Git itself does not normally execute repository code during a standard clone. Risk increases when you trust the workspace, install dependencies, initialise submodules, run scripts, or open a development server.

## Step-by-step instructions

### Step 1: Create a dedicated parent folder

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Your user profile
# Admin: Not required
# Writes/deletes: Creates a projects-review folder if absent
# Network/ports: None
# Downloads code: No
# Replace: You may replace projects-review with another dedicated folder
New-Item -ItemType Directory -Path "$HOME\projects-review" -Force
Set-Location "$HOME\projects-review"
```

Expected output: PowerShell moves into the dedicated folder.

### Step 2: Clone without recursively initialising submodules

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: $HOME\projects-review
# Admin: Not required
# Writes/deletes: Creates PROJECT-NAME and Git metadata
# Network/ports: Outbound HTTPS or SSH to the Git host; no listening port opened
# Downloads code: Yes, repository content
# Replace: Replace REPOSITORY_URL and PROJECT-NAME
git clone --no-recurse-submodules "REPOSITORY_URL" "PROJECT-NAME"
Set-Location "PROJECT-NAME"
```

Expected output: Git reports the clone completed.

Confirm the URL independently rather than trusting a shortened or redirected link.

### Step 3: Inspect the repository before opening it as trusted

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git status --short --branch
git remote -v
git submodule status
Get-ChildItem -Force
```

Expected result: clean branch status, the intended remote, and no silently initialised submodules.

Open VS Code and keep the repository in Restricted Mode:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: VS Code may create user-state files outside the repository
# Network/ports: No project port opened by this command
# Downloads code: No
# Replace: Nothing
code .
```

Review at least:

- `README.md`;
- `package.json`;
- `package-lock.json`, `npm-shrinkwrap.json`, or other lockfile;
- `.npmrc`;
- `.env*` files;
- `.vscode/tasks.json` and `.vscode/launch.json`;
- install, prepare, preinstall, postinstall, test, build, and dev scripts;
- scripts that invoke PowerShell, shell, curl, `Invoke-WebRequest`, Docker, cloud CLIs, or deployment tools.

### Step 4: Inspect npm scripts from the terminal

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
npm pkg get scripts
npm config get registry
```

Expected output: the project's script definitions and the configured npm registry.

Stop if scripts are heavily obfuscated, download and execute remote code unexpectedly, access unrelated directories, or require unexplained secrets.

### Step 5: Perform a first dependency install without lifecycle scripts

`npm ci` requires a matching lockfile. It removes an existing `node_modules` directory before installing, so this step is marked destructive.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Deletes existing node_modules, then writes a fresh dependency tree; lockfile remains unchanged
# Network/ports: Outbound HTTPS to configured registries; no listening port opened
# Downloads code: Yes, package contents; install lifecycle scripts are disabled
# Replace: Nothing
npm ci --ignore-scripts
```

Expected output: dependencies installed, or a clear error if the lockfile and package manifest disagree.

This reduced-risk pass can leave packages incomplete when they legitimately require native builds or generated files.

### Step 6: Review dependency vulnerabilities

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Network/ports: Outbound HTTPS to the configured npm audit endpoint; no listening port opened
# Downloads code: Advisory data only
# Replace: Nothing
npm audit --audit-level=high
```

Expected result: either no high or critical vulnerabilities, or a report requiring review.

Do not run `npm audit fix --force` automatically. It can make major dependency changes.

### Step 7: Run the normal install only after reviewing scripts

This step allows dependency lifecycle scripts and therefore executes downloaded code. Continue only when the repository and dependency setup are sufficiently trusted.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Deletes and recreates node_modules; may generate project files through install scripts
# Network/ports: Outbound registry access; install scripts may make additional connections
# Downloads code: Yes, and downloaded lifecycle scripts may execute
# Replace: Nothing
npm ci
```

Expected output: a clean install that matches the lockfile.

For higher-assurance projects, define an npm 11 `allowScripts` policy rather than permitting every dependency lifecycle script.

### Step 8: Run validation before the development server

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Tests and builds may write caches or build output; inspect scripts first
# Network/ports: Project scripts may make outbound requests; no port expected unless the scripts specify one
# Downloads code: Normally no additional code, but project scripts control behaviour
# Replace: Nothing
npm run test --if-present
npm run lint --if-present
npm run typecheck --if-present
npm run build --if-present
```

Expected result: available checks complete successfully.

### Step 9: Start the development server deliberately

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: May write caches and generated files
# Network/ports: Opens the project's development port, commonly loopback-only; verify the displayed host and port
# Downloads code: Project-controlled; may download assets or contact APIs
# Replace: Nothing
npm run dev
```

Expected output: a local URL.

Stop the server with `Ctrl+C`. Do not expose it to `0.0.0.0`, a LAN, tunnel, or public URL until authentication and development-server security have been reviewed.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `git status --short --branch` | Clean working tree after clone. | Inspection only. |
| `npm pkg get scripts` | Understandable script map. | Inspection only. |
| `npm ci --ignore-scripts` | Frozen dependency install without lifecycle scripts. | Replaces `node_modules`; downloads packages. |
| `npm audit --audit-level=high` | No unreviewed high or critical findings. | Sends dependency metadata to registry audit service. |
| Project test/build commands | Successful exit codes. | Script behaviour depends on repository content. |

## Security checks

- Keep VS Code in Restricted Mode until repository configuration is reviewed.
- Do not initialise submodules until each URL and pinned commit is inspected.
- Check `.npmrc` for custom registries, tokens, or disabled protections.
- Use the lockfile and investigate large unexplained lockfile changes.
- Never paste production credentials into an unfamiliar project.
- Confirm the development server binds to loopback, not every interface.
- Review staged changes with `git diff` after builds and tests.
- Delete the review clone if confidence is not established.

## Common errors

### `npm ci` reports package-lock mismatch

Do not immediately run `npm install`, because it will modify the lockfile. Confirm the required package manager and Node version in the repository documentation.

### The application fails after `--ignore-scripts`

Some packages require reviewed install steps. Inspect dependency scripts and project documentation before running normal `npm ci`.

### Development server is reachable from another device

Stop it. Check the dev command for `--host`, `0.0.0.0`, or framework configuration that exposes the server beyond loopback.

## How to undo or remove it

Stop running processes. Move out of the project folder, then delete the review clone only after confirming the path:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Parent of the repository
# Admin: Not required
# Writes/deletes: Permanently deletes the entire named clone, including uncommitted files
# Network/ports: None
# Downloads code: No
# Replace: Replace PROJECT-NAME and verify the full path first
Remove-Item -LiteralPath "$HOME\projects-review\PROJECT-NAME" -Recurse -Force
```

## What to do next

If the project is trustworthy, create a dedicated branch, configure only the required credentials, and add CI before making significant changes.

## Sources

- [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/) — Frozen installs, lockfile requirements, removal of `node_modules`, and `ignore-scripts`.
- [npm install](https://docs.npmjs.com/cli/install/) — Lifecycle-script policy and package-install controls.
- [npm audit](https://docs.npmjs.com/cli/audit/) — Vulnerability reporting and remediation behaviour.
- [VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) — Restricted Mode for unfamiliar code.
- [GitHub removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) — Safer staging and secret-prevention practices.
