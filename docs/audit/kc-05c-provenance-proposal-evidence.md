# KC-05C provenance proposal evidence

**Date:** 23 July 2026  
**Status:** Complete locally; not migrated or enabled in production.

## Scope

KC-05C proposes source lineage and claim-relative treatment after an accepted
claim decision. Proposals are review-gated and do not create provenance groups,
source memberships, public evidence, or evidence scores.

## Implementation

- `db/migration-0039-claim-provenance-proposals.sql` adds proposal and
  append-only review-history tables with constrained relationship, directness,
  source-role, evidence-treatment, confidence, rationale, and review state.
- `claim-provenance-proposals.ts` creates one idempotent rule proposal per
  assertion. Reported claims are proposed as `reports_on`; direct evidence is
  proposed as `original`; uncertain lineage is labelled `unknown`.
- High/critical materiality, unknown directness, and unknown relationships are
  marked `mandatory` review. The proposal records why the rule was selected.
- Accepted KC-05B merge/create-new decisions generate the proposal. Publisher
  accept/reject review is available through the protected API and
  `/admin/knowledge/provenance` UI. Acceptance updates only assertion
  directness, source role, and evidence treatment; provenance membership remains
  a later explicit step.

## Verification

- `npm.cmd test -- --run` — passed (119 ingestion tests and stabilisation tests).
- `npm.cmd run test:migrations` — passed; migration 0039 applies idempotently.
- `npm.cmd run typecheck` — passed (0 errors; four existing hints).
- `npm.cmd run build` — passed, including Cloudflare route verification.
- `npm.cmd run test:security` — passed across 144 source files and Git history.
- `git diff --check` — passed.
- Tests prove proposal idempotency, accepted/rejected review history,
  assertion metadata updates, double-review conflicts, and that no provenance
  group or source membership is created automatically.

KC-05D is next: group derivative coverage under a shared origin, with explicit
editorial controls around any eventual provenance membership assignment.
