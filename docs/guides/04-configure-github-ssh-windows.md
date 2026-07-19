---
title: "Configure passphrase-protected GitHub SSH authentication on Windows"
category: development-tools
difficulty: intermediate
verification_status: documentation-reviewed
author_name: "TRACE Editorial"
tested_os:
  - Windows 10 22H2
  - Windows 11
tested_versions:
  git: "2.55.0"
  openssh: "Git for Windows bundled OpenSSH"
estimated_cost: "Free"
destructive_steps: false
network_exposure: false
credentials_required: true
root_required: false
downloads_executable: false
last_verified: 2026-07-19
review_due: 2026-08-19
sources:
  - name: "Checking for existing SSH keys"
    url: "https://docs.github.com/en/authentication/connecting-to-github-with-ssh/checking-for-existing-ssh-keys?platform=windows"
    relationship: instruction-source
  - name: "Generating a new SSH key"
    url: "https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent"
    relationship: instruction-source
  - name: "Adding a new SSH key"
    url: "https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account"
    relationship: instruction-source
  - name: "Testing an SSH connection"
    url: "https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection?platform=windows"
    relationship: verification-source
  - name: "GitHub SSH fingerprints"
    url: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints"
    relationship: security-source
---

# Configure passphrase-protected GitHub SSH authentication on Windows

**Status:** Draft — not published or indexed.

## What you will achieve

You will create a modern Ed25519 SSH key, protect the private key with a passphrase, add only the public key to GitHub, verify GitHub's server fingerprint, and test authentication.

## Who this is for

This guide is for GitHub users who already installed Git for Windows and want to clone and push repositories without placing a personal access token in a remote URL.

It uses **Git Bash**, because GitHub's Windows SSH instructions and Git for Windows work consistently in that shell.

## Requirements and expected cost

- A GitHub account.
- Git for Windows.
- Access to Git Bash.
- A verified email address appropriate for the key comment.
- Cost: free.

## Tested environment and version scope

The guide was reviewed against GitHub's current SSH documentation and Git for Windows 2.55.0.

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

### Step 6: Verify GitHub's host fingerprint and test the connection

```bash
# OS: Windows 10 22H2 or Windows 11
# Shell: Git Bash
# Directory: Any directory
# Admin: Not required
# Writes/deletes: On first trusted connection, adds GitHub's host key to ~/.ssh/known_hosts
# Network/ports: Outbound SSH to github.com, normally TCP 22; no listening port opened
# Downloads code: No
# Replace: Nothing
ssh -T git@github.com
```

On the first connection, compare the displayed Ed25519 fingerprint with GitHub's published fingerprint:

`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`

Type `yes` only when it matches.

Expected result: `Hi USERNAME! You've successfully authenticated, but GitHub does not provide shell access.`

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
- Verify GitHub's host fingerprint before accepting the first connection.
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
- [GitHub SSH fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) — Official server fingerprints.
