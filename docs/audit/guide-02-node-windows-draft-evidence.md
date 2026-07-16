# GUIDE-02 — Node.js and npm on Windows draft evidence

**Date:** 16 July 2026  
**Scope:** `GUIDE-02` from the master build plan  
**Publication state:** Draft only; no Guide route, database record, public indexing, Ask TRACE retrieval, or publication action was created.

## Evidence checked

- The official Node.js download page identified the LTS release as Node.js `v24.18.0` and listed npm `11.16.0` for that release when checked on 16 July 2026.
- Microsoft documentation states that Windows uses the `PATH` environment variable to search for executables and documents PowerShell environment-variable handling.
- Local, non-destructive Windows verification showed `node --version` as `v24.12.0`, `npm.cmd --version` as `11.6.2`, and found the Node/npm launchers in `C:\Program Files\nodejs`.
- The direct PowerShell `npm --version` alias was blocked by the local script-execution policy. The draft therefore uses `npm.cmd --version` only for diagnosis and does not advise changing policy.

## Safety controls

Every terminal command has been recorded in `src/guides/drafts/install-node-js-and-npm-on-windows.ts` with operating system, shell, working directory, administrator, write/delete, port, executable-download, variable, expected-output, and rollback fields. Contract validation rejects an incomplete command record.

The executable download and installer are prominently identified as a separate, administrator-capable action. The guide directs readers only to the official Node.js page and does not include a command that downloads or executes code.

## Remaining human work

The guide remains `documentation-reviewed`. A named maintainer must clean-install and verify the process in a documented Windows environment, then update the version/test record and manually approve publication. This implementation makes no claim of that test or approval.
