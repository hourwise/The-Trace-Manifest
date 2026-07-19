---
title: "Gate a GitHub Actions production deployment with an environment"
category: development-tools
difficulty: advanced
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10
  - Windows 11
tested_versions:
  github_actions: "GitHub.com as of 2026-07-19"
estimated_cost: "Plan and repository visibility dependent"
destructive_steps: false
network_exposure: true
credentials_required: true
root_required: false
downloads_executable: false
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Deployments and environments"
    url: "https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments"
    relationship: instruction-source
  - name: "Deployment environments"
    url: "https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments"
    relationship: concept-source
  - name: "Reviewing deployments"
    url: "https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments"
    relationship: verification-source
  - name: "Secure use of GitHub Actions"
    url: "https://docs.github.com/en/actions/reference/security/secure-use"
    relationship: security-source
---

# Gate a GitHub Actions production deployment with an environment

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

The guide follows GitHub.com's current environment, reviewer, branch-policy, and environment-secret behaviour.

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

Expected result: workflow file appears on the protected branch through the repository's normal review process.

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

Open the repository's **Deployments** or environment history and confirm:

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

Disable the environment's protection rules before deleting the environment if you need a reversible troubleshooting step.

Deleting the environment removes its secrets and protection configuration. Confirm no real workflow still references it.

## What to do next

Replace the disposable secret with a short-lived OIDC trust relationship and a narrowly scoped provider deployment role.

## Sources

- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) — Protection rules, required reviewers, branch policies, and environment secrets.
- [Deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) — Environment lifecycle and deployment records.
- [Reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) — Approval, rejection, bypass, and plan availability.
- [Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) — Runner, action, token, and workflow security.
