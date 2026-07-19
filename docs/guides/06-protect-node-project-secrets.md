---
title: "Keep API keys and secrets out of a Node.js Git repository"
category: development-tools
difficulty: beginner
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  node: "24.18.0 LTS"
  git: "2.55.0"
estimated_cost: "Free"
destructive_steps: false
network_exposure: false
credentials_required: false
root_required: false
downloads_executable: false
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Node.js environment variables"
    url: "https://nodejs.org/api/environment_variables.html"
    relationship: instruction-source
  - name: "Node.js command-line environment files"
    url: "https://nodejs.org/api/cli.html"
    relationship: instruction-source
  - name: "GitHub push protection"
    url: "https://docs.github.com/en/code-security/concepts/secret-security/push-protection"
    relationship: security-source
  - name: "Removing sensitive data from a repository"
    url: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository"
    relationship: security-source
---

# Keep API keys and secrets out of a Node.js Git repository

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a safe pattern for local environment variables, ignore real `.env` files, commit only a placeholder example, and verify that Git will not stage the secret file.

## Who this is for

This guide is for Node.js developers who need API keys, database URLs, signing secrets, or other runtime configuration.

It does not set up a production secret manager. Production systems should use the hosting provider's secret store or a dedicated vault rather than uploading a local `.env` file.

## Requirements and expected cost

- A Git repository.
- Node.js 24 LTS.
- Git for Windows.
- Cost: free.

## Tested environment and version scope

Node's built-in dotenv support and `--env-file` option are stable in the reviewed Node versions. The Git controls are version-independent.

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

### Step 6: Load the file with Node's built-in environment-file support

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
- Store production credentials in the deployment platform's secret store.
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

- [Node.js environment variables](https://nodejs.org/api/environment_variables.html) — Node's `.env` format and `process.env`.
- [Node.js command-line environment files](https://nodejs.org/api/cli.html) — Stable `--env-file` behaviour.
- [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) — Blocking supported secrets before they reach a repository.
- [Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) — Rotation, history cleanup, ignore rules, and safer staging.
