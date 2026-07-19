---
title: "Install Visual Studio Code on Windows with Workspace Trust enabled"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  vscode: "1.128.1"
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
  - name: "Install Visual Studio Code on Windows"
    url: "https://code.visualstudio.com/docs/setup/windows"
    relationship: instruction-source
  - name: "Workspace Trust"
    url: "https://code.visualstudio.com/docs/editing/workspaces/workspace-trust"
    relationship: security-source
  - name: "Extension runtime security"
    url: "https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security"
    relationship: security-source
  - name: "Visual Studio Code 1.128"
    url: "https://code.visualstudio.com/updates/v1_128"
    relationship: version-source
---

# Install Visual Studio Code on Windows with Workspace Trust enabled

**Status:** Draft — not published or indexed.

## What you will achieve

You will install the current VS Code user edition, verify the command-line launcher, keep Workspace Trust enabled, and learn how to inspect extensions before allowing them to execute inside a repository.

## Who this is for

This guide is for Windows developers who want a general-purpose editor for Git, Node.js, Python, AI-assisted coding, or infrastructure files.

It does not install language runtimes or recommend a large extension bundle.

## Requirements and expected cost

- Windows 10 22H2 or Windows 11.
- WinGet.
- Internet access.
- Cost: free.

The VS Code **User setup** is recommended for most users because it does not require administrator permission and updates within the user profile.

## Tested environment and version scope

VS Code 1.128.1 was the current security-updated stable release reviewed on 19 July 2026. VS Code updates frequently; later versions should preserve the core Workspace Trust and extension-security controls described here.

## Before you begin

Save editor work and close any existing VS Code instance. Do not disable extension signature verification or Workspace Trust to make an unfamiliar repository “work.”

## Step-by-step instructions

### Step 1: Inspect the VS Code package

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May refresh WinGet metadata; does not install VS Code
# Network/ports: Outbound HTTPS; no listening port opened
# Downloads code: Package metadata only
# Replace: Nothing
winget show --id Microsoft.VisualStudioCode --exact --source winget
```

Expected output: package details for Microsoft Visual Studio Code.

### Step 2: Install the user-scoped edition

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required for user scope
# Writes/deletes: Installs VS Code into the user profile and updates PATH
# Network/ports: Outbound HTTPS; no listening port opened
# Downloads code: Yes, an executable installer
# Replace: Nothing
winget install --id Microsoft.VisualStudioCode --exact --source winget --scope user
```

Expected output: installation succeeded.

Close and reopen PowerShell before verifying the `code` command.

### Step 3: Verify the installation

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
code --version
where.exe code
```

Expected output: VS Code 1.128.1 or a later approved stable version, followed by the command path.

### Step 4: Open unfamiliar code in Restricted Mode

Create a harmless empty folder and open it.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Your user profile
# Admin: Not required
# Writes/deletes: Creates one empty demonstration folder
# Network/ports: None
# Downloads code: No
# Replace: You may replace trace-workspace-trust-demo with another folder name
New-Item -ItemType Directory -Path "$HOME\trace-workspace-trust-demo" -Force
code "$HOME\trace-workspace-trust-demo"
```

Expected result: VS Code opens the folder. For a newly opened folder, Workspace Trust may show a trust prompt or Restricted Mode banner.

Use **Restricted Mode** until you have reviewed the repository's source, tasks, extensions, build scripts, and ownership. Trust only repositories whose authors and contents you consider safe.

### Step 5: Review installed extensions

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
code --list-extensions --show-versions
```

Expected output: zero or more extension identifiers and versions.

In the Extensions view, verify:

- the publisher;
- the publisher's verified status where available;
- requested capabilities;
- recent update history;
- whether the extension is actually needed.

Do not bypass a failed extension-signature check merely to complete an installation.

### Step 6: Learn the clean troubleshooting mode

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any trusted project or an empty folder
# Admin: Not required
# Writes/deletes: None
# Network/ports: VS Code itself may use update or extension services; this command opens no development port
# Downloads code: No
# Replace: Replace C:\PATH\TO\PROJECT with a folder you control
code --disable-extensions "C:\PATH\TO\PROJECT"
```

Expected result: VS Code opens without activating installed extensions. Use this mode to determine whether an extension is causing a problem.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `code --version` | Current stable VS Code version. | Windows; PowerShell; inspection only. |
| `where.exe code` | User installation command path. | Windows; PowerShell; inspection only. |
| `code --list-extensions --show-versions` | Reviewable list of installed extensions. | Windows; PowerShell; inspection only. |

Also verify in VS Code:

1. Open the Command Palette.
2. Run **Workspaces: Manage Workspace Trust**.
3. Confirm that Workspace Trust is enabled and that unfamiliar folders remain untrusted until reviewed.

## Security checks

- Keep Workspace Trust enabled.
- Treat repository-recommended extensions as suggestions, not automatic approvals.
- Prefer Marketplace extensions from known or verified publishers.
- Keep extension signature verification enabled.
- Remove unused extensions; every extension adds executable code and update supply-chain exposure.
- Avoid running VS Code as Administrator.
- Review `.vscode/tasks.json`, `.vscode/launch.json`, workspace files, and project scripts before trusting an unfamiliar repository.
- Update VS Code promptly when release notes identify security fixes.

## Common errors

### `code` is not recognized

Restart PowerShell. If it still fails, open VS Code and use the installation repair option, or verify that the user installer added its `bin` directory to `PATH`.

### Workspace Trust prompt does not appear

The folder may already be trusted through a trusted parent directory. Run **Workspaces: Manage Workspace Trust** and inspect the trusted-folder list.

### Extension signature cannot be verified

Do not disable signature verification. Check network interception, proxy settings, system time, and whether the extension came from the official Marketplace. Report or avoid suspicious extensions.

## How to undo or remove it

Uninstall through Windows Settings or:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required for a user-scoped uninstall
# Writes/deletes: Uninstalls VS Code; user settings and extension folders may remain
# Network/ports: May contact WinGet metadata services
# Downloads code: No
# Replace: Nothing
winget uninstall --id Microsoft.VisualStudioCode --exact
```

Delete the empty demonstration folder if no longer needed:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Your user profile
# Admin: Not required
# Writes/deletes: Permanently deletes only the named demonstration folder
# Network/ports: None
# Downloads code: No
# Replace: Confirm the path is exactly your demonstration folder
Remove-Item -LiteralPath "$HOME\trace-workspace-trust-demo" -Recurse -Force
```

## What to do next

Install Git and the required runtime, then use the safe-cloning guide before trusting or executing an unfamiliar project.

## Sources

- [Install Visual Studio Code on Windows](https://code.visualstudio.com/docs/setup/windows) — User installer, PATH, updates, and Windows installation choices.
- [Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) — Restricted Mode and trusted-folder controls.
- [Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security) — Marketplace scanning, signatures, blocklists, and publisher checks.
- [Visual Studio Code 1.128](https://code.visualstudio.com/updates/v1_128) — Reviewed stable release and security update.
