# GUIDE-01 — metadata, authorship, verification, and freshness contract

**Date:** 16 July 2026  
**Scope:** `GUIDE-01` from the master build plan  
**Contract version:** `adr-0013-2026-07-16.1`

## Implemented contract

`src/guides/contract.ts` defines the controlled Guide metadata required by ADR 0013:

- category, difficulty, positive version number, tested operating systems, and named tested versions;
- named accountable author and named human reviewer with review time;
- one of the ADR verification states;
- explicit flags for destructive steps, network exposure, credentials, administrator access, and executable downloads;
- at least one section-level source relationship. Sources must be an allowed external source type or a documented TRACE Lab result; another TRACE Guide is not accepted as an underlying source;
- `lastVerifiedAt` and a non-earlier `reviewDueAt`; and
- manual-only publication mode. A published state requires named approval, approval time, publication time, and a verification state that is not needs-review, outdated, or withdrawn.

The contract also provides a retrieval predicate. Outdated, withdrawn, or date-invalid Guides are excluded from procedural retrieval. Review-due guides remain a separately identifiable freshness state for a later user-facing warning policy.

## Verification

Regression tests demonstrate that:

- complete metadata validates;
- missing accountable authorship fails;
- automatic publication mode fails; and
- an outdated published Guide is excluded from procedural retrieval.

`npm test` and `npm run typecheck` pass.

## Explicitly deferred

This task creates no Guide database tables or records, public page, admin UI, automatic publication path, command runner, content body, TRACE Lab execution record, or Ask TRACE guide retrieval. Those require later bounded GUIDE tasks and the knowledge/source lifecycle controls.
