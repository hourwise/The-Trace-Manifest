---
title: "Create a least-privilege GitHub Actions CI workflow for Node.js"
category: development-tools
difficulty: advanced
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  node: "24.x LTS"
  actions_checkout: "v6"
  actions_setup_node: "v6"
estimated_cost: "Free within GitHub plan limits"
destructive_steps: false
network_exposure: false
credentials_required: true
root_required: false
downloads_executable: true
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Building and testing Node.js"
    url: "https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs"
    relationship: instruction-source
  - name: "Workflow syntax and permissions"
    url: "https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax"
    relationship: security-source
  - name: "Secure use reference"
    url: "https://docs.github.com/en/actions/reference/security/secure-use"
    relationship: security-source
  - name: "actions/setup-node"
    url: "https://github.com/actions/setup-node"
    relationship: instruction-source
  - name: "Script injections"
    url: "https://docs.github.com/en/actions/concepts/security/script-injections"
    relationship: security-source
---

# Create a least-privilege GitHub Actions CI workflow for Node.js

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
- Cost: free within the repository's GitHub Actions allowance.

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

1. Open the repository's **Actions** tab.
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
- [Script injections](https://docs.github.com/en/actions/concepts/security/script-injections) — Untrusted GitHub context and shell-injection risks.
