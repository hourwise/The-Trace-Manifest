# TRACE Briefing — readiness report

**Repository snapshot:** 21 July 2026  
**Purpose:** establish what exists before implementing [TRACE Briefing](TraceBriefing.md), and reconcile the three earlier planning documents.

## Executive finding

TRACE has a usable **manual briefing foundation**, but not an implementable Daily Brief product. The public daily/weekly routes, reviewed publication contract and story corpus can support the first manual edition. The versioned data model, admin editor, selection logic, draft pipeline, validation, scheduling, archive and meaningful homepage treatment must still be built.

Do not begin automated drafting or scheduling before the manual structured edition and immutable publication model have been implemented and tested.

## What exists now

| Capability | Current state | Readiness |
|---|---|---|
| Public briefing pages | `/briefing/daily` and `/briefing/weekly` load the latest reviewed record, otherwise show recent published stories. | Partial foundation |
| Publication boundary | `publish-briefing` requires an authenticated human reviewer and only accepts eligible published stories. | Reusable foundation |
| Current content | A title, summary and bounded list of canonical story links with a short “why” field are supported. | Insufficient for the final format |
| Public story corpus | Published stories have evidence status, sources and story URLs that can be inputs to briefing selection. | Dependency available, subject to source-health checks |
| Homepage | Displays a latest briefing date and generic Daily Briefing card. | Needs replacement, not extension |
| RSS | `/rss/daily.xml` currently emits published stories, rather than briefing editions. | Must be corrected or renamed before claiming briefing RSS |
| Scheduling | Worker schedules ingestion/classification. There is no briefing job or UK-time edition schedule. | Missing |
| Admin workflow | There is no `/admin/briefings` interface. | Missing |

## Important implementation conflicts to resolve

1. **The launch plan says the daily route is a placeholder and briefings are created in TRACE Desk.** The route is dynamic and the Worker has an authenticated publication endpoint, but there is no Desk or briefing-editor user interface. Replace this description with the factual “manual foundation” status.

2. **Published briefing records are mutable.** The current unique type/date record is updated when republished. This conflicts with the new requirement for permanent dated editions and visible correction/version history. B1 must migrate this before relying on briefings publicly.

3. **Two briefing table concepts exist.** The base schema contains `briefings`; the publication migration adds `published_briefings`. The new feature needs one canonical, versioned model and a migration/audit path for either legacy data set.

4. **Homepage and RSS copy overpromise.** The homepage presents email/downloadable-briefing language, but the current RSS is a story feed and there is no confirmed Daily Brief email/Markdown generation implementation. The Briefing MVP deliberately excludes newsletter delivery.

5. **Automation flags are not a design substitute.** The launch plan records scheduled AI as disabled. The future briefing job must remain reviewed-only until explicit production approval; turning on a flag cannot make the missing selection, validation and review controls safe.

## Work required before an implementation can start

### Must decide/design first

- Adopt the canonical versioned briefing schema and legacy-data migration approach.
- Define the exact evidence eligibility thresholds and score inputs from existing story/evidence fields.
- Decide authoritative UK-time schedule and DST-safe implementation approach.
- Define correction/version URL and redirect policy.
- Define the editorial review roles and approval audit requirements for `/admin/briefings`.

### Must build in B1 before automation

- Schema migration, model contract and tests.
- Admin briefing editor/review/publish flow.
- Final public layout, archive and permanent dated routes.
- Homepage latest-edition card with last-valid-edition fallback.
- Corrected briefing-specific RSS behaviour or removal of the briefing RSS claim.
- Manual Preview edition and production approval gate.

### Build only after B1 is proven

- Candidate eligibility, score, diversity rules and candidate audit.
- Bounded evidence packet and structured AI draft.
- Validation, failed-draft queue and one authorised regeneration action.
- Scheduled weekday/Sunday runs, idempotency and no-edition records.
- Ranking/drafting evaluation from documented editor changes.

## Status of the earlier planning documents

| Document | Still authoritative | Outdated, incomplete or superseded for Briefing |
|---|---|---|
| [Build-to-launch and post-launch plan](BUILD-TO-LAUNCH-AND-POST-LAUNCH-PLAN.md) | Launch safeguards, evidence-first editorial controls, deployment/readiness gates and approved ADR order. | Its 21 July baseline is dated; the briefing section understates existing code and lacks the feature design. Its “strategy needs to be planned” task is replaced by `TraceBriefing.md`. Re-verify its live counts, commits and deployment claims before treating them as current production facts. |
| [Revised Launch Scope](The%20Trace%20Manifest%20%E2%80%94%20Revised%20Launch.md) | Narrow launch scope, manual editorial review, no automatic publishing and evidence/correction principles. | It names newsletter signup as a launch goal, while the new Briefing MVP intentionally has no newsletter. That product decision needs explicit owner confirmation when the wider launch checklist is next revised. It does not specify a Daily Brief data model or workflow. |
| [Build Plan Add-on](the-trace-manifest-trace-build-plan-addon.md) | TRACE editorial laws: evidence before assertion, visible inference/source ownership, human-governed publication and uncertainty as a valid outcome. | Its Weekly newsletter, predictions, public archives and broad delivery phases are adjacent future work, not prerequisites for a Daily Brief. Its high-level data/API ideas need reconciliation with the current Worker/D1 architecture before implementation. |

## Recommended documentation changes

1. Keep `TraceBriefing.md` as the canonical feature plan.
2. In the build-to-launch plan, replace the briefing paragraph with: “A manual briefing foundation exists: public daily/weekly latest-edition pages and a reviewed publication contract. Automated selection, structured edition UI, archive/versioning, drafting, validation and scheduling are not built.”
3. Replace the “Briefings strategy” checkbox with a link to the B1–B5 sequence in `TraceBriefing.md`.
4. When the launch scope is next reviewed, explicitly resolve whether basic newsletter signup remains a launch requirement. It is intentionally not part of this Briefing feature.

## Go/no-go

**Go for B1 (manual structured edition):** yes, after the normal deployment/readiness checks and schema design decision.  
**Go for automatic generation or scheduled publication:** no — the controls and data required to make it safe do not exist yet.
