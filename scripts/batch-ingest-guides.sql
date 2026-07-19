-- Batch guide ingestion
-- Generated from docs/guides/
-- Run: npx wrangler d1 execute trace-manifest-db --remote --file=scripts/batch-ingest-guides.sql

-- install-node-js-and-npm-on-windows.md → guide-install-node-js-and-npm-on-windows-b64a8317
INSERT OR IGNORE INTO guides
    (id, slug, title, category, difficulty, verification_status, status, visibility,
     author_name, tested_os, tested_versions, estimated_cost,
     destructive_steps, network_exposure, credentials_required, root_required, downloads_executable,
     body_markdown, document_json, last_verified_at, review_due_at)
    VALUES (
      'guide-install-node-js-and-npm-on-windows-b64a8317',
      'install-node-js-and-npm-on-windows',
      'Install Node.js and npm on Windows',
      'development-tools',
      'beginner',
      'documentation-reviewed',
      'draft', 'internal',
      'Phil Geran',
      '["Windows 10","Windows 11"]',
      NULL,
      'Free',
      0,
      0,
      0,
      0,
      1,
      '# Install Node.js and npm on Windows

## What you will achieve

Install the current Node.js long-term-support (LTS) release and its bundled npm package manager on a Windows computer, then confirm that Windows can find both tools.

## Who this is for

Windows users who need Node.js and npm for a development project. This guide does not install project dependencies, change an npm registry, modify a PowerShell execution policy, or configure global packages.

## Requirements and expected cost

- Windows 10 or Windows 11.
- A standard Windows account. The official installer may request administrator approval.
- Internet access to download the installer.
- No paid account, subscription, or credentials are required.
- Expected cost: free.

## Tested environment and version scope

This is a **documentation-reviewed** guide, not a claim that the full installer journey has been clean-machine tested by TRACE. On 16 July 2026, the official Node.js download page identified `v24.18.0 LTS`; it associates that release with npm `11.16.0`. Always choose the release labelled **LTS** on the official page rather than relying on the number in this draft.

The non-destructive verification commands below were also run in the TRACE Windows workspace: `node --version` returned `v24.12.0`; `npm.cmd --version` returned `11.6.2`; and `where.exe` located the installed Node.js and npm launchers. The clean-install path and all Windows editions remain pending human test.

## Before you begin

1. Close any open PowerShell, Command Prompt, VS Code terminal, or other terminal window. A new terminal is required after installation so it receives the updated `PATH` value.
2. Download only from the official Node.js download page. Do not use a copied installer link, an advert, or a third-party download site.
3. This task downloads and runs an executable installer. Read the Windows security prompt before accepting it. If its source or behaviour is unexpected, cancel it and return to the official Node.js page.

## Install Node.js and npm

1. Open the [official Node.js download page](https://nodejs.org/en/download).
2. Select the **LTS** release, then select the Windows installer appropriate to your computer. Most current PCs use the x64 installer; do not guess if you know your device uses another architecture.
3. Open the downloaded installer. Proceed only if it was obtained from the official page.
4. Keep the normal installation options, including npm and the option to add Node.js to `PATH`, unless you have a documented local reason to change them. The installer can request administrator approval because it writes to the system application location.
5. Finish the installer, then open a **new** PowerShell or Command Prompt window.

## Verify success

Run each command separately in the new terminal. They are inspection-only: they do not write files, open ports, download code, require credentials, or require administrator access.

| Command | Expected result | Safety record |
| --- | --- | --- |
| `node --version` | A version starting with `v` | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |
| `npm.cmd --version` | An npm version number | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |
| `where.exe node` | A path to `node.exe`, normally below `C:\Program Files\nodejs` | Windows; PowerShell or Command Prompt; any directory; inspection only. |
| `where.exe npm` | Paths to `npm.cmd` and related npm launchers | Windows; PowerShell or Command Prompt; any directory; inspection only. |

The command metadata reviewed independently of this prose is in `src/guides/drafts/install-node-js-and-npm-on-windows.ts`.

## Security checks

- Use HTTPS and the official `nodejs.org` download page.
- Do not paste a command that downloads and executes code from an untrusted source.
- Do not run the verification commands as administrator; they do not need it.
- Do not change the PowerShell execution policy just to make `npm` work. Diagnose the specific issue first.

## Common errors

### `node` or `npm` is not recognised

Close the terminal and open a new one first. Then run `where.exe node` and `where.exe npm`. Windows finds executables through `PATH`; Microsoft documents that the system searches the directories listed in that variable. If neither command finds the program, rerun the official installer and ensure the Node.js `PATH` option is selected. Do not add folders to `PATH` blindly.

### PowerShell says that `npm.ps1` cannot be loaded because scripts are disabled

This can occur when PowerShell resolves the `npm.ps1` launcher before `npm.cmd`. Use `npm.cmd --version` to confirm that npm itself is installed. Do not weaken the execution policy as part of this guide. Escalate the policy decision to the device owner or organisation administrator if you need a permanent PowerShell-specific solution.

### The versions do not match this guide exactly

The exact LTS and bundled npm versions change. A newer LTS version is expected; return to the official Node.js download page and use its LTS label. A version that is no longer maintained should be replaced rather than used for a new project.

## Undo or remove

To remove Node.js, use **Settings → Apps → Installed apps**, locate Node.js, and choose **Uninstall**. This removes the installed runtime; it does not automatically remove project folders or dependencies created elsewhere. Close and reopen terminals afterwards. No rollback is needed for the four verification commands because they make no changes.

## What to do next

Use `node --version` and `npm.cmd --version` inside the project you intend to work on. Before installing project dependencies, read that project’s `README`, package manager instructions, and security guidance.

## Underlying sources

- [Node.js download page](https://nodejs.org/en/download) — installation source, current LTS label, and expected Node/npm versions; checked 16 July 2026.
- [Microsoft PATH command reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/path) — explains that Windows uses `PATH` to locate executables; checked 16 July 2026.
- [Microsoft PowerShell environment-variable guidance](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables?view=powershell-7.5) — explains Windows `PATH` inspection and persistent environment-variable changes; checked 16 July 2026.

## Human review checklist before publication

- [ ] Test the installer end-to-end in a documented clean Windows environment.
- [ ] Record the Windows edition, architecture, exact Node/npm versions, installer source, test date, and reviewer.
- [ ] Recheck the official LTS version and installer UI.
- [ ] Confirm whether the publisher shown by Windows matches the official installer before documenting it.
- [ ] Have Phil Geran (or another named maintainer) approve publication manually.',
      '{"frontmatter":{"title":"Install Node.js and npm on Windows","category":"development-tools","difficulty":"beginner","verification_status":"documentation-reviewed","author_name":"Phil Geran","tested_os":["Windows 10","Windows 11"],"tested_versions":"","node":"24.x LTS","npm":"11.x","estimated_cost":"Free","destructive_steps":"false","network_exposure":"false","credentials_required":"false","root_required":"false","downloads_executable":"true","last_verified":"2026-07-16","review_due":"2026-08-16","url":"https://nodejs.org/en/download","relationship":"instruction-source"},"body":"# Install Node.js and npm on Windows\n\n## What you will achieve\n\nInstall the current Node.js long-term-support (LTS) release and its bundled npm package manager on a Windows computer, then confirm that Windows can find both tools.\n\n## Who this is for\n\nWindows users who need Node.js and npm for a development project. This guide does not install project dependencies, change an npm registry, modify a PowerShell execution policy, or configure global packages.\n\n## Requirements and expected cost\n\n- Windows 10 or Windows 11.\n- A standard Windows account. The official installer may request administrator approval.\n- Internet access to download the installer.\n- No paid account, subscription, or credentials are required.\n- Expected cost: free.\n\n## Tested environment and version scope\n\nThis is a **documentation-reviewed** guide, not a claim that the full installer journey has been clean-machine tested by TRACE. On 16 July 2026, the official Node.js download page identified `v24.18.0 LTS`; it associates that release with npm `11.16.0`. Always choose the release labelled **LTS** on the official page rather than relying on the number in this draft.\n\nThe non-destructive verification commands below were also run in the TRACE Windows workspace: `node --version` returned `v24.12.0`; `npm.cmd --version` returned `11.6.2`; and `where.exe` located the installed Node.js and npm launchers. The clean-install path and all Windows editions remain pending human test.\n\n## Before you begin\n\n1. Close any open PowerShell, Command Prompt, VS Code terminal, or other terminal window. A new terminal is required after installation so it receives the updated `PATH` value.\n2. Download only from the official Node.js download page. Do not use a copied installer link, an advert, or a third-party download site.\n3. This task downloads and runs an executable installer. Read the Windows security prompt before accepting it. If its source or behaviour is unexpected, cancel it and return to the official Node.js page.\n\n## Install Node.js and npm\n\n1. Open the [official Node.js download page](https://nodejs.org/en/download).\n2. Select the **LTS** release, then select the Windows installer appropriate to your computer. Most current PCs use the x64 installer; do not guess if you know your device uses another architecture.\n3. Open the downloaded installer. Proceed only if it was obtained from the official page.\n4. Keep the normal installation options, including npm and the option to add Node.js to `PATH`, unless you have a documented local reason to change them. The installer can request administrator approval because it writes to the system application location.\n5. Finish the installer, then open a **new** PowerShell or Command Prompt window.\n\n## Verify success\n\nRun each command separately in the new terminal. They are inspection-only: they do not write files, open ports, download code, require credentials, or require administrator access.\n\n| Command | Expected result | Safety record |\n| --- | --- | --- |\n| `node --version` | A version starting with `v` | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |\n| `npm.cmd --version` | An npm version number | Windows; PowerShell or Command Prompt; any directory; no write/delete, port, download, variable, or rollback needed. |\n| `where.exe node` | A path to `node.exe`, normally below `C:\\Program Files\\nodejs` | Windows; PowerShell or Command Prompt; any directory; inspection only. |\n| `where.exe npm` | Paths to `npm.cmd` and related npm launchers | Windows; PowerShell or Command Prompt; any directory; inspection only. |\n\nThe command metadata reviewed independently of this prose is in `src/guides/drafts/install-node-js-and-npm-on-windows.ts`.\n\n## Security checks\n\n- Use HTTPS and the official `nodejs.org` download page.\n- Do not paste a command that downloads and executes code from an untrusted source.\n- Do not run the verification commands as administrator; they do not need it.\n- Do not change the PowerShell execution policy just to make `npm` work. Diagnose the specific issue first.\n\n## Common errors\n\n### `node` or `npm` is not recognised\n\nClose the terminal and open a new one first. Then run `where.exe node` and `where.exe npm`. Windows finds executables through `PATH`; Microsoft documents that the system searches the directories listed in that variable. If neither command finds the program, rerun the official installer and ensure the Node.js `PATH` option is selected. Do not add folders to `PATH` blindly.\n\n### PowerShell says that `npm.ps1` cannot be loaded because scripts are disabled\n\nThis can occur when PowerShell resolves the `npm.ps1` launcher before `npm.cmd`. Use `npm.cmd --version` to confirm that npm itself is installed. Do not weaken the execution policy as part of this guide. Escalate the policy decision to the device owner or organisation administrator if you need a permanent PowerShell-specific solution.\n\n### The versions do not match this guide exactly\n\nThe exact LTS and bundled npm versions change. A newer LTS version is expected; return to the official Node.js download page and use its LTS label. A version that is no longer maintained should be replaced rather than used for a new project.\n\n## Undo or remove\n\nTo remove Node.js, use **Settings → Apps → Installed apps**, locate Node.js, and choose **Uninstall**. This removes the installed runtime; it does not automatically remove project folders or dependencies created elsewhere. Close and reopen terminals afterwards. No rollback is needed for the four verification commands because they make no changes.\n\n## What to do next\n\nUse `node --version` and `npm.cmd --version` inside the project you intend to work on. Before installing project dependencies, read that project’s `README`, package manager instructions, and security guidance.\n\n## Underlying sources\n\n- [Node.js download page](https://nodejs.org/en/download) — installation source, current LTS label, and expected Node/npm versions; checked 16 July 2026.\n- [Microsoft PATH command reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/path) — explains that Windows uses `PATH` to locate executables; checked 16 July 2026.\n- [Microsoft PowerShell environment-variable guidance](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_environment_variables?view=powershell-7.5) — explains Windows `PATH` inspection and persistent environment-variable changes; checked 16 July 2026.\n\n## Human review checklist before publication\n\n- [ ] Test the installer end-to-end in a documented clean Windows environment.\n- [ ] Record the Windows edition, architecture, exact Node/npm versions, installer source, test date, and reviewer.\n- [ ] Recheck the official LTS version and installer UI.\n- [ ] Confirm whether the publisher shown by Windows matches the official installer before documenting it.\n- [ ] Have Phil Geran (or another named maintainer) approve publication manually."}',
      '2026-07-16',
      '2026-08-16'
    );
