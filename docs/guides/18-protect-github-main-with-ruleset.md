---
title: "Protect a GitHub main branch with a visible repository ruleset"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10
  - Windows 11
tested_versions:
  github: "GitHub.com settings as of 2026-07-19"
estimated_cost: "Free for public repositories; private-repository availability depends on plan"
destructive_steps: false
network_exposure: false
credentials_required: true
root_required: false
downloads_executable: false
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "About GitHub rulesets"
    url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets"
    relationship: concept-source
  - name: "Creating repository rulesets"
    url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository"
    relationship: instruction-source
  - name: "Available rules for rulesets"
    url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets"
    relationship: instruction-source
  - name: "About protected branches"
    url: "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches"
    relationship: security-source
---

# Protect a GitHub main branch with a visible repository ruleset

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
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) — Security effects and unique status-check warning.
