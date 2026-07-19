---
title: "Create and verify a minimal Astro website locally"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10
  - Windows 11
tested_versions:
  node: "24.x LTS"
  astro: "Current create-astro release"
estimated_cost: "Free"
destructive_steps: true
network_exposure: true
credentials_required: false
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Install Astro"
    url: "https://docs.astro.build/en/install-and-setup/"
    relationship: instruction-source
  - name: "Astro project tutorial"
    url: "https://docs.astro.build/en/tutorial/1-setup/2/"
    relationship: instruction-source
  - name: "Astro configuration reference"
    url: "https://docs.astro.build/en/reference/configuration-reference/"
    relationship: security-source
---

# Create and verify a minimal Astro website locally

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

Astro's project wizard installs the current compatible project version. The resulting lockfile records the exact dependency versions.

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

Astro's preview server is for local verification, not production hosting.

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
- [Astro configuration reference](https://docs.astro.build/en/reference/configuration-reference/) — Server host and project configuration.
