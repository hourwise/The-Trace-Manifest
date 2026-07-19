---
title: "Install Git for Windows and configure your identity safely"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  git: "2.55.0"
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
  - name: "Git for Windows installation"
    url: "https://git-scm.com/install/windows"
    relationship: instruction-source
  - name: "Microsoft WinGet install command"
    url: "https://learn.microsoft.com/en-us/windows/package-manager/winget/install"
    relationship: instruction-source
  - name: "Git user manual"
    url: "https://git-scm.com/docs/user-manual"
    relationship: instruction-source
---

# Install Git for Windows and configure your identity safely

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
- Do not blindly change global line-ending settings. Follow the repository's `.gitattributes` and contributor instructions.
- Review `where.exe git` if a tool appears to run a different Git version.
- Never run an unknown repository's scripts merely because Git cloned it successfully.

## Common errors

### `'winget' is not recognized`

Install or update Microsoft **App Installer**, sign in to Windows at least once, reopen PowerShell, and run `winget --version` again.

### `'git' is not recognized`

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
- [Git user manual](https://git-scm.com/docs/user-manual) — Official `user.name` and `user.email` configuration.
