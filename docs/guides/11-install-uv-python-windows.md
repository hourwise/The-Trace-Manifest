---
title: "Install uv and a managed Python 3.13 runtime on Windows"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10
  - Windows 11
tested_versions:
  uv: "0.11.29"
  python: "3.13.14"
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
  - name: "uv installation"
    url: "https://docs.astral.sh/uv/getting-started/installation/"
    relationship: instruction-source
  - name: "uv Python management"
    url: "https://docs.astral.sh/uv/reference/cli/#uv-python"
    relationship: instruction-source
  - name: "uv platform support"
    url: "https://docs.astral.sh/uv/reference/policies/platforms/"
    relationship: requirements-source
  - name: "Python on Windows"
    url: "https://docs.python.org/3.13/using/windows.html"
    relationship: version-source
---

# Install uv and a managed Python 3.13 runtime on Windows

**Status:** Draft — not published or indexed.

## What you will achieve

You will install Astral's `uv` package and project manager through WinGet, use it to download an isolated Python 3.13 runtime, and verify the runtime without replacing an existing system-wide `python.exe`.

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
# Writes/deletes: May update uv's local metadata cache
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
# Writes/deletes: Downloads and installs an isolated Python runtime in uv's data directory
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

Expected output: Python 3.13.14 and a path inside uv's managed Python directory.

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
- Do not make an unfamiliar project's virtual environment globally active.

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
- [Python on Windows](https://docs.python.org/3.13/using/windows.html) — CPython's Windows runtime and installation context.
