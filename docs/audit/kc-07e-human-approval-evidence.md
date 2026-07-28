# KC-07E human approval evidence

**Date:** 24 July 2026
**Status:** Complete locally; production migration/deployment remains pending the normal release approval.

## Implemented

- Migration `0047-evidence-change-approvals.sql` adds the durable approval
  ledger for status changes and corrections with target, previous/proposed
  status, reason, requester, reviewer, decision, and idempotency fields.
- The versioned status policy identifies transitions involving confirmed,
  strongly supported, disputed, corrected, or superseded states as high impact.
  Automatic recalculation still records immutable score snapshots, but leaves
  the story status unchanged and queues a pending approval for those changes.
  Low-risk intermediate status changes may update directly.
- `POST /admin/approve-evidence-status` lets an authenticated publisher approve
  or reject a pending story status proposal. Rejections require a durable note;
  approval is conditional on the story retaining the recorded previous status.
- Corrections now require a bounded human approval note. The correction ledger,
  target mutation, canonical assertion (for claim corrections), and approved
  change record are written in the same D1 batch.
- The evidence panel displays pending high-impact status proposals and provides
  approve/reject controls; no automatic publisher or social posting is added.

## Verification

- `npm.cmd run test:migrations` passed, including repeat application of migration 0047.
- `npm.cmd test -- --run` passed: 119 ingestion tests and stabilisation tests,
  including the high-impact approval gate.
- `npm.cmd run typecheck` passed with zero errors.
- `npm.cmd run test:security` passed across 161 source files and Git history.
- `npm.cmd run build` passed, including Cloudflare route verification.
