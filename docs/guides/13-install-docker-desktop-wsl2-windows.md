---
title: "Install Docker Desktop on Windows with the per-user WSL 2 backend"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11 23H2 or later
tested_versions:
  docker_desktop: "4.68.x"
  wsl: "2.1.5 minimum; latest recommended"
estimated_cost: "Free for personal use and qualifying organisations; paid licence may be required"
destructive_steps: false
network_exposure: true
credentials_required: false
root_required: true
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Install Docker Desktop on Windows"
    url: "https://docs.docker.com/desktop/setup/install/windows-install/"
    relationship: instruction-source
  - name: "Docker Desktop WSL 2 backend"
    url: "https://docs.docker.com/desktop/features/wsl/"
    relationship: instruction-source
  - name: "Docker Desktop Windows permissions"
    url: "https://docs.docker.com/desktop/setup/install/windows-permission-requirements/"
    relationship: security-source
  - name: "Docker Desktop WSL best practices"
    url: "https://docs.docker.com/desktop/features/wsl/best-practices/"
    relationship: security-source
---

# Install Docker Desktop on Windows with the per-user WSL 2 backend

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

The guide follows Docker Desktop's 2026 per-user installation path and WSL 2 backend. Per-user mode reduces the privileged service footprint and does not support Windows containers.

## Before you begin

Back up important WSL distributions and container data if Docker or another container engine is already installed.

Uninstall a Docker Engine or CLI installed directly inside a WSL distribution if it conflicts with Docker Desktop's integration.

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

If WSL is absent, follow Microsoft's official WSL installation instructions before continuing.

### Step 3: Download the official installer manually

Download **Docker Desktop Installer.exe** from Docker's official Windows installation page.

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

Expected output: Docker's hello-world success message.

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
- [Docker Desktop WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/) — WSL updates, memory, and filesystem guidance.
