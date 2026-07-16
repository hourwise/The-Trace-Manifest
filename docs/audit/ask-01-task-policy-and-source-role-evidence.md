# ASK-01 — task policy and source-role evidence

**Date:** 16 July 2026  
**Scope:** `ASK-01` from the master build plan  
**Policy version:** `adr-0016-2026-07-16.1`

## Implemented policy vocabulary

`src/ai/task-policy.ts` defines the versioned TRACE constitution, the six ADR 0016 governed task types, the launch `ai-agents` topic scope, a serialisable task envelope, and the initial public-Ask policy. That policy explicitly has `researchPermitted: false` and `maxResearchRounds: 0`; ASK-01 does not enable live research.

Each `EvidenceExcerpt` must now declare source kind, source role, admission state, freshness state, and independent-evidence weight.

| Source kind | Source role | Independent-evidence weight | Answer eligibility |
| --- | --- | ---: | --- |
| `external_primary` | `evidence` | 1 | Current and admitted only |
| `external_independent` | `evidence` | 1 | Current and admitted only |
| `external_vendor` | `reported_claim` | 0 | Current and admitted only; never independent corroboration |
| `external_community` | `discovery_context` | 0 | Not eligible |
| `trace_knowledge`, `trace_guide`, `trace_story`, `trace_brief`, `trace_correction` | `internal_synthesis` | 0 | Not eligible as standalone evidence |

TRACE-originated material remains useful internal context. A later retrieval or knowledge-builder step must resolve its admitted underlying sources rather than treating TRACE prose as a new source.

## Enforcement

- The public Ask gateway validates the full provenance envelope.
- Before confidence scoring or a model call, it excludes any evidence that is not admitted, current, and an allowed external role.
- The deterministic confidence calculation applies the same eligibility rule and counts only independent primary or independent sources for corroboration.
- A result made only of stale, quarantined, community, or TRACE-derived records returns a non-answer without calling the model.
- Admin AI triage is explicitly marked quarantined community material with zero independent-evidence weight, so it cannot accidentally be reused as answer evidence.

## Verification

- `npm test` passed: 47 ingestion checks plus stabilisation coverage.
- `npm run typecheck` completed with no diagnostics.
- Regression coverage asserts that TRACE stories, quarantined material, and stale material are ineligible. A stale-only Ask request returns a non-answer before any model call.

## Explicitly deferred

No web-search provider, remote research gateway, source-admission workflow, knowledge candidate, D1 migration, public answer-label change, or deployment was enabled by this task. Those require later bounded tasks under ADR 0016 and ADR 0017.
