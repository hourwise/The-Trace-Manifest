-- Batch guide ingestion
-- Generated from docs/guides/
-- Run: npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-guides.sql

-- 01-install-git-for-windows.md → guide-install-git-for-windows-and-configure-your-identity-safely-c308f70a
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-git-for-windows-and-configure-your-identity-safely-c308f70a',
      'install-git-for-windows-and-configure-your-identity-safely',
      'Install Git for Windows and configure your identity safely',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      1,
      '# Install Git for Windows and configure your identity safely

**Status:** Draft — not published or indexed.

## What you will achieve

You will install the maintained Git for Windows package, verify which executable Windows will run, and configure the name and email recorded in future commits.

## Who this is for

This guide is for Windows users who need Git for cloning repositories, committing changes, or using development tools that expect Git.

It does not configure GitHub authentication. Use the separate SSH guide after completing this setup.

## Requirements and expected cost

- Windows 10 22H2 or Windows 11.
- An internet connection for package metadata and the installer.
- Windows Package Manager (`winget`), normally supplied through Microsoft App Installer.
- Cost: free.

The installation may display a Windows elevation prompt depending on the installer and machine policy. Do not launch the entire terminal as Administrator unless your organisation specifically requires it.

## Tested environment and version scope

This guide was reviewed against Git for Windows 2.55.0 and current WinGet documentation on 19 July 2026. The instructions are documentation-reviewed rather than physically tested on every Windows configuration.

## Before you begin

Close applications that are actively using Git. Save any terminal work. This guide does not alter repositories, but installation changes your user or system `PATH`.

Do not copy commands that add unknown WinGet sources. The guide explicitly selects the standard `winget` source and the exact package identifier `Git.Git`.

## Step-by-step instructions

### Step 1: Confirm that WinGet is available

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: No network connection is required for this version check; no ports opened
# Downloads code: No
# Replace: Nothing
winget --version
```

Expected output: a WinGet version beginning with `v` or a numeric version.

If `winget` is not recognised, update or install **App Installer** from the Microsoft Store before continuing.

### Step 2: Inspect the exact package before installing it

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May refresh local WinGet package metadata; does not install Git
# Network/ports: Outbound HTTPS to the WinGet source; no listening port opened
# Downloads code: Downloads package metadata only
# Replace: Nothing
winget show --id Git.Git --exact --source winget
```

Expected output: a package named **Git** or **Git for Windows**, with publisher and installer information. At the last verification date, the maintained version was 2.55.0.

Stop if the package ID is not exactly `Git.Git` or if the installer source is unexpected.

### Step 3: Install Git for Windows

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Usually not required to start; Windows may request elevation for the installer
# Writes/deletes: Installs Git, Git Bash, supporting files, and PATH entries
# Network/ports: Outbound HTTPS to download the installer; no listening port opened
# Downloads code: Yes, a signed executable installer
# Replace: Nothing
winget install --id Git.Git --exact --source winget
```

Expected output: WinGet reports a successful installation. Read any licence or elevation prompts rather than automatically accepting them in a copied script.

Close and reopen PowerShell after installation so the updated `PATH` is loaded.

### Step 4: Verify the installed executable and version

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git --version
where.exe git
```

Expected output:

- `git version 2.55.0.windows...` or a later maintained version.
- One or more paths ending in `git.exe`, normally under `C:\Program Files\Git\cmd\`.

If several unrelated Git installations appear, decide which installation should be first on `PATH` before continuing.

### Step 5: Configure the identity recorded in commits

These settings do not authenticate you. They set the author name and email stored in new commits.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Writes user.name and user.email to your global Git configuration
# Network/ports: None
# Downloads code: No
# Replace: Replace YOUR NAME and YOUR_EMAIL@example.com
git config --global user.name "YOUR NAME"
git config --global user.email "YOUR_EMAIL@example.com"
```

Expected output: no output when the settings are written successfully.

Use an email address appropriate for the Git hosting account you intend to use. GitHub users who do not want to expose a personal address can use a GitHub-provided no-reply address.

### Step 6: Use `main` as the default branch for new repositories

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Writes one setting to your global Git configuration
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git config --global init.defaultBranch main
```

Expected output: no output.

This affects only repositories created later with `git init`. It does not rename existing branches.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `git --version` | Git for Windows version is displayed. | Windows; PowerShell; any directory; inspection only. |
| `where.exe git` | Shows the expected Git installation path. | Windows; PowerShell; any directory; inspection only. |
| `git config --global --get user.name` | Displays your configured name. | Windows; PowerShell; any directory; reads global configuration only. |
| `git config --global --get user.email` | Displays your configured email. | Windows; PowerShell; any directory; reads global configuration only. |
| `git config --global --get init.defaultBranch` | Displays `main`. | Windows; PowerShell; any directory; reads global configuration only. |

## Security checks

- Keep Git updated through WinGet or the official Git for Windows updater.
- Do not store access tokens in Git remote URLs.
- Do not blindly change global line-ending settings. Follow the repository''s `.gitattributes` and contributor instructions.
- Review `where.exe git` if a tool appears to run a different Git version.
- Never run an unknown repository''s scripts merely because Git cloned it successfully.

## Common errors

### `''winget'' is not recognized`

Install or update Microsoft **App Installer**, sign in to Windows at least once, reopen PowerShell, and run `winget --version` again.

### `''git'' is not recognized`

Close every terminal and open a new PowerShell window. If the error remains, inspect the installation in Windows Settings and check whether `C:\Program Files\Git\cmd` is on `PATH`.

### Commits use the wrong email

Run the two `git config --global` commands again with the correct values. A repository can override the global identity with repository-local settings, so also inspect:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Inside the affected Git repository
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git config --show-origin --get-regexp "^user\."
```

## How to undo or remove it

Uninstall Git from **Settings → Apps → Installed apps**, or use WinGet:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Windows may request elevation
# Writes/deletes: Uninstalls Git; does not delete your repositories
# Network/ports: May contact WinGet metadata services; no listening port opened
# Downloads code: No
# Replace: Nothing
winget uninstall --id Git.Git --exact
```

Your global `.gitconfig` may remain in your user profile. Remove it only after reviewing whether other Git installations still need it.

## What to do next

Configure GitHub SSH authentication, then clone a small repository and verify that the remote uses either SSH or HTTPS without embedding credentials.

## Sources

- [Git for Windows installation](https://git-scm.com/install/windows) — Current maintained Windows release and official WinGet command.
- [Microsoft WinGet install command](https://learn.microsoft.com/en-us/windows/package-manager/winget/install) — Exact package selection and installation behaviour.
- [Git user manual](https://git-scm.com/docs/user-manual) — Official `user.name` and `user.email` configuration.',
      '{"frontmatter":{"title":"Install Git for Windows and configure your identity safely","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","git":"2.55.0","winget":"1.x","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://git-scm.com/docs/user-manual","relationship":"instruction-source","- name":"Git user manual"},"body":"# Install Git for Windows and configure your identity safely\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will install the maintained Git for Windows package, verify which executable Windows will run, and configure the name and email recorded in future commits.\n\n## Who this is for\n\nThis guide is for Windows users who need Git for cloning repositories, committing changes, or using development tools that expect Git.\n\nIt does not configure GitHub authentication. Use the separate SSH guide after completing this setup.\n\n## Requirements and expected cost\n\n- Windows 10 22H2 or Windows 11.\n- An internet connection for package metadata and the installer.\n- Windows Package Manager (`winget`), normally supplied through Microsoft App Installer.\n- Cost: free.\n\nThe installation may display a Windows elevation prompt depending on the installer and machine policy. Do not launch the entire terminal as Administrator unless your organisation specifically requires it.\n\n## Tested environment and version scope\n\nThis guide was reviewed against Git for Windows 2.55.0 and current WinGet documentation on 19 July 2026. The instructions are documentation-reviewed rather than physically tested on every Windows configuration.\n\n## Before you begin\n\nClose applications that are actively using Git. Save any terminal work. This guide does not alter repositories, but installation changes your user or system `PATH`.\n\nDo not copy commands that add unknown WinGet sources. The guide explicitly selects the standard `winget` source and the exact package identifier `Git.Git`.\n\n## Step-by-step instructions\n\n### Step 1: Confirm that WinGet is available\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: No network connection is required for this version check; no ports opened\n# Downloads code: No\n# Replace: Nothing\nwinget --version\n```\n\nExpected output: a WinGet version beginning with `v` or a numeric version.\n\nIf `winget` is not recognised, update or install **App Installer** from the Microsoft Store before continuing.\n\n### Step 2: Inspect the exact package before installing it\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May refresh local WinGet package metadata; does not install Git\n# Network/ports: Outbound HTTPS to the WinGet source; no listening port opened\n# Downloads code: Downloads package metadata only\n# Replace: Nothing\nwinget show --id Git.Git --exact --source winget\n```\n\nExpected output: a package named **Git** or **Git for Windows**, with publisher and installer information. At the last verification date, the maintained version was 2.55.0.\n\nStop if the package ID is not exactly `Git.Git` or if the installer source is unexpected.\n\n### Step 3: Install Git for Windows\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Usually not required to start; Windows may request elevation for the installer\n# Writes/deletes: Installs Git, Git Bash, supporting files, and PATH entries\n# Network/ports: Outbound HTTPS to download the installer; no listening port opened\n# Downloads code: Yes, a signed executable installer\n# Replace: Nothing\nwinget install --id Git.Git --exact --source winget\n```\n\nExpected output: WinGet reports a successful installation. Read any licence or elevation prompts rather than automatically accepting them in a copied script.\n\nClose and reopen PowerShell after installation so the updated `PATH` is loaded.\n\n### Step 4: Verify the installed executable and version\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit --version\nwhere.exe git\n```\n\nExpected output:\n\n- `git version 2.55.0.windows...` or a later maintained version.\n- One or more paths ending in `git.exe`, normally under `C:\\Program Files\\Git\\cmd\\`.\n\nIf several unrelated Git installations appear, decide which installation should be first on `PATH` before continuing.\n\n### Step 5: Configure the identity recorded in commits\n\nThese settings do not authenticate you. They set the author name and email stored in new commits.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Writes user.name and user.email to your global Git configuration\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace YOUR NAME and YOUR_EMAIL@example.com\ngit config --global user.name \"YOUR NAME\"\ngit config --global user.email \"YOUR_EMAIL@example.com\"\n```\n\nExpected output: no output when the settings are written successfully.\n\nUse an email address appropriate for the Git hosting account you intend to use. GitHub users who do not want to expose a personal address can use a GitHub-provided no-reply address.\n\n### Step 6: Use `main` as the default branch for new repositories\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Writes one setting to your global Git configuration\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit config --global init.defaultBranch main\n```\n\nExpected output: no output.\n\nThis affects only repositories created later with `git init`. It does not rename existing branches.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `git --version` | Git for Windows version is displayed. | Windows; PowerShell; any directory; inspection only. |\n| `where.exe git` | Shows the expected Git installation path. | Windows; PowerShell; any directory; inspection only. |\n| `git config --global --get user.name` | Displays your configured name. | Windows; PowerShell; any directory; reads global configuration only. |\n| `git config --global --get user.email` | Displays your configured email. | Windows; PowerShell; any directory; reads global configuration only. |\n| `git config --global --get init.defaultBranch` | Displays `main`. | Windows; PowerShell; any directory; reads global configuration only. |\n\n## Security checks\n\n- Keep Git updated through WinGet or the official Git for Windows updater.\n- Do not store access tokens in Git remote URLs.\n- Do not blindly change global line-ending settings. Follow the repository''s `.gitattributes` and contributor instructions.\n- Review `where.exe git` if a tool appears to run a different Git version.\n- Never run an unknown repository''s scripts merely because Git cloned it successfully.\n\n## Common errors\n\n### `''winget'' is not recognized`\n\nInstall or update Microsoft **App Installer**, sign in to Windows at least once, reopen PowerShell, and run `winget --version` again.\n\n### `''git'' is not recognized`\n\nClose every terminal and open a new PowerShell window. If the error remains, inspect the installation in Windows Settings and check whether `C:\\Program Files\\Git\\cmd` is on `PATH`.\n\n### Commits use the wrong email\n\nRun the two `git config --global` commands again with the correct values. A repository can override the global identity with repository-local settings, so also inspect:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Inside the affected Git repository\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit config --show-origin --get-regexp \"^user\\.\"\n```\n\n## How to undo or remove it\n\nUninstall Git from **Settings → Apps → Installed apps**, or use WinGet:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Windows may request elevation\n# Writes/deletes: Uninstalls Git; does not delete your repositories\n# Network/ports: May contact WinGet metadata services; no listening port opened\n# Downloads code: No\n# Replace: Nothing\nwinget uninstall --id Git.Git --exact\n```\n\nYour global `.gitconfig` may remain in your user profile. Remove it only after reviewing whether other Git installations still need it.\n\n## What to do next\n\nConfigure GitHub SSH authentication, then clone a small repository and verify that the remote uses either SSH or HTTPS without embedding credentials.\n\n## Sources\n\n- [Git for Windows installation](https://git-scm.com/install/windows) — Current maintained Windows release and official WinGet command.\n- [Microsoft WinGet install command](https://learn.microsoft.com/en-us/windows/package-manager/winget/install) — Exact package selection and installation behaviour.\n- [Git user manual](https://git-scm.com/docs/user-manual) — Official `user.name` and `user.email` configuration."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 02-install-nodejs-24-lts-windows.md → guide-install-node-js-24-lts-on-windows-and-verify-npm-0731e445
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-node-js-24-lts-on-windows-and-verify-npm-0731e445',
      'install-node-js-24-lts-on-windows-and-verify-npm',
      'Install Node.js 24 LTS on Windows and verify npm',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      1,
      '# Install Node.js 24 LTS on Windows and verify npm

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
node -e "console.log(process.version); console.log(''Node is working'')"
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

Do not weaken the machine-wide execution policy as a first response. Try `npm.cmd --version`, use Command Prompt, or review your organisation''s PowerShell policy.

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

Project source files remain, but each project''s `node_modules` directory is independent and may remain on disk.

## What to do next

Install Git and VS Code, then follow the safe-cloning guide before running an unfamiliar Node project.

## Sources

