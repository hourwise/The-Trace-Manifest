---
title: "Install Ollama on Windows and run a local model without LAN exposure"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  ollama: "Current Windows app as of 2026-07-19"
estimated_cost: "Free software; electricity and hardware costs apply"
destructive_steps: false
network_exposure: true
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Ollama for Windows"
    url: "https://docs.ollama.com/windows"
    relationship: instruction-source
  - name: "Ollama FAQ"
    url: "https://docs.ollama.com/faq"
    relationship: security-source
  - name: "Ollama authentication"
    url: "https://docs.ollama.com/api/authentication"
    relationship: security-source
  - name: "Ollama hardware support"
    url: "https://docs.ollama.com/gpu"
    relationship: requirements-source
---

# Install Ollama on Windows and run a local model without LAN exposure

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

Ollama's local API at `http://localhost:11434` does not require authentication. That is acceptable only while it remains restricted to the local machine and the device itself is trusted.

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

Expected output: Ollama package details. Confirm that the installer source is associated with Ollama's official distribution.

### Step 2: Install Ollama

```powershell
# OS: Windows 10 22H2 or Windows 11
# Shell: PowerShell
# Directory: Any directory
# Admin: Ollama's normal per-user install does not require admin
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
- [Ollama hardware support](https://docs.ollama.com/gpu) — Supported GPU families and driver considerations.