- [Node.js 24 release archive](https://nodejs.org/en/download/archive/v24) — Node 24 LTS status and release line.
- [Node.js 24.18.0 release](https://nodejs.org/en/blog/release/v24.18.0) — Reviewed Windows installer and bundled npm version.
- [Microsoft WinGet install command](https://learn.microsoft.com/en-us/windows/package-manager/winget/install) — Exact package and version installation syntax.
- [npm audit documentation](https://docs.npmjs.com/cli/audit/) — Dependency audit behaviour and cautions.',
      '{"frontmatter":{"title":"Install Node.js 24 LTS on Windows and verify npm","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","node":"24.18.0 LTS","npm":"11.16.x","winget":"1.x","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.npmjs.com/cli/audit/","relationship":"security-source","- name":"npm audit documentation"},"body":"# Install Node.js 24 LTS on Windows and verify npm\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will install the Node.js 24 long-term-support release on Windows, confirm that Node and npm resolve from the expected location, and check the npm registry configuration before using third-party packages.\n\n## Who this is for\n\nThis guide is for beginners setting up JavaScript, TypeScript, Astro, React, Cloudflare Workers, or agent-tooling projects on Windows.\n\nIt installs one system Node version. Developers who regularly switch between incompatible Node versions may prefer a version manager, which should be covered by a separate guide.\n\n## Requirements and expected cost\n\n- Windows 10 22H2 or Windows 11.\n- WinGet.\n- Internet access.\n- About 200 MB of free space for Node and npm, plus space for future project dependencies.\n- Cost: free.\n\n## Tested environment and version scope\n\nNode.js 24.18.0 was the current Node 24 LTS maintenance release reviewed for this guide. Node 24 ships with npm 11.x. The exact npm patch version may differ after an update.\n\n## Before you begin\n\nCheck whether Node is already installed. Replacing an existing installation can affect global npm packages and projects that depend on another major version.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnode --version\nnpm --version\nwhere.exe node\n```\n\nIf these commands work, record the output before installing another version.\n\n## Step-by-step instructions\n\n### Step 1: Inspect the Node.js LTS package\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May refresh local WinGet metadata; no Node installation\n# Network/ports: Outbound HTTPS to WinGet; no listening port opened\n# Downloads code: Package metadata only\n# Replace: Nothing\nwinget show --id OpenJS.NodeJS.LTS --exact --source winget\n```\n\nExpected output: package details for **Node.js (LTS)**. Confirm that the publisher and installer URL point to the Node.js distribution.\n\n### Step 2: Install the reviewed Node 24 release\n\nPinning the version makes this dated guide reproducible. A later guide review may update the patch release.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Windows may request elevation for the MSI installer\n# Writes/deletes: Installs Node.js, npm, and PATH entries\n# Network/ports: Outbound HTTPS for the installer; no listening port opened\n# Downloads code: Yes, an executable MSI package\n# Replace: Nothing\nwinget install --id OpenJS.NodeJS.LTS --exact --version 24.18.0 --source winget\n```\n\nExpected output: installation succeeded.\n\nClose PowerShell and open a new window before continuing.\n\n### Step 3: Verify Node, npm, and executable paths\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnode --version\nnpm --version\nwhere.exe node\nwhere.exe npm\n```\n\nExpected output:\n\n- `v24.18.0` for Node.\n- npm 11.x.\n- Paths under the expected Node.js installation, normally `C:\\Program Files\\nodejs\\`.\n\nMultiple unrelated Node paths can cause inconsistent builds. Resolve duplicate installations before relying on this setup.\n\n### Step 4: Confirm the npm registry\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None for this local configuration read\n# Downloads code: No\n# Replace: Nothing\nnpm config get registry\n```\n\nExpected output: `https://registry.npmjs.org/` unless your organisation intentionally uses an approved private registry.\n\nAn unfamiliar registry can serve modified packages. Confirm organisation-specific registries with your administrator.\n\n### Step 5: Run a local JavaScript check\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnode -e \"console.log(process.version); console.log(''Node is working'')\"\n```\n\nExpected output: the Node version followed by `Node is working`.\n\nDo not install random global npm packages as a verification step. Global packages add executable code to your user environment.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `node --version` | `v24.18.0` or the approved Node 24 patch. | Windows; PowerShell; inspection only. |\n| `npm --version` | npm 11.x. | Windows; PowerShell; inspection only. |\n| `where.exe node` | Expected Node installation path. | Windows; PowerShell; inspection only. |\n| `npm config get registry` | Approved npm registry URL. | Windows; PowerShell; reads configuration only. |\n\n## Security checks\n\n- Prefer projects with committed lockfiles.\n- Inspect `package.json`, `.npmrc`, and install scripts before installing dependencies from an unfamiliar repository.\n- `npm install` and `npm ci` can execute dependency lifecycle scripts unless scripts are disabled or restricted.\n- Run `npm audit` inside a project to identify known dependency vulnerabilities. Do not automatically use `npm audit fix --force`; it can introduce breaking dependency changes.\n- Avoid running package commands from an elevated terminal.\n- Do not store npm access tokens in a committed `.npmrc`.\n\n## Common errors\n\n### `No package found matching input criteria`\n\nRefresh WinGet sources and inspect the package again:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Refreshes local WinGet source metadata\n# Network/ports: Outbound HTTPS; no listening port opened\n# Downloads code: Metadata only\n# Replace: Nothing\nwinget source update\nwinget show --id OpenJS.NodeJS.LTS --exact --source winget\n```\n\n### `node` still shows an older version\n\nClose all terminals, reopen PowerShell, and run `where.exe node`. Remove or reorder obsolete Node installations rather than copying executables between folders.\n\n### PowerShell blocks `npm.ps1`\n\nDo not weaken the machine-wide execution policy as a first response. Try `npm.cmd --version`, use Command Prompt, or review your organisation''s PowerShell policy.\n\n## How to undo or remove it\n\nBefore uninstalling, record any global packages you still need:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnpm list --global --depth=0\n```\n\nThen uninstall through Windows Settings or WinGet:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Windows may request elevation\n# Writes/deletes: Uninstalls Node.js and npm; global packages may become unavailable\n# Network/ports: May contact WinGet metadata services\n# Downloads code: No\n# Replace: Nothing\nwinget uninstall --id OpenJS.NodeJS.LTS --exact\n```\n\nProject source files remain, but each project''s `node_modules` directory is independent and may remain on disk.\n\n## What to do next\n\nInstall Git and VS Code, then follow the safe-cloning guide before running an unfamiliar Node project.\n\n## Sources\n\n- [Node.js 24 release archive](https://nodejs.org/en/download/archive/v24) — Node 24 LTS status and release line.\n- [Node.js 24.18.0 release](https://nodejs.org/en/blog/release/v24.18.0) — Reviewed Windows installer and bundled npm version.\n- [Microsoft WinGet install command](https://learn.microsoft.com/en-us/windows/package-manager/winget/install) — Exact package and version installation syntax.\n- [npm audit documentation](https://docs.npmjs.com/cli/audit/) — Dependency audit behaviour and cautions."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 03-install-vscode-securely-windows.md → guide-install-visual-studio-code-on-windows-with-workspace-trust-enabled-66245e27
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-visual-studio-code-on-windows-with-workspace-trust-enabled-66245e27',
      'install-visual-studio-code-on-windows-with-workspace-trust-enabled',
      'Install Visual Studio Code on Windows with Workspace Trust enabled',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      1,
      '# Install Visual Studio Code on Windows with Workspace Trust enabled

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

Use **Restricted Mode** until you have reviewed the repository''s source, tasks, extensions, build scripts, and ownership. Trust only repositories whose authors and contents you consider safe.

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
- the publisher''s verified status where available;
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
- [Visual Studio Code 1.128](https://code.visualstudio.com/updates/v1_128) — Reviewed stable release and security update.',
      '{"frontmatter":{"title":"Install Visual Studio Code on Windows with Workspace Trust enabled","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","vscode":"1.128.1","winget":"1.x","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://code.visualstudio.com/updates/v1_128","relationship":"version-source","- name":"Visual Studio Code 1.128"},"body":"# Install Visual Studio Code on Windows with Workspace Trust enabled\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will install the current VS Code user edition, verify the command-line launcher, keep Workspace Trust enabled, and learn how to inspect extensions before allowing them to execute inside a repository.\n\n## Who this is for\n\nThis guide is for Windows developers who want a general-purpose editor for Git, Node.js, Python, AI-assisted coding, or infrastructure files.\n\nIt does not install language runtimes or recommend a large extension bundle.\n\n## Requirements and expected cost\n\n- Windows 10 22H2 or Windows 11.\n- WinGet.\n- Internet access.\n- Cost: free.\n\nThe VS Code **User setup** is recommended for most users because it does not require administrator permission and updates within the user profile.\n\n## Tested environment and version scope\n\nVS Code 1.128.1 was the current security-updated stable release reviewed on 19 July 2026. VS Code updates frequently; later versions should preserve the core Workspace Trust and extension-security controls described here.\n\n## Before you begin\n\nSave editor work and close any existing VS Code instance. Do not disable extension signature verification or Workspace Trust to make an unfamiliar repository “work.”\n\n## Step-by-step instructions\n\n### Step 1: Inspect the VS Code package\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May refresh WinGet metadata; does not install VS Code\n# Network/ports: Outbound HTTPS; no listening port opened\n# Downloads code: Package metadata only\n# Replace: Nothing\nwinget show --id Microsoft.VisualStudioCode --exact --source winget\n```\n\nExpected output: package details for Microsoft Visual Studio Code.\n\n### Step 2: Install the user-scoped edition\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required for user scope\n# Writes/deletes: Installs VS Code into the user profile and updates PATH\n# Network/ports: Outbound HTTPS; no listening port opened\n# Downloads code: Yes, an executable installer\n# Replace: Nothing\nwinget install --id Microsoft.VisualStudioCode --exact --source winget --scope user\n```\n\nExpected output: installation succeeded.\n\nClose and reopen PowerShell before verifying the `code` command.\n\n### Step 3: Verify the installation\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ncode --version\nwhere.exe code\n```\n\nExpected output: VS Code 1.128.1 or a later approved stable version, followed by the command path.\n\n### Step 4: Open unfamiliar code in Restricted Mode\n\nCreate a harmless empty folder and open it.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Your user profile\n# Admin: Not required\n# Writes/deletes: Creates one empty demonstration folder\n# Network/ports: None\n# Downloads code: No\n# Replace: You may replace trace-workspace-trust-demo with another folder name\nNew-Item -ItemType Directory -Path \"$HOME\\trace-workspace-trust-demo\" -Force\ncode \"$HOME\\trace-workspace-trust-demo\"\n```\n\nExpected result: VS Code opens the folder. For a newly opened folder, Workspace Trust may show a trust prompt or Restricted Mode banner.\n\nUse **Restricted Mode** until you have reviewed the repository''s source, tasks, extensions, build scripts, and ownership. Trust only repositories whose authors and contents you consider safe.\n\n### Step 5: Review installed extensions\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ncode --list-extensions --show-versions\n```\n\nExpected output: zero or more extension identifiers and versions.\n\nIn the Extensions view, verify:\n\n- the publisher;\n- the publisher''s verified status where available;\n- requested capabilities;\n- recent update history;\n- whether the extension is actually needed.\n\nDo not bypass a failed extension-signature check merely to complete an installation.\n\n### Step 6: Learn the clean troubleshooting mode\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any trusted project or an empty folder\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: VS Code itself may use update or extension services; this command opens no development port\n# Downloads code: No\n# Replace: Replace C:\\PATH\\TO\\PROJECT with a folder you control\ncode --disable-extensions \"C:\\PATH\\TO\\PROJECT\"\n```\n\nExpected result: VS Code opens without activating installed extensions. Use this mode to determine whether an extension is causing a problem.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `code --version` | Current stable VS Code version. | Windows; PowerShell; inspection only. |\n| `where.exe code` | User installation command path. | Windows; PowerShell; inspection only. |\n| `code --list-extensions --show-versions` | Reviewable list of installed extensions. | Windows; PowerShell; inspection only. |\n\nAlso verify in VS Code:\n\n1. Open the Command Palette.\n2. Run **Workspaces: Manage Workspace Trust**.\n3. Confirm that Workspace Trust is enabled and that unfamiliar folders remain untrusted until reviewed.\n\n## Security checks\n\n- Keep Workspace Trust enabled.\n- Treat repository-recommended extensions as suggestions, not automatic approvals.\n- Prefer Marketplace extensions from known or verified publishers.\n- Keep extension signature verification enabled.\n- Remove unused extensions; every extension adds executable code and update supply-chain exposure.\n- Avoid running VS Code as Administrator.\n- Review `.vscode/tasks.json`, `.vscode/launch.json`, workspace files, and project scripts before trusting an unfamiliar repository.\n- Update VS Code promptly when release notes identify security fixes.\n\n## Common errors\n\n### `code` is not recognized\n\nRestart PowerShell. If it still fails, open VS Code and use the installation repair option, or verify that the user installer added its `bin` directory to `PATH`.\n\n### Workspace Trust prompt does not appear\n\nThe folder may already be trusted through a trusted parent directory. Run **Workspaces: Manage Workspace Trust** and inspect the trusted-folder list.\n\n### Extension signature cannot be verified\n\nDo not disable signature verification. Check network interception, proxy settings, system time, and whether the extension came from the official Marketplace. Report or avoid suspicious extensions.\n\n## How to undo or remove it\n\nUninstall through Windows Settings or:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required for a user-scoped uninstall\n# Writes/deletes: Uninstalls VS Code; user settings and extension folders may remain\n# Network/ports: May contact WinGet metadata services\n# Downloads code: No\n# Replace: Nothing\nwinget uninstall --id Microsoft.VisualStudioCode --exact\n```\n\nDelete the empty demonstration folder if no longer needed:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Your user profile\n# Admin: Not required\n# Writes/deletes: Permanently deletes only the named demonstration folder\n# Network/ports: None\n# Downloads code: No\n# Replace: Confirm the path is exactly your demonstration folder\nRemove-Item -LiteralPath \"$HOME\\trace-workspace-trust-demo\" -Recurse -Force\n```\n\n## What to do next\n\nInstall Git and the required runtime, then use the safe-cloning guide before trusting or executing an unfamiliar project.\n\n## Sources\n\n- [Install Visual Studio Code on Windows](https://code.visualstudio.com/docs/setup/windows) — User installer, PATH, updates, and Windows installation choices.\n- [Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) — Restricted Mode and trusted-folder controls.\n- [Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security) — Marketplace scanning, signatures, blocklists, and publisher checks.\n- [Visual Studio Code 1.128](https://code.visualstudio.com/updates/v1_128) — Reviewed stable release and security update."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 04-configure-github-ssh-windows.md → guide-configure-passphrase-protected-github-ssh-authentication-on-windows-7edc0f98
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-configure-passphrase-protected-github-ssh-authentication-on-windows-7edc0f98',
      'configure-passphrase-protected-github-ssh-authentication-on-windows',
      'Configure passphrase-protected GitHub SSH authentication on Windows',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      1,
      0,
      0,
      '# Configure passphrase-protected GitHub SSH authentication on Windows

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a modern Ed25519 SSH key, protect the private key with a passphrase, add only the public key to GitHub, verify GitHub''s server fingerprint, and test authentication.

## Who this is for

This guide is for GitHub users who already installed Git for Windows and want to clone and push repositories without placing a personal access token in a remote URL.

It uses **Git Bash**, because GitHub''s Windows SSH instructions and Git for Windows work consistently in that shell.

## Requirements and expected cost

- A GitHub account.
- Git for Windows.
- Access to Git Bash.
- A verified email address appropriate for the key comment.
- Cost: free.

## Tested environment and version scope

The guide was reviewed against GitHub''s current SSH documentation and Git for Windows 2.55.0.

## Before you begin

The private key file must never be uploaded, emailed, committed, pasted into a website, or shared with an AI tool. Only the `.pub` file is public.

Use a strong, unique passphrase. Losing the passphrase normally means generating a replacement key; GitHub cannot recover it.

## Step-by-step instructions

### Step 1: Check for an existing key before creating another

Open **Git Bash**.

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Your home directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
ls -al ~/.ssh
```

Expected output: either a list of files or a message that the directory does not exist.

Do not overwrite an existing `id_ed25519` unless you intentionally want to replace that key. Use a distinct filename for separate accounts or devices.

### Step 2: Generate an Ed25519 key pair

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Your home directory
# Admin: Not required
# Writes/deletes: Creates a private key and matching public key under ~/.ssh
# Network/ports: None
# Downloads code: No
# Replace: Replace YOUR_GITHUB_EMAIL@example.com; choose a different filename if id_ed25519 exists
ssh-keygen -t ed25519 -C "YOUR_GITHUB_EMAIL@example.com"
```

When asked for the file location, press Enter only if `~/.ssh/id_ed25519` is unused. Enter and confirm a passphrase.

Expected output: paths to a private key and a `.pub` public key plus a fingerprint.

### Step 3: Start an SSH agent for the current Git Bash session

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Starts an in-memory user process; no key file modified
# Network/ports: No listening network port
# Downloads code: No
# Replace: Nothing
eval "$(ssh-agent -s)"
```

Expected output: `Agent pid` followed by a number.

### Step 4: Add the private key to the agent

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Loads the private key into the current SSH agent session
# Network/ports: None
# Downloads code: No
# Replace: Replace the filename if you created a differently named key
ssh-add ~/.ssh/id_ed25519
```

Enter the key passphrase when prompted.

Expected output: `Identity added`.

### Step 5: Copy the public key

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Replaces the current Windows clipboard contents with the public key
# Network/ports: None
# Downloads code: No
# Replace: Replace the filename if needed
clip.exe < ~/.ssh/id_ed25519.pub
```

Expected output: no terminal output.

Open GitHub in your browser:

1. Go to **Settings**.
2. Open **SSH and GPG keys**.
3. Choose **New SSH key**.
4. Use a descriptive title such as `Windows desktop — July 2026`.
5. Select **Authentication Key**.
6. Paste the public key and save.

Never paste the file without `.pub`.

### Step 6: Verify GitHub''s host fingerprint and test the connection

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: On first trusted connection, adds GitHub''s host key to ~/.ssh/known_hosts
# Network/ports: Outbound SSH to github.com, normally TCP 22; no listening port opened
# Downloads code: No
# Replace: Nothing
ssh -T git@github.com
```

On the first connection, compare the displayed Ed25519 fingerprint with GitHub''s published fingerprint:

`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`

Type `yes` only when it matches.

Expected result: `Hi USERNAME! You''ve successfully authenticated, but GitHub does not provide shell access.`

GitHub notes that this successful test exits with status 1 because interactive shell access is not provided.

### Step 7: List the loaded key fingerprint

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
ssh-add -l -E sha256
```

Expected output: the SHA-256 fingerprint of the key loaded into the agent. Compare it with the fingerprint displayed for the key in GitHub settings.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `ssh-add -l -E sha256` | Shows your loaded key fingerprint. | Windows; Git Bash; inspection only. |
| `ssh -T git@github.com` | GitHub greets your username. | Outbound SSH only; may update `known_hosts` on first connection. |
| `git ls-remote git@github.com:OWNER/REPOSITORY.git` | Lists references for a repository you may access. | Outbound SSH; read-only remote operation; replace owner and repository. |

## Security checks

- The private file normally has no `.pub` suffix; never upload it.
- Always use a passphrase unless a controlled automation design requires another credential method.
- Verify GitHub''s host fingerprint before accepting the first connection.
- Review GitHub **SSH and GPG keys** regularly and delete unknown or obsolete keys.
- Use a separate key for separate devices or security boundaries.
- Revoke the GitHub key immediately if the device or private key is lost.
- Do not enable SSH agent forwarding unless you understand the additional risk.
- Organisation repositories using SAML single sign-on may require separate authorisation of the key.

## Common errors

### `Permission denied (publickey)`

Confirm that:

- the key is loaded with `ssh-add -l -E sha256`;
- the matching public key is present in GitHub settings;
- the repository remote points to the correct GitHub account;
- the private filename is correct.

### `Could not open a connection to your authentication agent`

Run `eval "$(ssh-agent -s)"` again in the current Git Bash session, then repeat `ssh-add`.

### `Host key verification failed`

Do not delete `known_hosts` blindly. Compare the current official GitHub fingerprints and investigate unexpected changes.

## How to undo or remove it

First delete the key from GitHub **Settings → SSH and GPG keys**.

Then remove it from the current agent:

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Removes the key from the current agent; key files remain
# Network/ports: None
# Downloads code: No
# Replace: Replace the filename if needed
ssh-add -d ~/.ssh/id_ed25519
```

After confirming the GitHub key is revoked and no service still needs it, delete both local files through File Explorer or a carefully reviewed command. Deleting the private key is irreversible.

## What to do next

Change a repository remote from HTTPS to SSH, or follow the safe-cloning guide with an SSH repository URL.

## Sources

- [Checking for existing SSH keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/checking-for-existing-ssh-keys?platform=windows) — Existing-key inspection.
- [Generating a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent) — Ed25519 generation and passphrases.
- [Adding a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account) — GitHub account registration.
- [Testing an SSH connection](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection?platform=windows) — Connection test and expected response.
- [GitHub SSH fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) — Official server fingerprints.',
      '{"frontmatter":{"title":"Configure passphrase-protected GitHub SSH authentication on Windows","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","git":"2.55.0","openssh":"Git for Windows bundled OpenSSH","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"true","root_required":"false","downloads_executable":"false","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints","relationship":"security-source","- name":"GitHub SSH fingerprints"},"body":"# Configure passphrase-protected GitHub SSH authentication on Windows\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a modern Ed25519 SSH key, protect the private key with a passphrase, add only the public key to GitHub, verify GitHub''s server fingerprint, and test authentication.\n\n## Who this is for\n\nThis guide is for GitHub users who already installed Git for Windows and want to clone and push repositories without placing a personal access token in a remote URL.\n\nIt uses **Git Bash**, because GitHub''s Windows SSH instructions and Git for Windows work consistently in that shell.\n\n## Requirements and expected cost\n\n- A GitHub account.\n- Git for Windows.\n- Access to Git Bash.\n- A verified email address appropriate for the key comment.\n- Cost: free.\n\n## Tested environment and version scope\n\nThe guide was reviewed against GitHub''s current SSH documentation and Git for Windows 2.55.0.\n\n## Before you begin\n\nThe private key file must never be uploaded, emailed, committed, pasted into a website, or shared with an AI tool. Only the `.pub` file is public.\n\nUse a strong, unique passphrase. Losing the passphrase normally means generating a replacement key; GitHub cannot recover it.\n\n## Step-by-step instructions\n\n### Step 1: Check for an existing key before creating another\n\nOpen **Git Bash**.\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Your home directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nls -al ~/.ssh\n```\n\nExpected output: either a list of files or a message that the directory does not exist.\n\nDo not overwrite an existing `id_ed25519` unless you intentionally want to replace that key. Use a distinct filename for separate accounts or devices.\n\n### Step 2: Generate an Ed25519 key pair\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Your home directory\n# Admin: Not required\n# Writes/deletes: Creates a private key and matching public key under ~/.ssh\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace YOUR_GITHUB_EMAIL@example.com; choose a different filename if id_ed25519 exists\nssh-keygen -t ed25519 -C \"YOUR_GITHUB_EMAIL@example.com\"\n```\n\nWhen asked for the file location, press Enter only if `~/.ssh/id_ed25519` is unused. Enter and confirm a passphrase.\n\nExpected output: paths to a private key and a `.pub` public key plus a fingerprint.\n\n### Step 3: Start an SSH agent for the current Git Bash session\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Starts an in-memory user process; no key file modified\n# Network/ports: No listening network port\n# Downloads code: No\n# Replace: Nothing\neval \"$(ssh-agent -s)\"\n```\n\nExpected output: `Agent pid` followed by a number.\n\n### Step 4: Add the private key to the agent\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Loads the private key into the current SSH agent session\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace the filename if you created a differently named key\nssh-add ~/.ssh/id_ed25519\n```\n\nEnter the key passphrase when prompted.\n\nExpected output: `Identity added`.\n\n### Step 5: Copy the public key\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Replaces the current Windows clipboard contents with the public key\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace the filename if needed\nclip.exe < ~/.ssh/id_ed25519.pub\n```\n\nExpected output: no terminal output.\n\nOpen GitHub in your browser:\n\n1. Go to **Settings**.\n2. Open **SSH and GPG keys**.\n3. Choose **New SSH key**.\n4. Use a descriptive title such as `Windows desktop — July 2026`.\n5. Select **Authentication Key**.\n6. Paste the public key and save.\n\nNever paste the file without `.pub`.\n\n### Step 6: Verify GitHub''s host fingerprint and test the connection\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: On first trusted connection, adds GitHub''s host key to ~/.ssh/known_hosts\n# Network/ports: Outbound SSH to github.com, normally TCP 22; no listening port opened\n# Downloads code: No\n# Replace: Nothing\nssh -T git@github.com\n```\n\nOn the first connection, compare the displayed Ed25519 fingerprint with GitHub''s published fingerprint:\n\n`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`\n\nType `yes` only when it matches.\n\nExpected result: `Hi USERNAME! You''ve successfully authenticated, but GitHub does not provide shell access.`\n\nGitHub notes that this successful test exits with status 1 because interactive shell access is not provided.\n\n### Step 7: List the loaded key fingerprint\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nssh-add -l -E sha256\n```\n\nExpected output: the SHA-256 fingerprint of the key loaded into the agent. Compare it with the fingerprint displayed for the key in GitHub settings.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `ssh-add -l -E sha256` | Shows your loaded key fingerprint. | Windows; Git Bash; inspection only. |\n| `ssh -T git@github.com` | GitHub greets your username. | Outbound SSH only; may update `known_hosts` on first connection. |\n| `git ls-remote git@github.com:OWNER/REPOSITORY.git` | Lists references for a repository you may access. | Outbound SSH; read-only remote operation; replace owner and repository. |\n\n## Security checks\n\n- The private file normally has no `.pub` suffix; never upload it.\n- Always use a passphrase unless a controlled automation design requires another credential method.\n- Verify GitHub''s host fingerprint before accepting the first connection.\n- Review GitHub **SSH and GPG keys** regularly and delete unknown or obsolete keys.\n- Use a separate key for separate devices or security boundaries.\n- Revoke the GitHub key immediately if the device or private key is lost.\n- Do not enable SSH agent forwarding unless you understand the additional risk.\n- Organisation repositories using SAML single sign-on may require separate authorisation of the key.\n\n## Common errors\n\n### `Permission denied (publickey)`\n\nConfirm that:\n\n- the key is loaded with `ssh-add -l -E sha256`;\n- the matching public key is present in GitHub settings;\n- the repository remote points to the correct GitHub account;\n- the private filename is correct.\n\n### `Could not open a connection to your authentication agent`\n\nRun `eval \"$(ssh-agent -s)\"` again in the current Git Bash session, then repeat `ssh-add`.\n\n### `Host key verification failed`\n\nDo not delete `known_hosts` blindly. Compare the current official GitHub fingerprints and investigate unexpected changes.\n\n## How to undo or remove it\n\nFirst delete the key from GitHub **Settings → SSH and GPG keys**.\n\nThen remove it from the current agent:\n\n```bash\n# OS: Windows 10 22H2 or Windows 11\n# Shell: Git Bash\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Removes the key from the current agent; key files remain\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace the filename if needed\nssh-add -d ~/.ssh/id_ed25519\n```\n\nAfter confirming the GitHub key is revoked and no service still needs it, delete both local files through File Explorer or a carefully reviewed command. Deleting the private key is irreversible.\n\n## What to do next\n\nChange a repository remote from HTTPS to SSH, or follow the safe-cloning guide with an SSH repository URL.\n\n## Sources\n\n- [Checking for existing SSH keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/checking-for-existing-ssh-keys?platform=windows) — Existing-key inspection.\n- [Generating a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent) — Ed25519 generation and passphrases.\n- [Adding a new SSH key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account) — GitHub account registration.\n- [Testing an SSH connection](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection?platform=windows) — Connection test and expected response.\n- [GitHub SSH fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) — Official server fingerprints."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 05-clone-run-node-project-safely.md → guide-clone-and-run-an-unfamiliar-node-js-project-more-safely-443211a0
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-clone-and-run-an-unfamiliar-node-js-project-more-safely-443211a0',
      'clone-and-run-an-unfamiliar-node-js-project-more-safely',
      'Clone and run an unfamiliar Node.js project more safely',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free, excluding any services the project uses',
      1,
      1,
      0,
      0,
      1,
      '# Clone and run an unfamiliar Node.js project more safely

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

Expected output: the project''s script definitions and the configured npm registry.

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
# Network/ports: Opens the project''s development port, commonly loopback-only; verify the displayed host and port
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
- [GitHub removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) — Safer staging and secret-prevention practices.',
      '{"frontmatter":{"title":"Clone and run an unfamiliar Node.js project more safely","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","node":"24.18.0 LTS","npm":"11.16.x","git":"2.55.0","estimated_cost":"Free, excluding any services the project uses","destructive_steps":"true","network_exposure":"true","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository","relationship":"security-source","- name":"GitHub removing sensitive data"},"body":"# Clone and run an unfamiliar Node.js project more safely\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will clone a Node.js repository without automatically initialising submodules, inspect its executable configuration, install dependencies in a reduced-risk first pass, and run its checks before starting a development server.\n\n## Who this is for\n\nThis guide is for developers evaluating a repository from GitHub or another Git host.\n\nIt does not prove that a repository or dependency is safe. It reduces avoidable execution and credential risks during the first inspection.\n\n## Requirements and expected cost\n\n- Git for Windows.\n- Node.js 24 LTS and npm 11.\n- VS Code with Workspace Trust enabled.\n- Enough disk space for the repository and dependencies.\n- Internet access.\n- Cost: normally free, but the project may integrate paid APIs or services.\n\n## Tested environment and version scope\n\nThe guide was reviewed against Git 2.55.0, Node 24.18.0, npm 11.x, and current npm lifecycle-script controls.\n\n## Before you begin\n\nUse a non-administrator terminal. Do not clone into a folder containing secrets or unrelated projects. Do not provide API keys until you understand how the project uses them.\n\nA clone can contain malicious instructions and configuration even though Git itself does not normally execute repository code during a standard clone. Risk increases when you trust the workspace, install dependencies, initialise submodules, run scripts, or open a development server.\n\n## Step-by-step instructions\n\n### Step 1: Create a dedicated parent folder\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Your user profile\n# Admin: Not required\n# Writes/deletes: Creates a projects-review folder if absent\n# Network/ports: None\n# Downloads code: No\n# Replace: You may replace projects-review with another dedicated folder\nNew-Item -ItemType Directory -Path \"$HOME\\projects-review\" -Force\nSet-Location \"$HOME\\projects-review\"\n```\n\nExpected output: PowerShell moves into the dedicated folder.\n\n### Step 2: Clone without recursively initialising submodules\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: $HOME\\projects-review\n# Admin: Not required\n# Writes/deletes: Creates PROJECT-NAME and Git metadata\n# Network/ports: Outbound HTTPS or SSH to the Git host; no listening port opened\n# Downloads code: Yes, repository content\n# Replace: Replace REPOSITORY_URL and PROJECT-NAME\ngit clone --no-recurse-submodules \"REPOSITORY_URL\" \"PROJECT-NAME\"\nSet-Location \"PROJECT-NAME\"\n```\n\nExpected output: Git reports the clone completed.\n\nConfirm the URL independently rather than trusting a shortened or redirected link.\n\n### Step 3: Inspect the repository before opening it as trusted\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit status --short --branch\ngit remote -v\ngit submodule status\nGet-ChildItem -Force\n```\n\nExpected result: clean branch status, the intended remote, and no silently initialised submodules.\n\nOpen VS Code and keep the repository in Restricted Mode:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: VS Code may create user-state files outside the repository\n# Network/ports: No project port opened by this command\n# Downloads code: No\n# Replace: Nothing\ncode .\n```\n\nReview at least:\n\n- `README.md`;\n- `package.json`;\n- `package-lock.json`, `npm-shrinkwrap.json`, or other lockfile;\n- `.npmrc`;\n- `.env*` files;\n- `.vscode/tasks.json` and `.vscode/launch.json`;\n- install, prepare, preinstall, postinstall, test, build, and dev scripts;\n- scripts that invoke PowerShell, shell, curl, `Invoke-WebRequest`, Docker, cloud CLIs, or deployment tools.\n\n### Step 4: Inspect npm scripts from the terminal\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnpm pkg get scripts\nnpm config get registry\n```\n\nExpected output: the project''s script definitions and the configured npm registry.\n\nStop if scripts are heavily obfuscated, download and execute remote code unexpectedly, access unrelated directories, or require unexplained secrets.\n\n### Step 5: Perform a first dependency install without lifecycle scripts\n\n`npm ci` requires a matching lockfile. It removes an existing `node_modules` directory before installing, so this step is marked destructive.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Deletes existing node_modules, then writes a fresh dependency tree; lockfile remains unchanged\n# Network/ports: Outbound HTTPS to configured registries; no listening port opened\n# Downloads code: Yes, package contents; install lifecycle scripts are disabled\n# Replace: Nothing\nnpm ci --ignore-scripts\n```\n\nExpected output: dependencies installed, or a clear error if the lockfile and package manifest disagree.\n\nThis reduced-risk pass can leave packages incomplete when they legitimately require native builds or generated files.\n\n### Step 6: Review dependency vulnerabilities\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: Outbound HTTPS to the configured npm audit endpoint; no listening port opened\n# Downloads code: Advisory data only\n# Replace: Nothing\nnpm audit --audit-level=high\n```\n\nExpected result: either no high or critical vulnerabilities, or a report requiring review.\n\nDo not run `npm audit fix --force` automatically. It can make major dependency changes.\n\n### Step 7: Run the normal install only after reviewing scripts\n\nThis step allows dependency lifecycle scripts and therefore executes downloaded code. Continue only when the repository and dependency setup are sufficiently trusted.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Deletes and recreates node_modules; may generate project files through install scripts\n# Network/ports: Outbound registry access; install scripts may make additional connections\n# Downloads code: Yes, and downloaded lifecycle scripts may execute\n# Replace: Nothing\nnpm ci\n```\n\nExpected output: a clean install that matches the lockfile.\n\nFor higher-assurance projects, define an npm 11 `allowScripts` policy rather than permitting every dependency lifecycle script.\n\n### Step 8: Run validation before the development server\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Tests and builds may write caches or build output; inspect scripts first\n# Network/ports: Project scripts may make outbound requests; no port expected unless the scripts specify one\n# Downloads code: Normally no additional code, but project scripts control behaviour\n# Replace: Nothing\nnpm run test --if-present\nnpm run lint --if-present\nnpm run typecheck --if-present\nnpm run build --if-present\n```\n\nExpected result: available checks complete successfully.\n\n### Step 9: Start the development server deliberately\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: May write caches and generated files\n# Network/ports: Opens the project''s development port, commonly loopback-only; verify the displayed host and port\n# Downloads code: Project-controlled; may download assets or contact APIs\n# Replace: Nothing\nnpm run dev\n```\n\nExpected output: a local URL.\n\nStop the server with `Ctrl+C`. Do not expose it to `0.0.0.0`, a LAN, tunnel, or public URL until authentication and development-server security have been reviewed.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `git status --short --branch` | Clean working tree after clone. | Inspection only. |\n| `npm pkg get scripts` | Understandable script map. | Inspection only. |\n| `npm ci --ignore-scripts` | Frozen dependency install without lifecycle scripts. | Replaces `node_modules`; downloads packages. |\n| `npm audit --audit-level=high` | No unreviewed high or critical findings. | Sends dependency metadata to registry audit service. |\n| Project test/build commands | Successful exit codes. | Script behaviour depends on repository content. |\n\n## Security checks\n\n- Keep VS Code in Restricted Mode until repository configuration is reviewed.\n- Do not initialise submodules until each URL and pinned commit is inspected.\n- Check `.npmrc` for custom registries, tokens, or disabled protections.\n- Use the lockfile and investigate large unexplained lockfile changes.\n- Never paste production credentials into an unfamiliar project.\n- Confirm the development server binds to loopback, not every interface.\n- Review staged changes with `git diff` after builds and tests.\n- Delete the review clone if confidence is not established.\n\n## Common errors\n\n### `npm ci` reports package-lock mismatch\n\nDo not immediately run `npm install`, because it will modify the lockfile. Confirm the required package manager and Node version in the repository documentation.\n\n### The application fails after `--ignore-scripts`\n\nSome packages require reviewed install steps. Inspect dependency scripts and project documentation before running normal `npm ci`.\n\n### Development server is reachable from another device\n\nStop it. Check the dev command for `--host`, `0.0.0.0`, or framework configuration that exposes the server beyond loopback.\n\n## How to undo or remove it\n\nStop running processes. Move out of the project folder, then delete the review clone only after confirming the path:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Parent of the repository\n# Admin: Not required\n# Writes/deletes: Permanently deletes the entire named clone, including uncommitted files\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace PROJECT-NAME and verify the full path first\nRemove-Item -LiteralPath \"$HOME\\projects-review\\PROJECT-NAME\" -Recurse -Force\n```\n\n## What to do next\n\nIf the project is trustworthy, create a dedicated branch, configure only the required credentials, and add CI before making significant changes.\n\n## Sources\n\n- [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/) — Frozen installs, lockfile requirements, removal of `node_modules`, and `ignore-scripts`.\n- [npm install](https://docs.npmjs.com/cli/install/) — Lifecycle-script policy and package-install controls.\n- [npm audit](https://docs.npmjs.com/cli/audit/) — Vulnerability reporting and remediation behaviour.\n- [VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) — Restricted Mode for unfamiliar code.\n- [GitHub removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) — Safer staging and secret-prevention practices."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 06-protect-node-project-secrets.md → guide-keep-api-keys-and-secrets-out-of-a-node-js-git-repository-3d4c5edc
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-keep-api-keys-and-secrets-out-of-a-node-js-git-repository-3d4c5edc',
      'keep-api-keys-and-secrets-out-of-a-node-js-git-repository',
      'Keep API keys and secrets out of a Node.js Git repository',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      0,
      '# Keep API keys and secrets out of a Node.js Git repository

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a safe pattern for local environment variables, ignore real `.env` files, commit only a placeholder example, and verify that Git will not stage the secret file.

## Who this is for

This guide is for Node.js developers who need API keys, database URLs, signing secrets, or other runtime configuration.

It does not set up a production secret manager. Production systems should use the hosting provider''s secret store or a dedicated vault rather than uploading a local `.env` file.

## Requirements and expected cost

- A Git repository.
- Node.js 24 LTS.
- Git for Windows.
- Cost: free.

## Tested environment and version scope

Node''s built-in dotenv support and `--env-file` option are stable in the reviewed Node versions. The Git controls are version-independent.

## Before you begin

A secret already committed to Git must be treated as exposed. Removing the text from the latest file is not enough; rotate or revoke the credential first, then follow a dedicated history-cleaning procedure.

Never place a real credential in `.env.example`, screenshots, issue text, AI prompts, terminal recordings, or build logs.

## Step-by-step instructions

### Step 1: Confirm you are in the intended repository

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git rev-parse --show-toplevel
git status --short --branch
```

Expected output: the intended repository path and branch.

### Step 2: Add environment files to `.gitignore`

Open or create `.gitignore` in the repository root and add:

```gitignore
# File-write safety record:
# OS: Any; file: repository-root .gitignore
# Writes/deletes: Adds ignore patterns; does not delete files
# Network/ports: None
# Downloads code: No
# Replace: Nothing

.env
.env.*
!.env.example
```

This ignores `.env` and variants such as `.env.local`, while allowing a deliberately sanitised `.env.example`.

Do not use `!.env.production` or another exception for a file containing real production secrets.

### Step 3: Create a placeholder `.env.example`

Create `.env.example` with names and non-secret placeholders:

```dotenv
# File-write safety record:
# OS: Any; file: repository-root .env.example
# Writes/deletes: Creates a shareable example configuration file
# Network/ports: None
# Downloads code: No
# Replace: Change variable names to match the application; never insert real values

API_BASE_URL=https://api.example.invalid
API_KEY=replace-with-local-secret
DATABASE_URL=replace-with-local-connection-string
```

Document whether each value is required, where it is obtained, and whether it is safe for browser exposure.

### Step 4: Create the real local `.env`

Create `.env` locally with the real values. Do not stage or share it.

```dotenv
# File-write safety record:
# OS: Any; file: repository-root .env
# Writes/deletes: Creates a local secret-bearing file
# Network/ports: None
# Downloads code: No
# Replace: Replace every value with the correct local credential

API_BASE_URL=https://actual-service.example
API_KEY=YOUR_REAL_LOCAL_SECRET
DATABASE_URL=YOUR_REAL_LOCAL_CONNECTION_STRING
```

Restrict who can read the workstation account and folder. `.gitignore` prevents normal Git staging; it does not encrypt the file or protect it from malware, backups, other local users, or tools with filesystem access.

### Step 5: Verify that Git ignores the real file

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git check-ignore -v .env
git status --short
```

Expected output:

- `git check-ignore` identifies the matching `.gitignore` rule.
- `.env` does not appear as an untracked or staged file.
- `.env.example` and `.gitignore` may appear as intended changes.

### Step 6: Load the file with Node''s built-in environment-file support

Assume the application entry point is `app.js`. Replace it if necessary.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Application-controlled; Node only loads the environment file
# Network/ports: Application-controlled
# Downloads code: No
# Replace: Replace app.js with the real entry point
node --env-file=.env app.js
```

Expected result: the application reads values through `process.env`.

Do not print secret values to prove they loaded. Verify a non-secret outcome, such as a successful authenticated health request, while redacting logs.

### Step 7: Stage only safe files and inspect the exact diff

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Stages only .gitignore and .env.example in the local Git index
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git add .gitignore .env.example
git diff --cached
```

Expected output: only ignore rules and placeholders. Stop and unstage if a real value appears.

Avoid `git add .` while establishing secret handling.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `git check-ignore -v .env` | Shows the `.gitignore` rule. | Inspection only. |
| `git status --short` | Real `.env` absent; example file visible if new. | Inspection only. |
| `git diff --cached` | Contains no real credentials. | Inspection only. |
| `node --env-file=.env app.js` | App starts without logging secrets. | Application may open ports or contact services. |

## Security checks

- Enable GitHub push protection where available.
- Store production credentials in the deployment platform''s secret store.
- Use separate credentials for local, staging, and production environments.
- Give credentials the minimum permissions and a short lifetime where possible.
- Rotate credentials periodically and immediately after suspected exposure.
- Do not prefix server secrets with framework conventions that expose values to browser bundles, such as public-client environment prefixes.
- Review logs and error reporting for accidental secret values.
- Keep `.env.example` syntactically useful but semantically fake.

## Common errors

### `.env` still appears in `git status`

The file may already be tracked. Ignoring a tracked file does not remove it from the index. Do not proceed until you determine whether it contains a real secret. If no secret has ever been committed, remove it from tracking with a reviewed `git rm --cached .env` change.

### GitHub blocks the push

Treat the alert seriously. Remove the secret from every affected commit and rotate a real credential. Do not bypass protection merely to finish the push.

### Environment variables are `undefined`

Check the file path, variable spelling, entry-point command, and Node version. Existing process environment values override values from the file when names collide.

## How to undo or remove it

To unstage the safe configuration files without deleting them:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Removes the named files from the staging index; files remain on disk
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git restore --staged .gitignore .env.example
```

Delete the local `.env` only after confirming the application no longer needs it and that the credentials have been preserved or revoked appropriately.

## What to do next

Configure secrets in the deployment platform, enable push protection, and add a secret-scanning check to CI.

## Sources

- [Node.js environment variables](https://nodejs.org/api/environment_variables.html) — Node''s `.env` format and `process.env`.
- [Node.js command-line environment files](https://nodejs.org/api/cli.html) — Stable `--env-file` behaviour.
- [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) — Blocking supported secrets before they reach a repository.
- [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) — Rotation, history cleanup, ignore rules, and safer staging.',
      '{"frontmatter":{"title":"Keep API keys and secrets out of a Node.js Git repository","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","node":"24.18.0 LTS","git":"2.55.0","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"false","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository","relationship":"security-source","- name":"Removing sensitive data from a repository"},"body":"# Keep API keys and secrets out of a Node.js Git repository\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a safe pattern for local environment variables, ignore real `.env` files, commit only a placeholder example, and verify that Git will not stage the secret file.\n\n## Who this is for\n\nThis guide is for Node.js developers who need API keys, database URLs, signing secrets, or other runtime configuration.\n\nIt does not set up a production secret manager. Production systems should use the hosting provider''s secret store or a dedicated vault rather than uploading a local `.env` file.\n\n## Requirements and expected cost\n\n- A Git repository.\n- Node.js 24 LTS.\n- Git for Windows.\n- Cost: free.\n\n## Tested environment and version scope\n\nNode''s built-in dotenv support and `--env-file` option are stable in the reviewed Node versions. The Git controls are version-independent.\n\n## Before you begin\n\nA secret already committed to Git must be treated as exposed. Removing the text from the latest file is not enough; rotate or revoke the credential first, then follow a dedicated history-cleaning procedure.\n\nNever place a real credential in `.env.example`, screenshots, issue text, AI prompts, terminal recordings, or build logs.\n\n## Step-by-step instructions\n\n### Step 1: Confirm you are in the intended repository\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit rev-parse --show-toplevel\ngit status --short --branch\n```\n\nExpected output: the intended repository path and branch.\n\n### Step 2: Add environment files to `.gitignore`\n\nOpen or create `.gitignore` in the repository root and add:\n\n```gitignore\n# File-write safety record:\n# OS: Any; file: repository-root .gitignore\n# Writes/deletes: Adds ignore patterns; does not delete files\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\n\n.env\n.env.*\n!.env.example\n```\n\nThis ignores `.env` and variants such as `.env.local`, while allowing a deliberately sanitised `.env.example`.\n\nDo not use `!.env.production` or another exception for a file containing real production secrets.\n\n### Step 3: Create a placeholder `.env.example`\n\nCreate `.env.example` with names and non-secret placeholders:\n\n```dotenv\n# File-write safety record:\n# OS: Any; file: repository-root .env.example\n# Writes/deletes: Creates a shareable example configuration file\n# Network/ports: None\n# Downloads code: No\n# Replace: Change variable names to match the application; never insert real values\n\nAPI_BASE_URL=https://api.example.invalid\nAPI_KEY=replace-with-local-secret\nDATABASE_URL=replace-with-local-connection-string\n```\n\nDocument whether each value is required, where it is obtained, and whether it is safe for browser exposure.\n\n### Step 4: Create the real local `.env`\n\nCreate `.env` locally with the real values. Do not stage or share it.\n\n```dotenv\n# File-write safety record:\n# OS: Any; file: repository-root .env\n# Writes/deletes: Creates a local secret-bearing file\n# Network/ports: None\n# Downloads code: No\n# Replace: Replace every value with the correct local credential\n\nAPI_BASE_URL=https://actual-service.example\nAPI_KEY=YOUR_REAL_LOCAL_SECRET\nDATABASE_URL=YOUR_REAL_LOCAL_CONNECTION_STRING\n```\n\nRestrict who can read the workstation account and folder. `.gitignore` prevents normal Git staging; it does not encrypt the file or protect it from malware, backups, other local users, or tools with filesystem access.\n\n### Step 5: Verify that Git ignores the real file\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit check-ignore -v .env\ngit status --short\n```\n\nExpected output:\n\n- `git check-ignore` identifies the matching `.gitignore` rule.\n- `.env` does not appear as an untracked or staged file.\n- `.env.example` and `.gitignore` may appear as intended changes.\n\n### Step 6: Load the file with Node''s built-in environment-file support\n\nAssume the application entry point is `app.js`. Replace it if necessary.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Application-controlled; Node only loads the environment file\n# Network/ports: Application-controlled\n# Downloads code: No\n# Replace: Replace app.js with the real entry point\nnode --env-file=.env app.js\n```\n\nExpected result: the application reads values through `process.env`.\n\nDo not print secret values to prove they loaded. Verify a non-secret outcome, such as a successful authenticated health request, while redacting logs.\n\n### Step 7: Stage only safe files and inspect the exact diff\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Stages only .gitignore and .env.example in the local Git index\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit add .gitignore .env.example\ngit diff --cached\n```\n\nExpected output: only ignore rules and placeholders. Stop and unstage if a real value appears.\n\nAvoid `git add .` while establishing secret handling.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `git check-ignore -v .env` | Shows the `.gitignore` rule. | Inspection only. |\n| `git status --short` | Real `.env` absent; example file visible if new. | Inspection only. |\n| `git diff --cached` | Contains no real credentials. | Inspection only. |\n| `node --env-file=.env app.js` | App starts without logging secrets. | Application may open ports or contact services. |\n\n## Security checks\n\n- Enable GitHub push protection where available.\n- Store production credentials in the deployment platform''s secret store.\n- Use separate credentials for local, staging, and production environments.\n- Give credentials the minimum permissions and a short lifetime where possible.\n- Rotate credentials periodically and immediately after suspected exposure.\n- Do not prefix server secrets with framework conventions that expose values to browser bundles, such as public-client environment prefixes.\n- Review logs and error reporting for accidental secret values.\n- Keep `.env.example` syntactically useful but semantically fake.\n\n## Common errors\n\n### `.env` still appears in `git status`\n\nThe file may already be tracked. Ignoring a tracked file does not remove it from the index. Do not proceed until you determine whether it contains a real secret. If no secret has ever been committed, remove it from tracking with a reviewed `git rm --cached .env` change.\n\n### GitHub blocks the push\n\nTreat the alert seriously. Remove the secret from every affected commit and rotate a real credential. Do not bypass protection merely to finish the push.\n\n### Environment variables are `undefined`\n\nCheck the file path, variable spelling, entry-point command, and Node version. Existing process environment values override values from the file when names collide.\n\n## How to undo or remove it\n\nTo unstage the safe configuration files without deleting them:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Removes the named files from the staging index; files remain on disk\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit restore --staged .gitignore .env.example\n```\n\nDelete the local `.env` only after confirming the application no longer needs it and that the credentials have been preserved or revoked appropriately.\n\n## What to do next\n\nConfigure secrets in the deployment platform, enable push protection, and add a secret-scanning check to CI.\n\n## Sources\n\n- [Node.js environment variables](https://nodejs.org/api/environment_variables.html) — Node''s `.env` format and `process.env`.\n- [Node.js command-line environment files](https://nodejs.org/api/cli.html) — Stable `--env-file` behaviour.\n- [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) — Blocking supported secrets before they reach a repository.\n- [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) — Rotation, history cleanup, ignore rules, and safer staging."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 07-install-cloudflare-wrangler-securely.md → guide-install-cloudflare-wrangler-locally-and-store-login-credentials-securely-26aee61e
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-cloudflare-wrangler-locally-and-store-login-credentials-securely-26aee61e',
      'install-cloudflare-wrangler-locally-and-store-login-credentials-securely',
      'Install Cloudflare Wrangler locally and store login credentials securely',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 11"]',
      NULL,
      'Free to install; Cloudflare plan limits may apply',
      0,
      1,
      1,
      0,
      1,
      '# Install Cloudflare Wrangler locally and store login credentials securely

**Status:** Draft — not published or indexed.

## What you will achieve

You will install Wrangler as a project dependency, authenticate through Cloudflare OAuth, store the credential encryption key in Windows Credential Manager, and verify the account without deploying anything.

## Who this is for

This guide is for developers working with Cloudflare Workers, Pages, D1, KV, R2, Queues, or other supported developer-platform services.

It assumes an existing Node project. It does not create or deploy a Worker.

## Requirements and expected cost

- Windows 11. Cloudflare''s current Wrangler documentation lists Windows 11 as the supported Windows platform.
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

Expected result: only the intended Wrangler dependency and lockfile changes. Wrangler''s user credentials must not appear in the repository.

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

The callback to `localhost:8976` may be blocked by a firewall, browser isolation, container, or remote-session boundary. Keep the command open and follow Cloudflare''s remote-machine callback instructions.

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
# Writes/deletes: Removes Wrangler''s stored OAuth session for the current profile
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
- [Cloudflare Workers changelog](https://developers.cloudflare.com/changelog/product/workers/) — Windows Credential Manager support and encrypted credential storage.',
      '{"frontmatter":{"title":"Install Cloudflare Wrangler locally and store login credentials securely","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 11"],"tested_versions":"","node":"24.18.0 LTS","wrangler":"4.x","estimated_cost":"Free to install; Cloudflare plan limits may apply","destructive_steps":"false","network_exposure":"true","credentials_required":"true","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://developers.cloudflare.com/changelog/product/workers/","relationship":"security-source","- name":"Cloudflare Workers changelog — keychain credentials"},"body":"# Install Cloudflare Wrangler locally and store login credentials securely\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will install Wrangler as a project dependency, authenticate through Cloudflare OAuth, store the credential encryption key in Windows Credential Manager, and verify the account without deploying anything.\n\n## Who this is for\n\nThis guide is for developers working with Cloudflare Workers, Pages, D1, KV, R2, Queues, or other supported developer-platform services.\n\nIt assumes an existing Node project. It does not create or deploy a Worker.\n\n## Requirements and expected cost\n\n- Windows 11. Cloudflare''s current Wrangler documentation lists Windows 11 as the supported Windows platform.\n- Node.js 24 LTS and npm.\n- A Cloudflare account.\n- A project directory containing `package.json`.\n- Internet access.\n- Cost: Wrangler is free; deployed resources are subject to Cloudflare plan limits.\n\n## Tested environment and version scope\n\nThe guide targets current Wrangler 4.x. Cloudflare recommends local, per-project installation so teams can control versions and roll back.\n\n## Before you begin\n\nCommit or back up `package.json` and the lockfile. Review which Cloudflare account you intend to authorise.\n\nThe OAuth login normally opens a temporary loopback callback listener on `localhost:8976`. This is not a public application endpoint, but local security software may prompt about it.\n\nCloudflare documents that plaintext credential storage remains the default unless `--use-keyring` is selected. This guide explicitly opts into the encrypted/keychain path.\n\n## Step-by-step instructions\n\n### Step 1: Confirm the project and runtime\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root containing package.json\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnode --version\nnpm --version\nTest-Path .\\package.json\ngit status --short --branch\n```\n\nExpected output: Node 24.x, npm 11.x, `True` for `package.json`, and the expected Git branch.\n\n### Step 2: Install Wrangler locally\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Adds Wrangler to node_modules, package.json devDependencies, and the lockfile\n# Network/ports: Outbound HTTPS to npm registry; no listening port opened\n# Downloads code: Yes, npm packages and executable tooling\n# Replace: Nothing\nnpm install --save-dev wrangler@latest\n```\n\nExpected output: Wrangler added as a development dependency.\n\nReview the resulting `package.json` and lockfile changes before committing.\n\n### Step 3: Verify the project-local version\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: May write npm cache data; project files unchanged\n# Network/ports: Normally none when the local package is installed\n# Downloads code: No additional package expected\n# Replace: Nothing\nnpx wrangler --version\n```\n\nExpected output: a Wrangler 4.x version.\n\nIf Wrangler was not installed locally, `npx wrangler` may fetch the latest package dynamically. Confirm `npm ls wrangler` before accepting that behaviour.\n\n### Step 4: Authenticate using the Windows keychain option\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Stores encrypted OAuth data in Wrangler config and an encryption key in Windows Credential Manager\n# Network/ports: Outbound HTTPS to Cloudflare; temporary loopback callback on localhost:8976\n# Downloads code: May download the Windows keyring binding on first use\n# Replace: Nothing\nnpx wrangler login --use-keyring\n```\n\nExpected result: a browser opens to Cloudflare. Review the account and scopes, authorise the login, then return to the terminal.\n\nDo not paste a global API key into source files as an alternative.\n\n### Step 5: Verify the authenticated identity and credential storage\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: Outbound HTTPS to Cloudflare; no listening port expected\n# Downloads code: No\n# Replace: Nothing\nnpx wrangler whoami\n```\n\nExpected output:\n\n- the authenticated account or user;\n- OAuth authentication;\n- a message indicating encrypted credential storage with the key in Windows Credential Manager.\n\nStop if the displayed account is not the intended one.\n\n### Step 6: Inspect changes before committing\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit status --short\ngit diff -- package.json package-lock.json\n```\n\nExpected result: only the intended Wrangler dependency and lockfile changes. Wrangler''s user credentials must not appear in the repository.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `npm ls wrangler` | Shows one project-local Wrangler version. | Inspection only. |\n| `npx wrangler --version` | Wrangler 4.x. | Executes local CLI. |\n| `npx wrangler whoami` | Intended Cloudflare identity and encrypted/keychain storage. | Outbound authenticated read. |\n| `git status --short` | Only intentional dependency changes. | Inspection only. |\n\n## Security checks\n\n- Prefer project-local Wrangler rather than a mutable global install.\n- Use `--use-keyring` for interactive OAuth credentials.\n- Use narrowly scoped API tokens for CI rather than copying interactive credentials.\n- Never commit `CLOUDFLARE_API_TOKEN`, account keys, or Wrangler credential files.\n- Review the target account before any deployment.\n- Do not run `npx wrangler deploy` from an unfamiliar project without inspecting configuration, build scripts, bindings, routes, and generated changes.\n- Use separate Cloudflare accounts or scoped tokens for development and production where practical.\n- Treat `wrangler dev` as code execution; it may open a local port and access configured bindings.\n\n## Common errors\n\n### Browser login succeeds but the terminal hangs\n\nThe callback to `localhost:8976` may be blocked by a firewall, browser isolation, container, or remote-session boundary. Keep the command open and follow Cloudflare''s remote-machine callback instructions.\n\n### `wrangler` is not found\n\nUse `npx wrangler`, not a bare global command, and verify `npm ls wrangler`.\n\n### `whoami` shows plaintext credential storage\n\nLog out and repeat login with `--use-keyring`. Confirm the current Wrangler version supports the option and that Windows Credential Manager is available.\n\n### Node version is unsupported\n\nUse a Node release classified by Cloudflare as Current, Active, or Maintenance, and use Windows 11 for current supported Wrangler operation.\n\n## How to undo or remove it\n\nLog out first:\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Removes Wrangler''s stored OAuth session for the current profile\n# Network/ports: May contact Cloudflare to revoke or end the session\n# Downloads code: No\n# Replace: Nothing\nnpx wrangler logout\n```\n\nThen remove the project dependency:\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Removes Wrangler from node_modules and updates package.json and lockfile\n# Network/ports: npm may contact the configured registry\n# Downloads code: No\n# Replace: Nothing\nnpm uninstall --save-dev wrangler\n```\n\nReview the Git diff before committing the rollback.\n\n## What to do next\n\nCreate a separate guide-driven Worker project or add a reviewed `wrangler.jsonc`, then use `wrangler dev` locally before considering deployment.\n\n## Sources\n\n- [Install and update Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) — Supported platforms, Node support, and local installation.\n- [Wrangler general commands](https://developers.cloudflare.com/workers/wrangler/commands/general/) — OAuth login, callback port, keychain option, `whoami`, and credential storage.\n- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/) — Project-local command execution.\n- [Cloudflare Workers changelog](https://developers.cloudflare.com/changelog/product/workers/) — Windows Credential Manager support and encrypted credential storage."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 08-install-ollama-windows-safely.md → guide-install-ollama-on-windows-and-run-a-local-model-without-lan-exposure-fbba8892
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-ollama-on-windows-and-run-a-local-model-without-lan-exposure-fbba8892',
      'install-ollama-on-windows-and-run-a-local-model-without-lan-exposure',
      'Install Ollama on Windows and run a local model without LAN exposure',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free software; electricity and hardware costs apply',
      0,
      1,
      0,
      0,
      1,
      '# Install Ollama on Windows and run a local model without LAN exposure

**Status:** Draft — not published or indexed.

## What you will achieve

You will install Ollama as a native Windows application, verify that its unauthenticated local API listens only on loopback, download a small model, and run a local prompt.

## Who this is for

This guide is for Windows users who want to experiment with local language models.

It is not a guide for exposing Ollama to a LAN, the public internet, a reverse proxy, a tunnel, or a production application.

## Requirements and expected cost

- Windows 10 22H2 or newer, or Windows 11.
- At least 4 GB for the application plus additional space for models.
- More RAM or VRAM than the model file size may be needed during inference.
- Internet access for installation and model download.
- Cost: software and local model downloads are free; hardware and electricity are not.

A dedicated GPU can improve speed, but supported CPU inference is possible for small models.

## Tested environment and version scope

The guide follows current Ollama Windows documentation. Ollama updates regularly, so the installed version is intentionally not pinned here.

## Before you begin

Ollama''s local API at `http://localhost:11434` does not require authentication. That is acceptable only while it remains restricted to the local machine and the device itself is trusted.

Do not set `OLLAMA_HOST=0.0.0.0:11434` for this guide. Do not create a tunnel or firewall rule.

Check available storage before selecting a model.

## Step-by-step instructions

### Step 1: Inspect the WinGet package

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May refresh WinGet metadata; no Ollama installation
# Network/ports: Outbound HTTPS; no listening port opened
# Downloads code: Package metadata only
# Replace: Nothing
winget show --id Ollama.Ollama --exact --source winget
```

Expected output: Ollama package details. Confirm that the installer source is associated with Ollama''s official distribution.

### Step 2: Install Ollama

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Ollama''s normal per-user install does not require admin
# Writes/deletes: Installs Ollama under the user profile, adds PATH, and registers a background login item
# Network/ports: Outbound HTTPS for installer; after launch, local API listens on 127.0.0.1:11434
# Downloads code: Yes, executable application
# Replace: Nothing
winget install --id Ollama.Ollama --exact --source winget
```

Expected output: installation succeeded. Start Ollama from the Start menu if it does not start automatically.

### Step 3: Verify the CLI and local API

Open a new PowerShell window.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: Queries the local loopback API only
# Downloads code: No
# Replace: Nothing
ollama --version
Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get
```

Expected output: an Ollama version and a local model-list response.

### Step 4: Confirm the listener is loopback-only

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: Inspects local TCP listener state; opens no port
# Downloads code: No
# Replace: Nothing
Get-NetTCPConnection -LocalPort 11434 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Expected output: `LocalAddress` is `127.0.0.1` or another loopback representation, not `0.0.0.0`, `::`, or a LAN address.

Also inspect whether a user-level override exists:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
[Environment]::GetEnvironmentVariable("OLLAMA_HOST", "User")
```

Expected output: blank for the default loopback configuration.

### Step 5: Download and run a small model

This example uses `gemma3:1b`, which is intended as a relatively small starting point. Model availability and requirements can change.

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Downloads and stores model files under the Ollama model directory
# Network/ports: Outbound HTTPS to Ollama model services; local API remains on loopback
# Downloads code: Downloads model weights that Ollama will execute
# Replace: You may choose another reviewed model appropriate for your hardware
ollama run gemma3:1b "Reply with exactly: local model working"
```

Expected output: `local model working`, allowing for minor formatting differences.

The first run may take time while the model downloads.

### Step 6: Inspect loaded-model resource use

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Network/ports: Queries the local Ollama service
# Downloads code: No
# Replace: Nothing
ollama ps
```

Expected output: model name, size, processor placement, and unload timing.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `ollama --version` | Installed Ollama version. | Inspection only. |
| `Invoke-RestMethod http://localhost:11434/api/tags` | Local API response. | Loopback request; no authentication. |
| `Get-NetTCPConnection -LocalPort 11434` | Listener bound only to loopback. | Inspection only. |
| `ollama ps` | Loaded model and CPU/GPU placement. | Local API query. |

## Security checks

- Keep the API bound to `127.0.0.1`.
- Remember that the local API has no authentication.
- Do not expose port 11434 through Windows Firewall, router forwarding, ngrok, Cloudflare Tunnel, or a reverse proxy without a separate authenticated security design.
- Treat downloaded model files as executable supply-chain inputs.
- Review the model licence and provenance.
- Do not assume local execution makes prompts safe from every local process or malware.
- Avoid entering production secrets into experimental models or plugins.
- Disable Ollama in **Task Manager → Startup apps** if it should not run after login.
- Keep Windows, GPU drivers, and Ollama updated.

## Common errors

### `ollama` is not recognized

Restart PowerShell. Confirm Ollama appears in Installed apps and inspect `%LOCALAPPDATA%\Programs\Ollama`.

### Port 11434 is not listening

Start Ollama from the Start menu and inspect `%LOCALAPPDATA%\Ollama\server.log`.

### Model is extremely slow or fails to load

Use a smaller model, reduce context requirements, close other GPU workloads, and check `ollama ps`. Model size, context, parallel requests, RAM, and VRAM all affect memory use.

### Listener shows `0.0.0.0`

Stop Ollama and remove or correct the `OLLAMA_HOST` environment variable. Restart the application and verify again before using it.

## How to undo or remove it

Remove the downloaded model if desired:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Permanently deletes the named model files
# Network/ports: Uses the local Ollama service
# Downloads code: No
# Replace: Replace gemma3:1b if you used another model
ollama rm gemma3:1b
```

Uninstall Ollama through Windows Settings. If you changed `OLLAMA_MODELS`, the installer may not remove that model directory; inspect it manually before deletion.

## What to do next

Benchmark two small models on representative tasks, record memory and speed, and connect only a trusted local application to the loopback API.

## Sources

- [Ollama for Windows](https://docs.ollama.com/windows) — Windows requirements, installation paths, local API, storage, and uninstall behaviour.
- [Ollama FAQ](https://docs.ollama.com/faq) — Default loopback binding, environment variables, context, concurrency, and network exposure.
- [Ollama authentication](https://docs.ollama.com/api/authentication) — No authentication for the local API.
- [Ollama hardware support](https://docs.ollama.com/gpu) — Supported GPU families and driver considerations.',
      '{"frontmatter":{"title":"Install Ollama on Windows and run a local model without LAN exposure","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","ollama":"Current Windows app as of 2026-07-19","estimated_cost":"Free software; electricity and hardware costs apply","destructive_steps":"false","network_exposure":"true","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.ollama.com/gpu","relationship":"requirements-source","- name":"Ollama hardware support"},"body":"# Install Ollama on Windows and run a local model without LAN exposure\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will install Ollama as a native Windows application, verify that its unauthenticated local API listens only on loopback, download a small model, and run a local prompt.\n\n## Who this is for\n\nThis guide is for Windows users who want to experiment with local language models.\n\nIt is not a guide for exposing Ollama to a LAN, the public internet, a reverse proxy, a tunnel, or a production application.\n\n## Requirements and expected cost\n\n- Windows 10 22H2 or newer, or Windows 11.\n- At least 4 GB for the application plus additional space for models.\n- More RAM or VRAM than the model file size may be needed during inference.\n- Internet access for installation and model download.\n- Cost: software and local model downloads are free; hardware and electricity are not.\n\nA dedicated GPU can improve speed, but supported CPU inference is possible for small models.\n\n## Tested environment and version scope\n\nThe guide follows current Ollama Windows documentation. Ollama updates regularly, so the installed version is intentionally not pinned here.\n\n## Before you begin\n\nOllama''s local API at `http://localhost:11434` does not require authentication. That is acceptable only while it remains restricted to the local machine and the device itself is trusted.\n\nDo not set `OLLAMA_HOST=0.0.0.0:11434` for this guide. Do not create a tunnel or firewall rule.\n\nCheck available storage before selecting a model.\n\n## Step-by-step instructions\n\n### Step 1: Inspect the WinGet package\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May refresh WinGet metadata; no Ollama installation\n# Network/ports: Outbound HTTPS; no listening port opened\n# Downloads code: Package metadata only\n# Replace: Nothing\nwinget show --id Ollama.Ollama --exact --source winget\n```\n\nExpected output: Ollama package details. Confirm that the installer source is associated with Ollama''s official distribution.\n\n### Step 2: Install Ollama\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Ollama''s normal per-user install does not require admin\n# Writes/deletes: Installs Ollama under the user profile, adds PATH, and registers a background login item\n# Network/ports: Outbound HTTPS for installer; after launch, local API listens on 127.0.0.1:11434\n# Downloads code: Yes, executable application\n# Replace: Nothing\nwinget install --id Ollama.Ollama --exact --source winget\n```\n\nExpected output: installation succeeded. Start Ollama from the Start menu if it does not start automatically.\n\n### Step 3: Verify the CLI and local API\n\nOpen a new PowerShell window.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: Queries the local loopback API only\n# Downloads code: No\n# Replace: Nothing\nollama --version\nInvoke-RestMethod -Uri \"http://localhost:11434/api/tags\" -Method Get\n```\n\nExpected output: an Ollama version and a local model-list response.\n\n### Step 4: Confirm the listener is loopback-only\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: Inspects local TCP listener state; opens no port\n# Downloads code: No\n# Replace: Nothing\nGet-NetTCPConnection -LocalPort 11434 -State Listen |\n  Select-Object LocalAddress, LocalPort, OwningProcess\n```\n\nExpected output: `LocalAddress` is `127.0.0.1` or another loopback representation, not `0.0.0.0`, `::`, or a LAN address.\n\nAlso inspect whether a user-level override exists:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\n[Environment]::GetEnvironmentVariable(\"OLLAMA_HOST\", \"User\")\n```\n\nExpected output: blank for the default loopback configuration.\n\n### Step 5: Download and run a small model\n\nThis example uses `gemma3:1b`, which is intended as a relatively small starting point. Model availability and requirements can change.\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Downloads and stores model files under the Ollama model directory\n# Network/ports: Outbound HTTPS to Ollama model services; local API remains on loopback\n# Downloads code: Downloads model weights that Ollama will execute\n# Replace: You may choose another reviewed model appropriate for your hardware\nollama run gemma3:1b \"Reply with exactly: local model working\"\n```\n\nExpected output: `local model working`, allowing for minor formatting differences.\n\nThe first run may take time while the model downloads.\n\n### Step 6: Inspect loaded-model resource use\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: Queries the local Ollama service\n# Downloads code: No\n# Replace: Nothing\nollama ps\n```\n\nExpected output: model name, size, processor placement, and unload timing.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `ollama --version` | Installed Ollama version. | Inspection only. |\n| `Invoke-RestMethod http://localhost:11434/api/tags` | Local API response. | Loopback request; no authentication. |\n| `Get-NetTCPConnection -LocalPort 11434` | Listener bound only to loopback. | Inspection only. |\n| `ollama ps` | Loaded model and CPU/GPU placement. | Local API query. |\n\n## Security checks\n\n- Keep the API bound to `127.0.0.1`.\n- Remember that the local API has no authentication.\n- Do not expose port 11434 through Windows Firewall, router forwarding, ngrok, Cloudflare Tunnel, or a reverse proxy without a separate authenticated security design.\n- Treat downloaded model files as executable supply-chain inputs.\n- Review the model licence and provenance.\n- Do not assume local execution makes prompts safe from every local process or malware.\n- Avoid entering production secrets into experimental models or plugins.\n- Disable Ollama in **Task Manager → Startup apps** if it should not run after login.\n- Keep Windows, GPU drivers, and Ollama updated.\n\n## Common errors\n\n### `ollama` is not recognized\n\nRestart PowerShell. Confirm Ollama appears in Installed apps and inspect `%LOCALAPPDATA%\\Programs\\Ollama`.\n\n### Port 11434 is not listening\n\nStart Ollama from the Start menu and inspect `%LOCALAPPDATA%\\Ollama\\server.log`.\n\n### Model is extremely slow or fails to load\n\nUse a smaller model, reduce context requirements, close other GPU workloads, and check `ollama ps`. Model size, context, parallel requests, RAM, and VRAM all affect memory use.\n\n### Listener shows `0.0.0.0`\n\nStop Ollama and remove or correct the `OLLAMA_HOST` environment variable. Restart the application and verify again before using it.\n\n## How to undo or remove it\n\nRemove the downloaded model if desired:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Permanently deletes the named model files\n# Network/ports: Uses the local Ollama service\n# Downloads code: No\n# Replace: Replace gemma3:1b if you used another model\nollama rm gemma3:1b\n```\n\nUninstall Ollama through Windows Settings. If you changed `OLLAMA_MODELS`, the installer may not remove that model directory; inspect it manually before deletion.\n\n## What to do next\n\nBenchmark two small models on representative tasks, record memory and speed, and connect only a trusted local application to the loopback API.\n\n## Sources\n\n- [Ollama for Windows](https://docs.ollama.com/windows) — Windows requirements, installation paths, local API, storage, and uninstall behaviour.\n- [Ollama FAQ](https://docs.ollama.com/faq) — Default loopback binding, environment variables, context, concurrency, and network exposure.\n- [Ollama authentication](https://docs.ollama.com/api/authentication) — No authentication for the local API.\n- [Ollama hardware support](https://docs.ollama.com/gpu) — Supported GPU families and driver considerations."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 09-build-local-mcp-server-typescript.md → guide-build-and-inspect-a-minimal-local-mcp-server-with-typescript-dbface3d
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-build-and-inspect-a-minimal-local-mcp-server-with-typescript-dbface3d',
      'build-and-inspect-a-minimal-local-mcp-server-with-typescript',
      'Build and inspect a minimal local MCP server with TypeScript',
      'development-tools',
      'advanced',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free',
      0,
      1,
      0,
      0,
      1,
      '# Build and inspect a minimal local MCP server with TypeScript

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a local Model Context Protocol server using the TypeScript SDK, expose one non-destructive `echo` tool over standard input/output, and test it with the official MCP Inspector.

## Who this is for

This guide is for developers already comfortable with Node.js, npm, TypeScript, terminals, and basic JSON schemas.

It does not create a remote HTTP server, authentication system, filesystem tool, shell tool, or production MCP deployment.

## Requirements and expected cost

- Node.js 24 LTS.
- npm.
- Git is optional.
- An internet connection for npm packages.
- Cost: free.

The MCP Inspector launches a local web interface and proxy. Keep it on loopback and close it after testing.

## Tested environment and version scope

The guide uses the MCP TypeScript SDK v1 documentation, `McpServer`, `StdioServerTransport`, and Zod schemas.

## Before you begin

Use a new empty folder. Do not place this experiment inside a production repository.

The stdio transport reserves standard output for protocol messages. Do not add ordinary `console.log` calls to the server. Use standard error or structured MCP logging when diagnostics are needed.

## Step-by-step instructions

### Step 1: Create the project

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: A parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-mcp-hello and package.json
# Network/ports: None
# Downloads code: No
# Replace: You may replace trace-mcp-hello with another new folder name
New-Item -ItemType Directory -Path ".\trace-mcp-hello"
Set-Location ".\trace-mcp-hello"
npm init -y
```

Expected output: a new `package.json`.

### Step 2: Install runtime and development dependencies

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: Creates node_modules and package-lock.json; updates package.json
# Network/ports: Outbound HTTPS to npm registry
# Downloads code: Yes, SDK, schema library, TypeScript runtime, and type packages
# Replace: Nothing
npm install @modelcontextprotocol/sdk zod
npm install --save-dev typescript tsx @types/node @modelcontextprotocol/inspector
```

Expected output: packages installed successfully.

Review package names and the lockfile before continuing.

### Step 3: Configure ESM and scripts

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: Updates package.json fields
# Network/ports: None
# Downloads code: No
# Replace: Nothing
npm pkg set type=module
npm pkg set scripts.start="tsx server.ts"
npm pkg set scripts.inspect="mcp-inspector npx tsx server.ts"
```

Expected output: no output; `package.json` contains the new fields.

### Step 4: Create the MCP server

Create `server.ts` with this content:

```typescript
// File-write safety record:
// OS: Windows 10/11; file: trace-mcp-hello/server.ts
// Writes/deletes: Creates one local source file
// Network/ports: The server uses stdio and opens no network listener
// Downloads code: No
// Replace: Nothing

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "trace-mcp-hello",
  version: "1.0.0",
});

server.registerTool(
  "echo",
  {
    title: "Echo text",
    description: "Return exactly the text supplied by the caller.",
    inputSchema: {
      message: z.string().min(1).max(500),
    },
  },
  async ({ message }) => ({
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    structuredContent: {
      message,
    },
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

The tool has no filesystem, network, shell, credential, or write authority.

### Step 5: Run a TypeScript check

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: TypeScript may write cache data; no emitted JavaScript requested
# Network/ports: None
# Downloads code: No
# Replace: Nothing
npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 server.ts
```

Expected output: no TypeScript errors.

### Step 6: Start the server directly

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: None expected
# Network/ports: No network listener; stdio process waits for an MCP client
# Downloads code: No
# Replace: Nothing
npm start
```

Expected behaviour: the process waits without printing ordinary output. Stop it with `Ctrl+C`. Waiting silently is normal for a stdio server that has no connected client.

### Step 7: Inspect the server

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-hello
# Admin: Not required
# Writes/deletes: Inspector may write npm cache and local session data
# Network/ports: Opens an Inspector interface and proxy on loopback-only local ports
# Downloads code: No additional package expected because Inspector is installed locally
# Replace: Nothing
npm run inspect
```

Expected result: the MCP Inspector opens or displays a local URL.

In the Inspector:

1. Connect to the server.
2. Open the **Tools** section.
3. Select `echo`.
4. Enter a short message.
5. Invoke the tool.
6. Confirm that the response exactly matches the input.

Close the Inspector and terminal processes after testing.

## Verify success

| Command or action | Expected result | Safety record |
| --- | --- | --- |
| `npx tsc --noEmit ...` | No TypeScript errors. | Local inspection/compilation only. |
| `npm start` | Silent stdio server waits for a client. | No network listener. |
| `npm run inspect` | Local Inspector connects. | Opens loopback UI/proxy. |
| Invoke `echo` | Returned text matches supplied text. | No side effects. |

## Security checks

- Keep the first server on stdio.
- Do not write secrets or logs to stdout.
- Validate every tool argument with bounded schemas.
- Separate read tools from write or execution tools.
- Do not add shell, filesystem, network, payment, deployment, or deletion capabilities without explicit policy and approval.
- Treat tool descriptions, prompts, resources, and client-provided content as untrusted.
- If moving to Streamable HTTP, bind to loopback during development and use the SDK''s DNS-rebinding protections.
- Add authentication and resource-bound authorisation before remote deployment.
- Pin and review dependencies for production.
- Test with malformed, oversized, and unexpected arguments.

## Common errors

### Inspector cannot connect

Confirm the start command, working directory, and Node version. Run `npm start` separately to expose import or TypeScript errors.

### JSON-RPC parsing errors appear

Remove all `console.log` output from a stdio server. Diagnostic text on stdout corrupts the protocol stream.

### `structuredContent` causes a type error

SDK versions can differ. Keep the text `content` response and remove `structuredContent`, or add an explicit output schema according to the installed SDK documentation.

### Tool is missing

Confirm that `registerTool` executes before `server.connect` and that the Inspector connected to the intended command.

## How to undo or remove it

Stop the server and Inspector. Move to the parent folder, verify the name, and delete the experiment:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-mcp-hello
# Admin: Not required
# Writes/deletes: Permanently deletes the entire experimental project
# Network/ports: None after processes are stopped
# Downloads code: No
# Replace: Verify the folder name before running
Remove-Item -LiteralPath ".\trace-mcp-hello" -Recurse -Force
```

## What to do next

Add tests for invalid input, introduce one read-only resource, and document a risk class for every capability before connecting the server to an AI host.

## Sources

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) — Installation, transports, server and client concepts.
- [MCP TypeScript server documentation](https://ts.sdk.modelcontextprotocol.io/server) — `McpServer`, stdio, Streamable HTTP, and DNS-rebinding guidance.
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Official local server inspection workflow.
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) — Hosts, clients, servers, tools, resources, and prompts.
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — Prompt injection, token, session, and server risks.',
      '{"frontmatter":{"title":"Build and inspect a minimal local MCP server with TypeScript","category":"development-tools","difficulty":"advanced","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","node":"24.18.0 LTS","mcp_typescript_sdk":"v1 documentation","typescript":"Current npm release","estimated_cost":"Free","destructive_steps":"false","network_exposure":"true","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices","relationship":"security-source","- name":"MCP security best practices"},"body":"# Build and inspect a minimal local MCP server with TypeScript\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a local Model Context Protocol server using the TypeScript SDK, expose one non-destructive `echo` tool over standard input/output, and test it with the official MCP Inspector.\n\n## Who this is for\n\nThis guide is for developers already comfortable with Node.js, npm, TypeScript, terminals, and basic JSON schemas.\n\nIt does not create a remote HTTP server, authentication system, filesystem tool, shell tool, or production MCP deployment.\n\n## Requirements and expected cost\n\n- Node.js 24 LTS.\n- npm.\n- Git is optional.\n- An internet connection for npm packages.\n- Cost: free.\n\nThe MCP Inspector launches a local web interface and proxy. Keep it on loopback and close it after testing.\n\n## Tested environment and version scope\n\nThe guide uses the MCP TypeScript SDK v1 documentation, `McpServer`, `StdioServerTransport`, and Zod schemas.\n\n## Before you begin\n\nUse a new empty folder. Do not place this experiment inside a production repository.\n\nThe stdio transport reserves standard output for protocol messages. Do not add ordinary `console.log` calls to the server. Use standard error or structured MCP logging when diagnostics are needed.\n\n## Step-by-step instructions\n\n### Step 1: Create the project\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: A parent development folder\n# Admin: Not required\n# Writes/deletes: Creates trace-mcp-hello and package.json\n# Network/ports: None\n# Downloads code: No\n# Replace: You may replace trace-mcp-hello with another new folder name\nNew-Item -ItemType Directory -Path \".\\trace-mcp-hello\"\nSet-Location \".\\trace-mcp-hello\"\nnpm init -y\n```\n\nExpected output: a new `package.json`.\n\n### Step 2: Install runtime and development dependencies\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: trace-mcp-hello\n# Admin: Not required\n# Writes/deletes: Creates node_modules and package-lock.json; updates package.json\n# Network/ports: Outbound HTTPS to npm registry\n# Downloads code: Yes, SDK, schema library, TypeScript runtime, and type packages\n# Replace: Nothing\nnpm install @modelcontextprotocol/sdk zod\nnpm install --save-dev typescript tsx @types/node @modelcontextprotocol/inspector\n```\n\nExpected output: packages installed successfully.\n\nReview package names and the lockfile before continuing.\n\n### Step 3: Configure ESM and scripts\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: trace-mcp-hello\n# Admin: Not required\n# Writes/deletes: Updates package.json fields\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnpm pkg set type=module\nnpm pkg set scripts.start=\"tsx server.ts\"\nnpm pkg set scripts.inspect=\"mcp-inspector npx tsx server.ts\"\n```\n\nExpected output: no output; `package.json` contains the new fields.\n\n### Step 4: Create the MCP server\n\nCreate `server.ts` with this content:\n\n```typescript\n// File-write safety record:\n// OS: Windows 10/11; file: trace-mcp-hello/server.ts\n// Writes/deletes: Creates one local source file\n// Network/ports: The server uses stdio and opens no network listener\n// Downloads code: No\n// Replace: Nothing\n\nimport { McpServer } from \"@modelcontextprotocol/sdk/server/mcp.js\";\nimport { StdioServerTransport } from \"@modelcontextprotocol/sdk/server/stdio.js\";\nimport { z } from \"zod\";\n\nconst server = new McpServer({\n  name: \"trace-mcp-hello\",\n  version: \"1.0.0\",\n});\n\nserver.registerTool(\n  \"echo\",\n  {\n    title: \"Echo text\",\n    description: \"Return exactly the text supplied by the caller.\",\n    inputSchema: {\n      message: z.string().min(1).max(500),\n    },\n  },\n  async ({ message }) => ({\n    content: [\n      {\n        type: \"text\",\n        text: message,\n      },\n    ],\n    structuredContent: {\n      message,\n    },\n  }),\n);\n\nconst transport = new StdioServerTransport();\nawait server.connect(transport);\n```\n\nThe tool has no filesystem, network, shell, credential, or write authority.\n\n### Step 5: Run a TypeScript check\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: trace-mcp-hello\n# Admin: Not required\n# Writes/deletes: TypeScript may write cache data; no emitted JavaScript requested\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nnpx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 server.ts\n```\n\nExpected output: no TypeScript errors.\n\n### Step 6: Start the server directly\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: trace-mcp-hello\n# Admin: Not required\n# Writes/deletes: None expected\n# Network/ports: No network listener; stdio process waits for an MCP client\n# Downloads code: No\n# Replace: Nothing\nnpm start\n```\n\nExpected behaviour: the process waits without printing ordinary output. Stop it with `Ctrl+C`. Waiting silently is normal for a stdio server that has no connected client.\n\n### Step 7: Inspect the server\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: trace-mcp-hello\n# Admin: Not required\n# Writes/deletes: Inspector may write npm cache and local session data\n# Network/ports: Opens an Inspector interface and proxy on loopback-only local ports\n# Downloads code: No additional package expected because Inspector is installed locally\n# Replace: Nothing\nnpm run inspect\n```\n\nExpected result: the MCP Inspector opens or displays a local URL.\n\nIn the Inspector:\n\n1. Connect to the server.\n2. Open the **Tools** section.\n3. Select `echo`.\n4. Enter a short message.\n5. Invoke the tool.\n6. Confirm that the response exactly matches the input.\n\nClose the Inspector and terminal processes after testing.\n\n## Verify success\n\n| Command or action | Expected result | Safety record |\n| --- | --- | --- |\n| `npx tsc --noEmit ...` | No TypeScript errors. | Local inspection/compilation only. |\n| `npm start` | Silent stdio server waits for a client. | No network listener. |\n| `npm run inspect` | Local Inspector connects. | Opens loopback UI/proxy. |\n| Invoke `echo` | Returned text matches supplied text. | No side effects. |\n\n## Security checks\n\n- Keep the first server on stdio.\n- Do not write secrets or logs to stdout.\n- Validate every tool argument with bounded schemas.\n- Separate read tools from write or execution tools.\n- Do not add shell, filesystem, network, payment, deployment, or deletion capabilities without explicit policy and approval.\n- Treat tool descriptions, prompts, resources, and client-provided content as untrusted.\n- If moving to Streamable HTTP, bind to loopback during development and use the SDK''s DNS-rebinding protections.\n- Add authentication and resource-bound authorisation before remote deployment.\n- Pin and review dependencies for production.\n- Test with malformed, oversized, and unexpected arguments.\n\n## Common errors\n\n### Inspector cannot connect\n\nConfirm the start command, working directory, and Node version. Run `npm start` separately to expose import or TypeScript errors.\n\n### JSON-RPC parsing errors appear\n\nRemove all `console.log` output from a stdio server. Diagnostic text on stdout corrupts the protocol stream.\n\n### `structuredContent` causes a type error\n\nSDK versions can differ. Keep the text `content` response and remove `structuredContent`, or add an explicit output schema according to the installed SDK documentation.\n\n### Tool is missing\n\nConfirm that `registerTool` executes before `server.connect` and that the Inspector connected to the intended command.\n\n## How to undo or remove it\n\nStop the server and Inspector. Move to the parent folder, verify the name, and delete the experiment:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Parent of trace-mcp-hello\n# Admin: Not required\n# Writes/deletes: Permanently deletes the entire experimental project\n# Network/ports: None after processes are stopped\n# Downloads code: No\n# Replace: Verify the folder name before running\nRemove-Item -LiteralPath \".\\trace-mcp-hello\" -Recurse -Force\n```\n\n## What to do next\n\nAdd tests for invalid input, introduce one read-only resource, and document a risk class for every capability before connecting the server to an AI host.\n\n## Sources\n\n- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) — Installation, transports, server and client concepts.\n- [MCP TypeScript server documentation](https://ts.sdk.modelcontextprotocol.io/server) — `McpServer`, stdio, Streamable HTTP, and DNS-rebinding guidance.\n- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Official local server inspection workflow.\n- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) — Hosts, clients, servers, tools, resources, and prompts.\n- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — Prompt injection, token, session, and server risks."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 10-create-secure-node-github-actions-ci.md → guide-create-a-least-privilege-github-actions-ci-workflow-for-node-js-05ae7e81
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-create-a-least-privilege-github-actions-ci-workflow-for-node-js-05ae7e81',
      'create-a-least-privilege-github-actions-ci-workflow-for-node-js',
      'Create a least-privilege GitHub Actions CI workflow for Node.js',
      'development-tools',
      'advanced',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free within GitHub plan limits',
      0,
      0,
      1,
      0,
      1,
      '# Create a least-privilege GitHub Actions CI workflow for Node.js

**Status:** Draft — not published or indexed.

## What you will achieve

You will add a GitHub Actions workflow that checks out a Node.js repository, installs locked dependencies, runs audit and project checks, limits the workflow token to read-only repository content, and avoids storing checkout credentials after checkout.

## Who this is for

This guide is for maintainers of an existing Node.js repository hosted on GitHub.

It assumes the repository has a committed `package-lock.json`. It does not deploy, publish packages, access production secrets, or modify pull requests.

## Requirements and expected cost

- A GitHub repository.
- Write access to a branch.
- Git and Node.js locally.
- A valid `package-lock.json`.
- Existing test, lint, type-check, or build scripts are recommended.
- Cost: free within the repository''s GitHub Actions allowance.

## Tested environment and version scope

The workflow uses `actions/checkout@v6`, `actions/setup-node@v6`, Node 24, and `npm ci`.

GitHub recommends pinning third-party actions to full-length commit SHAs for immutable production use. This readable starter uses official major-version tags and records pinning as a required hardening follow-up.

## Before you begin

Read every existing workflow in `.github/workflows`. Workflows are privileged repository code.

Do not use `pull_request_target` for this starter. Do not add secrets. Do not interpolate pull-request titles, branch names, issue bodies, or other untrusted GitHub context values directly into shell scripts.

Commit or stash unrelated local changes.

## Step-by-step instructions

### Step 1: Verify the repository and scripts

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
Test-Path .\package-lock.json
npm pkg get scripts
```

Expected output: the intended branch, `True` for the lockfile, and the available npm scripts.

### Step 2: Create the workflow directory

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Creates .github/workflows if absent
# Network/ports: None
# Downloads code: No
# Replace: Nothing
New-Item -ItemType Directory -Path ".\.github\workflows" -Force
```

Expected output: the directory exists.

### Step 3: Create `.github/workflows/ci.yml`

```yaml
# File-write safety record:
# OS: Any; file: .github/workflows/ci.yml
# Writes/deletes: Creates a CI workflow that runs on GitHub-hosted runners
# Network/ports: Runner makes outbound requests for actions, Node, npm packages, and audit data
# Downloads code: Yes; actions and project dependencies execute on an ephemeral runner
# Credentials: Uses only a read-only GITHUB_TOKEN; no custom secrets
# Replace: Adjust script names only after checking package.json

name: CI

on:
  push:
    branches:
      - main
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Node.js checks
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Check out repository
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: "24"
          cache: "npm"

      - name: Install locked dependencies
        run: npm ci

      - name: Audit high-severity dependency findings
        run: npm audit --audit-level=high

      - name: Run tests when present
        run: npm run test --if-present

      - name: Run lint when present
        run: npm run lint --if-present

      - name: Run type-check when present
        run: npm run typecheck --if-present

      - name: Build when present
        run: npm run build --if-present
```

`npm ci` executes dependency lifecycle scripts. The runner is disposable and receives no custom secrets in this workflow, but dependency code can still make outbound requests and consume repository contents. Review the lockfile and dependencies.

### Step 4: Inspect the exact workflow diff

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git diff -- .github/workflows/ci.yml
```

Expected output: only the intended workflow.

### Step 5: Validate project commands locally

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: npm ci replaces node_modules; checks may write caches and build output
# Network/ports: Outbound npm registry and audit requests; project scripts may vary
# Downloads code: Yes, dependencies execute according to the lockfile
# Replace: Nothing
npm ci
npm audit --audit-level=high
npm run test --if-present
npm run lint --if-present
npm run typecheck --if-present
npm run build --if-present
```

Expected result: the same commands intended for CI complete locally.

### Step 6: Stage and inspect before committing

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Stages the workflow in the local Git index
# Network/ports: None
# Downloads code: No
# Replace: Nothing
git add .github/workflows/ci.yml
git diff --cached
```

Expected output: only the reviewed workflow.

### Step 7: Commit and push

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Creates a local commit and pushes it to the configured remote branch
# Network/ports: Outbound HTTPS or SSH to GitHub
# Downloads code: No
# Replace: Replace the commit message if your project uses another convention
git commit -m "ci: add least-privilege Node checks"
git push
```

Expected result: GitHub receives the commit and starts the CI workflow.

### Step 8: Review the first run

On GitHub:

1. Open the repository''s **Actions** tab.
2. Select the CI workflow.
3. Confirm the expected commit and event.
4. Inspect every step and warning.
5. Confirm that no secret values or unexpected network actions appear.
6. Require the check in branch protection only after it is stable.

## Verify success

| Check | Expected result | Safety record |
| --- | --- | --- |
| Workflow YAML is visible on GitHub | CI run starts on push or pull request. | Remote workflow execution. |
| Token permissions | `contents: read`; unspecified permissions are none. | Least-privilege token. |
| Checkout | Repository available; credentials not persisted. | Official action executes. |
| `npm ci` | Lockfile-consistent install. | Downloads and executes dependencies. |
| Audit and project scripts | Pass or produce actionable failures. | Project-controlled execution. |

## Security checks

- Keep `permissions` explicit and minimal.
- Do not add write permissions unless a specific job requires them.
- Avoid `pull_request_target` for untrusted pull-request code.
- Never inject untrusted context values directly into a `run` script.
- Pin actions to verified full commit SHAs for higher-assurance production use, and use Dependabot or another controlled update process.
- Prefer official actions with reviewed source.
- Do not expose secrets to workflows that run untrusted code.
- Use OpenID Connect and short-lived cloud credentials for future deployments instead of long-lived static keys.
- Set timeouts and concurrency limits.
- Review lockfile changes and consider dependency review on pull requests.
- Keep deployment in a separate workflow with separate permissions and environment approvals.

## Common errors

### `npm ci` reports a lockfile mismatch

Update the lockfile deliberately on a development branch using the correct package-manager flags, review the diff, and commit it. Do not replace `npm ci` with `npm install` in CI merely to hide drift.

### A script is missing

The workflow uses `--if-present`, so missing optional scripts should not fail. Check the exact npm version and script name if behaviour differs.

### Audit fails for a disputed or unreachable package

Review the advisory, dependency path, exploitability, and available fix. Do not suppress it without a documented decision.

### Workflow has unexpected write access

Check repository and organisation Actions defaults and the workflow `permissions` block. Specifying one permission sets unspecified permissions to none, but organisation policy can also constrain operation.

## How to undo or remove it

Delete the workflow file, review the change, commit, and push:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Deletes the CI workflow file and pushes the removal after commit
# Network/ports: Outbound HTTPS or SSH to GitHub during push
# Downloads code: No
# Replace: Nothing
Remove-Item -LiteralPath ".\.github\workflows\ci.yml"
git add .github/workflows/ci.yml
git diff --cached
git commit -m "ci: remove Node checks"
git push
```

Historical workflow logs and commits remain in GitHub history according to repository retention and Git history.

## What to do next

Pin action SHAs, add dependency review, make CI a required branch check, and create a separate approval-gated deployment workflow.

## Sources

- [Building and testing Node.js](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) — Official Node CI pattern.
- [Workflow syntax and permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — Token permissions, events, jobs, and workflow syntax.
- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — Immutable action pinning and action review.
- [actions/setup-node](https://github.com/actions/setup-node) — Node 24 setup, npm caching, and lockfile recommendations.
- [Script injections](https://docs.github.com/en/actions/concepts/security/script-injections) — Untrusted GitHub context and shell-injection risks.',
      '{"frontmatter":{"title":"Create a least-privilege GitHub Actions CI workflow for Node.js","category":"development-tools","difficulty":"advanced","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","node":"24.x LTS","actions_checkout":"v6","actions_setup_node":"v6","estimated_cost":"Free within GitHub plan limits","destructive_steps":"false","network_exposure":"false","credentials_required":"true","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.github.com/en/actions/concepts/security/script-injections","relationship":"security-source","- name":"Script injections"},"body":"# Create a least-privilege GitHub Actions CI workflow for Node.js\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will add a GitHub Actions workflow that checks out a Node.js repository, installs locked dependencies, runs audit and project checks, limits the workflow token to read-only repository content, and avoids storing checkout credentials after checkout.\n\n## Who this is for\n\nThis guide is for maintainers of an existing Node.js repository hosted on GitHub.\n\nIt assumes the repository has a committed `package-lock.json`. It does not deploy, publish packages, access production secrets, or modify pull requests.\n\n## Requirements and expected cost\n\n- A GitHub repository.\n- Write access to a branch.\n- Git and Node.js locally.\n- A valid `package-lock.json`.\n- Existing test, lint, type-check, or build scripts are recommended.\n- Cost: free within the repository''s GitHub Actions allowance.\n\n## Tested environment and version scope\n\nThe workflow uses `actions/checkout@v6`, `actions/setup-node@v6`, Node 24, and `npm ci`.\n\nGitHub recommends pinning third-party actions to full-length commit SHAs for immutable production use. This readable starter uses official major-version tags and records pinning as a required hardening follow-up.\n\n## Before you begin\n\nRead every existing workflow in `.github/workflows`. Workflows are privileged repository code.\n\nDo not use `pull_request_target` for this starter. Do not add secrets. Do not interpolate pull-request titles, branch names, issue bodies, or other untrusted GitHub context values directly into shell scripts.\n\nCommit or stash unrelated local changes.\n\n## Step-by-step instructions\n\n### Step 1: Verify the repository and scripts\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit status --short --branch\nTest-Path .\\package-lock.json\nnpm pkg get scripts\n```\n\nExpected output: the intended branch, `True` for the lockfile, and the available npm scripts.\n\n### Step 2: Create the workflow directory\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Creates .github/workflows if absent\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\nNew-Item -ItemType Directory -Path \".\\.github\\workflows\" -Force\n```\n\nExpected output: the directory exists.\n\n### Step 3: Create `.github/workflows/ci.yml`\n\n```yaml\n# File-write safety record:\n# OS: Any; file: .github/workflows/ci.yml\n# Writes/deletes: Creates a CI workflow that runs on GitHub-hosted runners\n# Network/ports: Runner makes outbound requests for actions, Node, npm packages, and audit data\n# Downloads code: Yes; actions and project dependencies execute on an ephemeral runner\n# Credentials: Uses only a read-only GITHUB_TOKEN; no custom secrets\n# Replace: Adjust script names only after checking package.json\n\nname: CI\n\non:\n  push:\n    branches:\n      - main\n  pull_request:\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: ci-${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n\njobs:\n  test:\n    name: Node.js checks\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n\n    steps:\n      - name: Check out repository\n        uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n\n      - name: Set up Node.js\n        uses: actions/setup-node@v6\n        with:\n          node-version: \"24\"\n          cache: \"npm\"\n\n      - name: Install locked dependencies\n        run: npm ci\n\n      - name: Audit high-severity dependency findings\n        run: npm audit --audit-level=high\n\n      - name: Run tests when present\n        run: npm run test --if-present\n\n      - name: Run lint when present\n        run: npm run lint --if-present\n\n      - name: Run type-check when present\n        run: npm run typecheck --if-present\n\n      - name: Build when present\n        run: npm run build --if-present\n```\n\n`npm ci` executes dependency lifecycle scripts. The runner is disposable and receives no custom secrets in this workflow, but dependency code can still make outbound requests and consume repository contents. Review the lockfile and dependencies.\n\n### Step 4: Inspect the exact workflow diff\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit diff -- .github/workflows/ci.yml\n```\n\nExpected output: only the intended workflow.\n\n### Step 5: Validate project commands locally\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: npm ci replaces node_modules; checks may write caches and build output\n# Network/ports: Outbound npm registry and audit requests; project scripts may vary\n# Downloads code: Yes, dependencies execute according to the lockfile\n# Replace: Nothing\nnpm ci\nnpm audit --audit-level=high\nnpm run test --if-present\nnpm run lint --if-present\nnpm run typecheck --if-present\nnpm run build --if-present\n```\n\nExpected result: the same commands intended for CI complete locally.\n\n### Step 6: Stage and inspect before committing\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Stages the workflow in the local Git index\n# Network/ports: None\n# Downloads code: No\n# Replace: Nothing\ngit add .github/workflows/ci.yml\ngit diff --cached\n```\n\nExpected output: only the reviewed workflow.\n\n### Step 7: Commit and push\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Creates a local commit and pushes it to the configured remote branch\n# Network/ports: Outbound HTTPS or SSH to GitHub\n# Downloads code: No\n# Replace: Replace the commit message if your project uses another convention\ngit commit -m \"ci: add least-privilege Node checks\"\ngit push\n```\n\nExpected result: GitHub receives the commit and starts the CI workflow.\n\n### Step 8: Review the first run\n\nOn GitHub:\n\n1. Open the repository''s **Actions** tab.\n2. Select the CI workflow.\n3. Confirm the expected commit and event.\n4. Inspect every step and warning.\n5. Confirm that no secret values or unexpected network actions appear.\n6. Require the check in branch protection only after it is stable.\n\n## Verify success\n\n| Check | Expected result | Safety record |\n| --- | --- | --- |\n| Workflow YAML is visible on GitHub | CI run starts on push or pull request. | Remote workflow execution. |\n| Token permissions | `contents: read`; unspecified permissions are none. | Least-privilege token. |\n| Checkout | Repository available; credentials not persisted. | Official action executes. |\n| `npm ci` | Lockfile-consistent install. | Downloads and executes dependencies. |\n| Audit and project scripts | Pass or produce actionable failures. | Project-controlled execution. |\n\n## Security checks\n\n- Keep `permissions` explicit and minimal.\n- Do not add write permissions unless a specific job requires them.\n- Avoid `pull_request_target` for untrusted pull-request code.\n- Never inject untrusted context values directly into a `run` script.\n- Pin actions to verified full commit SHAs for higher-assurance production use, and use Dependabot or another controlled update process.\n- Prefer official actions with reviewed source.\n- Do not expose secrets to workflows that run untrusted code.\n- Use OpenID Connect and short-lived cloud credentials for future deployments instead of long-lived static keys.\n- Set timeouts and concurrency limits.\n- Review lockfile changes and consider dependency review on pull requests.\n- Keep deployment in a separate workflow with separate permissions and environment approvals.\n\n## Common errors\n\n### `npm ci` reports a lockfile mismatch\n\nUpdate the lockfile deliberately on a development branch using the correct package-manager flags, review the diff, and commit it. Do not replace `npm ci` with `npm install` in CI merely to hide drift.\n\n### A script is missing\n\nThe workflow uses `--if-present`, so missing optional scripts should not fail. Check the exact npm version and script name if behaviour differs.\n\n### Audit fails for a disputed or unreachable package\n\nReview the advisory, dependency path, exploitability, and available fix. Do not suppress it without a documented decision.\n\n### Workflow has unexpected write access\n\nCheck repository and organisation Actions defaults and the workflow `permissions` block. Specifying one permission sets unspecified permissions to none, but organisation policy can also constrain operation.\n\n## How to undo or remove it\n\nDelete the workflow file, review the change, commit, and push:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Deletes the CI workflow file and pushes the removal after commit\n# Network/ports: Outbound HTTPS or SSH to GitHub during push\n# Downloads code: No\n# Replace: Nothing\nRemove-Item -LiteralPath \".\\.github\\workflows\\ci.yml\"\ngit add .github/workflows/ci.yml\ngit diff --cached\ngit commit -m \"ci: remove Node checks\"\ngit push\n```\n\nHistorical workflow logs and commits remain in GitHub history according to repository retention and Git history.\n\n## What to do next\n\nPin action SHAs, add dependency review, make CI a required branch check, and create a separate approval-gated deployment workflow.\n\n## Sources\n\n- [Building and testing Node.js](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) — Official Node CI pattern.\n- [Workflow syntax and permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — Token permissions, events, jobs, and workflow syntax.\n- [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — Immutable action pinning and action review.\n- [actions/setup-node](https://github.com/actions/setup-node) — Node 24 setup, npm caching, and lockfile recommendations.\n- [Script injections](https://docs.github.com/en/actions/concepts/security/script-injections) — Untrusted GitHub context and shell-injection risks."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 11-install-uv-python-windows.md → guide-install-uv-and-a-managed-python-3-13-runtime-on-windows-066d39ec
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-uv-and-a-managed-python-3-13-runtime-on-windows-066d39ec',
      'install-uv-and-a-managed-python-3-13-runtime-on-windows',
      'Install uv and a managed Python 3.13 runtime on Windows',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      1,
      '# Install uv and a managed Python 3.13 runtime on Windows

**Status:** Draft — not published or indexed.

## What you will achieve

You will install Astral''s `uv` package and project manager through WinGet, use it to download an isolated Python 3.13 runtime, and verify the runtime without replacing an existing system-wide `python.exe`.

## Who this is for

This guide is for Windows developers who want reproducible Python runtimes and virtual environments without manually installing Python or using a global `pip`.

It does not configure Python for every application on the machine. Projects should declare and use their own Python version.

## Requirements and expected cost

- Windows 10 or Windows 11 on x86-64. Windows ARM64 is supported by uv at a lower support tier.
- WinGet.
- Internet access.
- Roughly 150 MB for the runtime, plus package caches and future project dependencies.
- Cost: free.

## Tested environment and version scope

The instructions were reviewed against uv 0.11.29 and Python 3.13.14. uv can install later compatible patch versions, but pinning an exact runtime improves reproducibility.

## Before you begin

Check for existing Python and uv installations so you do not confuse several executables:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-Command uv, python, py -ErrorAction SilentlyContinue |
  Select-Object Name, Source
```

An existing Python installation can remain. This guide uses `uv run` to select the managed runtime explicitly.

## Step-by-step instructions

### Step 1: Inspect the exact uv package

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May refresh WinGet metadata; does not install uv
# Port exposure: None
# Downloads code: Package metadata only
# Variables to replace: None
winget show --id astral-sh.uv --exact --source winget
```

Expected output: package information for uv published by Astral.

### Step 2: Install uv with WinGet

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not normally required for a user-scoped package
# Writes/deletes: Installs uv and updates the user executable path
# Port exposure: None
# Downloads code: Yes, signed executable binaries
# Variables to replace: None
winget install --id astral-sh.uv --exact --source winget
```

Expected output: installation completed successfully.

Close and reopen PowerShell so the updated `PATH` is loaded.

### Step 3: Verify the uv executable

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
uv --version
where.exe uv
```

Expected output: uv 0.11.29 or a later reviewed version and the expected executable path.

### Step 4: Inspect available Python 3.13 builds

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May update uv''s local metadata cache
# Port exposure: None
# Downloads code: Runtime metadata only
# Variables to replace: None
uv python list 3.13
```

Expected output: compatible Python 3.13 builds, including the current patch available to the installed uv release.

### Step 5: Install Python 3.13.14 under uv management

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Downloads and installs an isolated Python runtime in uv''s data directory
# Port exposure: None
# Downloads code: Yes, a prebuilt CPython distribution
# Variables to replace: None
uv python install 3.13.14
```

Expected output: uv reports the installed Python runtime and location.

This command does not need to replace the Windows `python.exe` command.

### Step 6: Verify the managed runtime directly

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: May create or update uv cache entries; no project created
# Port exposure: None
# Downloads code: No additional runtime expected
# Variables to replace: None
uv run --python 3.13.14 python -c "import sys; print(sys.version); print(sys.executable)"
```

Expected output: Python 3.13.14 and a path inside uv''s managed Python directory.

### Step 7: Inspect uv storage locations

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
uv python dir
uv cache dir
```

Expected output: the managed Python and cache directories.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `uv --version` | Reviewed uv version. | Windows; PowerShell; inspection only. |
| `uv python list --only-installed` | Python 3.13.14 appears as installed. | Reads uv runtime inventory. |
| `uv run --python 3.13.14 python --version` | `Python 3.13.14`. | Runs the managed interpreter; no project changes. |
| `uv python dir` | User-owned managed-runtime directory. | Inspection only. |

## Security checks

- Install uv through a named package manager source or inspect the official install script before execution.
- Do not use `--allow-insecure-host` or `--trusted-host` to bypass TLS verification.
- Avoid a global `pip install` workflow; use project environments.
- Review package sources and lockfiles before installing third-party Python dependencies.
- Keep uv and managed runtimes updated after security releases.
- Do not make an unfamiliar project''s virtual environment globally active.

## Common errors

### `uv` is not recognised

Open a new PowerShell window and run `where.exe uv`. If still missing, inspect the WinGet installation result and user `PATH`.

### Python 3.13.14 is not available

Update uv through WinGet and list available 3.13 builds. Use the newest reviewed 3.13 patch rather than guessing an unavailable version.

### Another `python.exe` still runs

That is expected because this guide does not replace the system default. Use `uv run --python 3.13.14 ...` or a uv-managed project.

## How to undo or remove it

Remove the managed runtime:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Deletes the uv-managed Python 3.13.14 runtime
# Port exposure: None
# Downloads code: No
# Variables to replace: None
uv python uninstall 3.13.14
```

Then uninstall uv:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not normally required
# Writes/deletes: Removes uv executables; caches may remain
# Port exposure: None
# Downloads code: No
# Variables to replace: None
winget uninstall --id astral-sh.uv --exact
```

Run `uv cache clean` before uninstalling only when you intentionally want to delete downloaded package and runtime cache data.

## What to do next

Create an isolated Python project with a committed lockfile, Ruff, and pytest.

## Sources

- [uv installation](https://docs.astral.sh/uv/getting-started/installation/) — Official WinGet package, installer options, upgrades, and removal.
- [uv Python management](https://docs.astral.sh/uv/reference/cli/#uv-python) — Managed Python installation, listing, and uninstallation.
- [uv platform support](https://docs.astral.sh/uv/reference/policies/platforms/) — Supported Windows architectures and versions.
- [Python on Windows](https://docs.python.org/3.13/using/windows.html) — CPython''s Windows runtime and installation context.',
      '{"frontmatter":{"title":"Install uv and a managed Python 3.13 runtime on Windows","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10","Windows 11"],"tested_versions":"","uv":"0.11.29","python":"3.13.14","winget":"1.x","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.python.org/3.13/using/windows.html","relationship":"version-source","- name":"Python on Windows"},"body":"# Install uv and a managed Python 3.13 runtime on Windows\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will install Astral''s `uv` package and project manager through WinGet, use it to download an isolated Python 3.13 runtime, and verify the runtime without replacing an existing system-wide `python.exe`.\n\n## Who this is for\n\nThis guide is for Windows developers who want reproducible Python runtimes and virtual environments without manually installing Python or using a global `pip`.\n\nIt does not configure Python for every application on the machine. Projects should declare and use their own Python version.\n\n## Requirements and expected cost\n\n- Windows 10 or Windows 11 on x86-64. Windows ARM64 is supported by uv at a lower support tier.\n- WinGet.\n- Internet access.\n- Roughly 150 MB for the runtime, plus package caches and future project dependencies.\n- Cost: free.\n\n## Tested environment and version scope\n\nThe instructions were reviewed against uv 0.11.29 and Python 3.13.14. uv can install later compatible patch versions, but pinning an exact runtime improves reproducibility.\n\n## Before you begin\n\nCheck for existing Python and uv installations so you do not confuse several executables:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nGet-Command uv, python, py -ErrorAction SilentlyContinue |\n  Select-Object Name, Source\n```\n\nAn existing Python installation can remain. This guide uses `uv run` to select the managed runtime explicitly.\n\n## Step-by-step instructions\n\n### Step 1: Inspect the exact uv package\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May refresh WinGet metadata; does not install uv\n# Port exposure: None\n# Downloads code: Package metadata only\n# Variables to replace: None\nwinget show --id astral-sh.uv --exact --source winget\n```\n\nExpected output: package information for uv published by Astral.\n\n### Step 2: Install uv with WinGet\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not normally required for a user-scoped package\n# Writes/deletes: Installs uv and updates the user executable path\n# Port exposure: None\n# Downloads code: Yes, signed executable binaries\n# Variables to replace: None\nwinget install --id astral-sh.uv --exact --source winget\n```\n\nExpected output: installation completed successfully.\n\nClose and reopen PowerShell so the updated `PATH` is loaded.\n\n### Step 3: Verify the uv executable\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nuv --version\nwhere.exe uv\n```\n\nExpected output: uv 0.11.29 or a later reviewed version and the expected executable path.\n\n### Step 4: Inspect available Python 3.13 builds\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May update uv''s local metadata cache\n# Port exposure: None\n# Downloads code: Runtime metadata only\n# Variables to replace: None\nuv python list 3.13\n```\n\nExpected output: compatible Python 3.13 builds, including the current patch available to the installed uv release.\n\n### Step 5: Install Python 3.13.14 under uv management\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Downloads and installs an isolated Python runtime in uv''s data directory\n# Port exposure: None\n# Downloads code: Yes, a prebuilt CPython distribution\n# Variables to replace: None\nuv python install 3.13.14\n```\n\nExpected output: uv reports the installed Python runtime and location.\n\nThis command does not need to replace the Windows `python.exe` command.\n\n### Step 6: Verify the managed runtime directly\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: May create or update uv cache entries; no project created\n# Port exposure: None\n# Downloads code: No additional runtime expected\n# Variables to replace: None\nuv run --python 3.13.14 python -c \"import sys; print(sys.version); print(sys.executable)\"\n```\n\nExpected output: Python 3.13.14 and a path inside uv''s managed Python directory.\n\n### Step 7: Inspect uv storage locations\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nuv python dir\nuv cache dir\n```\n\nExpected output: the managed Python and cache directories.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `uv --version` | Reviewed uv version. | Windows; PowerShell; inspection only. |\n| `uv python list --only-installed` | Python 3.13.14 appears as installed. | Reads uv runtime inventory. |\n| `uv run --python 3.13.14 python --version` | `Python 3.13.14`. | Runs the managed interpreter; no project changes. |\n| `uv python dir` | User-owned managed-runtime directory. | Inspection only. |\n\n## Security checks\n\n- Install uv through a named package manager source or inspect the official install script before execution.\n- Do not use `--allow-insecure-host` or `--trusted-host` to bypass TLS verification.\n- Avoid a global `pip install` workflow; use project environments.\n- Review package sources and lockfiles before installing third-party Python dependencies.\n- Keep uv and managed runtimes updated after security releases.\n- Do not make an unfamiliar project''s virtual environment globally active.\n\n## Common errors\n\n### `uv` is not recognised\n\nOpen a new PowerShell window and run `where.exe uv`. If still missing, inspect the WinGet installation result and user `PATH`.\n\n### Python 3.13.14 is not available\n\nUpdate uv through WinGet and list available 3.13 builds. Use the newest reviewed 3.13 patch rather than guessing an unavailable version.\n\n### Another `python.exe` still runs\n\nThat is expected because this guide does not replace the system default. Use `uv run --python 3.13.14 ...` or a uv-managed project.\n\n## How to undo or remove it\n\nRemove the managed runtime:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Deletes the uv-managed Python 3.13.14 runtime\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nuv python uninstall 3.13.14\n```\n\nThen uninstall uv:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not normally required\n# Writes/deletes: Removes uv executables; caches may remain\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nwinget uninstall --id astral-sh.uv --exact\n```\n\nRun `uv cache clean` before uninstalling only when you intentionally want to delete downloaded package and runtime cache data.\n\n## What to do next\n\nCreate an isolated Python project with a committed lockfile, Ruff, and pytest.\n\n## Sources\n\n- [uv installation](https://docs.astral.sh/uv/getting-started/installation/) — Official WinGet package, installer options, upgrades, and removal.\n- [uv Python management](https://docs.astral.sh/uv/reference/cli/#uv-python) — Managed Python installation, listing, and uninstallation.\n- [uv platform support](https://docs.astral.sh/uv/reference/policies/platforms/) — Supported Windows architectures and versions.\n- [Python on Windows](https://docs.python.org/3.13/using/windows.html) — CPython''s Windows runtime and installation context."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 12-create-python-project-uv-ruff-pytest.md → guide-create-a-reproducible-python-project-with-uv-ruff-and-pytest-3b320bdf
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-create-a-reproducible-python-project-with-uv-ruff-and-pytest-3b320bdf',
      'create-a-reproducible-python-project-with-uv-ruff-and-pytest',
      'Create a reproducible Python project with uv, Ruff, and pytest',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free',
      1,
      0,
      0,
      0,
      1,
      '# Create a reproducible Python project with uv, Ruff, and pytest

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a small Python project pinned to Python 3.13, add linting and tests as development dependencies, generate a lockfile, and prove that the project can be rebuilt from locked dependencies.

## Who this is for

This guide is for beginners who already installed uv and a managed Python 3.13 runtime.

It demonstrates a small local project rather than packaging a public library or deploying a service.

## Requirements and expected cost

- uv installed.
- Python 3.13.14 available through uv.
- Git recommended.
- Internet access to resolve and download packages.
- Cost: free.

## Tested environment and version scope

The project runtime is pinned to Python 3.13.14. Ruff and pytest are resolved through uv and recorded in `uv.lock`.

## Before you begin

Choose a new folder name. The rollback step deletes the entire demonstration folder, so do not reuse the name of an existing project.

## Step-by-step instructions

### Step 1: Create the project

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: A parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-python-demo and starter project files
# Port exposure: None
# Downloads code: No package download expected during initialisation
# Variables to replace: You may replace trace-python-demo with another new folder name
uv init trace-python-demo --python 3.13.14
Set-Location trace-python-demo
```

Expected output: uv reports that the project was initialised.

### Step 2: Inspect generated files

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-ChildItem -Force
Get-Content .\pyproject.toml
```

Expected result: `pyproject.toml`, a Python version declaration, and starter source files.

### Step 3: Add Ruff and pytest as development dependencies

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates .venv and uv.lock; updates pyproject.toml
# Port exposure: None
# Downloads code: Yes, Python wheels and metadata
# Variables to replace: None
uv add --dev ruff pytest
```

Expected output: dependencies resolved, downloaded, and locked.

### Step 4: Create a small module

Create `calculator.py`:

```python
# File-write safety record:
# OS: Any; file: project-root calculator.py
# Writes/deletes: Creates one source file
# Port exposure: None
# Downloads code: No
# Variables to replace: None

def add(left: int, right: int) -> int:
    """Return the sum of two integers."""
    return left + right
```

### Step 5: Create a test

Create `test_calculator.py`:

```python
# File-write safety record:
# OS: Any; file: project-root test_calculator.py
# Writes/deletes: Creates one test file
# Port exposure: None
# Downloads code: No
# Variables to replace: None

from calculator import add


def test_add() -> None:
    assert add(2, 3) == 5
```

### Step 6: Run linting and tests

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Ruff and pytest may write cache directories
# Port exposure: None
# Downloads code: No when the environment is synchronised
# Variables to replace: None
uv run ruff check .
uv run pytest
```

Expected output:

- Ruff reports no errors.
- pytest reports one passing test.

### Step 7: Verify formatting without changing files

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None; --check does not rewrite source
# Port exposure: None
# Downloads code: No
# Variables to replace: None
uv run ruff format --check .
```

Expected output: files are already formatted or a clear list of files requiring formatting.

To apply formatting deliberately, remove `--check` after reviewing the diff.

### Step 8: Confirm the lockfile can reproduce the environment

The following command removes the current virtual environment and recreates it from the lockfile. It is intentionally destructive to `.venv` only.

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Permanently deletes .venv, then recreates it from uv.lock
# Port exposure: None
# Downloads code: May re-download missing cached packages
# Variables to replace: None
Remove-Item -LiteralPath .\.venv -Recurse -Force
uv sync --locked
uv run pytest
```

Expected output: the environment is recreated and the test still passes.

### Step 9: Inspect source-control changes

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
git status --short
```

Expected output: project files and `uv.lock`; `.venv` should be ignored by the generated `.gitignore`.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `uv run python --version` | Python 3.13.14. | Runs project interpreter. |
| `uv run ruff check .` | No lint errors. | Reads source; may write cache. |
| `uv run ruff format --check .` | Formatting passes. | Inspection only. |
| `uv run pytest` | One test passes. | Executes local test code. |
| `uv sync --locked` | Environment matches `uv.lock`. | Rewrites `.venv`; downloads locked packages if absent. |

## Security checks

- Commit `pyproject.toml`, `.python-version`, source files, tests, and `uv.lock`.
- Do not commit `.venv`, caches, credentials, or local environment files.
- Review lockfile changes before merging.
- Avoid `--allow-insecure-host`.
- Treat test code and build hooks from unfamiliar projects as executable code.
- Run projects as an ordinary user, not Administrator.
- Add secret scanning before a public push.

## Common errors

### `No solution found`

A dependency may not support Python 3.13 or may conflict with another requirement. Read the resolver explanation instead of forcing incompatible versions.

### pytest cannot import `calculator`

Confirm both files are in the project root and that the filename is exactly `calculator.py`.

### Ruff reports a formatting difference

Run `uv run ruff format .`, then inspect the Git diff before committing.

## How to undo or remove it

Move to the parent folder, verify the exact path, and delete the demonstration project:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-python-demo
# Admin: Not required
# Writes/deletes: Permanently deletes the entire demonstration project
# Port exposure: None
# Downloads code: No
# Variables to replace: Replace the folder name only if you used a different new project name
Remove-Item -LiteralPath .\trace-python-demo -Recurse -Force
```

## What to do next

Add type checking, package structure, CI, and a project-specific security scanner only when the project requires them.

## Sources

- [uv project guide](https://docs.astral.sh/uv/guides/projects/) — Project environments, dependency groups, locking, and synchronisation.
- [uv project commands](https://docs.astral.sh/uv/reference/cli/#uv-init) — Project initialisation and Python pinning.
- [Ruff tutorial](https://docs.astral.sh/ruff/tutorial/) — Lint and formatting commands.
- [pytest getting started](https://docs.pytest.org/en/stable/getting-started.html) — Test discovery and basic assertions.',
      '{"frontmatter":{"title":"Create a reproducible Python project with uv, Ruff, and pytest","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10","Windows 11"],"tested_versions":"","python":"3.13.14","uv":"0.11.29","ruff":"Current locked project version","pytest":"Current locked project version","estimated_cost":"Free","destructive_steps":"true","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.pytest.org/en/stable/getting-started.html","relationship":"verification-source","- name":"pytest getting started"},"body":"# Create a reproducible Python project with uv, Ruff, and pytest\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a small Python project pinned to Python 3.13, add linting and tests as development dependencies, generate a lockfile, and prove that the project can be rebuilt from locked dependencies.\n\n## Who this is for\n\nThis guide is for beginners who already installed uv and a managed Python 3.13 runtime.\n\nIt demonstrates a small local project rather than packaging a public library or deploying a service.\n\n## Requirements and expected cost\n\n- uv installed.\n- Python 3.13.14 available through uv.\n- Git recommended.\n- Internet access to resolve and download packages.\n- Cost: free.\n\n## Tested environment and version scope\n\nThe project runtime is pinned to Python 3.13.14. Ruff and pytest are resolved through uv and recorded in `uv.lock`.\n\n## Before you begin\n\nChoose a new folder name. The rollback step deletes the entire demonstration folder, so do not reuse the name of an existing project.\n\n## Step-by-step instructions\n\n### Step 1: Create the project\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: A parent development folder\n# Admin: Not required\n# Writes/deletes: Creates trace-python-demo and starter project files\n# Port exposure: None\n# Downloads code: No package download expected during initialisation\n# Variables to replace: You may replace trace-python-demo with another new folder name\nuv init trace-python-demo --python 3.13.14\nSet-Location trace-python-demo\n```\n\nExpected output: uv reports that the project was initialised.\n\n### Step 2: Inspect generated files\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nGet-ChildItem -Force\nGet-Content .\\pyproject.toml\n```\n\nExpected result: `pyproject.toml`, a Python version declaration, and starter source files.\n\n### Step 3: Add Ruff and pytest as development dependencies\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Creates .venv and uv.lock; updates pyproject.toml\n# Port exposure: None\n# Downloads code: Yes, Python wheels and metadata\n# Variables to replace: None\nuv add --dev ruff pytest\n```\n\nExpected output: dependencies resolved, downloaded, and locked.\n\n### Step 4: Create a small module\n\nCreate `calculator.py`:\n\n```python\n# File-write safety record:\n# OS: Any; file: project-root calculator.py\n# Writes/deletes: Creates one source file\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\n\ndef add(left: int, right: int) -> int:\n    \"\"\"Return the sum of two integers.\"\"\"\n    return left + right\n```\n\n### Step 5: Create a test\n\nCreate `test_calculator.py`:\n\n```python\n# File-write safety record:\n# OS: Any; file: project-root test_calculator.py\n# Writes/deletes: Creates one test file\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\n\nfrom calculator import add\n\n\ndef test_add() -> None:\n    assert add(2, 3) == 5\n```\n\n### Step 6: Run linting and tests\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Ruff and pytest may write cache directories\n# Port exposure: None\n# Downloads code: No when the environment is synchronised\n# Variables to replace: None\nuv run ruff check .\nuv run pytest\n```\n\nExpected output:\n\n- Ruff reports no errors.\n- pytest reports one passing test.\n\n### Step 7: Verify formatting without changing files\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None; --check does not rewrite source\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nuv run ruff format --check .\n```\n\nExpected output: files are already formatted or a clear list of files requiring formatting.\n\nTo apply formatting deliberately, remove `--check` after reviewing the diff.\n\n### Step 8: Confirm the lockfile can reproduce the environment\n\nThe following command removes the current virtual environment and recreates it from the lockfile. It is intentionally destructive to `.venv` only.\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Permanently deletes .venv, then recreates it from uv.lock\n# Port exposure: None\n# Downloads code: May re-download missing cached packages\n# Variables to replace: None\nRemove-Item -LiteralPath .\\.venv -Recurse -Force\nuv sync --locked\nuv run pytest\n```\n\nExpected output: the environment is recreated and the test still passes.\n\n### Step 9: Inspect source-control changes\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\ngit status --short\n```\n\nExpected output: project files and `uv.lock`; `.venv` should be ignored by the generated `.gitignore`.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `uv run python --version` | Python 3.13.14. | Runs project interpreter. |\n| `uv run ruff check .` | No lint errors. | Reads source; may write cache. |\n| `uv run ruff format --check .` | Formatting passes. | Inspection only. |\n| `uv run pytest` | One test passes. | Executes local test code. |\n| `uv sync --locked` | Environment matches `uv.lock`. | Rewrites `.venv`; downloads locked packages if absent. |\n\n## Security checks\n\n- Commit `pyproject.toml`, `.python-version`, source files, tests, and `uv.lock`.\n- Do not commit `.venv`, caches, credentials, or local environment files.\n- Review lockfile changes before merging.\n- Avoid `--allow-insecure-host`.\n- Treat test code and build hooks from unfamiliar projects as executable code.\n- Run projects as an ordinary user, not Administrator.\n- Add secret scanning before a public push.\n\n## Common errors\n\n### `No solution found`\n\nA dependency may not support Python 3.13 or may conflict with another requirement. Read the resolver explanation instead of forcing incompatible versions.\n\n### pytest cannot import `calculator`\n\nConfirm both files are in the project root and that the filename is exactly `calculator.py`.\n\n### Ruff reports a formatting difference\n\nRun `uv run ruff format .`, then inspect the Git diff before committing.\n\n## How to undo or remove it\n\nMove to the parent folder, verify the exact path, and delete the demonstration project:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Parent of trace-python-demo\n# Admin: Not required\n# Writes/deletes: Permanently deletes the entire demonstration project\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: Replace the folder name only if you used a different new project name\nRemove-Item -LiteralPath .\\trace-python-demo -Recurse -Force\n```\n\n## What to do next\n\nAdd type checking, package structure, CI, and a project-specific security scanner only when the project requires them.\n\n## Sources\n\n- [uv project guide](https://docs.astral.sh/uv/guides/projects/) — Project environments, dependency groups, locking, and synchronisation.\n- [uv project commands](https://docs.astral.sh/uv/reference/cli/#uv-init) — Project initialisation and Python pinning.\n- [Ruff tutorial](https://docs.astral.sh/ruff/tutorial/) — Lint and formatting commands.\n- [pytest getting started](https://docs.pytest.org/en/stable/getting-started.html) — Test discovery and basic assertions."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 13-install-docker-desktop-wsl2-windows.md → guide-install-docker-desktop-on-windows-with-the-per-user-wsl-2-backend-349a5c00
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-docker-desktop-on-windows-with-the-per-user-wsl-2-backend-349a5c00',
      'install-docker-desktop-on-windows-with-the-per-user-wsl-2-backend',
      'Install Docker Desktop on Windows with the per-user WSL 2 backend',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11 23H2 or later"]',
      NULL,
      'Free for personal use and qualifying organisations; paid licence may be required',
      0,
      1,
      0,
      1,
      1,
      '# Install Docker Desktop on Windows with the per-user WSL 2 backend

**Status:** Draft — not published or indexed.

## What you will achieve

You will verify Windows and WSL prerequisites, install Docker Desktop in its recommended per-user mode, keep Windows containers disabled, and run a disposable Linux test container.

## Who this is for

This guide is for Windows developers who need Linux containers for local databases, test environments, or reproducible builds.

It does not enable Windows containers, Kubernetes, public registry publishing, or production container hosting.

## Requirements and expected cost

- Windows 10 22H2 or a supported Windows 11 release.
- A 64-bit processor with virtualisation and SLAT.
- At least 8 GB RAM.
- Hardware virtualisation enabled in BIOS/UEFI.
- WSL 2.1.5 or newer; latest WSL recommended.
- Internet access and several gigabytes of storage.
- Administrator permission is required once if WSL is not already enabled.
- Docker Desktop licensing must be reviewed. Larger commercial organisations and government use may require a paid subscription.

## Tested environment and version scope

The guide follows Docker Desktop''s 2026 per-user installation path and WSL 2 backend. Per-user mode reduces the privileged service footprint and does not support Windows containers.

## Before you begin

Back up important WSL distributions and container data if Docker or another container engine is already installed.

Uninstall a Docker Engine or CLI installed directly inside a WSL distribution if it conflicts with Docker Desktop''s integration.

Do not add users to the `docker-users` group for ordinary WSL 2 Linux-container use. Docker documents that this is not required and can grant powerful host-level capability for Windows-container or Hyper-V features.

## Step-by-step instructions

### Step 1: Verify Windows and virtualisation information

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-CimInstance Win32_OperatingSystem |
  Select-Object Caption, Version, BuildNumber
Get-CimInstance Win32_Processor |
  Select-Object Name, VirtualizationFirmwareEnabled, SecondLevelAddressTranslationExtensions
```

Expected output: supported Windows build, virtualisation enabled, and SLAT available.

### Step 2: Verify and update WSL

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required for inspection
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
wsl --version
wsl --status
```

Expected output: WSL version 2.1.5 or later.

If WSL needs updating, run this from an elevated PowerShell window:

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Required
# Writes/deletes: Updates Windows Subsystem for Linux components; restart may be required
# Port exposure: None
# Downloads code: Yes, Microsoft WSL components
# Variables to replace: None
wsl --update
```

If WSL is absent, follow Microsoft''s official WSL installation instructions before continuing.

### Step 3: Download the official installer manually

Download **Docker Desktop Installer.exe** from Docker''s official Windows installation page.

Save it to your Downloads folder. Do not use a third-party mirror.

### Step 4: Inspect the installer signature

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Downloads folder
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: Update the path only if the installer is elsewhere
Get-AuthenticodeSignature "$HOME\Downloads\Docker Desktop Installer.exe" |
  Format-List Status, StatusMessage, SignerCertificate
```

Expected output: a valid signature associated with Docker. Stop if the signature is invalid or the publisher is unexpected.

### Step 5: Install per user with Windows containers disabled

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Downloads folder
# Admin: Not required for per-user mode; WSL setup may separately require elevation
# Writes/deletes: Installs Docker Desktop under the user profile and registers application components
# Port exposure: Docker networking components are installed; no application container port published
# Downloads code: The executable installer runs
# Variables to replace: Update the installer path if necessary
Start-Process "$HOME\Downloads\Docker Desktop Installer.exe" `
  -Wait `
  -ArgumentList "install", "--user", "--backend=wsl-2", "--no-windows-containers"
```

Expected result: installation completes.

Start Docker Desktop from the Start menu and read the subscription terms before accepting them.

### Step 6: Confirm the WSL 2 engine

In Docker Desktop, open **Settings → General** and confirm **Use the WSL 2 based engine** is enabled.

Enable integration only for the specific WSL distributions that need Docker under **Settings → Resources → WSL Integration**.

### Step 7: Verify client and engine state

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: Queries local Docker engine only
# Downloads code: No
# Variables to replace: None
docker version
docker context show
docker info --format "OSType={{.OSType}}; Name={{.Name}}; Server={{.ServerVersion}}"
```

Expected output: client and server information, Linux OS type, and the Docker Desktop context.

### Step 8: Run a disposable verification container

```powershell
# OS: Windows 10 22H2 or supported Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: Downloads the hello-world image and creates then removes a temporary container
# Port exposure: None
# Downloads code: Yes, a Docker Official Image
# Variables to replace: None
docker run --rm hello-world
```

Expected output: Docker''s hello-world success message.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `wsl --version` | WSL 2.1.5 or newer. | Inspection only. |
| `docker version` | Client and Docker Desktop engine respond. | Local engine query. |
| `docker context show` | Docker Desktop context. | Inspection only. |
| `docker run --rm hello-world` | Success message and container removed. | Downloads and executes a small official image; no published port. |

## Security checks

- Prefer per-user WSL 2 mode unless a documented requirement needs Hyper-V or Windows containers.
- Do not mount your whole user profile, SSH folder, browser profile, or cloud credentials into containers.
- Treat Dockerfiles and Compose files as executable infrastructure.
- Review images, tags, digests, health checks, mounts, capabilities, and published ports.
- Bind local development services to `127.0.0.1`, not all interfaces.
- Keep WSL and Docker Desktop updated.
- Disable unused WSL distribution integration.
- Consider Enhanced Container Isolation for higher-risk workloads where available.
- Remember that container isolation is not a substitute for a disposable VM when executing hostile code.

## Common errors

### Docker Desktop reports that WSL is too old

Run `wsl --update`, restart Windows if requested, and verify the version again.

### Hardware virtualisation is disabled

Enable Intel VT-x or AMD-V/SVM in BIOS or UEFI. The exact setting depends on the manufacturer.

### `docker version` shows the client but not the server

Start Docker Desktop and wait until the engine is ready. Check that Linux containers and WSL 2 are selected.

### Windows containers appear available

Confirm the application was installed per user with `--no-windows-containers`. Switching installation mode later requires uninstalling and reinstalling.

## How to undo or remove it

Use **Settings → Apps → Installed apps → Docker Desktop → Uninstall**.

Docker warns that uninstalling can remove local containers, images, volumes, and application data. Export or back up anything important first.

After removal, inspect WSL distributions and residual data directories before manually deleting them.

## What to do next

Run a loopback-only PostgreSQL container with a named volume, then learn how to inspect mounts and published ports.

## Sources

- [Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/) — Current requirements, licensing, per-user installation, and installer flags.
- [Docker Desktop WSL 2 backend](https://docs.docker.com/desktop/features/wsl/) — WSL integration, storage, and security model.
- [Docker Desktop Windows permissions](https://docs.docker.com/desktop/setup/install/windows-permission-requirements/) — Privileged helper, user modes, and `docker-users` risks.
- [Docker Desktop WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/) — WSL updates, memory, and filesystem guidance.',
      '{"frontmatter":{"title":"Install Docker Desktop on Windows with the per-user WSL 2 backend","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11 23H2 or later"],"tested_versions":"","docker_desktop":"4.68.x","wsl":"2.1.5 minimum; latest recommended","estimated_cost":"Free for personal use and qualifying organisations; paid licence may be required","destructive_steps":"false","network_exposure":"true","credentials_required":"false","root_required":"true","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.docker.com/desktop/features/wsl/best-practices/","relationship":"security-source","- name":"Docker Desktop WSL best practices"},"body":"# Install Docker Desktop on Windows with the per-user WSL 2 backend\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will verify Windows and WSL prerequisites, install Docker Desktop in its recommended per-user mode, keep Windows containers disabled, and run a disposable Linux test container.\n\n## Who this is for\n\nThis guide is for Windows developers who need Linux containers for local databases, test environments, or reproducible builds.\n\nIt does not enable Windows containers, Kubernetes, public registry publishing, or production container hosting.\n\n## Requirements and expected cost\n\n- Windows 10 22H2 or a supported Windows 11 release.\n- A 64-bit processor with virtualisation and SLAT.\n- At least 8 GB RAM.\n- Hardware virtualisation enabled in BIOS/UEFI.\n- WSL 2.1.5 or newer; latest WSL recommended.\n- Internet access and several gigabytes of storage.\n- Administrator permission is required once if WSL is not already enabled.\n- Docker Desktop licensing must be reviewed. Larger commercial organisations and government use may require a paid subscription.\n\n## Tested environment and version scope\n\nThe guide follows Docker Desktop''s 2026 per-user installation path and WSL 2 backend. Per-user mode reduces the privileged service footprint and does not support Windows containers.\n\n## Before you begin\n\nBack up important WSL distributions and container data if Docker or another container engine is already installed.\n\nUninstall a Docker Engine or CLI installed directly inside a WSL distribution if it conflicts with Docker Desktop''s integration.\n\nDo not add users to the `docker-users` group for ordinary WSL 2 Linux-container use. Docker documents that this is not required and can grant powerful host-level capability for Windows-container or Hyper-V features.\n\n## Step-by-step instructions\n\n### Step 1: Verify Windows and virtualisation information\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nGet-CimInstance Win32_OperatingSystem |\n  Select-Object Caption, Version, BuildNumber\nGet-CimInstance Win32_Processor |\n  Select-Object Name, VirtualizationFirmwareEnabled, SecondLevelAddressTranslationExtensions\n```\n\nExpected output: supported Windows build, virtualisation enabled, and SLAT available.\n\n### Step 2: Verify and update WSL\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required for inspection\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nwsl --version\nwsl --status\n```\n\nExpected output: WSL version 2.1.5 or later.\n\nIf WSL needs updating, run this from an elevated PowerShell window:\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Required\n# Writes/deletes: Updates Windows Subsystem for Linux components; restart may be required\n# Port exposure: None\n# Downloads code: Yes, Microsoft WSL components\n# Variables to replace: None\nwsl --update\n```\n\nIf WSL is absent, follow Microsoft''s official WSL installation instructions before continuing.\n\n### Step 3: Download the official installer manually\n\nDownload **Docker Desktop Installer.exe** from Docker''s official Windows installation page.\n\nSave it to your Downloads folder. Do not use a third-party mirror.\n\n### Step 4: Inspect the installer signature\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Downloads folder\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: Update the path only if the installer is elsewhere\nGet-AuthenticodeSignature \"$HOME\\Downloads\\Docker Desktop Installer.exe\" |\n  Format-List Status, StatusMessage, SignerCertificate\n```\n\nExpected output: a valid signature associated with Docker. Stop if the signature is invalid or the publisher is unexpected.\n\n### Step 5: Install per user with Windows containers disabled\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Downloads folder\n# Admin: Not required for per-user mode; WSL setup may separately require elevation\n# Writes/deletes: Installs Docker Desktop under the user profile and registers application components\n# Port exposure: Docker networking components are installed; no application container port published\n# Downloads code: The executable installer runs\n# Variables to replace: Update the installer path if necessary\nStart-Process \"$HOME\\Downloads\\Docker Desktop Installer.exe\" `\n  -Wait `\n  -ArgumentList \"install\", \"--user\", \"--backend=wsl-2\", \"--no-windows-containers\"\n```\n\nExpected result: installation completes.\n\nStart Docker Desktop from the Start menu and read the subscription terms before accepting them.\n\n### Step 6: Confirm the WSL 2 engine\n\nIn Docker Desktop, open **Settings → General** and confirm **Use the WSL 2 based engine** is enabled.\n\nEnable integration only for the specific WSL distributions that need Docker under **Settings → Resources → WSL Integration**.\n\n### Step 7: Verify client and engine state\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Queries local Docker engine only\n# Downloads code: No\n# Variables to replace: None\ndocker version\ndocker context show\ndocker info --format \"OSType={{.OSType}}; Name={{.Name}}; Server={{.ServerVersion}}\"\n```\n\nExpected output: client and server information, Linux OS type, and the Docker Desktop context.\n\n### Step 8: Run a disposable verification container\n\n```powershell\n# OS: Windows 10 22H2 or supported Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: Downloads the hello-world image and creates then removes a temporary container\n# Port exposure: None\n# Downloads code: Yes, a Docker Official Image\n# Variables to replace: None\ndocker run --rm hello-world\n```\n\nExpected output: Docker''s hello-world success message.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `wsl --version` | WSL 2.1.5 or newer. | Inspection only. |\n| `docker version` | Client and Docker Desktop engine respond. | Local engine query. |\n| `docker context show` | Docker Desktop context. | Inspection only. |\n| `docker run --rm hello-world` | Success message and container removed. | Downloads and executes a small official image; no published port. |\n\n## Security checks\n\n- Prefer per-user WSL 2 mode unless a documented requirement needs Hyper-V or Windows containers.\n- Do not mount your whole user profile, SSH folder, browser profile, or cloud credentials into containers.\n- Treat Dockerfiles and Compose files as executable infrastructure.\n- Review images, tags, digests, health checks, mounts, capabilities, and published ports.\n- Bind local development services to `127.0.0.1`, not all interfaces.\n- Keep WSL and Docker Desktop updated.\n- Disable unused WSL distribution integration.\n- Consider Enhanced Container Isolation for higher-risk workloads where available.\n- Remember that container isolation is not a substitute for a disposable VM when executing hostile code.\n\n## Common errors\n\n### Docker Desktop reports that WSL is too old\n\nRun `wsl --update`, restart Windows if requested, and verify the version again.\n\n### Hardware virtualisation is disabled\n\nEnable Intel VT-x or AMD-V/SVM in BIOS or UEFI. The exact setting depends on the manufacturer.\n\n### `docker version` shows the client but not the server\n\nStart Docker Desktop and wait until the engine is ready. Check that Linux containers and WSL 2 are selected.\n\n### Windows containers appear available\n\nConfirm the application was installed per user with `--no-windows-containers`. Switching installation mode later requires uninstalling and reinstalling.\n\n## How to undo or remove it\n\nUse **Settings → Apps → Installed apps → Docker Desktop → Uninstall**.\n\nDocker warns that uninstalling can remove local containers, images, volumes, and application data. Export or back up anything important first.\n\nAfter removal, inspect WSL distributions and residual data directories before manually deleting them.\n\n## What to do next\n\nRun a loopback-only PostgreSQL container with a named volume, then learn how to inspect mounts and published ports.\n\n## Sources\n\n- [Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/) — Current requirements, licensing, per-user installation, and installer flags.\n- [Docker Desktop WSL 2 backend](https://docs.docker.com/desktop/features/wsl/) — WSL integration, storage, and security model.\n- [Docker Desktop Windows permissions](https://docs.docker.com/desktop/setup/install/windows-permission-requirements/) — Privileged helper, user modes, and `docker-users` risks.\n- [Docker Desktop WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/) — WSL updates, memory, and filesystem guidance."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 14-run-postgresql-docker-loopback.md → guide-run-postgresql-18-locally-with-docker-compose-and-loopback-only-access-2d57fd56
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-run-postgresql-18-locally-with-docker-compose-and-loopback-only-access-2d57fd56',
      'run-postgresql-18-locally-with-docker-compose-and-loopback-only-access',
      'Run PostgreSQL 18 locally with Docker Compose and loopback-only access',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10 22H2","Windows 11"]',
      NULL,
      'Free software; local storage and electricity apply',
      1,
      1,
      1,
      0,
      1,
      '# Run PostgreSQL 18 locally with Docker Compose and loopback-only access

**Status:** Draft — not published or indexed.

## What you will achieve

You will run PostgreSQL 18.4 in a Docker container, persist its data in a named volume, require password authentication, and publish the database only on Windows loopback at `127.0.0.1:5432`.

## Who this is for

This guide is for developers who need an isolated local PostgreSQL database.

It is not a production database, backup strategy, high-availability design, or guide to exposing PostgreSQL to another computer.

## Requirements and expected cost

- Docker Desktop running Linux containers.
- Git recommended.
- About 1 GB free disk space to begin.
- A generated local development password.
- Cost: free software.

## Tested environment and version scope

The Compose file pins PostgreSQL 18.4. PostgreSQL 18 uses `/var/lib/postgresql` as the image volume root, with a version-specific `PGDATA` path managed by the image.

## Before you begin

Choose an empty folder. Do not reuse a Compose project connected to important data.

The final removal command can permanently delete the named database volume. The guide separates ordinary container shutdown from volume deletion.

## Step-by-step instructions

### Step 1: Create the project folder

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: A parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-postgres-local
# Port exposure: None
# Downloads code: No
# Variables to replace: You may replace trace-postgres-local with another new folder name
New-Item -ItemType Directory -Path .\trace-postgres-local
Set-Location .\trace-postgres-local
```

Expected output: a new empty directory.

### Step 2: Generate a local password file

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates .env containing a generated local password
# Port exposure: None
# Downloads code: No
# Variables to replace: None
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$password = [Convert]::ToBase64String($bytes)
"POSTGRES_PASSWORD=$password" | Set-Content -Encoding utf8 .env
```

Expected output: no terminal output. The `.env` file contains a random development password.

Create `.gitignore`:

```gitignore
# File-write safety record:
# OS: Any; file: project-root .gitignore
# Writes/deletes: Creates or updates ignore rules
# Port exposure: None
# Downloads code: No
# Variables to replace: None

.env
backups/
```

### Step 3: Create `compose.yaml`

```yaml
# File-write safety record:
# OS: Any; file: project-root compose.yaml
# Writes/deletes: Defines a container and named volume; no action until Docker Compose runs
# Port exposure: Publishes PostgreSQL only to Windows loopback at 127.0.0.1:5432
# Downloads code: The image will be downloaded when started
# Variables to replace: None

services:
  db:
    image: postgres:18.4-alpine
    container_name: trace-postgres-local
    restart: unless-stopped
    environment:
      POSTGRES_USER: trace_app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      POSTGRES_DB: trace_dev
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256 --data-checksums"
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trace_app -d trace_dev"]
      interval: 5s
      timeout: 5s
      retries: 10
    security_opt:
      - no-new-privileges:true

volumes:
  postgres_data:
```

The environment values initialise the database only when the data directory is empty. Changing them later does not change an existing database password.

### Step 4: Validate the Compose model before starting it

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: May read and interpolate .env; no containers created
# Port exposure: None
# Downloads code: No
# Variables to replace: None
docker compose config --quiet
docker compose config --services
```

Expected output: no validation error and one service named `db`.

Do not publish the fully interpolated `docker compose config` output because it can include the password.

### Step 5: Pull the pinned image and inspect it

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Downloads and stores the PostgreSQL image
# Port exposure: None
# Downloads code: Yes, Docker Official Image layers
# Variables to replace: None
docker compose pull
docker image inspect postgres:18.4-alpine --format "{{json .RepoDigests}}"
```

Expected output: image downloaded and a content digest displayed.

### Step 6: Start the database

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates a container, named volume, database cluster, user, and database
# Port exposure: Opens 127.0.0.1:5432 on the local Windows machine only
# Downloads code: No additional image expected after pull
# Variables to replace: None
docker compose up -d
```

Expected output: container created and started.

### Step 7: Wait for health and verify SQL

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Executes a read-only SQL query inside the container
# Port exposure: Uses Docker''s internal container execution; no new port
# Downloads code: No
# Variables to replace: None
docker compose ps
docker compose exec db psql -U trace_app -d trace_dev -c "SELECT version(), current_database(), current_user;"
```

Expected output: healthy service and PostgreSQL 18.4 details.

### Step 8: Verify the Windows listener address

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Inspects port 5432; opens nothing
# Downloads code: No
# Variables to replace: None
Get-NetTCPConnection -LocalPort 5432 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Expected output: `127.0.0.1` for the published listener, not `0.0.0.0` or a LAN address.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `docker compose config --quiet` | Compose file is valid. | Inspection only. |
| `docker compose ps` | Database is healthy. | Local engine query. |
| `docker compose exec db psql ...` | PostgreSQL 18.4, `trace_dev`, `trace_app`. | Read-only SQL inside container. |
| `Get-NetTCPConnection -LocalPort 5432` | Loopback-only listener. | Inspection only. |

## Security checks

- Never use `POSTGRES_HOST_AUTH_METHOD=trust`.
- Do not commit `.env`.
- Do not publish `5432:5432` without an explicit loopback address.
- Use a non-production password and separate database.
- Treat image tags as mutable; record the resolved digest for higher-assurance work.
- Do not mount the Docker socket or unrelated host directories.
- Back up the database before destructive schema changes.
- Keep PostgreSQL patch versions current.
- Do not assume a Docker container is appropriate for hostile database extensions.

## Common errors

### `port is already allocated`

Another database or container is using 5432. Stop it or change the host side to `127.0.0.1:5433:5432`.

### Password changes have no effect

The official image initialises credentials only on an empty data directory. Change the password with SQL or deliberately recreate the volume for disposable development data.

### Data disappears after container recreation

Confirm the volume targets `/var/lib/postgresql` for PostgreSQL 18 and that `docker compose down -v` was not used.

## How to undo or remove it

Stop and remove the container while preserving database data:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Removes the container and network; preserves the named volume
# Port exposure: Closes 127.0.0.1:5432
# Downloads code: No
# Variables to replace: None
docker compose down
```

To permanently delete the disposable database volume:

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Permanently deletes the container, network, and all data in the named volume
# Port exposure: Closes the database port
# Downloads code: No
# Variables to replace: None
docker compose down --volumes
```

Confirm that no important data remains before using `--volumes`.

## What to do next

Create migrations using the application''s migration tool, add a backup command, and use a separate database user with narrower privileges for the application.

## Sources

- [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres) — Image variables, authentication warnings, Docker secrets, and PostgreSQL 18 volume path.
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) — Service networking and host-port publication.
- [Docker Compose environment variables](https://docs.docker.com/compose/how-tos/environment-variables/) — `.env` interpolation and configuration.
- [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/) — Current PostgreSQL 18 behaviour and SQL reference.',
      '{"frontmatter":{"title":"Run PostgreSQL 18 locally with Docker Compose and loopback-only access","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10 22H2","Windows 11"],"tested_versions":"","docker_desktop":"4.68.x","postgresql":"18.4","compose":"Docker Compose v2","estimated_cost":"Free software; local storage and electricity apply","destructive_steps":"true","network_exposure":"true","credentials_required":"true","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://www.postgresql.org/docs/18/","relationship":"version-source","- name":"PostgreSQL 18 documentation"},"body":"# Run PostgreSQL 18 locally with Docker Compose and loopback-only access\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will run PostgreSQL 18.4 in a Docker container, persist its data in a named volume, require password authentication, and publish the database only on Windows loopback at `127.0.0.1:5432`.\n\n## Who this is for\n\nThis guide is for developers who need an isolated local PostgreSQL database.\n\nIt is not a production database, backup strategy, high-availability design, or guide to exposing PostgreSQL to another computer.\n\n## Requirements and expected cost\n\n- Docker Desktop running Linux containers.\n- Git recommended.\n- About 1 GB free disk space to begin.\n- A generated local development password.\n- Cost: free software.\n\n## Tested environment and version scope\n\nThe Compose file pins PostgreSQL 18.4. PostgreSQL 18 uses `/var/lib/postgresql` as the image volume root, with a version-specific `PGDATA` path managed by the image.\n\n## Before you begin\n\nChoose an empty folder. Do not reuse a Compose project connected to important data.\n\nThe final removal command can permanently delete the named database volume. The guide separates ordinary container shutdown from volume deletion.\n\n## Step-by-step instructions\n\n### Step 1: Create the project folder\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: A parent development folder\n# Admin: Not required\n# Writes/deletes: Creates trace-postgres-local\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: You may replace trace-postgres-local with another new folder name\nNew-Item -ItemType Directory -Path .\\trace-postgres-local\nSet-Location .\\trace-postgres-local\n```\n\nExpected output: a new empty directory.\n\n### Step 2: Generate a local password file\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Creates .env containing a generated local password\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\n$bytes = New-Object byte[] 24\n[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)\n$password = [Convert]::ToBase64String($bytes)\n\"POSTGRES_PASSWORD=$password\" | Set-Content -Encoding utf8 .env\n```\n\nExpected output: no terminal output. The `.env` file contains a random development password.\n\nCreate `.gitignore`:\n\n```gitignore\n# File-write safety record:\n# OS: Any; file: project-root .gitignore\n# Writes/deletes: Creates or updates ignore rules\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\n\n.env\nbackups/\n```\n\n### Step 3: Create `compose.yaml`\n\n```yaml\n# File-write safety record:\n# OS: Any; file: project-root compose.yaml\n# Writes/deletes: Defines a container and named volume; no action until Docker Compose runs\n# Port exposure: Publishes PostgreSQL only to Windows loopback at 127.0.0.1:5432\n# Downloads code: The image will be downloaded when started\n# Variables to replace: None\n\nservices:\n  db:\n    image: postgres:18.4-alpine\n    container_name: trace-postgres-local\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: trace_app\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}\n      POSTGRES_DB: trace_dev\n      POSTGRES_INITDB_ARGS: \"--auth-host=scram-sha-256 --data-checksums\"\n    ports:\n      - \"127.0.0.1:5432:5432\"\n    volumes:\n      - postgres_data:/var/lib/postgresql\n    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U trace_app -d trace_dev\"]\n      interval: 5s\n      timeout: 5s\n      retries: 10\n    security_opt:\n      - no-new-privileges:true\n\nvolumes:\n  postgres_data:\n```\n\nThe environment values initialise the database only when the data directory is empty. Changing them later does not change an existing database password.\n\n### Step 4: Validate the Compose model before starting it\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: May read and interpolate .env; no containers created\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\ndocker compose config --quiet\ndocker compose config --services\n```\n\nExpected output: no validation error and one service named `db`.\n\nDo not publish the fully interpolated `docker compose config` output because it can include the password.\n\n### Step 5: Pull the pinned image and inspect it\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Downloads and stores the PostgreSQL image\n# Port exposure: None\n# Downloads code: Yes, Docker Official Image layers\n# Variables to replace: None\ndocker compose pull\ndocker image inspect postgres:18.4-alpine --format \"{{json .RepoDigests}}\"\n```\n\nExpected output: image downloaded and a content digest displayed.\n\n### Step 6: Start the database\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Creates a container, named volume, database cluster, user, and database\n# Port exposure: Opens 127.0.0.1:5432 on the local Windows machine only\n# Downloads code: No additional image expected after pull\n# Variables to replace: None\ndocker compose up -d\n```\n\nExpected output: container created and started.\n\n### Step 7: Wait for health and verify SQL\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Executes a read-only SQL query inside the container\n# Port exposure: Uses Docker''s internal container execution; no new port\n# Downloads code: No\n# Variables to replace: None\ndocker compose ps\ndocker compose exec db psql -U trace_app -d trace_dev -c \"SELECT version(), current_database(), current_user;\"\n```\n\nExpected output: healthy service and PostgreSQL 18.4 details.\n\n### Step 8: Verify the Windows listener address\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Inspects port 5432; opens nothing\n# Downloads code: No\n# Variables to replace: None\nGet-NetTCPConnection -LocalPort 5432 -State Listen |\n  Select-Object LocalAddress, LocalPort, OwningProcess\n```\n\nExpected output: `127.0.0.1` for the published listener, not `0.0.0.0` or a LAN address.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `docker compose config --quiet` | Compose file is valid. | Inspection only. |\n| `docker compose ps` | Database is healthy. | Local engine query. |\n| `docker compose exec db psql ...` | PostgreSQL 18.4, `trace_dev`, `trace_app`. | Read-only SQL inside container. |\n| `Get-NetTCPConnection -LocalPort 5432` | Loopback-only listener. | Inspection only. |\n\n## Security checks\n\n- Never use `POSTGRES_HOST_AUTH_METHOD=trust`.\n- Do not commit `.env`.\n- Do not publish `5432:5432` without an explicit loopback address.\n- Use a non-production password and separate database.\n- Treat image tags as mutable; record the resolved digest for higher-assurance work.\n- Do not mount the Docker socket or unrelated host directories.\n- Back up the database before destructive schema changes.\n- Keep PostgreSQL patch versions current.\n- Do not assume a Docker container is appropriate for hostile database extensions.\n\n## Common errors\n\n### `port is already allocated`\n\nAnother database or container is using 5432. Stop it or change the host side to `127.0.0.1:5433:5432`.\n\n### Password changes have no effect\n\nThe official image initialises credentials only on an empty data directory. Change the password with SQL or deliberately recreate the volume for disposable development data.\n\n### Data disappears after container recreation\n\nConfirm the volume targets `/var/lib/postgresql` for PostgreSQL 18 and that `docker compose down -v` was not used.\n\n## How to undo or remove it\n\nStop and remove the container while preserving database data:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Removes the container and network; preserves the named volume\n# Port exposure: Closes 127.0.0.1:5432\n# Downloads code: No\n# Variables to replace: None\ndocker compose down\n```\n\nTo permanently delete the disposable database volume:\n\n```powershell\n# OS: Windows 10 22H2 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Permanently deletes the container, network, and all data in the named volume\n# Port exposure: Closes the database port\n# Downloads code: No\n# Variables to replace: None\ndocker compose down --volumes\n```\n\nConfirm that no important data remains before using `--volumes`.\n\n## What to do next\n\nCreate migrations using the application''s migration tool, add a backup command, and use a separate database user with narrower privileges for the application.\n\n## Sources\n\n- [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres) — Image variables, authentication warnings, Docker secrets, and PostgreSQL 18 volume path.\n- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) — Service networking and host-port publication.\n- [Docker Compose environment variables](https://docs.docker.com/compose/how-tos/environment-variables/) — `.env` interpolation and configuration.\n- [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/) — Current PostgreSQL 18 behaviour and SQL reference."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 15-create-first-astro-site.md → guide-create-and-verify-a-minimal-astro-website-locally-4814dc79
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-create-and-verify-a-minimal-astro-website-locally-4814dc79',
      'create-and-verify-a-minimal-astro-website-locally',
      'Create and verify a minimal Astro website locally',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free',
      1,
      1,
      0,
      0,
      1,
      '# Create and verify a minimal Astro website locally

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a new Astro project with the official wizard, keep deployment disabled, run the development server on loopback, build static output, and inspect the generated files.

## Who this is for

This guide is for beginners building documentation, content sites, news sites, landing pages, or mostly static web applications.

It does not add React, a CMS, a database, authentication, analytics, or cloud deployment.

## Requirements and expected cost

- Node.js 24 LTS and npm.
- Git recommended.
- Internet access.
- Cost: free.

## Tested environment and version scope

Astro''s project wizard installs the current compatible project version. The resulting lockfile records the exact dependency versions.

## Before you begin

Choose a new project folder name. The project generator downloads executable npm packages and creates files.

Use a non-administrator terminal and an empty parent folder.

## Step-by-step instructions

### Step 1: Verify Node and npm

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
node --version
npm --version
npm config get registry
```

Expected output: Node 24.x, npm 11.x, and the approved npm registry.

### Step 2: Run the official Astro wizard

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-astro-demo, installs dependencies, and may initialise Git
# Port exposure: None during project creation
# Downloads code: Yes, create-astro and project dependencies
# Variables to replace: You may replace trace-astro-demo with another new folder name
npm create astro@latest -- trace-astro-demo
```

Choose:

- **Empty** or the minimal starter template.
- TypeScript **strict** when offered.
- Install dependencies: **Yes**.
- Initialise Git: **Yes** if Git is installed.
- Deployment: **No**, if any integration asks.

Expected output: project created successfully.

### Step 3: Inspect the generated scripts and dependency tree

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: trace-astro-demo
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: Update the folder name if changed
Set-Location .\trace-astro-demo
npm pkg get scripts
npm ls astro --depth=0
git status --short --branch
```

Expected output: `dev`, `build`, and `preview` scripts, a local Astro package, and the intended repository status.

### Step 4: Replace the home page with a minimal page

Edit `src/pages/index.astro`:

```astro
---
// File-write safety record:
// OS: Any; file: src/pages/index.astro
// Writes/deletes: Replaces only the demonstration home page
// Port exposure: None
// Downloads code: No
// Variables to replace: None

const verifiedDate = "19 July 2026";
---

<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>TRACE Astro demonstration</title>
  </head>
  <body>
    <main>
      <h1>Astro is working</h1>
      <p>Guide reviewed on {verifiedDate}.</p>
    </main>
  </body>
</html>
```

### Step 5: Start the loopback development server

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: May write Astro and Vite cache files
# Port exposure: Opens a development server on loopback, normally localhost:4321
# Downloads code: No additional package expected
# Variables to replace: None
npm run dev
```

Expected output: a local URL such as `http://localhost:4321/`.

Confirm the terminal shows loopback or localhost. Stop with `Ctrl+C`.

Do not add `--host` unless you intentionally want other devices to reach the development server.

### Step 6: Build the site

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Creates or replaces the dist output directory
# Port exposure: None
# Downloads code: No additional package expected
# Variables to replace: None
npm run build
```

Expected output: successful build with generated files under `dist`.

### Step 7: Inspect generated output

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-ChildItem .\dist -Recurse
Select-String -Path .\dist\index.html -Pattern "Astro is working"
```

Expected output: generated `index.html` containing the expected heading.

### Step 8: Preview the production build locally

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None expected
# Port exposure: Opens a loopback preview server, normally localhost:4321
# Downloads code: No
# Variables to replace: None
npm run preview
```

Expected output: local preview URL. Stop with `Ctrl+C`.

Astro''s preview server is for local verification, not production hosting.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `npm ls astro --depth=0` | One local Astro version. | Inspection only. |
| `npm run dev` | Loopback development URL. | Opens local development port. |
| `npm run build` | Successful static build. | Replaces `dist`. |
| `Select-String ...` | Finds `Astro is working`. | Reads generated HTML. |
| `npm run preview` | Local production-build preview. | Opens loopback preview port. |

## Security checks

- Install Astro locally, never globally.
- Review templates before using community or GitHub starter repositories.
- Keep the dev and preview servers on loopback.
- Do not expose secret environment variables to browser code.
- Review integrations because they add executable dependencies and build behaviour.
- Commit the lockfile.
- Run dependency audit and build checks in CI.
- Inspect generated output before deployment.

## Common errors

### Port 4321 is already in use

Astro may select another port. Read the terminal output rather than assuming the URL.

### The page does not update

Save the `.astro` file, confirm the dev server is running, and refresh the browser.

### Build succeeds locally but fails in cloud CI

Confirm the same Node version, package manager, lockfile, build command, and case-sensitive filenames.

## How to undo or remove it

Move to the parent directory and delete the demonstration project:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-astro-demo
# Admin: Not required
# Writes/deletes: Permanently deletes the whole demonstration project
# Port exposure: Ensure dev and preview servers are stopped first
# Downloads code: No
# Variables to replace: Replace the folder name if changed
Remove-Item -LiteralPath .\trace-astro-demo -Recurse -Force
```

## What to do next

Add a content collection, accessibility checks, metadata, and deployment only after the static foundation is working.

## Sources

- [Install Astro](https://docs.astro.build/en/install-and-setup/) — Official project wizard, local installation, scripts, and templates.
- [Astro project tutorial](https://docs.astro.build/en/tutorial/1-setup/2/) — Development server and first-project flow.
- [Astro configuration reference](https://docs.astro.build/en/reference/configuration-reference/) — Server host and project configuration.',
      '{"frontmatter":{"title":"Create and verify a minimal Astro website locally","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10","Windows 11"],"tested_versions":"","node":"24.x LTS","astro":"Current create-astro release","estimated_cost":"Free","destructive_steps":"true","network_exposure":"true","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.astro.build/en/reference/configuration-reference/","relationship":"security-source","- name":"Astro configuration reference"},"body":"# Create and verify a minimal Astro website locally\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a new Astro project with the official wizard, keep deployment disabled, run the development server on loopback, build static output, and inspect the generated files.\n\n## Who this is for\n\nThis guide is for beginners building documentation, content sites, news sites, landing pages, or mostly static web applications.\n\nIt does not add React, a CMS, a database, authentication, analytics, or cloud deployment.\n\n## Requirements and expected cost\n\n- Node.js 24 LTS and npm.\n- Git recommended.\n- Internet access.\n- Cost: free.\n\n## Tested environment and version scope\n\nAstro''s project wizard installs the current compatible project version. The resulting lockfile records the exact dependency versions.\n\n## Before you begin\n\nChoose a new project folder name. The project generator downloads executable npm packages and creates files.\n\nUse a non-administrator terminal and an empty parent folder.\n\n## Step-by-step instructions\n\n### Step 1: Verify Node and npm\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nnode --version\nnpm --version\nnpm config get registry\n```\n\nExpected output: Node 24.x, npm 11.x, and the approved npm registry.\n\n### Step 2: Run the official Astro wizard\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Parent development folder\n# Admin: Not required\n# Writes/deletes: Creates trace-astro-demo, installs dependencies, and may initialise Git\n# Port exposure: None during project creation\n# Downloads code: Yes, create-astro and project dependencies\n# Variables to replace: You may replace trace-astro-demo with another new folder name\nnpm create astro@latest -- trace-astro-demo\n```\n\nChoose:\n\n- **Empty** or the minimal starter template.\n- TypeScript **strict** when offered.\n- Install dependencies: **Yes**.\n- Initialise Git: **Yes** if Git is installed.\n- Deployment: **No**, if any integration asks.\n\nExpected output: project created successfully.\n\n### Step 3: Inspect the generated scripts and dependency tree\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: trace-astro-demo\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: Update the folder name if changed\nSet-Location .\\trace-astro-demo\nnpm pkg get scripts\nnpm ls astro --depth=0\ngit status --short --branch\n```\n\nExpected output: `dev`, `build`, and `preview` scripts, a local Astro package, and the intended repository status.\n\n### Step 4: Replace the home page with a minimal page\n\nEdit `src/pages/index.astro`:\n\n```astro\n---\n// File-write safety record:\n// OS: Any; file: src/pages/index.astro\n// Writes/deletes: Replaces only the demonstration home page\n// Port exposure: None\n// Downloads code: No\n// Variables to replace: None\n\nconst verifiedDate = \"19 July 2026\";\n---\n\n<html lang=\"en-GB\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width\" />\n    <title>TRACE Astro demonstration</title>\n  </head>\n  <body>\n    <main>\n      <h1>Astro is working</h1>\n      <p>Guide reviewed on {verifiedDate}.</p>\n    </main>\n  </body>\n</html>\n```\n\n### Step 5: Start the loopback development server\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: May write Astro and Vite cache files\n# Port exposure: Opens a development server on loopback, normally localhost:4321\n# Downloads code: No additional package expected\n# Variables to replace: None\nnpm run dev\n```\n\nExpected output: a local URL such as `http://localhost:4321/`.\n\nConfirm the terminal shows loopback or localhost. Stop with `Ctrl+C`.\n\nDo not add `--host` unless you intentionally want other devices to reach the development server.\n\n### Step 6: Build the site\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Creates or replaces the dist output directory\n# Port exposure: None\n# Downloads code: No additional package expected\n# Variables to replace: None\nnpm run build\n```\n\nExpected output: successful build with generated files under `dist`.\n\n### Step 7: Inspect generated output\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nGet-ChildItem .\\dist -Recurse\nSelect-String -Path .\\dist\\index.html -Pattern \"Astro is working\"\n```\n\nExpected output: generated `index.html` containing the expected heading.\n\n### Step 8: Preview the production build locally\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None expected\n# Port exposure: Opens a loopback preview server, normally localhost:4321\n# Downloads code: No\n# Variables to replace: None\nnpm run preview\n```\n\nExpected output: local preview URL. Stop with `Ctrl+C`.\n\nAstro''s preview server is for local verification, not production hosting.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `npm ls astro --depth=0` | One local Astro version. | Inspection only. |\n| `npm run dev` | Loopback development URL. | Opens local development port. |\n| `npm run build` | Successful static build. | Replaces `dist`. |\n| `Select-String ...` | Finds `Astro is working`. | Reads generated HTML. |\n| `npm run preview` | Local production-build preview. | Opens loopback preview port. |\n\n## Security checks\n\n- Install Astro locally, never globally.\n- Review templates before using community or GitHub starter repositories.\n- Keep the dev and preview servers on loopback.\n- Do not expose secret environment variables to browser code.\n- Review integrations because they add executable dependencies and build behaviour.\n- Commit the lockfile.\n- Run dependency audit and build checks in CI.\n- Inspect generated output before deployment.\n\n## Common errors\n\n### Port 4321 is already in use\n\nAstro may select another port. Read the terminal output rather than assuming the URL.\n\n### The page does not update\n\nSave the `.astro` file, confirm the dev server is running, and refresh the browser.\n\n### Build succeeds locally but fails in cloud CI\n\nConfirm the same Node version, package manager, lockfile, build command, and case-sensitive filenames.\n\n## How to undo or remove it\n\nMove to the parent directory and delete the demonstration project:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Parent of trace-astro-demo\n# Admin: Not required\n# Writes/deletes: Permanently deletes the whole demonstration project\n# Port exposure: Ensure dev and preview servers are stopped first\n# Downloads code: No\n# Variables to replace: Replace the folder name if changed\nRemove-Item -LiteralPath .\\trace-astro-demo -Recurse -Force\n```\n\n## What to do next\n\nAdd a content collection, accessibility checks, metadata, and deployment only after the static foundation is working.\n\n## Sources\n\n- [Install Astro](https://docs.astro.build/en/install-and-setup/) — Official project wizard, local installation, scripts, and templates.\n- [Astro project tutorial](https://docs.astro.build/en/tutorial/1-setup/2/) — Development server and first-project flow.\n- [Astro configuration reference](https://docs.astro.build/en/reference/configuration-reference/) — Server host and project configuration."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 16-create-first-cloudflare-worker.md → guide-create-test-and-deliberately-deploy-a-minimal-cloudflare-worker-c9f89ede
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-create-test-and-deliberately-deploy-a-minimal-cloudflare-worker-c9f89ede',
      'create-test-and-deliberately-deploy-a-minimal-cloudflare-worker',
      'Create, test, and deliberately deploy a minimal Cloudflare Worker',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 11"]',
      NULL,
      'Free-tier use available; usage limits and charges may apply',
      0,
      1,
      1,
      0,
      1,
      '# Create, test, and deliberately deploy a minimal Cloudflare Worker

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

The guide uses Cloudflare''s current `create-cloudflare` wizard and project-local Wrangler 4.x.

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

Cloudflare''s dashboard can delete the demonstration Worker under **Workers & Pages**.

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
- [Wrangler authentication commands](https://developers.cloudflare.com/workers/wrangler/commands/general/) — OAuth login, keychain option, and identity verification.',
      '{"frontmatter":{"title":"Create, test, and deliberately deploy a minimal Cloudflare Worker","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 11"],"tested_versions":"","node":"24.x LTS","wrangler":"4.x","create_cloudflare":"Current release","estimated_cost":"Free-tier use available; usage limits and charges may apply","destructive_steps":"false","network_exposure":"true","credentials_required":"true","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://developers.cloudflare.com/workers/wrangler/commands/general/","relationship":"security-source","- name":"Wrangler authentication commands"},"body":"# Create, test, and deliberately deploy a minimal Cloudflare Worker\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will generate a TypeScript Worker, decline automatic deployment, test it on loopback, inspect the project configuration, authenticate with secure credential storage, and deploy only after an explicit final review.\n\n## Who this is for\n\nThis guide is for developers with Node.js, Git, and a Cloudflare account.\n\nIt creates a publicly reachable `workers.dev` endpoint at the deployment step. It does not configure a custom domain, secrets, databases, scheduled jobs, or production CI.\n\n## Requirements and expected cost\n\n- Windows 11.\n- Node.js 24 LTS.\n- A Cloudflare account.\n- Internet access.\n- Cost: Workers has a free tier; review current limits and billing before deployment.\n\n## Tested environment and version scope\n\nThe guide uses Cloudflare''s current `create-cloudflare` wizard and project-local Wrangler 4.x.\n\n## Before you begin\n\nConfirm the intended Cloudflare account and review account-level billing controls.\n\nChoose a unique Worker name that does not reveal private project or customer information.\n\nThe generated development server opens a loopback port. The deployed Worker is public unless access controls are added separately.\n\n## Step-by-step instructions\n\n### Step 1: Generate the project without deploying\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Parent development folder\n# Admin: Not required\n# Writes/deletes: Creates trace-worker-demo, installs dependencies, and may initialise Git\n# Port exposure: None during creation\n# Downloads code: Yes, create-cloudflare and project dependencies\n# Variables to replace: Replace trace-worker-demo with a unique project name if desired\nnpm create cloudflare@latest -- trace-worker-demo\n```\n\nChoose:\n\n- **Hello World example**.\n- **Worker only**.\n- **TypeScript**.\n- Git: **Yes**.\n- Deploy now: **No**.\n\nExpected output: local project created.\n\n### Step 2: Inspect configuration and scripts\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: trace-worker-demo\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: Update project folder if changed\nSet-Location .\\trace-worker-demo\nnpm pkg get scripts\nGet-Content .\\wrangler.jsonc\nGet-Content .\\src\\index.ts\ngit status --short --branch\n```\n\nExpected result: local Wrangler dependency, Worker entry point, name, compatibility date, and expected source-control state.\n\n### Step 3: Run project validation\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Tests and generated types may write caches or generated files\n# Port exposure: None\n# Downloads code: No additional package expected\n# Variables to replace: None\nnpm test --if-present\nnpm run check --if-present\nnpm run cf-typegen --if-present\n```\n\nExpected result: available checks complete successfully.\n\n### Step 4: Start local development\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Writes local Wrangler state under project or user cache\n# Port exposure: Opens a loopback development server, normally localhost:8787\n# Downloads code: May download Workers runtime components\n# Variables to replace: None\nnpx wrangler dev --ip 127.0.0.1\n```\n\nExpected output: local Worker URL.\n\nVisit the URL and confirm the Hello World response. Stop with `Ctrl+C`.\n\n### Step 5: Test the local endpoint from another terminal\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Connects only to local loopback port 8787\n# Downloads code: No\n# Variables to replace: Change the port if Wrangler selected another one\nInvoke-WebRequest \"http://127.0.0.1:8787/\" |\n  Select-Object StatusCode, Content\n```\n\nExpected output: HTTP 200 and the Worker response.\n\n### Step 6: Authenticate and verify the target account\n\nIf Wrangler is not already authenticated, use the secure keychain option:\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Stores encrypted OAuth data and a key in Windows Credential Manager\n# Port exposure: Temporary loopback OAuth callback; outbound HTTPS to Cloudflare\n# Downloads code: May download keyring support\n# Variables to replace: None\nnpx wrangler login --use-keyring\nnpx wrangler whoami\n```\n\nExpected output: the intended Cloudflare account and secure credential-storage status.\n\n### Step 7: Review the deployment configuration\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nGet-Content .\\wrangler.jsonc\ngit diff\ngit status --short\n```\n\nConfirm:\n\n- Worker name is correct.\n- No secrets are in code or configuration.\n- No unexpected routes or bindings exist.\n- The compatibility date is intentional.\n- Local tests passed.\n- The Cloudflare account is correct.\n\n### Step 8: Deploy deliberately\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Creates or updates a remote Cloudflare Worker deployment\n# Port exposure: Publishes a public HTTPS workers.dev endpoint\n# Downloads code: Uploads built project code to Cloudflare\n# Variables to replace: None\nnpx wrangler deploy\n```\n\nExpected output: deployment URL and version information.\n\n### Step 9: Verify the remote endpoint\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Outbound HTTPS to the public Worker\n# Downloads code: No\n# Variables to replace: Replace the URL with the exact deployment URL\nInvoke-WebRequest \"https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/\" |\n  Select-Object StatusCode, Content\n```\n\nExpected output: HTTP 200 and the expected response.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `npx wrangler dev --ip 127.0.0.1` | Loopback Worker preview. | Opens local port only. |\n| Local `Invoke-WebRequest` | HTTP 200. | Loopback request. |\n| `npx wrangler whoami` | Intended account. | Authenticated read. |\n| `npx wrangler deploy` | New remote version and public URL. | Creates public cloud deployment. |\n| Remote `Invoke-WebRequest` | HTTP 200 and expected content. | Public HTTPS request. |\n\n## Security checks\n\n- Decline automatic deployment during scaffolding.\n- Keep development bound to loopback.\n- Never put API tokens or secrets in source code or `wrangler.jsonc`.\n- Verify account, routes, bindings, and name before every first deployment.\n- Use Cloudflare secrets for sensitive values.\n- Add authentication before exposing private operations.\n- Set budget alerts and review Workers limits.\n- Use a separate deployment workflow and scoped token for CI.\n- Keep preview and production resources distinct where practical.\n- Log and test failure paths without exposing sensitive data.\n\n## Common errors\n\n### `wrangler whoami` shows the wrong account\n\nLog out, authenticate again, and verify before deploying.\n\n### Local development works but deployment fails\n\nReview the compatibility date, account permissions, Worker name, build output, and unsupported local-only APIs.\n\n### Public URL returns an unexpected response\n\nConfirm the deployed version, route, and account. Use Wrangler deployment history before overwriting again.\n\n## How to undo or remove it\n\nCloudflare''s dashboard can delete the demonstration Worker under **Workers & Pages**.\n\nDeleting a Worker removes the remote endpoint and is destructive. Confirm that the name belongs only to the demonstration.\n\nDelete the local project separately after stopping local processes:\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Parent of trace-worker-demo\n# Admin: Not required\n# Writes/deletes: Permanently deletes the local demonstration project only\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: Replace folder name if changed\nRemove-Item -LiteralPath .\\trace-worker-demo -Recurse -Force\n```\n\n## What to do next\n\nAdd request validation and tests, then connect a separate D1 development database through versioned migrations.\n\n## Sources\n\n- [Cloudflare Workers CLI guide](https://developers.cloudflare.com/workers/get-started/guide/) — Current C3 choices, local development, and deployment flow.\n- [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/) — Current Worker lifecycle commands.\n- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) — Runtime and account limits.\n- [Wrangler authentication commands](https://developers.cloudflare.com/workers/wrangler/commands/general/) — OAuth login, keychain option, and identity verification."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 17-create-cloudflare-d1-migrations.md → guide-create-and-apply-cloudflare-d1-migrations-with-a-local-first-safety-gate-3c659596
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-create-and-apply-cloudflare-d1-migrations-with-a-local-first-safety-gate-3c659596',
      'create-and-apply-cloudflare-d1-migrations-with-a-local-first-safety-gate',
      'Create and apply Cloudflare D1 migrations with a local-first safety gate',
      'development-tools',
      'advanced',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 11"]',
      NULL,
      'Free-tier use available; storage and query charges may apply',
      1,
      1,
      1,
      0,
      0,
      '# Create and apply Cloudflare D1 migrations with a local-first safety gate

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a D1 database, bind it to a Worker project, write a versioned migration, apply and verify it locally, capture a remote recovery bookmark and SQL export, and only then apply the migration remotely.

## Who this is for

This guide is for developers who already have a reviewed Cloudflare Worker project with project-local Wrangler and authenticated Cloudflare access.

It is not a zero-downtime production migration strategy. The example creates one table in a demonstration database.

## Requirements and expected cost

- Windows 11.
- Node.js 24 LTS.
- Wrangler 4.x installed in the Worker project.
- A Cloudflare account and Worker project.
- Cost: free-tier use is available, but review D1 billing and limits.

## Tested environment and version scope

The guide targets D1''s production storage subsystem and current migration commands. D1 commands use local storage by default unless `--remote` is specified.

## Before you begin

Commit or back up the Worker project.

Use a new demonstration database name. Applying a remote migration modifies cloud data and may be irreversible through ordinary SQL. D1 Time Travel provides point-in-time recovery for supported production databases, but restoration is itself destructive.

Use the database name in migration commands rather than only the binding name; Cloudflare notes that binding names can change.

## Step-by-step instructions

### Step 1: Verify account and project state

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS for account lookup
# Downloads code: No
# Variables to replace: None
npx wrangler whoami
git status --short --branch
Get-Content .\wrangler.jsonc
```

Expected result: intended Cloudflare account, clean or understood Git state, and reviewed Worker configuration.

### Step 2: Create a new remote D1 database

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Creates an empty remote D1 database
# Port exposure: Outbound HTTPS to Cloudflare; no public listener
# Downloads code: No
# Variables to replace: Replace trace-guide-db with a unique demonstration database name
npx wrangler d1 create trace-guide-db
```

Expected output: database name, UUID, and a configuration block.

Copy the returned values into `wrangler.jsonc`:

```jsonc
// File-write safety record:
// OS: Any; file: project-root wrangler.jsonc
// Writes/deletes: Adds a D1 binding; does not change database content
// Port exposure: None
// Downloads code: No
// Variables to replace: Replace YOUR_DATABASE_ID with the returned UUID

{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "trace-guide-db",
      "database_id": "YOUR_DATABASE_ID",
      "migrations_dir": "migrations"
    }
  ]
}
```

Merge this block with existing configuration rather than replacing unrelated fields.

### Step 3: Generate the first migration file

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Creates a numbered SQL migration under migrations
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations create trace-guide-db create_notes
```

Expected output: path to a new migration file.

Edit that generated file:

```sql
-- File-write safety record:
-- OS: Any; file: generated migrations/*.sql
-- Writes/deletes: Defines a new table when applied
-- Port exposure: None
-- Downloads code: No
-- Variables to replace: None

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notes_created_at ON notes(created_at);
```

### Step 4: Review migration status and SQL

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: None
# Downloads code: No
# Variables to replace: None
Get-Content .\migrations\*.sql
npx wrangler d1 migrations list trace-guide-db --local
git diff
```

Expected result: one unapplied local migration and only the intended files.

### Step 5: Apply the migration locally

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Creates or modifies the local D1 database and migration tracking table
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations apply trace-guide-db --local
```

Expected output: the migration is applied to local D1 state.

### Step 6: Verify local schema and data operations

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: First command reads schema; second inserts one local demonstration row; third reads it
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx wrangler d1 execute trace-guide-db --local --command "PRAGMA table_info(notes);"
npx wrangler d1 execute trace-guide-db --local --command "INSERT INTO notes (title, body) VALUES (''Local test'', ''Migration works'');"
npx wrangler d1 execute trace-guide-db --local --command "SELECT id, title, created_at FROM notes;"
```

Expected output: table columns and one local row.

### Step 7: Run the Worker locally against D1

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: May write local Wrangler state
# Port exposure: Opens loopback Worker development port
# Downloads code: May download runtime components
# Variables to replace: None
npx wrangler dev --ip 127.0.0.1
```

Expected result: Worker starts and any D1-backed route behaves correctly. Stop with `Ctrl+C`.

### Step 8: Capture a remote recovery bookmark and export

Confirm the remote database uses the production backend:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Writes a SQL export file; database itself is read
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: Downloads database schema and data as SQL
# Variables to replace: None
npx wrangler d1 info trace-guide-db
npx wrangler d1 time-travel info trace-guide-db
New-Item -ItemType Directory -Path .\backups -Force
npx wrangler d1 export trace-guide-db --remote --output=.\backups\before-first-migration.sql
```

Expected output:

- database version is `production`;
- current Time Travel bookmark;
- SQL export written locally.

The export can temporarily block other database requests. Do not commit exports containing private data.

### Step 9: Review remote pending migrations

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations list trace-guide-db --remote
```

Expected output: the reviewed migration is pending remotely.

### Step 10: Apply the migration remotely

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Modifies the remote D1 schema and migration table
# Port exposure: Outbound HTTPS to Cloudflare; application availability may be affected by migration behaviour
# Downloads code: No
# Variables to replace: None
npx wrangler d1 migrations apply trace-guide-db --remote
```

Read the confirmation and verify the database name before accepting.

### Step 11: Verify remote schema without inserting data

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: No
# Variables to replace: None
npx wrangler d1 execute trace-guide-db --remote --command "PRAGMA table_info(notes);"
npx wrangler d1 migrations list trace-guide-db --remote
```

Expected result: `notes` schema exists and no migrations remain pending.

## Verify success

| Command | Expected result | Safety record |
| --- | --- | --- |
| `migrations list --local` | Migration state understood locally. | Local read. |
| `migrations apply --local` | Local schema updated. | Modifies disposable local D1. |
| `d1 time-travel info` | Recovery bookmark captured. | Remote read. |
| `d1 export --remote` | SQL export file created. | Remote read; can briefly block requests. |
| `migrations apply --remote` | Reviewed migration applied. | Destructive remote schema write. |
| Remote `PRAGMA table_info` | Expected columns. | Remote read. |

## Security checks

- Use the database name for migration commands.
- Apply locally and test before remote execution.
- Review every SQL statement, including ORM-generated SQL.
- Capture a Time Travel bookmark and export before significant change.
- Never commit exports containing user or customer data.
- Avoid unbounded `UPDATE` or `DELETE`.
- Plan compatibility between old application code and new schema.
- Keep production and preview databases separate.
- Restrict CI tokens to the exact account and permissions required.
- Do not run remote commands from an unfamiliar branch or AI-generated script without review.

## Common errors

### Migration applies locally but fails remotely

Remote schema or migration history may differ. Inspect the remote migration table and schema rather than editing history blindly.

### Binding points to the wrong database

Compare `database_name` and `database_id` in `wrangler.jsonc` with the Cloudflare dashboard before applying.

### Export fails because of virtual tables

Cloudflare documents limitations for exports containing virtual tables such as FTS5. Use an appropriate specialised backup plan.

## How to undo or remove it

A remote Time Travel restore overwrites the database in place and cancels in-flight operations. Use it only after incident review and with the exact pre-migration bookmark:

```powershell
# OS: Windows 11
# Shell: PowerShell
# Directory: Worker project root
# Admin: Not required
# Writes/deletes: Destructively restores the entire remote database to an earlier state
# Port exposure: Outbound HTTPS to Cloudflare
# Downloads code: No
# Variables to replace: Replace PRE_MIGRATION_BOOKMARK with the recorded value
npx wrangler d1 time-travel restore trace-guide-db --bookmark=PRE_MIGRATION_BOOKMARK
```

Cloudflare returns a previous bookmark that can be used to undo the restore. Record it immediately.

Deleting the demonstration database should be done in the Cloudflare dashboard only after confirming no Worker or data still depends on it.

## What to do next

Add typed D1 bindings, application-level prepared statements, integration tests, and an explicit production migration runbook.

## Sources

- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/) — Database creation, bindings, local state, and first queries.
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) — Versioned migration files, tracking, directories, and database-name guidance.
- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) — Current local, remote, migration, execution, and Time Travel commands.
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) — Recovery bookmarks and destructive restore behaviour.
- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) — SQL export commands and limitations.',
      '{"frontmatter":{"title":"Create and apply Cloudflare D1 migrations with a local-first safety gate","category":"development-tools","difficulty":"advanced","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 11"],"tested_versions":"","node":"24.x LTS","wrangler":"4.x","d1":"Production storage backend","estimated_cost":"Free-tier use available; storage and query charges may apply","destructive_steps":"true","network_exposure":"true","credentials_required":"true","root_required":"false","downloads_executable":"false","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://developers.cloudflare.com/d1/best-practices/import-export-data/","relationship":"backup-source","- name":"D1 import and export"},"body":"# Create and apply Cloudflare D1 migrations with a local-first safety gate\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a D1 database, bind it to a Worker project, write a versioned migration, apply and verify it locally, capture a remote recovery bookmark and SQL export, and only then apply the migration remotely.\n\n## Who this is for\n\nThis guide is for developers who already have a reviewed Cloudflare Worker project with project-local Wrangler and authenticated Cloudflare access.\n\nIt is not a zero-downtime production migration strategy. The example creates one table in a demonstration database.\n\n## Requirements and expected cost\n\n- Windows 11.\n- Node.js 24 LTS.\n- Wrangler 4.x installed in the Worker project.\n- A Cloudflare account and Worker project.\n- Cost: free-tier use is available, but review D1 billing and limits.\n\n## Tested environment and version scope\n\nThe guide targets D1''s production storage subsystem and current migration commands. D1 commands use local storage by default unless `--remote` is specified.\n\n## Before you begin\n\nCommit or back up the Worker project.\n\nUse a new demonstration database name. Applying a remote migration modifies cloud data and may be irreversible through ordinary SQL. D1 Time Travel provides point-in-time recovery for supported production databases, but restoration is itself destructive.\n\nUse the database name in migration commands rather than only the binding name; Cloudflare notes that binding names can change.\n\n## Step-by-step instructions\n\n### Step 1: Verify account and project state\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Outbound HTTPS for account lookup\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler whoami\ngit status --short --branch\nGet-Content .\\wrangler.jsonc\n```\n\nExpected result: intended Cloudflare account, clean or understood Git state, and reviewed Worker configuration.\n\n### Step 2: Create a new remote D1 database\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: Creates an empty remote D1 database\n# Port exposure: Outbound HTTPS to Cloudflare; no public listener\n# Downloads code: No\n# Variables to replace: Replace trace-guide-db with a unique demonstration database name\nnpx wrangler d1 create trace-guide-db\n```\n\nExpected output: database name, UUID, and a configuration block.\n\nCopy the returned values into `wrangler.jsonc`:\n\n```jsonc\n// File-write safety record:\n// OS: Any; file: project-root wrangler.jsonc\n// Writes/deletes: Adds a D1 binding; does not change database content\n// Port exposure: None\n// Downloads code: No\n// Variables to replace: Replace YOUR_DATABASE_ID with the returned UUID\n\n{\n  \"d1_databases\": [\n    {\n      \"binding\": \"DB\",\n      \"database_name\": \"trace-guide-db\",\n      \"database_id\": \"YOUR_DATABASE_ID\",\n      \"migrations_dir\": \"migrations\"\n    }\n  ]\n}\n```\n\nMerge this block with existing configuration rather than replacing unrelated fields.\n\n### Step 3: Generate the first migration file\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: Creates a numbered SQL migration under migrations\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler d1 migrations create trace-guide-db create_notes\n```\n\nExpected output: path to a new migration file.\n\nEdit that generated file:\n\n```sql\n-- File-write safety record:\n-- OS: Any; file: generated migrations/*.sql\n-- Writes/deletes: Defines a new table when applied\n-- Port exposure: None\n-- Downloads code: No\n-- Variables to replace: None\n\nCREATE TABLE notes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  body TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE INDEX idx_notes_created_at ON notes(created_at);\n```\n\n### Step 4: Review migration status and SQL\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nGet-Content .\\migrations\\*.sql\nnpx wrangler d1 migrations list trace-guide-db --local\ngit diff\n```\n\nExpected result: one unapplied local migration and only the intended files.\n\n### Step 5: Apply the migration locally\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: Creates or modifies the local D1 database and migration tracking table\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler d1 migrations apply trace-guide-db --local\n```\n\nExpected output: the migration is applied to local D1 state.\n\n### Step 6: Verify local schema and data operations\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: First command reads schema; second inserts one local demonstration row; third reads it\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler d1 execute trace-guide-db --local --command \"PRAGMA table_info(notes);\"\nnpx wrangler d1 execute trace-guide-db --local --command \"INSERT INTO notes (title, body) VALUES (''Local test'', ''Migration works'');\"\nnpx wrangler d1 execute trace-guide-db --local --command \"SELECT id, title, created_at FROM notes;\"\n```\n\nExpected output: table columns and one local row.\n\n### Step 7: Run the Worker locally against D1\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: May write local Wrangler state\n# Port exposure: Opens loopback Worker development port\n# Downloads code: May download runtime components\n# Variables to replace: None\nnpx wrangler dev --ip 127.0.0.1\n```\n\nExpected result: Worker starts and any D1-backed route behaves correctly. Stop with `Ctrl+C`.\n\n### Step 8: Capture a remote recovery bookmark and export\n\nConfirm the remote database uses the production backend:\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: Writes a SQL export file; database itself is read\n# Port exposure: Outbound HTTPS to Cloudflare\n# Downloads code: Downloads database schema and data as SQL\n# Variables to replace: None\nnpx wrangler d1 info trace-guide-db\nnpx wrangler d1 time-travel info trace-guide-db\nNew-Item -ItemType Directory -Path .\\backups -Force\nnpx wrangler d1 export trace-guide-db --remote --output=.\\backups\\before-first-migration.sql\n```\n\nExpected output:\n\n- database version is `production`;\n- current Time Travel bookmark;\n- SQL export written locally.\n\nThe export can temporarily block other database requests. Do not commit exports containing private data.\n\n### Step 9: Review remote pending migrations\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Outbound HTTPS to Cloudflare\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler d1 migrations list trace-guide-db --remote\n```\n\nExpected output: the reviewed migration is pending remotely.\n\n### Step 10: Apply the migration remotely\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: Modifies the remote D1 schema and migration table\n# Port exposure: Outbound HTTPS to Cloudflare; application availability may be affected by migration behaviour\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler d1 migrations apply trace-guide-db --remote\n```\n\nRead the confirmation and verify the database name before accepting.\n\n### Step 11: Verify remote schema without inserting data\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Outbound HTTPS to Cloudflare\n# Downloads code: No\n# Variables to replace: None\nnpx wrangler d1 execute trace-guide-db --remote --command \"PRAGMA table_info(notes);\"\nnpx wrangler d1 migrations list trace-guide-db --remote\n```\n\nExpected result: `notes` schema exists and no migrations remain pending.\n\n## Verify success\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `migrations list --local` | Migration state understood locally. | Local read. |\n| `migrations apply --local` | Local schema updated. | Modifies disposable local D1. |\n| `d1 time-travel info` | Recovery bookmark captured. | Remote read. |\n| `d1 export --remote` | SQL export file created. | Remote read; can briefly block requests. |\n| `migrations apply --remote` | Reviewed migration applied. | Destructive remote schema write. |\n| Remote `PRAGMA table_info` | Expected columns. | Remote read. |\n\n## Security checks\n\n- Use the database name for migration commands.\n- Apply locally and test before remote execution.\n- Review every SQL statement, including ORM-generated SQL.\n- Capture a Time Travel bookmark and export before significant change.\n- Never commit exports containing user or customer data.\n- Avoid unbounded `UPDATE` or `DELETE`.\n- Plan compatibility between old application code and new schema.\n- Keep production and preview databases separate.\n- Restrict CI tokens to the exact account and permissions required.\n- Do not run remote commands from an unfamiliar branch or AI-generated script without review.\n\n## Common errors\n\n### Migration applies locally but fails remotely\n\nRemote schema or migration history may differ. Inspect the remote migration table and schema rather than editing history blindly.\n\n### Binding points to the wrong database\n\nCompare `database_name` and `database_id` in `wrangler.jsonc` with the Cloudflare dashboard before applying.\n\n### Export fails because of virtual tables\n\nCloudflare documents limitations for exports containing virtual tables such as FTS5. Use an appropriate specialised backup plan.\n\n## How to undo or remove it\n\nA remote Time Travel restore overwrites the database in place and cancels in-flight operations. Use it only after incident review and with the exact pre-migration bookmark:\n\n```powershell\n# OS: Windows 11\n# Shell: PowerShell\n# Directory: Worker project root\n# Admin: Not required\n# Writes/deletes: Destructively restores the entire remote database to an earlier state\n# Port exposure: Outbound HTTPS to Cloudflare\n# Downloads code: No\n# Variables to replace: Replace PRE_MIGRATION_BOOKMARK with the recorded value\nnpx wrangler d1 time-travel restore trace-guide-db --bookmark=PRE_MIGRATION_BOOKMARK\n```\n\nCloudflare returns a previous bookmark that can be used to undo the restore. Record it immediately.\n\nDeleting the demonstration database should be done in the Cloudflare dashboard only after confirming no Worker or data still depends on it.\n\n## What to do next\n\nAdd typed D1 bindings, application-level prepared statements, integration tests, and an explicit production migration runbook.\n\n## Sources\n\n- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/) — Database creation, bindings, local state, and first queries.\n- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) — Versioned migration files, tracking, directories, and database-name guidance.\n- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) — Current local, remote, migration, execution, and Time Travel commands.\n- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) — Recovery bookmarks and destructive restore behaviour.\n- [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) — SQL export commands and limitations."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 18-protect-github-main-with-ruleset.md → guide-protect-a-github-main-branch-with-a-visible-repository-ruleset-95ff4364
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-protect-a-github-main-branch-with-a-visible-repository-ruleset-95ff4364',
      'protect-a-github-main-branch-with-a-visible-repository-ruleset',
      'Protect a GitHub main branch with a visible repository ruleset',
      'development-tools',
      'intermediate',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free for public repositories; private-repository availability depends on plan',
      0,
      0,
      1,
      0,
      0,
      '# Protect a GitHub main branch with a visible repository ruleset

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a GitHub branch ruleset for the default branch that blocks force pushes and deletion, requires pull requests, requires resolved review conversations, and optionally requires an existing CI check.

## Who this is for

This guide is for repository administrators who already have a `main` branch and a functioning pull-request workflow.

It does not create CI. Add a status check only after its exact job name has completed successfully at least once.

## Requirements and expected cost

- Admin access or an organisation role permitted to edit repository rules.
- A GitHub repository with a default branch.
- CI recommended.
- Rulesets are available for public repositories on GitHub Free and for private repositories on eligible paid plans.
- Cost depends on repository visibility and plan.

## Tested environment and version scope

The guide uses GitHub repository rulesets rather than legacy branch protection because multiple rulesets can apply simultaneously, rulesets have visible status, and readers can inspect active protections.

## Before you begin

Confirm that collaborators can work through pull requests. A ruleset can block direct emergency changes, bots, release automation, or dependency updates if bypass and status checks are configured incorrectly.

Use **Evaluate** mode first when available. Do not create a broad bypass list.

## Step-by-step instructions

### Step 1: Confirm the default branch and CI job names

From a local clone:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: None
# Port exposure: Outbound HTTPS or SSH for remote information
# Downloads code: No
# Variables to replace: None
git remote show origin
git branch --show-current
```

Expected output: identifies the remote default branch and current local branch.

On GitHub, open a recent successful Actions run and record the exact unique job name that should become required, such as `Node.js checks`.

### Step 2: Open repository rulesets

On GitHub:

1. Open the repository.
2. Select **Settings**.
3. Under **Code and automation**, open **Rules → Rulesets**.
4. Select **New ruleset → New branch ruleset**.

If the menu is absent, confirm repository permissions and plan support.

### Step 3: Name and target the ruleset

Use:

- Ruleset name: `Protect default branch`.
- Enforcement status: **Evaluate** initially, or **Active** only when you are certain it will not lock out required workflows.
- Target branches: **Include default branch**.

Avoid a wildcard unless you intend to protect several branches.

### Step 4: Keep bypass narrow

Leave the bypass list empty where practical.

If an automation app genuinely needs bypass, add only that specific GitHub App or team and document why. Repository administrators should not receive routine bypass merely for convenience.

### Step 5: Enable baseline protections

Enable:

- **Restrict deletions**.
- **Block force pushes**.
- **Require a pull request before merging**.
- **Require conversation resolution before merging**.

For pull requests, begin with:

- one required approval when another reviewer is available;
- dismiss stale approvals when new commits materially change the reviewed code;
- require review from code owners only after a valid `CODEOWNERS` file exists.

Solo developers can still require a pull request and CI without requiring an impossible independent approval.

### Step 6: Add the existing CI check

Enable **Require status checks to pass before merging**.

Search for and select the exact successful job name. GitHub warns that job names should be unique across workflows because ambiguous names can block merging.

Enable **Require branches to be up to date before merging** only after evaluating the additional update burden and ensuring a required check has been selected.

### Step 7: Consider additional rules separately

Potential additions include:

- required signed commits;
- linear history;
- required deployments before merging;
- code scanning;
- merge queue.

Do not enable them merely because they sound secure. Each changes contributor and automation behaviour and requires its own rollout plan.

### Step 8: Save and evaluate

Create the ruleset.

In **Evaluate** mode, inspect ruleset insights and perform a test pull request. Confirm that expected actors and automation would pass.

When results are understood, edit the ruleset and set enforcement to **Active**.

### Step 9: Test with a disposable branch

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Clean repository clone
# Admin: Not required
# Writes/deletes: Creates and pushes a disposable branch; no direct main change
# Port exposure: Outbound HTTPS or SSH to GitHub
# Downloads code: No
# Variables to replace: Replace ruleset-test if the branch already exists
git switch -c ruleset-test
git push --set-upstream origin ruleset-test
```

Open a pull request without changing files only if GitHub permits it; otherwise make a harmless documentation change, push it, and verify the required checks and review rules.

Delete the test branch after the pull request is closed.

## Verify success

| Check | Expected result | Safety record |
| --- | --- | --- |
| Rulesets page | `Protect default branch` targets the default branch. | Browser inspection only. |
| Ruleset status | Evaluate during testing; Active after approval. | Settings write when changed. |
| Pull request | Required checks and conversations are enforced. | Uses disposable branch. |
| Direct force push or delete | Blocked for actors without bypass. | Do not test destructively on main. |
| Read-only collaborator view | Active rules are visible. | Browser inspection only. |

## Security checks

- Keep bypass permissions minimal.
- Require unique status-check job names.
- Avoid direct pushes to `main`.
- Block force pushes and deletion.
- Test bots and release automation before activation.
- Protect workflow files through review.
- Review organisation-level rulesets that may layer with repository rules.
- Do not assume signed commits prove that code is safe; they prove identity and integrity properties.
- Reassess rules after changing merge methods or CI names.

## Common errors

### Required status check does not appear

Run the workflow successfully on the repository, then search again using the exact job name.

### Nobody can merge

A required reviewer, code owner, status check, or up-to-date branch rule may be impossible to satisfy. Return to Evaluate mode or correct the specific rule rather than adding broad bypass.

### Dependabot pull requests are blocked

Grant only the necessary app permission or adjust the workflow so Dependabot can satisfy checks without receiving sensitive secrets.

## How to undo or remove it

Open **Settings → Rules → Rulesets**, select the ruleset, and change it to **Disabled** before deleting it. Disabling first provides a reversible way to confirm that the ruleset caused the problem.

Deleting a ruleset removes those protections immediately but does not alter repository history.

## What to do next

Add `CODEOWNERS`, dependency review, signed releases, and a protected deployment environment as separate controls.

## Sources

- [About GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) — Ruleset visibility, layering, and advantages over one legacy branch rule.
- [Creating repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository) — Targets, enforcement modes, bypass, and creation workflow.
- [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — Branch, pull-request, check, signature, and deployment rules.
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — Security effects and unique status-check warning.',
      '{"frontmatter":{"title":"Protect a GitHub main branch with a visible repository ruleset","category":"development-tools","difficulty":"intermediate","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10","Windows 11"],"tested_versions":"","github":"GitHub.com settings as of 2026-07-19","estimated_cost":"Free for public repositories; private-repository availability depends on plan","destructive_steps":"false","network_exposure":"false","credentials_required":"true","root_required":"false","downloads_executable":"false","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches","relationship":"security-source","- name":"About protected branches"},"body":"# Protect a GitHub main branch with a visible repository ruleset\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a GitHub branch ruleset for the default branch that blocks force pushes and deletion, requires pull requests, requires resolved review conversations, and optionally requires an existing CI check.\n\n## Who this is for\n\nThis guide is for repository administrators who already have a `main` branch and a functioning pull-request workflow.\n\nIt does not create CI. Add a status check only after its exact job name has completed successfully at least once.\n\n## Requirements and expected cost\n\n- Admin access or an organisation role permitted to edit repository rules.\n- A GitHub repository with a default branch.\n- CI recommended.\n- Rulesets are available for public repositories on GitHub Free and for private repositories on eligible paid plans.\n- Cost depends on repository visibility and plan.\n\n## Tested environment and version scope\n\nThe guide uses GitHub repository rulesets rather than legacy branch protection because multiple rulesets can apply simultaneously, rulesets have visible status, and readers can inspect active protections.\n\n## Before you begin\n\nConfirm that collaborators can work through pull requests. A ruleset can block direct emergency changes, bots, release automation, or dependency updates if bypass and status checks are configured incorrectly.\n\nUse **Evaluate** mode first when available. Do not create a broad bypass list.\n\n## Step-by-step instructions\n\n### Step 1: Confirm the default branch and CI job names\n\nFrom a local clone:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Outbound HTTPS or SSH for remote information\n# Downloads code: No\n# Variables to replace: None\ngit remote show origin\ngit branch --show-current\n```\n\nExpected output: identifies the remote default branch and current local branch.\n\nOn GitHub, open a recent successful Actions run and record the exact unique job name that should become required, such as `Node.js checks`.\n\n### Step 2: Open repository rulesets\n\nOn GitHub:\n\n1. Open the repository.\n2. Select **Settings**.\n3. Under **Code and automation**, open **Rules → Rulesets**.\n4. Select **New ruleset → New branch ruleset**.\n\nIf the menu is absent, confirm repository permissions and plan support.\n\n### Step 3: Name and target the ruleset\n\nUse:\n\n- Ruleset name: `Protect default branch`.\n- Enforcement status: **Evaluate** initially, or **Active** only when you are certain it will not lock out required workflows.\n- Target branches: **Include default branch**.\n\nAvoid a wildcard unless you intend to protect several branches.\n\n### Step 4: Keep bypass narrow\n\nLeave the bypass list empty where practical.\n\nIf an automation app genuinely needs bypass, add only that specific GitHub App or team and document why. Repository administrators should not receive routine bypass merely for convenience.\n\n### Step 5: Enable baseline protections\n\nEnable:\n\n- **Restrict deletions**.\n- **Block force pushes**.\n- **Require a pull request before merging**.\n- **Require conversation resolution before merging**.\n\nFor pull requests, begin with:\n\n- one required approval when another reviewer is available;\n- dismiss stale approvals when new commits materially change the reviewed code;\n- require review from code owners only after a valid `CODEOWNERS` file exists.\n\nSolo developers can still require a pull request and CI without requiring an impossible independent approval.\n\n### Step 6: Add the existing CI check\n\nEnable **Require status checks to pass before merging**.\n\nSearch for and select the exact successful job name. GitHub warns that job names should be unique across workflows because ambiguous names can block merging.\n\nEnable **Require branches to be up to date before merging** only after evaluating the additional update burden and ensuring a required check has been selected.\n\n### Step 7: Consider additional rules separately\n\nPotential additions include:\n\n- required signed commits;\n- linear history;\n- required deployments before merging;\n- code scanning;\n- merge queue.\n\nDo not enable them merely because they sound secure. Each changes contributor and automation behaviour and requires its own rollout plan.\n\n### Step 8: Save and evaluate\n\nCreate the ruleset.\n\nIn **Evaluate** mode, inspect ruleset insights and perform a test pull request. Confirm that expected actors and automation would pass.\n\nWhen results are understood, edit the ruleset and set enforcement to **Active**.\n\n### Step 9: Test with a disposable branch\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Clean repository clone\n# Admin: Not required\n# Writes/deletes: Creates and pushes a disposable branch; no direct main change\n# Port exposure: Outbound HTTPS or SSH to GitHub\n# Downloads code: No\n# Variables to replace: Replace ruleset-test if the branch already exists\ngit switch -c ruleset-test\ngit push --set-upstream origin ruleset-test\n```\n\nOpen a pull request without changing files only if GitHub permits it; otherwise make a harmless documentation change, push it, and verify the required checks and review rules.\n\nDelete the test branch after the pull request is closed.\n\n## Verify success\n\n| Check | Expected result | Safety record |\n| --- | --- | --- |\n| Rulesets page | `Protect default branch` targets the default branch. | Browser inspection only. |\n| Ruleset status | Evaluate during testing; Active after approval. | Settings write when changed. |\n| Pull request | Required checks and conversations are enforced. | Uses disposable branch. |\n| Direct force push or delete | Blocked for actors without bypass. | Do not test destructively on main. |\n| Read-only collaborator view | Active rules are visible. | Browser inspection only. |\n\n## Security checks\n\n- Keep bypass permissions minimal.\n- Require unique status-check job names.\n- Avoid direct pushes to `main`.\n- Block force pushes and deletion.\n- Test bots and release automation before activation.\n- Protect workflow files through review.\n- Review organisation-level rulesets that may layer with repository rules.\n- Do not assume signed commits prove that code is safe; they prove identity and integrity properties.\n- Reassess rules after changing merge methods or CI names.\n\n## Common errors\n\n### Required status check does not appear\n\nRun the workflow successfully on the repository, then search again using the exact job name.\n\n### Nobody can merge\n\nA required reviewer, code owner, status check, or up-to-date branch rule may be impossible to satisfy. Return to Evaluate mode or correct the specific rule rather than adding broad bypass.\n\n### Dependabot pull requests are blocked\n\nGrant only the necessary app permission or adjust the workflow so Dependabot can satisfy checks without receiving sensitive secrets.\n\n## How to undo or remove it\n\nOpen **Settings → Rules → Rulesets**, select the ruleset, and change it to **Disabled** before deleting it. Disabling first provides a reversible way to confirm that the ruleset caused the problem.\n\nDeleting a ruleset removes those protections immediately but does not alter repository history.\n\n## What to do next\n\nAdd `CODEOWNERS`, dependency review, signed releases, and a protected deployment environment as separate controls.\n\n## Sources\n\n- [About GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) — Ruleset visibility, layering, and advantages over one legacy branch rule.\n- [Creating repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository) — Targets, enforcement modes, bypass, and creation workflow.\n- [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — Branch, pull-request, check, signature, and deployment rules.\n- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — Security effects and unique status-check warning."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 19-github-production-environment-approval.md → guide-gate-a-github-actions-production-deployment-with-an-environment-96c81a98
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-gate-a-github-actions-production-deployment-with-an-environment-96c81a98',
      'gate-a-github-actions-production-deployment-with-an-environment',
      'Gate a GitHub Actions production deployment with an environment',
      'development-tools',
      'advanced',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10","Windows 11"]',
      NULL,
      'Plan and repository visibility dependent',
      0,
      1,
      1,
      0,
      0,
      '# Gate a GitHub Actions production deployment with an environment

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a `production` environment, restrict which branches can use it, optionally require a reviewer where the GitHub plan supports that control, store a demonstration environment secret, and confirm that deployment credentials are withheld until the job reaches the environment gate.

## Who this is for

This guide is for maintainers who already have secure CI and are preparing a separate deployment workflow.

The included workflow does not deploy anything. It demonstrates gating and secret availability without transmitting the secret.

## Requirements and expected cost

- Repository administrator access.
- GitHub Actions enabled.
- A repository plan and visibility that support the desired environment features.
- Environment secrets are available more broadly than required reviewers; GitHub documents plan and visibility limitations, especially for private repositories.
- Cost depends on GitHub plan and runner usage.

## Tested environment and version scope

The guide follows GitHub.com''s current environment, reviewer, branch-policy, and environment-secret behaviour.

## Before you begin

Do not begin with a real production credential. Use a disposable demonstration secret.

A self-hosted runner is not isolated merely because a job uses an environment. Environment protections control when the job and secrets become available, not whether the runner itself is trustworthy.

Required reviewers may be unavailable for private repositories on some plans. When independent approval is not supported, use branch protection, manual workflow inputs, provider-side approval, short-lived identity, and another human review process.

## Step-by-step instructions

### Step 1: Create the production environment

On GitHub:

1. Open **Repository → Settings → Environments**.
2. Select **New environment**.
3. Name it exactly `production`.
4. Select **Configure environment**.

### Step 2: Configure deployment branch policy

Under deployment branches and tags, restrict the environment to:

- the protected default branch; or
- a deliberate release-tag pattern.

Do not permit every branch to access production credentials.

### Step 3: Configure reviewers where supported

If the repository and plan support required reviewers:

- add one or more named people or teams;
- enable **Prevent self-review**;
- avoid adding the person who routinely initiates every deployment as the only practical reviewer.

GitHub permits up to six users or teams and requires only one approval to proceed.

### Step 4: Add a disposable environment secret

Under **Environment secrets**, create:

- Name: `TRACE_DEPLOYMENT_TEST`
- Value: a random demonstration value that grants no access anywhere.

Environment secrets become available only to jobs that reference the environment. When approval is required, the secret is not made available until approval.

### Step 5: Create `.github/workflows/environment-gate-demo.yml`

```yaml
# File-write safety record:
# OS: Any; file: .github/workflows/environment-gate-demo.yml
# Writes/deletes: Adds a manually triggered workflow; no external deployment
# Port exposure: GitHub-hosted runner has outbound network capability, but the steps make no external request
# Downloads code: Uses only the runner shell; no third-party action
# Credentials: Reads one disposable environment secret but does not print its value
# Variables to replace: None

name: Environment gate demonstration

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  demonstrate-gate:
    name: Demonstrate production gate
    runs-on: ubuntu-latest
    timeout-minutes: 5

    environment:
      name: production

    steps:
      - name: Confirm environment was released
        env:
          TRACE_DEPLOYMENT_TEST: ${{ secrets.TRACE_DEPLOYMENT_TEST }}
        shell: bash
        run: |
          if [ -z "$TRACE_DEPLOYMENT_TEST" ]; then
            echo "Environment secret is unavailable."
            exit 1
          fi

          echo "Production environment gate passed."
          echo "Secret is present but will not be printed."
```

The workflow intentionally avoids checkout and third-party actions to minimise what can access the demonstration secret.

### Step 6: Review and commit the workflow

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Repository root
# Admin: Not required
# Writes/deletes: Stages and commits one workflow file
# Port exposure: Outbound HTTPS or SSH during push
# Downloads code: No
# Variables to replace: None
git diff -- .github/workflows/environment-gate-demo.yml
git add .github/workflows/environment-gate-demo.yml
git diff --cached
git commit -m "ci: add production environment gate demo"
git push
```

Expected result: workflow file appears on the protected branch through the repository''s normal review process.

### Step 7: Trigger the workflow

On GitHub:

1. Open **Actions**.
2. Select **Environment gate demonstration**.
3. Choose **Run workflow** from the allowed branch.
4. Open the run.

Expected behaviour:

- the job waits for environment protection rules;
- the demonstration secret is unavailable before the gate;
- an authorised reviewer can approve or reject;
- after approval, the job runs and prints only the safe confirmation.

### Step 8: Inspect deployment history

Open the repository''s **Deployments** or environment history and confirm:

- initiator;
- branch or ref;
- reviewer;
- approval time;
- workflow run;
- success or rejection.

### Step 9: Replace the demonstration with real deployment design

Before a real deployment:

- prefer OpenID Connect and short-lived cloud credentials over static secrets;
- use a dedicated deployment job after CI;
- pin third-party actions to full commit SHAs;
- keep `permissions` minimal;
- prevent untrusted pull-request code from reaching environment secrets;
- add provider-side limits and audit logs;
- keep production deployment separate from build and test.

## Verify success

| Check | Expected result | Safety record |
| --- | --- | --- |
| Environment settings | Branch restriction and optional reviewer visible. | Browser inspection/settings. |
| Workflow run before approval | Job waits; secret inaccessible. | No runner job or secret release yet. |
| Approved run | Safe confirmation; secret value absent from logs. | GitHub-hosted runner receives disposable secret. |
| Rejected run | Job does not execute deployment steps. | No secret release. |
| Deployment history | Initiator and review event recorded. | Browser inspection. |

## Security checks

- Prevent self-review where supported.
- Restrict production to protected branches or release tags.
- Prefer short-lived OIDC credentials.
- Never print, hash, or otherwise transform secrets into logs for “verification.”
- Use GitHub-hosted runners or separately secured ephemeral runners for sensitive jobs.
- Do not expose environment secrets to pull-request code from forks.
- Pin third-party actions by full commit SHA.
- Separate CI from deployment.
- Add cloud-side permissions and limits; GitHub approval is not the only control.
- Review who can edit workflow files and environment settings.

## Common errors

### Required reviewers option is missing

GitHub plan and repository visibility affect availability. Use the controls available on the current plan and add a provider-side or organisational approval process.

### Workflow does not wait

Confirm the job references `environment: production` exactly and the protection rule is enabled.

### Secret is empty after approval

Confirm the secret is stored under the `production` environment, not another scope, and that the job references the exact environment name.

### Initiator can approve their own deployment

Enable **Prevent self-review** where supported and ensure another eligible reviewer exists.

## How to undo or remove it

Delete the demonstration workflow through a reviewed commit, then delete the disposable environment secret.

Disable the environment''s protection rules before deleting the environment if you need a reversible troubleshooting step.

Deleting the environment removes its secrets and protection configuration. Confirm no real workflow still references it.

## What to do next

Replace the disposable secret with a short-lived OIDC trust relationship and a narrowly scoped provider deployment role.

## Sources

- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) — Protection rules, required reviewers, branch policies, and environment secrets.
- [Deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) — Environment lifecycle and deployment records.
- [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) — Approval, rejection, bypass, and plan availability.
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) — Runner, action, token, and workflow security.',
      '{"frontmatter":{"title":"Gate a GitHub Actions production deployment with an environment","category":"development-tools","difficulty":"advanced","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10","Windows 11"],"tested_versions":"","github_actions":"GitHub.com as of 2026-07-19","estimated_cost":"Plan and repository visibility dependent","destructive_steps":"false","network_exposure":"true","credentials_required":"true","root_required":"false","downloads_executable":"false","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://docs.github.com/en/actions/reference/security/secure-use","relationship":"security-source","- name":"Secure use of GitHub Actions"},"body":"# Gate a GitHub Actions production deployment with an environment\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will create a `production` environment, restrict which branches can use it, optionally require a reviewer where the GitHub plan supports that control, store a demonstration environment secret, and confirm that deployment credentials are withheld until the job reaches the environment gate.\n\n## Who this is for\n\nThis guide is for maintainers who already have secure CI and are preparing a separate deployment workflow.\n\nThe included workflow does not deploy anything. It demonstrates gating and secret availability without transmitting the secret.\n\n## Requirements and expected cost\n\n- Repository administrator access.\n- GitHub Actions enabled.\n- A repository plan and visibility that support the desired environment features.\n- Environment secrets are available more broadly than required reviewers; GitHub documents plan and visibility limitations, especially for private repositories.\n- Cost depends on GitHub plan and runner usage.\n\n## Tested environment and version scope\n\nThe guide follows GitHub.com''s current environment, reviewer, branch-policy, and environment-secret behaviour.\n\n## Before you begin\n\nDo not begin with a real production credential. Use a disposable demonstration secret.\n\nA self-hosted runner is not isolated merely because a job uses an environment. Environment protections control when the job and secrets become available, not whether the runner itself is trustworthy.\n\nRequired reviewers may be unavailable for private repositories on some plans. When independent approval is not supported, use branch protection, manual workflow inputs, provider-side approval, short-lived identity, and another human review process.\n\n## Step-by-step instructions\n\n### Step 1: Create the production environment\n\nOn GitHub:\n\n1. Open **Repository → Settings → Environments**.\n2. Select **New environment**.\n3. Name it exactly `production`.\n4. Select **Configure environment**.\n\n### Step 2: Configure deployment branch policy\n\nUnder deployment branches and tags, restrict the environment to:\n\n- the protected default branch; or\n- a deliberate release-tag pattern.\n\nDo not permit every branch to access production credentials.\n\n### Step 3: Configure reviewers where supported\n\nIf the repository and plan support required reviewers:\n\n- add one or more named people or teams;\n- enable **Prevent self-review**;\n- avoid adding the person who routinely initiates every deployment as the only practical reviewer.\n\nGitHub permits up to six users or teams and requires only one approval to proceed.\n\n### Step 4: Add a disposable environment secret\n\nUnder **Environment secrets**, create:\n\n- Name: `TRACE_DEPLOYMENT_TEST`\n- Value: a random demonstration value that grants no access anywhere.\n\nEnvironment secrets become available only to jobs that reference the environment. When approval is required, the secret is not made available until approval.\n\n### Step 5: Create `.github/workflows/environment-gate-demo.yml`\n\n```yaml\n# File-write safety record:\n# OS: Any; file: .github/workflows/environment-gate-demo.yml\n# Writes/deletes: Adds a manually triggered workflow; no external deployment\n# Port exposure: GitHub-hosted runner has outbound network capability, but the steps make no external request\n# Downloads code: Uses only the runner shell; no third-party action\n# Credentials: Reads one disposable environment secret but does not print its value\n# Variables to replace: None\n\nname: Environment gate demonstration\n\non:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  demonstrate-gate:\n    name: Demonstrate production gate\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n\n    environment:\n      name: production\n\n    steps:\n      - name: Confirm environment was released\n        env:\n          TRACE_DEPLOYMENT_TEST: ${{ secrets.TRACE_DEPLOYMENT_TEST }}\n        shell: bash\n        run: |\n          if [ -z \"$TRACE_DEPLOYMENT_TEST\" ]; then\n            echo \"Environment secret is unavailable.\"\n            exit 1\n          fi\n\n          echo \"Production environment gate passed.\"\n          echo \"Secret is present but will not be printed.\"\n```\n\nThe workflow intentionally avoids checkout and third-party actions to minimise what can access the demonstration secret.\n\n### Step 6: Review and commit the workflow\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Repository root\n# Admin: Not required\n# Writes/deletes: Stages and commits one workflow file\n# Port exposure: Outbound HTTPS or SSH during push\n# Downloads code: No\n# Variables to replace: None\ngit diff -- .github/workflows/environment-gate-demo.yml\ngit add .github/workflows/environment-gate-demo.yml\ngit diff --cached\ngit commit -m \"ci: add production environment gate demo\"\ngit push\n```\n\nExpected result: workflow file appears on the protected branch through the repository''s normal review process.\n\n### Step 7: Trigger the workflow\n\nOn GitHub:\n\n1. Open **Actions**.\n2. Select **Environment gate demonstration**.\n3. Choose **Run workflow** from the allowed branch.\n4. Open the run.\n\nExpected behaviour:\n\n- the job waits for environment protection rules;\n- the demonstration secret is unavailable before the gate;\n- an authorised reviewer can approve or reject;\n- after approval, the job runs and prints only the safe confirmation.\n\n### Step 8: Inspect deployment history\n\nOpen the repository''s **Deployments** or environment history and confirm:\n\n- initiator;\n- branch or ref;\n- reviewer;\n- approval time;\n- workflow run;\n- success or rejection.\n\n### Step 9: Replace the demonstration with real deployment design\n\nBefore a real deployment:\n\n- prefer OpenID Connect and short-lived cloud credentials over static secrets;\n- use a dedicated deployment job after CI;\n- pin third-party actions to full commit SHAs;\n- keep `permissions` minimal;\n- prevent untrusted pull-request code from reaching environment secrets;\n- add provider-side limits and audit logs;\n- keep production deployment separate from build and test.\n\n## Verify success\n\n| Check | Expected result | Safety record |\n| --- | --- | --- |\n| Environment settings | Branch restriction and optional reviewer visible. | Browser inspection/settings. |\n| Workflow run before approval | Job waits; secret inaccessible. | No runner job or secret release yet. |\n| Approved run | Safe confirmation; secret value absent from logs. | GitHub-hosted runner receives disposable secret. |\n| Rejected run | Job does not execute deployment steps. | No secret release. |\n| Deployment history | Initiator and review event recorded. | Browser inspection. |\n\n## Security checks\n\n- Prevent self-review where supported.\n- Restrict production to protected branches or release tags.\n- Prefer short-lived OIDC credentials.\n- Never print, hash, or otherwise transform secrets into logs for “verification.”\n- Use GitHub-hosted runners or separately secured ephemeral runners for sensitive jobs.\n- Do not expose environment secrets to pull-request code from forks.\n- Pin third-party actions by full commit SHA.\n- Separate CI from deployment.\n- Add cloud-side permissions and limits; GitHub approval is not the only control.\n- Review who can edit workflow files and environment settings.\n\n## Common errors\n\n### Required reviewers option is missing\n\nGitHub plan and repository visibility affect availability. Use the controls available on the current plan and add a provider-side or organisational approval process.\n\n### Workflow does not wait\n\nConfirm the job references `environment: production` exactly and the protection rule is enabled.\n\n### Secret is empty after approval\n\nConfirm the secret is stored under the `production` environment, not another scope, and that the job references the exact environment name.\n\n### Initiator can approve their own deployment\n\nEnable **Prevent self-review** where supported and ensure another eligible reviewer exists.\n\n## How to undo or remove it\n\nDelete the demonstration workflow through a reviewed commit, then delete the disposable environment secret.\n\nDisable the environment''s protection rules before deleting the environment if you need a reversible troubleshooting step.\n\nDeleting the environment removes its secrets and protection configuration. Confirm no real workflow still references it.\n\n## What to do next\n\nReplace the disposable secret with a short-lived OIDC trust relationship and a narrowly scoped provider deployment role.\n\n## Sources\n\n- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) — Protection rules, required reviewers, branch policies, and environment secrets.\n- [Deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) — Environment lifecycle and deployment records.\n- [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) — Approval, rejection, bypass, and plan availability.\n- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) — Runner, action, token, and workflow security."}',
      '2026-07-19',
      '2026-08-19'
    );


-- 20-build-loopback-streamable-http-mcp.md → guide-build-a-loopback-only-mcp-server-using-streamable-http-b5faced7
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-build-a-loopback-only-mcp-server-using-streamable-http-b5faced7',
      'build-a-loopback-only-mcp-server-using-streamable-http',
      'Build a loopback-only MCP server using Streamable HTTP',
      'development-tools',
      'advanced',
      'documentation-reviewed',
      'draft', 'internal',
      'TRACE Editorial',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free',
      1,
      1,
      0,
      0,
      1,
      '# Build a loopback-only MCP server using Streamable HTTP

**Status:** Draft — not published or indexed.

## What you will achieve

You will build a stateless MCP server over the recommended Streamable HTTP transport, expose one side-effect-free tool on `127.0.0.1`, reject unsupported HTTP methods, and test the endpoint with the MCP Inspector.

## Who this is for

This guide is for developers who completed a basic stdio MCP server and understand Node.js, TypeScript, HTTP, schemas, and local networking.

It is not a production remote MCP server. It deliberately has no authentication and must remain loopback-only. A remotely reachable MCP server requires HTTPS, OAuth-based authorisation, resource-bound tokens, scopes, secure token storage, and additional operational controls.

## Requirements and expected cost

- Node.js 24 LTS and npm.
- A new empty project folder.
- Internet access for packages.
- Cost: free.

## Tested environment and version scope

The guide follows the MCP TypeScript SDK v1 documentation, where Streamable HTTP is recommended for remote-capable transport and HTTP+SSE is deprecated.

## Before you begin

Use a new disposable folder.

The server has no authentication. Binding it to `0.0.0.0`, a LAN address, a tunnel, or a public host would expose the tool endpoint without an identity boundary.

Do not copy this example into production unchanged.

## Step-by-step instructions

### Step 1: Create the project

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent development folder
# Admin: Not required
# Writes/deletes: Creates trace-mcp-http and package.json
# Port exposure: None
# Downloads code: No
# Variables to replace: You may replace trace-mcp-http with another new folder name
New-Item -ItemType Directory -Path .\trace-mcp-http
Set-Location .\trace-mcp-http
npm init -y
```

Expected output: new `package.json`.

### Step 2: Install dependencies locally

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: trace-mcp-http
# Admin: Not required
# Writes/deletes: Creates node_modules and lockfile; updates package.json
# Port exposure: None
# Downloads code: Yes, MCP SDK, Express, Zod, TypeScript tooling, and Inspector
# Variables to replace: None
npm install @modelcontextprotocol/sdk express zod
npm install --save-dev typescript tsx @types/node @types/express @modelcontextprotocol/inspector
```

Expected output: dependencies installed.

### Step 3: Configure package scripts

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: Updates package.json
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npm pkg set type=module
npm pkg set scripts.start="tsx server.ts"
npm pkg set scripts.inspect="mcp-inspector"
```

Expected output: no terminal output.

### Step 4: Create `server.ts`

```typescript
// File-write safety record:
// OS: Windows 10/11; file: project-root server.ts
// Writes/deletes: Creates one local source file
// Port exposure: Opens only 127.0.0.1:3000 when run
// Downloads code: No
// Variables to replace: None

import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HOST = "127.0.0.1";
const PORT = 3000;
const MCP_PATH = "/mcp";

function createServer(): McpServer {
  const server = new McpServer({
    name: "trace-loopback-http",
    version: "1.0.0",
  });

  server.registerTool(
    "echo",
    {
      title: "Echo text",
      description: "Return the caller-supplied text without external side effects.",
      inputSchema: {
        message: z.string().min(1).max(500),
      },
    },
    async ({ message }) => ({
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    }),
  );

  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

app.post(MCP_PATH, async (req: Request, res: Response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get(MCP_PATH, (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method not allowed");
});

app.delete(MCP_PATH, (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method not allowed");
});

app.listen(PORT, HOST, () => {
  console.error(`MCP endpoint listening at http://${HOST}:${PORT}${MCP_PATH}`);
});
```

This example creates a fresh stateless MCP server for each POST request. It has no persistent sessions and no external capabilities.

### Step 5: Type-check the server

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: No emitted JavaScript; TypeScript may write cache metadata
# Port exposure: None
# Downloads code: No
# Variables to replace: None
npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 server.ts
```

Expected output: no errors.

### Step 6: Start the server

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: None expected
# Port exposure: Opens 127.0.0.1:3000 only
# Downloads code: No
# Variables to replace: None
npm start
```

Expected output on standard error: `MCP endpoint listening at http://127.0.0.1:3000/mcp`.

Leave this terminal open.

### Step 7: Verify that the listener is loopback-only

In another PowerShell window:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: Inspects existing port 3000; opens nothing
# Downloads code: No
# Variables to replace: None
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Expected output: `127.0.0.1`, not `0.0.0.0` or a LAN address.

### Step 8: Confirm unsupported GET is rejected

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Not required
# Writes/deletes: None
# Port exposure: Loopback HTTP request only
# Downloads code: No
# Variables to replace: None
try {
  Invoke-WebRequest "http://127.0.0.1:3000/mcp" -Method Get
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected output: `405`.

### Step 9: Start the MCP Inspector

From the project folder in a third terminal:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Project root
# Admin: Not required
# Writes/deletes: May write local npm or Inspector state
# Port exposure: Opens Inspector UI and proxy on loopback ports
# Downloads code: No additional package expected because Inspector is installed locally
# Variables to replace: None
npm run inspect
```

Expected output: local Inspector URL.

In the Inspector:

1. Choose **Streamable HTTP**.
2. Enter `http://127.0.0.1:3000/mcp`.
3. Connect.
4. List tools.
5. Invoke `echo` with `{"message":"streamable http working"}`.
6. Confirm the same text is returned.

Stop Inspector and server processes with `Ctrl+C`.

## Verify success

| Command or action | Expected result | Safety record |
| --- | --- | --- |
| Type check | No errors. | Local inspection. |
| `Get-NetTCPConnection` | Listener is `127.0.0.1:3000`. | Inspection only. |
| GET request | HTTP 405. | Loopback request. |
| Inspector lists tools | `echo` appears. | Local loopback MCP connection. |
| Invoke `echo` | Exact supplied text returned. | No external side effects. |

## Security checks

- Keep the server bound to `127.0.0.1`.
- Do not add permissive CORS headers.
- Limit request-body size.
- Validate every tool input.
- Keep tools side-effect-free until identity, permissions, approvals, and audit are designed.
- Do not accept bearer tokens in query strings.
- For remote use, implement HTTPS and the current MCP OAuth authorisation specification.
- Validate token audience and scopes on every request.
- Protect OAuth discovery from server-side request forgery and DNS rebinding.
- Use short-lived tokens and secure token storage.
- Add rate limits, timeouts, structured logs, and correlation identifiers.
- Treat Inspector and development servers as temporary local tools.

## Common errors

### Import path cannot be resolved

Confirm the installed SDK version and compare its server documentation. SDK v2 changes package and transport import locations.

### Inspector cannot connect

Confirm the server terminal is still running, the endpoint path is `/mcp`, and Streamable HTTP is selected.

### Listener shows `0.0.0.0`

Stop the process and restore `HOST = "127.0.0.1"` before continuing.

### JSON parse errors

Confirm the request uses JSON and that no proxy is rewriting the body. Do not log protocol responses to a different transport channel.

## How to undo or remove it

Stop all local processes. Move to the parent folder and delete the disposable project:

```powershell
# OS: Windows 10 or Windows 11
# Shell: PowerShell
# Directory: Parent of trace-mcp-http
# Admin: Not required
# Writes/deletes: Permanently deletes the whole demonstration project
# Port exposure: Ensure server and Inspector are stopped
# Downloads code: No
# Variables to replace: Replace folder name if changed
Remove-Item -LiteralPath .\trace-mcp-http -Recurse -Force
```

## What to do next

Add integration tests, a read-only resource, structured audit events, and a real OAuth resource-server design before considering any non-loopback deployment.

## Sources

- [MCP TypeScript server documentation](https://ts.sdk.modelcontextprotocol.io/server) — Streamable HTTP recommendation, stateless examples, and transport behaviour.
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) — Package installation, server primitives, and supported transports.
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Local connection and tool inspection.
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — HTTPS, OAuth, resource indicators, token audience, PKCE, and secure storage.
- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — SSRF, DNS rebinding, token, session, prompt-injection, and local-server threats.',
      '{"frontmatter":{"title":"Build a loopback-only MCP server using Streamable HTTP","category":"development-tools","difficulty":"advanced","verification_status":"documentation-reviewed","author_name":"TRACE Editorial","tested_os":["Windows 10","Windows 11"],"tested_versions":"","node":"24.x LTS","mcp_typescript_sdk":"v1 documentation","express":"Current locked project version","estimated_cost":"Free","destructive_steps":"true","network_exposure":"true","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-19","review_due":"2026-08-19","url":"https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices","relationship":"security-source","- name":"MCP security best practices"},"body":"# Build a loopback-only MCP server using Streamable HTTP\n\n**Status:** Draft — not published or indexed.\n\n## What you will achieve\n\nYou will build a stateless MCP server over the recommended Streamable HTTP transport, expose one side-effect-free tool on `127.0.0.1`, reject unsupported HTTP methods, and test the endpoint with the MCP Inspector.\n\n## Who this is for\n\nThis guide is for developers who completed a basic stdio MCP server and understand Node.js, TypeScript, HTTP, schemas, and local networking.\n\nIt is not a production remote MCP server. It deliberately has no authentication and must remain loopback-only. A remotely reachable MCP server requires HTTPS, OAuth-based authorisation, resource-bound tokens, scopes, secure token storage, and additional operational controls.\n\n## Requirements and expected cost\n\n- Node.js 24 LTS and npm.\n- A new empty project folder.\n- Internet access for packages.\n- Cost: free.\n\n## Tested environment and version scope\n\nThe guide follows the MCP TypeScript SDK v1 documentation, where Streamable HTTP is recommended for remote-capable transport and HTTP+SSE is deprecated.\n\n## Before you begin\n\nUse a new disposable folder.\n\nThe server has no authentication. Binding it to `0.0.0.0`, a LAN address, a tunnel, or a public host would expose the tool endpoint without an identity boundary.\n\nDo not copy this example into production unchanged.\n\n## Step-by-step instructions\n\n### Step 1: Create the project\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Parent development folder\n# Admin: Not required\n# Writes/deletes: Creates trace-mcp-http and package.json\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: You may replace trace-mcp-http with another new folder name\nNew-Item -ItemType Directory -Path .\\trace-mcp-http\nSet-Location .\\trace-mcp-http\nnpm init -y\n```\n\nExpected output: new `package.json`.\n\n### Step 2: Install dependencies locally\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: trace-mcp-http\n# Admin: Not required\n# Writes/deletes: Creates node_modules and lockfile; updates package.json\n# Port exposure: None\n# Downloads code: Yes, MCP SDK, Express, Zod, TypeScript tooling, and Inspector\n# Variables to replace: None\nnpm install @modelcontextprotocol/sdk express zod\nnpm install --save-dev typescript tsx @types/node @types/express @modelcontextprotocol/inspector\n```\n\nExpected output: dependencies installed.\n\n### Step 3: Configure package scripts\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: Updates package.json\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nnpm pkg set type=module\nnpm pkg set scripts.start=\"tsx server.ts\"\nnpm pkg set scripts.inspect=\"mcp-inspector\"\n```\n\nExpected output: no terminal output.\n\n### Step 4: Create `server.ts`\n\n```typescript\n// File-write safety record:\n// OS: Windows 10/11; file: project-root server.ts\n// Writes/deletes: Creates one local source file\n// Port exposure: Opens only 127.0.0.1:3000 when run\n// Downloads code: No\n// Variables to replace: None\n\nimport express, { type Request, type Response } from \"express\";\nimport { McpServer } from \"@modelcontextprotocol/sdk/server/mcp.js\";\nimport { StreamableHTTPServerTransport } from \"@modelcontextprotocol/sdk/server/streamableHttp.js\";\nimport { z } from \"zod\";\n\nconst HOST = \"127.0.0.1\";\nconst PORT = 3000;\nconst MCP_PATH = \"/mcp\";\n\nfunction createServer(): McpServer {\n  const server = new McpServer({\n    name: \"trace-loopback-http\",\n    version: \"1.0.0\",\n  });\n\n  server.registerTool(\n    \"echo\",\n    {\n      title: \"Echo text\",\n      description: \"Return the caller-supplied text without external side effects.\",\n      inputSchema: {\n        message: z.string().min(1).max(500),\n      },\n    },\n    async ({ message }) => ({\n      content: [\n        {\n          type: \"text\",\n          text: message,\n        },\n      ],\n    }),\n  );\n\n  return server;\n}\n\nconst app = express();\napp.disable(\"x-powered-by\");\napp.use(express.json({ limit: \"64kb\" }));\n\napp.post(MCP_PATH, async (req: Request, res: Response) => {\n  const server = createServer();\n  const transport = new StreamableHTTPServerTransport({\n    sessionIdGenerator: undefined,\n  });\n\n  res.on(\"close\", () => {\n    void transport.close();\n    void server.close();\n  });\n\n  try {\n    await server.connect(transport);\n    await transport.handleRequest(req, res, req.body);\n  } catch (error) {\n    console.error(\"MCP request failed:\", error);\n\n    if (!res.headersSent) {\n      res.status(500).json({\n        jsonrpc: \"2.0\",\n        error: {\n          code: -32603,\n          message: \"Internal server error\",\n        },\n        id: null,\n      });\n    }\n  }\n});\n\napp.get(MCP_PATH, (_req, res) => {\n  res.status(405).set(\"Allow\", \"POST\").send(\"Method not allowed\");\n});\n\napp.delete(MCP_PATH, (_req, res) => {\n  res.status(405).set(\"Allow\", \"POST\").send(\"Method not allowed\");\n});\n\napp.listen(PORT, HOST, () => {\n  console.error(`MCP endpoint listening at http://${HOST}:${PORT}${MCP_PATH}`);\n});\n```\n\nThis example creates a fresh stateless MCP server for each POST request. It has no persistent sessions and no external capabilities.\n\n### Step 5: Type-check the server\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: No emitted JavaScript; TypeScript may write cache metadata\n# Port exposure: None\n# Downloads code: No\n# Variables to replace: None\nnpx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 server.ts\n```\n\nExpected output: no errors.\n\n### Step 6: Start the server\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: None expected\n# Port exposure: Opens 127.0.0.1:3000 only\n# Downloads code: No\n# Variables to replace: None\nnpm start\n```\n\nExpected output on standard error: `MCP endpoint listening at http://127.0.0.1:3000/mcp`.\n\nLeave this terminal open.\n\n### Step 7: Verify that the listener is loopback-only\n\nIn another PowerShell window:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Inspects existing port 3000; opens nothing\n# Downloads code: No\n# Variables to replace: None\nGet-NetTCPConnection -LocalPort 3000 -State Listen |\n  Select-Object LocalAddress, LocalPort, OwningProcess\n```\n\nExpected output: `127.0.0.1`, not `0.0.0.0` or a LAN address.\n\n### Step 8: Confirm unsupported GET is rejected\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Any directory\n# Admin: Not required\n# Writes/deletes: None\n# Port exposure: Loopback HTTP request only\n# Downloads code: No\n# Variables to replace: None\ntry {\n  Invoke-WebRequest \"http://127.0.0.1:3000/mcp\" -Method Get\n} catch {\n  $_.Exception.Response.StatusCode.value__\n}\n```\n\nExpected output: `405`.\n\n### Step 9: Start the MCP Inspector\n\nFrom the project folder in a third terminal:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Project root\n# Admin: Not required\n# Writes/deletes: May write local npm or Inspector state\n# Port exposure: Opens Inspector UI and proxy on loopback ports\n# Downloads code: No additional package expected because Inspector is installed locally\n# Variables to replace: None\nnpm run inspect\n```\n\nExpected output: local Inspector URL.\n\nIn the Inspector:\n\n1. Choose **Streamable HTTP**.\n2. Enter `http://127.0.0.1:3000/mcp`.\n3. Connect.\n4. List tools.\n5. Invoke `echo` with `{\"message\":\"streamable http working\"}`.\n6. Confirm the same text is returned.\n\nStop Inspector and server processes with `Ctrl+C`.\n\n## Verify success\n\n| Command or action | Expected result | Safety record |\n| --- | --- | --- |\n| Type check | No errors. | Local inspection. |\n| `Get-NetTCPConnection` | Listener is `127.0.0.1:3000`. | Inspection only. |\n| GET request | HTTP 405. | Loopback request. |\n| Inspector lists tools | `echo` appears. | Local loopback MCP connection. |\n| Invoke `echo` | Exact supplied text returned. | No external side effects. |\n\n## Security checks\n\n- Keep the server bound to `127.0.0.1`.\n- Do not add permissive CORS headers.\n- Limit request-body size.\n- Validate every tool input.\n- Keep tools side-effect-free until identity, permissions, approvals, and audit are designed.\n- Do not accept bearer tokens in query strings.\n- For remote use, implement HTTPS and the current MCP OAuth authorisation specification.\n- Validate token audience and scopes on every request.\n- Protect OAuth discovery from server-side request forgery and DNS rebinding.\n- Use short-lived tokens and secure token storage.\n- Add rate limits, timeouts, structured logs, and correlation identifiers.\n- Treat Inspector and development servers as temporary local tools.\n\n## Common errors\n\n### Import path cannot be resolved\n\nConfirm the installed SDK version and compare its server documentation. SDK v2 changes package and transport import locations.\n\n### Inspector cannot connect\n\nConfirm the server terminal is still running, the endpoint path is `/mcp`, and Streamable HTTP is selected.\n\n### Listener shows `0.0.0.0`\n\nStop the process and restore `HOST = \"127.0.0.1\"` before continuing.\n\n### JSON parse errors\n\nConfirm the request uses JSON and that no proxy is rewriting the body. Do not log protocol responses to a different transport channel.\n\n## How to undo or remove it\n\nStop all local processes. Move to the parent folder and delete the disposable project:\n\n```powershell\n# OS: Windows 10 or Windows 11\n# Shell: PowerShell\n# Directory: Parent of trace-mcp-http\n# Admin: Not required\n# Writes/deletes: Permanently deletes the whole demonstration project\n# Port exposure: Ensure server and Inspector are stopped\n# Downloads code: No\n# Variables to replace: Replace folder name if changed\nRemove-Item -LiteralPath .\\trace-mcp-http -Recurse -Force\n```\n\n## What to do next\n\nAdd integration tests, a read-only resource, structured audit events, and a real OAuth resource-server design before considering any non-loopback deployment.\n\n## Sources\n\n- [MCP TypeScript server documentation](https://ts.sdk.modelcontextprotocol.io/server) — Streamable HTTP recommendation, stateless examples, and transport behaviour.\n- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/) — Package installation, server primitives, and supported transports.\n- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Local connection and tool inspection.\n- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — HTTPS, OAuth, resource indicators, token audience, PKCE, and secure storage.\n- [MCP security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) — SSRF, DNS rebinding, token, session, prompt-injection, and local-server threats."}',
      '2026-07-19',
      '2026-08-19'
    );


-- install-node-js-and-npm-on-windows.md → guide-install-node-js-and-npm-on-windows-b64a8317
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-node-js-and-npm-on-windows-b64a8317',
      'install-node-js-and-npm-on-windows',
      'Install Node.js and npm on Windows',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'Phil Geran',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      1,
      '# Install Node.js and npm on Windows

## What you will achieve

Install the current Node.js long-term-support (LTS) release and its bundled npm package manager on a Windows computer, then confirm that Windows can find both tools.

## Who this is for

Windows users who need Node.js and npm for a development project. This guide does not install project dependencies, change an npm registry, modify a PowerShell execution policy, or configure global packages.

## Requirements and expected cost

- Windows 10 or Windows 11.
- A standard Windows account. The official installer may request administrator approval.
- Internet access to download the installer.
- No paid account, subscription, or credentials are required.
- Expected cost: free.

## Tested environment and version scope

This is a **documentation-reviewed** guide, not a claim that the full installer journey has been clean-machine tested by TRACE. On 16 July 2026, the official Node.js download page identified `v24.18.0 LTS`; it associates that release with npm `11.16.0`. Always choose the release labelled **LTS** on the official page rather than relying on the number in this draft.

The non-destructive verification commands below were also run in the TRACE Windows workspace: `node --version` returned `v24.12.0`; `npm.cmd --version` returned `11.6.2`; and `where.exe` located the installed Node.js and npm launchers. The clean-install path and all Windows editions remain pending human test.

## Before you begin

1. Close any open PowerShell, Command Prompt, VS Code terminal, or other terminal window. A new terminal is required after installation so it receives the updated `PATH` value.
2. Download only from the official Node.js download page. Do not use a copied installer link, an advert, or a third-party download site.
3. This task downloads and runs an executable installer. Read the Windows security prompt before accepting it. If its source or behaviour is unexpected, cancel it and return to the official Node.js page.

## Install Node.js and npm

1. Open the [official Node.js download page](https://nodejs.org/en/download).
2. Select the **LTS** release, then select the Windows installer appropriate to your computer. Most current PCs use the x64 installer; do not guess if you know your device uses another architecture.
3. Open the downloaded installer. Proceed only if it was obtained from the official page.
4. Keep the normal installation options, including npm and the option to add Node.js to `PATH`, unless you have a documented local reason to change them. The installer can request administrator approval because it writes to the system application location.
5. Finish the installer, then open a **new** PowerShell or Command Prompt window.

## Verify success

Run each command separately in the new terminal. They are inspection-only: they do not write files, open ports, download code, require credentials, or require administrator access.

| Command | Expected result | Safety record |
| --- | --- | --- |
| `node --version` | A version starting with `v` | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |
| `npm.cmd --version` | An npm version number | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |
| `where.exe node` | A path to `node.exe`, normally below `C:\Program Files\nodejs` | Windows; PowerShell or Command Prompt; any directory; inspection only. |
| `where.exe npm` | Paths to `npm.cmd` and related npm launchers | Windows; PowerShell or Command Prompt; any directory; inspection only. |

The command metadata reviewed independently of this prose is in `src/guides/drafts/install-node-js-and-npm-on-windows.ts`.

## Security checks

- Use HTTPS and the official `nodejs.org` download page.
- Do not paste a command that downloads and executes code from an untrusted source.
- Do not run the verification commands as administrator; they do not need it.
- Do not change the PowerShell execution policy just to make `npm` work. Diagnose the specific issue first.

## Common errors

### `node` or `npm` is not recognised

Close the terminal and open a new one first. Then run `where.exe node` and `where.exe npm`. Windows finds executables through `PATH`; Microsoft documents that the system searches the directories listed in that variable. If neither command finds the program, rerun the official installer and ensure the Node.js `PATH` option is selected. Do not add folders to `PATH` blindly.

### PowerShell says that `npm.ps1` cannot be loaded because scripts are disabled

This can occur when PowerShell resolves the `npm.ps1` launcher before `npm.cmd`. Use `npm.cmd --version` to confirm that npm itself is installed. Do not weaken the execution policy as part of this guide. Escalate the policy decision to the device owner or organisation administrator if you need a permanent PowerShell-specific solution.

### The versions do not match this guide exactly

The exact LTS and bundled npm versions change. A newer LTS version is expected; return to the official Node.js download page and use its LTS label. A version that is no longer maintained should be replaced rather than used for a new project.

## Undo or remove

To remove Node.js, use **Settings → Apps → Installed apps**, locate Node.js, and choose **Uninstall**. This removes the installed runtime; it does not automatically remove project folders or dependencies created elsewhere. Close and reopen terminals afterwards. No rollback is needed for the four verification commands because they make no changes.

## What to do next

Use `node --version` and `npm.cmd --version` inside the project you intend to work on. Before installing project dependencies, read that project’s `README`, package manager instructions, and security guidance.

## Underlying sources

- [Node.js download page](https://nodejs.org/en/download) — installation source, current LTS label, and expected Node/npm versions; checked 16 July 2026.
- [Microsoft PATH command reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/path) — explains that Windows uses `PATH` to locate executables; checked 16 July 2026.
- [Microsoft PowerShell environment-variable guidance](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables?view=powershell-7.5) — explains Windows `PATH` inspection and persistent environment-variable changes; checked 16 July 2026.

## Human review checklist before publication

- [ ] Test the installer end-to-end in a documented clean Windows environment.
- [ ] Record the Windows edition, architecture, exact Node/npm versions, installer source, test date, and reviewer.
- [ ] Recheck the official LTS version and installer UI.
- [ ] Confirm whether the publisher shown by Windows matches the official installer before documenting it.
- [ ] Have Phil Geran (or another named maintainer) approve publication manually.',
      '{"frontmatter":{"title":"Install Node.js and npm on Windows","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"Phil Geran","tested_os":["Windows 10","Windows 11"],"tested_versions":"","node":"24.x LTS","npm":"11.x","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-16","review_due":"2026-08-16","url":"https://nodejs.org/en/download","relationship":"instruction-source"},"body":"# Install Node.js and npm on Windows\n\n## What you will achieve\n\nInstall the current Node.js long-term-support (LTS) release and its bundled npm package manager on a Windows computer, then confirm that Windows can find both tools.\n\n## Who this is for\n\nWindows users who need Node.js and npm for a development project. This guide does not install project dependencies, change an npm registry, modify a PowerShell execution policy, or configure global packages.\n\n## Requirements and expected cost\n\n- Windows 10 or Windows 11.\n- A standard Windows account. The official installer may request administrator approval.\n- Internet access to download the installer.\n- No paid account, subscription, or credentials are required.\n- Expected cost: free.\n\n## Tested environment and version scope\n\nThis is a **documentation-reviewed** guide, not a claim that the full installer journey has been clean-machine tested by TRACE. On 16 July 2026, the official Node.js download page identified `v24.18.0 LTS`; it associates that release with npm `11.16.0`. Always choose the release labelled **LTS** on the official page rather than relying on the number in this draft.\n\nThe non-destructive verification commands below were also run in the TRACE Windows workspace: `node --version` returned `v24.12.0`; `npm.cmd --version` returned `11.6.2`; and `where.exe` located the installed Node.js and npm launchers. The clean-install path and all Windows editions remain pending human test.\n\n## Before you begin\n\n1. Close any open PowerShell, Command Prompt, VS Code terminal, or other terminal window. A new terminal is required after installation so it receives the updated `PATH` value.\n2. Download only from the official Node.js download page. Do not use a copied installer link, an advert, or a third-party download site.\n3. This task downloads and runs an executable installer. Read the Windows security prompt before accepting it. If its source or behaviour is unexpected, cancel it and return to the official Node.js page.\n\n## Install Node.js and npm\n\n1. Open the [official Node.js download page](https://nodejs.org/en/download).\n2. Select the **LTS** release, then select the Windows installer appropriate to your computer. Most current PCs use the x64 installer; do not guess if you know your device uses another architecture.\n3. Open the downloaded installer. Proceed only if it was obtained from the official page.\n4. Keep the normal installation options, including npm and the option to add Node.js to `PATH`, unless you have a documented local reason to change them. The installer can request administrator approval because it writes to the system application location.\n5. Finish the installer, then open a **new** PowerShell or Command Prompt window.\n\n## Verify success\n\nRun each command separately in the new terminal. They are inspection-only: they do not write files, open ports, download code, require credentials, or require administrator access.\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `node --version` | A version starting with `v` | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |\n| `npm.cmd --version` | An npm version number | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |\n| `where.exe node` | A path to `node.exe`, normally below `C:\\Program Files\\nodejs` | Windows; PowerShell or Command Prompt; any directory; inspection only. |\n| `where.exe npm` | Paths to `npm.cmd` and related npm launchers | Windows; PowerShell or Command Prompt; any directory; inspection only. |\n\nThe command metadata reviewed independently of this prose is in `src/guides/drafts/install-node-js-and-npm-on-windows.ts`.\n\n## Security checks\n\n- Use HTTPS and the official `nodejs.org` download page.\n- Do not paste a command that downloads and executes code from an untrusted source.\n- Do not run the verification commands as administrator; they do not need it.\n- Do not change the PowerShell execution policy just to make `npm` work. Diagnose the specific issue first.\n\n## Common errors\n\n### `node` or `npm` is not recognised\n\nClose the terminal and open a new one first. Then run `where.exe node` and `where.exe npm`. Windows finds executables through `PATH`; Microsoft documents that the system searches the directories listed in that variable. If neither command finds the program, rerun the official installer and ensure the Node.js `PATH` option is selected. Do not add folders to `PATH` blindly.\n\n### PowerShell says that `npm.ps1` cannot be loaded because scripts are disabled\n\nThis can occur when PowerShell resolves the `npm.ps1` launcher before `npm.cmd`. Use `npm.cmd --version` to confirm that npm itself is installed. Do not weaken the execution policy as part of this guide. Escalate the policy decision to the device owner or organisation administrator if you need a permanent PowerShell-specific solution.\n\n### The versions do not match this guide exactly\n\nThe exact LTS and bundled npm versions change. A newer LTS version is expected; return to the official Node.js download page and use its LTS label. A version that is no longer maintained should be replaced rather than used for a new project.\n\n## Undo or remove\n\nTo remove Node.js, use **Settings → Apps → Installed apps**, locate Node.js, and choose **Uninstall**. This removes the installed runtime; it does not automatically remove project folders or dependencies created elsewhere. Close and reopen terminals afterwards. No rollback is needed for the four verification commands because they make no changes.\n\n## What to do next\n\nUse `node --version` and `npm.cmd --version` inside the project you intend to work on. Before installing project dependencies, read that project’s `README`, package manager instructions, and security guidance.\n\n## Underlying sources\n\n- [Node.js download page](https://nodejs.org/en/download) — installation source, current LTS label, and expected Node/npm versions; checked 16 July 2026.\n- [Microsoft PATH command reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/path) — explains that Windows uses `PATH` to locate executables; checked 16 July 2026.\n- [Microsoft PowerShell environment-variable guidance](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables?view=powershell-7.5) — explains Windows `PATH` inspection and persistent environment-variable changes; checked 16 July 2026.\n\n## Human review checklist before publication\n\n- [ ] Test the installer end-to-end in a documented clean Windows environment.\n- [ ] Record the Windows edition, architecture, exact Node/npm versions, installer source, test date, and reviewer.\n- [ ] Recheck the official LTS version and installer UI.\n- [ ] Confirm whether the publisher shown by Windows matches the official installer before documenting it.\n- [ ] Have Phil Geran (or another named maintainer) approve publication manually."}',
      '2026-07-16',
      '2026-08-16'
    );
